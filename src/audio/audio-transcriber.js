import { encodeWAV } from './wav-encoder.js';
import { config } from '../config.js';

/**
 * Fast Audio Transcriber using Gemini Flash Multimodal Input
 */
export class AudioTranscriber {
  /**
   * Transcribe PCM audio buffer into text
   * @param {Buffer} pcmBuffer - 16-bit linear PCM buffer
   * @param {number} sampleRate - 16000 or 24000
   * @param {string} apiKey - Gemini API Key
   * @returns {Promise<string|null>}
   */
  static async transcribe(pcmBuffer, sampleRate = 24000, apiKey = null) {
    const key = apiKey || config.geminiApiKey;
    if (!key || !pcmBuffer || pcmBuffer.length < (sampleRate * 2 * 0.3)) {
      // Buffer too short (< 300ms) or no key
      return null;
    }

    try {
      const wavBuffer = encodeWAV(pcmBuffer, sampleRate, 1);
      const base64Audio = wavBuffer.toString('base64');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/wav',
                    data: base64Audio,
                  },
                },
                {
                  text: 'Transcribe the spoken audio verbatim into clean text. If the audio is silence, background noise, or unintelligible, respond strictly with [NO_SPEECH]. Do not include quotation marks or commentary.',
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!rawText || rawText === '[NO_SPEECH]' || rawText.toLowerCase().includes('no speech') || rawText.toLowerCase().includes('silence')) {
        return null;
      }

      // Clean wrapping quotes
      return rawText.replace(/^["']|["']$/g, '').trim();
    } catch (err) {
      console.warn('Audio transcription error:', err.message);
      return null;
    }
  }
}
