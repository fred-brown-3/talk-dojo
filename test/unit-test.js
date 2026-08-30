import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { TelephonyTones } from '../src/audio/telephony-tones.js';
import { LineNoiseEngine } from '../src/audio/noise-generator.js';
import { AudioResampler } from '../src/audio/resampler.js';
import { encodeWAV } from '../src/audio/wav-encoder.js';
import { ScenarioStore } from '../src/scenario/store.js';

async function runTests() {
  console.log('🧪 Starting Talk Dojo Unit Tests...');

  // 1. Telephony tones
  console.log('Testing Telephony Tones...');
  const dialTone = TelephonyTones.dialTone(500, 24000);
  assert.strictEqual(dialTone.length, 500 * 24 * 2); // 500ms * 24 samples/ms * 2 bytes
  const click = TelephonyTones.connectClick(24000);
  assert(click.length > 0);

  // 2. Line noise engine
  console.log('Testing Line Noise & Impairment DSP...');
  const noiseEngine = new LineNoiseEngine();
  const cleanPCM = Buffer.alloc(4800, 0); // 100ms silence
  const noisyPCM = noiseEngine.applyImpairments(cleanPCM, 0.5, true);
  assert.strictEqual(noisyPCM.length, cleanPCM.length);
  // Ensure non-zero noise was generated
  let hasNonZero = false;
  for (let i = 0; i < noisyPCM.length; i += 2) {
    if (noisyPCM.readInt16LE(i) !== 0) {
      hasNonZero = true;
      break;
    }
  }
  assert(hasNonZero, 'Noise engine should inject non-zero static');

  // 3. Audio Resampler
  console.log('Testing Audio Resampler...');
  const buf24k = Buffer.alloc(2400 * 2); // 100ms at 24kHz
  const buf16k = AudioResampler.downsample24kTo16k(buf24k);
  assert.strictEqual(buf16k.length, 1600 * 2); // 100ms at 16kHz
  const bufBack24k = AudioResampler.upsample16kTo24k(buf16k);
  assert.strictEqual(bufBack24k.length, 2400 * 2);

  // 4. WAV Encoder
  console.log('Testing WAV Encoder...');
  const wav = encodeWAV(noisyPCM, 24000, 1);
  assert.strictEqual(wav.subarray(0, 4).toString(), 'RIFF');
  assert.strictEqual(wav.subarray(8, 12).toString(), 'WAVE');
  assert.strictEqual(wav.readUInt32LE(4), 36 + noisyPCM.length);

  // 5. Scenario Store
  console.log('Testing Scenario Store & YAML parsing...');
  const store = new ScenarioStore();
  await store.init();
  const scenarios = await store.listScenarios();
  assert(scenarios.length >= 2, `Expected at least 2 starter scenarios, found ${scenarios.length}`);
  const medical = await store.getScenario('medical-appointment-01');
  assert.strictEqual(medical.id, 'medical-appointment-01');
  assert.strictEqual(medical.language, 'en');
  // 6. ToolExecutor & Isolated Data
  console.log('Testing ToolExecutor & Isolated Agent Toolbelts...');
  const { ToolExecutor } = await import('../src/tools/tool-executor.js');
  const callerTools = [
    {
      name: 'check_clinic_slots',
      description: 'Check slots',
      parameters: { type: 'OBJECT', properties: { date: { type: 'STRING' } } }
    },
    {
      name: 'book_appointment',
      description: 'Book slot',
      parameters: { type: 'OBJECT', properties: { date: { type: 'STRING' }, time: { type: 'STRING' } } }
    }
  ];
  const callerData = { available_slots: ['Thursday 3:30 PM', 'Thursday 4:15 PM'] };
  const calleeData = { calendar_events: [{ time: '1-3 PM', title: 'Work' }] };

  const callerExecutor = new ToolExecutor('caller', callerTools, callerData);
  const calleeExecutor = new ToolExecutor('callee', [], calleeData);

  assert.strictEqual(callerExecutor.getFunctionDeclarations().length, 2);
  assert.strictEqual(calleeExecutor.getFunctionDeclarations().length, 0);

  // Execute tool
  const slotRes = await callerExecutor.execute('check_clinic_slots', { date: 'Thursday' });
  assert.strictEqual(slotRes.output.available_slots.length, 2);

  // Book appointment
  const bookRes = await callerExecutor.execute('book_appointment', { date: 'Thursday', time: '3:30 PM', patient_name: 'John' });
  assert(bookRes.output.success);
  assert.strictEqual(callerExecutor.data.available_slots.length, 1); // 3:30 removed

  // Verify callee data isolation (calleeData was not touched)
  assert.strictEqual(calleeExecutor.data.calendar_events.length, 1);

  // 7. Test Healthcare 2-Identifier Verification & Doctor Who Calendar Sync
  console.log('Testing Healthcare 2-Identifier Verification & Dual Calendar Sync...');
  const docWhoScenario = await store.getScenario('doctor-who-reschedule-id-verify-08');
  assert(docWhoScenario, 'Expected doctor-who-reschedule-id-verify-08 scenario to load');
  assert.strictEqual(docWhoScenario.evaluation_checklist.length, 10);

  const secretaryToolExecutor = new ToolExecutor('caller', docWhoScenario.caller.tools, docWhoScenario.caller.data);
  const patientToolExecutor = new ToolExecutor('callee', docWhoScenario.callee.tools, docWhoScenario.callee.data);

  // Test 1: Identity verification succeeds with 2 matching pieces (Full Name + DOB)
  const verifySuccess = await secretaryToolExecutor.execute('verify_patient_identity', {
    full_name: 'Johnathan Doe',
    dob: 'March 14, 1985'
  });
  assert.strictEqual(verifySuccess.output.verified, true);
  assert.strictEqual(verifySuccess.output.status, 'IDENTITY_CONFIRMED');

  // Test 2: Identity verification fails if only 1 piece or incorrect info
  const verifyFail = await secretaryToolExecutor.execute('verify_patient_identity', {
    full_name: 'Johnathan Doe',
    dob: 'January 1, 2000'
  });
  assert.strictEqual(verifyFail.output.verified, false);

  // Test 3: Doctor Who slots query returns relative dates
  const docSlots = await secretaryToolExecutor.execute('check_doctor_availability', { doctor_name: 'Doctor Who' });
  assert.strictEqual(docSlots.output.available_slots.length, 3);
  assert(docSlots.output.available_slots.includes('Next Wednesday at 3:15 PM'));

  // Test 4: Patient inspects personal calendar
  const calCheck = await patientToolExecutor.execute('check_personal_calendar', { relative_date: 'all' });
  assert(calCheck.output.schedule['Next Wednesday'][0].busy === false);

  // Test 5: Dual Calendar Sync - Both lock in the exact same slot!
  const bookedSecretary = await secretaryToolExecutor.execute('book_clinic_appointment', {
    doctor_name: 'Doctor Who',
    date: 'Next Wednesday',
    time: '3:15 PM',
    patient_name: 'Johnathan Doe'
  });
  const savedPatient = await patientToolExecutor.execute('add_personal_calendar_event', {
    date: 'Next Wednesday',
    time: '3:15 PM',
    title: 'Doctor Who Appointment'
  });

  // Verify both set identical slot
  assert.strictEqual(bookedSecretary.output.booking.date, savedPatient.output.event.date);
  assert.strictEqual(bookedSecretary.output.booking.time, savedPatient.output.event.time);
  console.log(`   Synchronized Slot Confirmed: ${bookedSecretary.output.booking.date} at ${bookedSecretary.output.booking.time}`);

  // 8. Test Enterprise Architecture: AccountManager (GUIDs), Markdown Company Info, Policies (POL-xxx), Procedures (PROC-xxx)
  console.log('Testing Enterprise Account Architecture with GUIDs, Policies, & Procedures...');
  const { AccountManager } = await import('../src/account/account-manager.js');

  try {
    await fs.rm(path.resolve(process.cwd(), 'data/test-accounts'), { recursive: true, force: true });
  } catch (e) {}

  const testAccountManager = new AccountManager('data/test-accounts');
  await testAccountManager.init();

  // Test Account creation & retrieval with GUID
  const accounts = await testAccountManager.listAccounts();
  assert(accounts.length >= 1, 'Expected at least 1 seeded account');
  const seededAcc = accounts[0];
  assert(seededAcc.id.startsWith('acct-'), `Expected account ID to be a GUID, got ${seededAcc.id}`);
  const accountId = seededAcc.id;

  // Test Company Info Markdown Section Cards (SEC-xxx)
  console.log('Testing Company Info Dynamic Markdown Cards (SEC-xxx)...');
  const compInfo = await testAccountManager.getCompanyInfo(accountId);
  assert(compInfo.sections.length >= 2, `Expected at least 2 default company sections, found ${compInfo.sections.length}`);
  assert(compInfo.sections[0].id.startsWith('SEC-'), `Expected section id to start with SEC-, got ${compInfo.sections[0].id}`);
  assert(compInfo.markdown.includes('#') || compInfo.markdown.includes('Smoky Mountain'), 'Expected markdown content');

  // Test Adding / Editing Company Info Card
  const initialCount = compInfo.sections.length;
  compInfo.sections.push({ id: `SEC-${String(initialCount + 1).padStart(3, '0')}`, title: 'Special Notice', body: 'Gentle Care Close to Home.' });
  await testAccountManager.saveCompanyInfo(accountId, { sections: compInfo.sections });
  const updatedCompInfo = await testAccountManager.getCompanyInfo(accountId);
  assert.strictEqual(updatedCompInfo.sections.length, initialCount + 1);
  console.log(`   Dynamic Markdown Sections (${updatedCompInfo.sections.map(s => s.id).join(', ')}) Confirmed`);

  // Test Policies CRUD & Reference Identifiers (POL-xxx)
  console.log('Testing Policies with Clean Reference Identifiers (POL-xxx)...');
  const initialPolicies = await testAccountManager.listPolicies(accountId, 'all_enabled');

  const policy1 = await testAccountManager.savePolicy(accountId, {
    title: 'HIPAA Two-Factor Identity Verification',
    type: 'always',
    status: 'enabled',
    action: 'Always verify patient full name and date of birth before discussing records.',
  });
  assert(policy1.id.startsWith('POL-'), `Expected policy ID to start with POL-, got ${policy1.id}`);
  assert.strictEqual(policy1.type, 'always');

  const policy2 = await testAccountManager.savePolicy(accountId, {
    title: 'Never Offer Direct Medical Diagnosis',
    type: 'never',
    status: 'enabled',
    action: 'Never provide direct clinical diagnosis or prescribe treatments over the phone.',
  });
  assert(policy2.id.startsWith('POL-'), `Expected policy ID to start with POL-, got ${policy2.id}`);

  const policy3 = await testAccountManager.savePolicy(accountId, {
    title: 'Financial Hardship Billing Adjustment',
    type: 'conditional',
    status: 'enabled',
    condition: 'Caller states inability to pay copay due to extreme hardship',
    action: 'Apply hardship sliding-scale discount schedule.',
  });
  assert.strictEqual(policy3.type, 'conditional');

  const policiesList = await testAccountManager.listPolicies(accountId, 'all_enabled');
  assert.strictEqual(policiesList.length, initialPolicies.length + 3);
  console.log(`   Policies Confirmed: ${policiesList.map(p => `[${p.id}] ${p.type}`).join(', ')}`);

  // Test Procedures with Tool Constraints & Integrated Scenarios (PROC-xxx)
  console.log('Testing Procedures with Tool Authorization & Scenarios (PROC-xxx)...');
  const initialProcs = await testAccountManager.listProcedures(accountId, 'enabled');

  const proc1 = await testAccountManager.saveProcedure(accountId, {
    name: 'Schedule Clinic Appointment',
    status: 'enabled',
    objective: 'Caller requests to schedule or reschedule a visit with clinic doctors.',
    authorized_tools: ['clinic-ehr-scheduling'],
    steps: '1. Verify patient identity per POL-001\n2. Check availability via check_clinic_slots\n3. Confirm time with patient\n4. Book slot.',
    constraints: 'Only schedule between 8 AM and 5 PM Mon-Fri.',
    test_scenarios: [
      {
        id: 'scen-happy-01',
        title: 'Happy Path Booking',
        description: 'Caller books open slot for Thursday',
        callee: { role: 'Patient John Smith' },
        evaluation_checklist: [{ id: 'c1', goal: 'Identity verified' }, { id: 'c2', goal: 'Slot confirmed' }],
      }
    ]
  });
  assert(proc1.id.startsWith('PROC-'), `Expected procedure ID to start with PROC-, got ${proc1.id}`);
  assert.strictEqual(proc1.authorized_tools.length, 1);
  assert.strictEqual(proc1.test_scenarios.length, 1);

  const proceduresList = await testAccountManager.listProcedures(accountId, 'enabled');
  assert.strictEqual(proceduresList.length, initialProcs.length + 1);
  console.log(`   Procedures Confirmed: [${proc1.id}] ${proc1.name} (${proc1.test_scenarios.length} test scenario)`);

  // Test Assistant retrieval & 6-Block prompt compilation
  const assistants = await testAccountManager.listAssistants(accountId);
  assert(assistants.length >= 1, 'Expected at least 1 assistant');
  const asst = assistants[0];

  const compiledPrompt = await testAccountManager.compileAssistantPrompt(accountId, asst.id);
  assert(compiledPrompt.includes('=== BLOCK 1: BUSINESS CONTEXT & COMPANY INFORMATION ==='), 'Expected Block 1');
  assert(compiledPrompt.includes('=== BLOCK 2: IMMUTABLE POLICIES & COMPLIANCE RULES ==='), 'Expected Block 2');
  assert(compiledPrompt.includes('=== BLOCK 3: AUTHORIZED PROCEDURES & WORKFLOW CONSTRAINTS ==='), 'Expected Block 3');
  assert(compiledPrompt.includes('=== BLOCK 4: ASSISTANT PERSONA & VOCAL CADENCE ==='), 'Expected Block 4');
  assert(compiledPrompt.includes('=== BLOCK 5: CONVERSATIONAL GUIDELINES & TELEPHONY MANNERS ==='), 'Expected Block 5');
  assert(compiledPrompt.includes('=== BLOCK 6: TOOL INSTRUCTIONS & CAPABILITIES ==='), 'Expected Block 6');
  assert(compiledPrompt.includes('[POL-001]'), 'Expected prompt to reference POL-001');
  assert(compiledPrompt.includes('CRITICAL EXECUTION MANDATE:'), 'Expected execution mandate');
  assert(compiledPrompt.includes('MUST politely decline'), 'Expected polite decline mandate');
  console.log('   Strict 6-Block Prompt Compilation Confirmed');

  // Test Soft-Delete to Recycle Bin & Restore
  await testAccountManager.deletePolicy(accountId, policy3.id);
  const binItems = await testAccountManager.listRecycleBin(accountId);
  assert(binItems.some(i => i.id === policy3.id && i.type === 'policy'));
  console.log(`   Recycle Bin Soft-Delete Confirmed (${binItems.length} items in bin)`);

  const binItem = binItems.find(i => i.id === policy3.id);
  await testAccountManager.restoreRecycleItem(accountId, binItem.binItemId);
  const restoredPolicies = await testAccountManager.listPolicies(accountId, 'all');
  assert(restoredPolicies.some(p => p.id === policy3.id));
  console.log(`   Recycle Bin Item Restored Successfully`);

  // Test VirtualToolManager Normalization
  const { VirtualToolManager } = await import('../src/tools/virtual-tool-manager.js');
  const vtoolMgr = new VirtualToolManager('data/test-accounts');
  const fallbackStub = vtoolMgr.getFallbackToolStub('clinic calendar appointments');
  assert(fallbackStub.endpoints.length >= 2);
  assert(fallbackStub.endpoints[0].example_call_parameters, 'Expected normalized example_call_parameters');
  assert(fallbackStub.endpoints[0].example_call_response, 'Expected normalized example_call_response');
  await vtoolMgr.saveTool(accountId, fallbackStub);
  const toolsList = await vtoolMgr.listTools(accountId);
  assert(toolsList.length >= 1);
  console.log(`   Virtual Tools (Normalized MCP Schemas) Confirmed: ${toolsList.length} services`);

  // Test CertificationManager Snapshots with Policies & Procedures Freeze
  const { CertificationManager } = await import('../src/certification/certification-manager.js');
  const certMgr = new CertificationManager(testAccountManager, 'data/test-accounts');
  const snapshotsDir = certMgr.getSnapshotsDir(accountId);
  await fs.mkdir(snapshotsDir, { recursive: true });
  const dummySnapshot = {
    snapshotId: 'cert-test-01',
    timestamp: new Date().toISOString(),
    assistantId: asst.id,
    assistantName: asst.name,
    passedCount: 1,
    failedCount: 0,
    overallPassed: true,
    mode: 'text',
    companyInfoSnapshot: updatedCompInfo,
    policiesSnapshot: policiesList,
    proceduresSnapshot: proceduresList,
  };
  await fs.writeFile(path.join(snapshotsDir, 'snapshot_cert-test-01.json'), JSON.stringify(dummySnapshot, null, 2));
  const snapList = await certMgr.listSnapshots(accountId);
  assert.strictEqual(snapList.length, 1);
  assert.strictEqual(snapList[0].snapshotId, 'cert-test-01');

  // Deploy as Active
  const deployRes = await certMgr.deployActiveConfiguration(accountId, 'cert-test-01');
  assert(deployRes.success);
  const activeCfg = await certMgr.getActiveConfiguration(accountId);
  assert.strictEqual(activeCfg.activeSnapshot.snapshotId, 'cert-test-01');
  const history = await certMgr.getDeploymentHistory(accountId);
  assert.strictEqual(history.length, 1);
  console.log(`   Certification Snapshots & Active Deployment History Confirmed`);

  console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

