from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hashlib
import secrets
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
TIER_PRICING = {"pro": 1900, "business": 4900}  # cents / month
_price_cache: dict = {}

async def get_price_id(tier: str) -> str:
    if tier in _price_cache:
        return _price_cache[tier]
    amount = TIER_PRICING[tier]
    lookup = f"auto_abodes_{tier}_monthly"
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
    assigned = []
    for cid in job.get("assigned_cleaners", []):
        c = await db.users.find_one({"user_id": cid})
        if c:
            assigned.append({"user_id": c["user_id"], "name": c["name"], "avatar": c.get("avatar", ""),
                             "completed_count": await completed_count(c["user_id"])})
    job["assigned_cleaners_info"] = assigned
    return job

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
            apps.append({"user_id": c["user_id"], "name": c["name"], "avatar": c.get("avatar", ""),
                         "qualifications": c.get("qualifications", []), "hourly_rate": c.get("hourly_rate", 0),
                         "bio": c.get("bio", ""), "experience_summary": c.get("experience_summary", ""),
                         "portfolio": c.get("portfolio", []), "completed_count": await completed_count(c["user_id"])})
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
        "$set": {"status": "completed", "completed_at": now_utc(), "logged_hours": hours, "logged_pay": pay}})
    # log to hours collection
    await db.hours_log.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "cleaner_id": user["user_id"], "job_id": job_id,
        "job_title": job.get("title"), "hours": hours, "pay": pay, "date": now_utc(),
    })
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
