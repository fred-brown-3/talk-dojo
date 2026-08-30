import { config } from '../src/config.js';
import WebSocket from 'ws';

async function testToolRoundtrip() {
  console.log('Testing tool execution and voice response roundtrip...');
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.geminiApiKey}`;
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('Connected! Sending setup with tool...');
    ws.send(JSON.stringify({
      setup: {
        model: `models/${config.geminiLiveModel}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          }
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'check_clinic_slots',
                description: 'Lookup available appointment openings at the clinic',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    date: { type: 'STRING', description: 'Date to check' }
                  },
                  required: ['date']
                }
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [{ text: 'You are Sarah, clinic receptionist. Check clinic slots for Thursday and speak the available openings.' }]
        }
      }
    }));
  });

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());

    if (parsed.setupComplete) {
      console.log('Setup confirmed! Sending user kickstart...');
      ws.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: 'Can you check what slots are open on Thursday?' }] }],
          turnComplete: true
        }
      }));
    }

    if (parsed.toolCall && parsed.toolCall.functionCalls) {
      const fc = parsed.toolCall.functionCalls[0];
      console.log(`\n⚙️ Received toolCall: ${fc.name}(${JSON.stringify(fc.args)}) ID: ${fc.id}`);
      
      const mockResult = {
        available_slots: ['Thursday 2:00 PM', 'Thursday 4:15 PM']
      };
      console.log(`   Executing tool... Returning output:`, mockResult);

      const respMsg = {
        toolResponse: {
          functionResponses: [
            {
              response: { output: mockResult },
              id: fc.id
            }
          ]
        }
      };

      ws.send(JSON.stringify(respMsg));
      console.log('   Sent toolResponse back to Gemini Live!');
    }

    if (parsed.serverContent?.modelTurn?.parts) {
      for (const p of parsed.serverContent.modelTurn.parts) {
        if (p.text && !p.thought) {
          console.log(`💬 Spoken dialogue text: "${p.text}"`);
        }
        if (p.inlineData) {
          console.log(`🔊 Received audio packet (${p.inlineData.data.length} bytes base64)`);
        }
      }
    }

    if (parsed.serverContent?.turnComplete) {
      console.log('\n✅ Turn complete! Model spoke the tool result successfully!');
      ws.close();
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error('Timed out');
    ws.close();
    process.exit(1);
  }, 15000);
}

testToolRoundtrip().catch(err => console.error(err));
