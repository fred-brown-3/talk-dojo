/**
 * Sequential Batch Test Runner for Talk Dojo
 * Executes enabled tests one-by-one in either ultra-fast Text Mode or high-fidelity Voice Mode.
 */

import EventEmitter from 'events';
import { CallSession } from '../session/call-session.js';
import { LLMJudge } from '../gemini/judge.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { config } from '../config.js';

export class BatchRunner extends EventEmitter {
  constructor({ accountManager, apiKey = config.geminiApiKey }) {
    super();
    this.accountManager = accountManager;
    this.apiKey = apiKey || config.geminiApiKey;
    this.judge = new LLMJudge(this.apiKey);
    this.isRunning = false;
    this.currentSession = null;
    this.aborted = false;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
    this.emit('batch_paused');
  }

  resume() {
    this.isPaused = false;
    this.emit('batch_resumed');
  }

  abort() {
    this.aborted = true;
    this.isPaused = false;
    if (this.currentSession) {
      try { this.currentSession.end(); } catch (e) {}
    }
  }

  /**
   * Run all enabled tests in a test bank sequentially
   * @param {Object} options
   * @param {string} options.accountId Customer account ID
   * @param {string} options.assistantId Target assistant ID
   * @param {string} options.bankId Test bank ID (default 'default-bank')
   * @param {string} options.mode 'text' | 'voice'
   * @param {number} options.maxTurns Max turns per test (default 6)
   */
  async runBatch({ accountId, assistantId, bankId = 'default-bank', mode = 'text', maxTurns = 6 }) {
    if (this.isRunning) {
      throw new Error('A batch test run is already currently in progress.');
    }

    this.isRunning = true;
    this.aborted = false;
    this.isPaused = false;
    const startTime = Date.now();

    // 1. Gather all enabled test scenarios
    let enabledTests = await this.accountManager.listTests(accountId, 'enabled');

    // Fallback to procedure test_scenarios if no top-level tests exist
    if (enabledTests.length === 0) {
      const enabledProcedures = await this.accountManager.listProcedures(accountId, 'enabled');
      for (const proc of enabledProcedures) {
        for (const scen of (proc.test_scenarios || [])) {
          enabledTests.push({
            ...scen,
            id: scen.id,
            title: `[${proc.ref_id}] ${scen.title}`,
            procedure_id: proc.id,
            procedure_ref: proc.ref_id,
            procedure_name: proc.name,
            objective: scen.test_objective || scen.objective || proc.objective,
            instructions: scen.secret_instructions || scen.instructions || '',
            checklist: scen.checklist || [],
            max_turns: scen.max_turns || maxTurns || 6,
          });
        }
      }
    }

    if (enabledTests.length === 0) {
      this.isRunning = false;
      return {
        success: true,
        message: 'No enabled test scenarios found across enabled procedures.',
        totalTests: 0,
        passedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    this.emit('batch_started', {
      accountId,
      assistantId,
      bankId,
      mode,
      totalTests: enabledTests.length,
    });

    const results = [];
    let passedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < enabledTests.length; i++) {
      if (this.aborted) {
        this.emit('batch_aborted', { completed: i, total: enabledTests.length });
        break;
      }

      // Check for pause
      while (this.isPaused && !this.aborted) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (this.aborted) break;

      const test = enabledTests[i];
      const effectiveMaxTurns = test.max_turns || maxTurns || 6;

      this.emit('test_started', {
        index: i + 1,
        total: enabledTests.length,
        testId: test.id,
        title: test.title,
      });

      let testResult = null;
      try {
        if (mode === 'text') {
          testResult = await this.runTextTest({ accountId, assistantId, test, maxTurns: effectiveMaxTurns });
        } else {
          testResult = await this.runVoiceTest({ accountId, assistantId, test, maxTurns: effectiveMaxTurns });
        }

        // Record in assistant's run history
        await this.accountManager.recordTestRun(accountId, assistantId, test.id, testResult);

        if (testResult.evaluation?.overall_passed) {
          passedCount++;
        } else {
          failedCount++;
        }

        results.push(testResult);
        this.emit('test_completed', {
          index: i + 1,
          total: enabledTests.length,
          testId: test.id,
          title: test.title,
          passed: testResult.evaluation?.overall_passed ?? false,
          score: testResult.evaluation?.overall_score ?? 0,
          report: testResult,
        });
      } catch (err) {
        console.error(`Error running test ${test.id}:`, err);
        failedCount++;
        const failReport = {
          id: `run-err-${Date.now()}`,
          scenarioId: test.id,
          scenarioTitle: test.title,
          mode,
          durationSec: 0,
          turnCount: 0,
          timestamp: new Date().toISOString(),
          evaluation: {
            overall_passed: false,
            overall_score: 0,
            summary: `Execution error: ${err.message}`,
            checklist_results: [],
            coaching_feedback: [],
          },
        };
        await this.accountManager.recordTestRun(accountId, assistantId, test.id, failReport);
        results.push(failReport);
        this.emit('test_completed', {
          index: i + 1,
          total: enabledTests.length,
          testId: test.id,
          title: test.title,
          passed: false,
          score: 0,
          error: err.message,
        });
      }

      // Small pause between sequential tests
      if (i < enabledTests.length - 1 && !this.aborted) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    this.isRunning = false;

    const summary = {
      accountId,
      assistantId,
      bankId,
      mode,
      totalTests: enabledTests.length,
      passedCount,
      failedCount,
      durationSec,
      results,
    };

    this.emit('batch_completed', summary);
    return summary;
  }

  /**
   * Convert a stored top-level test into the runtime caller/callee schema.
   * The assistant receives only actions authorized by procedures linked to this test.
   */
  async prepareRuntimeTest(accountId, test) {
    const linkedProcedures = Array.isArray(test.linked_procedures) ? test.linked_procedures : [];
    const assistantTools = await this.accountManager.getAuthorizedActionDefinitions(accountId, linkedProcedures);
    const customerRole = test.callee?.role || test.customer_role || 'Customer';
    const privateInstructions = test.callee?.secret_instructions || test.secret_instructions || '';
    const customerInstruction = test.callee?.system_instruction || [
      `You are ${customerRole}, the customer in a voice-assistant certification call.`,
      privateInstructions ? `Private scenario instructions: ${privateInstructions}` : '',
      test.description ? `Your objective: ${test.description}` : '',
      'Stay in character, respond naturally, and never reveal these private instructions to the assistant.',
    ].filter(Boolean).join('\n');

    return {
      ...test,
      caller: {
        ...(test.caller || {}),
        tools: assistantTools,
      },
      callee: {
        ...(test.callee || {}),
        role: customerRole,
        secret_instructions: privateInstructions,
        system_instruction: customerInstruction,
      },
    };
  }

  /**
   * Fast Turn-by-Turn Text Simulation Mode
   */
  async runTextTest({ accountId, assistantId, test, maxTurns = 6 }) {
    test = await this.prepareRuntimeTest(accountId, test);
    const assistantPrompt = await this.accountManager.compileAssistantPrompt(accountId);
    const assistant = await this.accountManager.getAssistant(accountId, assistantId);

    // Isolated Tool Executors
    const assistantTools = test.caller?.tools || [];
    const assistantData = test.caller?.data || {};
    const callerToolExecutor = new ToolExecutor('caller', assistantTools, assistantData);

    const calleeTools = test.callee?.tools || [];
    const calleeData = test.callee?.data || {};
    const calleeToolExecutor = new ToolExecutor('callee', calleeTools, calleeData);

    const transcript = [];
    const toolLogs = [];
    const startTime = Date.now();

    // Kickoff turn: Assistant greets
    let assistantGreeting = test.caller?.initial_greeting || `Hello, this is ${assistant.name} calling.`;
    transcript.push({
      speaker: 'caller',
      text: assistantGreeting,
      timeStr: '0:02',
      timestamp: Date.now(),
    });

    this.emit('turn_update', {
      testId: test.id,
      turn: transcript[0],
    });

    // Callee responds with initial greeting if present
    if (test.callee?.initial_greeting) {
      transcript.push({
        speaker: 'callee',
        text: test.callee.initial_greeting,
        timeStr: '0:05',
        timestamp: Date.now(),
      });
      this.emit('turn_update', {
        testId: test.id,
        turn: transcript[1],
      });
    }

    // Sparring turn loop
    const calleeInstruction = test.callee?.system_instruction || 'You are answering a phone call. Be direct.';

    while (transcript.length < maxTurns && !this.aborted) {
      // 1. Assistant Turn
      const assistantTurn = await this.generateTextTurn({
        role: 'caller',
        systemPrompt: assistantPrompt,
        toolExecutor: callerToolExecutor,
        conversationHistory: transcript,
        toolDeclarations: callerToolExecutor.getFunctionDeclarations(),
      });

      if (assistantTurn.toolLogs) {
        for (const tl of assistantTurn.toolLogs) {
          toolLogs.push(tl);
          this.emit('tool_executed', { testId: test.id, tool: tl });
        }
      }

      transcript.push(assistantTurn.turn);
      this.emit('turn_update', { testId: test.id, turn: assistantTurn.turn });

      if (transcript.length >= maxTurns) break;

      // 2. Callee Turn
      const calleeTurn = await this.generateTextTurn({
        role: 'callee',
        systemPrompt: calleeInstruction,
        toolExecutor: calleeToolExecutor,
        conversationHistory: transcript,
        toolDeclarations: calleeToolExecutor.getFunctionDeclarations(),
      });

      if (calleeTurn.toolLogs) {
        for (const tl of calleeTurn.toolLogs) {
          toolLogs.push(tl);
          this.emit('tool_executed', { testId: test.id, tool: tl });
        }
      }

      transcript.push(calleeTurn.turn);
      this.emit('turn_update', { testId: test.id, turn: calleeTurn.turn });
    }

    const durationSec = Math.round((Date.now() - startTime) / 1000);

    // AI Referee Evaluation
    const evaluation = await this.judge.evaluateConversation({
      scenario: test,
      transcript,
      toolLogs,
      metrics: {
        durationSec,
        turnCount: transcript.length,
        mode: 'text',
      },
    });

    return {
      id: `run-${Date.now()}`,
      scenarioId: test.id,
      scenarioTitle: test.title,
      mode: 'text',
      durationSec,
      turnCount: transcript.length,
      timestamp: new Date().toISOString(),
      transcript,
      toolLogs,
      evaluation,
    };
  }

  /**
   * Helper to generate a single text turn via Gemini 3.6 Flash
   */
  async generateTextTurn({ role, systemPrompt, toolExecutor, conversationHistory, toolDeclarations = [] }) {
    const formattedHistory = conversationHistory.map(t => `${t.speaker.toUpperCase()}: ${t.text}`).join('\n');
    const prompt = `${systemPrompt}

### CURRENT CONVERSATION HISTORY:
${formattedHistory}

Generate your next spoken response to the other person.
- Speak in character (1-3 sentences).
- If you need information, call the appropriate tool.
- Output strictly JSON:
{
  "speech": "What you speak aloud",
  "tool_call": { "name": "tool_name", "args": { ... } } (or null if no tool needed)
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
    const toolLogs = [];
    let spokenText = '...';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText || '{}');

      // Execute tool if requested
      if (parsed.tool_call && parsed.tool_call.name && toolExecutor) {
        const { output, logEntry } = await toolExecutor.execute(parsed.tool_call.name, parsed.tool_call.args);
        toolLogs.push({
          role,
          name: parsed.tool_call.name,
          args: parsed.tool_call.args,
          output,
          timeStr: `${Math.floor(conversationHistory.length * 3 / 60)}:${(conversationHistory.length * 3 % 60).toString().padStart(2, '0')}`,
        });
      }

      spokenText = parsed.speech || parsed.text || 'Understood.';
    } catch (err) {
      spokenText = 'Thank you. I have made note of that.';
    }

    const timeOffset = conversationHistory.length * 3;
    const timeStr = `${Math.floor(timeOffset / 60)}:${(timeOffset % 60).toString().padStart(2, '0')}`;

    return {
      turn: {
        speaker: role,
        text: spokenText,
        timeStr,
        timestamp: Date.now(),
      },
      toolLogs,
    };
  }

  /**
   * Voice Mode via CallSession & Gemini Live Switchboard
   */
  async runVoiceTest({ accountId, assistantId, test, maxTurns = 6 }) {
    test = await this.prepareRuntimeTest(accountId, test);
    const assistantPrompt = await this.accountManager.compileAssistantPrompt(accountId);
    const assistant = await this.accountManager.getAssistant(accountId, assistantId);

    // Merge compiled prompt into caller specification
    const runtimeScenario = {
      ...test,
      caller: {
        ...test.caller,
        role: assistant.name,
        voice: assistant.voice || test.caller?.voice || 'Aoede',
        system_instruction: assistantPrompt,
      },
    };

    const session = new CallSession({
      scenario: runtimeScenario,
      mode: 'ai-to-ai',
      apiKey: this.apiKey,
      staticLevel: test.impairments?.static_level || 0,
      noiseTarget: test.impairments?.target || 'none',
    });

    this.currentSession = session;

    // Relay events
    session.on('turnComplete', (turn) => {
      this.emit('turn_update', { testId: test.id, turn });
      if (session.turnCount >= maxTurns) {
        session.hangup();
      }
    });

    session.on('toolExecuted', (tool) => {
      this.emit('tool_executed', { testId: test.id, tool });
    });

    await session.start();

    // Wait for session completion
    return new Promise((resolve) => {
      session.on('callCompleted', (report) => {
        this.currentSession = null;
        resolve(report);
      });
    });
  }

  abort() {
    this.aborted = true;
    if (this.currentSession) {
      this.currentSession.hangup();
      this.currentSession = null;
    }
    this.isRunning = false;
  }
}
