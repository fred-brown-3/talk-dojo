# Talk Dojo 🥋 — Agent Handoff Document

**Date**: 2026-08-30  
**Latest Git Commit**: [`2ac2059`](https://github.com/fred-brown-3/talk-dojo/commit/2ac2059) (`feat: top-level test scenarios, coverage gaps warning, and granular procedure actions`)  
**Repository**: [https://github.com/fred-brown-3/talk-dojo](https://github.com/fred-brown-3/talk-dojo)  
**Dev Server**: Runs on `http://localhost:3000` via `node src/server.js` (Unit tests run via `npm test`).

---

## 1. Project Background & Objective

Talk Dojo is an enterprise voice AI simulation testbed and compliance certification platform for phone call assistants.
The platform enables companies to define:
1. **Account Details**: Dynamic Markdown company knowledge cards (`SEC-xxx`).
2. **Virtual Tools**: Realistic JSON schema tool definitions with endpoints and mocking.
3. **Policies**: Operational directives and compliance guardrails (`POL-xxx`: `always`, `never`, `conditional`).
4. **Procedures**: Step-by-step workflow directives (`PROC-xxx`) with granular tool action authorizations.
5. **Test Scenarios**: Multi-target customer roleplays (`TEST-xxx`) linked to policies and procedures.
6. **Virtual Assistants**: Personas, voice models (Aoede, Fenrir, etc.), and conversational manners.
7. **Certification**: Automated or simulated dialog evaluation across test scenarios with scoring and audio playback.

---

## 2. Recent Architectural Changes Completed

### A. Standalone Test Scenarios & Multi-Target Links
- **Moved Test Scenarios to Top-Level**: Test scenarios are no longer nested under individual procedures; they now exist as their own top-level section: `Test Scenarios` (`/#/account/:id/testscenarios/all`).
- **File Storage**: Stored per account at `data/accounts/<accountId>/test-scenarios/<id>.yaml`.
- **Properties**:
  - `id` / `ref_id`: e.g. `TEST-001`, `TEST-002`
  - `title`, `description`, `status` (`enabled`, `draft`, `disabled`)
  - `customer_role`, `secret_instructions`, `callee`, `max_turns`
  - `linked_policies`: `['POL-001', ...]`
  - `linked_procedures`: `['PROC-001', ...]`
  - `evaluation_checklist`: array of `{ id, goal, required }`
- **Interactive UI**:
  - Master-detail view with filters (`All`, `Enabled`, `Drafts`, `Coverage Gaps`).
  - Active links displayed as interactive pills (`[POL-001]`, `[PROC-001]`) with click-to-view and `✕` remove.
  - `✨ AI Suggest Links` button calling `/api/accounts/:id/test-scenarios/suggest-links`.
  - `+ Link Item` modal to search and link any policy or procedure.

### B. Proactive Test Coverage Gap Detection & Yellow Warning Indicators
- **Coverage Gap Rule**: Any enabled policy or procedure that is not referenced in any enabled test scenario's `linked_policies` or `linked_procedures` is flagged as an uncovered gap.
- **Indicators Implemented**:
  1. **Sidebar Badge**: `#nav-badge-scenarios-warning` displays a pulsing yellow indicator `⚠️ X gaps` on the Test Scenarios navigation item.
  2. **Top Coverage Gap Alert Card**: `#testscenarios-gap-banner` appears on the Test Scenarios tab displaying uncovered items and a `⚡ Create Draft Tests` button.
  3. **Inline Warnings**: `#policy-uncovered-warning` and `#proc-uncovered-warning` appear directly inside the edit cards of individual policies and procedures when they lack tests, with a `⚡ Generate Test Scenario` quick action.

### C. Decoupled Tool Assignments from Assistants
- Assistants no longer hold an allowed tools list.
- Tools are defined at the Account level under Tools, and granular actions are authorized on Procedures.
- The prompt compiler automatically grants tool authorization to any action associated with active procedures.
- Removed the "Assigned Tools" checkboxes section from the Assistant editor UI and payloads.

### D. Granular Tool Actions in Procedures
- Procedures authorize specific endpoints/actions (e.g. `check_clinic_slots` vs `book_clinic_appointment`), not just entire services.
- Rendered in UI as grouped service accordions with action-level checkboxes (`authorized_actions`).

### E. UI Polish & Fixes
- **Duplicate ID Headers Fixed**: Procedure and Policy headers now display the clean title/name without duplicating the ID next to the badge (e.g. `[PROC-001] Schedule Clinic Appointment` instead of `[PROC-001] Edit Procedure PROC-001`).
- **Assistant Persona Generator**: The `✨ Generate Persona` input box is now automatically hidden when editing existing assistants.

### F. 3 Realistic Domain Seed Accounts Populated
Pre-populated in `AccountManager.initDefaultSeedAccounts()`:
1. **Medical Provider**: `Smoky Mountain Health & Urgent Care` (`acct-smk-7b9e2f41`)
   - Tools: Clinic Scheduling System, Patient Chart & Medical History System
   - Policies: HIPAA 2-Factor Verification (`POL-001`), Emergency Triage (`POL-002`), Prescriptions (`POL-003`)
   - Procedures: Schedule Clinic Appointment (`PROC-001`), Prescription Refill Request (`PROC-002`)
   - Assistants: Sarah Lou Jenkins (Aoede timbre, warm Southern hospitality)
   - Tests: `TEST-001`, `TEST-002`, `TEST-003`
2. **Law Firm**: `Sterling & Sterling LLP — Civil Litigation & Corporate Law` (`acct-law-sterling`)
   - Tools: Legal Practice Management API, Court Dockets Calendar
   - Policies: Attorney-Client Privilege (`POL-101`), Fee Quotes (`POL-102`), Retainer (`POL-103`)
   - Procedures: New Client Intake (`PROC-101`), Deposition Scheduling (`PROC-102`)
   - Assistants: Victoria Sterling (Fenrir/measured timbre)
   - Tests: `TEST-101`, `TEST-102`
3. **Real Estate Firm**: `Vanguard Realty Group & Property Management` (`acct-real-vanguard`)
   - Tools: MLS Property Database API, Maintenance Work-Order Dispatch API
   - Policies: Fair Housing Act (`POL-201`), Security Deposits (`POL-202`), Maintenance (`POL-203`)
   - Procedures: Property Showing Tour Request (`PROC-201`), Emergency Maintenance Dispatch (`PROC-202`)
   - Assistants: Marcus Vance (Puck timbre, upbeat real estate specialist)
   - Tests: `TEST-201`, `TEST-202`

---

## 3. Key Files & Architecture Reference

| File | Purpose |
|---|---|
| `src/account/account-manager.js` | Core data model: tests CRUD (`listTests`, `getTest`, `saveTest`, `deleteTest`, `saveDraftTests`, `getCoverageGaps`), seed accounts, and prompt compiler. |
| `src/server.js` | Express API endpoints: `/api/accounts/:id/test-scenarios*`, REST routes, and voice previews. |
| `src/runner/batch-runner.js` | Certification test runner: pulls enabled scenarios from `accountManager.listTests()`. |
| `public/index.html` | App markup: `#nav-group-testscenarios`, `#pane-testscenarios`, granular action accordions in `#pane-procedures`, and coverage warnings. |
| `public/js/app.js` | Client controller: state, routing (`switchTab`), test scenario CRUD, gap evaluation, and AI suggestion integration. |
| `public/css/style.css` | Styles: `.badge-warning-dot`, `.warning-callout`, `.coverage-gap-banner`, `.tool-accordion`, `.linked-pill-tag`. |
| `test/unit-test.js` | Test suite covering DSP, fixtures, 6-block prompt compilation, and account stores. Run with `npm test`. |

---

## 4. Next Steps for Incoming Agent

1. **Routing Alias Polish**:
   - In `public/js/app.js` (`switchTab` / `parseHashRoute`), normalize tab identifiers (e.g. support both `testscenarios` and `test-scenarios` by stripping hyphens: `tabId.replace(/-/g, '')`).
2. **Tab Display Classes**:
   - Verify that `#pane-testscenarios` has class `tab-pane` and its visibility is controlled via `.tab-pane.active` (remove any leftover `hidden` class from its initial markup).
3. **Live Browser Verification**:
   - Start the server (`node src/server.js` or manage task).
   - Open `http://localhost:3000` in the browser subagent.
   - Switch between the 3 accounts (`Smoky Mountain`, `Sterling & Sterling`, `Vanguard Realty`).
   - Open `Test Scenarios`: verify scenarios load, click `✨ AI Suggest Links`, and verify gap badges update dynamically.
   - Open `Procedures`: verify granular tool action checkboxes toggle and save properly.
   - Open `Assistants`: confirm Sarah Lou Jenkins opens with persona generator hidden and tools section removed.
4. **Push Updates**:
   - Run `npm test`.
   - Commit and push to GitHub.
