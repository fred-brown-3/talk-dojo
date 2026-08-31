# Talk Dojo 🥋

Talk Dojo is an enterprise voice-AI testing, sparring, certification, and deployment platform for telephone assistants. Organizations define their business context, callable tools, compliance policies, approved procedures, and adversarial test scenarios, then evaluate one account-specific assistant in text or high-fidelity voice mode.

**Version:** 1.0.0-beta.1  
**Runtime:** Node.js 18+  
**License:** MIT  

> [!NOTE]
> **Prototype & Proof of Concept Status:**  
> This project is an experimental prototype, rapid proof of concept, and testing ground built during an intensive 48-hour hackathon to explore real-time voice AI mechanics, acoustic latencies, dual-channel backchanneling, and legal practice workflows. It is **not a finished, production-ready product**—please don't judge too harshly if you encounter a rough edge or something isn't fully working! It is shared openly as an authentic engineering exploration.
>
> 📄 **Looking for the Strategic & Technical Architecture Memo?**  
> For the complete lessons learned, architectural blueprints, product roadmap (MVP vs. Extended), and prototype screenshots, check out:  
> 👉 **[Architecting the Legal Virtual Assistant: Strategic Lessons from a 48-Hour Voice AI Hackathon](legal-voice-ai-lessons-learned.md)**

## Current Product Model

- Every account has exactly one assistant stored at `data/accounts/<account-id>/assistant.yaml`.
- Account switching, API configuration, and the Recycle Bin live under **Account Settings** at the bottom of the sidebar.
- The application has no global top header, account dropdown, assistant selector, deployment pill, or API-key status dot.
- Certification automatically uses the account’s assistant. The only setup choice is execution mode: **Text** or **Voice**.
- Runtime account data and credentials are excluded from Git.

## Main Capabilities

### Company Profile

Company knowledge is stored in Markdown and rendered as editable `SEC-xxx` cards. Sections cover organization identity, pronunciation, locations, operating hours, departments, escalation paths, service details, and other context compiled into every assistant prompt.

### Tools

Account-level service definitions use MCP-style endpoint schemas with:

- Typed input parameters and required fields.
- Example call parameters.
- Expected response schemas.
- Example responses.
- AI-assisted schema generation from a natural-language description.

Procedures authorize individual endpoint actions; assistants do not own tool assignments directly.

### Policies

Compliance policies use stable `POL-xxx` references and three rule types:

- **Always:** mandatory behavior.
- **Never:** strict prohibitions and guardrails.
- **Conditional:** actions triggered by a defined situation.

Coverage indicators show policies that are not exercised by an enabled test scenario.

### Procedures

Procedures use `PROC-xxx` references and define approved workflows, ordered steps, constraints, and granular tool-action authorization. Requests outside enabled procedures must be politely declined.

### Test Scenarios

Standalone `TEST-xxx` scenarios can link to multiple policies and procedures. Each scenario defines a private customer role, objective, behavior instructions, maximum turns, and required referee criteria. The UI detects coverage gaps and can draft missing tests.

### Assistant

Each account’s single assistant has an editable name, voice, personality, backstory, and conversational guidelines. The editor includes an AI persona-refinement helper and an embedded text/voice sparring window.

Supported Gemini Live voices are `Aoede`, `Fenrir`, `Charon`, `Kore`, and `Puck`. Generated preview WAV files are cached under `data/voice-previews/`.

### Certification

Certification runs all enabled top-level scenarios against the current account configuration. It supports:

- Text and voice execution.
- Live WebSocket progress and transcripts.
- Pause, resume, restart, and abort controls.
- Frozen configuration snapshots.
- Certification history and active deployment management.

## Navigation

```text
1. Company Profile   /#/account/:accountId/info
2. Tools             /#/account/:accountId/tools/all?id=<toolId>
3. Policies          /#/account/:accountId/policies/all_enabled?id=<policyId>
4. Procedures        /#/account/:accountId/procedures/all_enabled?id=<procedureId>
5. Test Scenarios    /#/account/:accountId/testscenarios/all?id=<testId>
6. Assistant         /#/account/:accountId/assistant/edit
7. Certification     /#/account/:accountId/certification/history
8. Account Settings  /#/account/:accountId/accountsettings/overview
```

Account Settings opens the account-card switcher and provides API-key and Recycle Bin access.

## Demo Data

Fresh installations create medical, legal, and real-estate demo accounts. Existing recognized demo accounts are enriched idempotently at startup, including the current healthcare-advocacy sandbox when present.

Each visible demo workspace currently has:

- Nine company-profile sections.
- At least seven policies.
- At least three multi-endpoint service definitions.
- Four or more enabled test scenarios.

The richer examples cover patient billing and advocacy, privacy and authorization, civil-litigation intake, conflicts and deadlines, secure legal documents, court dockets, Fair Housing, property management, emergency maintenance, and transaction coordination. Enrichment only adds missing named records, so repeated starts do not duplicate data.

## Quick Start

```bash
git clone https://github.com/fred-brown-3/talk-dojo.git
cd talk-dojo
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Configure the Gemini key either in `.env` or in **Account Settings → API Configuration**:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-latest
GEMINI_JUDGE_MODEL=gemini-3.6-flash
```

For automatic restart during development, use `npm run dev`.

## Verification

Run the main regression suite:

```bash
npm test
```

It currently verifies telephony DSP, audio conversion, procedure/test normalization, isolated tool execution, account storage, Markdown section cards, policy and procedure CRUD, six-block prompt compilation, Recycle Bin restore, standalone scenario runtime mapping, demo-data idempotency, the single-assistant migration, and certification snapshots.

Additional targeted scripts are available as `npm run test:models` and `npm run test:simulation`; these may require a configured Gemini API key.

## Data and Safety Notes

- `data/` and `.env*` remain outside Git.
- Legacy plural `assistants/` directories are destructively collapsed to one canonical `assistant.yaml` per account.
- The assistant cannot be deleted or moved into the Recycle Bin.
- Policies, procedures, and scenarios use soft deletion and can be restored from Account Settings. Tool deletion is currently permanent.
- Certification snapshots preserve historical assistant IDs internally for audit compatibility.

For the detailed implementation status, API inventory, invariants, and maintainer guidance, see [PROJECT_STATUS.md](PROJECT_STATUS.md).
