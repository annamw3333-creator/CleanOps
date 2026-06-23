#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "AbodeOps cleaning marketplace. New work this session: (1) verify untested Onboarding/Client-Feedback/Calendar features, (2) Client List feature for owners & cleaners, (3) cleaner Dashboard availability toggle, (4) Uber-style Driver Mode (go online/offline, nearby polled offers, one-tap accept/decline, earnings-forward screen)."

backend:
  - task: "Onboarding APIs (create/list/complete, owner vs cleaner)"
    implemented: true
    working: "NA"
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Coded previously, never tested. Endpoints: POST/GET /api/onboarding, POST /api/onboarding/{id}/complete. Owner creates docs/quizzes; cleaner completes & scores."
  - task: "Client feedback public link APIs"
    implemented: true
    working: "NA"
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/jobs/{id}/feedback-link (auth), GET/POST /api/public/feedback/{token} (no auth). Never tested."
  - task: "Client List APIs (GET /api/clients, PUT /api/clients/notes)"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Aggregates jobs into clients with tenure, frequency, clean type, cleaners. Curl-verified for owner (3 clients) & cleaner (1 company). Notes upsert via client_profiles collection."
  - task: "Driver Mode APIs (status, earnings, offers, grab, decline)"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Curl-verified: offers sorted by haversine distance, earnings today/week/total, grab is atomic (409 on double-grab), decline hides offer. /driver/status sets online + location."

  - task: "Live location tracking + Live Crew Map (privacy-scoped to poster)"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Curl-verified: POST /jobs/{id}/enroute (sets tracking + shares location), POST /jobs/{id}/location (ping), GET /fleet/live (poster/admin only - 403 for cleaner). Privacy: cleaner_locations stripped from enrich_job so regular /jobs/{id} does NOT leak location; only GET /fleet/live exposes live_cleaners to the poster. Stale (>60min) and completed-phase locations filtered. NOTE: path is /api/fleet/live (NOT /jobs/live which collided with /jobs/{job_id})."

frontend:
  - task: "Driver Mode mini-map + Live Crew Map screen + On My Way lifecycle"
    implemented: true
    working: "NA"
    file: "app/driver.tsx, app/live-map.tsx, app/job/[id].tsx, src/components/JobMap.tsx, src/components/JobMap.web.tsx, app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Smoke-tested on web: Live Crew Map renders (owner dashboard live-map-card -> shows '1 live' + cleaner 'On the way' + pending job pins + legend). Driver screen shows mini-map above offers when online. Job detail: assigned cleaner with accepted job sees 'On My Way' (onmyway-button) -> enroute + live location sharing indicator; in_progress shows on-site tracking indicator. Foreground location ping every 15s while tracking (mobile only). JobMap now renders person pins (live cleaners) + me-location."

    implemented: true
    working: "NA"
    file: "app/clients.tsx, app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New /clients screen with client cards, frequency badges, editable contact/notes modal. Dashboard 'Client List' card added for all roles."
  - task: "Cleaner availability toggle on dashboard"
    implemented: true
    working: "NA"
    file: "app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Weekday chips on dashboard for cleaners; tapping updates profile.availability via PUT /profile."
  - task: "Driver Mode screen (online toggle, offers, accept/decline, earnings)"
    implemented: true
    working: "NA"
    file: "app/driver.tsx, app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Smoke-tested: dashboard Driver Mode card + driver screen render. Toggle online polls /driver/offers every 6s; accept calls /grab, decline calls /driver/decline. Location optional (web returns null, offers by recency)."
  - task: "Onboarding & Feedback screens (untested from prior session)"
    implemented: true
    working: "NA"
    file: "app/onboarding.tsx, app/feedback/[token].tsx, app/job/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Never tested. Onboarding builder/taker; public feedback form; job detail has Add to Calendar + Get Feedback Link buttons."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Driver Mode APIs (status, earnings, offers, grab, decline)"
    - "Driver Mode screen (online toggle, offers, accept/decline, earnings)"
    - "Client List APIs (GET /api/clients, PUT /api/clients/notes)"
    - "Client List screen + dashboard card"
    - "Onboarding APIs (create/list/complete, owner vs cleaner)"
    - "Client feedback public link APIs"
    - "Cleaner availability toggle on dashboard"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Implemented Client List, cleaner availability toggle, and Uber-style Driver Mode. Also need to verify previously-untested Onboarding/Feedback/Calendar. Backend curl-verified for clients & driver. Seeded accounts (pass123): owner@abodeops.com, cleaner@abodeops.com (complete profile, has earnings + 3 nearby pending demo jobs as offers), client@abodeops.com. Demo jobs are near Calgary 51.0447,-114.0719 with NO required quals so cleaner qualifies. Please test backend first then frontend. Note: calendar write needs native build (skip device calendar); test the feedback-link generation + public feedback form instead. Re-run seed if demo jobs get consumed: cd /app/backend && python seed_demo.py"
