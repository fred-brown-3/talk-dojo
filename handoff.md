# Talk Dojo 🥋 — Project Handover & System State

**Generated At**: August 31, 2026  
**Active Port**: `http://localhost:3000`  
**Current Account**: Smoky Mountain Health (`acc-1788055840607`)  
**Active Assistant**: Janet (`Aoede` voice timbre)

---

## 1. Executive Summary

Talk Dojo is an enterprise Voice AI simulation laboratory and sparring platform powered by Google Gemini Live (Multimodal Bidirectional WebSocket API) and Gemini Flash (LLM Judge and Fast Speech-to-Text). 

In this session, we executed a complete overhaul of the Assistant Persona and dedicated Test Chat experience, resolved critical audio streaming bugs, implemented full-duplex speech-to-text transcription, and added an in-app Call Review modal with full WAV audio recording playback.

---

## 2. Key Accomplishments & Changes

### A. Persona Configuration & Conversational Cadence
- **Removed Conversational Guidelines Card**:
  - The former guidelines & manners section was completely removed from the UI and backend prompt compiler.
  - The system prompt now strictly compiles **5 Blocks** (Company Info, Policies, Procedures, Persona & Backstory, and Authorized Tool Capabilities).
- **Speaking Style (Multi-Line `textarea`)**:
  - Replaced the single-line input with an auto-growing multi-line textarea (`#asst-speaking-style-input`).
  - Allows comprehensive voice-acting and emotional directives (e.g. routine telephone tone, matter-of-fact receptionist delivery, monotone cadence on greeting).
- **Listening Style & Active Backchanneling (Multi-Line `textarea`)**:
  - Added a dedicated multi-line textarea (`#asst-listening-style-input`) defaulted to:
    `dynamic - occasional verbal confirmation that the agent is listening while the user continues to speak - hmmm, ok, I see.`
  - Injected acoustic active listening directives into `GeminiLiveClient.prototype.sendSetup` so the assistant provides brief verbal confirmations ("uh-huh", "hmm", "ok", "I see") during pauses in caller speech.
- **Natural, Non-Chipper Phone Greeting**:
  - Neutralized the kickoff prompt in `CallSession.prototype.start` to replace forced enthusiastic wording ("warmly") with a routine, grounded instruction:
    `"The telephone call has just connected and you answered. Greet the caller in your natural routine phone cadence: "${greeting}""`
- **Collapsible Persona Refiner**:
  - The AI generation box on the Persona page is encapsulated in a collapsible card (`#asst-ai-refine-collapsible`).
  - Automatically **collapsed by default** when persona data exists, preserving screen space for routine adjustments.

---

### B. Dedicated Test Chat & Voice Sparring (`#/account/:id/assistant/chat`)
- **Navigation & Sub-Routing**:
  - Replaced the flat Assistant navigation tab with a tree group containing **"Persona"** (`#/account/:id/assistant/persona`) and **"Test Chat"** (`#/account/:id/assistant/chat`).
- **Left Panel (Scenario Setup)**:
  - Scenario dropdown picker auto-populates fields from existing account test scenarios or custom freeform tests.
  - **Call Direction Toggle**: Switch between **Inbound** (Assistant answers & greets first) and **Outbound** (Customer answers & speaks first).
  - "Update Scenario" (updates existing test scenarios) and "Save as New Scenario" (saves into permanent test scenario bank).
- **Right Panel (Smartphone Glass Screen Chassis)**:
  - Phone header: Contact avatar with glowing cyan ring (`🤖`), Assistant name ("Janet"), live status pill, digital timer (`00:00`), and Quick Reset button (`🔄`).
  - **Round Tactile Keypad Controls**:
    - **📞 Call**: Large green-glowing button to start duplex voice call.
    - **🎤 Mute**: Round glass button to mute/unmute local microphone.
    - **⏸️ Hold / Resume**: Amber-glowing pause button that silences both audio lines via `AudioSwitchboard` without terminating the call session. The timer pauses and button flips to **▶️ Resume**.
    - **🛑 End**: Red-glowing hangup button that cleanly ends the call session, stops audio playback, and surfaces the Review button.
    - **🗑️ Clear**: Clears transcript feed and conversation history.
  - **Dark Neon Send Button**: Replaced unstyled white button with `.btn-send-cyan` (dark translucent cyan with arrow indicator).

---

### C. Audio Overlap & Echo Resolution
- **Bug 1: Broadcast Over-Routing**:
  - `src/server.js` was broadcasting live call events to all connected WebSocket clients. If multiple tabs or windows were open, or a socket reconnected, audio was played back across all clients simultaneously.
  - **Fix**: Implemented client-specific unicast routing (`sendCallEvent(event)`) tied strictly to the initiating WebSocket connection.
- **Bug 2: Playback Buffer Clamp (The "5 Voices at Once" Bug)**:
  - In `public/js/audio-manager.js`, `playPCMChunk` contained a clamp:
    `else if (this.nextPlayTime > currentTime + 0.4) { this.nextPlayTime = currentTime + 0.025; }`
  - Because Gemini Live streams several seconds of audio in bursts of a few hundred milliseconds, this clamp reset the playhead backwards into the past every 400ms. Subsequent segments of the assistant's sentence were scheduled to play concurrently on top of earlier segments, creating the effect of 5 assistant voices speaking at once.
  - **Fix**: Removed the clamp. Chunks are now queued strictly sequentially (`this.nextPlayTime += audioBuffer.duration`), ensuring smooth, single-voice, natural playback.
- **Immediate Session Teardown**: Added `destroy()` to `CallSession` and `AudioSwitchboard` to immediately disconnect Gemini Live sockets and strip event listeners before initializing a new call.
- **Automated Overlap Test**: Created `test/test-audio-overlap.js` which verifies single-stream audio, hold state toggling, and clean session handoff.

---

### D. Verbatim Speech-to-Text Transcripts
- **Elimination of `[Spoken voice response]`**:
  - In Gemini Multimodal Live (`responseModalities: ["AUDIO"]`), text tokens are not sent for spoken turns.
  - Created `src/audio/audio-transcriber.js` which takes raw PCM buffers, encodes them to WAV, and transcribes them using Gemini 3.6 Flash multimodal input.
  - When an assistant turn completes, the audio buffer is transcribed and emitted via `turnUpdated` over WebSocket, immediately replacing placeholder labels with actual spoken words in the transcript feed.
- **Caller Microphone Audio Transcription**:
  - In `CallSession`, incoming PCM chunks from the user's browser microphone are collected. When the caller pauses, the turn is automatically transcribed and inserted into the conversation history with role `caller` and timestamps.

---

### E. Call Review & Audio Recording Player Modal
- **Interactive Review Modal (`#modal-call-review`)**:
  - Centered dark-glass modal floating over the viewport when **"🔍 Review"** is clicked.
  - **Full Call Audio Player**: Streams the saved WAV recording (`/api/runs/:id/audio`) with playback and scrub controls.
  - **AI Referee Scorecard**: Overall score badge, assessment summary, and actionable coaching tips.
  - **Verbatim Dual-Speaker Transcript**: Turn-by-turn bubbles with role tags and timestamps.
  - **Export Run Report**: One-click download of the complete JSON run report.

---

## 3. Architecture & File Reference

| File | Purpose |
|---|---|
| [`src/server.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/server.js) | Express HTTP server + WebSocket switchboard. Handles REST API, audio streaming endpoints (`/api/runs/:id/audio`), and unicast live call routing. |
| [`src/session/call-session.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/session/call-session.js) | Live call session orchestrator. Manages Gemini Live client, human microphone ingestion, turn transcript collection, WAV recording export, and LLM Judge evaluation. |
| [`src/audio/audio-transcriber.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/audio/audio-transcriber.js) | Fast speech-to-text service leveraging Gemini Flash multimodal audio input to transcribe PCM turns. |
| [`src/audio/switchboard.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/audio/switchboard.js) | Duplex DSP audio matrix. Routes audio between caller, callee, and monitor lines, with hold state line muting. |
| [`src/audio/wav-encoder.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/audio/wav-encoder.js) | Encodes 16-bit linear PCM audio into standard RIFF WAV buffers. |
| [`src/gemini/live-client.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/gemini/live-client.js) | Client for Google Gemini Multimodal Live API (`BidiGenerateContent` WebSocket). Handles bi-directional audio streaming, function call dispatching, and turn transcription. |
| [`src/account/account-manager.js`](file:///Users/fredbrown/Documents/github/talk-dojo/src/account/account-manager.js) | Account data layer. Compiles the strict 5-block system prompt including Speaking Style & Listening Style. |
| [`public/index.html`](file:///Users/fredbrown/Documents/github/talk-dojo/public/index.html) | Single-page application markup. Contains Persona editor, Test Chat side-by-side console, phone chassis, and Call Review modal. |
| [`public/css/style.css`](file:///Users/fredbrown/Documents/github/talk-dojo/public/css/style.css) | Cyberpunk / dark-glass design system. Phone chassis, tactile keypad buttons, audio visualizer, and modal overlay styles. |
| [`public/js/app.js`](file:///Users/fredbrown/Documents/github/talk-dojo/public/js/app.js) | Frontend application controller. Manages navigation, WebSocket messaging, phone controls, audio playback, and review modal. |
| [`public/js/audio-manager.js`](file:///Users/fredbrown/Documents/github/talk-dojo/public/js/audio-manager.js) | Web Audio API client. Microphone capture downsampled to 16kHz PCM; sequential playback queue for 24kHz assistant audio. |
| [`test/test-audio-overlap.js`](file:///Users/fredbrown/Documents/github/talk-dojo/test/test-audio-overlap.js) | Automated integration test verifying single-stream audio, hold state toggling, and clean session teardown. |

---

## 4. How to Run & Verify

### Starting the Server
```bash
npm start
# Server listens on http://localhost:3000
```

### Running Tests
```bash
# Run all unit test suites
npm test

# Run isolated audio overlap and stream integrity test
node test/test-audio-overlap.js

# Test Gemini API models
npm run test:models
```

### Key URLs
- **Assistant Persona**: `http://localhost:3000/#/account/acc-1788055840607/assistant/persona`
- **Test Chat & Sparring**: `http://localhost:3000/#/account/acc-1788055840607/assistant/chat`
- **Audio Recording API**: `http://localhost:3000/api/runs/:runId/audio`

---

## 5. Upcoming Roadmap & Next Steps

1. **Twilio Telephony Integration**:
   - Connect incoming and outgoing PSTN calls via Twilio Voice Webhooks and Media Streams.
   - Route Twilio μ-law 8kHz audio through `AudioResampler` and `AudioSwitchboard` to Gemini Live.
2. **Certification Presets**:
   - Allow saving batch scenario runners with custom pass/fail threshold criteria.
3. **Advanced Active Listening Controls**:
   - Provide visual sensitivity dials for backchannel interjections on the Assistant Persona screen.
