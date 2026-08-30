# Talk Dojo 🥋 — Enterprise Voice AI Platform & Telephony Simulation Laboratory

**Version:** 1.0.0-beta.1 (Initial Beta Release)  
**License:** MIT  

Talk Dojo is an enterprise voice-to-voice testing laboratory, sparring arena, and deployment platform designed to train, stress-test, certify, and benchmark LLM telephone assistants. It enables organizations to establish company identity, configure compliance guardrails, author MCP-compatible tools, enforce strict procedure boundaries, and certify assistants against realistic customer scenarios over real-time simulated telephone audio.

---

## 🌟 Key Features & Capabilities

### 1. 🏢 Company Identity & Dynamic Markdown Sections (`SEC-xxx`)
- **Dynamic Markdown Section Cards**: Define organization background, phonetic pronunciation guides, alternate caller acronyms, contact details, operating hours, and core slogans.
- **Reference Tagging**: Automatically parses Markdown headers into discrete cards (`SEC-001`, `SEC-002`, etc.) with a raw Markdown editor toggle.
- **Block 1 Prompt Injection**: Automatically compiled into Block 1 of every virtual assistant's prompt for high-fidelity business context.

### 2. 🛠️ Normalized MCP Tool Integrations & Live AI Generation
- **MCP-Compatible Schemas**: Define callable tools with explicit parameter schemas, example call parameters, expected response schemas, and example call responses.
- **AI Tool Generator**: Generate full tool schemas from natural language prompts, featuring an animated waiting spinner with an elapsed-seconds timer.
- **Procedure-Governed Access**: Tools are strictly authorized and constrained by Procedures.

### 3. 📜 Immutable Compliance Policies (`POL-xxx`)
- **Three Policy Tiers**:
  - **Always**: Mandatory directives executed on every call (e.g. HIPAA 2-factor ID verification).
  - **Never**: Strict prohibitions and compliance guardrails (e.g. never give medical advice).
  - **Conditional**: Triggered directives with explicit condition triggers and mandatory actions.
- **Reference Identifiers**: Each policy receives a clean ID (`POL-001`, `POL-002`, etc.) allowing exact violation reporting and auditing.

### 4. 📋 Procedures with Granular Tool Actions (`PROC-xxx`)
- **Authorized Workflows**: Define step-by-step instructions that assistants are permitted to handle on phone calls.
- **Action Authorization**: Checkbox governance authorizes specific endpoints/actions per procedure.
- **Out-of-Scope Declination Mandate**: If a caller request falls outside enabled procedures, the assistant strictly and politely declines.

### 5. 🏦 Standalone Test Scenarios & Coverage (`TEST-xxx`)
- **Multi-Target Links**: Each scenario can validate multiple policies and procedures.
- **Coverage Detection**: Enabled policies and procedures without an enabled test are highlighted as gaps.
- **Certification Runtime Mapping**: Linked procedure actions become the assistant's isolated test toolbelt, while customer personas receive private roleplay instructions.

### 6. 🤖 Virtual Assistants Studio & Gemini Live Audio Previews
- **Authentic Personas**: Configure names, backstories, personality styles, and conversational guidelines.
- **Gemini Live Bidi WebSocket Audio Previews**: Streams native audio directly from Google's Gemini Live API (`gemini-2.5-flash-native-audio-latest`), cached on disk in `data/voice-previews/` for static-free, zero-latency 10-second previews across all 5 voices:
  - `Aoede`: Warm, breezy & natural female timbre (~240 Hz).
  - `Fenrir`: Deep, resonant & authoritative male timbre (~110 Hz).
  - `Charon`: Calm, clinical & measured male timbre (~140 Hz).
  - `Kore`: Bright, cheerful & energetic female timbre (~280 Hz).
  - `Puck`: Casual, friendly & conversational neutral timbre (~175 Hz).
- **Embedded Voice-First Sparring Window**: Spar directly with your assistant using microphone or text inside an embedded call container, complete with AI Referee evaluation scoring.

### 7. 🏆 Sequential Certification Runner & Production Deployments
- **Full Test Suite Certification**: Runs assistants sequentially across all enabled standalone scenarios in either ultra-fast Text mode or high-fidelity Voice telephony mode.
- **Interactive Live Controls**: Includes **⏸ Pause**, **▶ Continue**, and **↺ Restart** controls.
- **Instant Turn-by-Turn Streaming**: WebSocket emits turns live; clicking any test in the checklist displays transcript turns and audio immediately.
- **Frozen Snapshots & Active Deployments**: Freezes company info, policies, procedures, tools, and assistant configurations into deployable snapshots with audit logs.

### 8. 📞 Telephony DSP & Line Impairment Engine
- Injects configurable telephone line static, pink noise, high-frequency hiss, and micro-crackles on the Caller channel, Callee channel, or both.
- Optional PSTN Landline Bandpass filter (300 Hz – 3.4 kHz) simulating copper telephone wire frequency response.
- Procedural acoustic synthesis for standard North American dial tones, ringback tones, connect clicks, and disconnect beeps.

---

## 🧭 Navigation Hierarchy & Deep-Link Hash Routing

Talk Dojo uses parent account GUIDs for deep linking across all views:
```
1. 🏢 Account              -> /#/account/:accountId/info
2. 🛠️ Tools                -> /#/account/:accountId/tools/all?id=<toolId>  |  /#/account/:accountId/tools/new
3. 📜 Policies             -> /#/account/:accountId/policies/all_enabled?id=<policyId>
4. 📋 Procedures           -> /#/account/:accountId/procedures/all_enabled?id=<procId>
5. 🏦 Test Scenarios       -> /#/account/:accountId/testscenarios/all?id=<testId> | /#/account/:accountId/testscenarios/new
6. 🤖 Assistants           -> /#/account/:accountId/assistants/all?id=<asstId>  |  /#/account/:accountId/assistants/new
7. 🏆 Certification        -> /#/account/:accountId/certification/history  |  /#/account/:accountId/certification/new
```

Sharing any URL automatically opens the exact account context, tab, sub-filter, and selected entity.

---

## 🚀 Quick Start

### 1. Requirements
- **Node.js**: v18.0.0+ (Node.js 20+ or 24+ recommended)
- **Google Gemini API Key**: Obtain a key from [Google AI Studio](https://aistudio.google.com/)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/fred-brown-3/talk-dojo.git
cd talk-dojo
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your Gemini API key in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-latest
GEMINI_JUDGE_MODEL=gemini-3.6-flash
```
*(Alternatively, you can save your API key securely through the browser interface header)*

### 4. Run Locally
```bash
npm run dev
# or: npm start
```
Open your browser to:
```
http://localhost:3000
```

---

## 🧪 Automated Unit Testing

Talk Dojo includes 8 comprehensive automated unit test suites testing telephony tones, line noise DSP, audio resampling, WAV encoding, tool execution, dual calendar sync, GUID account architecture, `SEC-xxx` dynamic Markdown cards, `POL-xxx` policies, `PROC-xxx` procedures, 6-block prompt compilation, and snapshot certification:

```bash
npm test
```

Expected output:
```text
🧪 Starting Talk Dojo Unit Tests...
Testing Telephony Tones...
Testing Line Noise & Impairment DSP...
Testing Audio Resampler...
Testing WAV Encoder...
Testing Scenario Store & YAML parsing...
Testing ToolExecutor & Isolated Agent Toolbelts...
Testing Healthcare 2-Identifier Verification & Dual Calendar Sync...
   Synchronized Slot Confirmed: Next Wednesday at 3:15 PM
Testing Enterprise Account Architecture with GUIDs, Policies, & Procedures...
Testing Company Info Dynamic Markdown Cards (SEC-xxx)...
   Dynamic Markdown Sections (SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006) Confirmed
Testing Policies with Clean Reference Identifiers (POL-xxx)...
   Policies Confirmed: [POL-001] always, [POL-002] never, [POL-003] conditional, ...
Testing Procedures with Tool Authorization & Scenarios (PROC-xxx)...
   Procedures Confirmed: [PROC-002] Schedule Clinic Appointment (1 test scenario)
   Strict 6-Block Prompt Compilation Confirmed
   Recycle Bin Soft-Delete Confirmed (1 items in bin)
   Recycle Bin Item Restored Successfully
   Virtual Tools (Normalized MCP Schemas) Confirmed: 2 services
Testing Standalone Test Scenarios & Certification Runtime Mapping...
   Standalone Scenarios Confirmed (2 authorized runtime actions)
   Certification Snapshots & Active Deployment History Confirmed
✅ ALL TESTS PASSED SUCCESSFULLY!
```

---

## 🔒 Security & Data Privacy

- **No Secrets in Git**: Runtime accounts, policy records, user files, call audio recordings, and credentials are strictly excluded via `.gitignore`.
- **Soft-Delete Recycle Bin**: Deletions are safely staged in `recycle-bin/` where they can be restored or cleared to an immutable audit archive.
- **Isolated Sandboxes**: Tool execution data is strictly isolated per agent toolbelt.

---

## 🏦 Standalone Test Scenarios & Certification

Test scenarios are stored independently under each account and link to one or more **Policies** (`POL-xxx`) and **Procedures** (`PROC-xxx`):
- Coverage warnings identify enabled policies or procedures without an enabled scenario.
- Scenarios define the customer role, private instructions, and objective evaluation criteria.
- Certification runs all enabled top-level scenarios and exposes only actions authorized by their linked procedures.
