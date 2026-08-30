/**
 * Telephony tone procedural generator (PCM 16-bit mono)
 */

export class TelephonyTones {
  /**
   * Synthesize a dual-frequency tone
   * @param {number} freq1 
   * @param {number} freq2 
   * @param {number} durationMs 
   * @param {number} sampleRate 
   * @param {number} volume (0.0 to 1.0)
   * @returns {Buffer} PCM 16-bit LE
   */
  static generateDualTone(freq1, freq2, durationMs, sampleRate = 24000, volume = 0.3) {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const buffer = Buffer.alloc(numSamples * 2);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Fade in / fade out envelope to avoid clicks at tone boundaries (first/last 5ms)
      const rampSamples = Math.floor(0.005 * sampleRate);
      let envelope = 1.0;
      if (i < rampSamples) {
        envelope = i / rampSamples;
      } else if (i > numSamples - rampSamples) {
        envelope = (numSamples - i) / rampSamples;
      }

      const sampleVal = (Math.sin(2 * Math.PI * freq1 * t) + Math.sin(2 * Math.PI * freq2 * t)) * 0.5;
      const int16Val = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * volume * envelope * 32767)));
      buffer.writeInt16LE(int16Val, i * 2);
    }
    return buffer;
  }

  /**
   * North American standard dial tone (350Hz + 440Hz continuous)
   */
  static dialTone(durationMs = 1500, sampleRate = 24000) {
    return this.generateDualTone(350, 440, durationMs, sampleRate, 0.25);
  }

  /**
   * US Ringback tone (440Hz + 480Hz, typically 2s on / 4s off; we generate a 2s ring burst)
   */
  static ringbackBurst(durationMs = 2000, sampleRate = 24000) {
    return this.generateDualTone(440, 480, durationMs, sampleRate, 0.3);
  }

  /**
   * Call connect click sound (short transient pulse)
   */
  static connectClick(sampleRate = 24000) {
    const numSamples = Math.floor(0.06 * sampleRate); // 60ms click
    const buffer = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Damped impulse click
      const decay = Math.exp(-t * 80);
      const click = Math.sin(2 * Math.PI * 800 * t) * decay + (Math.random() * 2 - 1) * 0.2 * decay;
      const int16Val = Math.max(-32768, Math.min(32767, Math.floor(click * 0.5 * 32767)));
      buffer.writeInt16LE(int16Val, i * 2);
    }
    return buffer;
  }

  /**
   * Busy / disconnect tone (480Hz + 620Hz, 500ms beep)
   */
  static busyBeep(durationMs = 500, sampleRate = 24000) {
    return this.generateDualTone(480, 620, durationMs, sampleRate, 0.35);
  }

  /**
   * Call ended reminder beep (1000Hz 150ms beep)
   */
  static callEndedBeep(sampleRate = 24000) {
    const durationMs = 180;
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const buffer = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const decay = 1 - (i / numSamples);
      const val = Math.sin(2 * Math.PI * 1050 * t) * decay;
      const int16Val = Math.max(-32768, Math.min(32767, Math.floor(val * 0.3 * 32767)));
      buffer.writeInt16LE(int16Val, i * 2);
    }
    return buffer;
  }
}
