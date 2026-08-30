/**
 * Voice Preview Generator for Talk Dojo
 * Provides authentic, native spoken preview audio clips for Gemini voice presets:
 * Aoede, Fenrir, Charon, Kore, Puck.
 *
 * Uses Gemini Multimodal Live Bidi WebSocket for high-fidelity spoken audio
 * and caches generated clips to disk for instant subsequent playback.
 */

import fs from 'fs/promises';
import path from 'path';
import WebSocket from 'ws';
import { encodeWAV } from './wav-encoder.js';
import { config } from '../config.js';

export const VOICE_PROFILES = {
  Aoede: {
    name: 'Aoede',
    gender: 'Female timbre',
    style: 'Warm, breezy, and reassuring',
    pitch: 240,
    script: "Hello there! I'm Aoede. My voice has a warm, natural female timbre. I speak with a friendly, reassuring cadence that helps patients and callers feel welcome and cared for.",
  },
  Fenrir: {
    name: 'Fenrir',
    gender: 'Male timbre',
    style: 'Deep, resonant, and authoritative',
    pitch: 110,
    script: "Greetings. I am Fenrir. My voice features a deep, authoritative male timbre. I speak with measured cadence and confidence, ideal for triage and executive dispatch.",
  },
  Charon: {
    name: 'Charon',
    gender: 'Male timbre',
    style: 'Calm, clinical, and measured',
    pitch: 140,
    script: "Hello. I am Charon. My voice is characterized by a calm, clinical male timbre. I deliver instructions with precision, ensuring clarity during high-stress calls.",
  },
  Kore: {
    name: 'Kore',
    gender: 'Female timbre',
    style: 'Bright, cheerful, and energetic',
    pitch: 280,
    script: "Hi there! I'm Kore. My voice is bright, energetic, and cheerful with an upbeat female timbre. I bring positivity to every call, keeping callers engaged and informed.",
  },
  Puck: {
    name: 'Puck',
    gender: 'Male/Neutral timbre',
    style: 'Friendly, casual, and conversational',
    pitch: 175,
    script: "Hey! I'm Puck. My voice has a friendly, casual, and relatable conversational timbre. I keep conversations natural and approachable, putting callers at ease.",
  },
};

export class VoicePreviewGenerator {
  static cacheDir = path.resolve(process.cwd(), 'data', 'voice-previews');

  /**
   * Generates or retrieves a cached spoken preview audio clip for the given voice
   * @param {string} voiceName - One of Aoede, Fenrir, Charon, Kore, Puck
   * @param {string} apiKey - Gemini API key
   * @returns {Promise<Buffer>} WAV audio buffer
   */
  static async getPreviewWAV(voiceName, apiKey = config.geminiApiKey) {
    const profile = VOICE_PROFILES[voiceName] || VOICE_PROFILES.Aoede;
    const cacheFile = path.join(this.cacheDir, `${profile.name}.wav`);

    // 1. Check disk cache first for instant playback
    try {
      const cached = await fs.readFile(cacheFile);
      if (cached && cached.length > 5000) {
        return cached;
      }
    } catch (e) {
      // Cache miss, proceed to generate
    }

    // 2. Synthesize via Gemini Live Bidi WebSocket
    if (apiKey) {
      try {
        const liveWav = await this.synthesizeWithGeminiLive(profile, apiKey);
        if (liveWav && liveWav.length > 5000) {
          await fs.mkdir(this.cacheDir, { recursive: true });
          await fs.writeFile(cacheFile, liveWav);
          return liveWav;
        }
      } catch (err) {
        console.warn(`Gemini Live preview synthesis failed for ${profile.name}:`, err.message);
      }
    }

    // 3. Clean fallback tone if no API key or network failure
    return this.generateHarmonicPreviewWAV(profile);
  }

  /**
   * Synthesize spoken preview audio via Gemini Multimodal Live Bidi WebSocket
   */
  static synthesizeWithGeminiLive(profile, apiKey) {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      const audioChunks = [];

      const timeout = setTimeout(() => {
        try { ws.close(); } catch (e) {}
        reject(new Error(`Voice preview synthesis timed out after 12s for ${profile.name}`));
      }, 12000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${config.geminiLiveModel}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: profile.name },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: `You are ${profile.name}. Speak in your natural ${profile.style} vocal cadence.` }],
            },
          },
        }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.setupComplete) {
            ws.send(JSON.stringify({
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: `Please speak this exact greeting: "${profile.script}"` }],
                }],
                turnComplete: true,
              },
            }));
          }

          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
              }
            }
          }

          if (msg.serverContent?.turnComplete) {
            clearTimeout(timeout);
            try { ws.close(); } catch (e) {}
            const totalPCM = Buffer.concat(audioChunks);
            if (totalPCM.length > 0) {
              const wav = encodeWAV(totalPCM, 24000, 1, 16);
              resolve(wav);
            } else {
              reject(new Error('No audio tokens returned from Gemini Live'));
            }
          }
        } catch (err) {
          clearTimeout(timeout);
          try { ws.close(); } catch (e) {}
          reject(err);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Clean, soothing harmonic preview (fallback if offline)
   */
  static generateHarmonicPreviewWAV(profile) {
    const sampleRate = 24000;
    const durationSec = 3.0;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const pcm = Buffer.alloc(totalSamples * 2);
    const freq = profile.pitch || 200;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.sin(Math.min(Math.PI, (t / durationSec) * Math.PI));
      const val = Math.round(0.25 * env * Math.sin(2 * Math.PI * freq * t) * 32767);
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
    }

    return encodeWAV(pcm, sampleRate, 1, 16);
  }
}
