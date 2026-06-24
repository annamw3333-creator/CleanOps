from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hashlib
import secrets
import math
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import httpx
import stripe
from tax_data import PROVINCES, PAY_FREQUENCIES, compute_paystub, TAX_YEAR

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
ADMIN_EMAIL = "aestheticabodesyyc@gmail.com"

stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
TIER_PRICING = {"pro": 1900, "business": 9900}  # cents / month
_price_cache: dict = {}

async def get_price_id(tier: str) -> str:
    if tier in _price_cache:
        return _price_cache[tier]
    amount = TIER_PRICING[tier]
    lookup = f"abodeops_{tier}_monthly_{amount}"
    existing = stripe.Price.list(lookup_keys=[lookup], limit=1)
    if existing.data:
        _price_cache[tier] = existing.data[0].id
        return existing.data[0].id
    product = stripe.Product.create(name=f"AbodeOps {tier.capitalize()}")
    price = stripe.Price.create(
        product=product.id, unit_amount=amount, currency="usd",
        recurring={"interval": "month"}, lookup_key=lookup,
    )
    _price_cache[tier] = price.id
    return price.id

async def ensure_admin(user: dict) -> dict:
    if user and user.get("email") == ADMIN_EMAIL and (user.get("role") != "admin" or user.get("tier") != "business"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": "admin", "tier": "business"}})
        user["role"] = "admin"
        user["tier"] = "business"
    return user

def with_perks(u: dict) -> dict:
    tier = u.get("tier", "free")
    u["ads_enabled"] = (tier == "free" and u.get("role") != "admin")
    if u.get("role") in ("cleaner", "owner_cleaner"):
        u["profile_complete"] = bool(u.get("experience_summary")) and len(u.get("portfolio", [])) >= 10 and len(u.get("availability", [])) >= 1
    else:
        u["profile_complete"] = True
    return u

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

def job_weekday(date_str: str):
    try:
        return WEEKDAYS[datetime.strptime(date_str[:10], "%Y-%m-%d").weekday()]
    except Exception:
        return None

async def completed_count(cid: str) -> int:
    return await db.jobs.count_documents({"assigned_cleaners": cid, "status": "completed"})

# ---------------- Helpers ----------------
def now_utc():
    return datetime.now(timezone.utc)

def iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt

def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + pw).encode()).hexdigest()
    return f"{salt}${h}"

def verify_password(pw: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$")
        return hashlib.sha256((salt + pw).encode()).hexdigest() == h
    except Exception:
        return False

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

# ---------------- Checklist templates ----------------
PHOTO_ITEMS = [
    {"id": "under_sink", "label": "Under kitchen sink", "photo": True},
    {"id": "inside_fridge", "label": "Inside fridge / freezer", "photo": True},
    {"id": "under_furniture", "label": "Under couches & beds", "photo": True},
    {"id": "full_bathroom", "label": "Full bathroom photo", "photo": True},
    {"id": "full_kitchen", "label": "Full kitchen photo", "photo": True},
]
TASK_ITEMS = {
    "standard": ["Dust all surfaces", "Vacuum & mop floors", "Clean & sanitize bathrooms", "Wipe kitchen counters", "Empty trash bins"],
    "deep": ["Dust all surfaces", "Vacuum & mop floors", "Deep scrub bathrooms", "Clean inside appliances", "Baseboards & vents", "Wipe walls & doors", "Empty trash bins"],
    "airbnb": ["Strip & remake beds", "Restock amenities", "Vacuum & mop floors", "Sanitize bathrooms", "Clean kitchen & dishes", "Stage & final walkthrough"],
}

def build_checklist(clean_type: str):
    tasks = [{"id": f"task_{i}", "label": t, "photo": False, "done": False, "photo_base64": None}
             for i, t in enumerate(TASK_ITEMS.get(clean_type, TASK_ITEMS["standard"]))]
    photos = [{**p, "done": False, "photo_base64": None} for p in PHOTO_ITEMS]
    return tasks + photos

async def geocode_address(address: str):
    """Best-effort geocoding via OpenStreetMap Nominatim (no API key)."""
    if not address:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as hc:
            r = await hc.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1},
                headers={"User-Agent": "AutoAbodes/1.0"},
            )
        if r.status_code == 200 and r.json():
            d = r.json()[0]
            return float(d["lat"]), float(d["lon"])
    except Exception:
        pass
    return None

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["cleaner", "company_owner", "client", "owner_cleaner"] = "client"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleIn(BaseModel):
    session_id: str
    role: Optional[Literal["cleaner", "company_owner", "client"]] = None

class ProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    qualifications: Optional[List[str]] = None
    hourly_rate: Optional[float] = None
    auto_accept: Optional[bool] = None
    experience_summary: Optional[str] = None
    portfolio: Optional[List[str]] = None
    availability: Optional[List[str]] = None
    role: Optional[Literal["cleaner", "company_owner", "client", "owner_cleaner"]] = None

class SubscriptionIn(BaseModel):
    tier: Literal["free", "pro", "business"]

class JobIn(BaseModel):
    title: str
    clean_type: Literal["standard", "deep", "airbnb"] = "standard"
    address: str
    latitude: float
    longitude: float
    date: str
    start_window_from: str
    start_window_to: str
    estimated_duration: float
    client_name: str
    client_notes: Optional[str] = ""
    manager_notes: Optional[str] = ""
    required_qualifications: List[str] = []
    pay_rate: float = 0

class MessageIn(BaseModel):
    text: str

class ReviewIn(BaseModel):
    cleaner_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""

class JobStatusIn(BaseModel):
    status: Literal["pending", "in_progress", "completed", "cancelled"]

class ConversationIn(BaseModel):
    participant_id: str

class TeamIn(BaseModel):
    name: str

class TeamMemberIn(BaseModel):
    cleaner_id: str

# ---------------- Auth dependency ----------------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def create_session(user_id: str, token: Optional[str] = None) -> str:
    token = token or secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return token

# ---------------- Auth routes ----------------
@api_router.post("/auth/register")
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "phone": "", "bio": "", "avatar": "",
        "qualifications": [], "hourly_rate": 0, "auto_accept": False,
        "experience_summary": "", "portfolio": [], "availability": [],
        "tier": "free",
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    doc = await ensure_admin(doc)
    token = await create_session(user_id)
    return {"token": token, "user": with_perks(clean(dict(doc)))}

@api_router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user = await ensure_admin(user)
    token = await create_session(user["user_id"])
    return {"token": token, "user": with_perks(clean(dict(user)))}

@api_router.post("/auth/google")
async def google_auth(body: GoogleIn):
    async with httpx.AsyncClient() as hc:
        r = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        doc = existing
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc = {
            "user_id": user_id, "email": email, "name": data.get("name", email),
            "role": body.role or "client", "password_hash": None,
            "phone": "", "bio": "", "avatar": data.get("picture", ""),
            "qualifications": [], "hourly_rate": 0, "auto_accept": False,
            "experience_summary": "", "portfolio": [], "availability": [],
            "tier": "free",
            "created_at": now_utc(),
        }
        await db.users.insert_one(doc)
    doc = await ensure_admin(doc)
    token = await create_session(user_id, data.get("session_token"))
    return {"token": token, "user": with_perks(clean(dict(doc)))}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user = await ensure_admin(user)
    return {"user": with_perks(clean(dict(user)))}

@api_router.post("/subscription/upgrade")
async def upgrade_subscription(body: SubscriptionIn, user=Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tier": body.tier}})
    updated = await db.users.find_one({"user_id": user["user_id"]})
    return {"user": with_perks(clean(dict(updated)))}

class CheckoutIn(BaseModel):
    tier: Literal["pro", "business"]
    redirect_url: str

@api_router.post("/billing/checkout")
async def create_checkout(body: CheckoutIn, user=Depends(get_current_user)):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    price_id = await get_price_id(body.tier)
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{body.redirect_url}?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.redirect_url}?canceled=1",
        customer_email=user["email"],
        metadata={"user_id": user["user_id"], "tier": body.tier},
        subscription_data={"metadata": {"user_id": user["user_id"], "tier": body.tier}},
    )
    await db.payment_transactions.update_one(
        {"stripe_session_id": session.id},
        {"$setOnInsert": {
            "stripe_session_id": session.id, "user_id": user["user_id"],
            "tier": body.tier, "amount": TIER_PRICING[body.tier], "currency": "usd",
            "status": "pending", "created_at": now_utc(),
        }},
        upsert=True,
    )
    return {"checkout_url": session.url, "session_id": session.id}

@api_router.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user=Depends(get_current_user)):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    s = stripe.checkout.Session.retrieve(session_id)
    txn = await db.payment_transactions.find_one({"stripe_session_id": session_id})
    if txn and txn.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your checkout session")
    paid = s.payment_status == "paid"
    if paid and txn and txn.get("status") != "paid":
        tier = (s.metadata or {}).get("tier") or (txn or {}).get("tier")
        await db.payment_transactions.update_one(
            {"stripe_session_id": session_id, "status": {"$ne": "paid"}},
            {"$set": {"status": "paid", "subscription_id": s.subscription, "updated_at": now_utc()}},
        )
        if tier:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tier": tier}})
    updated = await db.users.find_one({"user_id": user["user_id"]})
    return {"payment_status": s.payment_status, "paid": paid, "user": with_perks(clean(dict(updated)))}

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization.split(" ", 1)[1]})
    return {"ok": True}

@api_router.put("/profile")
async def update_profile(body: ProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "portfolio" in updates and len(updates["portfolio"]) > 25:
        raise HTTPException(status_code=400, detail="You can upload at most 25 photos")
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    updated = await db.users.find_one({"user_id": user["user_id"]})
    return {"user": with_perks(clean(dict(updated)))}

@api_router.get("/geocode")
async def geocode(address: str, user=Depends(get_current_user)):
    coords = await geocode_address(address)
    if not coords:
        raise HTTPException(status_code=404, detail="Could not locate that address")
    return {"latitude": coords[0], "longitude": coords[1]}

@api_router.get("/users")
async def list_users(user=Depends(get_current_user)):
    users = await db.users.find({"user_id": {"$ne": user["user_id"]}}).to_list(200)
    result = []
    for u in users:
        cc = await completed_count(u["user_id"]) if u["role"] in ("cleaner", "owner_cleaner") else 0
        result.append({"user_id": u["user_id"], "name": u["name"], "role": u["role"], "avatar": u.get("avatar", ""),
                       "completed_count": cc})
    return result

@api_router.get("/users/{user_id}")
async def get_public_user(user_id: str, user=Depends(get_current_user)):
    u = await db.users.find_one({"user_id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": u["user_id"], "name": u["name"], "role": u["role"], "avatar": u.get("avatar", ""),
        "phone": u.get("phone", ""), "bio": u.get("bio", ""), "experience_summary": u.get("experience_summary", ""),
        "portfolio": u.get("portfolio", []), "qualifications": u.get("qualifications", []),
        "hourly_rate": u.get("hourly_rate", 0), "availability": u.get("availability", []),
        "completed_count": await completed_count(user_id), "member_since": iso(u.get("created_at")),
        "onboarding_pct": await onboarding_pct(user_id),
    }

class PayrollIn(BaseModel):
    province: str
    hourly_rate: float
    hours_per_week: float
    pay_frequency: Literal["weekly", "biweekly", "semimonthly", "monthly"] = "biweekly"
    worker_type: Literal["employee", "freelancer", "subcontractor"] = "employee"

@api_router.get("/payroll/provinces")
async def payroll_provinces(user=Depends(get_current_user)):
    return {"tax_year": TAX_YEAR,
            "provinces": [{"code": k, "name": v["name"]} for k, v in sorted(PROVINCES.items(), key=lambda x: x[1]["name"])],
            "pay_frequencies": list(PAY_FREQUENCIES.keys())}

@api_router.post("/payroll/calculate")
async def payroll_calculate(body: PayrollIn, user=Depends(get_current_user)):
    try:
        return compute_paystub(body.province, body.hourly_rate, body.hours_per_week, body.pay_frequency, body.worker_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- Jobs ----------------
async def enrich_job(job: dict):
    job = clean(dict(job))
    job.pop("cleaner_locations", None)  # live locations are private; exposed only via /fleet/live to the poster
    assigned = []
    for cid in job.get("assigned_cleaners", []):
        c = await db.users.find_one({"user_id": cid})
        if c:
            assigned.append({"user_id": c["user_id"], "name": c["name"], "avatar": c.get("avatar", ""),
                             "completed_count": await completed_count(c["user_id"])})
    job["assigned_cleaners_info"] = assigned
    return job

async def log_activity(job: dict, kind: str, text: str):
    try:
        await db.activity.insert_one({
            "activity_id": f"act_{uuid.uuid4().hex[:10]}",
            "poster_id": job.get("poster_id"),
            "job_id": job.get("job_id"),
            "job_title": job.get("title"),
            "kind": kind, "text": text, "created_at": now_utc(),
        })
    except Exception:
        pass

def match_score(cleaner: dict, job: dict, completed: int = 0) -> int:
    score = 55
    req = set(job.get("required_qualifications", []))
    have = set(cleaner.get("qualifications", []))
    if req:
        score += int(25 * len(req & have) / len(req))
    else:
        score += 12
    wd = job_weekday(job.get("date", ""))
    avail = cleaner.get("availability", [])
    if wd and avail:
        score += 12 if wd in avail else -15
    elif avail:
        score += 6
    if cleaner.get("experience_summary"):
        score += 6
    if len(cleaner.get("portfolio", [])) >= 10:
        score += 5
    score += min(10, completed * 2)
    return max(20, min(99, score))

@api_router.post("/jobs")
async def create_job(body: JobIn, user=Depends(get_current_user)):
    if user["role"] not in ("company_owner", "client", "owner_cleaner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners or clients can post jobs")
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    data = body.dict()
    coords = await geocode_address(body.address)
    if coords:
        data["latitude"], data["longitude"] = coords
    doc = {
        "job_id": job_id,
        "poster_id": user["user_id"],
        "poster_name": user["name"],
        "poster_role": user["role"],
        **data,
        "status": "pending",
        "assigned_cleaners": [],
        "applicants": [],
        "checklist": build_checklist(body.clean_type),
        "checked_in_at": None,
        "completed_at": None,
        "logged_hours": 0,
        "created_at": now_utc(),
    }
    await db.jobs.insert_one(doc)
    await log_activity(doc, "created", f"New job posted: {body.title}")
    return await enrich_job(doc)

@api_router.get("/jobs")
async def list_jobs(scope: str = "available", status: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if scope == "mine":
        q["poster_id"] = user["user_id"]
    elif scope == "assigned":
        q["assigned_cleaners"] = user["user_id"]
    elif scope == "available":
        # jobs that are pending and not yet assigned; cleaners see ones they qualify for
        q["status"] = "pending"
        q["assigned_cleaners"] = {"$size": 0}
    if status:
        q["status"] = status
    jobs = await db.jobs.find(q).sort("created_at", -1).to_list(300)
    result = []
    for j in jobs:
        if scope == "available" and user["role"] in ("cleaner", "owner_cleaner"):
            req = set(j.get("required_qualifications", []))
            mine = set(user.get("qualifications", []))
            if not req.issubset(mine):
                continue
        result.append(await enrich_job(j))
    return result

@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    enriched = await enrich_job(job)
    # attach applicant info
    apps = []
    for aid in job.get("applicants", []):
        c = await db.users.find_one({"user_id": aid})
        if c:
            cc = await completed_count(c["user_id"])
            apps.append({"user_id": c["user_id"], "name": c["name"], "avatar": c.get("avatar", ""),
                         "qualifications": c.get("qualifications", []), "hourly_rate": c.get("hourly_rate", 0),
                         "bio": c.get("bio", ""), "experience_summary": c.get("experience_summary", ""),
                         "portfolio": c.get("portfolio", []), "completed_count": cc,
                         "match_score": match_score(c, job, cc)})
    apps.sort(key=lambda a: a["match_score"], reverse=True)
    enriched["applicants_info"] = apps
    return enriched

@api_router.post("/jobs/{job_id}/apply")
async def apply_job(job_id: str, user=Depends(get_current_user)):
    if user["role"] not in ("cleaner", "owner_cleaner", "admin"):
        raise HTTPException(status_code=403, detail="Only cleaners can apply")
    if user["role"] in ("cleaner", "owner_cleaner") and not (user.get("experience_summary") and len(user.get("portfolio", [])) >= 10 and len(user.get("availability", [])) >= 1):
        raise HTTPException(status_code=400, detail="Complete your profile: add an experience summary, at least 10 work photos, and your availability before applying")
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    wd = job_weekday(job.get("date", ""))
    if wd and wd not in user.get("availability", []):
        raise HTTPException(status_code=400, detail=f"You are not available on {wd}. Update your availability to take this job.")
    req = set(job.get("required_qualifications", []))
    mine = set(user.get("qualifications", []))
    if not req.issubset(mine):
        raise HTTPException(status_code=403, detail="You don't meet the required qualifications")
    # auto-accept: if cleaner has auto_accept and no other applicant, assign directly
    if user.get("auto_accept") and not job.get("assigned_cleaners"):
        await db.jobs.update_one({"job_id": job_id}, {
            "$addToSet": {"assigned_cleaners": user["user_id"]},
            "$pull": {"applicants": user["user_id"]},
        })
        return {"status": "assigned", "auto_accepted": True}
    await db.jobs.update_one({"job_id": job_id}, {"$addToSet": {"applicants": user["user_id"]}})
    return {"status": "applied", "auto_accepted": False}

@api_router.post("/jobs/{job_id}/assign")
async def assign_job(job_id: str, body: TeamMemberIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or (job["poster_id"] != user["user_id"] and user["role"] != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    cleaner = await db.users.find_one({"user_id": body.cleaner_id})
    wd = job_weekday(job.get("date", ""))
    if cleaner and wd and wd not in cleaner.get("availability", []):
        raise HTTPException(status_code=400, detail=f"{cleaner['name']} is not available on {wd}")
    await db.jobs.update_one({"job_id": job_id}, {
        "$addToSet": {"assigned_cleaners": body.cleaner_id},
        "$pull": {"applicants": body.cleaner_id},
    })
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

class JobRespondIn(BaseModel):
    action: Literal["accept", "decline", "info"]

@api_router.post("/jobs/{job_id}/respond")
async def respond_job(job_id: str, body: JobRespondIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="You are not assigned to this job")
    if body.action == "decline":
        await db.jobs.update_one({"job_id": job_id}, {
            "$pull": {"assigned_cleaners": user["user_id"]},
            "$set": {f"cleaner_responses.{user['user_id']}": "declined"},
        })
    else:
        status = "accepted" if body.action == "accept" else "info_requested"
        await db.jobs.update_one({"job_id": job_id}, {"$set": {f"cleaner_responses.{user['user_id']}": status}})
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

@api_router.post("/jobs/{job_id}/status")
async def set_job_status(job_id: str, body: JobStatusIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or (job["poster_id"] != user["user_id"] and user["role"] != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    updates = {"status": body.status}
    if body.status == "in_progress" and not job.get("checked_in_at"):
        updates["checked_in_at"] = now_utc()
    if body.status == "completed":
        updates["completed_at"] = now_utc()
    await db.jobs.update_one({"job_id": job_id}, {"$set": updates})
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or (job["poster_id"] != user["user_id"] and user["role"] != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.jobs.delete_one({"job_id": job_id})
    return {"ok": True}

@api_router.post("/jobs/{job_id}/checkin")
async def checkin_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="Not assigned to this job")
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"status": "in_progress", "checked_in_at": now_utc()}})
    await log_activity(job, "arrived", f"{user['name']} arrived on site at {job.get('title')}")
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

class ChecklistItemIn(BaseModel):
    item_id: str
    done: Optional[bool] = None
    photo_base64: Optional[str] = None

@api_router.post("/jobs/{job_id}/checklist")
async def update_checklist(job_id: str, body: ChecklistItemIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="Not assigned to this job")
    checklist = job.get("checklist", [])
    for item in checklist:
        if item["id"] == body.item_id:
            if body.photo_base64 is not None:
                item["photo_base64"] = body.photo_base64
                item["done"] = True
            if body.done is not None:
                item["done"] = body.done
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"checklist": checklist}})
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

@api_router.post("/jobs/{job_id}/complete")
async def complete_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="Not assigned to this job")
    incomplete = [i for i in job.get("checklist", []) if not i.get("done")]
    if incomplete:
        raise HTTPException(status_code=400, detail=f"{len(incomplete)} checklist items incomplete")
    hours = job.get("estimated_duration", 0)
    checked_in = job.get("checked_in_at")
    if checked_in:
        if isinstance(checked_in, datetime):
            if checked_in.tzinfo is None:
                checked_in = checked_in.replace(tzinfo=timezone.utc)
            hours = round((now_utc() - checked_in).total_seconds() / 3600, 2) or job.get("estimated_duration", 0)
    pay = round(hours * job.get("pay_rate", 0), 2)
    await db.jobs.update_one({"job_id": job_id}, {
        "$set": {"status": "completed", "completed_at": now_utc(), "logged_hours": hours, "logged_pay": pay,
                 "tracking": False, f"cleaner_locations.{user['user_id']}.phase": "completed",
                 f"cleaner_locations.{user['user_id']}.at": now_utc()}})
    # log to hours collection
    await db.hours_log.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "cleaner_id": user["user_id"], "job_id": job_id,
        "job_title": job.get("title"), "hours": hours, "pay": pay, "date": now_utc(),
    })
    await log_activity(job, "completed", f"{job.get('title')} completed by {user['name']}")
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

# ---------------- Stats ----------------
@api_router.get("/stats")
async def stats(user=Depends(get_current_user)):
    if user["role"] == "cleaner":
        logs = await db.hours_log.find({"cleaner_id": user["user_id"]}).to_list(1000)
        total_hours = round(sum(l["hours"] for l in logs), 2)
        total_pay = round(sum(l["pay"] for l in logs), 2)
        assigned = await db.jobs.count_documents({"assigned_cleaners": user["user_id"], "status": {"$ne": "completed"}})
        completed = await db.jobs.count_documents({"assigned_cleaners": user["user_id"], "status": "completed"})
        return {"total_hours": total_hours, "total_pay": total_pay, "upcoming": assigned, "completed": completed,
                "logs": [{"job_title": l["job_title"], "hours": l["hours"], "pay": l["pay"], "date": iso(l["date"])} for l in sorted(logs, key=lambda x: x["date"], reverse=True)[:20]]}
    else:
        pending = await db.jobs.count_documents({"poster_id": user["user_id"], "status": "pending"})
        in_progress = await db.jobs.count_documents({"poster_id": user["user_id"], "status": "in_progress"})
        completed = await db.jobs.count_documents({"poster_id": user["user_id"], "status": "completed"})
        return {"pending": pending, "in_progress": in_progress, "completed": completed}

# ---------------- Teams ----------------
@api_router.post("/teams")
async def create_team(body: TeamIn, user=Depends(get_current_user)):
    team_id = f"team_{uuid.uuid4().hex[:10]}"
    doc = {"team_id": team_id, "name": body.name, "owner_id": user["user_id"], "members": [], "created_at": now_utc()}
    await db.teams.insert_one(doc)
    return clean(dict(doc))

@api_router.get("/teams/mine")
async def my_teams(user=Depends(get_current_user)):
    teams = await db.teams.find({"$or": [{"owner_id": user["user_id"]}, {"members": user["user_id"]}]}).to_list(100)
    result = []
    for t in teams:
        members = []
        for mid in t.get("members", []):
            c = await db.users.find_one({"user_id": mid})
            if c:
                members.append({"user_id": c["user_id"], "name": c["name"], "avatar": c.get("avatar", "")})
        tc = clean(dict(t))
        tc["members_info"] = members
        result.append(tc)
    return result

@api_router.post("/teams/{team_id}/members")
async def add_member(team_id: str, body: TeamMemberIn, user=Depends(get_current_user)):
    team = await db.teams.find_one({"team_id": team_id})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.teams.update_one({"team_id": team_id}, {"$addToSet": {"members": body.cleaner_id}})
    return {"ok": True}

# ---------------- Chat ----------------
@api_router.get("/conversations")
async def list_conversations(user=Depends(get_current_user)):
    convos = await db.conversations.find({"participants": user["user_id"]}).sort("updated_at", -1).to_list(100)
    result = []
    for c in convos:
        other_id = next((p for p in c["participants"] if p != user["user_id"]), None)
        other = await db.users.find_one({"user_id": other_id}) if other_id else None
        cc = clean(dict(c))
        cc["other"] = {"user_id": other["user_id"], "name": other["name"], "avatar": other.get("avatar", "")} if other else None
        result.append(cc)
    return result

@api_router.post("/conversations")
async def create_conversation(body: ConversationIn, user=Depends(get_current_user)):
    existing = await db.conversations.find_one({"participants": {"$all": [user["user_id"], body.participant_id], "$size": 2}})
    if existing:
        return clean(dict(existing))
    conv_id = f"conv_{uuid.uuid4().hex[:10]}"
    doc = {"conv_id": conv_id, "participants": [user["user_id"], body.participant_id],
           "last_message": "", "created_at": now_utc(), "updated_at": now_utc()}
    await db.conversations.insert_one(doc)
    return clean(dict(doc))

@api_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, user=Depends(get_current_user)):
    msgs = await db.messages.find({"conv_id": conv_id}).sort("created_at", 1).to_list(500)
    return [{"message_id": m["message_id"], "conv_id": m["conv_id"], "sender_id": m["sender_id"],
             "text": m["text"], "created_at": iso(m["created_at"])} for m in msgs]

@api_router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageIn, user=Depends(get_current_user)):
    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    doc = {"message_id": msg_id, "conv_id": conv_id, "sender_id": user["user_id"],
           "text": body.text, "created_at": now_utc()}
    await db.messages.insert_one(doc)
    await db.conversations.update_one({"conv_id": conv_id}, {"$set": {"last_message": body.text, "updated_at": now_utc()}})
    return {"message_id": msg_id, "conv_id": conv_id, "sender_id": user["user_id"], "text": body.text, "created_at": iso(doc["created_at"])}

@api_router.post("/jobs/{job_id}/review")
async def review_cleaner(job_id: str, body: ReviewIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or job["poster_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the job poster can review")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="You can only review completed jobs")
    if body.cleaner_id not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=400, detail="That cleaner was not assigned to this job")
    await db.reviews.update_one(
        {"job_id": job_id, "cleaner_id": body.cleaner_id, "reviewer_id": user["user_id"]},
        {
            "$set": {
                "job_title": job.get("title"),
                "reviewer_name": user["name"], "rating": body.rating,
                "comment": body.comment or "", "updated_at": now_utc(),
            },
            "$setOnInsert": {
                "review_id": f"rev_{uuid.uuid4().hex[:10]}",
                "job_id": job_id, "cleaner_id": body.cleaner_id,
                "reviewer_id": user["user_id"], "created_at": now_utc(),
            },
        },
        upsert=True,
    )
    # recompute aggregate
    revs = await db.reviews.find({"cleaner_id": body.cleaner_id}).to_list(1000)
    count = len(revs)
    avg = round(sum(r["rating"] for r in revs) / count, 1) if count else 0
    await db.users.update_one({"user_id": body.cleaner_id}, {"$set": {"avg_rating": avg, "review_count": count}})
    return {"avg_rating": avg, "review_count": count}

@api_router.get("/users/{cleaner_id}/reviews")
async def get_reviews(cleaner_id: str, user=Depends(get_current_user)):
    if user["user_id"] != cleaner_id:
        raise HTTPException(status_code=403, detail="Ratings are private to the cleaner")
    revs = await db.reviews.find({"cleaner_id": cleaner_id}).sort("created_at", -1).to_list(200)
    target = await db.users.find_one({"user_id": cleaner_id})
    return {
        "avg_rating": round((target or {}).get("avg_rating", 0), 1),
        "review_count": (target or {}).get("review_count", 0),
        "reviews": [{"review_id": r["review_id"], "reviewer_name": r["reviewer_name"], "rating": r["rating"],
                     "comment": r.get("comment", ""), "job_title": r.get("job_title", ""),
                     "created_at": iso(r["created_at"])} for r in revs],
    }

@api_router.get("/")
async def root():
    return {"message": "AbodeOps API"}

# ---------------- Onboarding & Quizzes ----------------
class QuizQuestion(BaseModel):
    q: str
    options: List[str]
    answer: int

class OnboardingItemIn(BaseModel):
    title: str
    type: Literal["document", "quiz"]
    content: Optional[str] = ""
    questions: Optional[List[QuizQuestion]] = []

@api_router.post("/onboarding")
async def create_onboarding(body: OnboardingItemIn, user=Depends(get_current_user)):
    if user["role"] not in ("company_owner", "owner_cleaner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners can create onboarding")
    item_id = f"ob_{uuid.uuid4().hex[:10]}"
    doc = {"item_id": item_id, "owner_id": user["user_id"], "title": body.title, "type": body.type,
           "content": body.content or "", "questions": [q.dict() for q in (body.questions or [])],
           "created_at": now_utc()}
    await db.onboarding.insert_one(doc)
    return clean(dict(doc))

@api_router.get("/onboarding")
async def list_onboarding(user=Depends(get_current_user)):
    items = await db.onboarding.find().sort("created_at", 1).to_list(200)
    out = []
    for it in items:
        it = clean(dict(it))
        prog = await db.onboarding_progress.find_one({"cleaner_id": user["user_id"], "item_id": it["item_id"]})
        it["completed"] = bool(prog and prog.get("completed"))
        it["score"] = prog.get("score") if prog else None
        it["total"] = prog.get("total") if prog else None
        # hide answers from non-owners
        if user["role"] not in ("company_owner", "owner_cleaner", "admin"):
            for q in it.get("questions", []):
                q.pop("answer", None)
        out.append(it)
    return out

class OnboardingCompleteIn(BaseModel):
    answers: Optional[List[int]] = []

@api_router.post("/onboarding/{item_id}/complete")
async def complete_onboarding(item_id: str, body: OnboardingCompleteIn, user=Depends(get_current_user)):
    item = await db.onboarding.find_one({"item_id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    score = total = None
    if item["type"] == "quiz":
        qs = item.get("questions", [])
        total = len(qs)
        score = sum(1 for i, q in enumerate(qs) if i < len(body.answers) and body.answers[i] == q.get("answer"))
    await db.onboarding_progress.update_one(
        {"cleaner_id": user["user_id"], "item_id": item_id},
        {"$set": {"cleaner_id": user["user_id"], "item_id": item_id, "completed": True,
                  "score": score, "total": total, "updated_at": now_utc()}},
        upsert=True)
    return {"completed": True, "score": score, "total": total}

async def onboarding_pct(cleaner_id: str) -> int:
    total = await db.onboarding.count_documents({})
    if not total:
        return 0
    done = len(await db.onboarding_progress.find({"cleaner_id": cleaner_id, "completed": True}).to_list(500))
    return round(done / total * 100)

# ---------------- Client feedback link ----------------
@api_router.post("/jobs/{job_id}/feedback-link")
async def create_feedback_link(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or (job["poster_id"] != user["user_id"] and user["role"] != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    token = job.get("feedback_token") or secrets.token_urlsafe(9)
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"feedback_token": token}})
    return {"token": token}

@api_router.get("/public/feedback/{token}")
async def public_feedback_get(token: str):
    job = await db.jobs.find_one({"feedback_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid link")
    cleaners = []
    for cid in job.get("assigned_cleaners", []):
        c = await db.users.find_one({"user_id": cid})
        if c:
            cleaners.append(c["name"])
    return {"job_title": job.get("title"), "address": job.get("address"), "date": job.get("date"),
            "cleaners": cleaners, "submitted": bool(job.get("client_feedback"))}

class PublicFeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""
    client_name: Optional[str] = ""

@api_router.post("/public/feedback/{token}")
async def public_feedback_post(token: str, body: PublicFeedbackIn):
    job = await db.jobs.find_one({"feedback_token": token})
    if not job:
        raise HTTPException(status_code=404, detail="Invalid link")
    await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {"client_feedback": {
        "rating": body.rating, "comment": body.comment or "", "client_name": body.client_name or "Client",
        "created_at": iso(now_utc())}}})
    await log_activity(job, "feedback", f"Client left {body.rating}★ feedback on {job.get('title')}")
    return {"ok": True}

# ---------------- Client list ----------------
def freq_label(count: int, span_days: int) -> str:
    if count <= 1:
        return "One-time"
    interval = span_days / (count - 1) if count > 1 else 0
    if interval <= 0:
        return "Recurring"
    if interval <= 10:
        return "Weekly"
    if interval <= 20:
        return "Bi-weekly"
    if interval <= 45:
        return "Monthly"
    return "Occasional"

class ClientNotesIn(BaseModel):
    key: str
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

@api_router.get("/clients")
async def list_clients(user=Depends(get_current_user)):
    is_cleaner = user["role"] == "cleaner"
    groups: dict = {}
    if is_cleaner:
        jobs = await db.jobs.find({"assigned_cleaners": user["user_id"]}).to_list(2000)
        for j in jobs:
            key = j.get("poster_id") or (j.get("poster_name") or "Client")
            groups.setdefault(key, {"name": j.get("poster_name", "Client"), "jobs": []})["jobs"].append(j)
    else:
        jobs = await db.jobs.find({"poster_id": user["user_id"]}).to_list(2000)
        for j in jobs:
            name = (j.get("client_name") or "Client").strip() or "Client"
            groups.setdefault(name.lower(), {"name": name, "jobs": []})["jobs"].append(j)

    result = []
    for key, g in groups.items():
        gjobs = g["jobs"]
        count = len(gjobs)
        created = sorted([j.get("created_at") for j in gjobs if j.get("created_at")])
        first = created[0] if created else None
        valid_dates = []
        for j in gjobs:
            ds = j.get("date")
            if ds:
                try:
                    valid_dates.append(datetime.strptime(ds[:10], "%Y-%m-%d"))
                except Exception:
                    pass
        span_days = (max(valid_dates) - min(valid_dates)).days if len(valid_dates) >= 2 else 0
        clean_types: dict = {}
        addresses = set()
        cleaner_ids = set()
        for j in gjobs:
            ct = j.get("clean_type", "standard")
            clean_types[ct] = clean_types.get(ct, 0) + 1
            if j.get("address"):
                addresses.add(j["address"])
            for cid in j.get("assigned_cleaners", []):
                cleaner_ids.add(cid)
        primary_type = max(clean_types, key=clean_types.get) if clean_types else "standard"
        cleaners = []
        for cid in cleaner_ids:
            c = await db.users.find_one({"user_id": cid})
            if c:
                cleaners.append(c["name"])
        prof = await db.client_profiles.find_one({"owner_id": user["user_id"], "key": str(key)})
        # for cleaners, contact info comes from the poster user record if available
        contact_phone = (prof or {}).get("phone", "")
        contact_email = (prof or {}).get("email", "")
        if is_cleaner and not contact_phone:
            poster = await db.users.find_one({"user_id": key}) if isinstance(key, str) else None
            if poster:
                contact_phone = poster.get("phone", "")
                contact_email = poster.get("email", "")
        result.append({
            "key": str(key),
            "name": g["name"],
            "job_count": count,
            "completed": sum(1 for j in gjobs if j.get("status") == "completed"),
            "member_since": iso(first),
            "frequency": freq_label(count, span_days),
            "clean_type": primary_type,
            "addresses": sorted(addresses),
            "cleaners": sorted(set(cleaners)),
            "phone": contact_phone,
            "email": contact_email,
            "notes": (prof or {}).get("notes", ""),
            "is_company": is_cleaner,
        })
    result.sort(key=lambda x: (x["job_count"], x["name"]), reverse=True)
    return result

@api_router.put("/clients/notes")
async def update_client_notes(body: ClientNotesIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in {"phone": body.phone, "email": body.email, "notes": body.notes}.items() if v is not None}
    await db.client_profiles.update_one(
        {"owner_id": user["user_id"], "key": body.key},
        {"$set": {**updates, "owner_id": user["user_id"], "key": body.key, "updated_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}

# ---------------- Driver mode (Uber-style) ----------------
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _aware(dt):
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

class DriverStatusIn(BaseModel):
    online: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None

@api_router.post("/driver/status")
async def driver_status(body: DriverStatusIn, user=Depends(get_current_user)):
    updates = {"is_online": body.online}
    if body.online:
        updates["online_since"] = now_utc()
    if body.latitude is not None:
        updates["last_lat"] = body.latitude
    if body.longitude is not None:
        updates["last_lng"] = body.longitude
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"online": body.online}

@api_router.get("/driver/earnings")
async def driver_earnings(user=Depends(get_current_user)):
    logs = await db.hours_log.find({"cleaner_id": user["user_id"]}).to_list(2000)
    now = now_utc()
    today = week = total = 0.0
    jobs_today = 0
    for l in logs:
        d = _aware(l.get("date"))
        pay = l.get("pay", 0)
        total += pay
        if isinstance(d, datetime):
            if d.date() == now.date():
                today += pay
                jobs_today += 1
            if (now - d).days < 7:
                week += pay
    return {"today": round(today, 2), "week": round(week, 2), "total": round(total, 2),
            "jobs_today": jobs_today, "is_online": bool(user.get("is_online"))}

@api_router.get("/driver/offers")
async def driver_offers(lat: Optional[float] = None, lng: Optional[float] = None,
                        radius_km: float = 75.0, limit: int = 25, user=Depends(get_current_user)):
    if user["role"] not in ("cleaner", "owner_cleaner", "admin"):
        raise HTTPException(status_code=403, detail="Driver mode is for cleaners")
    clat = lat if lat is not None else user.get("last_lat")
    clng = lng if lng is not None else user.get("last_lng")
    jobs = await db.jobs.find({"status": "pending", "assigned_cleaners": {"$size": 0}}).sort("created_at", -1).to_list(300)
    mine_quals = set(user.get("qualifications", []))
    avail = user.get("availability", [])
    offers = []
    for j in jobs:
        if user["user_id"] in j.get("declined_by", []):
            continue
        req = set(j.get("required_qualifications", []))
        if not req.issubset(mine_quals):
            continue
        wd = job_weekday(j.get("date", ""))
        if wd and avail and wd not in avail:
            continue
        dist = None
        if clat is not None and clng is not None and j.get("latitude") and j.get("longitude"):
            try:
                dist = round(haversine_km(clat, clng, j["latitude"], j["longitude"]), 1)
            except Exception:
                dist = None
            # skip jobs outside the search radius when we know the distance
            if dist is not None and dist > radius_km:
                continue
        ej = await enrich_job(j)
        ej["distance_km"] = dist
        ej["est_earnings"] = round(j.get("estimated_duration", 0) * j.get("pay_rate", 0), 2)
        offers.append(ej)
    offers.sort(key=lambda x: (x["distance_km"] is None, x["distance_km"] if x["distance_km"] is not None else 0))
    return offers[:limit]

@api_router.post("/driver/decline/{job_id}")
async def driver_decline(job_id: str, user=Depends(get_current_user)):
    await db.jobs.update_one({"job_id": job_id}, {"$addToSet": {"declined_by": user["user_id"]}})
    return {"ok": True}

@api_router.post("/jobs/{job_id}/grab")
async def grab_job(job_id: str, user=Depends(get_current_user)):
    if user["role"] not in ("cleaner", "owner_cleaner", "admin"):
        raise HTTPException(status_code=403, detail="Only cleaners can accept jobs")
    if user["role"] in ("cleaner", "owner_cleaner") and not (user.get("experience_summary") and len(user.get("portfolio", [])) >= 10 and len(user.get("availability", [])) >= 1):
        raise HTTPException(status_code=400, detail="Complete your profile (experience, 10+ photos, availability) before accepting jobs")
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("assigned_cleaners"):
        raise HTTPException(status_code=409, detail="This job was just taken by another cleaner")
    req = set(job.get("required_qualifications", []))
    if not req.issubset(set(user.get("qualifications", []))):
        raise HTTPException(status_code=403, detail="You don't meet the required qualifications")
    wd = job_weekday(job.get("date", ""))
    if wd and user.get("availability") and wd not in user.get("availability", []):
        raise HTTPException(status_code=400, detail=f"You are not available on {wd}")
    res = await db.jobs.update_one(
        {"job_id": job_id, "assigned_cleaners": {"$size": 0}},
        {"$addToSet": {"assigned_cleaners": user["user_id"]}, "$pull": {"applicants": user["user_id"]},
         "$set": {f"cleaner_responses.{user['user_id']}": "accepted"}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="This job was just taken by another cleaner")
    updated = await db.jobs.find_one({"job_id": job_id})
    return await enrich_job(updated)

# ---------------- Live location tracking (private to job poster) ----------------
class LocationIn(BaseModel):
    latitude: float
    longitude: float

async def _set_job_location(job_id: str, user: dict, phase: str, lat=None, lng=None):
    upd = {
        f"cleaner_locations.{user['user_id']}.phase": phase,
        f"cleaner_locations.{user['user_id']}.at": now_utc(),
        f"cleaner_locations.{user['user_id']}.name": user["name"],
    }
    if lat is not None:
        upd[f"cleaner_locations.{user['user_id']}.lat"] = lat
    if lng is not None:
        upd[f"cleaner_locations.{user['user_id']}.lng"] = lng
    await db.jobs.update_one({"job_id": job_id}, {"$set": upd})

@api_router.post("/jobs/{job_id}/enroute")
async def enroute_job(job_id: str, body: LocationIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="Not assigned to this job")
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"enroute_at": now_utc(), "tracking": True}})
    await _set_job_location(job_id, user, "enroute", body.latitude, body.longitude)
    await log_activity(job, "enroute", f"{user['name']} is on the way to {job.get('title')}")
    return await enrich_job(await db.jobs.find_one({"job_id": job_id}))

@api_router.post("/jobs/{job_id}/location")
async def ping_job_location(job_id: str, body: LocationIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job or user["user_id"] not in job.get("assigned_cleaners", []):
        raise HTTPException(status_code=403, detail="Not assigned to this job")
    existing = (job.get("cleaner_locations", {}) or {}).get(user["user_id"], {}) or {}
    phase = "on_site" if job.get("status") == "in_progress" else (existing.get("phase") or "enroute")
    await _set_job_location(job_id, user, phase, body.latitude, body.longitude)
    return {"ok": True}

@api_router.get("/fleet/live")
async def live_jobs(user=Depends(get_current_user)):
    if user["role"] not in ("company_owner", "owner_cleaner", "client", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    q = {} if user["role"] == "admin" else {"poster_id": user["user_id"]}
    q["status"] = {"$in": ["pending", "in_progress"]}
    jobs = await db.jobs.find(q).sort("created_at", -1).to_list(300)
    cutoff = now_utc() - timedelta(minutes=60)
    out = []
    for j in jobs:
        live = []
        for uid, loc in (j.get("cleaner_locations", {}) or {}).items():
            if loc.get("phase") == "completed" or loc.get("lat") is None or loc.get("lng") is None:
                continue
            at = _aware(loc.get("at"))
            if isinstance(at, datetime) and at < cutoff:
                continue
            live.append({"user_id": uid, "name": loc.get("name", "Cleaner"),
                         "latitude": loc.get("lat"), "longitude": loc.get("lng"),
                         "phase": loc.get("phase", "enroute"), "updated_at": iso(at)})
        ej = await enrich_job(j)
        ej["live_cleaners"] = live
        out.append(ej)
    return out

# ---------------- Activity feed, metrics & add-ons ----------------
@api_router.get("/activity")
async def get_activity(user=Depends(get_current_user)):
    q = {} if user["role"] == "admin" else {"poster_id": user["user_id"]}
    acts = await db.activity.find(q).sort("created_at", -1).to_list(40)
    return [{"activity_id": a["activity_id"], "kind": a.get("kind"), "text": a.get("text"),
             "job_id": a.get("job_id"), "job_title": a.get("job_title"),
             "created_at": iso(a.get("created_at"))} for a in acts]

@api_router.get("/metrics")
async def get_metrics(user=Depends(get_current_user)):
    if user["role"] not in ("company_owner", "owner_cleaner", "client", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    q = {} if user["role"] == "admin" else {"poster_id": user["user_id"]}
    jobs = await db.jobs.find(q).to_list(3000)
    now = now_utc()
    revenue_today = 0.0
    payroll_owed = 0.0
    completed_today = 0
    completed_total = 0
    active_cleaner_ids = set()
    for j in jobs:
        if j.get("status") == "completed":
            completed_total += 1
            payroll_owed += j.get("logged_pay") or round(j.get("estimated_duration", 0) * j.get("pay_rate", 0), 2)
            ca = _aware(j.get("completed_at"))
            if isinstance(ca, datetime) and ca.date() == now.date():
                completed_today += 1
                revenue_today += round(j.get("estimated_duration", 0) * j.get("pay_rate", 0), 2)
        if j.get("status") in ("pending", "in_progress"):
            for cid in j.get("assigned_cleaners", []):
                active_cleaner_ids.add(cid)
    return {"revenue_today": round(revenue_today, 2), "payroll_owed": round(payroll_owed, 2),
            "active_cleaners": len(active_cleaner_ids), "completed_today": completed_today,
            "completed_total": completed_total}

class AddonIn(BaseModel):
    name: str

@api_router.post("/jobs/{job_id}/addon")
async def request_addon(job_id: str, body: AddonIn, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    allowed = user["role"] == "admin" or job["poster_id"] == user["user_id"] or user["user_id"] in job.get("assigned_cleaners", [])
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.jobs.update_one({"job_id": job_id}, {"$addToSet": {"addons": body.name}})
    await log_activity(job, "addon", f"{body.name} add-on requested for {job.get('title')}")
    return await enrich_job(await db.jobs.find_one({"job_id": job_id}))

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
