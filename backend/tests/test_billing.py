"""CleanOps NEW 3-tier billing tests (founding / professional / enterprise).

Covers:
- GET /api/billing/founding-status shape
- POST /api/billing/checkout for founding / professional / enterprise (intro $10/$10/$189)
- POST /api/billing/checkout rejects old tiers (free / pro / business / gold) with 422
- POST /api/billing/checkout requires auth (401)
- GET /api/billing/status/{session_id} for unpaid session → paid=False, no crash, tier unchanged
- payment_transactions row persisted with correct intro amount (verified via /billing/status)
- Founding cap: when 10 users with founding_member=true exist, founding-status spots_left=0
  and POST checkout tier=founding returns 409. Cleanup restores DB after.
"""
import os
import time
import uuid
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio


REDIRECT = "https://example.com/return"


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_email(prefix="bill"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def ctx(api_url):
    s = {"API": api_url}
    e = _rand_email("owner")
    r = requests.post(f"{api_url}/auth/register", json={
        "email": e, "password": "pass123", "name": "BillOwner", "role": "company_owner"
    })
    assert r.status_code == 200, r.text
    s["owner_token"] = r.json()["token"]
    s["owner_id"] = r.json()["user"]["user_id"]
    s["owner_email"] = e
    return s


# -------- Plan intro amounts (must match server.PLANS first phase) --------
PLAN_INTRO = {
    "founding": 1000,       # $10
    "professional": 1000,   # $10
    "enterprise": 18900,    # $189
}


class TestFoundingStatus:
    def test_founding_status_shape(self, api_url):
        r = requests.get(f"{api_url}/billing/founding-status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) >= {"taken", "limit", "spots_left"}
        assert body["limit"] == 10
        assert isinstance(body["taken"], int)
        assert isinstance(body["spots_left"], int)
        assert body["spots_left"] == max(0, 10 - body["taken"])


class TestCheckoutAuth:
    def test_checkout_requires_auth(self, ctx):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "founding", "redirect_url": REDIRECT})
        assert r.status_code == 401, r.text


class TestCheckoutNewTiers:
    """Validate checkout session creation + intro amount persistence for each NEW tier."""

    @pytest.mark.parametrize("tier", ["founding", "professional", "enterprise"])
    def test_checkout_creates_session_and_persists_amount(self, ctx, tier):
        # founding spots may already be taken when running repeatedly; skip if cap reached
        if tier == "founding":
            status = requests.get(f"{ctx['API']}/billing/founding-status").json()
            if status["spots_left"] == 0:
                pytest.skip("founding cap already reached")

        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": tier, "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body and "session_id" in body
        assert body["checkout_url"].startswith("https://checkout.stripe.com"), body
        assert body["session_id"].startswith("cs_test_"), body["session_id"]
        ctx[f"{tier}_session_id"] = body["session_id"]

        # Verify the pending payment_transactions row by checking /billing/status amount path indirectly.
        # We verify amount through a side query — easier: query Mongo via /billing/status which returns
        # user object only; so we directly hit Mongo via motor.
        async def _check():
            mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            db = mongo[os.environ.get("DB_NAME", "test_database")]
            doc = await db.payment_transactions.find_one({"stripe_session_id": body["session_id"]})
            mongo.close()
            return doc

        doc = asyncio.get_event_loop().run_until_complete(_check())
        assert doc is not None, "payment_transactions row was not inserted"
        assert doc["tier"] == tier
        assert doc["amount"] == PLAN_INTRO[tier], f"expected {PLAN_INTRO[tier]} got {doc['amount']}"
        assert doc["currency"] == "usd"
        assert doc["status"] == "pending"
        assert doc["user_id"] == ctx["owner_id"]


class TestCheckoutInvalidTiers:
    """Old tier names (free/pro/business/gold) must be rejected with 422."""

    @pytest.mark.parametrize("tier", ["free", "pro", "business", "gold", "premium"])
    def test_invalid_tier_returns_422(self, ctx, tier):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": tier, "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 422, f"{tier}: {r.status_code} {r.text}"


class TestBillingStatusUnpaid:
    """Fresh session must return paid=False gracefully and NOT upgrade the user's tier."""

    def test_status_unpaid_does_not_crash(self, ctx):
        sid = ctx.get("professional_session_id") or ctx.get("founding_session_id") or ctx.get("enterprise_session_id")
        assert sid, "need at least one session created in TestCheckoutNewTiers"
        r = requests.get(f"{ctx['API']}/billing/status/{sid}",
                         headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "paid" in body and "payment_status" in body and "user" in body
        assert body["paid"] is False
        # tier must not jump to founding/professional/enterprise from an unpaid session
        assert body["user"]["tier"] in ("free",), body["user"]
        # owner of free tier => ads_enabled true (perks)
        assert body["user"]["ads_enabled"] is True

    def test_status_requires_auth(self, ctx):
        sid = ctx.get("professional_session_id") or ctx.get("founding_session_id")
        assert sid
        r = requests.get(f"{ctx['API']}/billing/status/{sid}")
        assert r.status_code == 401, r.text


class TestFoundingCap:
    """Insert 10 founding_member=true users in Mongo. Verify spots_left=0 and POST checkout
    tier='founding' returns 409. Then cleanup to restore DB state."""

    @pytest.fixture(scope="class")
    def inserted_ids(self):
        mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mongo[os.environ.get("DB_NAME", "test_database")]
        loop = asyncio.get_event_loop()

        ids = []
        async def _insert():
            # Capture pre-existing count so we know how many to add to reach the cap
            pre = await db.users.count_documents({"founding_member": True})
            to_add = max(0, 10 - pre)
            for i in range(to_add):
                uid = f"TEST_fcap_{uuid.uuid4().hex[:10]}"
                await db.users.insert_one({
                    "user_id": uid,
                    "email": f"{uid}@example.com",
                    "name": "TEST Founding",
                    "role": "company_owner",
                    "tier": "founding",
                    "founding_member": True,
                })
                ids.append(uid)
            return ids

        loop.run_until_complete(_insert())
        yield ids

        # Cleanup
        async def _cleanup():
            if ids:
                await db.users.delete_many({"user_id": {"$in": ids}})
            mongo.close()
        loop.run_until_complete(_cleanup())

    def test_spots_left_zero_when_capped(self, ctx, inserted_ids):
        r = requests.get(f"{ctx['API']}/billing/founding-status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["taken"] >= 10
        assert body["spots_left"] == 0

    def test_checkout_founding_returns_409_when_capped(self, ctx, inserted_ids):
        r = requests.post(f"{ctx['API']}/billing/checkout",
                          json={"tier": "founding", "redirect_url": REDIRECT},
                          headers=_bearer(ctx["owner_token"]))
        assert r.status_code == 409, r.text
        # Other tiers should STILL work even when founding is capped
        r2 = requests.post(f"{ctx['API']}/billing/checkout",
                           json={"tier": "professional", "redirect_url": REDIRECT},
                           headers=_bearer(ctx["owner_token"]))
        assert r2.status_code == 200, r2.text
