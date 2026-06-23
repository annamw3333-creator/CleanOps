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
## Implemented (2026-06-23, fork session)
- Client List (`/clients` + dashboard card): aggregates jobs into clients/companies with tenure, frequency (Weekly/Bi-weekly/Monthly/etc.), clean type, assigned cleaners; editable contact + notes (`client_profiles` collection). APIs: GET /api/clients, PUT /api/clients/notes.
- Cleaner Dashboard availability toggle: weekday chips update profile.availability inline.
- Uber-style Driver Mode (`/driver` + dashboard card): Go Online/Offline (expo-location), polled nearby offers (haversine distance, 75km radius, limit 25), one-tap Accept (atomic POST /jobs/{id}/grab; 409 if taken), Decline (POST /driver/decline/{id} hides offer), earnings-forward (today/week/total). APIs: /driver/status, /driver/earnings, /driver/offers.
- Verified previously-untested Onboarding (SOPs/quizzes) and Client Feedback public links — all working (26/26 backend, 5/5 frontend in iteration_5).
- Seed script /app/backend/seed_demo.py creates owner/cleaner/client@abodeops.com (pass123) + demo jobs.

## Backlog / Next Tasks
- Multi-company cleaner support (P2): color-code jobs by company on schedule/calendar.
- Scope GET /api/onboarding by owner/team (currently global).
- Refactor server.py (>1100 lines) into routers (auth/jobs/billing/driver/clients/onboarding/feedback).
- Migrate deprecated RN style props (shadow*/pointerEvents) app-wide.
- Calendar sync write needs native build to validate on device.
## (legacy) Earlier Next Tasks
- Onboarding/welcome packages with quizzes + % completion (owner creates/uploads SOP docs; cleaners complete in-app; staff profile shows % done).
- Client feedback + shareable public rating link (no-login) that employers can forward to the rated cleaner.
- Calendar sync (recommended: expo-calendar to write shifts to the device calendar, which syncs to Google/Samsung/iCloud per device account; needs a native build to test).
- Verify pay/tax + reviews via testing_agent.
- Wire Stripe checkout for tiers; add Teams management screen; geocode addresses on Post Job.

## Test Credentials
See /app/memory/test_credentials.md. Owner: t1@test.com/pass123. Admin: aestheticabodesyyc@gmail.com/admin123.
