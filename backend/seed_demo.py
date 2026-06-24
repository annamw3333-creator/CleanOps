import asyncio, os, uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from server import hash_password, build_checklist

load_dotenv(".env")
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


async def upsert_user(email, name, role, **extra):
    existing = await db.users.find_one({"email": email})
    uid = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": uid, "email": email, "name": name, "role": role,
        "password_hash": hash_password("pass123"), "tier": "free",
        "created_at": existing["created_at"] if existing else datetime.now(timezone.utc) - timedelta(days=120),
        **extra,
    }
    await db.users.update_one({"email": email}, {"$set": doc}, upsert=True)
    return uid


async def main():
    owner = await upsert_user("owner@abodeops.com", "Olivia Owner", "company_owner", phone="403-555-0100")
    client = await upsert_user("client@abodeops.com", "Carl Client", "client", phone="403-555-0200")
    cleaner = await upsert_user(
        "cleaner@abodeops.com", "Casey Cleaner", "cleaner",
        phone="403-555-0300",
        qualifications=["Background Checked", "Insured"],
        hourly_rate=30, auto_accept=False,
        experience_summary="5 years of residential & Airbnb turnover cleaning across Calgary.",
        portfolio=[PNG] * 12, availability=DAYS[:],
    )

    # Clear previous demo jobs
    await db.jobs.delete_many({"demo": True})

    today = datetime.now(timezone.utc)
    base_lat, base_lng = 51.0447, -114.0719  # Calgary downtown

    def mk_job(i, title, client_name, lat, lng, status, assigned, days_offset):
        d = (today + timedelta(days=days_offset)).strftime("%Y-%m-%d")
        return {
            "job_id": f"demojob_{i}", "demo": True, "poster_id": owner, "poster_name": "Olivia Owner",
            "poster_role": "company_owner", "title": title, "clean_type": "standard",
            "address": f"{100+i} 8 Ave SW, Calgary, AB", "latitude": lat, "longitude": lng,
            "date": d, "start_window_from": "09:00", "start_window_to": "11:00",
            "estimated_duration": 3, "client_name": client_name, "client_notes": "Gate code 1234. Friendly dog.",
            "manager_notes": "", "required_qualifications": [], "pay_rate": 30,
            "status": status, "assigned_cleaners": assigned, "applicants": [],
            "checklist": build_checklist("standard"), "checked_in_at": None,
            "completed_at": today if status == "completed" else None,
            "logged_hours": 3 if status == "completed" else 0,
            "logged_pay": 90 if status == "completed" else 0,
            "created_at": today - timedelta(days=60 - days_offset),
        }

    jobs = [
        mk_job(1, "Weekly clean - Riverbend", "The Smith Family", 51.0460, -114.0700, "pending", [], 1),
        mk_job(2, "Airbnb turnover - Beltline", "Mountain Stays Inc", 51.0420, -114.0750, "pending", [], 2),
        mk_job(3, "Office clean - Eau Claire", "Northstar Realty", 51.0500, -114.0680, "pending", [], 3),
        mk_job(4, "Move-out deep clean", "The Smith Family", 51.0400, -114.0800, "completed", [cleaner], -10),
        mk_job(5, "Condo refresh", "The Smith Family", 51.0470, -114.0710, "completed", [cleaner], -3),
    ]
    await db.jobs.insert_many(jobs)

    # log hours for completed jobs (for earnings)
    await db.hours_log.delete_many({"demo": True})
    await db.hours_log.insert_many([
        {"demo": True, "log_id": f"demolog_{i}", "cleaner_id": cleaner, "job_id": j["job_id"],
         "job_title": j["title"], "hours": 3, "pay": 90, "date": j["completed_at"]}
        for i, j in enumerate([jobs[3], jobs[4]])
    ])

    # seed activity feed for the owner
    await db.activity.delete_many({"demo": True})
    feed = [
        ("completed", "Condo refresh completed by Casey Cleaner", jobs[4]),
        ("addon", "Oven add-on requested for Move-out deep clean", jobs[3]),
        ("arrived", "Casey Cleaner arrived on site at Move-out deep clean", jobs[3]),
        ("enroute", "Casey Cleaner is on the way to Move-out deep clean", jobs[3]),
        ("created", "New job posted: Weekly clean - Riverbend", jobs[0]),
    ]
    await db.activity.insert_many([
        {"demo": True, "activity_id": f"demoact_{i}", "poster_id": owner, "job_id": j["job_id"],
         "job_title": j["title"], "kind": kind, "text": text, "created_at": today - timedelta(minutes=15 * i)}
        for i, (kind, text, j) in enumerate(feed)
    ])

    print("Seeded: owner@abodeops.com / cleaner@abodeops.com / client@abodeops.com (pass123)")
    print(f"owner={owner} cleaner={cleaner} client={client}")


asyncio.run(main())
