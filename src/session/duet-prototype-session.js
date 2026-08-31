import EventEmitter from 'events';
import { DuetLiveChannel } from '../gemini/duet-live-channel.js';
import { config } from '../config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));
const CURRENT_DUET_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const normalizeDuetModel = (model) => {
  const raw = String(model || '').replace(/^models\//, '');
  if (!raw || raw === 'gemini-2.5-flash-native-audio-latest') {
    return CURRENT_DUET_MODEL;
  }
  return raw;
};

export const buildDuetInstructions = ({
  assistantName = 'Assistant',
  assistantPrompt = 'You are a professional telephone assistant.',
  listeningStyle = '',
  voice = 'Aoede',
} = {}) => {
  const mainInstruction = `${assistantPrompt}

DUET LAB MAIN-VOICE RULES:
- You are the primary conversational agent and own every substantive response.
- Wait until the caller has completed their thought before answering.
- Do not produce filler acknowledgements such as "mm-hmm", "uh-huh", or "I see" while the caller is speaking; a separate listening channel handles those.
- Never mention the listening channel or this experiment.
- Keep spoken telephone responses concise and natural.`;

  const listenerInstruction = `You are an active backchannel audio generator. You do NOT answer questions or converse substantively.
Your only job is to emit single, ultra-short conversational reaction tokens based on the speaker's emotional tone or narrative flow:

- If they share something surprising/troubling: emit a soft tongue click ("tsk") or quiet gasp.
- If they are listing items or making a continuous point: emit a subtle "mm-hmm", "yep", or "ah".

Constraints:

- Response MUST be under 1 second of audio.
- Never output full sentences.
- Always choose one brief reaction token when a natural micro-pause is presented.
- Never interrupt continuous rapid speech; only fire on natural micro-pauses (300-500ms).`;

  return { mainInstruction, listenerInstruction };
};

/**
 * Two-channel experimental call used by /duet-lab.html only.
 * The main channel owns substantive answers. The listener channel may only
 * produce short, content-aware acknowledgements.
 */
export class DuetPrototypeSession extends EventEmitter {
  constructor({
    apiKey,
    model = config.geminiLiveModel,
    voice = 'Aoede',
    assistantName = 'Assistant',
    assistantPrompt = 'You are a professional telephone assistant.',
    listeningStyle = '',
    mainInstruction = '',
    listenerInstruction = '',
    mainSilenceMs = 950,
    listenerSilenceMs = 280,
  }) {
    super();
    this.id = `duet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.apiKey = apiKey;
    this.model = normalizeDuetModel(model);
    this.voice = voice;
    this.assistantName = assistantName;
    this.assistantPrompt = assistantPrompt;
    this.listeningStyle = listeningStyle;
    this.mainInstructionOverride = String(mainInstruction || '').trim();
    this.listenerInstructionOverride = String(listenerInstruction || '').trim();
    this.mainSilenceMs = clamp(mainSilenceMs, 600, 2500);
    this.listenerSilenceMs = clamp(listenerSilenceMs, 150, 700);
    this.main = null;
    this.listener = null;
    this.started = false;
    this.listenerInputOpen = false;
  }

  createChannels() {
    const defaults = buildDuetInstructions({
      assistantName: this.assistantName,
      assistantPrompt: this.assistantPrompt,
      listeningStyle: this.listeningStyle,
      voice: this.voice,
    });
    const mainInstruction = this.mainInstructionOverride || defaults.mainInstruction;
    const listenerInstruction = this.listenerInstructionOverride || defaults.listenerInstruction;

    this.main = new DuetLiveChannel({
      apiKey: this.apiKey,
      model: this.model,
      voice: this.voice,
      systemInstruction: mainInstruction,
      channel: 'main',
      silenceDurationMs: this.mainSilenceMs,
      noInterruption: false,
    });

    this.listener = new DuetLiveChannel({
      apiKey: this.apiKey,
      model: this.model,
      voice: this.voice,
      systemInstruction: listenerInstruction,
      channel: 'listener',
      // Client-side clause detection explicitly flushes this channel. Keep a
      // conservative server VAD fallback so it does not race natural pauses.
      silenceDurationMs: Math.max(this.listenerSilenceMs, 1200),
      noInterruption: true,
      manualActivity: true,
      generationConfig: {
        temperature: 0.7,
      },
    });

    this.wireChannel(this.main);
    this.wireChannel(this.listener);
  }

  wireChannel(channel) {
    const forward = (type) => (data) => this.emit(type, data);
    channel.on('ready', forward('channelReady'));
    channel.on('audio', forward('audio'));
    channel.on('transcript', forward('transcript'));
    channel.on('generationStart', forward('generationStart'));
    channel.on('generationComplete', forward('generationComplete'));
    channel.on('turnComplete', forward('turnComplete'));
    channel.on('interrupted', forward('interrupted'));
    channel.on('waitingForInput', forward('waitingForInput'));
    channel.on('usage', forward('usage'));
    channel.on('close', forward('channelClose'));
    channel.on('error', (error) => this.emit('error', {
      channel: channel.channel,
      message: error.message,
    }));
  }

  async start() {
    if (this.started) return;
    this.createChannels();
    await Promise.all([this.main.connect(), this.listener.connect()]);
    this.started = true;
    this.listenerInputOpen = false;
    this.emit('ready', {
      sessionId: this.id,
      model: this.model,
      voice: this.voice,
      mainSilenceMs: this.mainSilenceMs,
      listenerSilenceMs: this.listenerSilenceMs,
      mainInstruction: this.main.systemInstruction,
      listenerInstruction: this.listener.systemInstruction,
    });
  }

  sendAudio(buffer) {
    if (!this.started) return;
    this.main.sendAudio(buffer);
    if (this.listenerInputOpen) this.listener.sendAudio(buffer);
  }

  beginListenerClause() {
    if (!this.started || this.listenerInputOpen) return;
    this.listener.sendActivityStart();
    this.listenerInputOpen = true;
  }

  endListenerClause() {
    if (!this.started || !this.listenerInputOpen) return;
    this.listener.sendActivityEnd();
    this.listenerInputOpen = false;
  }

  endAudioStream() {
    if (!this.started) return;
    this.main.sendAudioStreamEnd();
    this.endListenerClause();
  }

  destroy() {
    this.started = false;
    this.listenerInputOpen = false;
    if (this.main) this.main.disconnect();
    if (this.listener) this.listener.disconnect();
    this.main = null;
    this.listener = null;
    this.removeAllListeners();
  }
}
