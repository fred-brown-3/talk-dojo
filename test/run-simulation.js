import { ScenarioStore } from '../src/scenario/store.js';
import { CallSession } from '../src/session/call-session.js';
import { config } from '../src/config.js';

const targetScenarioId = process.argv[2] || 'secretary-unintended-recipient-04';
const maxTurns = parseInt(process.argv.find(a => a.startsWith('--max-turns='))?.split('=')[1] || '6', 10);
const staticLevelArg = parseFloat(process.argv.find(a => a.startsWith('--static='))?.split('=')[1] || '0.1');

async function runAutonomousSimulation() {
  console.log('🥋 TALK DOJO: Autonomous End-to-End Simulation Test Harness');
  console.log(`============================================================`);
  console.log(`- Target Scenario: ${targetScenarioId}`);
  console.log(`- Max Turns to Spar: ${maxTurns}`);
  console.log(`- Line Static Level: ${staticLevelArg}`);
  console.log(`- Live Model: ${config.geminiLiveModel}`);
  console.log(`- Judge Model: ${config.geminiJudgeModel}`);
  console.log(`============================================================\n`);

  const store = new ScenarioStore();
  const scenario = await store.getScenario(targetScenarioId);
  if (!scenario) {
    console.error(`❌ Scenario '${targetScenarioId}' not found.`);
    process.exit(1);
  }

  console.log(`📋 Loaded Scenario: "${scenario.title}"`);
  console.log(`   Caller: ${scenario.caller?.role || 'Caller'} (${scenario.caller?.voice})`);
  console.log(`   Callee: ${scenario.callee?.role || 'Callee'} (${scenario.callee?.voice})\n`);

  const session = new CallSession({
    scenario,
    mode: 'ai-to-ai',
    apiKey: config.geminiApiKey,
    staticLevel: staticLevelArg,
    noiseTarget: 'both',
  });

  session.on('stateChange', ({ state }) => {
    console.log(`📞 [Call State] -> ${state}`);
  });

  session.on('turnComplete', (turn) => {
    const speakerLabel = turn.speaker.toUpperCase();
    const speakerName = turn.speaker === 'caller' ? (scenario.caller?.role || 'Caller') : (scenario.callee?.role || 'Callee');
    console.log(`\n💬 [${turn.timeStr}] [${speakerLabel}] ${speakerName}:`);
    console.log(`   "${turn.text}"`);

    if (session.turnCount >= maxTurns) {
      console.log(`\n🛑 Target turn count (${maxTurns}) reached. Hanging up to invoke AI Referee...`);
      session.hangup();
    }
  });

  session.on('agentInterrupted', ({ role }) => {
    console.log(`⚡ [Barge-in / Interruption] ${role.toUpperCase()} was interrupted!`);
  });

  session.on('toolExecuted', (tool) => {
    console.log(`\n⚙️ [${tool.timeStr}] [TOOL EXECUTED] ${tool.role.toUpperCase()}: ${tool.name}(${JSON.stringify(tool.args)})`);
    console.log(`   Result: ${JSON.stringify(tool.output)}`);
  });

  session.on('error', (err) => {
    console.error('❌ Session error:', err.message);
  });

  // Safety timeout: if conversation stalls, hangup after 60 seconds
  const safetyTimeout = setTimeout(() => {
    if (session.state === 'CONNECTED') {
      console.log('\n⏱️ Timeout reached. Hanging up call...');
      session.hangup();
    }
  }, 60000);

  console.log('🚀 Starting call sequence...');
  await session.start();

  // Wait for call completion & evaluation
  const report = await new Promise((resolve) => {
    session.on('callCompleted', (rep) => {
      clearTimeout(safetyTimeout);
      resolve(rep);
    });
  });

  console.log('\n============================================================');
  console.log('⚖️ AI REFEREE EVALUATION SCORECARD');
  console.log('============================================================');
  const evalResult = report.evaluation || {};
  console.log(`Overall Status: ${evalResult.overall_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Overall Score:  ${evalResult.overall_score ?? 0}%`);
  console.log(`Summary:        ${evalResult.summary || 'N/A'}\n`);

  console.log('📋 Checklist Results:');
  evalResult.checklist_results?.forEach((item, i) => {
    const check = item.passed ? '✓' : '✗';
    console.log(`  [${check}] ${i + 1}. ${item.goal}`);
    if (item.evidence_quote) {
      console.log(`      Quote: "${item.evidence_quote}"`);
    }
    if (item.explanation) {
      console.log(`      Note:  ${item.explanation}`);
    }
  });

  if (evalResult.coaching_feedback && evalResult.coaching_feedback.length > 0) {
    console.log('\n💡 Coaching & Prompt Tuning Recommendations:');
    evalResult.coaching_feedback.forEach((tip) => {
      console.log(`  - ${tip}`);
    });
  }

  console.log('\n============================================================');
  console.log(`💾 Run Report Saved: runs/${report.id}.json`);
  if (report.wavFile) {
    console.log(`🔊 Audio WAV Saved:   runs/${report.wavFile}`);
  }
  console.log('============================================================\n');

  process.exit(0);
}

runAutonomousSimulation().catch((err) => {
  console.error('❌ Autonomous simulation failed:', err);
  process.exit(1);
});
