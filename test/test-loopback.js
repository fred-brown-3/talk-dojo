import { GeminiLiveClient } from '../src/gemini/live-client.js';
import { AudioResampler } from '../src/audio/resampler.js';
import { config } from '../src/config.js';

async function testLoopback() {
  console.log('Testing 2-agent Gemini Live loopback...');

  const caller = new GeminiLiveClient({
    apiKey: config.geminiApiKey,
    model: config.geminiLiveModel,
    voice: 'Aoede',
    systemInstruction: 'You are Sarah, a secretary. You are calling John. Keep statements under 15 words.',
    role: 'caller',
  });

  const callee = new GeminiLiveClient({
    apiKey: config.geminiApiKey,
    model: config.geminiLiveModel,
    voice: 'Fenrir',
    systemInstruction: 'You are Mark, John\'s roommate. John is mowing the lawn. Keep statements under 15 words.',
    role: 'callee',
  });

  // Wire loopback with silence padding on turnComplete
  function sendSilencePadding(client, durationMs = 800) {
    const numSamples = Math.floor((durationMs / 1000) * 16000);
    const silenceBuf = Buffer.alloc(numSamples * 2, 0);
    // Send in 100ms chunks (3200 bytes per chunk)
    const chunkSize = 3200;
    for (let offset = 0; offset < silenceBuf.length; offset += chunkSize) {
      const chunk = silenceBuf.subarray(offset, Math.min(offset + chunkSize, silenceBuf.length));
      client.sendAudio(chunk);
    }
  }

  caller.on('audio', ({ buffer }) => {
    const pcm16k = AudioResampler.downsample24kTo16k(buffer);
    callee.sendAudio(pcm16k);
  });

  caller.on('turnComplete', ({ text }) => {
    console.log(`[CALLER] Sarah: "${text}"`);
    console.log(' -> Sarah finished speaking, sending silence padding to Callee...');
    sendSilencePadding(callee, 1000);
  });

  callee.on('audio', ({ buffer }) => {
    const pcm16k = AudioResampler.downsample24kTo16k(buffer);
    caller.sendAudio(pcm16k);
  });

  callee.on('turnComplete', ({ text }) => {
    console.log(`[CALLEE] Mark: "${text}"`);
    console.log(' -> Mark finished speaking, sending silence padding to Caller...');
    sendSilencePadding(caller, 1000);
  });

  caller.on('error', err => console.error('Caller error:', err));
  callee.on('error', err => console.error('Callee error:', err));

  await Promise.all([caller.connect(), callee.connect()]);
  console.log('Both agents connected! Kickstarting caller...');

  caller.sendTextPrompt('Start by saying: "Hello, is John Doe there?"');

  // Wait 15 seconds
  await new Promise(r => setTimeout(r, 15000));
  console.log('Disconnecting...');
  caller.disconnect();
  callee.disconnect();
  process.exit(0);
}

testLoopback().catch(err => {
  console.error(err);
  process.exit(1);
});
