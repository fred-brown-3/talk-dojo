import { config } from '../config.js';

export class LLMJudge {
  constructor(apiKey = config.geminiApiKey, model = config.geminiJudgeModel) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Evaluate a completed conversation transcript against the scenario's checklist
   */
  async evaluateConversation({ scenario, transcript, toolLogs = [], metrics = {} }) {
    if (!this.apiKey) {
      return {
        overall_passed: false,
        overall_score: 0,
        summary: "Evaluation skipped: GEMINI_API_KEY is not configured.",
        checklist_results: [],
        coaching_feedback: ["Set GEMINI_API_KEY to enable automatic AI judge evaluations."],
      };
    }

    const formattedTranscript = transcript.map(t => {
      const speakerName = t.speaker === 'caller' 
        ? (scenario.caller?.role || 'Caller')
        : (scenario.callee?.role || 'Callee');
      return `[${t.timeStr || ''}] ${speakerName}: ${t.text}`;
    }).join('\n');

    const formattedToolLogs = toolLogs && toolLogs.length > 0
      ? toolLogs.map(t => `[${t.timeStr}] ${t.role?.toUpperCase() || t.agentRole?.toUpperCase()} executed ${t.name || t.functionName}(${JSON.stringify(t.args)}) -> ${JSON.stringify(t.output || t.result)}`).join('\n')
      : '(No tools executed during this call)';

    const checklistItems = scenario.evaluation_checklist || [];

    const prompt = `You are an expert Voice-AI Telephone Conversation Referee & Evaluator in "Talk Dojo".
Your job is to objectively analyze the following simulated phone call transcript and tool execution logs to determine whether the primary agent fulfilled all test goals.

### SCENARIO:
- Title: ${scenario.title}
- Description: ${scenario.description}
- Language: ${scenario.language || 'en'}
- Caller Role: ${scenario.caller?.role || 'Caller'}
- Callee Role: ${scenario.callee?.role || 'Callee'}
- Line Impairment (Static Level): ${metrics.staticLevel ?? scenario.impairments?.static_level ?? 0}

### AGENT TOOL EXECUTION LOGS:
${formattedToolLogs}

### EVALUATION CHECKLIST:
${checklistItems.map((item, idx) => `${idx + 1}. [ID: ${item.id}] ${item.goal} (Required: ${item.required !== false})`).join('\n')}

### CONVERSATION TRANSCRIPT:
${formattedTranscript || '(Empty transcript)'}

### INSTRUCTIONS:
1. For every checklist item, check if it was achieved in the transcript or supported by tool execution.
2. Quote exact evidence from the transcript or tool logs.
3. If line static was present, assess how well the agent handled audio degradation (e.g. asking for repetition or clarification).
6. DUAL-REMEDIATION AUTO-REPAIR:
   - If any checklist goal failed: diagnose whether the root cause was an Assistant/Policy oversight (needs a Policy Amendment to company rules / assistant prompt) OR a flawed/impossible Test Scenario (needs a Scenario Correction).
   - Identify the exact turn indices where failures or compliance violations happened.
7. Return strictly valid JSON adhering to the specified schema.

### EXPECTED JSON SCHEMA:
{
  "overall_passed": boolean,
  "overall_score": number (0 to 100),
  "summary": string,
  "checklist_results": [
    {
      "id": string,
      "goal": string,
      "passed": boolean,
      "evidence_quote": string,
      "explanation": string
    }
  ],
  "failure_moments": [
    {
      "turn_index": number,
      "speaker": string ("caller" | "callee"),
      "timeStr": string,
      "reason": string,
      "quote": string
    }
  ],
  "dual_remediation": {
    "recommended_fix_type": string ("POLICY_AMENDMENT" | "SCENARIO_CORRECTION" | "NONE"),
    "target": string ("company_policies" | "assistant_instruction" | "scenario_setup"),
    "title": string,
    "diagnosis": string,
    "proposed_patch": string,
    "action_label": string ("Apply Policy Amendment" | "Apply Scenario Correction")
  },
  "phone_dynamics_rating": {
    "interruption_and_pacing": string,
    "resilience_to_noise": string,
    "politeness_and_tone": string
  },
  "coaching_feedback": [string]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Judge API failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error('Gemini Judge returned empty evaluation response');
    }

    return JSON.parse(rawContent);
  }
}
