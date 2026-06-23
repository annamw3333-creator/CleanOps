"""Auto Abodes round 3 backend tests: Stripe billing (checkout + status)."""
import os
import uuid
import pytest
import requests


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_email(prefix="bill"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def ctx(api_url):
    s = {"API": api_url}
    # owner
    e = _rand_email("owner")
    r = requests.post(f"{api_url}/auth/register", json={
        "email": e, "password": "pass123", "name": "BillOwner", "role": "company_owner"
    })
    assert r.status_code == 200, r.text
    s["owner_token"] = r.json()["token"]
    s["owner_id"] = r.json()["user"]["user_id"]
    s["owner_email"] = e
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
    s["admin_user"] = ra.json()["user"]
    return s


REDIRECT = "https://example.com/return"


# ---------------- CHECKOUT ----------------
class TestBillingCheckout:
    def test_checkout_requires_auth(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "pro", "redirect_url": REDIRECT})
        assert r.status_code == 401, r.text

    def test_checkout_pro_creates_session(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "pro", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body and "session_id" in body
        assert body["checkout_url"].startswith("https://checkout.stripe.com")
        assert body["session_id"].startswith("cs_test_")
        ctx["pro_session_id"] = body["session_id"]
        ctx["pro_checkout_url"] = body["checkout_url"]

    def test_checkout_business_creates_session(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "business", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["checkout_url"].startswith("https://checkout.stripe.com")
        assert body["session_id"].startswith("cs_test_")
        ctx["biz_session_id"] = body["session_id"]

    def test_checkout_invalid_tier_free(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "free", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 422, r.text

    def test_checkout_invalid_tier_gold(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "gold", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 422, r.text

    def test_checkout_pro_reuses_price_lookup_key(self, ctx):
        """Second checkout for same tier must succeed (lookup_key reuse, no Stripe duplicate-price error)."""
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "pro", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session_id"].startswith("cs_test_")
        # new session id (Stripe returns new each call) but same valid checkout host
        assert body["session_id"] != ctx["pro_session_id"]


# ---------------- PAYMENT TRANSACTION PERSISTENCE ----------------
class TestPaymentTransactionPersisted:
    """Verify a pending payment_transactions row was inserted with correct shape via /billing/status."""

    def test_status_requires_auth(self, ctx):
        sid = ctx.get("pro_session_id")
        assert sid, "pro_session_id must be set by checkout test"
        r = requests.get(f"{ctx['API']}/billing/status/{sid}")
        assert r.status_code == 401, r.text

    def test_status_pro_session_unpaid(self, ctx):
        sid = ctx["pro_session_id"]
        r = requests.get(f"{ctx['API']}/billing/status/{sid}",
                         headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "payment_status" in body and "paid" in body and "user" in body
        # Fresh, untouched session must NOT be paid
        assert body["paid"] is False
        assert body["payment_status"] in ("unpaid", "no_payment_required", "open")
        # User tier MUST NOT have been upgraded
        assert body["user"]["tier"] != "pro", body["user"]
        # owner is company_owner with free tier => ads enabled
        if body["user"].get("role") == "admin":
            assert body["user"]["ads_enabled"] is False
        else:
            assert body["user"]["tier"] == "free"
            assert body["user"]["ads_enabled"] is True

    def test_status_business_session_unpaid(self, ctx):
        sid = ctx["biz_session_id"]
        r = requests.get(f"{ctx['API']}/billing/status/{sid}",
                         headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["paid"] is False
        assert body["user"]["tier"] != "business"


# ---------------- FREE DOWNGRADE / ADMIN REGRESSIONS ----------------
class TestSubscriptionRegression:
    def test_free_downgrade_sets_ads_enabled(self, ctx):
        # owner currently free (not paid), call upgrade to free explicitly
        r = requests.post(f"{ctx['API']}/subscription/upgrade",
                          json={"tier": "free"},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["tier"] == "free"
        assert u["ads_enabled"] is True

    def test_admin_resolves_business_no_ads(self, ctx):
        # /auth/me forces ensure_admin
        r = requests.get(f"{ctx['API']}/auth/me", headers=_bearer(ctx["admin_token"]))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == "aestheticabodesyyc@gmail.com"
        assert u["role"] == "admin"
        assert u["tier"] == "business"
        assert u["ads_enabled"] is False
