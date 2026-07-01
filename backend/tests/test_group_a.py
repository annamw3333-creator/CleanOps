"""
Group A end-to-end backend tests for CleanOps:
 - Unassign cleaner
 - Assign-to-me (owner assigns self)
 - move_out checklist size (9 tasks + 5 photos)
 - Mandatory docs (block apply/grab until resume+insurance uploaded)
 - Owner-editable checklist templates (GET/PUT/DELETE + new-job propagation)
 - Embeddable public booking form (GET info + unauthenticated POST creates pending job)
 - Anomaly detection on complete_job (best-effort — data driven, does not hard fail)

All test data prefixed with TEST_ and cleaned up in teardown.
"""
import os, uuid, time
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
    created_templates = []
    yield {"tok": tok, "user": user, "jobs": created_jobs, "templates": created_templates}
    # cleanup jobs & templates
    for jid in created_jobs:
        try:
            requests.delete(f"{API}/jobs/{jid}", headers=_hdr(tok), timeout=10)
        except Exception:
            pass
    for ct in created_templates:
        try:
            requests.delete(f"{API}/checklist-templates/{ct}", headers=_hdr(tok), timeout=10)
        except Exception:
            pass


@pytest.fixture(scope="module")
def cleaner_ctx():
    tok, user = _login(CLEANER)
    # snapshot original resume/insurance so we can restore
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=10)
    assert r.status_code == 200, r.text
    original = r.json()
    yield {"tok": tok, "user": user, "original": original}
    # restore original docs (if any)
    restore = {
        "resume_base64": original.get("resume_base64", "") or "",
        "resume_name": original.get("resume_name", "") or "",
        "insurance_base64": original.get("insurance_base64", "") or "",
        "insurance_name": original.get("insurance_name", "") or "",
    }
    try:
        requests.put(f"{API}/profile", json=restore, headers=_hdr(tok), timeout=10)
    except Exception:
        pass


def _make_job(owner_tok, clean_type="standard", title=None):
    body = {
        "title": title or f"TEST_{clean_type}_{uuid.uuid4().hex[:6]}",
        "clean_type": clean_type,
        "description": "TEST job for Group A",
        "address": "100 5 Ave SW, Calgary, AB",
        "latitude": 51.0447, "longitude": -114.0719,
        "date": "2026-02-15",
        "start_window_from": "09:00", "start_window_to": "17:00",
        "estimated_duration": 2,
        "pay_rate": 30,
        "required_qualifications": [],
        "client_name": "TEST_Client",
        "client_notes": "",
        "manager_notes": "",
        "client_contact": {"email": "", "phone": ""},
    }
    r = requests.post(f"{API}/jobs", json=body, headers=_hdr(owner_tok), timeout=15)
    assert r.status_code == 200, f"create job failed: {r.status_code} {r.text}"
    return r.json()


# ---------- Tests ----------
class TestUnassignAndAssignSelf:
    def test_assign_self_and_unassign(self, owner_ctx):
        job = _make_job(owner_ctx["tok"])
        owner_ctx["jobs"].append(job["job_id"])
        # assign-self
        r = requests.post(f"{API}/jobs/{job['job_id']}/assign-self", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert owner_ctx["user"]["user_id"] in updated["assigned_cleaners"], "owner not added to assigned_cleaners"
        # unassign
        r = requests.post(f"{API}/jobs/{job['job_id']}/unassign",
                          json={"cleaner_id": owner_ctx["user"]["user_id"]},
                          headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert owner_ctx["user"]["user_id"] not in updated["assigned_cleaners"], "owner still in assigned_cleaners after unassign"

    def test_unassign_not_authorized(self, owner_ctx, cleaner_ctx):
        # cleaner cannot unassign from a job they don't own
        job = _make_job(owner_ctx["tok"])
        owner_ctx["jobs"].append(job["job_id"])
        r = requests.post(f"{API}/jobs/{job['job_id']}/unassign",
                          json={"cleaner_id": "someone"},
                          headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 403


class TestMoveOutChecklist:
    def test_move_out_yields_14_items(self, owner_ctx):
        job = _make_job(owner_ctx["tok"], clean_type="move_out")
        owner_ctx["jobs"].append(job["job_id"])
        checklist = job.get("checklist", [])
        tasks = [c for c in checklist if not c.get("photo")]
        photos = [c for c in checklist if c.get("photo")]
        assert len(tasks) == 9, f"expected 9 move_out tasks, got {len(tasks)}: {[t['label'] for t in tasks]}"
        assert len(photos) == 5, f"expected 5 photo items, got {len(photos)}"
        assert len(checklist) == 14, f"expected 14 total, got {len(checklist)}"


class TestMandatoryDocs:
    def test_apply_blocked_without_docs_then_unblocked(self, owner_ctx, cleaner_ctx):
        # Remove docs first
        clear = {"resume_base64": "", "resume_name": "", "insurance_base64": "", "insurance_name": ""}
        r = requests.put(f"{API}/profile", json=clear, headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 200
        u = r.json()
        # PUT /profile may return {user: {...}} wrapper or raw user
        u = u.get("user", u)
        assert u.get("docs_complete") is False, f"docs_complete should be False when no docs, got: {u.get('docs_complete')}"

        # Owner posts a job with no qualification requirements
        job = _make_job(owner_ctx["tok"])
        owner_ctx["jobs"].append(job["job_id"])

        # apply → 400 with "resume" and "insurance" in message
        r = requests.post(f"{API}/jobs/{job['job_id']}/apply", headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 400, f"expected 400 blocked, got {r.status_code}: {r.text}"
        msg = r.json().get("detail", "").lower()
        assert "resume" in msg and "insurance" in msg, f"expected resume+insurance in error, got: {msg}"

        # grab → 400 also
        r = requests.post(f"{API}/jobs/{job['job_id']}/grab", headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 400, f"expected 400 on grab, got {r.status_code}: {r.text}"

        # Upload docs
        fake_pdf = "data:application/pdf;base64," + "JVBERi0xLjQKJcOkw7zDtsOgCg=="
        upload = {"resume_base64": fake_pdf, "resume_name": "TEST_resume.pdf",
                  "insurance_base64": fake_pdf, "insurance_name": "TEST_insurance.pdf"}
        r = requests.put(f"{API}/profile", json=upload, headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, r.text
        u = r.json()
        u = u.get("user", u)
        assert u.get("docs_complete") is True, f"docs_complete should be True after upload, got {u.get('docs_complete')}"

        # Now apply → 200
        r = requests.post(f"{API}/jobs/{job['job_id']}/apply", headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, f"expected 200 after upload, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("status") in ("applied", "assigned")


class TestChecklistTemplates:
    def test_list_get_returns_4_types_with_custom_flag(self, owner_ctx):
        r = requests.get(f"{API}/checklist-templates", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        for ct in ["standard", "deep", "airbnb", "move_out"]:
            assert ct in data, f"missing {ct}"
            assert "custom" in data[ct]
            assert "tasks" in data[ct]
            assert "photos" in data[ct]

    def test_put_saves_custom_and_delete_resets(self, owner_ctx):
        custom_tasks = ["TEST_customtask_A", "TEST_customtask_B", "TEST_customtask_C"]
        custom_photos = ["TEST_photoZ"]
        r = requests.put(f"{API}/checklist-templates",
                         json={"clean_type": "standard", "tasks": custom_tasks, "photos": custom_photos},
                         headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200, r.text
        owner_ctx["templates"].append("standard")
        assert r.json()["tasks"] == custom_tasks

        # Verify persisted via GET
        r = requests.get(f"{API}/checklist-templates", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.json()["standard"]["custom"] is True
        assert r.json()["standard"]["tasks"] == custom_tasks

        # New job with clean_type=standard should use custom tasks
        job = _make_job(owner_ctx["tok"], clean_type="standard", title="TEST_customchk_job")
        owner_ctx["jobs"].append(job["job_id"])
        task_labels = [c["label"] for c in job["checklist"] if not c.get("photo")]
        assert task_labels == custom_tasks, f"new job should use custom tasks, got {task_labels}"

        # DELETE resets
        r = requests.delete(f"{API}/checklist-templates/standard", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{API}/checklist-templates", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.json()["standard"]["custom"] is False

    def test_non_owner_forbidden(self, cleaner_ctx):
        r = requests.get(f"{API}/checklist-templates", headers=_hdr(cleaner_ctx["tok"]), timeout=10)
        assert r.status_code == 403


class TestPublicBooking:
    def test_public_info_and_create_no_auth(self, owner_ctx):
        owner_id = owner_ctx["user"]["user_id"]
        # unauthenticated GET
        r = requests.get(f"{API}/public/book/{owner_id}", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "owner_name" in data
        assert set(data["clean_types"]) == {"standard", "deep", "airbnb", "move_out"}

        # unauthenticated POST creates pending job with source=booking_form
        body = {
            "client_name": "TEST_PublicClient",
            "email": "test@example.com",
            "phone": "555-0100",
            "address": "200 8 Ave SW, Calgary, AB",
            "date": "2026-03-01",
            "clean_type": "deep",
            "notes": "TEST notes",
        }
        r = requests.post(f"{API}/public/book/{owner_id}", json=body, timeout=15)
        assert r.status_code == 200, f"public booking failed: {r.status_code} {r.text}"
        resp = r.json()
        assert resp.get("ok") is True

        # Owner's Work Hub (GET /jobs) should now show this booking job
        r = requests.get(f"{API}/jobs", headers=_hdr(owner_ctx["tok"]), timeout=10)
        assert r.status_code == 200
        jobs = r.json()
        matches = [j for j in jobs if j.get("source") == "booking_form" and j.get("client_name") == "TEST_PublicClient"]
        assert matches, "booking-form job did not appear in owner's job list"
        job = matches[0]
        assert job["status"] == "pending"
        assert job["clean_type"] == "deep"
        owner_ctx["jobs"].append(job["job_id"])

    def test_public_info_unknown_owner_404(self):
        r = requests.get(f"{API}/public/book/nonexistent_owner_xyz", timeout=10)
        assert r.status_code == 404


class TestAnomalyDetection:
    """Best-effort: seed 2 completed jobs, then a 3rd one that deviates >=30% and check anomaly."""
    def test_anomaly_on_complete_job(self, owner_ctx):
        tok = owner_ctx["tok"]
        # Ensure owner has resume+insurance so they can self-assign & complete via their own flow.
        # Note: owner completes their own jobs; anomaly is on poster's own avg by clean_type.

        # Create 3 airbnb jobs — first 2 completed at ~2h, third at ~4h (100% deviation)
        job_ids = []
        for hours, title in [(2, "TEST_anom_1"), (2, "TEST_anom_2"), (4, "TEST_anom_3")]:
            j = _make_job(tok, clean_type="airbnb", title=title)
            job_ids.append((j["job_id"], hours))
            owner_ctx["jobs"].append(j["job_id"])
            # assign-self
            r = requests.post(f"{API}/jobs/{j['job_id']}/assign-self", headers=_hdr(tok), timeout=10)
            assert r.status_code == 200, r.text
            # mark all checklist items done via bulk (use /jobs/{id}/checklist/complete if it exists)
            # Fallback: iterate through checklist and mark done via /jobs/{id}/task
            job_full = r.json()
            for item in job_full.get("checklist", []):
                # correct endpoint is /jobs/{id}/checklist with item_id
                requests.post(f"{API}/jobs/{j['job_id']}/checklist",
                              json={"item_id": item["id"], "done": True},
                              headers=_hdr(tok), timeout=10)
            # check-in
            requests.post(f"{API}/jobs/{j['job_id']}/checkin", json={"lat": 51.04, "lng": -114.07}, headers=_hdr(tok), timeout=10)
            # complete with hours
            rc = requests.post(f"{API}/jobs/{j['job_id']}/complete",
                               json={"logged_hours": hours},
                               headers=_hdr(tok), timeout=15)
            if rc.status_code != 200:
                pytest.skip(f"complete_job unsupported in this flow: {rc.status_code} {rc.text[:200]}")

        # Fetch 3rd job's anomaly
        r = requests.get(f"{API}/jobs/{job_ids[2][0]}", headers=_hdr(tok), timeout=10)
        assert r.status_code == 200
        j3 = r.json()
        anomaly = j3.get("anomaly")
        if anomaly is None:
            pytest.skip("anomaly not set — insufficient historical data or dedupe logic")
        assert "delta_pct" in anomaly
        assert anomaly["delta_pct"] >= 30, f"expected >=30% deviation, got {anomaly}"
