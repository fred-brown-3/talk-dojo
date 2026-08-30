# Talk Dojo 🥋 — Agent Handoff Document

**Date**: 2026-08-30  
**Baseline Feature Commit**: [`2ac2059`](https://github.com/fred-brown-3/talk-dojo/commit/2ac2059) (`feat: top-level test scenarios, coverage gaps warning, and granular procedure actions`)
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
1. **Medical Provider**: `Smoky Mountain Health & Urgent Care` (`acct-med-smoky-mtn` on a fresh install; compatible with an existing `acct-smk-*` account)
   - Tools: Clinic Scheduling & EHR Service
   - Policies: HIPAA verification, medical-advice prohibition, emergency triage, and hardship assistance (`POL-001`–`POL-004`)
   - Procedures: Schedule Clinic Appointment (`PROC-001`), Prescription Refill Request (`PROC-002`)
   - Assistants: Sarah Lou Jenkins (Aoede timbre, warm Southern hospitality)
   - Tests: `TEST-001`, `TEST-002`
2. **Law Firm**: `Sterling & Sterling LLP — Civil Litigation & Corporate Law` (`acct-law-sterling`)
   - Tools: Legal Intake CRM & Conflict Engine
   - Policies: Disclaimer, conflict clearance, outcome-quote prohibition, and urgent intake (`POL-001`–`POL-004`)
   - Procedures: Prospective Client Intake (`PROC-001`), Partner Consultation Scheduling (`PROC-002`)
   - Assistants: Eleanor Vance (Kore timbre)
   - Tests: `TEST-001`
3. **Real Estate Firm**: `Vanguard Realty Group & Property Management` (`acct-real-vanguard`)
   - Tools: MLS Property & Showing Dispatch
   - Policies: Fair housing, brokerage disclosure, and seller-price confidentiality (`POL-001`–`POL-003`)
   - Procedures: Property Showing Tour Request (`PROC-001`), Listing Consultation Dispatch (`PROC-002`)
   - Assistants: Chloe Bennett (Puck timbre)
   - Tests: `TEST-001`

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

## 4. Handoff Completion Update

Completed on 2026-08-30:

1. Normalized `testscenarios` and `test-scenarios` hash-route aliases.
2. Removed the stale `hidden` class that prevented the Test Scenarios pane from displaying.
3. Connected granular procedure actions to prompt compilation and certification runtime toolbelts.
4. Converted standalone customer roles and secret instructions into the runtime caller/callee schema.
5. Removed obsolete test-bank routes and updated remediation to use top-level scenario and policy stores.
6. Hardened `TEST-xxx` allocation against overwriting a higher existing ID after deletions.
7. Added regression coverage for standalone scenarios, coverage gaps, runtime action mapping, and private customer instructions.

Automated and browser verification results should be recorded with the completing commit.
