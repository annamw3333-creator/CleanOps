"""
Tests for the new structured availability_schedule feature.

Coverage:
- PUT /api/profile with availability_schedule persists & derives availability (day list)
- GET /api/users/{id} returns availability_schedule
- Removing a day from the schedule removes it from availability (day-level matching breaks)
- Day-level job matching still works after switching to schedule
"""
import pytest
import requests
from datetime import datetime, timedelta

from conftest import API


CLEANER_EMAIL = "cleaner@abodeops.com"
OWNER_EMAIL = "owner@abodeops.com"
PASSWORD = "pass123"


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    data = r.json()
    return {"token": data["token"], "user": data["user"]}


@pytest.fixture(scope="module")
def cleaner_session():
    return _login(CLEANER_EMAIL, PASSWORD)


@pytest.fixture(scope="module")
def owner_session():
    return _login(OWNER_EMAIL, PASSWORD)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ------------------------- PUT /profile -------------------------

class TestAvailabilitySchedulePersistence:
    def test_put_profile_persists_schedule_and_derives_availability(self, cleaner_session):
        token = cleaner_session["token"]
        schedule = {
            "Mon": {"mode": "all"},
            "Tue": {
                "mode": "windows",
                "windows": [
                    {"from": "06:00", "to": "11:00"},
                    {"from": "13:00", "to": "18:00"},
                ],
            },
        }
        r = requests.put(f"{API}/profile", json={"availability_schedule": schedule},
                         headers=_auth(token), timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()["user"]

        # availability_schedule echoed back
        assert "availability_schedule" in u, "user.availability_schedule missing in response"
        sched = u["availability_schedule"]
        assert sched.get("Mon", {}).get("mode") == "all"
        assert sched.get("Tue", {}).get("mode") == "windows"
        tue_windows = sched["Tue"]["windows"]
        assert len(tue_windows) == 2
        assert tue_windows[0]["from"] == "06:00" and tue_windows[0]["to"] == "11:00"
        assert tue_windows[1]["from"] == "13:00" and tue_windows[1]["to"] == "18:00"

        # derived day list
        assert set(u["availability"]) == {"Mon", "Tue"}

    def test_get_me_returns_schedule_after_put(self, cleaner_session):
        token = cleaner_session["token"]
        r = requests.get(f"{API}/auth/me", headers=_auth(token), timeout=20)
        assert r.status_code == 200
        u = r.json()["user"] if "user" in r.json() else r.json()
        assert "availability_schedule" in u
        assert set(u["availability"]) == {"Mon", "Tue"}

    def test_get_public_user_returns_schedule(self, cleaner_session, owner_session):
        # Owner fetches public profile of cleaner
        cleaner_id = cleaner_session["user"]["user_id"]
        r = requests.get(f"{API}/users/{cleaner_id}", headers=_auth(owner_session["token"]), timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()
        assert "availability_schedule" in u
        assert u["availability_schedule"].get("Tue", {}).get("mode") == "windows"
        assert set(u["availability"]) == {"Mon", "Tue"}


# ------------------------- Day removal + matching ------------------------

def _weekday_name(date_str: str) -> str:
    # date format expected YYYY-MM-DD
    d = datetime.strptime(date_str[:10], "%Y-%m-%d")
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()]


def _next_date_for_weekday(target: str) -> str:
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    target_idx = names.index(target)
    today = datetime.utcnow().date()
    # go at least 2 days out to be future
    for i in range(2, 14):
        d = today + timedelta(days=i)
        if d.weekday() == target_idx:
            return d.isoformat()
    raise RuntimeError("no date found")


class TestAvailabilityMatching:
    """A cleaner available on a day should be assignable/able to grab a job that weekday;
    removing the day from the schedule should block matching."""

    def test_full_week_schedule_then_remove_day_blocks_apply(self, cleaner_session, owner_session):
        ctoken = cleaner_session["token"]
        otoken = owner_session["token"]
        cleaner_id = cleaner_session["user"]["user_id"]

        # 1) set a full-week schedule (all days, all-day)
        full = {d: {"mode": "all"} for d in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
        r = requests.put(f"{API}/profile", json={"availability_schedule": full},
                         headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        assert set(r.json()["user"]["availability"]) == set(full.keys())

        # 2) owner posts a Thursday job (no required quals)
        thu_date = _next_date_for_weekday("Thu")
        job_payload = {
            "title": "TEST_avail_thu",
            "description": "TEST availability matching",
            "address": "123 Test St, Calgary, AB",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "date": thu_date,
            "time": "10:00",
            "start_window_from": "10:00",
            "start_window_to": "12:00",
            "client_name": "TEST Client",
            "estimated_duration": 2,
            "pay_rate": 30,
            "required_qualifications": [],
        }
        r = requests.post(f"{API}/jobs", json=job_payload, headers=_auth(otoken), timeout=20)
        assert r.status_code in (200, 201), r.text
        job = r.json()
        job_id = job["job_id"]

        # 3) cleaner applies → success (Thu in availability)
        r = requests.post(f"{API}/jobs/{job_id}/apply", headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200, f"apply should succeed on Thu, got {r.status_code} {r.text}"

        # 4) cleaner removes Thu from schedule
        partial = {d: {"mode": "all"} for d in ["Mon", "Tue", "Wed", "Fri", "Sat", "Sun"]}  # drop Thu
        r = requests.put(f"{API}/profile", json={"availability_schedule": partial},
                         headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        u = r.json()["user"]
        assert "Thu" not in u["availability"]

        # 5) owner posts another Thursday job; cleaner application should now be blocked
        job_payload2 = dict(job_payload)
        job_payload2["title"] = "TEST_avail_thu_2"
        r = requests.post(f"{API}/jobs", json=job_payload2, headers=_auth(otoken), timeout=20)
        assert r.status_code in (200, 201)
        job_id2 = r.json()["job_id"]
        r = requests.post(f"{API}/jobs/{job_id2}/apply", headers=_auth(ctoken), timeout=20)
        assert r.status_code == 400, f"apply should be blocked when Thu removed, got {r.status_code} {r.text}"
        assert "Thu" in r.text or "available" in r.text.lower()

        # 6) Also test /grab is blocked (atomic accept path)
        r = requests.post(f"{API}/jobs/{job_id2}/grab", headers=_auth(ctoken), timeout=20)
        assert r.status_code == 400, f"grab should be blocked when Thu removed, got {r.status_code} {r.text}"

        # 7) cleanup test jobs
        for jid in (job_id, job_id2):
            requests.delete(f"{API}/jobs/{jid}", headers=_auth(otoken), timeout=20)

    def test_assign_blocked_when_day_removed(self, cleaner_session, owner_session):
        ctoken = cleaner_session["token"]
        otoken = owner_session["token"]
        cleaner_id = cleaner_session["user"]["user_id"]

        # Ensure cleaner does NOT have Sat in schedule
        sched = {d: {"mode": "all"} for d in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"]}
        r = requests.put(f"{API}/profile", json={"availability_schedule": sched},
                         headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        assert "Sat" not in r.json()["user"]["availability"]

        # Post Saturday job
        sat_date = _next_date_for_weekday("Sat")
        r = requests.post(f"{API}/jobs", json={
            "title": "TEST_assign_sat",
            "description": "TEST",
            "address": "123 Test St, Calgary, AB",
            "latitude": 51.0447, "longitude": -114.0719,
            "date": sat_date, "time": "09:00",
            "start_window_from": "09:00", "start_window_to": "11:00",
            "client_name": "TEST Client",
            "estimated_duration": 2, "pay_rate": 30,
            "required_qualifications": [],
        }, headers=_auth(otoken), timeout=20)
        assert r.status_code in (200, 201)
        jid = r.json()["job_id"]

        # Owner tries to assign cleaner — must be blocked
        r = requests.post(f"{API}/jobs/{jid}/assign", json={"cleaner_id": cleaner_id},
                          headers=_auth(otoken), timeout=20)
        assert r.status_code == 400, f"assign should be blocked on Sat, got {r.status_code} {r.text}"

        # cleanup
        requests.delete(f"{API}/jobs/{jid}", headers=_auth(otoken), timeout=20)


# ------------------------- Profile save does NOT wipe schedule ------------------------

class TestProfileSaveDoesNotWipeSchedule:
    def test_profile_save_without_availability_keeps_schedule(self, cleaner_session):
        ctoken = cleaner_session["token"]

        # Set a known schedule
        sched = {
            "Mon": {"mode": "all"},
            "Wed": {"mode": "windows", "windows": [{"from": "09:00", "to": "12:00"}]},
            "Fri": {"mode": "all"},
        }
        r = requests.put(f"{API}/profile", json={"availability_schedule": sched},
                         headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        before = r.json()["user"]
        assert set(before["availability"]) == {"Mon", "Wed", "Fri"}

        # Simulate Profile.save() — sends fields but NO availability/availability_schedule
        r = requests.put(f"{API}/profile", json={
            "name": before["name"],
            "phone": before.get("phone", ""),
            "bio": before.get("bio", ""),
            "hourly_rate": before.get("hourly_rate", 0),
            "qualifications": before.get("qualifications", []),
            "auto_accept": bool(before.get("auto_accept")),
            "experience_summary": before.get("experience_summary", ""),
            "portfolio": before.get("portfolio", []),
        }, headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        after = r.json()["user"]

        # Schedule + availability MUST still be intact
        assert set(after["availability"]) == {"Mon", "Wed", "Fri"}, \
            f"profile save wiped availability! got {after.get('availability')}"
        assert after.get("availability_schedule", {}).get("Wed", {}).get("mode") == "windows"
        wins = after["availability_schedule"]["Wed"].get("windows", [])
        assert len(wins) == 1 and wins[0]["from"] == "09:00" and wins[0]["to"] == "12:00"


# ------------------------- Restore seed availability ------------------------

class TestRestoreSeed:
    """Restore cleaner to the seeded sample schedule so other tests aren't impacted."""

    def test_restore_seed_schedule(self, cleaner_session):
        ctoken = cleaner_session["token"]
        # match seed_demo.py wording: Mon/Tue/Wed/Fri/Sun all-day, Thu 2 windows, Sat 1 window
        seed = {
            "Mon": {"mode": "all"},
            "Tue": {"mode": "all"},
            "Wed": {"mode": "all"},
            "Thu": {"mode": "windows", "windows": [
                {"from": "06:00", "to": "11:00"},
                {"from": "13:00", "to": "18:00"},
            ]},
            "Fri": {"mode": "all"},
            "Sat": {"mode": "windows", "windows": [{"from": "08:00", "to": "14:00"}]},
            "Sun": {"mode": "all"},
        }
        r = requests.put(f"{API}/profile", json={"availability_schedule": seed},
                         headers=_auth(ctoken), timeout=20)
        assert r.status_code == 200
        u = r.json()["user"]
        assert set(u["availability"]) == set(seed.keys())
