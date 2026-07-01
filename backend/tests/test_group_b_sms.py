"""
Group B — Twilio SMS backend tests for CleanOps.

Context: TWILIO_ACCOUNT_SID is set but TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are empty.
Therefore sms_configured() == False. All actual sends are NO-OPS ("SEND BLOCKED").
These tests verify:
  * /api/twilio/status returns the expected configuration flags for owner auth.
  * /api/twilio/test requires owner role (400 when unconfigured, 403 for cleaner).
  * post-job -> client_phone persists on the job document.
  * enroute and complete endpoints DO NOT crash when SMS is unconfigured (graceful degradation).

All test data prefixed with TEST_ and cleaned up in teardown.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@abodeops.com", "password": "pass123"}
CLEANER = {"email": "cleaner@abodeops.com", "password": "pass123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Session fixtures ----------
@pytest.fixture(scope="module")
def owner_ctx():
    tok, user = _login(OWNER)
    created_jobs = []
    yield {"tok": tok, "user": user, "jobs": created_jobs}
    for jid in created_jobs:
        try:
            requests.delete(f"{API}/jobs/{jid}", headers=_hdr(tok), timeout=10)
        except Exception:
            pass


@pytest.fixture(scope="module")
def cleaner_ctx():
    tok, user = _login(CLEANER)
    yield {"tok": tok, "user": user}


# ============================================================
# 1. Twilio status endpoint
# ============================================================
class TestTwilioStatus:
    def test_status_owner_configured_false(self, owner_ctx):
        r = requests.get(f"{API}/twilio/status", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Contract: SID set, but auth token + from number missing => not configured
        assert data.get("configured") is False, f"expected configured=False got {data}"
        assert data.get("has_account_sid") is True, f"expected has_account_sid=True got {data}"
        assert data.get("has_auth_token") is False, f"expected has_auth_token=False got {data}"
        assert data.get("has_from_number") is False, f"expected has_from_number=False got {data}"

    def test_status_requires_auth(self):
        r = requests.get(f"{API}/twilio/status", timeout=15)
        # Endpoint uses get_current_user dependency -> 401 without token
        assert r.status_code in (401, 403), f"expected auth-required got {r.status_code}"


# ============================================================
# 2. Twilio test endpoint
# ============================================================
class TestTwilioTestEndpoint:
    def test_send_test_returns_400_when_unconfigured(self, owner_ctx):
        r = requests.post(
            f"{API}/twilio/test",
            headers=_hdr(owner_ctx["tok"]),
            json={"to": "+15551234567"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 unconfigured got {r.status_code}: {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "sms not configured" in detail or "not configured" in detail, \
            f"expected 'not configured' detail got: {body}"

    def test_send_test_cleaner_forbidden(self, cleaner_ctx):
        r = requests.post(
            f"{API}/twilio/test",
            headers=_hdr(cleaner_ctx["tok"]),
            json={"to": "+15551234567"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 for cleaner got {r.status_code}: {r.text}"


# ============================================================
# 3. client_phone persistence via POST /api/jobs
# ============================================================
class TestClientPhonePersists:
    def test_create_job_with_client_phone(self, owner_ctx):
        payload = {
            "title": f"TEST_SMS_JOB_{uuid.uuid4().hex[:6]}",
            "clean_type": "standard",
            "address": "123 TEST Street, Calgary",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "date": "2026-06-30",
            "start_window_from": "09:00",
            "start_window_to": "10:00",
            "estimated_duration": 2,
            "client_name": "TEST Client",
            "client_phone": "+15559998888",
            "client_notes": "gate 1234",
            "manager_notes": "",
            "required_qualifications": [],
            "pay_rate": 30,
        }
        r = requests.post(f"{API}/jobs", headers=_hdr(owner_ctx["tok"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        job = r.json()
        job_id = job.get("job_id")
        assert job_id, f"no job_id in response {job}"
        owner_ctx["jobs"].append(job_id)

        # Assert client_phone came back on the created payload
        assert job.get("client_phone") == "+15559998888", f"client_phone not on create response: {job.get('client_phone')}"

        # GET the job back to confirm persistence
        r2 = requests.get(f"{API}/jobs/{job_id}", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert r2.status_code == 200, r2.text
        got = r2.json()
        assert got.get("client_phone") == "+15559998888", f"client_phone not persisted, got: {got.get('client_phone')}"


# ============================================================
# 4. Graceful degradation: enroute + complete still succeed with SMS off
# ============================================================
class TestGracefulDegradation:
    """Drive a job through assign -> checkin -> enroute -> complete-all-checklist -> complete.
    Verify none of the SMS-emitting endpoints (enroute, complete) crash when SMS unconfigured."""

    @pytest.fixture(scope="class")
    def driven_job(self, owner_ctx, cleaner_ctx):
        # 1. Owner creates a job with client_phone (so send_sms code path is hit)
        payload = {
            "title": f"TEST_SMS_FLOW_{uuid.uuid4().hex[:6]}",
            "clean_type": "standard",
            "address": "456 TEST Ave, Calgary",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "date": "2026-06-30",
            "start_window_from": "09:00",
            "start_window_to": "10:00",
            "estimated_duration": 2,
            "client_name": "TEST Flow Client",
            "client_phone": "+15551110000",
            "client_notes": "",
            "manager_notes": "",
            "required_qualifications": [],
            "pay_rate": 30,
        }
        r = requests.post(f"{API}/jobs", headers=_hdr(owner_ctx["tok"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        job = r.json()
        jid = job["job_id"]
        owner_ctx["jobs"].append(jid)

        # 2. Owner assigns the cleaner
        cid = cleaner_ctx["user"]["user_id"]
        r = requests.post(
            f"{API}/jobs/{jid}/assign",
            headers=_hdr(owner_ctx["tok"]),
            json={"cleaner_id": cid},
            timeout=15,
        )
        assert r.status_code == 200, f"assign failed: {r.status_code} {r.text}"

        # 3. Cleaner checks in (so completed hours calc has checked_in_at)
        r = requests.post(f"{API}/jobs/{jid}/checkin", headers=_hdr(cleaner_ctx["tok"]), timeout=15)
        assert r.status_code == 200, f"checkin failed: {r.status_code} {r.text}"

        return {"job_id": jid, "checklist": r.json().get("checklist", [])}

    def test_enroute_succeeds_when_sms_unconfigured(self, driven_job, cleaner_ctx):
        jid = driven_job["job_id"]
        r = requests.post(
            f"{API}/jobs/{jid}/enroute",
            headers=_hdr(cleaner_ctx["tok"]),
            json={"latitude": 51.05, "longitude": -114.08},
            timeout=15,
        )
        assert r.status_code == 200, f"enroute crashed with SMS off: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("job_id") == jid
        # enroute_at should now be set (server sets it)
        assert body.get("enroute_at") or body.get("tracking") is True, \
            f"enroute_at/tracking not updated: {body}"

    def test_complete_succeeds_when_sms_unconfigured(self, driven_job, cleaner_ctx):
        jid = driven_job["job_id"]
        # Mark all checklist items done first
        # Re-fetch current checklist
        r = requests.get(f"{API}/jobs/{jid}", headers=_hdr(cleaner_ctx["tok"]), timeout=15)
        assert r.status_code == 200, r.text
        checklist = r.json().get("checklist", [])
        assert checklist, "expected checklist on job"
        for item in checklist:
            rr = requests.post(
                f"{API}/jobs/{jid}/checklist",
                headers=_hdr(cleaner_ctx["tok"]),
                json={"item_id": item["id"], "done": True},
                timeout=15,
            )
            assert rr.status_code == 200, f"check item {item['id']} failed: {rr.text}"

        # Now complete — this hits send_sms(phone, feedback survey) which must no-op
        r = requests.post(f"{API}/jobs/{jid}/complete", headers=_hdr(cleaner_ctx["tok"]), timeout=15)
        assert r.status_code == 200, f"complete crashed with SMS off: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("status") == "completed", f"job not marked completed: {body.get('status')}"


# ============================================================
# 5. Regression: enroute still 403 for non-assigned cleaner
# ============================================================
class TestEnrouteAuth:
    def test_enroute_non_assigned_403(self, owner_ctx, cleaner_ctx):
        # Create job WITHOUT assigning the cleaner
        payload = {
            "title": f"TEST_SMS_NOASSIGN_{uuid.uuid4().hex[:6]}",
            "clean_type": "standard",
            "address": "789 TEST Blvd",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "date": "2026-06-30",
            "start_window_from": "09:00",
            "start_window_to": "10:00",
            "estimated_duration": 2,
            "client_name": "TEST NoAssign",
            "client_phone": "+15550000000",
            "required_qualifications": [],
            "pay_rate": 30,
        }
        r = requests.post(f"{API}/jobs", headers=_hdr(owner_ctx["tok"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        jid = r.json()["job_id"]
        owner_ctx["jobs"].append(jid)

        r = requests.post(
            f"{API}/jobs/{jid}/enroute",
            headers=_hdr(cleaner_ctx["tok"]),
            json={"latitude": 0, "longitude": 0},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 not-assigned got {r.status_code}: {r.text}"
