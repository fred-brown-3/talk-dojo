/**
 * Telephone Line Impairment & Static DSP Generator
 * Injects realistic phone line hiss, pink noise, crackle, and PSTN bandpass response.
 */

export class LineNoiseEngine {
  constructor() {
    // Pink noise Paul Kellet filter state
    this.b0 = 0;
    this.b1 = 0;
    this.b2 = 0;
    this.b3 = 0;
    this.b4 = 0;
    this.b5 = 0;
    this.b6 = 0;

    // Simple IIR bandpass filter state (approx 300Hz - 3400Hz for phone audio)
    this.bpPrevIn = 0;
    this.bpPrevOut = 0;
    this.lpState = 0;
    this.hpState = 0;
  }

  /**
   * Generate a pink noise sample (natural sounding static/hiss)
   */
  nextPinkNoiseSample() {
    const white = Math.random() * 2 - 1;
    this.b0 = 0.99886 * this.b0 + white * 0.0555179;
    this.b1 = 0.99332 * this.b1 + white * 0.0750759;
    this.b2 = 0.96900 * this.b2 + white * 0.1538520;
    this.b3 = 0.86650 * this.b3 + white * 0.3104856;
    this.b4 = 0.55000 * this.b4 + white * 0.5329522;
    this.b5 = -0.7616 * this.b5 - white * 0.0168980;
    const pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
    this.b6 = white * 0.115926;
    return pink * 0.11; // Normalize to roughly [-1, 1]
  }

  /**
   * Apply telephone line static and impairments to a 16-bit PCM buffer
   * @param {Buffer} pcmBuffer Clean input PCM 16-bit LE
   * @param {number} staticLevel 0.0 (clean) to 1.0 (heavy static)
   * @param {boolean} applyBandpass Whether to apply telephone PSTN bandpass coloring
   * @param {number} crackleChance Chance of micro-crackle/pop per sample (default 0.0008 at heavy static)
   * @returns {Buffer} Output PCM 16-bit LE buffer
   */
  applyImpairments(pcmBuffer, staticLevel = 0.0, applyBandpass = true, crackleChance = 0.0005) {
    if (staticLevel <= 0.001) {
      return pcmBuffer;
    }

    const numSamples = Math.floor(pcmBuffer.length / 2);
    const outBuffer = Buffer.alloc(numSamples * 2);

    // Simple single-pole lowpass & highpass coefficients for telephone bandwidth
    const lpAlpha = 0.45;  // Cuts extreme highs
    const hpAlpha = 0.96;  // Cuts extreme low rumble

    for (let i = 0; i < numSamples; i++) {
      let sample = pcmBuffer.readInt16LE(i * 2) / 32768.0;

      // Telephone bandwidth simulation (300Hz - 3400Hz approximation)
      if (applyBandpass) {
        // Highpass
        const hpOut = hpAlpha * (this.hpState + sample - this.bpPrevIn);
        this.bpPrevIn = sample;
        this.hpState = hpOut;
        // Lowpass
        this.lpState = this.lpState + lpAlpha * (hpOut - this.lpState);
        sample = this.lpState * 1.15; // mild makeup gain
      }

      if (staticLevel > 0) {
        const pinkNoise = this.nextPinkNoiseSample();
        const whiteHiss = (Math.random() * 2 - 1) * 0.15;
        let noiseMix = (pinkNoise * 0.75 + whiteHiss * 0.25) * staticLevel;

        // Occasional crackle / pop
        if (Math.random() < crackleChance * staticLevel) {
          const pop = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
          noiseMix += pop;
        }

        // Blend clean sample with noise
        sample = sample * (1.0 - staticLevel * 0.2) + noiseMix;
      }

      // Soft clip to prevent harsh digital clipping wrap-around
      const clipped = Math.max(-1.0, Math.min(1.0, Math.tanh(sample)));
      const int16Val = Math.floor(clipped * 32767);
      outBuffer.writeInt16LE(int16Val, i * 2);
    }

    return outBuffer;
  }
}
