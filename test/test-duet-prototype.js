import assert from 'node:assert/strict';
import { DuetPrototypeSession } from '../src/session/duet-prototype-session.js';

console.log('🧪 Starting Duet Lab configuration tests...');

const session = new DuetPrototypeSession({
  apiKey: 'test-key',
  model: 'gemini-2.5-flash-native-audio-latest',
  voice: 'Aoede',
  assistantName: 'Janet',
  assistantPrompt: 'You are Janet.',
  listeningStyle: 'Empathetic and restrained.',
  mainSilenceMs: 1000,
  listenerSilenceMs: 260,
});

session.createChannels();

assert.equal(session.model, 'gemini-2.5-flash-native-audio-preview-12-2025');

const mainSetup = session.main.buildSetup();
const listenerSetup = session.listener.buildSetup();

assert.equal(mainSetup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 1000);
assert.deepEqual(listenerSetup.realtimeInputConfig.automaticActivityDetection, { disabled: true });
assert.equal(mainSetup.realtimeInputConfig.activityHandling, 'START_OF_ACTIVITY_INTERRUPTS');
assert.equal(listenerSetup.realtimeInputConfig.activityHandling, 'NO_INTERRUPTION');
assert.equal(listenerSetup.proactivity, undefined);
assert.equal(listenerSetup.enableAffectiveDialog, undefined);
assert.equal(listenerSetup.generationConfig.maxOutputTokens, undefined);
assert.equal(listenerSetup.generationConfig.temperature, 0.7);
assert.deepEqual(mainSetup.inputAudioTranscription, {});
assert.deepEqual(listenerSetup.outputAudioTranscription, {});
assert.match(session.main.systemInstruction, /primary conversational agent/i);
assert.match(session.listener.systemInstruction, /active backchannel audio generator/i);
assert.match(session.listener.systemInstruction, /soft tongue click/i);
assert.doesNotMatch(session.listener.systemInstruction, /SILENCE/i);
assert.match(session.listener.systemInstruction, /Always choose one brief reaction token/i);
assert.match(session.listener.systemInstruction, /natural micro-pauses \(300-500ms\)/i);
assert.doesNotMatch(session.listener.systemInstruction, /You are Janet\./);

const customized = new DuetPrototypeSession({
  apiKey: 'test-key',
  mainInstruction: 'Custom main prompt',
  listenerInstruction: 'Custom listener prompt',
});
customized.createChannels();
assert.equal(customized.main.systemInstruction, 'Custom main prompt');
assert.equal(customized.listener.systemInstruction, 'Custom listener prompt');

const routing = { mainAudio: 0, listenerAudio: 0, listenerStarts: 0, listenerEnds: 0 };
session.started = true;
session.main.sendAudio = () => { routing.mainAudio += 1; };
session.listener.sendAudio = () => { routing.listenerAudio += 1; };
session.listener.sendActivityStart = () => { routing.listenerStarts += 1; };
session.listener.sendActivityEnd = () => { routing.listenerEnds += 1; };
session.sendAudio(Buffer.alloc(10));
assert.deepEqual(routing, { mainAudio: 1, listenerAudio: 0, listenerStarts: 0, listenerEnds: 0 });
session.beginListenerClause();
session.sendAudio(Buffer.alloc(10));
session.endListenerClause();
assert.deepEqual(routing, { mainAudio: 2, listenerAudio: 1, listenerStarts: 1, listenerEnds: 1 });
assert.equal(session.listenerInputOpen, false);

const clamped = new DuetPrototypeSession({
  apiKey: 'test-key',
  model: 'gemini-test-live',
  mainSilenceMs: 50,
  listenerSilenceMs: 5000,
});
assert.equal(clamped.mainSilenceMs, 600);
assert.equal(clamped.listenerSilenceMs, 700);

const explicitModel = new DuetPrototypeSession({
  apiKey: 'test-key',
  model: 'gemini-3.1-flash-live-preview',
});
assert.equal(explicitModel.model, 'gemini-3.1-flash-live-preview');

session.destroy();
clamped.destroy();
explicitModel.destroy();
customized.destroy();

console.log('✅ Duet Lab configuration tests passed');
