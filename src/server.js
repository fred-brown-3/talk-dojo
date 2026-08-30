import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import { ScenarioStore } from './scenario/store.js';
import { CallSession } from './session/call-session.js';
import { AccountManager } from './account/account-manager.js';
import { MassTestGenerator } from './generators/mass-test-generator.js';
import { BatchRunner } from './runner/batch-runner.js';
import { VirtualToolManager } from './tools/virtual-tool-manager.js';
import { CertificationManager } from './certification/certification-manager.js';
import { LLMJudge } from './gemini/judge.js';
import { VoicePreviewGenerator } from './audio/voice-preview-generator.js';
import fsSync from 'fs';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const scenarioStore = new ScenarioStore();
const accountManager = new AccountManager();
await accountManager.init();
let runtimeApiKey = config.geminiApiKey;
let activeSession = null;

const massTestGenerator = new MassTestGenerator(runtimeApiKey);
const batchRunner = new BatchRunner({ accountManager, apiKey: runtimeApiKey });
const virtualToolManager = new VirtualToolManager();
const certificationManager = new CertificationManager(accountManager);
const llmJudge = new LLMJudge(runtimeApiKey);

// Broadcast helper
function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// Wire BatchRunner events to broadcast over WebSocket
batchRunner.on('batch_started', (data) => broadcast({ type: 'batch_started', ...data }));
batchRunner.on('test_started', (data) => broadcast({ type: 'test_started', ...data }));
batchRunner.on('turn_update', (data) => broadcast({ type: 'batch_turn_update', ...data }));
batchRunner.on('tool_executed', (data) => broadcast({ type: 'batch_tool_executed', ...data }));
batchRunner.on('test_completed', (data) => broadcast({ type: 'test_completed', ...data }));
batchRunner.on('batch_completed', (data) => broadcast({ type: 'batch_completed', ...data }));
batchRunner.on('batch_aborted', (data) => broadcast({ type: 'batch_aborted', ...data }));

app.use(express.json());
app.use(express.static(config.publicDir));
app.use('/runs', express.static(config.runsDir));

// --- REST Endpoints ---

// Configuration
app.get('/api/config', (req, res) => {
  res.json({
    hasApiKey: !!runtimeApiKey,
    model: config.geminiLiveModel,
    judgeModel: config.geminiJudgeModel,
    port: config.port,
  });
});

app.post('/api/config/key', (req, res) => {
  const { apiKey } = req.body;
  if (apiKey && typeof apiKey === 'string') {
    runtimeApiKey = apiKey.trim();
    massTestGenerator.apiKey = runtimeApiKey;
    batchRunner.apiKey = runtimeApiKey;
    res.json({ success: true, hasApiKey: true });
  } else {
    res.status(400).json({ error: 'Invalid API key' });
  }
});

// --- CUSTOMER ACCOUNTS API ---

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await accountManager.listAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id', async (req, res) => {
  try {
    const account = await accountManager.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const account = await accountManager.saveAccount(req.body);
    res.json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Company Info Dynamic Markdown
app.get('/api/accounts/:id/company-info', async (req, res) => {
  try {
    const info = await accountManager.getCompanyInfo(req.params.id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/company-info', async (req, res) => {
  try {
    const { markdown, sections } = req.body;
    const info = await accountManager.saveCompanyInfo(req.params.id, markdown || sections);
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- POLICIES API (ALWAYS, NEVER, CONDITIONAL) ---

app.get('/api/accounts/:id/policies', async (req, res) => {
  try {
    const policies = await accountManager.listPolicies(req.params.id, req.query.filter);
    res.json(policies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/policies/:policyId', async (req, res) => {
  try {
    const policy = await accountManager.getPolicy(req.params.id, req.params.policyId);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/policies', async (req, res) => {
  try {
    const policy = await accountManager.savePolicy(req.params.id, req.body);
    res.json(policy);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/policies/:policyId', async (req, res) => {
  try {
    const result = await accountManager.deletePolicy(req.params.id, req.params.policyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PROCEDURES API (WORKFLOWS, TOOL CONSTRAINTS & INTEGRATED TEST SCENARIOS) ---

app.get('/api/accounts/:id/procedures', async (req, res) => {
  try {
    const procedures = await accountManager.listProcedures(req.params.id, req.query.filter);
    res.json(procedures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/procedures/:procedureId', async (req, res) => {
  try {
    const procedure = await accountManager.getProcedure(req.params.id, req.params.procedureId);
    if (!procedure) return res.status(404).json({ error: 'Procedure not found' });
    res.json(procedure);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/procedures', async (req, res) => {
  try {
    const procedure = await accountManager.saveProcedure(req.params.id, req.body);
    res.json(procedure);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/procedures/:procedureId', async (req, res) => {
  try {
    const result = await accountManager.deleteProcedure(req.params.id, req.params.procedureId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/procedures/:procedureId/scenarios', async (req, res) => {
  try {
    const scenario = await accountManager.addScenarioToProcedure(req.params.id, req.params.procedureId, req.body);
    res.json(scenario);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/procedures/:procedureId/scenarios/:scenarioId', async (req, res) => {
  try {
    const result = await accountManager.deleteScenarioFromProcedure(req.params.id, req.params.procedureId, req.params.scenarioId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ASSISTANTS API ---

app.get('/api/accounts/:id/assistants', async (req, res) => {
  try {
    const assistants = await accountManager.listAssistants(req.params.id);
    res.json(assistants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/assistants/:assistantId', async (req, res) => {
  try {
    const assistant = await accountManager.getAssistant(req.params.id, req.params.assistantId);
    res.json(assistant);
  } catch (err) {
    res.status(404).json({ error: 'Assistant not found' });
  }
});

app.post('/api/accounts/:id/assistants', async (req, res) => {
  try {
    const assistant = await accountManager.saveAssistant(req.params.id, req.body);
    res.json(assistant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/assistants/:assistantId', async (req, res) => {
  try {
    const result = await accountManager.deleteAssistant(req.params.id, req.params.assistantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Voice Preview (10-second audio clip)
app.get('/api/voice-preview/:voiceName', async (req, res) => {
  try {
    const wavBuffer = await VoicePreviewGenerator.getPreviewWAV(req.params.voiceName, runtimeApiKey);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.send(wavBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POLICY TUNING CHAT WITH AI ---

app.post('/api/accounts/:id/policies/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  const account = await accountManager.getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  if (!runtimeApiKey) {
    return res.status(400).json({ error: 'Gemini API key is required for policy tuning chat' });
  }

  const currentPolicies = (account.policies || []).map((p, idx) => `${idx + 1}. ${p}`).join('\n');
  const systemPrompt = `You are a Senior Policy & Voice-AI Telephony Compliance Consultant for "${account.name}".
Your goal is to help the user adjust, refine, and tune their company policies to ensure safe, effective, and compliant telephone conversations.

Current Company Policies:
${currentPolicies || '(No policies defined yet)'}

When the user asks for suggestions or rule updates:
1. Explain the rationale conversationally.
2. If you are proposing an amendment or revised policy list, output a structured JSON block at the end of your response:
\`\`\`json
{
  "suggested_policies": [
    "Policy 1...",
    "Policy 2..."
  ]
}
\`\`\`
This allows the user to click 'Apply Policies' in the UI.`;

  const contents = [
    { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser request: ${message}` }] }
  ];

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${runtimeApiKey}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    const json = await apiRes.json();
    const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || 'I have reviewed your request.';

    // Check for suggested_policies block
    let suggestedPolicies = null;
    const jsonMatch = replyText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed.suggested_policies)) {
          suggestedPolicies = parsed.suggested_policies;
        }
      } catch (e) {}
    }

    res.json({ reply: replyText, suggestedPolicies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply suggested policies
app.post('/api/accounts/:id/policies/apply', async (req, res) => {
  try {
    const { policies } = req.body;
    const account = await accountManager.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    account.policies = policies;
    await accountManager.saveAccount(account);
    res.json({ success: true, policies: account.policies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Describe your business..." AI Generator
app.post('/api/accounts/:id/describe-business', async (req, res) => {
  try {
    const { prompt } = req.body;
    const generated = await accountManager.generateBusinessFromDescription(prompt, runtimeApiKey);
    res.json(generated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Describe your perfect assistant..." AI Generator
app.post('/api/accounts/:id/assistants/describe', async (req, res) => {
  try {
    const { prompt } = req.body;
    const generated = await accountManager.generateAssistantFromDescription(prompt, runtimeApiKey);
    res.json(generated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- VIRTUAL TOOLS (GROUPED SERVICE STUBS) API ---

app.get('/api/accounts/:id/virtual-tools', async (req, res) => {
  try {
    const tools = await virtualToolManager.listTools(req.params.id);
    res.json(tools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/virtual-tools/:toolId', async (req, res) => {
  try {
    const tool = await virtualToolManager.getTool(req.params.id, req.params.toolId);
    res.json(tool);
  } catch (err) {
    res.status(404).json({ error: 'Virtual tool not found' });
  }
});

app.post('/api/accounts/:id/virtual-tools', async (req, res) => {
  try {
    const saved = await virtualToolManager.saveTool(req.params.id, req.body);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/virtual-tools/:toolId', async (req, res) => {
  try {
    const result = await virtualToolManager.deleteTool(req.params.id, req.params.toolId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Describe your tools..." AI Generator
app.post('/api/accounts/:id/virtual-tools/describe', async (req, res) => {
  try {
    const { prompt } = req.body;
    const generated = await virtualToolManager.generateToolStubFromDescription(prompt, runtimeApiKey);
    res.json(generated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CERTIFICATION (SNAPSHOTS & ACTIVE DEPLOYMENT) API ---

app.post('/api/accounts/:id/certification/certify', async (req, res) => {
  try {
    const { assistantId, bankId = 'default-bank', mode = 'text' } = req.body;
    // Run async certification
    certificationManager.snapshotAndCertify({
      accountId: req.params.id,
      assistantId,
      bankId,
      mode,
      onProgress: (evt) => broadcast({ type: 'certification_progress', ...evt }),
    }).then(snap => {
      broadcast({ type: 'certification_completed', snapshot: snap });
    }).catch(err => {
      console.error('Certification error:', err);
      broadcast({ type: 'certification_error', error: err.message });
    });

    res.json({ started: true, mode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/certification/snapshots', async (req, res) => {
  try {
    const snapshots = await certificationManager.listSnapshots(req.params.id);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/certification/snapshots/:snapshotId', async (req, res) => {
  try {
    const snapshot = await certificationManager.getSnapshot(req.params.id, req.params.snapshotId);
    res.json(snapshot);
  } catch (err) {
    res.status(404).json({ error: 'Snapshot not found' });
  }
});

app.post('/api/accounts/:id/certification/snapshots/:snapshotId/deploy', async (req, res) => {
  try {
    const { forced } = req.body;
    const result = await certificationManager.deployActiveConfiguration(req.params.id, req.params.snapshotId, forced);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/certification/active', async (req, res) => {
  try {
    const active = await certificationManager.getActiveConfiguration(req.params.id);
    res.json(active || { activeSnapshot: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/certification/deployments', async (req, res) => {
  try {
    const history = await certificationManager.getDeploymentHistory(req.params.id);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/certification/pause', (req, res) => {
  certificationManager.pause();
  res.json({ success: true, status: 'PAUSED' });
});

app.post('/api/accounts/:id/certification/resume', (req, res) => {
  certificationManager.resume();
  res.json({ success: true, status: 'RESUMED' });
});

app.post('/api/accounts/:id/certification/abort', (req, res) => {
  certificationManager.abort();
  res.json({ success: true, status: 'ABORTED' });
});

// --- CHAT WITH ASSISTANT (VOICE-FIRST & TEXT) API ---

app.post('/api/chat/assistant-turn', async (req, res) => {
  try {
    const { accountId, assistantId, message, history = [], modality = 'text', scenarioContext = '' } = req.body;
    const account = await accountManager.getAccount(accountId);
    const assistant = await accountManager.getAssistant(accountId, assistantId);
    if (!account || !assistant) return res.status(404).json({ error: 'Account or Assistant not found' });

    const assistantPrompt = await accountManager.compileAssistantPrompt(accountId, assistantId);
    const systemInstruction = `${assistantPrompt}\n\n=== CALL SCENARIO CONTEXT ===\n${scenarioContext || 'The customer has called your telephone line.'}\nRespond strictly in spoken conversational character as ${assistant.name}. Keep phone responses concise, natural, and friendly.`;

    if (!runtimeApiKey) {
      return res.json({ reply: `Hello, this is ${assistant.name}. (API key required for live responses)` });
    }

    if (modality === 'voice' || modality === 'hybrid') {
      // Use Gemini audio modality for native LLM voice output
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${runtimeApiKey}`;
      const contents = [
        ...history.map(h => ({ role: h.speaker === 'caller' ? 'model' : 'user', parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: message }] }
      ];

      const apiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: assistant.voice || 'Aoede',
                },
              },
            },
          },
        }),
      });

      const json = await apiRes.json();
      const candidate = json.candidates?.[0]?.content?.parts?.[0];
      let audioBase64 = null;
      let replyText = '';

      if (candidate?.inlineData?.data) {
        audioBase64 = candidate.inlineData.data;
      }
      replyText = candidate?.text || `(Spoken by ${assistant.name})`;

      return res.json({ reply: replyText, audioBase64, voice: assistant.voice || 'Aoede' });
    }

    // Text mode turn
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${runtimeApiKey}`;
    const contents = [
      ...history.map(h => ({ role: h.speaker === 'caller' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
      }),
    });

    const json = await apiRes.json();
    const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || `Hello, this is ${assistant.name}. How can I assist you?`;
    res.json({ reply: replyText, voice: assistant.voice || 'Aoede' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- INTERACTION REVIEW API ---

app.post('/api/chat/review-interaction', async (req, res) => {
  try {
    const { scenario, transcript, assistantId } = req.body;
    const evaluation = await llmJudge.evaluateConversation({
      scenario: scenario || { title: 'Freeform Interaction', evaluation_checklist: [] },
      transcript: transcript || [],
      toolLogs: [],
      metrics: { turnCount: transcript?.length || 0, mode: 'chat' },
    });
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GLOBAL PLATFORM COACH API (FLOATING BUBBLE) ---

app.post('/api/platform-coach/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!runtimeApiKey) {
      return res.status(400).json({ error: 'Gemini API key is required' });
    }

    const systemPrompt = `You are the Talk Dojo Platform Coach.
Your mission is to help users navigate and master Talk Dojo:
- Designing effective voice assistants and natural conversational guidelines.
- Structuring virtual tools (MCP stubs) for EHRs, calendars, and CRMs.
- Authoring rigorous test scenarios with realistic customer personas and edge cases.
- Understanding Certification snapshots and deploying safe, validated configurations.
Be concise, encouraging, structured, and helpful. Always give practical examples.`;

    const contents = [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${message}` }] }
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${runtimeApiKey}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    const json = await apiRes.json();
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || 'I am your Talk Dojo Coach. How can I help you today?';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TEST BANKS & TESTS API ---

app.get('/api/accounts/:id/test-banks', async (req, res) => {
  try {
    const banks = await accountManager.listTestBanks(req.params.id);
    res.json(banks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/test-banks/:bankId/tests', async (req, res) => {
  try {
    const assistantId = req.query.assistantId || null;
    const tests = await accountManager.listTests(req.params.id, req.params.bankId, assistantId);
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/test-banks/:bankId/tests/:testId', async (req, res) => {
  try {
    const test = await accountManager.getTest(req.params.id, req.params.bankId, req.params.testId);
    res.json(test);
  } catch (err) {
    res.status(404).json({ error: 'Test not found' });
  }
});

app.post('/api/accounts/:id/test-banks/:bankId/tests', async (req, res) => {
  try {
    const test = await accountManager.saveTest(req.params.id, req.params.bankId, req.body);
    res.json(test);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/accounts/:id/test-banks/:bankId/tests/:testId/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const test = await accountManager.toggleTestEnabled(req.params.id, req.params.bankId, req.params.testId, enabled);
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/test-banks/:bankId/tests/:testId/copy', async (req, res) => {
  try {
    const copy = await accountManager.copyTest(req.params.id, req.params.bankId, req.params.testId);
    res.json(copy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/accounts/:id/test-banks/:bankId/tests/:testId/rename', async (req, res) => {
  try {
    const { title } = req.body;
    const updated = await accountManager.renameTest(req.params.id, req.params.bankId, req.params.testId, title);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/test-banks/:bankId/tests/:testId', async (req, res) => {
  try {
    const result = await accountManager.deleteTest(req.params.id, req.params.bankId, req.params.testId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MASS TEST GENERATOR & DRAFTS API ---

app.post('/api/accounts/:id/test-banks/:bankId/generate', async (req, res) => {
  try {
    const { prompt, assistantId, count = 4 } = req.body;
    const account = await accountManager.getAccount(req.params.id);
    const assistant = assistantId ? await accountManager.getAssistant(req.params.id, assistantId) : null;

    const generated = await massTestGenerator.generateSuite({ prompt, account, assistant, count });
    // Save generated suite as drafts
    const savedDrafts = await accountManager.saveDrafts(req.params.id, req.params.bankId, generated);
    res.json({ success: true, count: savedDrafts.length, drafts: savedDrafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/test-banks/:bankId/drafts', async (req, res) => {
  try {
    const drafts = await accountManager.listDrafts(req.params.id, req.params.bankId);
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/test-banks/:bankId/drafts/:draftId/promote', async (req, res) => {
  try {
    const promoted = await accountManager.promoteDraftToTest(req.params.id, req.params.bankId, req.params.draftId);
    res.json({ success: true, test: promoted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/test-banks/:bankId/drafts/:draftId', async (req, res) => {
  try {
    const result = await accountManager.discardDraft(req.params.id, req.params.bankId, req.params.draftId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RECYCLE BIN & ARCHIVE API ---

app.get('/api/accounts/:id/recycle-bin', async (req, res) => {
  try {
    const items = await accountManager.listRecycleBin(req.params.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/recycle-bin/:binItemId/restore', async (req, res) => {
  try {
    const result = await accountManager.restoreRecycleItem(req.params.id, req.params.binItemId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/recycle-bin', async (req, res) => {
  try {
    const result = await accountManager.clearRecycleBin(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- BATCH TEST RUNNER API ---

app.post('/api/accounts/:id/batch-run', async (req, res) => {
  try {
    const { assistantId, bankId = 'default-bank', mode = 'text', maxTurns = 6 } = req.body;
    // Launch async batch run so request returns immediately with runner status
    batchRunner.runBatch({
      accountId: req.params.id,
      assistantId,
      bankId,
      mode,
      maxTurns,
    }).catch(err => console.error('Batch runner background error:', err));

    res.json({ started: true, mode, bankId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/batch-run/abort', (req, res) => {
  batchRunner.abort();
  res.json({ aborted: true });
});

// --- DUAL REMEDIATION APPLY API ---

app.post('/api/remediation/apply', async (req, res) => {
  try {
    const { accountId, assistantId, testId, fixType, target, patch } = req.body;

    if (fixType === 'POLICY_AMENDMENT') {
      const account = await accountManager.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found' });
      if (!Array.isArray(account.policies)) account.policies = [];
      account.policies.push(patch);
      await accountManager.saveAccount(account);
      return res.json({ success: true, message: 'Policy amendment successfully applied to account!' });
    }

    if (fixType === 'SCENARIO_CORRECTION') {
      const test = await accountManager.getTest(accountId, 'default-bank', testId);
      if (!test) return res.status(404).json({ error: 'Test scenario not found' });
      if (typeof patch === 'object') {
        Object.assign(test, patch);
      }
      await accountManager.saveTest(accountId, 'default-bank', test);
      return res.json({ success: true, message: 'Scenario correction successfully applied!' });
    }

    res.status(400).json({ error: 'Unknown remediation type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AUDIO STREAMING WITH HTTP RANGE SUPPORT ---

app.get('/api/runs/:id/audio', async (req, res) => {
  try {
    // Find matching WAV file
    const runPath = path.join(config.runsDir, `${req.params.id}.json`);
    let wavFile = `${req.params.id}.wav`;
    try {
      const raw = await fs.readFile(runPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.wavFile) wavFile = parsed.wavFile;
    } catch (e) {}

    const filePath = path.join(config.runsDir, wavFile);
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const stat = fsSync.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fsSync.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'audio/wav',
      });
      fsSync.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List legacy starter scenarios for backwards compatibility
app.get('/api/scenarios', async (req, res) => {
  try {
    const list = await scenarioStore.listScenarios();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scenarios/:id', async (req, res) => {
  try {
    const scenario = await scenarioStore.getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WebSocket Realtime Audio & Call Dispatcher ---

wss.on('connection', (ws) => {
  // Send current configuration & session state
  ws.send(JSON.stringify({
    type: 'init',
    hasApiKey: !!runtimeApiKey,
    callState: activeSession ? activeSession.state : 'IDLE',
    sessionId: activeSession ? activeSession.id : null,
  }));

  ws.on('message', async (rawMsg) => {
    let msg;
    try {
      msg = JSON.parse(rawMsg.toString());
    } catch (e) {
      return;
    }

    // Handle Start Call
    if (msg.type === 'start_call') {
      const apiKeyToUse = msg.apiKey || runtimeApiKey;
      if (!apiKeyToUse) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Gemini API Key is required to start a call. Please enter your key in the header.',
        }));
        return;
      }

      if (msg.apiKey && msg.apiKey !== runtimeApiKey) {
        runtimeApiKey = msg.apiKey;
      }

      if (activeSession && activeSession.state !== 'COMPLETED') {
        await activeSession.hangup();
      }

      try {
        let scenario = msg.scenario;
        if (!scenario && msg.scenarioId) {
          scenario = await scenarioStore.getScenario(msg.scenarioId);
        }
        if (!scenario) {
          ws.send(JSON.stringify({ type: 'error', message: 'Scenario not found' }));
          return;
        }

        activeSession = new CallSession({
          scenario,
          mode: msg.mode || 'ai-to-ai',
          apiKey: runtimeApiKey,
          staticLevel: msg.staticLevel !== undefined ? msg.staticLevel : null,
          noiseTarget: msg.noiseTarget || null,
        });

        // Broadcast session state
        activeSession.on('stateChange', (data) => {
          broadcast({ type: 'state_change', ...data });
        });

        // Broadcast live transcript chunks
        activeSession.on('transcriptPart', (data) => {
          broadcast({ type: 'transcript_part', ...data });
        });

        // Broadcast finalized speech turns
        activeSession.on('turnComplete', (turn) => {
          broadcast({ type: 'turn_complete', turn });
        });

        // Broadcast monitor audio chunks (base64 PCM-16 24kHz)
        activeSession.on('audioMonitor', (data) => {
          broadcast({
            type: 'audio_monitor',
            speaker: data.speaker,
            sampleRate: data.sampleRate,
            data: data.buffer.toString('base64'),
          });
        });

        // Broadcast telephony sound cues (dial, ring, click, hangup)
        activeSession.on('telephonyAudio', (data) => {
          broadcast({
            type: 'telephony_audio',
            toneType: data.toneType,
            sampleRate: data.sampleRate,
            data: data.buffer.toString('base64'),
          });
        });

        // Broadcast line static updates
        activeSession.on('impairmentChanged', (data) => {
          broadcast({ type: 'impairment_changed', ...data });
        });

        // Broadcast tool executions
        activeSession.on('toolExecuted', (data) => {
          broadcast({ type: 'tool_executed', ...data });
        });

        // Broadcast evaluation ready
        activeSession.on('callCompleted', (report) => {
          broadcast({ type: 'call_completed', report });
          activeSession = null;
        });

        activeSession.on('error', (err) => {
          broadcast({ type: 'error', message: err.message || 'Call error' });
        });

        // Start call sequence
        activeSession.start().catch((err) => {
          broadcast({ type: 'error', message: err.message });
        });

      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }

    // Handle Hangup
    else if (msg.type === 'hangup') {
      if (activeSession) {
        await activeSession.hangup();
      }
    }

    // Handle Dynamic Line Static Change
    else if (msg.type === 'set_static') {
      if (activeSession) {
        activeSession.setStatic(msg.staticLevel, msg.target);
      }
    }

    // Handle Human Audio Input from Mic (PCM 16-bit 16kHz base64)
    else if (msg.type === 'human_audio') {
      if (activeSession && activeSession.state === 'CONNECTED' && msg.data) {
        const pcm16k = Buffer.from(msg.data, 'base64');
        activeSession.sendHumanAudio(pcm16k);
      }
    }

    // Handle Human Transcript turn recorded by browser
    else if (msg.type === 'human_transcript') {
      if (activeSession && msg.text) {
        activeSession.recordHumanTranscriptTurn(msg.speaker || 'caller', msg.text);
      }
    }
  });

  ws.on('close', () => {});
});



// Watch public/ directory for frontend edits and auto-refresh browser
function setupFileWatchers() {
  let publicDebounce = null;
  try {
    fs.watch(config.publicDir, { recursive: true }, (eventType, filename) => {
      if (publicDebounce) clearTimeout(publicDebounce);
      publicDebounce = setTimeout(() => {
        console.log(`🔄 Frontend change detected (${filename}), triggering browser live-reload...`);
        broadcast({ type: 'live_reload', file: filename });
      }, 200);
    });
  } catch (err) {
    console.warn('File watching for public/ not available:', err.message);
  }

  let scenarioDebounce = null;
  try {
    fs.watch(config.scenariosDir, { recursive: false }, (eventType, filename) => {
      if (filename && (filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
        if (scenarioDebounce) clearTimeout(scenarioDebounce);
        scenarioDebounce = setTimeout(() => {
          console.log(`📁 Scenario file updated (${filename}), notifying clients...`);
          broadcast({ type: 'scenarios_updated', filename });
        }, 250);
      }
    });
  } catch (err) {
    console.warn('File watching for scenarios/ not available:', err.message);
  }
}

// Start server
async function startServer() {
  await scenarioStore.init();
  setupFileWatchers();
  server.listen(config.port, () => {
    console.log(`🥋 Talk Dojo listening on http://localhost:${config.port}`);
  });
}

startServer();
