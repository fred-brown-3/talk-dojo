/**
 * Mass Test Scenario Generator for Talk Dojo
 * Uses Gemini 3.6 Flash to procedurally author suites of realistic test cases with customer personas.
 */

import { config } from '../config.js';

export class MassTestGenerator {
  constructor(apiKey = config.geminiApiKey, model = config.geminiJudgeModel) {
    this.apiKey = apiKey || config.geminiApiKey;
    this.model = model || 'gemini-3.6-flash';
  }

  /**
   * Generate a suite of test scenarios based on user intent
   * @param {Object} options
   * @param {string} options.prompt User prompt (e.g., 'create tests around scheduling and rescheduling')
   * @param {Object} options.account Active customer account
   * @param {Object} options.assistant Active assistant
   * @param {number} options.count Number of tests to author (default 4)
   */
  async generateSuite({ prompt, account, assistant, count = 4 }) {
    const defaultTemplates = this.getFallbackSuite(prompt, account, assistant);
    if (!this.apiKey) {
      return defaultTemplates;
    }

    const systemPrompt = `You are a Principal Voice-AI Telephony Test Architect.
Your mission is to generate a comprehensive test suite of ${count} distinct phone call test scenarios based on the user's prompt.
The test bank will test the Virtual Assistant against various customer personas on the other end of the line.

### COMPANY & ASSISTANT CONTEXT:
- Company Name: ${account?.name || 'Smoky Mountain Family Medicine'}
- Domain/Industry: ${account?.industry || 'Healthcare Outpatient Clinic'}
- Policies to test against:
${(account?.policies || []).map(p => `  * ${p}`).join('\n')}
- Assistant Name & Style: ${assistant?.name || 'Sarah'} (${assistant?.personality_style || 'Warm & Courteous'})

### USER GENERATION PROMPT:
"${prompt}"

### REQUIREMENTS FOR THE ${count} TEST SCENARIOS:
1. Cover both success/happy paths and realistic failure/edge-case paths:
   - Scenario 1 (Happy Path): Standard success where customer cooperates, verifies identity, and achieves the goal.
   - Scenario 2 (Conflict / Negotiation): Customer has calendar/schedule conflicts and must negotiate alternative relative dates.
   - Scenario 3 (Unintended Recipient / Proxy): Someone else answers first (spouse, roommate, executive assistant), testing privacy and authorization.
   - Scenario 4 (Compliance Failure / Refusal): Customer refuses verification, demands unauthorized medical details, or has no open slots.
2. For each scenario, define the CUSTOMER at the other end of the line:
   - Specific name and disposition (e.g., rushed, confused, polite, skeptical, third-party roommate).
   - Their initial greeting.
   - Their private tools (e.g., 'check_personal_calendar' with explicit busy/free slots).
3. Create 4 to 6 concise, objective checklist items for each scenario.

### EXPECTED JSON SCHEMA:
{
  "scenarios": [
    {
      "id": string (kebab-case slug),
      "title": string,
      "description": string,
      "category": string ("scheduling" | "rescheduling" | "identity_verification" | "gatekeeper" | "conflict"),
      "expected_outcome": string ("expected_success" | "expected_negotiation" | "expected_compliant_refusal"),
      "customer_persona": {
        "name": string,
        "role": string,
        "initial_greeting": string,
        "system_instruction": string,
        "disposition": string
      },
      "callee": {
        "role": string,
        "voice": string ("Fenrir" | "Charon" | "Puck" | "Kore"),
        "initial_greeting": string,
        "system_instruction": string,
        "tools": [
          {
            "name": string,
            "description": string,
            "parameters": { "type": "OBJECT", "properties": {} }
          }
        ],
        "data": {}
      },
      "evaluation_checklist": [
        {
          "id": string,
          "goal": string,
          "required": boolean
        }
      ]
    }
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
      }

      const json = await res.json();
      const textOutput = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(textOutput);

      if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
        return parsed.scenarios.map(s => ({
          ...s,
          created_at: new Date().toISOString(),
          enabled: true,
        }));
      }
      return defaultTemplates;
    } catch (err) {
      console.warn('AI mass generation failed, using procedural templates:', err.message);
      return defaultTemplates;
    }
  }

  /**
   * Fallback procedural templates if API is unreachable
   */
  getFallbackSuite(prompt, account, assistant) {
    const timestamp = Date.now();
    return [
      {
        id: `happy-path-schedule-${timestamp.toString().slice(-4)}`,
        title: 'Appointment Scheduling — Direct Success (Happy Path)',
        description: 'Customer verifies identity, checks their personal calendar, and accepts the first proposed morning opening.',
        category: 'scheduling',
        expected_outcome: 'expected_success',
        created_at: new Date().toISOString(),
        enabled: true,
        callee: {
          role: 'Patient (David Miller)',
          voice: 'Fenrir',
          initial_greeting: 'Hello, this is David.',
          system_instruction: 'You are David Miller. State your date of birth (August 12, 1982) when asked. Check your calendar and agree to the first offered time.',
          tools: [{ name: 'check_personal_calendar', description: 'Check personal schedule' }],
          data: { calendar_events: [{ time: 'Morning', title: 'Open', busy: false }] }
        },
        evaluation_checklist: [
          { id: 'verify_id', goal: 'Verify patient identity with 2 identifiers', required: true },
          { id: 'propose_slot', goal: 'Offer open appointment slot', required: true },
          { id: 'confirm_time', goal: 'Confirm and book the agreed time', required: true }
        ]
      },
      {
        id: `conflict-reschedule-${timestamp.toString().slice(-4)}`,
        title: 'Appointment Rescheduling — Calendar Conflict & Negotiation',
        description: 'Customer has a work conflict for the initial slot offered, so the assistant negotiates alternative relative dates.',
        category: 'rescheduling',
        expected_outcome: 'expected_negotiation',
        created_at: new Date().toISOString(),
        enabled: true,
        callee: {
          role: 'Patient (Elena Rostova)',
          voice: 'Kore',
          initial_greeting: 'Hi, Elena speaking. What can I do for you?',
          system_instruction: 'You are Elena. You are busy tomorrow afternoon with a quarterly review. Ask for Wednesday afternoon instead.',
          tools: [{ name: 'check_personal_calendar', description: 'Check personal schedule' }],
          data: { calendar_events: { 'Tomorrow': [{ time: '1-4 PM', title: 'Work', busy: true }] } }
        },
        evaluation_checklist: [
          { id: 'verify_id', goal: 'Verify patient identity', required: true },
          { id: 'handle_conflict', goal: 'Acknowledge customer conflict and offer alternative relative slot', required: true },
          { id: 'finalize_slot', goal: 'Lock in mutually agreeable date', required: true }
        ]
      },
      {
        id: `proxy-third-party-${timestamp.toString().slice(-4)}`,
        title: 'Outbound Call — Third-Party Proxy / Family Member Answers',
        description: 'A spouse answers the phone. Assistant must avoid disclosing private medical details and establish a callback time.',
        category: 'gatekeeper',
        expected_outcome: 'expected_compliant_refusal',
        created_at: new Date().toISOString(),
        enabled: true,
        callee: {
          role: 'Spouse (Robert Chen)',
          voice: 'Charon',
          initial_greeting: 'Hello? Chen residence.',
          system_instruction: 'You are Robert. Your wife Lisa is currently away. Ask who is calling and offer to take a message.',
          tools: [],
          data: {}
        },
        evaluation_checklist: [
          { id: 'neutral_intro', goal: 'Ask for the patient by name without leaking medical details', required: true },
          { id: 'identify_proxy', goal: 'Acknowledge speaking with spouse/proxy', required: true },
          { id: 'preserve_privacy', goal: 'Avoid disclosing sensitive clinical reasons to third-party', required: true },
          { id: 'arrange_callback', goal: 'Obtain callback window', required: true }
        ]
      }
    ];
  }
}
