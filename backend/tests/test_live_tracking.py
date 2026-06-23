"""Round-6 tests: Live Location Tracking (Driver mini-map, Cleaner enroute/location/complete, Owner Live Crew Map).
Verifies privacy (fleet/live), tracking lifecycle, auth (403), and privacy leak (cleaner_locations stripped from /jobs/{id}).
"""
import os
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
CLIENT = {"email": "client@abodeops.com", "password": "pass123"}
LEGACY_OWNER = {"email": "t1@test.com", "password": "pass123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_h():
    return _login(OWNER)


@pytest.fixture(scope="module")
def cleaner_h():
    return _login(CLEANER)


@pytest.fixture(scope="module")
def client_h():
    return _login(CLIENT)


@pytest.fixture(scope="module")
def legacy_owner_h():
    return _login(LEGACY_OWNER)


@pytest.fixture(scope="module")
def assigned_job(owner_h, cleaner_h):
    """Ensure cleaner is assigned to demojob_1 (grab it if not). Returns job_id."""
    job_id = "demojob_1"
    # Make sure it's still pending and unassigned by re-seeding only if needed.
    # Try to grab; if 409 (already assigned to someone), re-seed.
    r = requests.post(f"{API}/jobs/{job_id}/grab", headers=cleaner_h, timeout=30)
    if r.status_code == 409:
        # Already assigned. Check if it's THIS cleaner.
        jr = requests.get(f"{API}/jobs/{job_id}", headers=owner_h, timeout=30)
        assert jr.status_code == 200, jr.text
        job = jr.json()
        me = requests.get(f"{API}/auth/me", headers=cleaner_h).json().get("user", {})
        if me["user_id"] not in job.get("assigned_cleaners", []):
            pytest.skip("demojob_1 already assigned to another cleaner; re-seed needed")
    else:
        assert r.status_code == 200, r.text
    return job_id


# ---------------- Backend tracking lifecycle ----------------
class TestTrackingLifecycle:

    def test_enroute_by_assigned_cleaner(self, assigned_job, cleaner_h):
        r = requests.post(f"{API}/jobs/{assigned_job}/enroute",
                          json={"latitude": 51.0420, "longitude": -114.0700}, headers=cleaner_h, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("tracking") is True
        assert body.get("enroute_at") is not None

    def test_location_ping_updates_position(self, assigned_job, cleaner_h):
        r = requests.post(f"{API}/jobs/{assigned_job}/location",
                          json={"latitude": 51.0430, "longitude": -114.0710}, headers=cleaner_h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_enroute_rejects_non_assigned_user_403(self, assigned_job, owner_h):
        r = requests.post(f"{API}/jobs/{assigned_job}/enroute",
                          json={"latitude": 51.04, "longitude": -114.07}, headers=owner_h, timeout=30)
        assert r.status_code == 403, r.text

    def test_location_rejects_non_assigned_user_403(self, assigned_job, owner_h):
        r = requests.post(f"{API}/jobs/{assigned_job}/location",
                          json={"latitude": 51.04, "longitude": -114.07}, headers=owner_h, timeout=30)
        assert r.status_code == 403, r.text


# ---------------- Privacy leak ----------------
class TestPrivacyLeak:

    def test_regular_job_get_strips_cleaner_locations(self, assigned_job, owner_h, cleaner_h):
        # Owner GET
        r = requests.get(f"{API}/jobs/{assigned_job}", headers=owner_h, timeout=30)
        assert r.status_code == 200, r.text
        assert "cleaner_locations" not in r.json(), "Privacy leak: owner sees cleaner_locations"
        # Cleaner GET (assigned)
        r = requests.get(f"{API}/jobs/{assigned_job}", headers=cleaner_h, timeout=30)
        assert r.status_code == 200, r.text
        assert "cleaner_locations" not in r.json(), "Privacy leak: cleaner sees cleaner_locations"


# ---------------- Fleet live (owner-only) ----------------
class TestFleetLive:

    def test_cleaner_forbidden(self, cleaner_h):
        r = requests.get(f"{API}/fleet/live", headers=cleaner_h, timeout=30)
        assert r.status_code == 403, r.text

    def test_owner_sees_their_jobs_with_live_cleaners(self, assigned_job, owner_h, cleaner_h):
        # Make sure cleaner has pinged recently
        requests.post(f"{API}/jobs/{assigned_job}/location",
                      json={"latitude": 51.0440, "longitude": -114.0720}, headers=cleaner_h, timeout=30)
        r = requests.get(f"{API}/fleet/live", headers=owner_h, timeout=30)
        assert r.status_code == 200, r.text
        jobs = r.json()
        assert isinstance(jobs, list)
        target = next((j for j in jobs if j.get("job_id") == assigned_job), None)
        assert target is not None, "Expected demojob_1 in owner's fleet/live"
        assert "live_cleaners" in target
        assert isinstance(target["live_cleaners"], list)
        assert len(target["live_cleaners"]) >= 1
        person = target["live_cleaners"][0]
        for k in ("user_id", "name", "latitude", "longitude", "phase", "updated_at"):
            assert k in person, f"missing {k} in live_cleaners item"
        assert person["phase"] in ("enroute", "on_site")

    def test_other_owner_does_not_see_first_owners_jobs(self, assigned_job, legacy_owner_h):
        r = requests.get(f"{API}/fleet/live", headers=legacy_owner_h, timeout=30)
        assert r.status_code == 200, r.text
        ids = [j.get("job_id") for j in r.json()]
        assert assigned_job not in ids, "Cross-owner leak: another owner sees first owner's job in fleet/live"


# ---------------- Complete clears tracking ----------------
class TestCompleteEndsTracking:

    def test_complete_sets_tracking_false_and_removes_from_fleet_live(self, owner_h, cleaner_h):
        """Use a fresh demo job (demojob_2) so we don't disrupt earlier tests."""
        job_id = "demojob_2"
        # Grab as cleaner
        gr = requests.post(f"{API}/jobs/{job_id}/grab", headers=cleaner_h, timeout=30)
        if gr.status_code == 409:
            pytest.skip("demojob_2 already assigned (re-seed)")
        assert gr.status_code == 200, gr.text

        # Enroute
        r = requests.post(f"{API}/jobs/{job_id}/enroute",
                          json={"latitude": 51.05, "longitude": -114.08}, headers=cleaner_h, timeout=30)
        assert r.status_code == 200, r.text

        # Should now appear in fleet/live
        live = requests.get(f"{API}/fleet/live", headers=owner_h, timeout=30).json()
        ids = [j["job_id"] for j in live]
        assert job_id in ids

        # Check in (puts to in_progress + creates "needs_photo" checklist items?)
        ci = requests.post(f"{API}/jobs/{job_id}/checkin", headers=cleaner_h, timeout=30)
        # checkin may set status=in_progress but completion requires checklist done
        # Force-complete by marking checklist items if any
        jr = requests.get(f"{API}/jobs/{job_id}", headers=cleaner_h).json()
        for item in jr.get("checklist", []):
            if not item.get("done"):
                # toggle done if it's a non-photo task; for photo tasks we send a tiny base64
                if item.get("photo"):
                    requests.post(f"{API}/jobs/{job_id}/checklist", headers=cleaner_h,
                                  json={"item_id": item["id"], "photo_base64": "data:image/png;base64,iVBORw0KGgo="})
                else:
                    requests.post(f"{API}/jobs/{job_id}/checklist", headers=cleaner_h,
                                  json={"item_id": item["id"], "done": True})

        comp = requests.post(f"{API}/jobs/{job_id}/complete", headers=cleaner_h, timeout=30)
        assert comp.status_code == 200, comp.text
        body = comp.json()
        assert body.get("status") == "completed"
        assert body.get("tracking") is False
        # Confirm fleet/live no longer contains a live cleaner for this job
        live2 = requests.get(f"{API}/fleet/live", headers=owner_h, timeout=30).json()
        match = next((j for j in live2 if j["job_id"] == job_id), None)
        # Completed jobs are filtered out of the fleet query (status in pending/in_progress)
        assert match is None, f"Completed job still appears in fleet/live: {match}"
