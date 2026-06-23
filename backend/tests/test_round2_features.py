"""Auto Abodes round 2 backend tests: status, delete, geocode, teams."""
import uuid
import pytest
import requests


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_email(prefix="t"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def _job_body(address="Times Square, New York", required=None):
    return {
        "title": "TEST_R2 Job",
        "clean_type": "standard",
        "address": address,
        "latitude": 0.0,
        "longitude": 0.0,
        "date": "2026-03-01",
        "start_window_from": "09:00",
        "start_window_to": "11:00",
        "estimated_duration": 2.0,
        "client_name": "TEST_Client",
        "client_notes": "",
        "manager_notes": "",
        "required_qualifications": required or [],
        "pay_rate": 25.0,
    }


@pytest.fixture(scope="module")
def ctx(api_url):
    s = {"API": api_url}
    # owner
    e = _rand_email("owner")
    r = requests.post(f"{api_url}/auth/register", json={
        "email": e, "password": "pass123", "name": "OwnR2", "role": "company_owner"
    })
    assert r.status_code == 200, r.text
    s["owner_token"] = r.json()["token"]
    s["owner_id"] = r.json()["user"]["user_id"]
    # cleaner
    e2 = _rand_email("cleaner")
    r2 = requests.post(f"{api_url}/auth/register", json={
        "email": e2, "password": "pass123", "name": "CleanR2", "role": "cleaner"
    })
    assert r2.status_code == 200, r2.text
    s["cleaner_token"] = r2.json()["token"]
    s["cleaner_id"] = r2.json()["user"]["user_id"]
    # admin
    ra = requests.post(f"{api_url}/auth/login", json={
        "email": "aestheticabodesyyc@gmail.com", "password": "admin123"
    })
    if ra.status_code != 200:
        ra = requests.post(f"{api_url}/auth/register", json={
            "email": "aestheticabodesyyc@gmail.com", "password": "admin123",
            "name": "Admin", "role": "client"
        })
    assert ra.status_code == 200, ra.text
    s["admin_token"] = ra.json()["token"]
    return s


# ---------------- GEOCODING ----------------
class TestGeocoding:
    def test_geocode_known_address(self, ctx):
        r = requests.get(f"{ctx['API']}/geocode",
                         params={"address": "Times Square, New York"},
                         headers=_bearer(ctx["owner_token"]))
        # Nominatim may rate-limit; treat 404 leniently but log
        if r.status_code == 404:
            pytest.skip("Nominatim returned no result (rate-limit or transient)")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "latitude" in d and "longitude" in d
        assert isinstance(d["latitude"], float) and isinstance(d["longitude"], float)
        assert d["latitude"] != 0.0 and d["longitude"] != 0.0
        # Times Square ~ lat 40.7, lon -74
        assert 40 < d["latitude"] < 41
        assert -75 < d["longitude"] < -73

    def test_geocode_unknown_address(self, ctx):
        r = requests.get(f"{ctx['API']}/geocode",
                         params={"address": "zzqqxx_definitely_not_a_real_place_98765"},
                         headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 404

    def test_post_job_auto_geocodes(self, ctx):
        body = _job_body(address="Times Square, New York")
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        job = r.json()
        # If Nominatim worked, lat/lng should NOT be 0,0 we sent in
        if job["latitude"] == 0.0 and job["longitude"] == 0.0:
            pytest.skip("Nominatim transient failure - coordinates not updated")
        assert job["latitude"] != 0.0
        assert job["longitude"] != 0.0
        assert 40 < job["latitude"] < 41
        ctx["geocoded_job_id"] = job["job_id"]


# ---------------- JOB STATUS ----------------
class TestJobStatus:
    def test_status_in_progress_sets_checked_in(self, ctx):
        body = _job_body(address="123 Anywhere St")
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200
        jid = r.json()["job_id"]
        ctx["status_job_id"] = jid

        r2 = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                           json={"status": "in_progress"},
                           headers=_bearer(ctx["owner_token"]))
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "in_progress"
        assert r2.json()["checked_in_at"] is not None

    def test_status_completed_sets_completed_at(self, ctx):
        jid = ctx["status_job_id"]
        r = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                          json={"status": "completed"},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed"
        assert r.json()["completed_at"] is not None

    def test_status_cancelled(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                           json={"status": "cancelled"},
                           headers=_bearer(ctx["owner_token"]))
        assert r2.status_code == 200
        assert r2.json()["status"] == "cancelled"

    def test_status_non_poster_403(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        # cleaner tries to change status -> 403
        r2 = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                           json={"status": "completed"},
                           headers=_bearer(ctx["cleaner_token"]))
        assert r2.status_code == 403

    def test_status_admin_can_override(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                           json={"status": "cancelled"},
                           headers=_bearer(ctx["admin_token"]))
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "cancelled"

    def test_status_invalid_value(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.post(f"{ctx['API']}/jobs/{jid}/status",
                           json={"status": "bogus"},
                           headers=_bearer(ctx["owner_token"]))
        assert r2.status_code in (400, 422)


# ---------------- DELETE JOB ----------------
class TestDeleteJob:
    def test_delete_by_non_poster_403(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.delete(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["cleaner_token"]))
        assert r2.status_code == 403
        # still exists
        r3 = requests.get(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["owner_token"]))
        assert r3.status_code == 200

    def test_delete_by_poster(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.delete(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["owner_token"]))
        assert r2.status_code == 200, r2.text
        # verify gone
        r3 = requests.get(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["owner_token"]))
        assert r3.status_code == 404

    def test_delete_by_admin(self, ctx):
        body = _job_body()
        r = requests.post(f"{ctx['API']}/jobs", json=body, headers=_bearer(ctx["owner_token"]))
        jid = r.json()["job_id"]
        r2 = requests.delete(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["admin_token"]))
        assert r2.status_code == 200, r2.text
        r3 = requests.get(f"{ctx['API']}/jobs/{jid}", headers=_bearer(ctx["owner_token"]))
        assert r3.status_code == 404


# ---------------- TEAMS ----------------
class TestTeams:
    def test_create_team(self, ctx):
        r = requests.post(f"{ctx['API']}/teams",
                          json={"name": "TEST_TeamAlpha"},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["name"] == "TEST_TeamAlpha"
        assert t["owner_id"] == ctx["owner_id"]
        assert t["members"] == []
        ctx["team_id"] = t["team_id"]

    def test_my_teams_lists_with_members_info(self, ctx):
        r = requests.get(f"{ctx['API']}/teams/mine", headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        teams = r.json()
        ids = [t["team_id"] for t in teams]
        assert ctx["team_id"] in ids
        team = next(t for t in teams if t["team_id"] == ctx["team_id"])
        assert "members_info" in team
        assert isinstance(team["members_info"], list)

    def test_add_member(self, ctx):
        r = requests.post(f"{ctx['API']}/teams/{ctx['team_id']}/members",
                          json={"cleaner_id": ctx["cleaner_id"]},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        # verify via /teams/mine
        r2 = requests.get(f"{ctx['API']}/teams/mine", headers=_bearer(ctx["owner_token"]))
        team = next(t for t in r2.json() if t["team_id"] == ctx["team_id"])
        member_ids = [m["user_id"] for m in team["members_info"]]
        assert ctx["cleaner_id"] in member_ids

    def test_add_member_non_owner_403(self, ctx):
        r = requests.post(f"{ctx['API']}/teams/{ctx['team_id']}/members",
                          json={"cleaner_id": ctx["cleaner_id"]},
                          headers=_bearer(ctx["cleaner_token"]))
        assert r.status_code == 403
