/**
 * Account & Workspace Storage Manager for Talk Dojo
 * Manages Customer Accounts, Dynamic Markdown Company Info, Policies (Always/Never/Conditional),
 * Procedures (Workflows, Tool Constraints & Integrated Test Scenarios), Assistants, and Recycle Bin.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { VirtualToolManager } from '../tools/virtual-tool-manager.js';
import { config } from '../config.js';

export class AccountManager {
  constructor(baseDir = 'data/accounts') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await this.migrateLegacyAccounts();
    await this.initDefaultSeedAccount();
  }

  // --- GUID GENERATOR & MIGRATION ---

  generateGuid(prefix = 'id') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${ts}-${rand}`;
  }

  async migrateLegacyAccounts() {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('acct-') && !entry.name.startsWith('acc-')) {
          const oldDir = path.join(this.baseDir, entry.name);
          const newId = `acct-smk-7b9e2f41`;
          const newDir = path.join(this.baseDir, newId);

          try {
            await fs.rename(oldDir, newDir);
            const accFile = path.join(newDir, 'account.yaml');
            try {
              const raw = await fs.readFile(accFile, 'utf8');
              const data = yaml.parse(raw) || {};
              data.id = newId;
              await fs.writeFile(accFile, yaml.stringify(data), 'utf8');
            } catch (e) {}
            console.log(`Migrated legacy account directory "${entry.name}" to GUID "${newId}"`);
          } catch (err) {
            console.warn(`Could not rename legacy account ${entry.name}:`, err.message);
          }
        }
      }
    } catch (e) {}
  }

  // --- ACCOUNTS CRUD ---

  async listAccounts() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const accountDirs = entries.filter(e => e.isDirectory());

    const accounts = [];
    for (const dir of accountDirs) {
      try {
        const acc = await this.getAccount(dir.name);
        if (acc) accounts.push(acc);
      } catch (e) {}
    }
    return accounts;
  }

  async getAccount(accountId) {
    const accDir = path.join(this.baseDir, accountId);
    const accFile = path.join(accDir, 'account.yaml');
    try {
      const raw = await fs.readFile(accFile, 'utf8');
      const data = yaml.parse(raw);
      data.id = accountId;

      // Count assistants, policies, procedures, and tests
      const assistants = await this.listAssistants(accountId);
      const policies = await this.listPolicies(accountId);
      const procedures = await this.listProcedures(accountId);
      data.assistantsCount = assistants.length;
      data.policiesCount = policies.length;
      data.proceduresCount = procedures.length;

      // Load company info markdown
      const compInfo = await this.getCompanyInfo(accountId);
      data.company_info = compInfo;

      return data;
    } catch (e) {
      return null;
    }
  }

  async saveAccount(accountData) {
    const id = accountData.id && (accountData.id.startsWith('acct-') || accountData.id.startsWith('acc-'))
      ? accountData.id
      : this.generateGuid('acct');

    const accountDir = path.join(this.baseDir, id);
    await fs.mkdir(path.join(accountDir, 'assistants'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'policies'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'procedures'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'test-banks', 'default-bank', 'tests'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'test-banks', 'default-bank', 'drafts'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'recycle-bin'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'archived'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'runs'), { recursive: true });

    const payload = {
      id,
      name: accountData.name || 'New Organization',
      created_at: accountData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(accountDir, 'account.yaml'), yaml.stringify(payload), 'utf8');

    // Save company info markdown if provided
    if (accountData.company_info_markdown) {
      await this.saveCompanyInfo(id, accountData.company_info_markdown);
    } else {
      // Ensure starter company info markdown exists
      await this.ensureDefaultCompanyInfo(id, payload.name);
    }

    return await this.getAccount(id);
  }

  // --- DYNAMIC MARKDOWN COMPANY INFO (SEC-XXX CARDS) ---

  parseMarkdownSections(markdown = '') {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let currentTitle = null;
    let currentBodyLines = [];
    let secIndex = 1;

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headerMatch) {
        if (currentTitle !== null) {
          const body = currentBodyLines.join('\n').trim();
          sections.push({
            id: `SEC-${String(secIndex).padStart(3, '0')}`,
            title: currentTitle.trim(),
            body,
          });
          secIndex++;
          currentBodyLines = [];
        }
        currentTitle = headerMatch[1];
      } else {
        if (currentTitle !== null) {
          currentBodyLines.push(line);
        } else if (line.trim()) {
          // Lines before first header become an intro section
          currentTitle = 'General Overview';
          currentBodyLines.push(line);
        }
      }
    }

    if (currentTitle !== null) {
      const body = currentBodyLines.join('\n').trim();
      sections.push({
        id: `SEC-${String(secIndex).padStart(3, '0')}`,
        title: currentTitle.trim(),
        body,
      });
    }

    return sections;
  }

  serializeMarkdownSections(sections = []) {
    return sections.map(s => {
      const title = s.title.replace(/^SEC-\d+:\s*/, '').trim();
      return `## ${title}\n${(s.body || '').trim()}\n`;
    }).join('\n');
  }

  async getCompanyInfo(accountId) {
    const file = path.join(this.baseDir, accountId, 'company_info.md');
    try {
      const raw = await fs.readFile(file, 'utf8');
      return {
        markdown: raw,
        sections: this.parseMarkdownSections(raw),
      };
    } catch (e) {
      return await this.ensureDefaultCompanyInfo(accountId);
    }
  }

  async saveCompanyInfo(accountId, markdownOrSections) {
    const file = path.join(this.baseDir, accountId, 'company_info.md');
    let markdown = '';
    if (typeof markdownOrSections === 'string') {
      markdown = markdownOrSections.trim();
    } else if (Array.isArray(markdownOrSections)) {
      markdown = this.serializeMarkdownSections(markdownOrSections);
    } else if (markdownOrSections && Array.isArray(markdownOrSections.sections)) {
      markdown = this.serializeMarkdownSections(markdownOrSections.sections);
    } else if (markdownOrSections && typeof markdownOrSections.markdown === 'string') {
      markdown = markdownOrSections.markdown.trim();
    }

    await fs.writeFile(file, markdown, 'utf8');
    return {
      markdown,
      sections: this.parseMarkdownSections(markdown),
    };
  }

  async ensureDefaultCompanyInfo(accountId, accountName = '') {
    const file = path.join(this.baseDir, accountId, 'company_info.md');
    try {
      const raw = await fs.readFile(file, 'utf8');
      return {
        markdown: raw,
        sections: this.parseMarkdownSections(raw),
      };
    } catch (e) {}

    // Generate clean starter template with key sections
    const name = accountName || 'Our Organization';
    const defaultMarkdown = `## Pronunciation & Phonetics
Pronounce "${name}" clearly with deliberate, natural pacing. Avoid running syllables together.

## Alternate Names & Acronyms
Callers may refer to the organization as "${name}", the main office, or local clinic. Acknowledge these naturally.

## Contact Information & Locations
Main Phone: (800) 555-0199
Hours: Monday – Friday, 8:00 AM – 5:00 PM (Local Time)
Address: Headquarters & Central Dispatch, Suite 100.

## Slogans & Core Mission
"Compassionate care, trusted guidance, every call." We exist to serve callers with prompt, respectful, and reliable telephone assistance.

## Key Departments & Escalations
- General Inquiries & Scheduling: Available during normal business hours.
- Emergency / Urgent Care: Advise caller to hang up and dial 911 immediately if experiencing life-threatening emergencies.`;

    await fs.writeFile(file, defaultMarkdown, 'utf8');
    return {
      markdown: defaultMarkdown,
      sections: this.parseMarkdownSections(defaultMarkdown),
    };
  }

  // --- POLICIES CRUD (POL-XXX) ---

  async listPolicies(accountId, filter = null) {
    const dir = path.join(this.baseDir, accountId, 'policies');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const policies = [];
      for (const f of yamlFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const data = yaml.parse(raw);
          data.id = data.id || path.basename(f, path.extname(f));
          policies.push(data);
        } catch (e) {}
      }

      // Sort by ref_id or title
      policies.sort((a, b) => (a.ref_id || a.id).localeCompare(b.ref_id || b.id));

      if (!filter || filter === 'all') return policies;
      if (filter === 'all_enabled' || filter === 'enabled') {
        return policies.filter(p => p.status === 'enabled');
      }
      if (filter === 'always') return policies.filter(p => p.type === 'always' && p.status === 'enabled');
      if (filter === 'never') return policies.filter(p => p.type === 'never' && p.status === 'enabled');
      if (filter === 'conditional') return policies.filter(p => p.type === 'conditional' && p.status === 'enabled');
      if (filter === 'draft') return policies.filter(p => p.status === 'draft');
      if (filter === 'disabled') return policies.filter(p => p.status === 'disabled');

      return policies;
    } catch (e) {
      return [];
    }
  }

  async getPolicy(accountId, policyId) {
    const file = path.join(this.baseDir, accountId, 'policies', `${policyId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);
    data.id = policyId;
    return data;
  }

  async savePolicy(accountId, policyData) {
    const dir = path.join(this.baseDir, accountId, 'policies');
    await fs.mkdir(dir, { recursive: true });

    let id = policyData.id;
    if (!id || id === 'POL-NEW') {
      const existing = await this.listPolicies(accountId);
      const nextNum = existing.length + 1;
      id = `POL-${String(nextNum).padStart(3, '0')}`;
    }

    const payload = {
      id,
      ref_id: id,
      title: policyData.title || 'Untitled Policy',
      type: ['always', 'never', 'conditional'].includes(policyData.type) ? policyData.type : 'always',
      condition: policyData.condition || '',
      action: policyData.action || policyData.rule || '',
      status: ['enabled', 'draft', 'disabled'].includes(policyData.status) ? policyData.status : 'enabled',
      created_at: policyData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(dir, `${id}.yaml`), yaml.stringify(payload), 'utf8');
    return payload;
  }

  async deletePolicy(accountId, policyId) {
    const file = path.join(this.baseDir, accountId, 'policies', `${policyId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);

    await this.addToRecycleBin(accountId, {
      type: 'policy',
      id: policyId,
      name: `[${data.ref_id}] ${data.title}`,
      originalPath: `policies/${policyId}.yaml`,
      data,
    });

    await fs.unlink(file);
    return { success: true, movedToRecycleBin: true };
  }

  // --- PROCEDURES CRUD (PROC-XXX & INTEGRATED TEST SCENARIOS) ---

  async listProcedures(accountId, filter = null) {
    const dir = path.join(this.baseDir, accountId, 'procedures');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const procedures = [];
      for (const f of yamlFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const data = yaml.parse(raw);
          data.id = data.id || path.basename(f, path.extname(f));
          data.test_scenarios = Array.isArray(data.test_scenarios) ? data.test_scenarios : [];
          procedures.push(data);
        } catch (e) {}
      }

      procedures.sort((a, b) => (a.ref_id || a.id).localeCompare(b.ref_id || b.id));

      if (!filter || filter === 'all') return procedures;
      if (filter === 'enabled' || filter === 'all_enabled') {
        return procedures.filter(p => p.status === 'enabled');
      }
      if (filter === 'draft' || filter === 'drafts') {
        return procedures.filter(p => p.status === 'draft');
      }
      if (filter === 'disabled') {
        return procedures.filter(p => p.status === 'disabled');
      }

      return procedures;
    } catch (e) {
      return [];
    }
  }

  async getProcedure(accountId, procedureId) {
    const file = path.join(this.baseDir, accountId, 'procedures', `${procedureId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);
    data.id = procedureId;
    data.test_scenarios = Array.isArray(data.test_scenarios) ? data.test_scenarios : [];
    return data;
  }

  async saveProcedure(accountId, procedureData) {
    const dir = path.join(this.baseDir, accountId, 'procedures');
    await fs.mkdir(dir, { recursive: true });

    let id = procedureData.id;
    if (!id || id === 'PROC-NEW') {
      const existing = await this.listProcedures(accountId);
      const nextNum = existing.length + 1;
      id = `PROC-${String(nextNum).padStart(3, '0')}`;
    }

    const payload = {
      id,
      ref_id: id,
      name: procedureData.name || 'Untitled Procedure',
      status: ['enabled', 'draft', 'disabled'].includes(procedureData.status) ? procedureData.status : 'enabled',
      objective: procedureData.objective || '',
      authorized_tools: Array.isArray(procedureData.authorized_tools) ? procedureData.authorized_tools : [],
      steps: Array.isArray(procedureData.steps) ? procedureData.steps : (procedureData.steps ? [procedureData.steps] : []),
      constraints: procedureData.constraints || '',
      test_scenarios: Array.isArray(procedureData.test_scenarios) ? procedureData.test_scenarios : [],
      created_at: procedureData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(dir, `${id}.yaml`), yaml.stringify(payload), 'utf8');
    return payload;
  }

  async deleteProcedure(accountId, procedureId) {
    const file = path.join(this.baseDir, accountId, 'procedures', `${procedureId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);

    await this.addToRecycleBin(accountId, {
      type: 'procedure',
      id: procedureId,
      name: `[${data.ref_id}] ${data.name}`,
      originalPath: `procedures/${procedureId}.yaml`,
      data,
    });

    await fs.unlink(file);
    return { success: true, movedToRecycleBin: true };
  }

  async addScenarioToProcedure(accountId, procedureId, scenarioData) {
    const procedure = await this.getProcedure(accountId, procedureId);
    if (!procedure) throw new Error(`Procedure ${procedureId} not found`);

    const scenarioId = scenarioData.id || this.generateGuid('scen');
    const scenario = {
      id: scenarioId,
      title: scenarioData.title || 'New Test Scenario',
      customer_role: scenarioData.customer_role || 'Customer calling for service',
      test_objective: scenarioData.test_objective || 'Validate procedural compliance and tool execution',
      secret_instructions: scenarioData.secret_instructions || 'Follow the scenario guidelines.',
      checklist: Array.isArray(scenarioData.checklist) ? scenarioData.checklist : ['Procedure executed accurately'],
      created_at: new Date().toISOString(),
    };

    procedure.test_scenarios.push(scenario);
    await this.saveProcedure(accountId, procedure);
    return scenario;
  }

  async deleteScenarioFromProcedure(accountId, procedureId, scenarioId) {
    const procedure = await this.getProcedure(accountId, procedureId);
    if (!procedure) throw new Error(`Procedure ${procedureId} not found`);

    procedure.test_scenarios = procedure.test_scenarios.filter(s => s.id !== scenarioId);
    await this.saveProcedure(accountId, procedure);
    return { success: true };
  }

  // --- ASSISTANTS CRUD ---

  async listAssistants(accountId) {
    const dir = path.join(this.baseDir, accountId, 'assistants');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const assistants = [];
      for (const f of yamlFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const data = yaml.parse(raw);
          data.id = data.id || path.basename(f, path.extname(f));
          assistants.push(data);
        } catch (e) {}
      }
      return assistants;
    } catch (e) {
      return [];
    }
  }

  async getAssistant(accountId, assistantId) {
    const file = path.join(this.baseDir, accountId, 'assistants', `${assistantId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    return yaml.parse(raw);
  }

  async saveAssistant(accountId, assistantData) {
    const id = assistantData.id && assistantData.id.startsWith('asst-')
      ? assistantData.id
      : (assistantData.id || this.generateGuid('asst'));

    const dir = path.join(this.baseDir, accountId, 'assistants');
    await fs.mkdir(dir, { recursive: true });

    const payload = {
      id,
      name: assistantData.name || 'Assistant',
      voice: assistantData.voice || 'Aoede',
      personality_style: assistantData.personality_style || 'Professional & Courteous',
      backstory: assistantData.backstory || '',
      conversational_rules: Array.isArray(assistantData.conversational_rules) ? assistantData.conversational_rules : [],
      created_at: assistantData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(dir, `${id}.yaml`), yaml.stringify(payload), 'utf8');
    return payload;
  }

  async deleteAssistant(accountId, assistantId) {
    const file = path.join(this.baseDir, accountId, 'assistants', `${assistantId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);

    await this.addToRecycleBin(accountId, {
      type: 'assistant',
      id: assistantId,
      name: data.name,
      originalPath: `assistants/${assistantId}.yaml`,
      data,
    });

    await fs.unlink(file);
    return { success: true, movedToRecycleBin: true };
  }

  // --- RECYCLE BIN ---

  async getRecycleBinFile(accountId) {
    const binDir = path.join(this.baseDir, accountId, 'recycle-bin');
    await fs.mkdir(binDir, { recursive: true });
    return path.join(binDir, 'items.json');
  }

  async listRecycleBin(accountId) {
    const file = await this.getRecycleBinFile(accountId);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const items = JSON.parse(raw);
      items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      return items;
    } catch (e) {
      return [];
    }
  }

  async addToRecycleBin(accountId, item) {
    const file = await this.getRecycleBinFile(accountId);
    let items = [];
    try {
      const raw = await fs.readFile(file, 'utf8');
      items = JSON.parse(raw);
    } catch (e) {}

    items.push({
      binItemId: 'bin-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      deletedAt: new Date().toISOString(),
      ...item,
    });

    await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf8');
  }

  async restoreRecycleItem(accountId, binItemId) {
    const file = await this.getRecycleBinFile(accountId);
    let items = await this.listRecycleBin(accountId);
    const item = items.find(i => i.binItemId === binItemId);
    if (!item) throw new Error('Recycle bin item not found');

    const destFile = path.join(this.baseDir, accountId, item.originalPath);
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.writeFile(destFile, yaml.stringify(item.data), 'utf8');

    items = items.filter(i => i.binItemId !== binItemId);
    await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf8');
    return { success: true, restoredPath: item.originalPath };
  }

  // --- PROMPT COMPILATION: STRICT 6-BLOCK SPECIFICATION ---

  async compileAssistantPrompt(accountId, assistantId) {
    const account = await this.getAccount(accountId);
    const assistant = await this.getAssistant(accountId, assistantId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    if (!assistant) throw new Error(`Assistant ${assistantId} not found`);

    // 1. Company Info Markdown
    const compInfo = await this.getCompanyInfo(accountId);
    const companyMarkdown = compInfo.markdown || `Account Name: ${account.name}`;

    // 2. Policies (Grouped by Always, Never, Conditional)
    const policies = await this.listPolicies(accountId, 'all_enabled');
    const alwaysPolicies = policies.filter(p => p.type === 'always');
    const neverPolicies = policies.filter(p => p.type === 'never');
    const conditionalPolicies = policies.filter(p => p.type === 'conditional');

    let policyText = '';
    if (policies.length === 0) {
      policyText = '- Standard polite customer service telephone etiquette applies.';
    } else {
      if (alwaysPolicies.length > 0) {
        policyText += '### ALWAYS RULES (Mandatory Actions):\n' +
          alwaysPolicies.map(p => `- [${p.ref_id}] ${p.action || p.title}`).join('\n') + '\n\n';
      }
      if (neverPolicies.length > 0) {
        policyText += '### NEVER RULES (Strict Prohibitions):\n' +
          neverPolicies.map(p => `- [${p.ref_id}] DO NOT: ${p.action || p.title}`).join('\n') + '\n\n';
      }
      if (conditionalPolicies.length > 0) {
        policyText += '### CONDITIONAL RULES (Triggered Requirements):\n' +
          conditionalPolicies.map(p => `- [${p.ref_id}] WHEN: ${p.condition || 'Trigger condition met'} -> THEN: ${p.action || p.title}`).join('\n') + '\n';
      }
    }

    // 3. Procedures (Workflows & Strict Tool Constraints)
    const procedures = await this.listProcedures(accountId, 'enabled');
    let procedureText = '';
    if (procedures.length === 0) {
      procedureText = `CRITICAL EXECUTION MANDATE:
No automated procedures are currently enabled for this line. Politely inform the caller that automated actions cannot be taken at this time.`;
    } else {
      procedureText = `CRITICAL EXECUTION MANDATE:
You are ONLY authorized to perform tasks and execute workflows that are explicitly defined in the ENABLED PROCEDURES below.
If a caller asks you to perform ANY action, service, or task that is NOT covered by an enabled procedure below, you MUST politely decline. You do not need to offer human transfer.
You are strictly limited to using tools authorized for that specific procedure.

` + procedures.map(p => {
        const toolsStr = (p.authorized_tools && p.authorized_tools.length > 0)
          ? p.authorized_tools.join(', ')
          : 'None (Conversational only)';
        const stepsStr = Array.isArray(p.steps) ? p.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : `  - ${p.steps || 'Follow workflow'}`;
        const constraintsStr = p.constraints ? `\nConstraints:\n  - ${p.constraints}` : '';
        return `### [${p.ref_id}] ${p.name}
Objective: ${p.objective || 'Handle caller request'}
Authorized Tools: ${toolsStr}
Workflow Steps:
${stepsStr}${constraintsStr}`;
      }).join('\n\n');
    }

    // 4. Conversational Guidelines
    const rulesText = (assistant.conversational_rules && assistant.conversational_rules.length > 0)
      ? assistant.conversational_rules.map((r, idx) => `${idx + 1}. ${r}`).join('\n')
      : '1. Greet callers warmly, listen actively, and speak with natural conversational cadence.';

    // 5. Tools Schema Details
    const toolMgr = new VirtualToolManager(this.baseDir);
    const tools = await toolMgr.listTools(accountId);
    let toolsDetails = '';
    if (tools.length > 0) {
      toolsDetails = tools.map(t => {
        const eps = (t.endpoints || []).map(ep => `  - ${ep.name}: ${ep.description || ''}`).join('\n');
        return `Service: ${t.name}\n${eps}`;
      }).join('\n\n');
    } else {
      toolsDetails = 'No external API tools registered.';
    }

    return `=== BLOCK 1: BUSINESS CONTEXT & COMPANY INFORMATION ===
Account Name: ${account.name}

${companyMarkdown}

=== BLOCK 2: IMMUTABLE POLICIES & COMPLIANCE RULES ===
You MUST strictly follow and adhere to these mandatory company policies at all times:
${policyText.trim()}

=== BLOCK 3: AUTHORIZED PROCEDURES & WORKFLOW CONSTRAINTS ===
${procedureText.trim()}

=== BLOCK 4: ASSISTANT PERSONA & VOCAL CADENCE ===
Assistant Name: ${assistant.name}
Voice Model: ${assistant.voice || 'Aoede'}
Personality Style: ${assistant.personality_style || 'Professional & Courteous'}
Backstory:
${assistant.backstory || 'Experienced telephone representative.'}

=== BLOCK 5: CONVERSATIONAL GUIDELINES & TELEPHONY MANNERS ===
${rulesText}
- Speak in natural, spoken conversational cadence suitable for telephone dialogue.
- NEVER speak markdown formatting, asterisks, bullet points, or JSON aloud.
- Speak only direct, in-character spoken dialogue to the caller.

=== BLOCK 6: TOOL INSTRUCTIONS & CAPABILITIES ===
${toolsDetails}
- Only call tools that are authorized for the active procedure you are executing.`;
  }

  // --- SEED DEFAULT ACCOUNT (SMOKY MOUNTAIN HEALTH) ---

  async initDefaultSeedAccount() {
    const accounts = await this.listAccounts();
    if (accounts.length > 0) {
      // Seed policies & procedures for first account if missing
      const firstAcc = accounts[0];
      await this.ensureSeedPoliciesAndProcedures(firstAcc.id);
      return;
    }

    const accountId = 'acct-smk-7b9e2f41';
    await this.saveAccount({
      id: accountId,
      name: 'Smoky Mountain Family Medicine',
    });

    await this.ensureSeedPoliciesAndProcedures(accountId);
  }

  async ensureSeedPoliciesAndProcedures(accountId) {
    const policies = await this.listPolicies(accountId);
    if (policies.length === 0) {
      await this.savePolicy(accountId, {
        ref_id: 'POL-001',
        title: 'HIPAA Two-Factor Identity Verification',
        type: 'always',
        action: 'Always verify the caller with two distinct identifiers (Full Legal Name and Date of Birth) before discussing appointments, test results, or medical records.',
        status: 'enabled',
      });
      await this.savePolicy(accountId, {
        ref_id: 'POL-002',
        title: 'Medical Advice & Clinical Diagnosis Prohibition',
        type: 'never',
        action: 'Never provide medical diagnoses, clinical interpretations of symptoms, or prescribe medication over the telephone.',
        status: 'enabled',
      });
      await this.savePolicy(accountId, {
        ref_id: 'POL-003',
        title: 'Emergency Triage 911 Escalation',
        type: 'conditional',
        condition: 'Caller reports chest pain, severe difficulty breathing, sudden numbness, or profuse bleeding',
        action: 'Immediately advise caller to hang up and dial 911 without delay.',
        status: 'enabled',
      });
    }

    const procedures = await this.listProcedures(accountId);
    if (procedures.length === 0) {
      await this.saveProcedure(accountId, {
        ref_id: 'PROC-001',
        name: 'Clinic Appointment Scheduling & Rescheduling',
        status: 'enabled',
        objective: 'Assist established and new patients with booking, confirming, or rescheduling clinic visits.',
        authorized_tools: ['check_clinic_slots', 'book_clinic_appointment'],
        steps: [
          'Verify patient identity per policy POL-001.',
          'Inquire regarding preferred provider, date range, and reason for visit.',
          'Execute check_clinic_slots tool to find open openings.',
          'Offer available appointment times and confirm patient choice.',
          'Execute book_clinic_appointment tool and provide confirmation details.',
        ],
        constraints: 'Only schedule appointments within normal operating hours (Mon-Fri 8 AM - 5 PM). Minimum 24 hours advance notice.',
        test_scenarios: [
          {
            id: 'scen-sched-01',
            title: 'Schedule Thursday Follow-up Appointment',
            customer_role: 'Patient John Smith looking for a Thursday appointment',
            test_objective: 'Verify identity, lookup Thursday slots, book 2:00 PM, and recite instructions',
            secret_instructions: 'You are John Smith, DOB March 14, 1980. You need a Thursday afternoon checkup.',
            checklist: [
              'Verified caller full name and date of birth',
              'Checked Thursday appointment availability via tool',
              'Confirmed 2:00 PM appointment slot',
            ],
          },
        ],
      });
    }

    const assistants = await this.listAssistants(accountId);
    if (assistants.length === 0) {
      await this.saveAssistant(accountId, {
        id: 'asst-sarah-lou',
        name: 'Sarah Lou Jenkins',
        voice: 'Aoede',
        personality_style: 'Southern Charm & Warmth',
        backstory: 'Born and raised in Knoxville, Tennessee. 9 years of medical clinic front-desk administration. Renowned for her friendly, patient, and polite demeanor.',
        conversational_rules: [
          'Greet callers warmly and actively listen.',
          'Speak with clarity, warmth, and respectful patience.',
        ],
      });
    }

    const vtoolMgr = new VirtualToolManager(this.baseDir);
    const tools = await vtoolMgr.listTools(accountId);
    if (tools.length === 0) {
      await vtoolMgr.saveTool(accountId, {
        id: 'tool-clinic-scheduler',
        name: 'Clinic Scheduling Service',
        description: 'EHR appointment query and booking tools',
        endpoints: [
          {
            name: 'check_clinic_slots',
            description: 'Lookup open appointment slots for clinic doctors',
            parameters: {
              type: 'OBJECT',
              properties: {
                date: { type: 'STRING', description: 'Date to inspect, e.g. Thursday' },
              },
              required: ['date'],
            },
            example_call_parameters: { date: 'Thursday' },
            expected_response_schema: {
              status: 'string',
              slots: 'array of strings',
            },
            example_call_response: {
              status: 'AVAILABLE',
              slots: ['Thursday at 2:00 PM', 'Thursday at 4:15 PM'],
            },
          },
          {
            name: 'book_clinic_appointment',
            description: 'Reserve an appointment slot for a verified patient',
            parameters: {
              type: 'OBJECT',
              properties: {
                patient_name: { type: 'STRING', description: 'Verified full name of patient' },
                slot: { type: 'STRING', description: 'Selected slot time, e.g. Thursday 2:00 PM' },
              },
              required: ['patient_name', 'slot'],
            },
            example_call_parameters: { patient_name: 'John Smith', slot: 'Thursday 2:00 PM' },
            expected_response_schema: {
              confirmation_code: 'string',
              status: 'string',
            },
            example_call_response: {
              confirmation_code: 'CONF-88219',
              status: 'CONFIRMED',
            },
          },
        ],
      });
    }
  }
}
