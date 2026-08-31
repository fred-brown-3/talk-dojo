import EventEmitter from 'events';
import WebSocket from 'ws';

/**
 * Isolated Gemini Live client used only by the standalone Duet Lab prototype.
 * It intentionally does not alter the production GeminiLiveClient behavior.
 */
export class DuetLiveChannel extends EventEmitter {
  constructor({
    apiKey,
    model,
    voice = 'Aoede',
    systemInstruction,
    channel,
    silenceDurationMs,
    noInterruption = false,
    manualActivity = false,
    proactiveAudio = false,
    affectiveDialog = false,
    generationConfig = {},
  }) {
    super();
    this.apiKey = apiKey;
    this.model = model.startsWith('models/') ? model : `models/${model}`;
    this.voice = voice;
    this.systemInstruction = systemInstruction;
    this.channel = channel;
    this.silenceDurationMs = silenceDurationMs;
    this.noInterruption = noInterruption;
    this.manualActivity = manualActivity;
    this.proactiveAudio = proactiveAudio;
    this.affectiveDialog = affectiveDialog;
    this.generationConfig = generationConfig;
    this.ws = null;
    this.isReady = false;
    this.generationId = 0;
    this.generationActive = false;
  }

  buildSetup() {
    const setup = {
      model: this.model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        ...this.generationConfig,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: this.voice },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: this.systemInstruction }],
      },
      realtimeInputConfig: {
        automaticActivityDetection: this.manualActivity
          ? { disabled: true }
          : {
              disabled: false,
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              prefixPaddingMs: 40,
              silenceDurationMs: this.silenceDurationMs,
            },
        activityHandling: this.noInterruption
          ? 'NO_INTERRUPTION'
          : 'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
    };

    if (this.proactiveAudio) {
      setup.proactivity = { proactiveAudio: true };
    }
    if (this.affectiveDialog) {
      setup.enableAffectiveDialog = true;
    }
    return setup;
  }

  connect() {
    if (!this.apiKey) {
      return Promise.reject(new Error(`Gemini API key is required for the ${this.channel} channel`));
    }

    const endpoint = 'wss://generativelanguage.googleapis.com/ws/' +
      `google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`${this.channel} channel setup timed out`));
          this.disconnect();
        }
      }, 15000);

      this.ws = new WebSocket(endpoint);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ setup: this.buildSetup() }));
      });
      this.ws.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch (_err) {
          return;
        }

        if (message.setupComplete) {
          this.isReady = true;
          this.emit('ready', { channel: this.channel });
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          return;
        }

        if (message.error) {
          const detail = message.error.message || JSON.stringify(message.error);
          this.emit('error', new Error(`${this.channel}: ${detail}`));
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`${this.channel}: ${detail}`));
            try { this.ws.close(); } catch (_err) {}
          }
          return;
        }

        this.handleServerContent(message.serverContent);
        if (message.usageMetadata) {
          this.emit('usage', { channel: this.channel, ...message.usageMetadata });
        }
      });
      this.ws.on('error', (err) => {
        this.emit('error', err);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
      this.ws.on('close', (code, reason) => {
        this.isReady = false;
        this.emit('close', { channel: this.channel, code, reason: reason.toString() });
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`${this.channel} channel closed during setup`));
        }
      });
    });
  }

  handleServerContent(content) {
    if (!content) return;

    if (content.interimInputTranscription?.text) {
      this.emit('transcript', {
        channel: this.channel,
        direction: 'input',
        final: false,
        text: content.interimInputTranscription.text,
      });
    }
    if (content.inputTranscription?.text) {
      this.emit('transcript', {
        channel: this.channel,
        direction: 'input',
        final: true,
        text: content.inputTranscription.text,
      });
    }
    if (content.outputTranscription?.text) {
      this.emit('transcript', {
        channel: this.channel,
        direction: 'output',
        final: true,
        text: content.outputTranscription.text,
      });
    }

    const parts = content.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!this.generationActive) {
          this.generationActive = true;
          this.generationId += 1;
          this.emit('generationStart', {
            channel: this.channel,
            generationId: this.generationId,
          });
        }
        this.emit('audio', {
          channel: this.channel,
          generationId: this.generationId,
          buffer: Buffer.from(part.inlineData.data, 'base64'),
          sampleRate: 24000,
        });
      }
    }

    if (content.interrupted) {
      this.emit('interrupted', {
        channel: this.channel,
        generationId: this.generationId,
      });
      this.generationActive = false;
    }
    if (content.generationComplete) {
      this.emit('generationComplete', {
        channel: this.channel,
        generationId: this.generationId,
      });
    }
    if (content.turnComplete) {
      this.emit('turnComplete', {
        channel: this.channel,
        generationId: this.generationId,
      });
      this.generationActive = false;
    }
    if (content.waitingForInput) {
      this.emit('waitingForInput', { channel: this.channel });
    }
  }

  sendAudio(buffer) {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: buffer.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    }));
  }

  sendAudioStreamEnd() {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  sendActivityStart() {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
  }

  sendActivityEnd() {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
  }

  disconnect() {
    this.isReady = false;
    if (this.ws) {
      try { this.ws.close(); } catch (_err) {}
      this.ws = null;
    }
    this.removeAllListeners();
  }
}
