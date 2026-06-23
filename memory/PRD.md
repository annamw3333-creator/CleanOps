# Auto Abodes — PRD

## Original Problem Statement
A marketplace where cleaning companies, homeowners and landlords find qualified cleaners. Also a hub for cleaners to track schedules, log hours, build teams, and chat. Cleaners obtain jobs by qualifications set by the poster; auto-accept if qualified; if multiple qualify the poster reviews applicants and chooses. Live map of jobs color-coded by status (Red=pending, Yellow=in progress, Green=completed). Role dashboards. Job fields: clean type, address, date, start time window, assigned cleaners, est. duration, client name, client notes, manager notes. Cleaner checks in, follows checklist with mandatory photos (under sink, fridge/freezer, under furniture, full bathroom, full kitchen) for standard/deep/airbnb cleans, then Complete Job logs hours/pay and turns status green. Like Jobber + Turno + Uber + Homestars. Palette: dark navy, dark teal, greige, gold, light sage green.

## Architecture
- Frontend: Expo Router (SDK 54), react-native-maps (native; web fallback list), expo-image-picker (base64 photos), expo-secure-store via @/src/utils/storage, AuthContext.
- Backend: FastAPI + Motor (MongoDB). Session-token Bearer auth in `user_sessions`. Photos stored as base64 in `job.checklist`.
- Auth: email/password + Emergent Google OAuth, unified `users` collection.

## User Personas
- Cleaner — finds & bids jobs, logs hours/earnings.
- Company Owner — posts jobs, manages teams, ops map.
- Homeowner/Landlord (client) — posts jobs, reviews applicants.
- Owner + Cleaner — posts jobs AND bids on large jobs.
- Admin (aestheticabodesyyc@gmail.com) — full access, business tier, no ads (auto-granted on login).

## Implemented (2026-06-23)
- Role-based register/login + Google auth; admin auto-upgrade.
- Profile with qualifications, hourly rate, auto-accept toggle.
- Job posting (type, address, time window, notes, required quals, pay) with auto-built checklist by clean type.
- Available-jobs qualification filter; apply/auto-accept; applicant review & choose.
- Check-in -> in_progress; checklist tasks + mandatory photo capture (base64); Complete Job (gated on full checklist) logs hours+pay.
- Live map with status-color markers + pin peek card (web fallback list).
- Dashboards + stats (cleaner earnings/hours; owner pipeline counts).
- 1:1 chat (polling), conversation list, start-new-chat picker.
- Teams (create/list/add members) backend.
- Subscription tiers free/pro/business (simulated upgrade); Free-tier ad banner; ad-free on paid/admin.
- Backend tests: 30 passed (0 fail).

## Backlog
- P0: Real Stripe billing for subscriptions; real Google AdMob banners (needs native build).
- P1: Team chat (group conversations); push notifications (on request); job scheduling/calendar; geocoding addresses to real coords; map auto-center to device location.
- P2: Ratings/reviews (Homestars-style), recurring jobs (Turno-style), payouts, in-app photos gallery per job, advanced admin ops map filters.

## Next Tasks
1. Connect Stripe checkout to /api/subscription/upgrade.
2. Wire AdMob on Free tier for production builds.
3. Address geocoding so map pins use real job locations.
