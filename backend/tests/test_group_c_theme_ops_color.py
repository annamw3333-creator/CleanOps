"""
Group C — Backend tests for CleanOps:
  * PUT /api/profile with company_color/company_name persists and returns updated user
  * GET /api/jobs returns company_color + company_name on each job (enrich_job)
  * Custom color set by owner overrides auto palette for that owner's jobs
  * Clearing company_color falls back to a stable auto palette color per poster
  * Auto palette is deterministic (same for same poster_id)

Cleanup: restores owner's company_color/company_name to original values on teardown.
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
PALETTE = ["#1A5F7A", "#2B7043", "#D4AF37", "#9C5FB5", "#C1666B", "#3A7CA5", "#E08A3C", "#4D9078"]


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_ctx():
    tok, user = _login(OWNER)
    original_color = user.get("company_color") or ""
    original_name = user.get("company_name") or ""
    yield {"tok": tok, "user": user}
    # Restore
    try:
        requests.put(
            f"{API}/profile",
            json={"company_color": original_color, "company_name": original_name},
            headers=_hdr(tok),
            timeout=15,
        )
    except Exception:
        pass


@pytest.fixture(scope="module")
def cleaner_ctx():
    tok, user = _login(CLEANER)
    yield {"tok": tok, "user": user}


# ---------------- Profile PUT: company color ----------------
class TestProfileCompanyColor:
    def test_set_company_color_returns_updated_user(self, owner_ctx):
        new_color = "#2B7043"
        new_name = "TEST_Sparkle Co"
        r = requests.put(
            f"{API}/profile",
            json={"company_color": new_color, "company_name": new_name},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data, data
        assert data["user"].get("company_color") == new_color
        assert data["user"].get("company_name") == new_name

    def test_get_profile_reflects_saved_color(self, owner_ctx):
        # Login again -> /auth/login returns the persisted user; simpler than a /me endpoint.
        r = requests.post(f"{API}/auth/login", json=OWNER, timeout=15)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u.get("company_color") == "#2B7043"
        assert u.get("company_name") == "TEST_Sparkle Co"

    def test_clear_company_color_falls_back(self, owner_ctx):
        r = requests.put(
            f"{API}/profile",
            json={"company_color": ""},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # After clear, the enriched jobs will use auto palette (verified in next class).


# ---------------- /api/jobs enrichment ----------------
class TestJobsEnrichment:
    def test_owner_custom_color_applied_to_jobs(self, owner_ctx):
        # Set custom color first
        custom = "#9C5FB5"
        r = requests.put(
            f"{API}/profile",
            json={"company_color": custom, "company_name": "TEST_Purple Co"},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )
        assert r.status_code == 200

        # Get owner's jobs
        rj = requests.get(f"{API}/jobs?scope=mine", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert rj.status_code == 200, rj.text
        jobs = rj.json()
        assert isinstance(jobs, list)
        assert len(jobs) > 0, "expected owner to have seeded/demo jobs"
        for j in jobs:
            assert "company_color" in j, f"missing company_color in job: {j.get('job_id')}"
            assert "company_name" in j, f"missing company_name in job: {j.get('job_id')}"
            assert j["company_color"] == custom, (
                f"expected {custom} got {j['company_color']} for job {j.get('job_id')}"
            )
            assert j["company_name"] == "TEST_Purple Co"
            # No mongo _id leak
            assert "_id" not in j

    def test_auto_color_used_when_empty(self, owner_ctx):
        # Clear color
        r = requests.put(
            f"{API}/profile",
            json={"company_color": ""},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )
        assert r.status_code == 200
        # Fetch owner jobs -> company_color should come from palette (stable per poster_id)
        rj = requests.get(f"{API}/jobs?scope=mine", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert rj.status_code == 200
        jobs = rj.json()
        assert len(jobs) > 0
        poster_id = owner_ctx["user"]["user_id"]
        expected = PALETTE[sum(ord(c) for c in poster_id) % len(PALETTE)]
        for j in jobs:
            assert j.get("company_color") == expected, (
                f"auto color mismatch: expected {expected}, got {j.get('company_color')}"
            )

    def test_cleaner_sees_company_color_on_assigned_jobs(self, cleaner_ctx):
        r = requests.get(f"{API}/jobs?scope=assigned", headers=_hdr(cleaner_ctx["tok"]), timeout=15)
        assert r.status_code == 200, r.text
        jobs = r.json()
        # Cleaner should have at least seeded jobs but even if not, contract must hold when present.
        for j in jobs:
            assert "company_color" in j
            assert j["company_color"].startswith("#") and len(j["company_color"]) == 7


# ---------------- Regression: create job still works with color enrichment ----------------
class TestJobCreateRegression:
    def test_owner_creates_job_and_it_has_company_color(self, owner_ctx):
        # Ensure owner has a custom color first
        custom = "#E08A3C"
        requests.put(
            f"{API}/profile",
            json={"company_color": custom, "company_name": "TEST_Orange Co"},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )

        payload = {
            "title": f"TEST_GROUPC_JOB_{uuid.uuid4().hex[:8]}",
            "clean_type": "standard",
            "address": "500 5 Ave SW, Calgary",
            "latitude": 51.0447,
            "longitude": -114.0719,
            "date": "2026-02-01",
            "start_window_from": "09:00",
            "start_window_to": "11:00",
            "duration_hours": 2,
            "estimated_duration": 2,
            "pay_amount": 80,
            "client_name": "TEST_Client",
            "required_qualifications": [],
            "notes": "group c regression",
        }
        r = requests.post(f"{API}/jobs", json=payload, headers=_hdr(owner_ctx["tok"]), timeout=20)
        assert r.status_code in (200, 201), r.text
        job = r.json()
        assert job.get("company_color") == custom
        assert job.get("company_name") == "TEST_Orange Co"
        job_id = job["job_id"]

        # GET the job -> verify persistence + enrichment
        g = requests.get(f"{API}/jobs/{job_id}", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert g.status_code == 200
        gj = g.json()
        assert gj.get("company_color") == custom
        assert "_id" not in gj

        # Cleanup
        d = requests.delete(f"{API}/jobs/{job_id}", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert d.status_code in (200, 204)


# ---------------- Palette validity ----------------
class TestPaletteBounds:
    def test_owner_auto_color_is_in_palette(self, owner_ctx):
        # After clearing (previous test), reset to empty and check color is in palette.
        requests.put(
            f"{API}/profile",
            json={"company_color": ""},
            headers=_hdr(owner_ctx["tok"]),
            timeout=15,
        )
        rj = requests.get(f"{API}/jobs?scope=mine", headers=_hdr(owner_ctx["tok"]), timeout=15)
        assert rj.status_code == 200
        for j in rj.json():
            assert j["company_color"] in PALETTE, f"{j['company_color']} not in palette"
