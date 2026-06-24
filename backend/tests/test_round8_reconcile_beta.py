"""
Round-8 backend tests for AbodeOps:
- /api/reconcile (owner/admin only)
- /api/jobs/{id}/mark-paid (poster/admin only)
- /api/metrics payroll_owed excludes paid jobs
- /api/billing/checkout BETA pricing (pro=$19.99, business=$39.99)
"""
import os
import requests
import pytest

from conftest import API


def _login(client, email, password):
    r = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json()["token"]
    client.headers.update({"Authorization": f"Bearer {tok}"})
    return r.json()


@pytest.fixture
def owner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, "owner@abodeops.com", "pass123")
    return s


@pytest.fixture
def cleaner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, "cleaner@abodeops.com", "pass123")
    return s


# ---------- /api/reconcile ----------

class TestReconcile:
    def test_reconcile_owner_shape(self, owner_client):
        r = owner_client.get(f"{API}/reconcile")
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["totals", "payroll_by_cleaner", "revenue_by_job"]).issubset(data.keys())
        t = data["totals"]
        for k in ("payroll_owed", "payroll_paid", "revenue_total", "revenue_today"):
            assert k in t, f"missing totals.{k}"
            assert isinstance(t[k], (int, float))
        assert isinstance(data["payroll_by_cleaner"], list)
        assert isinstance(data["revenue_by_job"], list)

    def test_reconcile_payroll_by_cleaner_has_casey(self, owner_client):
        r = owner_client.get(f"{API}/reconcile")
        assert r.status_code == 200
        cleaners = r.json()["payroll_by_cleaner"]
        # post-seed: at least one cleaner group (Casey) with completed jobs and unpaid owed > 0
        assert len(cleaners) >= 1
        casey = next((c for c in cleaners if "Casey" in (c.get("name") or "")), cleaners[0])
        assert casey["total_owed"] > 0
        assert isinstance(casey.get("jobs"), list) and len(casey["jobs"]) >= 1
        for j in casey["jobs"]:
            for k in ("job_id", "title", "pay", "paid"):
                assert k in j

    def test_reconcile_revenue_by_job_shape(self, owner_client):
        r = owner_client.get(f"{API}/reconcile")
        assert r.status_code == 200
        jobs = r.json()["revenue_by_job"]
        assert len(jobs) >= 1
        for j in jobs:
            for k in ("job_id", "title", "revenue", "pay", "paid"):
                assert k in j

    def test_reconcile_cleaner_role_forbidden(self, cleaner_client):
        r = cleaner_client.get(f"{API}/reconcile")
        assert r.status_code == 403


# ---------- /api/jobs/{id}/mark-paid + /api/metrics impact ----------

class TestMarkPaidFlow:
    def test_cleaner_cannot_mark_paid(self, cleaner_client, owner_client):
        # find any completed unpaid job from owner reconcile
        rec = owner_client.get(f"{API}/reconcile").json()
        cleaners = rec["payroll_by_cleaner"]
        target = None
        for c in cleaners:
            for j in c["jobs"]:
                if not j["paid"]:
                    target = j["job_id"]; break
            if target: break
        assert target, "expected at least one unpaid completed job after seed"
        r = cleaner_client.post(f"{API}/jobs/{target}/mark-paid", json={"paid": True})
        assert r.status_code == 403

    def test_owner_mark_paid_shifts_owed_to_paid_and_metrics_drops(self, owner_client):
        rec0 = owner_client.get(f"{API}/reconcile").json()
        metrics0 = owner_client.get(f"{API}/metrics").json()
        # pick an unpaid completed job
        target_job = None
        target_pay = 0
        for j in rec0["revenue_by_job"]:
            if not j["paid"]:
                target_job = j["job_id"]
                target_pay = j["pay"]
                break
        assert target_job, "no unpaid job to flip"

        r = owner_client.post(f"{API}/jobs/{target_job}/mark-paid", json={"paid": True})
        assert r.status_code == 200, r.text
        assert r.json().get("paid") is True

        rec1 = owner_client.get(f"{API}/reconcile").json()
        metrics1 = owner_client.get(f"{API}/metrics").json()

        # reconcile totals shifted: owed decreased by target_pay, paid increased by target_pay (allow rounding)
        assert rec1["totals"]["payroll_owed"] == pytest.approx(rec0["totals"]["payroll_owed"] - target_pay, abs=0.5)
        assert rec1["totals"]["payroll_paid"] == pytest.approx(rec0["totals"]["payroll_paid"] + target_pay, abs=0.5)

        # /api/metrics payroll_owed dropped by target_pay
        assert metrics1["payroll_owed"] == pytest.approx(metrics0["payroll_owed"] - target_pay, abs=0.5)

        # revenue unchanged (paying doesn't change revenue)
        assert rec1["totals"]["revenue_total"] == pytest.approx(rec0["totals"]["revenue_total"], abs=0.5)

        # cleanup: flip back to unpaid for re-runs
        r2 = owner_client.post(f"{API}/jobs/{target_job}/mark-paid", json={"paid": False})
        assert r2.status_code == 200
        assert r2.json().get("paid") is False

        rec2 = owner_client.get(f"{API}/reconcile").json()
        assert rec2["totals"]["payroll_owed"] == pytest.approx(rec0["totals"]["payroll_owed"], abs=0.5)

    def test_mark_paid_404_unknown(self, owner_client):
        r = owner_client.post(f"{API}/jobs/does_not_exist_xyz/mark-paid", json={"paid": True})
        assert r.status_code == 404


# ---------- /api/billing/checkout BETA pricing ----------

class TestBetaPricing:
    def test_pro_checkout_returns_url(self, owner_client):
        r = owner_client.post(
            f"{API}/billing/checkout",
            json={"tier": "pro", "redirect_url": "https://example.com/return"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body
        assert isinstance(body["checkout_url"], str) and body["checkout_url"].startswith("http")

    def test_business_checkout_returns_url(self, owner_client):
        r = owner_client.post(
            f"{API}/billing/checkout",
            json={"tier": "business", "redirect_url": "https://example.com/return"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body
        assert body["checkout_url"].startswith("http")

    def test_invalid_tier_rejected(self, owner_client):
        r = owner_client.post(
            f"{API}/billing/checkout",
            json={"tier": "free", "redirect_url": "https://example.com/return"},
        )
        assert r.status_code in (400, 422)

    def test_tier_pricing_constants(self):
        # Inspect server.py for the constant — fail fast if it drifts from BETA values.
        with open("/app/backend/server.py") as f:
            src = f.read()
        # BETA: pro=1999 cents ($19.99), business=3999 cents ($39.99)
        assert 'TIER_PRICING = {"pro": 1999, "business": 3999}' in src, \
            "TIER_PRICING constant doesn't match BETA pricing pro=1999, business=3999"
