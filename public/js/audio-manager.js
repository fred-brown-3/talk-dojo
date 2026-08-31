/**
 * Web Audio Manager for low-latency PCM playback and microphone capture
 */

export class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.nextPlayTime = 0;
    this.sampleRateOut = 24000;
    this.sampleRateIn = 16000;

    this.micStream = null;
    this.micSource = null;
    this.micProcessor = null;
    this.isMicActive = false;
    this.onMicAudioChunk = null; // callback(base64Data)

    // Optional browser speech recognition for human turns
    this.recognition = null;
    this.onHumanTranscript = null;
    this.activeSources = [];
  }

  async ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRateOut });
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Enqueue and play PCM 16-bit 24kHz audio buffer
   * @param {Int16Array} int16Data 
   */
  async playPCMChunk(int16Data) {
    await this.ensureAudioContext();

    const float32 = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32[i] = int16Data[i] / 32768.0;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRateOut);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };

    const currentTime = this.audioCtx.currentTime;
    // If playhead has fallen behind (idle or buffer underrun), catch up with a 20ms lead
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.02;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  /**
   * Immediately stops any playing or queued assistant audio buffers
   */
  stopPlayback() {
    if (this.activeSources) {
      for (const s of this.activeSources) {
        try {
          s.stop();
          s.disconnect();
        } catch (e) {}
      }
      this.activeSources = [];
    }
    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    }
  }

  /**
   * Start microphone capture and streaming
   */
  async startMicrophone(onAudioChunk, onTranscript = null) {
    await this.ensureAudioContext();
    this.onMicAudioChunk = onAudioChunk;
    this.onHumanTranscript = onTranscript;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRateIn,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);

      // Simple script processor for downsampling/converting to 16kHz PCM-16
      const bufferSize = 2048;
      this.micProcessor = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      this.micProcessor.onaudioprocess = (e) => {
        if (!this.isMicActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const inRate = e.inputBuffer.sampleRate || (this.audioCtx ? this.audioCtx.sampleRate : 16000);

        let pcm16;
        if (inRate === 16000) {
          pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        } else {
          const ratio = inRate / 16000;
          const outLength = Math.round(inputData.length / ratio);
          pcm16 = new Int16Array(outLength);
          for (let i = 0; i < outLength; i++) {
            const idx = Math.floor(i * ratio);
            const s = Math.max(-1, Math.min(1, inputData[idx] || 0));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
        }

        if (this.onMicAudioChunk) {
          const uint8 = new Uint8Array(pcm16.buffer);
          let binary = '';
          const len = uint8.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);
          this.onMicAudioChunk(base64, pcm16);
        }
      };

      this.micSource.connect(this.micProcessor);
      // Connect to dummy silent gain node so processor fires in Web Audio graph
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      this.micProcessor.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      this.isMicActive = true;

      // Start optional speech recognition for human speech transcripts
      this.startSpeechRecognition();

      return true;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      throw err;
    }
  }

  startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const text = lastResult[0].transcript;
          if (this.onHumanTranscript) {
            this.onHumanTranscript(text);
          }
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('Speech recognition could not be started:', e);
    }
  }

  stopMicrophone() {
    this.isMicActive = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.micProcessor) {
      this.micProcessor.disconnect();
      this.micProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
  }

  resetPlayback() {
    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    }
  }
}
