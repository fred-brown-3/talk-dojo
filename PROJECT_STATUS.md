# Talk Dojo 🥋 — Project Status & Architecture Guide for AI Agents

**Last Updated:** August 30, 2026
**Repository:** `talk-dojo`  
**Test Status:** ✅ All 8 unit test suites passing (`npm test`)  
**Dev Server:** Run `npm run dev` and open `http://localhost:3000`

---

## 1. Executive Summary & Mission

**Talk Dojo** is an enterprise-grade AI telephony simulation, sparring, certification, and deployment platform. It enables organizations to:
1. Define company identity with dynamic Markdown section cards (`SEC-xxx`), phonetics, acronyms, and contact information.
2. Author MCP-compatible tools with explicit parameter schemas, example call parameters, expected response schemas, and call responses.
3. Establish immutable compliance policies (`POL-xxx`) classified as **Always**, **Never**, or **Conditional**.
4. Define authorized procedures (`PROC-xxx`) that constrain tool usage at the endpoint/action level.
5. Author standalone test scenarios (`TEST-xxx`) linked to multiple policies and procedures with proactive coverage-gap detection.
6. Configure one virtual phone assistant per account with an authentic backstory, conversational guidelines, and Gemini Multimodal Live voice timbre (`Aoede`, `Fenrir`, `Charon`, `Kore`, or `Puck`).
7. Spar live with the assistant inside an embedded voice-first call window where the actual LLM streams native spoken audio.
8. Certify assistants against all enabled standalone scenarios in either ultra-fast Text mode or high-fidelity Voice telephony mode, streaming turns live with interactive **Pause**, **Continue**, and **Restart** controls.
9. Create immutable configuration snapshots and manage active production deployments with safety audit logs.

---

## 2. Navigation Hierarchy & Route Structure

The UI follows an intentional 8-tier sequential hierarchy:
```
1. 🏢 Account              -> /#/account/:accountId/info
2. 🛠️ Tools                -> /#/account/:accountId/tools/all?id=<toolId>  |  /#/account/:accountId/tools/new
3. 📜 Policies             -> /#/account/:accountId/policies/all_enabled?id=<policyId>
4. 📋 Procedures           -> /#/account/:accountId/procedures/all_enabled?id=<procId>
5. 🏦 Test Scenarios       -> /#/account/:accountId/testscenarios/all?id=<testId>
6. 🤖 Assistant            -> /#/account/:accountId/assistant/edit
7. 🏆 Certification        -> /#/account/:accountId/certification/history  |  /#/account/:accountId/certification/new
8. ⚙️ Account Settings     -> /#/account/:accountId/accountsettings/overview
```

### Hash-Based Deep Linking Convention
- All screen transitions, entity selections, and account selections update `window.location.hash`.
- URLs use parent account GUIDs and clean entity identifiers (e.g. `/#/account/acct-smk-7b9e2f41/policies/all_enabled?id=POL-001`).
- Reloading or sharing direct URLs restores that exact view, account context, and selects that specific item.

---

## 3. Core Architectural Subsystems

### A. Account Management & Dynamic Markdown (`src/account/account-manager.js`)
- Stores business data under `data/accounts/<account-id>/account.yaml` and `company_info.md`.
- Dynamic Markdown sections are parsed into visual cards labeled with reference badges (`SEC-001`, `SEC-002`, etc.).
- Includes a raw Markdown toggle to edit the unified markdown file directly.

### B. Tools Manager (`src/tools/virtual-tool-manager.js`)
- Stores tool definitions under `data/accounts/<account-id>/virtual-tools/`.
- Tools expose normalized function declarations: `parameters`, `example_call_parameters`, `expected_response_schema`, and `example_call_response`.
- AI generation displays an animated circle spinner with an elapsed seconds timer (`Waiting: 0s`, `Waiting: 1s`...) and status messages.

### C. Policies Tab (`POL-xxx`)
- Dedicated top-level tab for immutable compliance rules.
- Types:
  - **Always**: Mandatory actions executed on every call (e.g. HIPAA 2-factor verification).
  - **Never**: Strict prohibitions and compliance guardrails (e.g. never give medical advice).
  - **Conditional**: Triggered requirements with explicit condition prompts and directives.
- Each policy receives a clean reference ID (`POL-001`, `POL-002`, etc.) so violations can be reported directly by ID.

### D. Procedures Tab (`PROC-xxx`)
- Dedicated top-level tab between Policies and Test Scenarios.
- Procedures authorize and constrain tool usage with checkboxes.
- Strict prompt mandate enforces that if a caller request falls outside enabled procedures, the assistant **must politely decline**.
- Covering standalone test scenarios are linked from procedure detail views.
- Granular `authorized_actions` select individual virtual-tool endpoints.

### E. Standalone Test Scenarios (`TEST-xxx`)
- Stored at `data/accounts/<account-id>/test-scenarios/<test-id>.yaml`.
- Link to multiple policies and procedures and define customer personas, private instructions, and evaluation checklists.
- Coverage warnings flag enabled policies and procedures not referenced by any enabled scenario.
- Certification maps linked procedure actions into an isolated assistant toolbelt.

### F. Account Assistant (`data/accounts/<account-id>/assistant.yaml`)
- Exactly one assistant is permitted per account and opens directly in a singular editor.
- Legacy `assistants/` directories are migrated destructively; one canonical record is retained and no assistant backup/recycle artifact is created.
- **Voice Timbre Clarity & Gemini Live Bidi Previews**:
  - `Aoede`: Female timbre · Warm, breezy & natural (~240 Hz).
  - `Fenrir`: Male timbre · Deep, resonant & authoritative (~110 Hz).
  - `Charon`: Male timbre · Calm, clinical & measured (~140 Hz).
  - `Kore`: Female timbre · Bright, cheerful & energetic (~280 Hz).
  - `Puck`: Male/Neutral timbre · Casual, conversational (~175 Hz).
  - Endpoint `GET /api/voice-preview/:voiceName` streams genuine spoken native audio from Gemini Live WebSocket (`models/gemini-2.5-flash-native-audio-latest`), cached on disk in `data/voice-previews/<voice>.wav`.
- **Embedded Voice-First Chat Window**:
  - Embedded in the assistant edit pane with Freeform Sandbox, Bank Scenario, and Pasted Scenario modes.
  - Modalities: `Text ⚡`, `Voice 🎙️`, `Hybrid 🔀`.

### G. Prompt Compilation: Strict 6-Block Specification
When compiling the system prompt for an assistant (`compileAssistantPrompt`), it merges:
1. `=== BLOCK 1: BUSINESS CONTEXT & COMPANY INFORMATION ===`
2. `=== BLOCK 2: IMMUTABLE POLICIES & COMPLIANCE RULES ===` (Always, Never, Conditional with `[POL-xxx]`)
3. `=== BLOCK 3: AUTHORIZED PROCEDURES & WORKFLOW CONSTRAINTS ===` (Mandate to politely decline unmapped requests)
4. `=== BLOCK 4: ASSISTANT PERSONA & VOCAL CADENCE ===`
5. `=== BLOCK 5: CONVERSATIONAL GUIDELINES & TELEPHONY MANNERS ===`
6. `=== BLOCK 6: TOOL INSTRUCTIONS & CAPABILITIES ===`

### H. Certification & Deployment Manager (`src/certification/certification-manager.js`)
- Snapshots freeze company info, policies (`POL-xxx`), procedures (`PROC-xxx`), virtual tools, assistant, and test results.
- Certification runner tests all enabled top-level scenarios.
- Instant live streaming over WebSocket with Pause, Continue, and Restart controls.
- Active production deployment management with audit logs.

### I. Recycle Bin & Soft-Delete Archive
- Path: `data/accounts/<account-id>/recycle-bin/`
- All assistant, tool, policy, and scenario deletions are soft-deleted into the recycle bin.
- Accessible via the bottom sidebar drawer to restore items or permanently clear them to the audit archive.

---

## 4. Key Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List accounts (GUIDs) |
| `GET` | `/api/accounts/:id` | Get account details |
| `GET/POST` | `/api/accounts/:id/company-info` | Get/Save Markdown section cards (`SEC-xxx`) |
| `GET/POST` | `/api/accounts/:id/policies` | List/Save immutable compliance policies (`POL-xxx`) |
| `DELETE` | `/api/accounts/:id/policies/:policyId` | Soft-delete policy |
| `GET/POST` | `/api/accounts/:id/procedures` | List/Save procedures (`PROC-xxx`) |
| `DELETE` | `/api/accounts/:id/procedures/:procId` | Soft-delete procedure |
| `GET/POST` | `/api/accounts/:id/test-scenarios` | List or save standalone test scenarios |
| `GET` | `/api/accounts/:id/test-scenarios/gaps` | Calculate enabled policy/procedure coverage gaps |
| `POST` | `/api/accounts/:id/test-scenarios/suggest-links` | Suggest policy and procedure links |
| `GET/POST` | `/api/accounts/:id/virtual-tools` | List/Save normalized MCP tool endpoints |
| `POST` | `/api/accounts/:id/virtual-tools/describe` | AI tool generation endpoint |
| `GET/POST` | `/api/accounts/:id/assistant` | Get or save the account's sole assistant |
| `GET` | `/api/voice-preview/:voiceName` | Spoken preview WAV from Gemini Live cache |
| `POST` | `/api/chat/assistant-turn` | Single turn (returns text + native audioBase64) |
| `POST` | `/api/chat/review-interaction` | AI referee interaction scoring |
| `POST` | `/api/accounts/:id/certification/certify` | Run sequential batch certification across all enabled procedures |
| `GET` | `/api/accounts/:id/certification/snapshots` | List past certification snapshots |
| `POST` | `/api/accounts/:id/certification/snapshots/:id/deploy` | Deploy snapshot as active configuration |
| `GET` | `/api/accounts/:id/recycle-bin` | List soft-deleted items |
| `POST` | `/api/accounts/:id/recycle-bin/:itemId/restore` | Restore soft-deleted item |

---

## 5. Critical Directives for Future AI Agents

1. **No Data In Git**: The `data/` directory and `.env*` files are strictly excluded via `.gitignore`.
2. **Guid Deep-Links**: Always preserve the `/#/account/:accountId/...` URL convention with GUID identifiers.
3. **Strict Procedures Enforcement**: Assistants must only execute workflows and tools defined in enabled procedures; unmapped requests must be politely declined.
4. **Auto-Growing Textareas**: Any multi-line input must use the `.auto-grow` class so that text content expands dynamically without internal scrollbars.
5. **Maintain All Test Suites**: Before ending your turn, always verify with `npm test`. All test suites must pass without regressions.
6. **Singleton Assistant Invariant**: Never reintroduce assistant lists, assistant selectors, plural assistant storage, or assistant deletion.
