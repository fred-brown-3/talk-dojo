import { config } from '../src/config.js';
import WebSocket from 'ws';

async function testModels() {
  console.log('🔍 Testing Gemini API Configuration & Models...');
  console.log(`- API Key present: ${!!config.geminiApiKey}`);
  console.log(`- Live Model: ${config.geminiLiveModel}`);
  console.log(`- Judge Model: ${config.geminiJudgeModel}`);

  if (!config.geminiApiKey) {
    console.error('❌ Error: GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  // 1. Test Judge Model REST API
  console.log(`\n1. Testing Judge Model (${config.geminiJudgeModel})...`);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiJudgeModel}:generateContent?key=${config.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond strictly with JSON: {"status": "operational", "test": "passed"}' }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error(`❌ Judge model test failed: [${data.error.code}] ${data.error.message}`);
      process.exit(1);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`✅ Judge model is working! Response: ${text.trim()}`);
  } catch (err) {
    console.error('❌ Judge model network error:', err.message);
    process.exit(1);
  }

  // 2. Test Live Audio WebSocket Model
  console.log(`\n2. Testing Live WebSocket Model (${config.geminiLiveModel})...`);
  await new Promise((resolve, reject) => {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.geminiApiKey}`;
    const ws = new WebSocket(wsUrl);

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Live WebSocket handshake timed out after 10s'));
    }, 10000);

    ws.on('open', () => {
      console.log('   Connected to Gemini Live WebSocket. Sending setup packet...');
      ws.send(JSON.stringify({
        setup: {
          model: `models/${config.geminiLiveModel}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Aoede' },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: 'You are a test voice assistant. Keep greetings brief.' }],
          },
        },
      }));
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.setupComplete) {
          clearTimeout(timer);
          console.log('✅ Live WebSocket model setup verified! Handshake complete.');
          ws.close();
          resolve();
        }
      } catch (e) {}
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      console.error('❌ Live WebSocket error:', err.message);
      reject(err);
    });
  });

  console.log('\n🎉 ALL GEMINI MODELS ARE FULLY OPERATIONAL!');
  process.exit(0);
}

testModels().catch(err => {
  console.error('\n❌ Diagnostics failed:', err.message);
  process.exit(1);
});
