"""Marketplace access control tests for employer vs independent cleaners."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://qualified-cleaners.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@abodeops.com", "password": "pass123"}
INDEP_CLEANER = {"email": "cleaner@abodeops.com", "password": "pass123"}
EMP_CLEANER = {"email": "empclean7412@test.com", "password": "pass123"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def owner_session():
    return _login(**OWNER)


@pytest.fixture(scope="module")
def indep_session():
    return _login(**INDEP_CLEANER)


@pytest.fixture(scope="module")
def emp_session():
    return _login(**EMP_CLEANER)


# ---------- /teams/create-cleaner ----------
class TestCreateCleaner:
    def test_owner_creates_employer_cleaner(self, owner_session):
        token = owner_session["token"]
        email = f"TEST_cc_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(
            f"{API}/teams/create-cleaner",
            json={"name": "Test EmpCleaner", "email": email, "password": "pass123"},
            headers=_auth(token), timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["account_origin"] == "employer"
        assert body["role"] == "cleaner"
        assert body["email"] == email.lower()
        # Login as new cleaner -> /auth/me should reflect employer_id
        log = _login(email, "pass123")
        u = log["user"]
        assert u.get("account_origin") == "employer"
        assert u.get("employer_id") == owner_session["user"]["user_id"]

    def test_non_owner_blocked_403(self, indep_session):
        token = indep_session["token"]
        email = f"TEST_cc_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(
            f"{API}/teams/create-cleaner",
            json={"name": "X", "email": email, "password": "pass123"},
            headers=_auth(token), timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_duplicate_email_409(self, owner_session):
        token = owner_session["token"]
        r = requests.post(
            f"{API}/teams/create-cleaner",
            json={"name": "Dup", "email": OWNER["email"], "password": "pass123"},
            headers=_auth(token), timeout=20,
        )
        assert r.status_code == 409, r.text


# ---------- Employer-onboarded cleaner scope ----------
class TestEmployerCleanerScope:
    def test_available_only_employer_jobs(self, emp_session, owner_session):
        token = emp_session["token"]
        emp_id = owner_session["user"]["user_id"]
        r = requests.get(f"{API}/jobs?scope=available", headers=_auth(token), timeout=20)
        assert r.status_code == 200, r.text
        jobs = r.json()
        # All visible jobs must be posted by their employer
        for j in jobs:
            assert j.get("poster_id") == emp_id, f"Non-employer job leaked: {j.get('job_id')} poster={j.get('poster_id')}"

    def test_driver_offers_only_employer_jobs(self, emp_session, owner_session):
        token = emp_session["token"]
        emp_id = owner_session["user"]["user_id"]
        r = requests.get(f"{API}/driver/offers", headers=_auth(token), timeout=20)
        assert r.status_code == 200, r.text
        for j in r.json():
            assert j.get("poster_id") == emp_id

    def test_get_nonemployer_job_403(self, emp_session, indep_session):
        # Complete the employer-cleaner's profile so apply/grab don't bail out on profile-completeness first.
        emp_token = emp_session["token"]
        prof = {
            "experience_summary": "Test experience",
            "portfolio": [f"img{i}" for i in range(10)],
            "availability": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "qualifications": [],
        }
        requests.put(f"{API}/profile", json=prof, headers=_auth(emp_token), timeout=20)

        # Create a 2nd company_owner posting a non-employer job
        email = f"TEST_owner_{uuid.uuid4().hex[:8]}@test.com"
        reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123",
                                                          "name": "Other Owner", "role": "company_owner"}, timeout=20)
        assert reg.status_code == 200, reg.text
        other_token = reg.json()["token"]
        job_payload = {
            "title": "TEST_non_employer_job", "clean_type": "standard",
            "address": "Calgary AB", "latitude": 51.04, "longitude": -114.07,
            "date": "2030-01-15", "start_window_from": "09:00", "start_window_to": "11:00",
            "estimated_duration": 2, "client_name": "TestClient", "pay_rate": 50,
            "required_qualifications": [],
        }
        cj = requests.post(f"{API}/jobs", json=job_payload, headers=_auth(other_token), timeout=20)
        assert cj.status_code == 200, cj.text
        non_emp_job_id = cj.json()["job_id"]

        # employer cleaner: GET non-employer job -> 403
        gr = requests.get(f"{API}/jobs/{non_emp_job_id}", headers=_auth(emp_token), timeout=20)
        assert gr.status_code == 403, gr.text
        # apply -> 403
        ar = requests.post(f"{API}/jobs/{non_emp_job_id}/apply", headers=_auth(emp_token), timeout=20)
        assert ar.status_code == 403, f"expected 403, got {ar.status_code}: {ar.text}"
        # grab -> 403
        gr2 = requests.post(f"{API}/jobs/{non_emp_job_id}/grab", headers=_auth(emp_token), timeout=20)
        assert gr2.status_code == 403, f"expected 403, got {gr2.status_code}: {gr2.text}"

        # Cleanup
        requests.delete(f"{API}/jobs/{non_emp_job_id}", headers=_auth(other_token), timeout=20)


# ---------- Independent free cleaner cap ----------
class TestIndependentCap:
    def test_available_capped_at_5(self, indep_session):
        token = indep_session["token"]
        u = indep_session["user"]
        # ensure tier is free
        assert u.get("tier", "free") in ("free", None)
        r = requests.get(f"{API}/jobs?scope=available", headers=_auth(token), timeout=20)
        assert r.status_code == 200
        assert len(r.json()) <= 5

    def test_driver_offers_capped_at_5(self, indep_session):
        token = indep_session["token"]
        r = requests.get(f"{API}/driver/offers", headers=_auth(token), timeout=20)
        assert r.status_code == 200
        assert len(r.json()) <= 5


# ---------- Owner unaffected ----------
class TestOwnerUnaffected:
    def test_owner_scope_mine(self, owner_session):
        token = owner_session["token"]
        r = requests.get(f"{API}/jobs?scope=mine", headers=_auth(token), timeout=20)
        assert r.status_code == 200
        for j in r.json():
            assert j["poster_id"] == owner_session["user"]["user_id"]


# ---------- Regression ----------
class TestRegression:
    def test_owner_login(self):
        s = _login(**OWNER)
        assert s["user"]["role"] in ("company_owner", "admin")

    def test_cleaner_login(self):
        s = _login(**INDEP_CLEANER)
        assert s["user"]["role"] in ("cleaner", "owner_cleaner")

    def test_guest_login(self):
        r = requests.post(f"{API}/auth/guest", timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["role"] in ("company_owner", "admin")
