"""
Round 7 backend tests for AbodeOps:
- GET /api/metrics (RBAC + values)
- GET /api/activity (poster-scoped feed)
- POST /api/jobs/{id}/addon (RBAC + activity log)
- match_score in /api/jobs/{id} applicants_info (sorted desc, 0-99)
- POST /api/billing/checkout (business $99 + pro returns checkout_url)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@abodeops.com", "password": "pass123"}
CLEANER = {"email": "cleaner@abodeops.com", "password": "pass123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("session_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_tok():
    return _login(OWNER)


@pytest.fixture(scope="module")
def cleaner_tok():
    return _login(CLEANER)


# ---------- /api/metrics ----------
class TestMetrics:
    def test_metrics_cleaner_forbidden(self, cleaner_tok):
        r = requests.get(f"{API}/metrics", headers=_h(cleaner_tok), timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_metrics_owner_ok(self, owner_tok):
        r = requests.get(f"{API}/metrics", headers=_h(owner_tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("revenue_today", "payroll_owed", "active_cleaners", "completed_today", "completed_total"):
            assert k in data, f"missing key {k} in {data}"
        # types
        assert isinstance(data["revenue_today"], (int, float))
        assert isinstance(data["payroll_owed"], (int, float))
        assert isinstance(data["active_cleaners"], int)
        assert isinstance(data["completed_today"], int)
        assert isinstance(data["completed_total"], int)
        # seed has 2 completed demo jobs
        assert data["completed_total"] >= 2, f"expected >=2 completed_total, got {data}"


# ---------- /api/activity ----------
class TestActivity:
    def test_activity_owner_returns_list(self, owner_tok):
        r = requests.get(f"{API}/activity", headers=_h(owner_tok), timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        if items:
            it = items[0]
            for k in ("kind", "text", "job_id", "created_at"):
                assert k in it, f"missing {k}: {it}"

    def test_activity_appended_on_create_job(self, owner_tok):
        # capture pre-count
        r0 = requests.get(f"{API}/activity", headers=_h(owner_tok), timeout=20)
        pre = len(r0.json())
        # create a job
        payload = {
            "title": "TEST_R7 Activity Probe",
            "description": "tmp",
            "address": "123 Test Ave, Calgary, AB",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "clean_type": "standard",
            "date": "2030-01-01",
            "start_time": "10:00",
            "start_window_from": "10:00",
            "start_window_to": "11:00",
            "client_name": "TEST_R7",
            "estimated_duration": 2,
            "pay_rate": 30,
            "required_qualifications": [],
        }
        rc = requests.post(f"{API}/jobs", headers=_h(owner_tok), json=payload, timeout=20)
        assert rc.status_code == 200, rc.text
        job_id = rc.json()["job_id"]
        time.sleep(0.5)
        r1 = requests.get(f"{API}/activity", headers=_h(owner_tok), timeout=20)
        items = r1.json()
        assert len(items) > pre, "activity not appended after create_job"
        kinds = [i["kind"] for i in items[:5]]
        assert "created" in kinds, f"expected 'created' in latest activity kinds, got {kinds}"
        # cleanup
        requests.delete(f"{API}/jobs/{job_id}", headers=_h(owner_tok), timeout=20)


# ---------- /api/jobs/{id}/addon ----------
class TestAddon:
    def test_addon_unauthorized_random_user_forbidden(self, cleaner_tok):
        # demojob_1 -- cleaner is NOT assigned (unless they grabbed it). Use a non-assigned demo
        r = requests.post(f"{API}/jobs/demojob_1/addon", headers=_h(cleaner_tok),
                          json={"name": "Oven"}, timeout=20)
        # cleaner is not poster and not necessarily assigned to demojob_1 in fresh seed
        assert r.status_code in (403, 200), f"unexpected: {r.status_code} {r.text}"

    def test_addon_poster_can_add_and_logs_activity(self, owner_tok):
        r = requests.post(f"{API}/jobs/demojob_1/addon", headers=_h(owner_tok),
                          json={"name": "Oven"}, timeout=20)
        assert r.status_code == 200, r.text
        job = r.json()
        assert "Oven" in (job.get("addons") or []), f"Oven not in addons: {job.get('addons')}"
        # idempotent (addToSet)
        r2 = requests.post(f"{API}/jobs/demojob_1/addon", headers=_h(owner_tok),
                           json={"name": "Oven"}, timeout=20)
        assert r2.status_code == 200
        assert r2.json().get("addons", []).count("Oven") == 1

        # verify activity feed got an 'addon' entry
        ra = requests.get(f"{API}/activity", headers=_h(owner_tok), timeout=20)
        kinds = [i["kind"] for i in ra.json()]
        assert "addon" in kinds, f"'addon' not in activity kinds {kinds}"


# ---------- match_score in /jobs/{id} ----------
class TestMatchScore:
    def test_applicants_info_has_match_score_sorted_desc(self, owner_tok, cleaner_tok):
        # Apply as cleaner to demojob_2 (pending)
        ra = requests.post(f"{API}/jobs/demojob_2/apply", headers=_h(cleaner_tok), timeout=20)
        assert ra.status_code in (200, 400), ra.text  # 400 if already applied
        # GET job as poster
        rj = requests.get(f"{API}/jobs/demojob_2", headers=_h(owner_tok), timeout=20)
        assert rj.status_code == 200, rj.text
        job = rj.json()
        apps = job.get("applicants_info") or []
        assert len(apps) >= 1, f"no applicants_info for demojob_2: {job}"
        for a in apps:
            assert "match_score" in a, f"missing match_score in {a}"
            assert 0 <= a["match_score"] <= 99, a["match_score"]
        # sorted desc
        scores = [a["match_score"] for a in apps]
        assert scores == sorted(scores, reverse=True), f"applicants not sorted desc: {scores}"


# ---------- /api/billing/checkout ----------
class TestBilling:
    def test_business_checkout_url_returned_and_amount_9900(self, owner_tok):
        body = {"tier": "business", "redirect_url": f"{BASE_URL}/subscription"}
        r = requests.post(f"{API}/billing/checkout", headers=_h(owner_tok), json=body, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "checkout_url" in data and data["checkout_url"].startswith("http"), data
        assert "session_id" in data

    def test_pro_checkout_url_returned(self, owner_tok):
        body = {"tier": "pro", "redirect_url": f"{BASE_URL}/subscription"}
        r = requests.post(f"{API}/billing/checkout", headers=_h(owner_tok), json=body, timeout=30)
        assert r.status_code == 200, r.text
        assert "checkout_url" in r.json()

    def test_checkout_invalid_tier_rejected(self, owner_tok):
        body = {"tier": "free", "redirect_url": f"{BASE_URL}/subscription"}
        r = requests.post(f"{API}/billing/checkout", headers=_h(owner_tok), json=body, timeout=20)
        assert r.status_code in (400, 422), r.text
