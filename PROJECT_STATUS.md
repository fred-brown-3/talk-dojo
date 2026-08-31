# Talk Dojo — Current Project Status

**Last updated:** August 30, 2026

**Release:** 1.0.0-beta.1

**Branch:** `main`

**Verification:** `npm test` passing; current UI flows browser-verified without runtime errors

**Local server:** `npm start` or `npm run dev`, defaulting to `http://localhost:3000`

This is the authoritative technical status document. The former agent handoff document has been retired because its durable content is consolidated here.

## Current State

Talk Dojo supports multiple accounts, with exactly one telephone assistant per account. Each account contains company context, virtual tools, policies, procedures, standalone tests, certification history, and recoverable deleted business objects.

The current sidebar sequence is:

```text
Company Profile → Tools → Policies → Procedures → Test Scenarios
→ Assistant → Certification

Account Settings is anchored separately at the bottom.
```

There is no global top header. Account switching is available only through **Account Settings**, using a modal of account summary cards. API configuration and Recycle Bin access also live there.

## Completed Architecture

### Accounts and Company Profiles

- Account metadata: `data/accounts/<account-id>/account.yaml`.
- Company knowledge: `data/accounts/<account-id>/company_info.md`.
- Markdown headings are parsed into editable `SEC-xxx` cards.
- Hash routes preserve the account context and selected entity.

### Singleton Assistant

- Canonical path: `data/accounts/<account-id>/assistant.yaml`.
- APIs: `GET` and `POST /api/accounts/:id/assistant`.
- The UI opens directly into the singular Assistant editor.
- No assistant list, create flow, selector, or delete operation exists.
- Startup migration chooses one legacy assistant, removes the old `assistants/` directory, and removes assistant Recycle Bin artifacts.
- Certification, chat, prompt compilation, and batch execution resolve the sole assistant automatically.

### Tools and Procedure Authorization

- Tools are stored under `data/accounts/<account-id>/virtual-tools/`.
- Each service contains normalized callable endpoints with parameters, examples, expected schemas, and example responses.
- Tools belong to the account, not the assistant.
- Procedures authorize specific endpoint names through `authorized_actions`.
- Certification constructs an isolated toolbelt from actions authorized by linked procedures.

### Policies and Procedures

- Policies are stored as YAML and expose clean `POL-xxx` references.
- Supported policy types are `always`, `never`, and `conditional`.
- Procedures use `PROC-xxx` references, ordered steps, constraints, and granular tool authorization.
- Prompt compilation explicitly requires polite refusal of workflows outside enabled procedures.

### Standalone Test Scenarios

- Canonical path: `data/accounts/<account-id>/test-scenarios/<test-id>.yaml`.
- Scenarios are top-level entities, not procedure-owned records.
- They link to multiple policy and procedure references.
- They include customer persona, private instructions, objectives, turn limits, and required evaluation criteria.
- Coverage analysis flags any enabled policy or procedure not referenced by an enabled scenario.
- Gap tooling can create drafts and suggest relevant links.
- Scenario ID allocation considers active and recycled records to prevent accidental reuse.

### Prompt Compilation

`AccountManager.compileAssistantPrompt(accountId)` produces six blocks:

1. Business context and company information.
2. Immutable policies and compliance rules.
3. Authorized procedures and workflow constraints.
4. Assistant persona and vocal cadence.
5. Conversational and telephony guidelines.
6. Tool instructions and capabilities.

### Chat, Audio, and Certification

- Assistant sparring supports freeform, bank-scenario, and pasted-scenario modes.
- Modalities include text, voice, and hybrid interaction.
- Gemini Live voice previews are cached as WAV files.
- Certification automatically targets the account assistant and asks only for Text or Voice mode.
- WebSockets stream certification progress and transcript turns.
- Snapshots freeze company info, policies, procedures, tools, assistant configuration, and results.
- Deployment status remains available in Certification history; it is no longer displayed in global chrome.

### Account Settings and Recycle Bin

- Account Settings is a neutral/cyan bottom-sidebar control with no count badge.
- The account-card modal displays the assistant name and entity counts for each account.
- The Gemini API key can be updated from Account Settings.
- Policies, procedures, and scenarios are soft-deleted into the account Recycle Bin.
- Tool deletion is currently permanent and bypasses the Recycle Bin.
- The singleton assistant cannot be deleted.

## Demo Workspace Status

`src/account/demo-data-enhancements.js` defines idempotent enrichment for the recognized demo workspaces. It uses stable section headings and record IDs, adding only missing data.

Current local demo totals:

| Account | Profile sections | Policies | Tool services | Test scenarios |
|---|---:|---:|---:|---:|
| Jade Law for Justice / healthcare advocacy sandbox | 9 | 7 | 4 | 4 |
| Arm & A Leg Medical Billing Co. / compatible `acct-smk-*` medical account | 9 | 8 | 3 | 6 |
| Sterling & Sterling LLP | 9 | 8 | 3 | 5 |
| Vanguard Realty Group & Property Management | 9 | 7 | 3 | 5 |

Fresh installations seed the three canonical medical, legal, and real-estate accounts. The Jade sandbox is enriched only when that existing account is present.

## Route Map

```text
/#/account/:accountId/info
/#/account/:accountId/tools/all?id=<toolId>
/#/account/:accountId/tools/new
/#/account/:accountId/policies/<filter>?id=<policyId>
/#/account/:accountId/procedures/<filter>?id=<procedureId>
/#/account/:accountId/testscenarios/<filter>?id=<testId>
/#/account/:accountId/testscenarios/new
/#/account/:accountId/assistant/edit
/#/account/:accountId/certification/history
/#/account/:accountId/certification/new
/#/account/:accountId/accountsettings/overview
```

Legacy `assistants` route segments normalize to the singular Assistant pane for bookmark compatibility; no plural assistant API remains.

## API Inventory

### Configuration and Accounts

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/config` | Report whether runtime configuration is present |
| `POST` | `/api/config/key` | Update the runtime Gemini API key |
| `GET` | `/api/accounts` | List accounts and summary counts |
| `GET` | `/api/accounts/:id` | Get an account and its company context |
| `POST` | `/api/accounts` | Create or update an account |
| `GET/POST` | `/api/accounts/:id/company-info` | Read or save company Markdown/sections |

### Policies, Procedures, Tests, and Tools

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/api/accounts/:id/policies` | List or save policies |
| `DELETE` | `/api/accounts/:id/policies/:policyId` | Soft-delete a policy |
| `GET/POST` | `/api/accounts/:id/procedures` | List or save procedures |
| `DELETE` | `/api/accounts/:id/procedures/:procedureId` | Soft-delete a procedure |
| `GET/POST` | `/api/accounts/:id/test-scenarios` | List or save standalone scenarios |
| `DELETE` | `/api/accounts/:id/test-scenarios/:testId` | Soft-delete a scenario |
| `GET` | `/api/accounts/:id/test-scenarios/gaps` | Calculate coverage gaps |
| `POST` | `/api/accounts/:id/test-scenarios/generate-gap-drafts` | Create draft tests for gaps |
| `POST` | `/api/accounts/:id/test-scenarios/suggest-links` | Suggest policy/procedure links |
| `GET/POST` | `/api/accounts/:id/virtual-tools` | List or save tool services |
| `DELETE` | `/api/accounts/:id/virtual-tools/:toolId` | Delete a tool service |
| `POST` | `/api/accounts/:id/virtual-tools/describe` | Generate a tool schema with AI |

### Assistant, Chat, and Certification

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/api/accounts/:id/assistant` | Read or update the sole assistant |
| `POST` | `/api/accounts/:id/assistant/describe` | Generate/refine an assistant persona |
| `GET` | `/api/voice-preview/:voiceName` | Return a cached/generated voice preview |
| `POST` | `/api/chat/assistant-turn` | Run one assistant interaction turn |
| `POST` | `/api/chat/review-interaction` | Evaluate an interaction |
| `POST` | `/api/accounts/:id/certification/certify` | Start certification |
| `GET` | `/api/accounts/:id/certification/snapshots` | List certification snapshots |
| `POST` | `/api/accounts/:id/certification/snapshots/:snapshotId/deploy` | Deploy a snapshot |
| `GET` | `/api/accounts/:id/certification/active` | Read active deployment data |
| `POST` | `/api/accounts/:id/certification/pause` | Pause certification |
| `POST` | `/api/accounts/:id/certification/resume` | Resume certification |
| `POST` | `/api/accounts/:id/certification/abort` | Abort certification |

### Recycle Bin

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/accounts/:id/recycle-bin` | List recoverable records |
| `POST` | `/api/accounts/:id/recycle-bin/:binItemId/restore` | Restore a record |
| `DELETE` | `/api/accounts/:id/recycle-bin` | Clear records into the audit archive |

## Important Files

| File | Responsibility |
|---|---|
| `src/account/account-manager.js` | Account storage, migrations, CRUD, coverage analysis, prompt compilation, and base seeding |
| `src/account/demo-data-enhancements.js` | Idempotent rich demo sections, policies, tools, and tests |
| `src/tools/virtual-tool-manager.js` | Tool schema normalization and storage |
| `src/runner/batch-runner.js` | Scenario runtime construction and sequential execution |
| `src/certification/certification-manager.js` | Snapshots, certification lifecycle, and deployment history |
| `src/server.js` | Express and WebSocket APIs |
| `public/index.html` | Application structure and dialogs |
| `public/js/app.js` | Client state, routing, forms, account switching, chat, and certification UI |
| `public/css/style.css` | Sidebar, editors, status, modal, and responsive presentation |
| `test/unit-test.js` | Main regression suite |

## Verification Status

The current `npm test` run passes and covers:

- Telephony tones, line impairment, resampling, and WAV encoding.
- Procedure/scenario schema normalization.
- Isolated tool execution and calendar synchronization.
- Account, company profile, policy, procedure, tool, and Recycle Bin behavior.
- Six-block assistant prompt compilation.
- Standalone scenario runtime mapping and private caller instructions.
- Collision-safe scenario identifiers.
- Idempotent demo-data enrichment.
- Destructive plural-to-single assistant migration.
- Certification snapshots and active deployment history.

The current browser verification confirms:

- No global header, account dropdown, active pill, or API-key status dot.
- Direct singular Assistant editing.
- Clean Account Settings footer styling with no Recycle Bin count.
- Account-card switching.
- Enriched company, tool, policy, and scenario views.
- Certification assistant auto-selection.
- No observed client runtime errors.

## Maintainer Invariants

1. Preserve exactly one `assistant.yaml` per account.
2. Do not reintroduce assistant collections, assistant selection, or assistant deletion.
3. Keep account switching and API configuration in Account Settings; do not restore global header controls.
4. Keep test scenarios top-level and link them to policies/procedures by stable references.
5. Authorize tools through procedure actions, never directly on the assistant.
6. Preserve the `/#/account/:accountId/...` deep-link convention.
7. Keep multi-line inputs auto-growing without internal scrollbars.
8. Keep runtime data and secrets outside Git.
9. Keep demo enrichment idempotent and additive.
10. Run `npm test` after implementation changes.

## Known Operational Notes

- Voice previews, live voice interaction, AI generation, and automated judging require a valid Gemini API key and network access.
- `npm run test:models` and `npm run test:simulation` are integration-oriented and may consume API quota.
- The `data/` directory is intentionally untracked; code-based migrations and demo enrichment apply runtime changes at startup.
- Historical certification snapshots may retain assistant IDs even though the live model now has one assistant per account.
