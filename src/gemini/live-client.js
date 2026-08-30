import EventEmitter from 'events';
import WebSocket from 'ws';

export class GeminiLiveClient extends EventEmitter {
  constructor({
    apiKey,
    model = 'gemini-2.0-flash-exp',
    voice = 'Aoede',
    systemInstruction = '',
    role = 'agent',
    language = 'en',
    toolExecutor = null,
  }) {
    super();
    this.apiKey = apiKey;
    this.model = model.startsWith('models/') ? model : `models/${model}`;
    this.voice = voice;
    this.systemInstruction = systemInstruction;
    this.role = role;
    this.language = language;
    this.toolExecutor = toolExecutor;
    this.ws = null;
    this.isConnected = false;
    this.isReady = false;
    this.currentTurnTranscript = '';
  }

  /**
   * Establish WebSocket connection to Gemini Multimodal Live API
   */
  async connect() {
    if (!this.apiKey) {
      throw new Error(`API key is required for Gemini Live Client (${this.role})`);
    }

    const host = 'generativelanguage.googleapis.com';
    const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(uri);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.sendSetup();
        });

        this.ws.on('message', (raw) => {
          this.handleIncomingMessage(raw, resolve);
        });

        this.ws.on('error', (err) => {
          this.emit('error', err);
          if (!this.isReady) {
            reject(err);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          this.isReady = false;
          this.emit('close', { code, reason: reason.toString() });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send the initial setup message (including tools if configured)
   */
  sendSetup() {
    const langInstruction = this.language && this.language.toLowerCase() !== 'en'
      ? `\nIMPORTANT: Speak in ${this.language}.`
      : '';

    const setup = {
      model: this.model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voice,
            },
          },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: `${this.systemInstruction}${langInstruction}

CRITICAL TELEPHONE INSTRUCTIONS:
- You are speaking live out-loud on a real telephone call.
- NEVER speak or output your inner thoughts, planning, reasoning, section headers, markdown, or asterisks.
- Speak ONLY your direct spoken character lines to the other person.
- Keep turns natural, concise (1-3 sentences per turn), and conversational.`,
          },
        ],
      },
    };

    // Attach function declarations if agent has tools
    if (this.toolExecutor && this.toolExecutor.getFunctionDeclarations().length > 0) {
      setup.tools = [
        {
          functionDeclarations: this.toolExecutor.getFunctionDeclarations(),
        },
      ];
    }

    this.ws.send(JSON.stringify({ setup }));
  }

  /**
   * Parse inbound server messages
   */
  handleIncomingMessage(raw, resolveReady) {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    // Setup acknowledgement
    if (parsed.setupComplete) {
      this.isReady = true;
      this.emit('ready');
      if (resolveReady) resolveReady();
      return;
    }

    // Top-level toolCall
    if (parsed.toolCall && Array.isArray(parsed.toolCall.functionCalls)) {
      for (const fc of parsed.toolCall.functionCalls) {
        this.executeAndRespondTool(fc.name, fc.args, fc.id);
      }
    }

    const serverContent = parsed.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      this.emit('interrupted');
    }

    const modelTurn = serverContent.modelTurn;
    if (modelTurn && Array.isArray(modelTurn.parts)) {
      for (const part of modelTurn.parts) {
        // Inline functionCall in modelTurn
        if (part.functionCall) {
          this.executeAndRespondTool(part.functionCall.name, part.functionCall.args, part.functionCall.id);
        }

        // Transcript text (filter out model thoughts)
        if (part.text && !part.thought) {
          this.currentTurnTranscript += part.text;
          this.emit('transcript', {
            text: part.text,
            fullText: this.currentTurnTranscript,
            role: this.role,
          });
        }

        // Inline Audio (PCM 16-bit 24kHz)
        if (part.inlineData && part.inlineData.data) {
          this.hasAudioInTurn = true;
          const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
          this.emit('audio', {
            buffer: audioBuffer,
            sampleRate: 24000,
            role: this.role,
          });
        }
      }
    }

    if (serverContent.turnComplete) {
      const rawText = this.currentTurnTranscript;
      let turnText = this.cleanTranscriptText(rawText);
      if (!turnText && this.hasAudioInTurn) {
        if (this.pendingGreeting) {
          turnText = this.pendingGreeting;
          this.pendingGreeting = null;
        } else if (this.lastExecutedTool) {
          turnText = `[Voice spoken using ${this.lastExecutedTool.name}: ${JSON.stringify(this.lastExecutedTool.output)}]`;
        } else {
          turnText = `[Spoken voice response]`;
        }
      }
      this.pendingGreeting = null;
      this.hasAudioInTurn = false;
      this.currentTurnTranscript = '';
      this.emit('turnComplete', {
        role: this.role,
        text: turnText,
        rawText,
      });
    }
  }

  /**
   * Execute incoming tool call and send back toolResponse
   */
  async executeAndRespondTool(name, args, callId) {
    if (!this.toolExecutor) return;

    this.emit('toolCall', {
      role: this.role,
      name,
      args,
      callId,
    });

    const { output, logEntry } = await this.toolExecutor.execute(name, args);
    this.lastExecutedTool = { name, args, output };

    const responseMsg = {
      toolResponse: {
        functionResponses: [
          {
            response: { output },
            id: callId,
          },
        ],
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(responseMsg));
    }

    this.emit('toolExecuted', {
      role: this.role,
      name,
      args,
      output,
      logEntry,
    });
  }

  /**
   * Extract clean spoken dialogue from Gemini 2.5 turn text
   */
  cleanTranscriptText(text) {
    if (!text) return '';
    const quoteMatches = [...text.matchAll(/"([^"]{3,})"/g)];
    if (quoteMatches.length > 0) {
      return quoteMatches.map(m => m[1]).join(' ');
    }
    let cleaned = text.replace(/\*\*[^*]+\*\*/g, '').trim();
    return cleaned || text.trim();
  }

  /**
   * Send realtime audio input chunk (PCM 16-bit 16kHz)
   * @param {Buffer} pcm16kBuffer 
   */
  sendAudio(pcm16kBuffer) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const base64Data = pcm16kBuffer.toString('base64');
    const msg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Send a text message turn or prompt trigger
   * @param {string} text 
   */
  sendTextPrompt(text) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const msg = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Disconnect client
   */
  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isReady = false;
  }
}
