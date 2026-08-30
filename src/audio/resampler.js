/**
 * PCM 16-bit Linear Resampler
 * Converts between 24kHz (Gemini Live output) and 16kHz (Gemini Live input)
 */

export class AudioResampler {
  /**
   * Resample PCM 16-bit buffer from inRate to outRate
   * @param {Buffer} inBuffer 
   * @param {number} inRate 
   * @param {number} outRate 
   * @returns {Buffer}
   */
  static resamplePCM16(inBuffer, inRate, outRate) {
    if (inRate === outRate || inBuffer.length === 0) {
      return inBuffer;
    }

    const inSamples = Math.floor(inBuffer.length / 2);
    const ratio = outRate / inRate;
    const outSamples = Math.floor(inSamples * ratio);
    const outBuffer = Buffer.alloc(outSamples * 2);

    for (let i = 0; i < outSamples; i++) {
      const srcIndex = i / ratio;
      const index0 = Math.floor(srcIndex);
      const index1 = Math.min(index0 + 1, inSamples - 1);
      const frac = srcIndex - index0;

      const s0 = inBuffer.readInt16LE(index0 * 2);
      const s1 = inBuffer.readInt16LE(index1 * 2);

      // Linear interpolation
      const sample = Math.round(s0 + frac * (s1 - s0));
      const clamped = Math.max(-32768, Math.min(32767, sample));
      outBuffer.writeInt16LE(clamped, i * 2);
    }

    return outBuffer;
  }

  /**
   * Downsample 24kHz to 16kHz (3:2 ratio)
   */
  static downsample24kTo16k(buffer24k) {
    return this.resamplePCM16(buffer24k, 24000, 16000);
  }

  /**
   * Upsample 16kHz to 24kHz (2:3 ratio)
   */
  static upsample16kTo24k(buffer16k) {
    return this.resamplePCM16(buffer16k, 16000, 24000);
  }
}
