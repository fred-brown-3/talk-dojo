import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import { CallSession } from './session/call-session.js';
import { DuetPrototypeSession, buildDuetInstructions } from './session/duet-prototype-session.js';
import { AccountManager } from './account/account-manager.js';
import { BatchRunner } from './runner/batch-runner.js';
import { VirtualToolManager } from './tools/virtual-tool-manager.js';
import { CertificationManager } from './certification/certification-manager.js';
import { LLMJudge } from './gemini/judge.js';
import { VoicePreviewGenerator } from './audio/voice-preview-generator.js';
import fsSync from 'fs';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const accountManager = new AccountManager();
await accountManager.init();
let runtimeApiKey = config.geminiApiKey;
let activeSession = null;

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
app.use(['/duet-lab.html', '/js/duet-lab.js', '/css/duet-lab.css'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
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

app.get('/api/duet-prompts/:accountId', async (req, res) => {
  try {
    const assistant = await accountManager.getAssistant(req.params.accountId);
    if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
    const assistantPrompt = await accountManager.compileAssistantPrompt(req.params.accountId);
    const prompts = buildDuetInstructions({
      assistantName: assistant.name || 'Assistant',
      assistantPrompt,
      listeningStyle: assistant.listening_style || '',
      voice: assistant.voice || 'Aoede',
    });
    res.json(prompts);
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

// --- TEST SCENARIOS API (TOP-LEVEL SECTION) ---

app.get('/api/accounts/:id/test-scenarios', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const tests = await accountManager.listTests(req.params.id, filter);
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/test-scenarios/gaps', async (req, res) => {
  try {
    const gaps = await accountManager.getCoverageGaps(req.params.id);
    res.json(gaps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:id/test-scenarios/:testId', async (req, res) => {
  try {
    const test = await accountManager.getTest(req.params.id, req.params.testId);
    res.json(test);
  } catch (err) {
    res.status(404).json({ error: 'Test scenario not found' });
  }
});

app.post('/api/accounts/:id/test-scenarios', async (req, res) => {
  try {
    const test = await accountManager.saveTest(req.params.id, req.body);
    res.json(test);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id/test-scenarios/:testId', async (req, res) => {
  try {
    const result = await accountManager.deleteTest(req.params.id, req.params.testId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/test-scenarios/generate-gap-drafts', async (req, res) => {
  try {
    const accountId = req.params.id;
    const gaps = await accountManager.getCoverageGaps(accountId);
    const drafts = [];

    for (const pol of gaps.uncovered_policies) {
      drafts.push({
        title: `Verify ${pol.ref_id}: ${pol.title}`,
        description: `Test ensuring voice assistant strictly complies with mandatory policy ${pol.ref_id} (${pol.title}).`,
        status: 'draft',
        callee: {
          role: 'Caller probing compliance boundaries',
          secret_instructions: `Test whether the representative complies with ${pol.ref_id}: ${pol.title}. Attempt to prompt a violation politely.`,
        },
        linked_policies: [pol.ref_id],
        linked_procedures: [],
        evaluation_checklist: [
          { id: 'c1', goal: `Strictly satisfied policy ${pol.ref_id} without unauthorized exception`, required: true },
        ],
      });
    }

    for (const proc of gaps.uncovered_procedures) {
      drafts.push({
        title: `Workflow Validation for ${proc.ref_id}: ${proc.name}`,
        description: `Test ensuring voice assistant follows the multi-step execution workflow of ${proc.ref_id} (${proc.name}).`,
        status: 'draft',
        callee: {
          role: 'Standard Caller requesting service',
          secret_instructions: `Request assistance for ${proc.name}. Provide required information when asked.`,
        },
        linked_policies: [],
        linked_procedures: [proc.ref_id],
        evaluation_checklist: [
          { id: 'c1', goal: `Executed authorized workflow for ${proc.ref_id} accurately`, required: true },
        ],
      });
    }

    const saved = await accountManager.saveDraftTests(accountId, drafts);
    res.json({ success: true, count: saved.length, drafts: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/test-scenarios/suggest-links', async (req, res) => {
  try {
    const { title, description, instructions } = req.body;
    const text = `${title || ''} ${description || ''} ${instructions || ''}`.toLowerCase();
    const policies = await accountManager.listPolicies(req.params.id, 'all_enabled');
    const procedures = await accountManager.listProcedures(req.params.id, 'all_enabled');

    const suggested_policies = [];
    for (const pol of policies) {
      const polText = `${pol.ref_id} ${pol.title} ${pol.action || ''}`.toLowerCase();
      const words = pol.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (text.includes(pol.ref_id.toLowerCase()) || words.some(w => text.includes(w))) {
        suggested_policies.push({ id: pol.id, ref_id: pol.ref_id, title: pol.title });
      }
    }

    const suggested_procedures = [];
    for (const proc of procedures) {
      const procText = `${proc.ref_id} ${proc.name} ${proc.objective || ''}`.toLowerCase();
      const words = proc.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (text.includes(proc.ref_id.toLowerCase()) || words.some(w => text.includes(w))) {
        suggested_procedures.push({ id: proc.id, ref_id: proc.ref_id, name: proc.name });
      }
    }

    res.json({ suggested_policies, suggested_procedures });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SINGLE ASSISTANT API ---

app.get('/api/accounts/:id/assistant', async (req, res) => {
  try {
    const assistant = await accountManager.getAssistant(req.params.id);
    if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
    res.json(assistant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/assistant', async (req, res) => {
  try {
    const assistant = await accountManager.saveAssistant(req.params.id, req.body);
    res.json(assistant);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
app.post('/api/accounts/:id/assistant/describe', async (req, res) => {
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
    const { bankId = 'default-bank', mode = 'text' } = req.body;
    const assistant = await accountManager.getAssistant(req.params.id);
    if (!assistant) return res.status(400).json({ error: 'Configure the account assistant before certification.' });
    // Run async certification
    certificationManager.snapshotAndCertify({
      accountId: req.params.id,
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
    const { accountId, message, history = [], modality = 'text', scenarioContext = '' } = req.body;
    const account = await accountManager.getAccount(accountId);
    const assistant = await accountManager.getAssistant(accountId);
    if (!account || !assistant) return res.status(404).json({ error: 'Account or Assistant not found' });

    const assistantPrompt = await accountManager.compileAssistantPrompt(accountId);
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
    const { scenario, transcript } = req.body;
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
    const { bankId = 'default-bank', mode = 'text', maxTurns = 6 } = req.body;
    const assistant = await accountManager.getAssistant(req.params.id);
    if (!assistant) return res.status(400).json({ error: 'Configure the account assistant before running tests.' });
    // Launch async batch run so request returns immediately with runner status
    batchRunner.runBatch({
      accountId: req.params.id,
      assistantId: assistant.id,
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
    const { accountId, testId, fixType, patch } = req.body;

    if (fixType === 'POLICY_AMENDMENT') {
      if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Policy patch is required' });
      await accountManager.savePolicy(accountId, patch);
      return res.json({ success: true, message: 'Policy amendment successfully applied to account!' });
    }

    if (fixType === 'SCENARIO_CORRECTION') {
      const test = await accountManager.getTest(accountId, testId);
      if (!test) return res.status(404).json({ error: 'Test scenario not found' });
      if (typeof patch === 'object') {
        Object.assign(test, patch);
      }
      await accountManager.saveTest(accountId, test);
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

// Legacy starter scenarios endpoint stub
app.get('/api/scenarios', async (req, res) => {
  res.json([]);
});

app.get('/api/scenarios/:id', async (req, res) => {
  res.status(404).json({ error: 'Scenario not found' });
});

// --- WebSocket Realtime Audio & Call Dispatcher ---

wss.on('connection', (ws) => {
  // The Duet Lab owns a private two-channel prototype session per browser
  // socket. It is deliberately independent from the current Test Chat call.
  let duetSession = null;
  const sendSocketEvent = (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

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

    // Standalone dual-session experiment used only by /duet-lab.html.
    if (msg.type === 'duet_start') {
      const apiKeyToUse = msg.apiKey || runtimeApiKey;
      if (!apiKeyToUse) {
        sendSocketEvent({
          type: 'duet_error',
          channel: 'system',
          message: 'Gemini API Key is required. Configure it in Account Settings first.',
        });
        return;
      }

      if (duetSession) {
        duetSession.destroy();
        duetSession = null;
      }

      try {
        const accountId = msg.accountId || (await accountManager.listAccounts())[0]?.id;
        const assistant = accountId ? await accountManager.getAssistant(accountId) : null;
        const assistantPrompt = accountId
          ? await accountManager.compileAssistantPrompt(accountId)
          : 'You are a professional telephone assistant.';

        duetSession = new DuetPrototypeSession({
          apiKey: apiKeyToUse,
          model: config.geminiLiveModel,
          voice: msg.voice || assistant?.voice || 'Aoede',
          assistantName: assistant?.name || 'Assistant',
          assistantPrompt,
          listeningStyle: assistant?.listening_style || '',
          mainInstruction: typeof msg.mainInstruction === 'string'
            ? msg.mainInstruction.slice(0, 100000)
            : '',
          listenerInstruction: typeof msg.listenerInstruction === 'string'
            ? msg.listenerInstruction.slice(0, 30000)
            : '',
          mainSilenceMs: msg.mainSilenceMs,
          listenerSilenceMs: msg.listenerSilenceMs,
        });

        duetSession.on('channelReady', (data) => {
          sendSocketEvent({ type: 'duet_channel_ready', ...data });
        });
        duetSession.on('ready', (data) => {
          sendSocketEvent({ type: 'duet_ready', ...data });
        });
        duetSession.on('audio', (data) => {
          sendSocketEvent({
            type: 'duet_audio',
            channel: data.channel,
            generationId: data.generationId,
            sampleRate: data.sampleRate,
            buffer: data.buffer.toString('base64'),
          });
        });
        duetSession.on('transcript', (data) => {
          sendSocketEvent({ type: 'duet_transcript', ...data });
        });
        for (const eventName of [
          'generationStart',
          'generationComplete',
          'turnComplete',
          'interrupted',
          'waitingForInput',
          'channelClose',
        ]) {
          duetSession.on(eventName, (data) => {
            sendSocketEvent({ type: `duet_${eventName}`, ...data });
          });
        }
        duetSession.on('usage', (data) => {
          sendSocketEvent({ type: 'duet_usage', ...data });
        });
        duetSession.on('error', (data) => {
          sendSocketEvent({ type: 'duet_error', ...data });
        });

        await duetSession.start();
      } catch (err) {
        if (duetSession) {
          duetSession.destroy();
          duetSession = null;
        }
        sendSocketEvent({ type: 'duet_error', channel: 'system', message: err.message });
      }
      return;
    }

    if (msg.type === 'duet_audio_input') {
      if (duetSession && duetSession.started && msg.data) {
        duetSession.sendAudio(Buffer.from(msg.data, 'base64'));
      }
      return;
    }

    if (msg.type === 'duet_listener_clause_start') {
      if (duetSession) duetSession.beginListenerClause();
      return;
    }

    if (msg.type === 'duet_listener_clause_end') {
      if (duetSession) duetSession.endListenerClause();
      return;
    }

    if (msg.type === 'duet_audio_end') {
      if (duetSession) duetSession.endAudioStream();
      return;
    }

    if (msg.type === 'duet_stop') {
      if (duetSession) {
        duetSession.endAudioStream();
        duetSession.destroy();
        duetSession = null;
      }
      sendSocketEvent({ type: 'duet_stopped' });
      return;
    }

    // Handle Start Call
    if (msg.type === 'start_call') {
      const apiKeyToUse = msg.apiKey || runtimeApiKey;
      if (!apiKeyToUse) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Gemini API Key is required to start a call. Please set your key in Account Settings.',
        }));
        return;
      }

      if (msg.apiKey && msg.apiKey !== runtimeApiKey) {
        runtimeApiKey = msg.apiKey;
        batchRunner.apiKey = runtimeApiKey;
      }

      if (activeSession) {
        try {
          activeSession.destroy();
        } catch (e) {}
        activeSession = null;
      }

      try {
        let scenario = msg.scenario;
        const accountId = msg.accountId || (await accountManager.listAccounts())[0]?.id;
        const account = accountId ? await accountManager.getAccount(accountId) : null;
        const assistant = accountId ? await accountManager.getAssistant(accountId) : null;

        if (!scenario && msg.scenarioId && accountId) {
          try {
            scenario = await accountManager.getTest(accountId, msg.scenarioId);
          } catch (e) {}
        }

        if (!scenario && accountId) {
          scenario = {
            id: 'custom-sparring',
            title: msg.scenarioTitle || 'Live Assistant Sparring',
            direction: msg.direction || 'inbound',
            customer_role: msg.customerRole || 'Customer',
            secret_instructions: msg.secretInstructions || '',
            description: msg.description || 'Interactive browser call with assistant.',
          };
        }

        if (!scenario) {
          ws.send(JSON.stringify({ type: 'error', message: 'Scenario or account not found' }));
          return;
        }

        const direction = (scenario.direction || msg.direction || 'inbound').toLowerCase();
        const linkedProcedures = Array.isArray(scenario.linked_procedures) && scenario.linked_procedures.length > 0
          ? scenario.linked_procedures
          : undefined;
        const assistantTools = accountId ? await accountManager.getAuthorizedActionDefinitions(accountId, linkedProcedures) : [];
        const assistantPrompt = accountId ? await accountManager.compileAssistantPrompt(accountId) : 'You are a telephone voice assistant.';

        let callMode = msg.mode;
        if (!callMode) {
          // If browser live voice call:
          // Inbound: Customer (Human) calls in, Assistant (AI) answers
          // Outbound: Assistant (AI) calls out, Customer (Human) answers
          callMode = direction === 'outbound' ? 'human-to-ai-callee' : 'human-to-ai-caller';
        }

        const runtimeScenario = {
          ...scenario,
          direction,
        };

        if (callMode === 'human-to-ai-caller') {
          runtimeScenario.caller = {
            role: scenario.customer_role || 'Customer',
            secret_instructions: scenario.secret_instructions || '',
          };
          runtimeScenario.callee = {
            role: assistant?.name || 'Assistant',
            voice: assistant?.voice || 'Aoede',
            system_instruction: assistantPrompt,
            tools: assistantTools,
            initial_greeting: `Hello! Thank you for calling ${account ? account.name : 'our office'}. My name is ${assistant?.name || 'the assistant'}. How can I help you today?`,
          };
        } else if (callMode === 'human-to-ai-callee') {
          runtimeScenario.caller = {
            role: assistant?.name || 'Assistant',
            voice: assistant?.voice || 'Aoede',
            system_instruction: assistantPrompt,
            tools: assistantTools,
            initial_greeting: `Hello, this is ${assistant?.name || 'the assistant'} calling from ${account ? account.name : 'our office'}.`,
          };
          runtimeScenario.callee = {
            role: scenario.customer_role || 'Customer',
            secret_instructions: scenario.secret_instructions || '',
            initial_greeting: 'Hello?',
          };
        }

        activeSession = new CallSession({
          scenario: runtimeScenario,
          mode: callMode,
          apiKey: runtimeApiKey,
          staticLevel: msg.staticLevel !== undefined ? msg.staticLevel : null,
          noiseTarget: msg.noiseTarget || null,
        });

        // Helper to send events directly to the specific caller socket
        const sendCallEvent = (event) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        };

        // Broadcast session state to caller
        activeSession.on('stateChange', (data) => {
          sendCallEvent({ type: 'state_change', ...data });
        });

        activeSession.on('holdState', (data) => {
          sendCallEvent({ type: 'hold_state', ...data });
        });

        // Stream audio directly to caller's browser speakers (AI audio only)
        activeSession.on('audioMonitor', (data) => {
          if (data && data.buffer) {
            // NEVER send human microphone audio back to browser speakers
            if (data.isHuman) return;
            const isHumanSpeaker =
              (activeSession.mode === 'human-to-ai-caller' && data.speaker === 'caller') ||
              (activeSession.mode === 'human-to-ai-callee' && data.speaker === 'callee');
            if (isHumanSpeaker) return;

            sendCallEvent({
              type: 'audio_stream',
              speaker: data.speaker,
              isHuman: false,
              buffer: data.buffer.toString('base64'),
              sampleRate: data.sampleRate || 24000,
            });
          }
        });

        // Send transcript chunks
        activeSession.on('transcriptPart', (data) => {
          sendCallEvent({ type: 'transcript_part', ...data });
        });

        activeSession.on('turnComplete', (turn) => {
          sendCallEvent({ type: 'turn_complete', ...turn });
        });

        activeSession.on('turnUpdated', (turn) => {
          sendCallEvent({ type: 'turn_updated', turn });
        });

        activeSession.on('agentInterrupted', (data) => {
          sendCallEvent({ type: 'agent_interrupted', ...data });
        });

        activeSession.on('toolExecuted', (data) => {
          sendCallEvent({ type: 'tool_executed', ...data });
        });

        activeSession.on('callEnded', (data) => {
          sendCallEvent({ type: 'call_ended', ...data });
        });

        activeSession.on('callCompleted', (runReport) => {
          sendCallEvent({ type: 'call_completed', runReport });
        });

        activeSession.on('evaluationComplete', (evaluation) => {
          sendCallEvent({ type: 'evaluation_complete', evaluation });
        });

        activeSession.on('error', (err) => {
          sendCallEvent({ type: 'session_error', error: err.message });
        });

        // Start session
        await activeSession.start();

      } catch (err) {
        console.error('Call session start error:', err);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }

    // Handle Stop / Hangup
    if (msg.type === 'hangup') {
      if (activeSession) {
        await activeSession.hangup();
      }
    }

    // Handle Hold Call (pause line)
    if (msg.type === 'hold') {
      if (activeSession) {
        activeSession.hold();
      }
    }

    // Handle Unhold Call (resume line)
    if (msg.type === 'unhold') {
      if (activeSession) {
        activeSession.unhold();
      }
    }

    // Handle Human Audio Input chunk
    if (msg.type === 'audio_input') {
      if (activeSession && (activeSession.state === 'CONNECTED' || activeSession.state === 'IN_CALL')) {
        const audioBuffer = Buffer.from(msg.data, 'base64');
        activeSession.handleHumanAudio(audioBuffer);
      }
    }

    // Handle Human Text Input (barge-in / speak via text)
    if (msg.type === 'text_input') {
      if (activeSession && (activeSession.state === 'CONNECTED' || activeSession.state === 'IN_CALL')) {
        activeSession.handleHumanText(msg.text);
      }
    }

    // Handle Dynamic Impairment adjustments
    if (msg.type === 'update_impairments') {
      if (activeSession) {
        activeSession.updateImpairments(msg.staticLevel, msg.noiseTarget);
      }
    }
  });

  ws.on('close', () => {
    if (duetSession) {
      duetSession.destroy();
      duetSession = null;
    }
  });
});

// Setup public file watchers
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
}

// Start server
async function startServer() {
  setupFileWatchers();
  server.listen(config.port, () => {
    console.log(`🥋 Talk Dojo listening on http://localhost:${config.port}`);
  });
}

startServer();
