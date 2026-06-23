# Auto Abodes — PRD

## Original Problem Statement
Marketplace for cleaning companies, homeowners & landlords to find qualified cleaners. Hub for cleaners to track schedules, log hours, build teams, chat. Cleaners obtain jobs by qualifications; auto-accept eligible jobs; posters pick among multiple qualified applicants. Live color-coded job map (Red=pending, Yellow=in_progress, Green=completed). Role dashboards. Detailed job info + checklist with mandatory photos. Check-in → checklist → Complete Job logs hours/pay. Like Jobber + Turno + Uber + Homestars. Palette: dark navy, dark teal, greige, gold, light sage.

## Architecture
- Frontend: Expo SDK 54 (expo-router), react-native-maps (web fallback list), expo-image-picker, expo-haptics.
- Backend: FastAPI + Motor/MongoDB. Auth = session_token (uuid) in `user_sessions`, Bearer header.
- Photos stored as base64 in job.checklist. Maps render on native; web shows list fallback.

## User Personas
- Cleaner: finds/bids jobs, logs hours/earnings.
- Company Owner (admin of their co.): posts jobs, manages teams, live ops map.
- Client (homeowner/landlord): posts jobs, picks cleaners.
- Owner + Cleaner (combined): posts jobs AND bids on large jobs.
- Admin (aestheticabodesyyc@gmail.com): full access, business tier, no ads — auto-granted on login.

## Implemented (2026-06-23)
- Role-based bottom tabs: Home, Map, Jobs, Chat, Profile.
- Dashboards with stats; ad banner on free tier.
- Live job map color-coded by status + filters + pin peek card.
- Post Job (type/address/date/time window/duration/pay/notes/required quals).
- Job detail: info + checklist (tasks + 5 mandatory photos), check-in, complete (logs hours/pay), applicants review + choose + message.
- Qualifications-based matching + auto-accept.
- In-app 1:1 chat (polling).
- Profile: edit details, qualifications, rate, auto-accept toggle.
- Subscriptions: Free/Pro/Business (simulated upgrade); free=ads, paid/admin=no ads.
- Backend tested: 30/30 pass.

## Backlog
- P0: Stripe real subscription billing; real AdMob banner (needs device build).
- P1: Teams UI (backend ready: /api/teams); harden assign endpoint (verify applicant qualified); map current-location centering + geocoding addresses to coords.
- P2: Owner live map of all assigned jobs as dedicated admin view; ratings/reviews (Homestars-style); push notifications (on request); chat realtime via websockets; modularize server.py; login rate-limiting.

## Next Tasks
- Wire Stripe checkout for tiers; add Teams management screen; geocode addresses on Post Job.

## Test Credentials
See /app/memory/test_credentials.md. Owner: t1@test.com/pass123. Admin: aestheticabodesyyc@gmail.com/admin123.
