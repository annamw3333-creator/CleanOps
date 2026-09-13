# CleanOps

Operations hub for cleaning companies, cleaners, homeowners, and landlords.
Expo / React Native frontend + FastAPI backend + MongoDB.

## What you need

- Node.js 20+ and Yarn 1.22 (the frontend pins `yarn@1.22.22`)
- Python 3.11+
- MongoDB 6+ running locally (or a MongoDB Atlas URI)

Optional (features no-op without them):

- Stripe keys — subscriptions / checkout
- Twilio — SMS
- Resend — email

## 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then edit MONGO_URL / DB_NAME
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

API lives at `http://localhost:8000/api`.
Docs: `http://localhost:8000/docs`.

Seed demo users (Calgary sample jobs):

```bash
cd backend
python seed_demo.py
```

| Role | Email | Password |
|---|---|---|
| Company owner | owner@abodeops.com | pass123 |
| Cleaner | cleaner@abodeops.com | pass123 |
| Client | client@abodeops.com | pass123 |

## 2. Frontend

```bash
cd frontend
cp .env.example .env
yarn install
yarn start
```

Then:

- press `w` for web
- scan the QR code with Expo Go on a phone (same Wi-Fi)
- `yarn ios` / `yarn android` if you have simulators

`EXPO_PUBLIC_BACKEND_URL` must be reachable from the device. On a physical phone use your computer's LAN IP, not `localhost`:

```
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.10:8000
```

## 3. Tests

Backend tests hit a **running** API (they are HTTP integration tests, not in-process).

```bash
cd backend
export EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
export MONGO_URL=mongodb://localhost:27017
export DB_NAME=cleanops
pytest -q
```

Stripe checkout tests expect a test-mode `STRIPE_API_KEY` in `backend/.env`.

## Repo layout

```
backend/          FastAPI app (server.py), seed, pytest
frontend/         Expo Router app (app/), shared UI (src/)
design_guidelines.json
```

## Notes

- SMS and email are skipped cleanly when Twilio / Resend keys are missing.
- There is an older snapshot repo `CleanOps070626`; this repo is the current app.
- Open PR #1 adds a Deno workflow that does not match this stack. Prefer the Python/Expo commands above.
