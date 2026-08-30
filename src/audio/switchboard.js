import EventEmitter from 'events';
import { LineNoiseEngine } from './noise-generator.js';
import { AudioResampler } from './resampler.js';
import { TelephonyTones } from './telephony-tones.js';

export class AudioSwitchboard extends EventEmitter {
  constructor() {
    super();
    this.noiseEngine = new LineNoiseEngine();

    // Impairment settings
    this.staticLevel = 0.0;
    this.noiseTarget = 'none'; // 'caller_only' | 'callee_only' | 'both' | 'none'
    this.applyBandpass = true;

    // Call mode: 'ai-to-ai' | 'human-to-ai-caller' | 'human-to-ai-callee'
    this.mode = 'ai-to-ai';

    // Agent handles
    this.callerClient = null;
    this.calleeClient = null;

    // Active state
    this.isActive = false;
  }

  /**
   * Set line static & impairment configuration
   */
  setImpairments({ staticLevel = 0.0, target = 'none', applyBandpass = true }) {
    this.staticLevel = Math.max(0.0, Math.min(1.0, parseFloat(staticLevel) || 0.0));
    this.noiseTarget = target || 'none';
    this.applyBandpass = applyBandpass !== false;
    this.emit('impairmentsUpdated', {
      staticLevel: this.staticLevel,
      target: this.noiseTarget,
      applyBandpass: this.applyBandpass,
    });
  }

  /**
   * Attach Gemini Live clients or human streams
   */
  attachClients({ callerClient, calleeClient, mode = 'ai-to-ai' }) {
    this.callerClient = callerClient;
    this.calleeClient = calleeClient;
    this.mode = mode;
    this.isActive = true;

    // Wire Caller output
    if (this.callerClient) {
      this.callerClient.on('audio', ({ buffer, sampleRate }) => {
        this.handleCallerAudioOut(buffer, sampleRate);
      });
      this.callerClient.on('turnComplete', () => {
        if (this.calleeClient) {
          this.sendSilencePadding(this.calleeClient, 800);
        }
      });
    }

    // Wire Callee output
    if (this.calleeClient) {
      this.calleeClient.on('audio', ({ buffer, sampleRate }) => {
        this.handleCalleeAudioOut(buffer, sampleRate);
      });
      this.calleeClient.on('turnComplete', () => {
        if (this.callerClient) {
          this.sendSilencePadding(this.callerClient, 800);
        }
      });
    }
  }

  /**
   * Feed a cushion of silence (16kHz PCM16) to advance receiver's VAD and trigger response
   */
  sendSilencePadding(client, durationMs = 800) {
    if (!this.isActive || !client) return;
    const numSamples = Math.floor((durationMs / 1000) * 16000);
    const silenceBuf = Buffer.alloc(numSamples * 2, 0);
    const chunkSize = 3200; // 100ms at 16kHz PCM-16
    for (let offset = 0; offset < silenceBuf.length; offset += chunkSize) {
      const chunk = silenceBuf.subarray(offset, Math.min(offset + chunkSize, silenceBuf.length));
      client.sendAudio(chunk);
    }
  }

  /**
   * Caller is speaking (Output 24kHz from Caller -> to Callee input 16kHz)
   */
  handleCallerAudioOut(buffer24k, sampleRate = 24000) {
    if (!this.isActive) return;

    // Downsample from 24kHz to 16kHz for receiver
    let pcm16k = AudioResampler.downsample24kTo16k(buffer24k);

    // Apply impairments if caller is impaired
    const shouldImpair = this.noiseTarget === 'caller_only' || this.noiseTarget === 'both';
    if (shouldImpair && this.staticLevel > 0) {
      pcm16k = this.noiseEngine.applyImpairments(pcm16k, this.staticLevel, this.applyBandpass);
    }

    // Route to callee
    if (this.calleeClient) {
      this.calleeClient.sendAudio(pcm16k);
    }

    // Broadcast monitor chunk to browser (24kHz)
    this.emit('monitorAudio', {
      speaker: 'caller',
      buffer: buffer24k,
      sampleRate: 24000,
    });
  }

  /**
   * Callee is speaking (Output 24kHz from Callee -> to Caller input 16kHz)
   */
  handleCalleeAudioOut(buffer24k, sampleRate = 24000) {
    if (!this.isActive) return;

    // Downsample from 24kHz to 16kHz for receiver
    let pcm16k = AudioResampler.downsample24kTo16k(buffer24k);

    // Apply impairments if callee is impaired
    const shouldImpair = this.noiseTarget === 'callee_only' || this.noiseTarget === 'both';
    if (shouldImpair && this.staticLevel > 0) {
      pcm16k = this.noiseEngine.applyImpairments(pcm16k, this.staticLevel, this.applyBandpass);
    }

    // Route to caller
    if (this.callerClient) {
      this.callerClient.sendAudio(pcm16k);
    }

    // Broadcast monitor chunk to browser (24kHz)
    this.emit('monitorAudio', {
      speaker: 'callee',
      buffer: buffer24k,
      sampleRate: 24000,
    });
  }

  /**
   * Process incoming microphone audio from human user (16kHz PCM16)
   */
  handleHumanMicInput(pcm16k) {
    if (!this.isActive) return;

    // Apply impairments if human side is target
    let processed = pcm16k;
    const isCaller = this.mode === 'human-to-ai-caller';
    const shouldImpair = isCaller
      ? (this.noiseTarget === 'caller_only' || this.noiseTarget === 'both')
      : (this.noiseTarget === 'callee_only' || this.noiseTarget === 'both');

    if (shouldImpair && this.staticLevel > 0) {
      processed = this.noiseEngine.applyImpairments(processed, this.staticLevel, this.applyBandpass);
    }

    if (this.mode === 'human-to-ai-caller' && this.calleeClient) {
      this.calleeClient.sendAudio(processed);
      this.emit('monitorAudio', {
        speaker: 'caller',
        buffer: AudioResampler.upsample16kTo24k(processed),
        sampleRate: 24000,
      });
    } else if (this.mode === 'human-to-ai-callee' && this.callerClient) {
      this.callerClient.sendAudio(processed);
      this.emit('monitorAudio', {
        speaker: 'callee',
        buffer: AudioResampler.upsample16kTo24k(processed),
        sampleRate: 24000,
      });
    }
  }

  /**
   * Synthesize and emit a telephony tone to the monitor
   */
  emitTelephonyTone(toneType) {
    let toneBuffer = null;
    if (toneType === 'dial') {
      toneBuffer = TelephonyTones.dialTone(1200);
    } else if (toneType === 'ringback') {
      toneBuffer = TelephonyTones.ringbackBurst(1800);
    } else if (toneType === 'click') {
      toneBuffer = TelephonyTones.connectClick();
    } else if (toneType === 'busy') {
      toneBuffer = TelephonyTones.busyBeep(400);
    } else if (toneType === 'hangup') {
      toneBuffer = TelephonyTones.callEndedBeep();
    }

    if (toneBuffer) {
      this.emit('telephonyAudio', {
        toneType,
        buffer: toneBuffer,
        sampleRate: 24000,
      });
    }
  }

  /**
   * Disconnect and clear state
   */
  reset() {
    this.isActive = false;
    this.callerClient = null;
    this.calleeClient = null;
  }
}
