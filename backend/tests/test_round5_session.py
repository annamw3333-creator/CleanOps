"""
Round-5 backend tests for AbodeOps session features:
  - Driver Mode APIs (status, earnings, offers, grab, decline)
  - Client List APIs (list, notes upsert)
  - Onboarding APIs (create/list/complete; owner vs cleaner; quiz scoring)
  - Client Feedback public link APIs
"""
import os
import time
import pytest
import requests
from conftest import API

OWNER = ("owner@abodeops.com", "pass123")
CLEANER = ("cleaner@abodeops.com", "pass123")
CLIENT = ("client@abodeops.com", "pass123")


# --------------- auth helpers ---------------
def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    d = r.json()
    return d["token"], d["user"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_auth():
    return login(*OWNER)


@pytest.fixture(scope="module")
def cleaner_auth():
    return login(*CLEANER)


@pytest.fixture(scope="module")
def client_auth():
    return login(*CLIENT)


# ============ DRIVER MODE ============
class TestDriverMode:
    def test_driver_status_online(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.post(f"{API}/driver/status",
                          json={"online": True, "latitude": 51.0447, "longitude": -114.0719},
                          headers=hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["online"] is True

    def test_driver_earnings_shape(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.get(f"{API}/driver/earnings", headers=hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("today", "week", "total", "jobs_today", "is_online"):
            assert k in d, f"missing {k}"
        assert isinstance(d["total"], (int, float))
        assert d["is_online"] is True  # set true above

    def test_driver_offers_returns_nearby(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.get(f"{API}/driver/offers?lat=51.0447&lng=-114.0719", headers=hdr(tok))
        assert r.status_code == 200, r.text
        offers = r.json()
        assert isinstance(offers, list)
        assert len(offers) >= 1, "expected demo offers near Calgary"
        first = offers[0]
        for k in ("job_id", "distance_km", "est_earnings"):
            assert k in first, f"offer missing {k}"
        # sorted ascending by distance (None last)
        dists = [o["distance_km"] for o in offers if o["distance_km"] is not None]
        assert dists == sorted(dists), "offers not sorted by distance"

    def test_owner_cannot_view_offers(self, owner_auth):
        tok, _ = owner_auth
        r = requests.get(f"{API}/driver/offers", headers=hdr(tok))
        assert r.status_code == 403

    def test_driver_decline_hides_offer(self, cleaner_auth):
        tok, _ = cleaner_auth
        offers = requests.get(f"{API}/driver/offers?lat=51.0447&lng=-114.0719", headers=hdr(tok)).json()
        if not offers:
            pytest.skip("no offers available to decline")
        target = offers[-1]["job_id"]
        r = requests.post(f"{API}/driver/decline/{target}", headers=hdr(tok))
        assert r.status_code == 200
        offers2 = requests.get(f"{API}/driver/offers?lat=51.0447&lng=-114.0719", headers=hdr(tok)).json()
        ids = [o["job_id"] for o in offers2]
        assert target not in ids, "declined job still showing"

    def test_grab_atomic_409_on_second(self, cleaner_auth):
        tok, _ = cleaner_auth
        offers = requests.get(f"{API}/driver/offers?lat=51.0447&lng=-114.0719", headers=hdr(tok)).json()
        if not offers:
            pytest.skip("no offers to grab")
        target = offers[0]["job_id"]
        r1 = requests.post(f"{API}/jobs/{target}/grab", headers=hdr(tok))
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert "assigned_cleaners" in body
        # second grab should 409
        r2 = requests.post(f"{API}/jobs/{target}/grab", headers=hdr(tok))
        assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text}"

    def test_driver_status_offline(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.post(f"{API}/driver/status", json={"online": False}, headers=hdr(tok))
        assert r.status_code == 200
        assert r.json()["online"] is False


# ============ CLIENT LIST ============
class TestClientList:
    def test_owner_clients_grouped(self, owner_auth):
        tok, _ = owner_auth
        r = requests.get(f"{API}/clients", headers=hdr(tok))
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "owner should have demo clients"
        c = data[0]
        for k in ("key", "name", "job_count", "frequency", "clean_type", "cleaners", "member_since"):
            assert k in c, f"client missing {k}"

    def test_cleaner_sees_companies(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.get(f"{API}/clients", headers=hdr(tok))
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert data[0].get("is_company") is True

    def test_notes_upsert_persists(self, owner_auth):
        tok, _ = owner_auth
        clients = requests.get(f"{API}/clients", headers=hdr(tok)).json()
        assert clients, "need a client to attach notes"
        key = clients[0]["key"]
        payload = {"key": key, "phone": "+1-555-TEST", "email": "TEST_notes@x.com", "notes": "TEST notes upsert"}
        r = requests.put(f"{API}/clients/notes", json=payload, headers=hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # GET to verify persistence
        clients2 = requests.get(f"{API}/clients", headers=hdr(tok)).json()
        match = next((c for c in clients2 if c["key"] == key), None)
        assert match is not None
        assert match["phone"] == "+1-555-TEST"
        assert match["email"] == "TEST_notes@x.com"
        assert match["notes"] == "TEST notes upsert"


# ============ ONBOARDING ============
class TestOnboarding:
    item_id_quiz = None
    item_id_doc = None

    def test_owner_creates_quiz(self, owner_auth):
        tok, _ = owner_auth
        body = {
            "title": "TEST_Safety Quiz",
            "type": "quiz",
            "questions": [
                {"q": "Best PPE?", "options": ["None", "Gloves", "Crown"], "answer": 1},
                {"q": "Mix bleach + ammonia?", "options": ["Yes", "No"], "answer": 1},
            ],
        }
        r = requests.post(f"{API}/onboarding", json=body, headers=hdr(tok))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "TEST_Safety Quiz"
        assert data["type"] == "quiz"
        assert len(data["questions"]) == 2
        TestOnboarding.item_id_quiz = data["item_id"]

    def test_owner_creates_doc(self, owner_auth):
        tok, _ = owner_auth
        body = {"title": "TEST_SOP Doc", "type": "document", "content": "Read and acknowledge"}
        r = requests.post(f"{API}/onboarding", json=body, headers=hdr(tok))
        assert r.status_code == 200, r.text
        TestOnboarding.item_id_doc = r.json()["item_id"]

    def test_cleaner_blocked_from_creating(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.post(f"{API}/onboarding",
                          json={"title": "x", "type": "document", "content": "x"},
                          headers=hdr(tok))
        assert r.status_code == 403

    def test_cleaner_list_hides_answers(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.get(f"{API}/onboarding", headers=hdr(tok))
        assert r.status_code == 200, r.text
        items = r.json()
        quiz = next((i for i in items if i["item_id"] == TestOnboarding.item_id_quiz), None)
        assert quiz is not None
        for q in quiz["questions"]:
            assert "answer" not in q, "cleaner should NOT see answers"

    def test_owner_list_shows_answers(self, owner_auth):
        tok, _ = owner_auth
        r = requests.get(f"{API}/onboarding", headers=hdr(tok))
        assert r.status_code == 200
        items = r.json()
        quiz = next((i for i in items if i["item_id"] == TestOnboarding.item_id_quiz), None)
        assert quiz is not None
        for q in quiz["questions"]:
            assert "answer" in q, "owner should see answers"

    def test_cleaner_complete_quiz_scoring(self, cleaner_auth):
        tok, _ = cleaner_auth
        # Correct answers: [1,1]
        r = requests.post(f"{API}/onboarding/{TestOnboarding.item_id_quiz}/complete",
                          json={"answers": [1, 0]}, headers=hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["completed"] is True
        assert d["score"] == 1
        assert d["total"] == 2

    def test_cleaner_complete_doc(self, cleaner_auth):
        tok, _ = cleaner_auth
        r = requests.post(f"{API}/onboarding/{TestOnboarding.item_id_doc}/complete",
                          json={"answers": []}, headers=hdr(tok))
        assert r.status_code == 200
        assert r.json()["completed"] is True

    def test_list_reflects_progress(self, cleaner_auth):
        tok, _ = cleaner_auth
        items = requests.get(f"{API}/onboarding", headers=hdr(tok)).json()
        quiz = next((i for i in items if i["item_id"] == TestOnboarding.item_id_quiz), None)
        doc = next((i for i in items if i["item_id"] == TestOnboarding.item_id_doc), None)
        assert quiz["completed"] is True
        assert quiz["score"] == 1 and quiz["total"] == 2
        assert doc["completed"] is True


# ============ CLIENT FEEDBACK LINKS ============
class TestFeedbackLinks:
    token = None
    job_id = None

    def _ensure_job(self, owner_auth, cleaner_auth):
        """Create a job, assign cleaner, mark completed."""
        otok, _ = owner_auth
        ctok, cuser = cleaner_auth
        body = {
            "title": "TEST_feedback_job",
            "description": "feedback test",
            "address": "Calgary, AB",
            "latitude": 51.05,
            "longitude": -114.07,
            "date": "2026-02-01",
            "estimated_duration": 2,
            "pay_rate": 30,
            "required_qualifications": [],
            "clean_type": "standard",
            "client_name": "TEST Client Co",
            "start_window_from": "09:00",
            "start_window_to": "11:00",
        }
        r = requests.post(f"{API}/jobs", json=body, headers=hdr(otok))
        assert r.status_code == 200, r.text
        jid = r.json()["job_id"]
        # assign cleaner
        ra = requests.post(f"{API}/jobs/{jid}/assign", json={"cleaner_id": cuser["user_id"]}, headers=hdr(otok))
        assert ra.status_code in (200, 201), ra.text
        # mark completed (owner side bypasses checklist)
        rc = requests.post(f"{API}/jobs/{jid}/status", json={"status": "completed"}, headers=hdr(otok))
        assert rc.status_code == 200, rc.text
        return jid

    def test_owner_can_generate_link(self, owner_auth, cleaner_auth):
        jid = self._ensure_job(owner_auth, cleaner_auth)
        TestFeedbackLinks.job_id = jid
        otok, _ = owner_auth
        r = requests.post(f"{API}/jobs/{jid}/feedback-link", headers=hdr(otok))
        assert r.status_code == 200, r.text
        TestFeedbackLinks.token = r.json()["token"]
        assert TestFeedbackLinks.token

    def test_non_owner_cannot_generate_link(self, cleaner_auth):
        ctok, _ = cleaner_auth
        r = requests.post(f"{API}/jobs/{TestFeedbackLinks.job_id}/feedback-link", headers=hdr(ctok))
        assert r.status_code == 403

    def test_public_get_no_auth(self):
        r = requests.get(f"{API}/public/feedback/{TestFeedbackLinks.token}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["job_title"].startswith("TEST_feedback_job")
        assert d["submitted"] is False

    def test_public_get_invalid_token(self):
        r = requests.get(f"{API}/public/feedback/not-a-real-token-xyz")
        assert r.status_code == 404

    def test_public_post_submit(self):
        r = requests.post(f"{API}/public/feedback/{TestFeedbackLinks.token}",
                          json={"rating": 5, "comment": "TEST_great", "client_name": "TEST Client"})
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_public_get_reflects_submission(self):
        r = requests.get(f"{API}/public/feedback/{TestFeedbackLinks.token}")
        assert r.json()["submitted"] is True

    def test_job_detail_has_client_feedback(self, owner_auth):
        otok, _ = owner_auth
        r = requests.get(f"{API}/jobs/{TestFeedbackLinks.job_id}", headers=hdr(otok))
        assert r.status_code == 200
        d = r.json()
        cf = d.get("client_feedback")
        assert cf is not None, "job missing client_feedback after submission"
        assert cf["rating"] == 5
        assert cf["comment"] == "TEST_great"

    def test_rating_validation_out_of_range(self):
        r = requests.post(f"{API}/public/feedback/{TestFeedbackLinks.token}",
                          json={"rating": 6, "comment": "bad"})
        assert r.status_code == 422
