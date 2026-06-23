"""Auto Abodes backend integration tests.

Covers:
- Auth (register/login/me) for all roles
- Admin auto-upgrade (aestheticabodesyyc@gmail.com)
- Subscription upgrade -> tier/ads_enabled
- Profile update (qualifications, auto_accept, hourly_rate)
- Job lifecycle (post, list scopes, qualification filter, apply auto-accept,
  assign, checkin, checklist with photos, complete, stats)
- Chat (conversations + messages)
- /users listing
"""
import uuid
import pytest
import requests

API = None  # set via fixture


def _api(api_url):
    global API
    API = api_url


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_email(prefix="t"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# Shared state across tests (session scope)
@pytest.fixture(scope="module")
def state(api_url):
    _api(api_url)
    return {}


# ---------------- AUTH ----------------
class TestAuth:
    def test_register_company_owner(self, state, api_url):
        _api(api_url)
        email = _rand_email("owner")
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass123", "name": "Owner T", "role": "company_owner"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        u = data["user"]
        assert u["role"] == "company_owner"
        assert u["tier"] == "free"
        assert u["ads_enabled"] is True
        state["owner_email"] = email
        state["owner_token"] = data["token"]
        state["owner_id"] = u["user_id"]

    def test_register_cleaner(self, state, api_url):
        _api(api_url)
        email = _rand_email("cleaner")
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass123", "name": "Cleaner C", "role": "cleaner"
        })
        assert r.status_code == 200, r.text
        state["cleaner_email"] = email
        state["cleaner_token"] = r.json()["token"]
        state["cleaner_id"] = r.json()["user"]["user_id"]
        assert r.json()["user"]["role"] == "cleaner"

    def test_register_client(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/auth/register", json={
            "email": _rand_email("client"), "password": "pass123", "name": "Client", "role": "client"
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "client"

    def test_register_owner_cleaner(self, state, api_url):
        _api(api_url)
        email = _rand_email("ownclr")
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass123", "name": "OwnClr", "role": "owner_cleaner"
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "owner_cleaner"
        state["ownclr_token"] = r.json()["token"]
        state["ownclr_id"] = r.json()["user"]["user_id"]

    def test_register_duplicate(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/auth/register", json={
            "email": state["owner_email"], "password": "pass123", "name": "Dup", "role": "client"
        })
        assert r.status_code == 409

    def test_login_returns_token_and_user(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/auth/login", json={
            "email": state["owner_email"], "password": "pass123"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and "user" in d
        state["owner_token"] = d["token"]  # refresh

    def test_login_bad_password(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/auth/login", json={
            "email": state["owner_email"], "password": "wrong"
        })
        assert r.status_code == 401

    def test_me_with_bearer(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/auth/me", headers=_bearer(state["owner_token"]))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert "tier" in u and "ads_enabled" in u
        assert u["email"] == state["owner_email"].lower()

    def test_me_unauthorized(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- ADMIN AUTO-UPGRADE ----------------
class TestAdmin:
    def test_admin_auto_upgrade(self, state, api_url):
        _api(api_url)
        # Register or login admin
        email = "aestheticabodesyyc@gmail.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "admin123", "name": "Admin", "role": "client"
        })
        if r.status_code == 409:
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "admin123"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == "admin", f"expected admin, got {u['role']}"
        assert u["tier"] == "business", f"expected business, got {u['tier']}"
        assert u["ads_enabled"] is False
        state["admin_token"] = r.json()["token"]


# ---------------- SUBSCRIPTION ----------------
class TestSubscription:
    def test_upgrade_to_pro(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/subscription/upgrade", json={"tier": "pro"},
                          headers=_bearer(state["owner_token"]))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["tier"] == "pro"
        assert u["ads_enabled"] is False

    def test_upgrade_to_business(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/subscription/upgrade", json={"tier": "business"},
                          headers=_bearer(state["owner_token"]))
        assert r.status_code == 200
        assert r.json()["user"]["tier"] == "business"
        assert r.json()["user"]["ads_enabled"] is False

    def test_downgrade_to_free_re_enables_ads(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/subscription/upgrade", json={"tier": "free"},
                          headers=_bearer(state["owner_token"]))
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["tier"] == "free" and u["ads_enabled"] is True


# ---------------- PROFILE ----------------
class TestProfile:
    def test_update_cleaner_profile(self, state, api_url):
        _api(api_url)
        body = {
            "name": "Cleaner Updated",
            "phone": "+15551234567",
            "bio": "Pro cleaner",
            "qualifications": ["Insured", "Deep Clean Certified"],
            "hourly_rate": 35.0,
            "auto_accept": True,
        }
        r = requests.put(f"{API}/profile", json=body, headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["name"] == "Cleaner Updated"
        assert u["phone"] == "+15551234567"
        assert set(u["qualifications"]) == {"Insured", "Deep Clean Certified"}
        assert u["hourly_rate"] == 35.0
        assert u["auto_accept"] is True

        # Verify via /me
        r2 = requests.get(f"{API}/auth/me", headers=_bearer(state["cleaner_token"]))
        assert r2.status_code == 200
        assert r2.json()["user"]["auto_accept"] is True


# ---------------- JOBS LIFECYCLE ----------------
class TestJobs:
    def test_cleaner_cannot_post_job(self, state, api_url):
        _api(api_url)
        body = _job_body()
        r = requests.post(f"{API}/jobs", json=body, headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 403

    def test_owner_creates_job(self, state, api_url):
        _api(api_url)
        body = _job_body(required=["Insured"])
        r = requests.post(f"{API}/jobs", json=body, headers=_bearer(state["owner_token"]))
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["status"] == "pending"
        assert job["poster_id"] == state["owner_id"]
        assert job["required_qualifications"] == ["Insured"]
        assert isinstance(job["checklist"], list) and len(job["checklist"]) >= 5
        # 5 photo items in deep checklist
        photo_items = [i for i in job["checklist"] if i.get("photo") is True]
        assert len(photo_items) == 5
        state["job_id"] = job["job_id"]

    def test_owner_creates_job_no_quals(self, state, api_url):
        _api(api_url)
        body = _job_body(required=[])
        r = requests.post(f"{API}/jobs", json=body, headers=_bearer(state["owner_token"]))
        assert r.status_code == 200
        state["job_open_id"] = r.json()["job_id"]

    def test_owner_creates_high_qual_job(self, state, api_url):
        _api(api_url)
        body = _job_body(required=["Bonded", "Pet Certified"])
        r = requests.post(f"{API}/jobs", json=body, headers=_bearer(state["owner_token"]))
        assert r.status_code == 200
        state["job_unqualified_id"] = r.json()["job_id"]

    def test_scope_mine(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/jobs?scope=mine", headers=_bearer(state["owner_token"]))
        assert r.status_code == 200
        ids = [j["job_id"] for j in r.json()]
        assert state["job_id"] in ids

    def test_scope_available_filters_by_qualifications(self, state, api_url):
        _api(api_url)
        # Cleaner has ["Insured", "Deep Clean Certified"]
        r = requests.get(f"{API}/jobs?scope=available", headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200
        jobs = r.json()
        ids = [j["job_id"] for j in jobs]
        assert state["job_id"] in ids  # requires Insured - cleaner has it
        assert state["job_open_id"] in ids  # no quals
        assert state["job_unqualified_id"] not in ids  # cleaner lacks Bonded/Pet

    def test_cleaner_without_quals_cannot_apply(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/jobs/{state['job_unqualified_id']}/apply",
                          headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 403

    def test_cleaner_auto_accept_assigns(self, state, api_url):
        _api(api_url)
        # cleaner has auto_accept=True from profile update
        r = requests.post(f"{API}/jobs/{state['job_id']}/apply",
                          headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "assigned"
        assert d["auto_accepted"] is True
        # verify via GET
        r2 = requests.get(f"{API}/jobs/{state['job_id']}", headers=_bearer(state["owner_token"]))
        assert state["cleaner_id"] in r2.json()["assigned_cleaners"]

    def test_apply_then_assign_manual(self, state, api_url):
        _api(api_url)
        # Register a second cleaner without auto_accept to test manual assign
        email = _rand_email("c2")
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass123", "name": "Cleaner2", "role": "cleaner"
        })
        c2_token = r.json()["token"]
        c2_id = r.json()["user"]["user_id"]
        # set quals only (no auto_accept)
        requests.put(f"{API}/profile", json={"qualifications": []}, headers=_bearer(c2_token))
        # apply to open job (no quals required)
        r = requests.post(f"{API}/jobs/{state['job_open_id']}/apply", headers=_bearer(c2_token))
        assert r.status_code == 200
        assert r.json()["status"] == "applied"
        assert r.json()["auto_accepted"] is False

        # poster assigns
        r2 = requests.post(f"{API}/jobs/{state['job_open_id']}/assign",
                           json={"cleaner_id": c2_id},
                           headers=_bearer(state["owner_token"]))
        assert r2.status_code == 200, r2.text
        assert c2_id in r2.json()["assigned_cleaners"]

        # Non-poster cannot assign
        r3 = requests.post(f"{API}/jobs/{state['job_open_id']}/assign",
                           json={"cleaner_id": c2_id},
                           headers=_bearer(c2_token))
        assert r3.status_code == 403
        state["c2_token"] = c2_token
        state["c2_id"] = c2_id

    def test_scope_assigned(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/jobs?scope=assigned", headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200
        ids = [j["job_id"] for j in r.json()]
        assert state["job_id"] in ids

    def test_checkin_only_assigned(self, state, api_url):
        _api(api_url)
        # Owner cannot checkin (not assigned)
        r = requests.post(f"{API}/jobs/{state['job_id']}/checkin",
                         headers=_bearer(state["owner_token"]))
        assert r.status_code == 403
        # cleaner can
        r2 = requests.post(f"{API}/jobs/{state['job_id']}/checkin",
                          headers=_bearer(state["cleaner_token"]))
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "in_progress"
        assert r2.json()["checked_in_at"] is not None

    def test_complete_fails_when_incomplete(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/jobs/{state['job_id']}/complete",
                         headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 400
        assert "incomplete" in r.json()["detail"].lower()

    def test_checklist_and_complete(self, state, api_url):
        _api(api_url)
        # Fetch job to get checklist items
        r = requests.get(f"{API}/jobs/{state['job_id']}", headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200
        items = r.json()["checklist"]
        photo_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
        )
        for it in items:
            if it.get("photo"):
                rr = requests.post(f"{API}/jobs/{state['job_id']}/checklist",
                                   json={"item_id": it["id"], "photo_base64": photo_b64},
                                   headers=_bearer(state["cleaner_token"]))
                assert rr.status_code == 200, rr.text
            else:
                rr = requests.post(f"{API}/jobs/{state['job_id']}/checklist",
                                   json={"item_id": it["id"], "done": True},
                                   headers=_bearer(state["cleaner_token"]))
                assert rr.status_code == 200, rr.text

        # Complete should now succeed
        rc = requests.post(f"{API}/jobs/{state['job_id']}/complete",
                          headers=_bearer(state["cleaner_token"]))
        assert rc.status_code == 200, rc.text
        completed = rc.json()
        assert completed["status"] == "completed"
        assert completed["completed_at"] is not None
        assert completed["logged_hours"] >= 0
        assert "logged_pay" in completed

    def test_stats_reflects_logged_hours(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/stats", headers=_bearer(state["cleaner_token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["completed"] >= 1
        assert d["total_hours"] >= 0
        assert isinstance(d["logs"], list) and len(d["logs"]) >= 1


def _job_body(required=None):
    return {
        "title": "TEST_Deep Clean Job",
        "clean_type": "deep",
        "address": "123 Test St",
        "latitude": 51.0447,
        "longitude": -114.0719,
        "date": "2026-02-01",
        "start_window_from": "09:00",
        "start_window_to": "11:00",
        "estimated_duration": 3.0,
        "client_name": "TEST_Client",
        "client_notes": "Use eco products",
        "manager_notes": "Focus on kitchen",
        "required_qualifications": required if required is not None else ["Insured"],
        "pay_rate": 30.0,
    }


# ---------------- CHAT ----------------
class TestChat:
    def test_create_conversation_and_messages(self, state, api_url):
        _api(api_url)
        r = requests.post(f"{API}/conversations",
                          json={"participant_id": state["cleaner_id"]},
                          headers=_bearer(state["owner_token"]))
        assert r.status_code == 200, r.text
        conv = r.json()
        assert "conv_id" in conv
        conv_id = conv["conv_id"]

        # idempotent: same call returns same conversation
        r2 = requests.post(f"{API}/conversations",
                           json={"participant_id": state["cleaner_id"]},
                           headers=_bearer(state["owner_token"]))
        assert r2.status_code == 200
        assert r2.json()["conv_id"] == conv_id

        # send message
        rm = requests.post(f"{API}/conversations/{conv_id}/messages",
                           json={"text": "Hello from owner"},
                           headers=_bearer(state["owner_token"]))
        assert rm.status_code == 200, rm.text
        assert rm.json()["text"] == "Hello from owner"

        # get messages
        rg = requests.get(f"{API}/conversations/{conv_id}/messages",
                          headers=_bearer(state["cleaner_token"]))
        assert rg.status_code == 200
        msgs = rg.json()
        assert len(msgs) >= 1
        assert msgs[-1]["text"] == "Hello from owner"

        # list conversations for owner
        rl = requests.get(f"{API}/conversations", headers=_bearer(state["owner_token"]))
        assert rl.status_code == 200
        ids = [c["conv_id"] for c in rl.json()]
        assert conv_id in ids


# ---------------- USERS ----------------
class TestUsers:
    def test_list_users_excludes_self(self, state, api_url):
        _api(api_url)
        r = requests.get(f"{API}/users", headers=_bearer(state["owner_token"]))
        assert r.status_code == 200, r.text
        users = r.json()
        ids = [u["user_id"] for u in users]
        assert state["owner_id"] not in ids
        assert state["cleaner_id"] in ids
        # sanity: minimal fields
        for u in users:
            assert "user_id" in u and "name" in u and "role" in u
