# CleanOps

**Multi-tenant field service ops** for cleaning companies — jobs, teams, live location, checklists, and payroll estimates in one Expo + FastAPI stack.

Live: [clean0ps.com](https://clean0ps.com) · App: [app.clean0ps.com](https://app.clean0ps.com)  
Portfolio: [annabuildsai.com](https://annabuildsai.com)

Built by Anna Walker while running **Aesthetic Abodes** (Calgary-area cleaning) — CleanOps is the ops layer that grew out of that day-to-day work, not a generic template.

## Stack

| Layer | Tech |
|-------|------|
| Mobile / web | **Expo Router** + React Native (`frontend/`) |
| API | **FastAPI** + Motor (`backend/server.py`) |
| Data | **MongoDB** |
| Optional | Stripe (subscriptions), Twilio (SMS), Resend (email) |

## Features (in this repo)

Honest to the current codebase:

- **Jobs & dispatch** — create, assign, grab/apply, status, check-in / complete, add-ons
- **Live location** — en-route + location pings; fleet live map for posters (`/fleet/live`, Live Map screen)
- **Teams & clients** — company teams, cleaner profiles, client notes
- **Checklists & photo QA** — clean-type templates, task + photo items on jobs
- **Availability** — day windows / schedule on cleaner profiles
- **Payroll helpers** — province tax tables + `POST /api/payroll/calculate`; ops reconcile for hours owed
- **Driver / marketplace slice** — offers, earnings, decline flows for independent cleaners
- **Billing** — Stripe Checkout for plan upgrades (no-ops without keys)
- **SMS** — Twilio hooks when configured; skipped cleanly when not
- **Public booking / feedback** — tokenized public book + feedback links

Optional integrations are env-gated — missing Stripe/Twilio/Resend keys disable those paths rather than crashing.

## Quick start

### Requirements

- Node.js 20+ and Yarn 1.22
- Python 3.11+
- MongoDB 6+ (local or Atlas)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# set MONGO_URL, DB_NAME; leave Stripe/Twilio empty for local core flows
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

- API: `http://localhost:8000/api`
- Docs: `http://localhost:8000/docs`

Seed Calgary demo users:

```bash
cd backend && python seed_demo.py
```

| Role | Email | Password |
|------|-------|----------|
| Company owner | owner@cleanops.demo | CleanOps123! |
| Cleaner | cleaner@cleanops.demo | CleanOps123! |
| Client | client@cleanops.demo | CleanOps123! |

### Frontend

```bash
cd frontend
yarn install
yarn start
```

Set `EXPO_PUBLIC_BACKEND_URL` to a host the device can reach (LAN IP on a phone — not `localhost`).

## Repo layout

```
backend/     FastAPI app (server.py), seed_demo.py, pytest
frontend/    Expo Router app (app/), shared UI (src/)
```

## Notes

- An older Emergent export lives in a **private archived** repo (`CleanOps070626`) — this repo is the public, hire-facing app.
- Keep secrets in `.env` only (gitignored). Never commit API keys.
- WordPress marketing plugin zip (if present elsewhere) is optional; core product is the Expo + FastAPI app.

## License

MIT — see [LICENSE](LICENSE).
