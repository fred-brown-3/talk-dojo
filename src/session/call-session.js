import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import { GeminiLiveClient } from '../gemini/live-client.js';
import { AudioSwitchboard } from '../audio/switchboard.js';
import { LLMJudge } from '../gemini/judge.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { encodeWAV } from '../audio/wav-encoder.js';
import { AudioTranscriber } from '../audio/audio-transcriber.js';
import { config } from '../config.js';

export class CallSession extends EventEmitter {
  constructor({ scenario, mode = 'ai-to-ai', apiKey = config.geminiApiKey, staticLevel = null, noiseTarget = null }) {
    super();
    this.id = 'run-' + Date.now();
    this.scenario = scenario;
    this.mode = mode; // 'ai-to-ai' | 'human-to-ai-caller' | 'human-to-ai-callee'
    this.apiKey = apiKey || config.geminiApiKey;

    this.state = 'IDLE'; // IDLE -> DIALING -> RINGING -> CONNECTING -> CONNECTED -> EVALUATING -> COMPLETED
    this.startTime = null;
    this.endTime = null;

    // Line impairment configuration
    const defaultImpairments = scenario.impairments || {};
    this.staticLevel = staticLevel !== null ? staticLevel : (defaultImpairments.static_level || 0);
    this.noiseTarget = noiseTarget !== null ? noiseTarget : (defaultImpairments.target || 'none');

    // Isolated Agent Toolbelts & Data
    this.callerToolExecutor = new ToolExecutor(
      'caller',
      scenario.caller?.tools || [],
      scenario.caller?.data || {}
    );
    this.calleeToolExecutor = new ToolExecutor(
      'callee',
      scenario.callee?.tools || [],
      scenario.callee?.data || {}
    );
    this.toolExecutionLogs = [];

    // Switchboard and clients
    this.switchboard = new AudioSwitchboard();
    this.switchboard.setImpairments({
      staticLevel: this.staticLevel,
      target: this.noiseTarget,
      applyBandpass: defaultImpairments.apply_bandpass !== false,
    });

    this.callerClient = null;
    this.calleeClient = null;
    this.judge = new LLMJudge(this.apiKey);

    // Recording buffers
    this.recordedPCMChunks = [];
    this.transcriptTurns = [];
    this.activeTurnBySpeaker = { caller: '', callee: '' };
    this.turnCount = 0;
    this.evaluation = null;
    this.humanAudioChunks = [];
    this.humanAudioTimer = null;

    this.wireSwitchboardEvents();
  }

  wireSwitchboardEvents() {
    this.switchboard.on('monitorAudio', (data) => {
      this.recordedPCMChunks.push(data.buffer);
      this.emit('audioMonitor', data);
    });

    this.switchboard.on('telephonyAudio', (data) => {
      this.recordedPCMChunks.push(data.buffer);
      this.emit('telephonyAudio', data);
    });
  }

  setState(newState) {
    this.state = newState;
    this.emit('stateChange', { state: newState, sessionId: this.id });
  }

  /**
   * Adjust line static dynamically while call is active
   */
  setStatic(level, target) {
    this.staticLevel = level;
    if (target) this.noiseTarget = target;
    this.switchboard.setImpairments({
      staticLevel: this.staticLevel,
      target: this.noiseTarget,
    });
    this.emit('impairmentChanged', {
      staticLevel: this.staticLevel,
      target: this.noiseTarget,
    });
  }

  /**
   * Start the telephone call sequence
   */
  async start() {
    if (this.state !== 'IDLE') return;

    this.startTime = Date.now();

    // 1. DIALING phase
    this.setState('DIALING');
    this.switchboard.emitTelephonyTone('dial');
    await new Promise(r => setTimeout(r, 1200));

    // 2. RINGING phase
    this.setState('RINGING');
    this.switchboard.emitTelephonyTone('ringback');

    // Initialize Gemini Live clients in parallel while phone is ringing
    const initPromises = [];

    const isCallerAI = this.mode === 'ai-to-ai' || this.mode === 'human-to-ai-callee';
    const isCalleeAI = this.mode === 'ai-to-ai' || this.mode === 'human-to-ai-caller';

    if (isCallerAI) {
      this.callerClient = new GeminiLiveClient({
        apiKey: this.apiKey,
        model: config.geminiLiveModel,
        voice: this.scenario.caller?.voice || 'Aoede',
        systemInstruction: this.scenario.caller?.system_instruction || 'You are making a phone call.',
        role: 'caller',
        language: this.scenario.language || 'en',
        toolExecutor: this.callerToolExecutor,
      });
      this.wireClientEvents(this.callerClient, 'caller');
      initPromises.push(this.callerClient.connect());
    }

    if (isCalleeAI) {
      this.calleeClient = new GeminiLiveClient({
        apiKey: this.apiKey,
        model: config.geminiLiveModel,
        voice: this.scenario.callee?.voice || 'Fenrir',
        systemInstruction: this.scenario.callee?.system_instruction || 'You are answering a phone call.',
        role: 'callee',
        language: this.scenario.language || 'en',
        toolExecutor: this.calleeToolExecutor,
      });
      this.wireClientEvents(this.calleeClient, 'callee');
      initPromises.push(this.calleeClient.connect());
    }

    try {
      await Promise.all(initPromises);
    } catch (err) {
      console.error('Failed to initialize Gemini Live clients:', err);
      this.emit('error', err);
      this.hangup();
      return;
    }

    // Attach to switchboard
    this.switchboard.attachClients({
      callerClient: this.callerClient,
      calleeClient: this.calleeClient,
      mode: this.mode,
    });

    // Ring for remaining duration of standard ring cadence
    await new Promise(r => setTimeout(r, 1200));

    // 3. CONNECTING phase
    this.setState('CONNECTING');
    this.switchboard.emitTelephonyTone('click');
    await new Promise(r => setTimeout(r, 200));

    // 4. CONNECTED - Line is open!
    this.setState('CONNECTED');

    // Kickstart conversation:
    // If caller is AI and has initial_greeting or prompt instruction, trigger caller to speak first
    if (this.callerClient) {
      const greeting = this.scenario.caller?.initial_greeting;
      if (greeting) {
        this.callerClient.pendingGreeting = greeting;
        this.callerClient.sendTextPrompt(`Start the phone call right now by saying: "${greeting}"`);
      } else {
        this.callerClient.sendTextPrompt("The call has just connected. Say hello and introduce yourself to begin.");
      }
    } else if (this.mode === 'human-to-ai-caller' && this.calleeClient) {
      const greeting = this.scenario.callee?.initial_greeting;
      if (greeting) {
        this.calleeClient.pendingGreeting = greeting;
        this.calleeClient.sendTextPrompt(`The telephone call has just connected and you answered. Greet the caller in your natural routine phone cadence: "${greeting}"`);
      } else {
        this.calleeClient.sendTextPrompt("The telephone call has just connected and you answered. Greet the caller in your natural routine phone cadence.");
      }
    }
  }

  /**
   * Wire client transcripts and turns
   */
  wireClientEvents(client, role) {
    client.on('transcript', (data) => {
      this.emit('transcriptPart', {
        role,
        text: data.text,
        fullText: data.fullText,
      });
    });

    client.on('turnComplete', (data) => {
      if (data.text && data.text.trim()) {
        const timeOffsetSec = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(timeOffsetSec / 60);
        const secs = timeOffsetSec % 60;
        const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        const turnObj = {
          speaker: role,
          text: data.text.trim(),
          timestamp: Date.now(),
          timeStr,
        };

        this.transcriptTurns.push(turnObj);
        this.turnCount++;
        this.emit('turnComplete', turnObj);
      }
    });

    client.on('turnUpdated', (data) => {
      for (let i = this.transcriptTurns.length - 1; i >= 0; i--) {
        if (this.transcriptTurns[i].speaker === role) {
          this.transcriptTurns[i].text = data.text;
          this.emit('turnUpdated', this.transcriptTurns[i]);
          break;
        }
      }
    });

    client.on('interrupted', () => {
      this.emit('agentInterrupted', { role });
    });

    client.on('toolExecuted', (data) => {
      const timeOffsetSec = Math.floor((Date.now() - this.startTime) / 1000);
      const mins = Math.floor(timeOffsetSec / 60);
      const secs = timeOffsetSec % 60;
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      const entry = { ...data, timeStr, timestamp: Date.now() };
      this.toolExecutionLogs.push(entry);
      this.emit('toolExecuted', entry);
    });

    client.on('error', (err) => {
      this.emit('clientError', { role, error: err.message || err });
    });
  }

  /**
   * Ingest human microphone audio
   */
  sendHumanAudio(pcm16kBuffer) {
    if (this.state === 'CONNECTED') {
      this.switchboard.handleHumanMicInput(pcm16kBuffer);
    }
  }

  /**
   * Record a human transcript turn (from web speech or manual)
   */
  recordHumanTranscriptTurn(speaker, text) {
    if (!text || !text.trim()) return;
    const timeOffsetSec = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(timeOffsetSec / 60);
    const secs = timeOffsetSec % 60;
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    const turnObj = {
      speaker,
      text: text.trim(),
      timestamp: Date.now(),
      timeStr,
    };
    this.transcriptTurns.push(turnObj);
    this.turnCount++;
    this.emit('turnComplete', turnObj);
  }

  /**
   * Hang up the phone call and initiate evaluation
   */
  async hangup() {
    if (this.state === 'COMPLETED' || this.state === 'EVALUATING') return;

    this.endTime = Date.now();
    this.setState('HANGING_UP');

    // Telephony hangup sound
    this.switchboard.emitTelephonyTone('hangup');

    // Tear down Gemini connections
    if (this.callerClient) {
      this.callerClient.disconnect();
    }
    if (this.calleeClient) {
      this.calleeClient.disconnect();
    }
    this.switchboard.reset();

    // Export WAV recording
    let wavFilename = null;
    try {
      if (this.recordedPCMChunks.length > 0) {
        const fullPCM = Buffer.concat(this.recordedPCMChunks);
        const wavBuffer = encodeWAV(fullPCM, 24000, 1);
        wavFilename = `${this.id}.wav`;
        const wavPath = path.join(config.runsDir, wavFilename);
        await fs.writeFile(wavPath, wavBuffer);
      }
    } catch (err) {
      console.error('Failed to write WAV recording:', err);
    }

    // Run automated LLM Judge evaluation
    this.setState('EVALUATING');

    const durationSec = Math.round((this.endTime - (this.startTime || this.endTime)) / 1000);

    try {
      this.evaluation = await this.judge.evaluateConversation({
        scenario: this.scenario,
        transcript: this.transcriptTurns,
        toolLogs: this.toolExecutionLogs,
        metrics: {
          durationSec,
          turnCount: this.turnCount,
          staticLevel: this.staticLevel,
          noiseTarget: this.noiseTarget,
          toolCallsCount: this.toolExecutionLogs.length,
        },
      });
    } catch (err) {
      console.error('Evaluation failed:', err);
      this.evaluation = {
        overall_passed: false,
        overall_score: 0,
        summary: `Evaluation error: ${err.message}`,
        checklist_results: [],
        coaching_feedback: [],
      };
    }

    const runReport = {
      id: this.id,
      scenarioId: this.scenario.id,
      scenarioTitle: this.scenario.title,
      mode: this.mode,
      durationSec,
      turnCount: this.turnCount,
      staticLevel: this.staticLevel,
      noiseTarget: this.noiseTarget,
      timestamp: new Date().toISOString(),
      wavFile: wavFilename,
      transcript: this.transcriptTurns,
      toolLogs: this.toolExecutionLogs,
      evaluation: this.evaluation,
    };

    // Save run report JSON
    try {
      const reportPath = path.join(config.runsDir, `${this.id}.json`);
      await fs.writeFile(reportPath, JSON.stringify(runReport, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save run report:', err);
    }

    this.setState('COMPLETED');
    this.emit('callCompleted', runReport);
    return runReport;
  }

  handleHumanAudio(pcm16Buffer) {
    if (this.switchboard) {
      this.switchboard.handleHumanMicInput(pcm16Buffer);
    }
    if (this.state === 'CONNECTED') {
      if (!this.humanAudioChunks) this.humanAudioChunks = [];
      this.humanAudioChunks.push(pcm16Buffer);

      if (this.humanAudioTimer) clearTimeout(this.humanAudioTimer);
      this.humanAudioTimer = setTimeout(() => {
        this.flushHumanAudioTurn();
      }, 900);
    }
  }

  async flushHumanAudioTurn() {
    if (!this.humanAudioChunks || this.humanAudioChunks.length === 0) return;
    const chunks = this.humanAudioChunks;
    this.humanAudioChunks = [];
    const fullPcm = Buffer.concat(chunks);

    // Only transcribe if speech duration >= 350ms
    if (fullPcm.length < 16000 * 2 * 0.35) return;

    const text = await AudioTranscriber.transcribe(fullPcm, 16000, this.apiKey);
    if (text && text.trim()) {
      const timeOffsetSec = Math.floor((Date.now() - (this.startTime || Date.now())) / 1000);
      const mins = Math.floor(timeOffsetSec / 60);
      const secs = timeOffsetSec % 60;
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      const turnObj = {
        speaker: this.mode === 'human-to-ai-caller' ? 'caller' : 'callee',
        text: text.trim(),
        timestamp: Date.now(),
        timeStr,
      };
      this.transcriptTurns.push(turnObj);
      this.turnCount++;
      this.emit('turnComplete', turnObj);
    }
  }

  handleHumanText(text) {
    if (this.mode === 'human-to-ai-caller' && this.calleeClient) {
      this.calleeClient.sendTextPrompt(text);
    } else if (this.mode === 'human-to-ai-callee' && this.callerClient) {
      this.callerClient.sendTextPrompt(text);
    }
  }

  updateImpairments(staticLevel, noiseTarget) {
    this.setStatic(staticLevel, noiseTarget);
  }

  hold() {
    if (this.state !== 'CONNECTED') return;
    this.setState('ON_HOLD');
    if (this.switchboard) {
      this.switchboard.setHold(true);
    }
    this.emit('holdState', { onHold: true });
  }

  unhold() {
    if (this.state !== 'ON_HOLD') return;
    this.setState('CONNECTED');
    if (this.switchboard) {
      this.switchboard.setHold(false);
    }
    this.emit('holdState', { onHold: false });
  }

  destroy() {
    this.removeAllListeners();
    if (this.callerClient) {
      try { this.callerClient.disconnect(); } catch (e) {}
      this.callerClient.removeAllListeners();
      this.callerClient = null;
    }
    if (this.calleeClient) {
      try { this.calleeClient.disconnect(); } catch (e) {}
      this.calleeClient.removeAllListeners();
      this.calleeClient = null;
    }
    if (this.switchboard) {
      this.switchboard.removeAllListeners();
      this.switchboard.reset();
    }
    this.state = 'COMPLETED';
  }
}
