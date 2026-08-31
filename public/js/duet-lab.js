class PcmPlaybackBus {
  constructor(context, initialGain = 1) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = initialGain;
    this.gain.connect(context.destination);
    this.nextTime = context.currentTime;
    this.sources = new Set();
  }

  setGain(value) {
    this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
  }

  enqueue(int16, sampleRate = 24000) {
    const floats = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) floats[i] = int16[i] / 32768;
    const buffer = this.context.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(floats, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    const startAt = Math.max(this.context.currentTime + 0.015, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  stop() {
    for (const source of this.sources) {
      try { source.stop(); } catch (_err) {}
      try { source.disconnect(); } catch (_err) {}
    }
    this.sources.clear();
    this.nextTime = this.context.currentTime;
  }

  isBusy() {
    return this.sources.size > 0 && this.nextTime > this.context.currentTime + 0.01;
  }
}

class DuetLab {
  constructor() {
    this.ws = null;
    this.context = null;
    this.mainBus = null;
    this.listenerBus = null;
    this.micStream = null;
    this.micSource = null;
    this.processor = null;
    this.running = false;
    this.listenerMuted = false;
    this.listenerDecisions = new Map();
    this.listenerSamples = new Map();
    this.lastListenerPlayedAt = 0;
    this.lastMainAudioAt = 0;
    this.lastListenerAudioGeneration = null;
    this.lastListenerAudioChunks = [];
    this.currentListenerGeneration = null;
    this.listenerSpeechActive = false;
    this.listenerSilenceAccumulatedMs = 0;
    this.listenerClauseDurationMs = 0;
    this.vadCalibrationRemainingMs = 700;
    this.vadCalibrationSamples = [];
    this.noiseFloorDb = -45;
    this.metrics = { generated: 0, played: 0, suppressed: 0, preemptions: 0 };
    this.elements = this.captureElements();
    this.bindEvents();
    this.loadAccounts();
    this.floorTimer = setInterval(() => this.refreshFloor(), 100);
  }

  captureElements() {
    const ids = [
      'account-select', 'connection-pill', 'floor-pill', 'main-pause', 'main-pause-value',
      'listener-pause', 'listener-pause-value', 'listener-volume', 'listener-volume-value',
      'cooldown', 'cooldown-value', 'max-listener', 'max-listener-value', 'start-button',
      'stop-button', 'mute-listener-button', 'replay-listener-button', 'meter-fill', 'meter-db', 'main-status',
      'listener-status', 'main-light', 'listener-light', 'duet-transcript',
      'main-prompt', 'listener-prompt',
      'reload-prompts-button', 'event-log', 'listener-generated', 'listener-played',
      'listener-suppressed', 'main-preemptions',
    ];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  bindEvents() {
    const pairs = [
      ['main-pause', 'main-pause-value', ''],
      ['listener-pause', 'listener-pause-value', ''],
      ['listener-volume', 'listener-volume-value', ''],
      ['cooldown', 'cooldown-value', ''],
      ['max-listener', 'max-listener-value', ''],
    ];
    for (const [inputId, outputId] of pairs) {
      this.elements[inputId].addEventListener('input', () => {
        this.elements[outputId].value = this.elements[inputId].value;
        if (inputId === 'listener-volume' && this.listenerBus) {
          this.listenerBus.setGain(Number(this.elements[inputId].value) / 100);
        }
      });
    }
    this.elements['start-button'].addEventListener('click', () => this.start());
    this.elements['stop-button'].addEventListener('click', () => this.stop());
    this.elements['mute-listener-button'].addEventListener('click', () => this.toggleListenerMute());
    this.elements['replay-listener-button'].addEventListener('click', () => this.replayLatestListener());
    this.elements['reload-prompts-button'].addEventListener('click', () => this.loadPrompts());
    this.elements['account-select'].addEventListener('change', () => this.loadPrompts());
    document.querySelectorAll('[data-clear]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.clear);
        if (target) target.innerHTML = '';
      });
    });
  }

  async loadAccounts() {
    try {
      const response = await fetch('/api/accounts');
      const accounts = await response.json();
      this.elements['account-select'].innerHTML = '';
      for (const account of accounts) {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name} · ${account.assistantName || 'Assistant'}`;
        this.elements['account-select'].appendChild(option);
      }
      await this.loadPrompts();
    } catch (error) {
      this.log('system', `Could not load accounts: ${error.message}`);
    }
  }

  async loadPrompts() {
    const accountId = this.elements['account-select'].value;
    if (!accountId) return;
    this.elements['reload-prompts-button'].disabled = true;
    try {
      const response = await fetch(`/api/duet-prompts/${encodeURIComponent(accountId)}`);
      const prompts = await response.json();
      if (!response.ok) throw new Error(prompts.error || 'Could not load prompts');
      this.elements['main-prompt'].value = prompts.mainInstruction;
      this.elements['listener-prompt'].value = prompts.listenerInstruction;
      this.log('system', 'Loaded exact channel prompts for the selected account');
    } catch (error) {
      this.log('system', `Could not load channel prompts: ${error.message}`);
    } finally {
      this.elements['reload-prompts-button'].disabled = false;
    }
  }

  async ensureAudio() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass({ sampleRate: 24000 });
      this.mainBus = new PcmPlaybackBus(this.context, 1);
      this.listenerBus = new PcmPlaybackBus(
        this.context,
        Number(this.elements['listener-volume'].value) / 100,
      );
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  connectSocket() {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', reject, { once: true });
      });
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);
    this.ws.addEventListener('message', event => {
      try { this.handleMessage(JSON.parse(event.data)); } catch (_err) {}
    });
    this.ws.addEventListener('close', () => {
      if (this.running) this.fail('Browser connection closed');
    });
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  async start() {
    if (this.running) return;
    this.setConnection('busy', 'Connecting');
    this.elements['start-button'].disabled = true;
    try {
      await this.ensureAudio();
      await this.connectSocket();
      this.resetMetrics();
      this.resetListenerVAD();
      this.ws.send(JSON.stringify({
        type: 'duet_start',
        accountId: this.elements['account-select'].value,
        mainSilenceMs: Number(this.elements['main-pause'].value),
        listenerSilenceMs: Number(this.elements['listener-pause'].value),
        mainInstruction: this.elements['main-prompt'].value,
        listenerInstruction: this.elements['listener-prompt'].value,
      }));
      this.log('system', 'Requested two Gemini Live sessions');
    } catch (error) {
      this.fail(error.message);
    }
  }

  async startMicrophone() {
    if (this.micStream) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micSource = this.context.createMediaStreamSource(this.micStream);
    this.processor = this.context.createScriptProcessor(1024, 1, 1);
    const silentGain = this.context.createGain();
    silentGain.gain.value = 0;
    this.processor.onaudioprocess = event => this.processMicrophone(event);
    this.micSource.connect(this.processor);
    this.processor.connect(silentGain);
    silentGain.connect(this.context.destination);
    this.log('system', `Microphone streaming at ${this.context.sampleRate} Hz → 16 kHz`);
  }

  processMicrophone(event) {
    if (!this.running || this.ws?.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / Math.max(1, input.length));
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    this.elements['meter-db'].value = db <= -99 ? '−∞ dB' : `${db.toFixed(1)} dB`;
    this.elements['meter-fill'].style.width = `${Math.max(0, Math.min(100, (db + 70) * 1.42))}%`;

    const inputRate = event.inputBuffer.sampleRate || this.context.sampleRate;
    const frameDurationMs = input.length / inputRate * 1000;
    this.updateListenerVAD(db, frameDurationMs);
    const ratio = inputRate / 16000;
    const length = Math.max(1, Math.round(input.length / ratio));
    const pcm = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const sample = input[Math.min(input.length - 1, Math.floor(i * ratio))] || 0;
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    }
    this.ws.send(JSON.stringify({
      type: 'duet_audio_input',
      data: this.bytesToBase64(new Uint8Array(pcm.buffer)),
    }));
  }

  updateListenerVAD(db, frameDurationMs) {
    if (!this.running || this.ws?.readyState !== WebSocket.OPEN) return;

    // Do not let speaker leakage create listener turns while the main agent
    // owns the floor. Caller barge-in still reaches the main Gemini channel.
    if (this.mainBus?.isBusy()) {
      if (this.listenerSpeechActive) this.closeListenerClause('main owns floor');
      return;
    }

    if (!this.listenerSpeechActive) {
      if (this.vadCalibrationRemainingMs > 0) {
        this.vadCalibrationSamples.push(Math.max(-80, Math.min(-20, db)));
        this.vadCalibrationRemainingMs -= frameDurationMs;
        if (this.vadCalibrationRemainingMs <= 0) {
          const sorted = [...this.vadCalibrationSamples].sort((a, b) => a - b);
          const quietIndex = Math.floor(Math.max(0, sorted.length - 1) * 0.2);
          this.noiseFloorDb = sorted[quietIndex] ?? -45;
          this.log('listener', `Room calibrated · noise floor ${this.noiseFloorDb.toFixed(1)} dB`);
        }
        return;
      }

      const startThresholdDb = Math.max(-44, Math.min(-28, this.noiseFloorDb + 10));
      if (db >= startThresholdDb) {
        this.listenerSpeechActive = true;
        this.listenerSilenceAccumulatedMs = 0;
        this.listenerClauseDurationMs = 0;
        this.ws.send(JSON.stringify({ type: 'duet_listener_clause_start' }));
        this.log('listener', `Clause opened · speech ${db.toFixed(1)} dB · threshold ${startThresholdDb.toFixed(1)} dB`);
      } else {
        this.noiseFloorDb = (this.noiseFloorDb * 0.96) + (db * 0.04);
      }
      return;
    }

    this.listenerClauseDurationMs += frameDurationMs;
    const continueThresholdDb = Math.max(-48, Math.min(-32, this.noiseFloorDb + 6));
    if (db < continueThresholdDb) {
      this.listenerSilenceAccumulatedMs += frameDurationMs;
      this.noiseFloorDb = (this.noiseFloorDb * 0.985) + (db * 0.015);
    } else {
      this.listenerSilenceAccumulatedMs = 0;
    }

    if (this.listenerSilenceAccumulatedMs >= Number(this.elements['listener-pause'].value)) {
      this.closeListenerClause(`${Math.round(this.listenerSilenceAccumulatedMs)} ms pause`);
    } else if (this.listenerClauseDurationMs >= 6000) {
      this.closeListenerClause('6 s recovery boundary');
    }
  }

  closeListenerClause(reason) {
    if (!this.listenerSpeechActive) return;
    this.ws.send(JSON.stringify({ type: 'duet_listener_clause_end' }));
    this.listenerSpeechActive = false;
    this.listenerSilenceAccumulatedMs = 0;
    this.listenerClauseDurationMs = 0;
    this.log('listener', `Clause flushed · ${reason}`);
  }

  resetListenerVAD() {
    this.listenerSpeechActive = false;
    this.listenerSilenceAccumulatedMs = 0;
    this.listenerClauseDurationMs = 0;
    this.vadCalibrationRemainingMs = 700;
    this.vadCalibrationSamples = [];
    this.noiseFloorDb = -45;
  }

  bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  base64ToInt16(data) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  handleMessage(message) {
    if (message.type === 'duet_ready') {
      this.running = true;
      this.setConnection('ready', 'Live');
      this.elements['stop-button'].disabled = false;
      this.elements['mute-listener-button'].disabled = false;
      this.elements['main-status'].textContent = `Ready · ${message.mainSilenceMs} ms turn pause`;
      this.elements['listener-status'].textContent = `Ready · ${message.listenerSilenceMs} ms clause pause`;
      this.setLight('main', 'ready');
      this.setLight('listener', 'ready');
      if (message.mainInstruction) this.elements['main-prompt'].value = message.mainInstruction;
      if (message.listenerInstruction) this.elements['listener-prompt'].value = message.listenerInstruction;
      this.startMicrophone().catch(error => this.fail(`Microphone: ${error.message}`));
      this.log('system', `Duet ready · ${message.model} · ${message.voice}`);
      return;
    }
    if (message.type === 'duet_channel_ready') {
      this.log(message.channel, 'Gemini Live channel ready');
      return;
    }
    if (message.type === 'duet_audio') {
      this.handleAudio(message);
      return;
    }
    if (message.type === 'duet_transcript') {
      this.addTranscript(message);
      return;
    }
    if (message.type === 'duet_generationStart') {
      if (message.channel === 'listener') {
        this.metrics.generated += 1;
        this.currentListenerGeneration = message.generationId;
        this.updateMetrics();
      }
      this.setLight(message.channel, 'speaking');
      this.log(message.channel, `Generation ${message.generationId} started`);
      return;
    }
    if (message.type === 'duet_generationComplete' || message.type === 'duet_turnComplete') {
      this.log(message.channel, `${message.type.replace('duet_', '')} · ${message.generationId}`);
      if (message.type === 'duet_turnComplete') this.setLight(message.channel, 'ready');
      return;
    }
    if (message.type === 'duet_waitingForInput') {
      this.setLight(message.channel, 'ready');
      this.log(message.channel, 'Ready for the next caller clause');
      return;
    }
    if (message.type === 'duet_interrupted') {
      if (message.channel === 'main') this.mainBus?.stop();
      else this.listenerBus?.stop();
      this.log(message.channel, `Generation ${message.generationId} interrupted`);
      return;
    }
    if (message.type === 'duet_error') {
      this.fail(`${message.channel || 'system'}: ${message.message}`);
      return;
    }
    if (message.type === 'duet_channelClose') {
      this.log(message.channel, `Channel closed (${message.code})${message.reason ? ` · ${message.reason}` : ''}`);
      return;
    }
    if (message.type === 'duet_stopped') {
      this.log('system', 'Prototype stopped');
    }
  }

  handleAudio(message) {
    const pcm = this.base64ToInt16(message.buffer);
    if (message.channel === 'main') {
      this.lastMainAudioAt = Date.now();
      this.mainBus.enqueue(pcm, message.sampleRate);
      this.elements['main-status'].textContent = 'Speaking · owns the floor';
      return;
    }

    const generationId = message.generationId;
    const sampleRate = message.sampleRate || 24000;
    if (this.lastListenerAudioGeneration !== generationId) {
      this.lastListenerAudioGeneration = generationId;
      this.lastListenerAudioChunks = [];
    }
    this.lastListenerAudioChunks.push({ pcm: pcm.slice(), sampleRate });
    this.elements['replay-listener-button'].disabled = false;
    if (!this.listenerDecisions.has(generationId)) {
      const cooldown = Number(this.elements['cooldown'].value);
      const allowed = !this.listenerMuted &&
        Date.now() - this.lastListenerPlayedAt >= cooldown;
      this.listenerDecisions.set(generationId, allowed);
      this.listenerSamples.set(generationId, 0);
      if (allowed) {
        this.metrics.played += 1;
        this.lastListenerPlayedAt = Date.now();
        this.log('listener', `Generation ${generationId} admitted to the floor`);
      } else {
        this.metrics.suppressed += 1;
        const reason = this.listenerMuted ? 'muted' : 'cooldown';
        this.log('listener', `Generation ${generationId} suppressed · ${reason}`);
      }
      this.updateMetrics();
    }

    if (!this.listenerDecisions.get(generationId)) return;
    const previousSamples = this.listenerSamples.get(generationId) || 0;
    const maxSamples = Math.round(Number(this.elements['max-listener'].value) / 1000 * sampleRate);
    const remainingSamples = Math.max(0, maxSamples - previousSamples);
    if (remainingSamples === 0) {
      this.listenerDecisions.set(generationId, false);
      return;
    }
    const playable = pcm.length > remainingSamples ? pcm.subarray(0, remainingSamples) : pcm;
    const samples = previousSamples + playable.length;
    this.listenerSamples.set(generationId, samples);
    if (this.context.state === 'suspended') {
      this.context.resume().then(() => this.listenerBus.enqueue(playable, sampleRate));
    } else {
      this.listenerBus.enqueue(playable, sampleRate);
    }
    if (playable.length < pcm.length || samples >= maxSamples) {
      this.listenerDecisions.set(generationId, false);
      this.log('listener', `Generation ${generationId} capped at ${Math.round(samples / sampleRate * 1000)} ms`);
    }
    this.elements['listener-status'].textContent = 'Backchannel speaking';
  }

  addTranscript(message) {
    if (!message.final) return;
    if (message.direction === 'input' && message.channel !== 'main') return;
    const target = this.elements['duet-transcript'];
    const speaker = message.direction === 'input' ? 'caller' : message.channel;
    const turn = document.createElement('div');
    turn.className = `turn ${speaker}`;
    const meta = document.createElement('div');
    meta.className = 'turn-meta';
    const role = document.createElement('span');
    role.className = `speaker-label ${speaker}`;
    role.textContent = speaker === 'caller'
      ? 'Caller'
      : (speaker === 'main' ? 'Main agent' : 'Listener');
    const time = document.createElement('span');
    time.textContent = new Date().toLocaleTimeString();
    meta.append(role, time);
    const text = document.createElement('p');
    text.textContent = message.text;
    turn.append(meta, text);
    target.appendChild(turn);
    target.scrollTop = target.scrollHeight;
  }

  toggleListenerMute() {
    this.listenerMuted = !this.listenerMuted;
    if (this.listenerMuted) this.listenerBus?.stop();
    this.elements['mute-listener-button'].textContent = this.listenerMuted ? 'Unmute listener' : 'Mute listener';
    this.elements['listener-status'].textContent = this.listenerMuted ? 'Muted by operator' : 'Ready';
    this.log('system', `Listener ${this.listenerMuted ? 'muted' : 'unmuted'}`);
  }

  async replayLatestListener() {
    if (!this.lastListenerAudioChunks.length) return;
    await this.ensureAudio();
    this.listenerBus.stop();
    for (const chunk of this.lastListenerAudioChunks) {
      this.listenerBus.enqueue(chunk.pcm, chunk.sampleRate);
    }
    this.log('listener', `Replaying generation ${this.lastListenerAudioGeneration} directly to the speaker`);
  }

  stopMicrophone() {
    if (this.listenerSpeechActive && this.ws?.readyState === WebSocket.OPEN) {
      this.closeListenerClause('microphone stopped');
    }
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try { this.processor.disconnect(); } catch (_err) {}
      this.processor = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (_err) {}
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    this.elements['meter-fill'].style.width = '0';
    this.elements['meter-db'].value = '−∞ dB';
  }

  stop() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'duet_audio_end' }));
      this.ws.send(JSON.stringify({ type: 'duet_stop' }));
    }
    this.running = false;
    this.stopMicrophone();
    this.mainBus?.stop();
    this.listenerBus?.stop();
    this.listenerDecisions.clear();
    this.listenerSamples.clear();
    this.resetListenerVAD();
    this.setConnection('idle', 'Idle');
    this.elements['start-button'].disabled = false;
    this.elements['stop-button'].disabled = true;
    this.elements['mute-listener-button'].disabled = true;
    this.elements['main-status'].textContent = 'Disconnected';
    this.elements['listener-status'].textContent = 'Disconnected';
    this.setLight('main', '');
    this.setLight('listener', '');
  }

  fail(message) {
    this.log('system', `ERROR · ${message}`);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'duet_stop' }));
    }
    this.setConnection('error', 'Error');
    this.running = false;
    this.stopMicrophone();
    this.mainBus?.stop();
    this.listenerBus?.stop();
    this.elements['start-button'].disabled = false;
    this.elements['stop-button'].disabled = true;
  }

  setConnection(kind, text) {
    const pill = this.elements['connection-pill'];
    pill.className = `pill ${kind}`;
    pill.textContent = text;
  }

  setLight(channel, state) {
    this.elements[`${channel}-light`].className = `channel-light ${state}`;
  }

  refreshFloor() {
    if (!this.running) return;
    const mainBusy = this.mainBus?.isBusy();
    const listenerBusy = this.listenerBus?.isBusy();
    const pill = this.elements['floor-pill'];
    if (mainBusy) {
      pill.className = 'pill busy';
      pill.textContent = 'Main';
      this.elements['main-status'].textContent = 'Speaking · owns the floor';
    } else if (listenerBusy) {
      pill.className = 'pill ready';
      pill.textContent = 'Listener';
      this.elements['listener-status'].textContent = 'Backchannel speaking';
    } else {
      pill.className = 'pill idle';
      pill.textContent = 'Caller';
      if (!this.listenerMuted) this.elements['listener-status'].textContent = 'Listening for clause meaning';
      this.elements['main-status'].textContent = 'Listening for complete thought';
    }
  }

  resetMetrics() {
    this.metrics = { generated: 0, played: 0, suppressed: 0, preemptions: 0 };
    this.listenerDecisions.clear();
    this.listenerSamples.clear();
    this.lastListenerPlayedAt = 0;
    this.lastMainAudioAt = 0;
    this.lastListenerAudioGeneration = null;
    this.lastListenerAudioChunks = [];
    this.elements['replay-listener-button'].disabled = true;
    this.updateMetrics();
  }

  updateMetrics() {
    this.elements['listener-generated'].textContent = this.metrics.generated;
    this.elements['listener-played'].textContent = this.metrics.played;
    this.elements['listener-suppressed'].textContent = this.metrics.suppressed;
    this.elements['main-preemptions'].textContent = this.metrics.preemptions;
  }

  log(channel, message) {
    const row = document.createElement('div');
    row.className = 'event-row';
    const time = document.createElement('span');
    time.textContent = new Date().toLocaleTimeString();
    const source = document.createElement('span');
    source.className = channel;
    source.textContent = channel;
    const detail = document.createElement('span');
    detail.textContent = message;
    row.append(time, source, detail);
    this.elements['event-log'].appendChild(row);
    this.elements['event-log'].scrollTop = this.elements['event-log'].scrollHeight;
  }
}

new DuetLab();
