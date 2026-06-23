"""Round-4 tests: Ratings & Reviews for cleaners (AbodeOps).

Covers:
- POST /api/jobs/{id}/review: poster-only (403), completed-only (400),
  assigned-only (400), rating 1-5 (422 outside).
- Idempotent upsert per (job, cleaner, reviewer); aggregate recompute.
- GET /api/users/{cleaner_id}/reviews returns aggregate + reviews list with
  required fields (reviewer_name, rating, comment, job_title).
- GET /api/users includes avg_rating and review_count for every user.
- GET /api/jobs/{id}: applicants_info and assigned_cleaners_info carry
  avg_rating & review_count for each cleaner.
- End-to-end happy-path: post -> apply (auto-accept) -> complete -> review ->
  verify via /users/{cleaner}/reviews.
"""
import uuid
import pytest
import requests


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_email(prefix="t"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def _register(api, role, prefix):
    email = _rand_email(prefix)
    r = requests.post(f"{api}/auth/register", json={
        "email": email, "password": "pass123",
        "name": f"{prefix.title()} {uuid.uuid4().hex[:4]}", "role": role,
    })
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]["user_id"], email


def _enable_auto_accept(api, token):
    r = requests.put(f"{api}/profile", json={"auto_accept": True}, headers=_bearer(token))
    assert r.status_code == 200, r.text
    body = r.json()
    user = body.get("user", body)
    assert user.get("auto_accept") is True, body


def _post_job(api, owner_token, title_suffix=""):
    body = {
        "title": f"TEST_review_job_{title_suffix or uuid.uuid4().hex[:6]}",
        "clean_type": "standard",
        "address": "100 King St W, Toronto, ON",
        "latitude": 43.6480, "longitude": -79.3811,
        "date": "2026-02-01",
        "start_window_from": "09:00", "start_window_to": "12:00",
        "estimated_duration": 2.0,
        "client_name": "Review Test Client",
        "required_qualifications": [],
        "pay_rate": 30.0,
    }
    r = requests.post(f"{api}/jobs", json=body, headers=_bearer(owner_token))
    assert r.status_code == 200, r.text
    return r.json()["job_id"]


def _apply(api, cleaner_token, job_id):
    r = requests.post(f"{api}/jobs/{job_id}/apply", headers=_bearer(cleaner_token))
    assert r.status_code == 200, r.text
    return r.json()


def _set_status(api, owner_token, job_id, status):
    r = requests.post(f"{api}/jobs/{job_id}/status", json={"status": status}, headers=_bearer(owner_token))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Shared per-module setup ----------------
@pytest.fixture(scope="module")
def ctx(api_url):
    api = api_url
    owner_tok, owner_id, _ = _register(api, "company_owner", "rvw_owner")
    other_owner_tok, other_owner_id, _ = _register(api, "company_owner", "rvw_other")
    cleaner_tok, cleaner_id, _ = _register(api, "cleaner", "rvw_cln")
    cleaner2_tok, cleaner2_id, _ = _register(api, "cleaner", "rvw_cln2")
    _enable_auto_accept(api, cleaner_tok)
    _enable_auto_accept(api, cleaner2_tok)

    # Job J1: cleaner1 auto-accepts (no other applicants yet). Will be completed.
    j1 = _post_job(api, owner_tok, "j1")
    _apply(api, cleaner_tok, j1)

    return {
        "api": api,
        "owner_tok": owner_tok, "owner_id": owner_id,
        "other_owner_tok": other_owner_tok, "other_owner_id": other_owner_id,
        "cleaner_tok": cleaner_tok, "cleaner_id": cleaner_id,
        "cleaner2_tok": cleaner2_tok, "cleaner2_id": cleaner2_id,
        "j1": j1,
    }


# ---------------- Validation / authz ----------------
class TestReviewValidation:
    def test_review_blocked_when_job_not_completed(self, ctx):
        api = ctx["api"]
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 5, "comment": "x"},
                          headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 400, r.text
        assert "completed" in r.text.lower()

    def test_complete_job_via_status_endpoint(self, ctx):
        api = ctx["api"]
        # owner sets in_progress then completed (bypasses cleaner checklist flow)
        _set_status(api, ctx["owner_tok"], ctx["j1"], "in_progress")
        j = _set_status(api, ctx["owner_tok"], ctx["j1"], "completed")
        assert j["status"] == "completed"
        assert ctx["cleaner_id"] in j.get("assigned_cleaners", [])

    def test_review_blocked_for_non_poster(self, ctx):
        api = ctx["api"]
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 5},
                          headers=_bearer(ctx["other_owner_tok"]))
        assert r.status_code == 403, r.text

    def test_review_blocked_for_unassigned_cleaner(self, ctx):
        api = ctx["api"]
        # cleaner2 was never applied/assigned to j1
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner2_id"], "rating": 4},
                          headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 400, r.text
        assert "assigned" in r.text.lower()

    def test_review_rating_out_of_range(self, ctx):
        api = ctx["api"]
        for bad in (0, 6, -1, 10):
            r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                              json={"cleaner_id": ctx["cleaner_id"], "rating": bad},
                              headers=_bearer(ctx["owner_tok"]))
            assert r.status_code == 422, f"rating={bad} -> {r.status_code} {r.text}"

    def test_review_requires_auth(self, ctx):
        api = ctx["api"]
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 5})
        assert r.status_code == 401, r.text


# ---------------- Happy path + idempotency ----------------
class TestReviewHappyPath:
    def test_first_review_updates_aggregate(self, ctx):
        api = ctx["api"]
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 4, "comment": "good"},
                          headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["review_count"] == 1
        assert data["avg_rating"] == 4 or data["avg_rating"] == 4.0

    def test_second_review_same_triplet_is_upsert_not_duplicate(self, ctx):
        api = ctx["api"]
        # Same (job, cleaner, reviewer) -> update rating, count stays 1
        r = requests.post(f"{api}/jobs/{ctx['j1']}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 3, "comment": "actually meh"},
                          headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["review_count"] == 1, data
        assert data["avg_rating"] in (3, 3.0)

    def test_reviews_endpoint_returns_payload_shape(self, ctx):
        api = ctx["api"]
        r = requests.get(f"{api}/users/{ctx['cleaner_id']}/reviews",
                         headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "avg_rating" in data and "review_count" in data and "reviews" in data
        assert data["review_count"] == 1
        assert isinstance(data["reviews"], list) and len(data["reviews"]) == 1
        rev = data["reviews"][0]
        for k in ("reviewer_name", "rating", "comment", "job_title"):
            assert k in rev, f"missing {k} in review payload: {rev}"
        assert rev["rating"] == 3
        assert rev["comment"] == "actually meh"
        # job_title should match the TEST_review_job_j1 prefix
        assert rev["job_title"].startswith("TEST_review_job_"), rev["job_title"]

    def test_two_distinct_reviewers_average(self, ctx):
        """Two posters each create their own job, assign same cleaner, complete, review.
        Combined with first 3-rated review on j1 -> after adding 4 and 5 by two NEW
        reviewers, the cleaner now has 3 reviews (3, 4, 5) -> avg 4.0, count 3.
        """
        api = ctx["api"]
        # NEW poster #1: rate the cleaner 4
        new_owner_tok, _, _ = _register(api, "company_owner", "rvw_o2")
        j2 = _post_job(api, new_owner_tok, "j2")
        _apply(api, ctx["cleaner_tok"], j2)
        _set_status(api, new_owner_tok, j2, "completed")
        r = requests.post(f"{api}/jobs/{j2}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 4},
                          headers=_bearer(new_owner_tok))
        assert r.status_code == 200, r.text

        # NEW poster #2: rate the cleaner 5
        new_owner2_tok, _, _ = _register(api, "company_owner", "rvw_o3")
        j3 = _post_job(api, new_owner2_tok, "j3")
        _apply(api, ctx["cleaner_tok"], j3)
        _set_status(api, new_owner2_tok, j3, "completed")
        r = requests.post(f"{api}/jobs/{j3}/review",
                          json={"cleaner_id": ctx["cleaner_id"], "rating": 5, "comment": "amazing"},
                          headers=_bearer(new_owner2_tok))
        assert r.status_code == 200, r.text
        agg = r.json()
        assert agg["review_count"] == 3
        # 3+4+5 = 12 / 3 = 4.0
        assert agg["avg_rating"] in (4, 4.0)


# ---------------- Aggregate surface across endpoints ----------------
class TestAggregateExposed:
    def test_users_list_includes_rating_fields(self, ctx):
        api = ctx["api"]
        r = requests.get(f"{api}/users", headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        users = r.json()
        # Every user payload should have both keys
        for u in users:
            assert "avg_rating" in u, u
            assert "review_count" in u, u
        # And our reviewed cleaner should show the recomputed numbers
        target = next((u for u in users if u["user_id"] == ctx["cleaner_id"]), None)
        assert target is not None, "cleaner missing from /users listing"
        assert target["review_count"] == 3
        assert target["avg_rating"] in (4, 4.0)

    def test_get_job_assigned_cleaners_info_has_rating(self, ctx):
        api = ctx["api"]
        r = requests.get(f"{api}/jobs/{ctx['j1']}", headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        job = r.json()
        assert "assigned_cleaners_info" in job
        info = next((c for c in job["assigned_cleaners_info"] if c["user_id"] == ctx["cleaner_id"]), None)
        assert info is not None
        assert "avg_rating" in info and "review_count" in info
        assert info["review_count"] == 3

    def test_get_job_applicants_info_has_rating(self, ctx):
        """Create a fresh job (no auto-accept on cleaner2 so we keep them as applicant)."""
        api = ctx["api"]
        # turn auto_accept off for cleaner2 so they stay an applicant
        r = requests.put(f"{api}/profile", json={"auto_accept": False}, headers=_bearer(ctx["cleaner2_tok"]))
        assert r.status_code == 200, r.text
        j4 = _post_job(api, ctx["owner_tok"], "j4")
        ap = _apply(api, ctx["cleaner2_tok"], j4)
        assert ap["status"] == "applied"
        r = requests.get(f"{api}/jobs/{j4}", headers=_bearer(ctx["owner_tok"]))
        assert r.status_code == 200, r.text
        job = r.json()
        assert "applicants_info" in job and len(job["applicants_info"]) >= 1
        a = job["applicants_info"][0]
        assert "avg_rating" in a and "review_count" in a
        # cleaner2 has no reviews -> 0 / 0
        assert a["review_count"] == 0
        assert a["avg_rating"] in (0, 0.0)


# ---------------- End-to-end smoke ----------------
class TestEndToEnd:
    def test_full_owner_post_cleaner_apply_complete_review_flow(self, api_url):
        api = api_url
        owner_tok, _, _ = _register(api, "company_owner", "rvw_e2e_o")
        cleaner_tok, cleaner_id, _ = _register(api, "cleaner", "rvw_e2e_c")
        _enable_auto_accept(api, cleaner_tok)

        job_id = _post_job(api, owner_tok, "e2e")
        ap = _apply(api, cleaner_tok, job_id)
        assert ap.get("auto_accepted") is True
        assert ap.get("status") == "assigned"

        _set_status(api, owner_tok, job_id, "completed")

        r = requests.post(f"{api}/jobs/{job_id}/review",
                          json={"cleaner_id": cleaner_id, "rating": 5, "comment": "spotless"},
                          headers=_bearer(owner_tok))
        assert r.status_code == 200, r.text
        agg = r.json()
        assert agg["review_count"] == 1
        assert agg["avg_rating"] in (5, 5.0)

        r = requests.get(f"{api}/users/{cleaner_id}/reviews", headers=_bearer(owner_tok))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["review_count"] == 1
        assert data["avg_rating"] in (5, 5.0)
        assert data["reviews"][0]["rating"] == 5
        assert data["reviews"][0]["comment"] == "spotless"
        assert data["reviews"][0]["job_title"].startswith("TEST_review_job_")
