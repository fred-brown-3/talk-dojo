/**
 * Canvas-based Live Oscilloscope & Audio Activity Visualizer
 */

export class AudioVisualizer {
  constructor(canvasId, color = '#00d2ff', indicatorId = null) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.color = color;
    this.indicator = indicatorId ? document.getElementById(indicatorId) : null;

    this.bufferSize = 256;
    this.dataPoints = new Float32Array(this.bufferSize);
    this.targetData = new Float32Array(this.bufferSize);
    this.isSpeaking = false;
    this.speakingTimeout = null;

    this.initCanvasSize();
    this.startAnimationLoop();
  }

  initCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
  }

  /**
   * Ingest PCM 16-bit array to visualize
   */
  feedPCM16(int16Array) {
    if (!int16Array || int16Array.length === 0) return;

    let peak = 0;
    const step = Math.max(1, Math.floor(int16Array.length / this.bufferSize));
    for (let i = 0; i < this.bufferSize; i++) {
      const srcIdx = Math.min(i * step, int16Array.length - 1);
      const normalized = int16Array[srcIdx] / 32768.0;
      this.targetData[i] = normalized;
      if (Math.abs(normalized) > peak) peak = Math.abs(normalized);
    }

    if (peak > 0.05) {
      this.setSpeaking(true);
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;
    if (this.indicator) {
      if (speaking) {
        this.indicator.textContent = 'SPEAKING';
        this.indicator.classList.add('speaking');
        this.indicator.classList.remove('interrupted');
        clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => {
          this.indicator.textContent = 'LISTENING';
          this.indicator.classList.remove('speaking');
          this.isSpeaking = false;
        }, 350);
      }
    }
  }

  setInterrupted() {
    if (this.indicator) {
      this.indicator.textContent = 'INTERRUPTED';
      this.indicator.classList.remove('speaking');
      this.indicator.classList.add('interrupted');
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = setTimeout(() => {
        this.indicator.textContent = 'LISTENING';
        this.indicator.classList.remove('interrupted');
      }, 700);
    }
  }

  startAnimationLoop() {
    const render = () => {
      const { width, height } = this.canvas;
      const ctx = this.ctx;

      ctx.clearRect(0, 0, width, height);

      // Smooth lerp data
      for (let i = 0; i < this.bufferSize; i++) {
        this.dataPoints[i] += (this.targetData[i] - this.dataPoints[i]) * 0.25;
        this.targetData[i] *= 0.92; // Decay
      }

      // Draw center baseline
      const centerY = height / 2;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Draw neon oscilloscope waveform
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.isSpeaking ? 10 : 3;

      const sliceWidth = width / (this.bufferSize - 1);
      let x = 0;

      for (let i = 0; i < this.bufferSize; i++) {
        const val = this.dataPoints[i];
        // Idle gentle subtle sine wave if silent
        const idleWave = !this.isSpeaking ? Math.sin(Date.now() * 0.003 + i * 0.08) * 2 : 0;
        const y = centerY + val * (height * 0.42) + idleWave;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }
}
