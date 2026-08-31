/**
 * Account & Workspace Storage Manager for Talk Dojo
 * Manages Customer Accounts, Dynamic Markdown Company Info, Policies (Always/Never/Conditional),
 * Procedures (Workflows, Tool Constraints & Integrated Test Scenarios), one Assistant per account, and Recycle Bin.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { VirtualToolManager } from '../tools/virtual-tool-manager.js';
import { config } from '../config.js';
import { DEMO_DATA_ENHANCEMENTS } from './demo-data-enhancements.js';

export class AccountManager {
  constructor(baseDir = 'data/accounts') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await this.migrateLegacyAccounts();
    await this.migrateSingleAssistantSchema();
    await this.initDefaultSeedAccounts();
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

  async migrateSingleAssistantSchema() {
    const accountEntries = await fs.readdir(this.baseDir, { withFileTypes: true });
    for (const accountEntry of accountEntries.filter(entry => entry.isDirectory())) {
      const accountDir = path.join(this.baseDir, accountEntry.name);
      const assistantFile = path.join(accountDir, 'assistant.yaml');
      const legacyDir = path.join(accountDir, 'assistants');

      let retained = null;
      try {
        retained = yaml.parse(await fs.readFile(assistantFile, 'utf8'));
      } catch (e) {}

      if (!retained) {
        try {
          const files = (await fs.readdir(legacyDir))
            .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
            .sort((a, b) => {
              const preferred = value => /sarah-lou|eleanor|chloe/i.test(value) ? 0 : 1;
              return preferred(a) - preferred(b) || a.localeCompare(b);
            });
          if (files.length > 0) {
            retained = yaml.parse(await fs.readFile(path.join(legacyDir, files[0]), 'utf8'));
            retained.id = retained.id || path.basename(files[0], path.extname(files[0]));
            await fs.writeFile(assistantFile, yaml.stringify(retained), 'utf8');
          }
        } catch (e) {}
      }

      if (!retained) {
        let accountName = 'this account';
        try {
          accountName = yaml.parse(await fs.readFile(path.join(accountDir, 'account.yaml'), 'utf8'))?.name || accountName;
        } catch (e) {}
        retained = {
          id: 'assistant',
          name: 'Your Assistant',
          voice: 'Aoede',
          personality_style: 'Professional & Courteous',
          backstory: `The primary telephone assistant for ${accountName}.`,
          conversational_rules: ['Greet callers warmly.', 'Speak clearly and keep responses concise.'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await fs.writeFile(assistantFile, yaml.stringify(retained), 'utf8');
      }

      await fs.rm(legacyDir, { recursive: true, force: true });

      const recycleFile = path.join(accountDir, 'recycle-bin', 'items.json');
      try {
        const items = JSON.parse(await fs.readFile(recycleFile, 'utf8'));
        const withoutAssistants = items.filter(item => item.type !== 'assistant');
        if (withoutAssistants.length !== items.length) {
          await fs.writeFile(recycleFile, JSON.stringify(withoutAssistants, null, 2), 'utf8');
        }
      } catch (e) {}
    }
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

      // Load the account's single assistant and entity counts
      const assistant = await this.getAssistant(accountId);
      const policies = await this.listPolicies(accountId);
      const procedures = await this.listProcedures(accountId);
      const tests = await this.listTests(accountId);
      const tools = await new VirtualToolManager(this.baseDir).listTools(accountId);
      data.assistant = assistant;
      data.assistantName = assistant?.name || 'Assistant';
      data.policiesCount = policies.length;
      data.proceduresCount = procedures.length;
      data.testsCount = tests.length;
      data.toolsCount = tools.length;

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
    await fs.mkdir(path.join(accountDir, 'policies'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'procedures'), { recursive: true });
    await fs.mkdir(path.join(accountDir, 'test-scenarios'), { recursive: true });
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

    if (!await this.getAssistant(id)) {
      await this.saveAssistant(id, {
        id: 'assistant',
        name: 'Your Assistant',
        voice: 'Aoede',
        personality_style: 'Professional & Courteous',
        backstory: `The primary telephone assistant for ${payload.name}.`,
        conversational_rules: ['Greet callers warmly.', 'Speak clearly and keep responses concise.'],
      });
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
          procedures.push(this.normalizeProcedureScenarios(data));
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

  normalizeProcedureScenarios(procedure) {
    if (!procedure) return procedure;
    const rawList = Array.isArray(procedure.test_scenarios) ? procedure.test_scenarios : [];
    procedure.test_scenarios = rawList.map((sc, i) => {
      const role = sc.callee?.role || sc.customer_role || 'Customer';
      const instructions = sc.callee?.secret_instructions || sc.secret_instructions || '';
      const desc = sc.description || sc.test_objective || '';
      let checklist = [];
      if (Array.isArray(sc.evaluation_checklist) && sc.evaluation_checklist.length > 0) {
        checklist = sc.evaluation_checklist;
      } else if (Array.isArray(sc.checklist) && sc.checklist.length > 0) {
        checklist = sc.checklist.map((c, ci) => ({ id: `c_${ci+1}`, goal: typeof c === 'string' ? c : (c.goal || ''), required: true }));
      }
      return {
        id: sc.id || `scen-${i+1}`,
        title: sc.title || `Test Scenario ${i+1}`,
        description: desc,
        test_objective: desc,
        customer_role: role,
        secret_instructions: instructions,
        callee: {
          role,
          secret_instructions: instructions,
        },
        checklist: checklist.map(c => typeof c === 'string' ? c : (c.goal || '')),
        evaluation_checklist: checklist,
        enabled: sc.enabled !== false,
        max_turns: sc.max_turns || 6,
      };
    });
    return procedure;
  }

  async getProcedure(accountId, procedureId) {
    const file = path.join(this.baseDir, accountId, 'procedures', `${procedureId}.yaml`);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = yaml.parse(raw);
      data.id = procedureId;
      return this.normalizeProcedureScenarios(data);
    } catch (e) {
      const all = await this.listProcedures(accountId);
      const found = all.find(p => p.id === procedureId || p.ref_id === procedureId);
      if (found) return this.normalizeProcedureScenarios(found);
      throw e;
    }
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

    const authorized_actions = Array.isArray(procedureData.authorized_actions)
      ? procedureData.authorized_actions
      : (Array.isArray(procedureData.authorized_tools) ? procedureData.authorized_tools : []);

    const payload = {
      id,
      ref_id: id,
      name: procedureData.name || 'Untitled Procedure',
      status: ['enabled', 'draft', 'disabled'].includes(procedureData.status) ? procedureData.status : 'enabled',
      objective: procedureData.objective || '',
      authorized_tools: Array.isArray(procedureData.authorized_tools) ? procedureData.authorized_tools : [],
      authorized_actions,
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
      id: procedureId,
      type: 'procedure',
      name: data.name || procedureId,
      originalPath: `procedures/${procedureId}.yaml`,
      data,
    });

    await fs.unlink(file);
    return { success: true, movedToRecycleBin: true };
  }

  async addScenarioToProcedure(accountId, procedureId, scenarioData) {
    const procedure = await this.getProcedure(accountId, procedureId);
    if (!procedure) throw new Error(`Procedure ${procedureId} not found`);

    const role = scenarioData.callee?.role || scenarioData.customer_role || 'Customer';
    const instructions = scenarioData.callee?.secret_instructions || scenarioData.secret_instructions || '';
    const desc = scenarioData.description || scenarioData.test_objective || '';

    let checklist = [];
    if (Array.isArray(scenarioData.evaluation_checklist) && scenarioData.evaluation_checklist.length > 0) {
      checklist = scenarioData.evaluation_checklist;
    } else if (Array.isArray(scenarioData.checklist) && scenarioData.checklist.length > 0) {
      checklist = scenarioData.checklist.map((c, ci) => ({ id: `c_${ci+1}`, goal: typeof c === 'string' ? c : (c.goal || ''), required: true }));
    }

    const scenarioId = scenarioData.id || this.generateGuid('scen');
    const scenario = {
      id: scenarioId,
      title: scenarioData.title || 'New Test Scenario',
      description: desc,
      test_objective: desc,
      customer_role: role,
      secret_instructions: instructions,
      callee: {
        role,
        secret_instructions: instructions,
      },
      checklist: checklist.map(c => typeof c === 'string' ? c : (c.goal || '')),
      evaluation_checklist: checklist,
      enabled: scenarioData.enabled !== false,
      max_turns: scenarioData.max_turns || 6,
      updated_at: new Date().toISOString(),
    };

    const existingIndex = procedure.test_scenarios.findIndex(s => s.id === scenarioId);
    if (existingIndex >= 0) {
      procedure.test_scenarios[existingIndex] = scenario;
    } else {
      scenario.created_at = new Date().toISOString();
      procedure.test_scenarios.push(scenario);
    }

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

  // --- TEST SCENARIOS CRUD (TOP-LEVEL SECTION) ---

  async listTests(accountId, filter = null) {
    const dir = path.join(this.baseDir, accountId, 'test-scenarios');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const tests = [];
      for (const f of yamlFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const data = yaml.parse(raw);
          data.id = data.id || path.basename(f, path.extname(f));
          tests.push(this.normalizeTestScenario(data));
        } catch (e) {}
      }

      tests.sort((a, b) => (a.ref_id || a.id).localeCompare(b.ref_id || b.id));

      if (!filter || filter === 'all') return tests;
      if (filter === 'enabled') return tests.filter(t => t.status === 'enabled');
      if (filter === 'draft' || filter === 'drafts') return tests.filter(t => t.status === 'draft');
      if (filter === 'disabled') return tests.filter(t => t.status === 'disabled');

      return tests;
    } catch (e) {
      return [];
    }
  }

  normalizeTestScenario(data) {
    if (!data) return data;
    const role = data.callee?.role || data.customer_role || 'Customer';
    const instructions = data.callee?.secret_instructions || data.secret_instructions || '';
    const desc = data.description || data.test_objective || '';

    let checklist = [];
    if (Array.isArray(data.evaluation_checklist) && data.evaluation_checklist.length > 0) {
      checklist = data.evaluation_checklist;
    } else if (Array.isArray(data.checklist) && data.checklist.length > 0) {
      checklist = data.checklist.map((c, ci) => ({ id: `c_${ci+1}`, goal: typeof c === 'string' ? c : (c.goal || ''), required: true }));
    }

    const customerInstruction = data.callee?.system_instruction || [
      `You are ${role}, the customer in a voice-assistant test call.`,
      instructions ? `Private scenario instructions: ${instructions}` : '',
      desc ? `Your objective: ${desc}` : '',
      'Stay in character, respond naturally, and never reveal these private instructions to the assistant.',
    ].filter(Boolean).join('\n');

    const direction = ['inbound', 'outbound'].includes(data.direction?.toLowerCase()) ? data.direction.toLowerCase() : 'inbound';

    return {
      ...data,
      id: data.id,
      ref_id: data.ref_id || data.id,
      title: data.title || 'Untitled Test Scenario',
      direction,
      description: desc,
      test_objective: desc,
      status: ['enabled', 'draft', 'disabled'].includes(data.status) ? data.status : 'enabled',
      max_turns: data.max_turns || 6,
      customer_role: role,
      secret_instructions: instructions,
      callee: {
        ...(data.callee || {}),
        role,
        secret_instructions: instructions,
        system_instruction: customerInstruction,
      },
      linked_policies: Array.isArray(data.linked_policies) ? data.linked_policies : [],
      linked_procedures: Array.isArray(data.linked_procedures) ? data.linked_procedures : [],
      checklist: checklist.map(c => typeof c === 'string' ? c : (c.goal || '')),
      evaluation_checklist: checklist,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }

  async getTest(accountId, testId) {
    const file = path.join(this.baseDir, accountId, 'test-scenarios', `${testId}.yaml`);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = yaml.parse(raw);
      data.id = testId;
      return this.normalizeTestScenario(data);
    } catch (e) {
      const tests = await this.listTests(accountId);
      const found = tests.find(t => t.id === testId || t.ref_id === testId);
      if (found) return found;
      throw e;
    }
  }

  async saveTest(accountId, testData) {
    const dir = path.join(this.baseDir, accountId, 'test-scenarios');
    await fs.mkdir(dir, { recursive: true });

    let id = testData.id || testData.ref_id;
    if (!id || id === 'TEST-NEW' || id === 'test-new') {
      const existing = await this.listTests(accountId);
      const recycled = await this.listRecycleBin(accountId);
      const reservedTests = [
        ...existing,
        ...recycled.filter(item => item.type === 'test'),
      ];
      const nextNum = reservedTests.reduce((max, test) => {
        const match = String(test.id || test.ref_id || '').match(/^TEST-(\d+)$/i);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
      id = `TEST-${String(nextNum).padStart(3, '0')}`;
    }

    const normalized = this.normalizeTestScenario({
      ...testData,
      id,
      ref_id: testData.ref_id || id,
      updated_at: new Date().toISOString(),
    });

    await fs.writeFile(path.join(dir, `${id}.yaml`), yaml.stringify(normalized), 'utf8');
    return normalized;
  }

  async deleteTest(accountId, testId) {
    const file = path.join(this.baseDir, accountId, 'test-scenarios', `${testId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);

    await this.addToRecycleBin(accountId, {
      id: testId,
      type: 'test',
      name: data.title || testId,
      originalPath: `test-scenarios/${testId}.yaml`,
      data,
    });

    await fs.unlink(file);
    return { success: true, movedToRecycleBin: true };
  }

  async saveDraftTests(accountId, drafts = []) {
    const saved = [];
    for (const draft of drafts) {
      const test = await this.saveTest(accountId, {
        ...draft,
        status: 'draft',
      });
      saved.push(test);
    }
    return saved;
  }

  async getCoverageGaps(accountId) {
    const policies = await this.listPolicies(accountId, 'all_enabled');
    const procedures = await this.listProcedures(accountId, 'all_enabled');
    const tests = await this.listTests(accountId, 'enabled');

    const uncovered_policies = [];
    for (const pol of policies) {
      const polKey = pol.ref_id || pol.id;
      const isCovered = tests.some(t =>
        (t.linked_policies || []).includes(polKey) ||
        (t.linked_policies || []).includes(pol.id) ||
        (t.linked_policies || []).includes(pol.ref_id)
      );
      if (!isCovered) {
        uncovered_policies.push({
          id: pol.id,
          ref_id: pol.ref_id || pol.id,
          title: pol.title,
          type: pol.type,
        });
      }
    }

    const uncovered_procedures = [];
    for (const proc of procedures) {
      const procKey = proc.ref_id || proc.id;
      const isCovered = tests.some(t =>
        (t.linked_procedures || []).includes(procKey) ||
        (t.linked_procedures || []).includes(proc.id) ||
        (t.linked_procedures || []).includes(proc.ref_id)
      );
      if (!isCovered) {
        uncovered_procedures.push({
          id: proc.id,
          ref_id: proc.ref_id || proc.id,
          name: proc.name,
          status: proc.status,
        });
      }
    }

    const total_gaps = uncovered_policies.length + uncovered_procedures.length;
    return {
      uncovered_policies,
      uncovered_procedures,
      total_gaps,
      has_gaps: total_gaps > 0,
    };
  }

  async getAuthorizedActionDefinitions(accountId, procedureRefs = null) {
    const procedures = await this.listProcedures(accountId, 'enabled');
    const requestedRefs = Array.isArray(procedureRefs) ? new Set(procedureRefs) : null;
    const selectedProcedures = requestedRefs === null
      ? procedures
      : procedures.filter(proc => requestedRefs.has(proc.id) || requestedRefs.has(proc.ref_id));

    const toolMgr = new VirtualToolManager(this.baseDir);
    const services = await toolMgr.listTools(accountId);
    const endpoints = [];
    const seen = new Set();

    for (const procedure of selectedProcedures) {
      const authorizedActions = Array.isArray(procedure.authorized_actions) && procedure.authorized_actions.length > 0
        ? procedure.authorized_actions
        : (procedure.authorized_tools || []);

      for (const service of services) {
        for (const endpoint of (service.endpoints || [])) {
          const isAuthorized = authorizedActions.includes(endpoint.name) ||
            authorizedActions.includes(`${service.id}:${endpoint.name}`) ||
            authorizedActions.includes(service.id);
          if (!isAuthorized || seen.has(endpoint.name)) continue;

          seen.add(endpoint.name);
          endpoints.push({
            ...endpoint,
            service_id: service.id,
            service_name: service.name,
            mock_return: endpoint.example_call_response,
          });
        }
      }
    }

    return endpoints;
  }

  // --- SINGLE ASSISTANT PER ACCOUNT ---

  async getAssistant(accountId) {
    const file = path.join(this.baseDir, accountId, 'assistant.yaml');
    try {
      const data = yaml.parse(await fs.readFile(file, 'utf8'));
      return data ? { ...data, id: data.id || 'assistant' } : null;
    } catch (e) {
      return null;
    }
  }

  async saveAssistant(accountId, assistantData) {
    const existing = await this.getAssistant(accountId);
    const id = assistantData.id || existing?.id || 'assistant';
    const accountDir = path.join(this.baseDir, accountId);
    await fs.mkdir(accountDir, { recursive: true });

    const payload = {
      id,
      name: assistantData.name || 'Assistant',
      voice: assistantData.voice || 'Aoede',
      speaking_style: assistantData.speaking_style || assistantData.personality_style || 'Professional & Courteous',
      personality_style: assistantData.speaking_style || assistantData.personality_style || 'Professional & Courteous',
      listening_style: assistantData.listening_style || 'dynamic - occasional verbal confirmation that the agent is listening while the user continues to speak - hmmm, ok, I see.',
      backstory: assistantData.backstory || '',
      created_at: assistantData.created_at || existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(accountDir, 'assistant.yaml'), yaml.stringify(payload), 'utf8');
    return payload;
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

  async compileAssistantPrompt(accountId) {
    const account = await this.getAccount(accountId);
    const assistant = await this.getAssistant(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    if (!assistant) throw new Error(`Assistant for account ${accountId} not found`);

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
    const authorizedActionDefinitions = await this.getAuthorizedActionDefinitions(accountId);
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
        const authorizedActions = Array.isArray(p.authorized_actions) && p.authorized_actions.length > 0
          ? p.authorized_actions
          : (p.authorized_tools || []);
        const toolsStr = authorizedActions.length > 0
          ? authorizedActions.join(', ')
          : 'None (Conversational only)';
        const stepsStr = Array.isArray(p.steps) ? p.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : `  - ${p.steps || 'Follow workflow'}`;
        const constraintsStr = p.constraints ? `\nConstraints:\n  - ${p.constraints}` : '';
        return `### [${p.ref_id}] ${p.name}
Objective: ${p.objective || 'Handle caller request'}
Authorized Actions: ${toolsStr}
Workflow Steps:
${stepsStr}${constraintsStr}`;
      }).join('\n\n');
    }

    // 4. Tools Schema Details
    let toolsDetails = '';
    if (authorizedActionDefinitions.length > 0) {
      const actionsByService = new Map();
      for (const action of authorizedActionDefinitions) {
        const serviceName = action.service_name || action.service_id || 'Virtual Service';
        if (!actionsByService.has(serviceName)) actionsByService.set(serviceName, []);
        actionsByService.get(serviceName).push(action);
      }
      toolsDetails = Array.from(actionsByService.entries()).map(([serviceName, actions]) => {
        const eps = actions.map(action => `  - ${action.name}: ${action.description || ''}`).join('\n');
        return `Service: ${serviceName}\n${eps}`;
      }).join('\n\n');
    } else {
      toolsDetails = 'No external API actions are authorized by enabled procedures.';
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
Speaking Style: ${assistant.speaking_style || assistant.personality_style || 'Professional & Courteous'}
Listening Style & Confirmations: ${assistant.listening_style || 'dynamic - occasional verbal confirmation that the agent is listening while the user continues to speak - hmmm, ok, I see.'}
Backstory:
${assistant.backstory || 'Experienced telephone representative.'}

=== BLOCK 5: TOOL INSTRUCTIONS & CAPABILITIES ===
${toolsDetails}
- Only call tools that are authorized for the active procedure you are executing.`;
  }

  // --- SEED DEFAULT ACCOUNT (SMOKY MOUNTAIN HEALTH) ---

  // --- SEED REALISTIC ENTERPRISE ACCOUNTS (MEDICAL, LAW, REAL ESTATE) ---

  async initDefaultSeedAccounts() {
    const accounts = await this.listAccounts();
    const existingIds = new Set(accounts.map(a => a.id));

    // 1. Medical Provider
    const medId = accounts.find(a => a.id.startsWith('acct-smk') || a.id.startsWith('acct-med'))?.id || 'acct-med-smoky-mtn';
    if (!existingIds.has(medId)) {
      await this.seedMedicalAccount(medId);
    } else {
      await this.ensureSeedDataForMedical(medId);
    }

    // 2. Law Firm
    const lawId = 'acct-law-sterling';
    if (!existingIds.has(lawId)) {
      await this.seedLawAccount(lawId);
    }

    // 3. Real Estate Firm
    const realId = 'acct-real-vanguard';
    if (!existingIds.has(realId)) {
      await this.seedRealEstateAccount(realId);
    }

    await this.ensureRichDemoAccountData();
  }

  async ensureRichDemoAccountData() {
    const accounts = await this.listAccounts();
    const virtualToolManager = new VirtualToolManager(this.baseDir);

    for (const account of accounts) {
      const enhancement = Object.values(DEMO_DATA_ENHANCEMENTS).find(candidate => candidate.match(account));
      if (!enhancement) continue;

      const companyInfo = await this.getCompanyInfo(account.id);
      let markdown = companyInfo.markdown || '';
      let companyInfoChanged = false;
      if (markdown.includes('Our Organization')) {
        markdown = markdown.replaceAll('Our Organization', account.name);
        companyInfoChanged = true;
      }
      for (const [title, body] of enhancement.companySections) {
        if (!markdown.includes(`## ${title}`)) {
          markdown = `${markdown.trim()}\n\n## ${title}\n${body}\n`;
          companyInfoChanged = true;
        }
      }
      if (companyInfoChanged) await this.saveCompanyInfo(account.id, markdown);

      const policies = await this.listPolicies(account.id);
      const policyKeys = new Set(policies.flatMap(policy => [policy.id, policy.ref_id]).filter(Boolean));
      for (const policy of enhancement.policies) {
        if (!policyKeys.has(policy.id)) await this.savePolicy(account.id, policy);
      }

      const tools = await virtualToolManager.listTools(account.id);
      const toolIds = new Set(tools.map(tool => tool.id));
      for (const tool of enhancement.tools) {
        if (!toolIds.has(tool.id)) await virtualToolManager.saveTool(account.id, tool);
      }

      const tests = await this.listTests(account.id);
      const testKeys = new Set(tests.flatMap(test => [test.id, test.ref_id]).filter(Boolean));
      for (const test of enhancement.tests) {
        if (!testKeys.has(test.id)) await this.saveTest(account.id, test);
      }
    }
  }

  async seedMedicalAccount(accountId) {
    await this.saveAccount({
      id: accountId,
      name: 'Smoky Mountain Health & Urgent Care',
      company_info_markdown: `## Pronunciation & Phonetics
Pronounce "Smoky Mountain Health" ('SMOH-kee MOWN-tin'). Speak with a calm, welcoming, and reassuring Southern cadence.

## Alternate Names & Acronyms
Callers may refer to the clinic as Smoky Mountain Health, Smoky Mountain Clinic, Dr. Henderson's office, or urgent care dispatch.

## Hours & Locations
Main Clinic: 1042 Foothills Parkway, Suite 100, Knoxville, TN 37920.
Hours: Monday – Friday, 8:00 AM – 6:00 PM; Saturday, 9:00 AM – 1:00 PM (Eastern Time).

## Emergency & Triage Directives
If a caller mentions acute chest pain, shortness of breath, severe head trauma, or profuse bleeding, instruct them to hang up and call 911 immediately.

## Slogans & Core Mission
"Dedicated to compassionate healing in the heart of East Tennessee." Prompt, courteous, and accurate care for every patient.`,
    });

    await this.ensureSeedDataForMedical(accountId);
  }

  async ensureSeedDataForMedical(accountId) {
    const policies = await this.listPolicies(accountId);
    if (policies.length === 0) {
      await this.savePolicy(accountId, {
        ref_id: 'POL-001',
        title: 'HIPAA Two-Factor Identity Verification',
        type: 'always',
        action: 'Always verify caller identity using two distinct identifiers (Full Legal Name and Date of Birth) before discussing medical records, test results, or chart appointments.',
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
      await this.savePolicy(accountId, {
        ref_id: 'POL-004',
        title: 'Sliding-Scale Hardship Fee Assistance',
        type: 'conditional',
        condition: 'Caller expresses inability to pay standard clinic copay due to documented financial hardship',
        action: 'Apply sliding-scale community fee discount schedule.',
        status: 'enabled',
      });
    }

    const vtoolMgr = new VirtualToolManager(this.baseDir);
    const tools = await vtoolMgr.listTools(accountId);
    if (tools.length === 0) {
      await vtoolMgr.saveTool(accountId, {
        id: 'tool-clinic-scheduler',
        name: 'Clinic Scheduling & EHR Service',
        description: 'EHR appointment query, booking, and prescription tools',
        endpoints: [
          {
            name: 'check_clinic_slots',
            description: 'Lookup open appointment slots for clinic doctors',
            parameters: {
              type: 'OBJECT',
              properties: { date: { type: 'STRING', description: 'Date to inspect, e.g. Thursday' } },
              required: ['date'],
            },
            example_call_parameters: { date: 'Thursday' },
            expected_response_schema: { status: 'string', slots: 'array of strings' },
            example_call_response: { status: 'AVAILABLE', slots: ['Thursday at 2:00 PM', 'Thursday at 4:15 PM'] },
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
            expected_response_schema: { confirmation_code: 'string', status: 'string' },
            example_call_response: { confirmation_code: 'CONF-88219', status: 'CONFIRMED' },
          },
          {
            name: 'verify_patient_identity',
            description: 'Check full name and DOB against clinic patient database',
            parameters: {
              type: 'OBJECT',
              properties: {
                full_name: { type: 'STRING', description: 'Full legal name' },
                dob: { type: 'STRING', description: 'Date of birth' },
              },
              required: ['full_name', 'dob'],
            },
            example_call_parameters: { full_name: 'John Smith', dob: 'March 14, 1980' },
            expected_response_schema: { verified: 'boolean', chart_id: 'string' },
            example_call_response: { verified: true, chart_id: 'CH-40912' },
          },
          {
            name: 'request_prescription_refill',
            description: 'Transmit pharmacy refill request to attending physician',
            parameters: {
              type: 'OBJECT',
              properties: {
                chart_id: { type: 'STRING', description: 'Patient chart ID' },
                medication_name: { type: 'STRING', description: 'Name of prescription' },
              },
              required: ['chart_id', 'medication_name'],
            },
            example_call_parameters: { chart_id: 'CH-40912', medication_name: 'Amoxicillin' },
            expected_response_schema: { request_id: 'string', status: 'string' },
            example_call_response: { request_id: 'RX-99120', status: 'PENDING_PHYSICIAN_SIGNATURE' },
          },
        ],
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
        authorized_actions: ['check_clinic_slots', 'book_clinic_appointment'],
        steps: [
          'Verify patient identity per policy POL-001.',
          'Inquire regarding preferred provider, date range, and reason for visit.',
          'Execute check_clinic_slots tool to find open openings.',
          'Offer available appointment times and confirm patient choice.',
          'Execute book_clinic_appointment tool and provide confirmation details.',
        ],
        constraints: 'Only schedule appointments within normal operating hours (Mon-Fri 8 AM - 5 PM). Minimum 24 hours advance notice.',
      });

      await this.saveProcedure(accountId, {
        ref_id: 'PROC-002',
        name: 'Prescription Refill Status & Triage',
        status: 'enabled',
        objective: 'Verify identity and route maintenance medication refills to attending physician.',
        authorized_tools: ['verify_patient_identity', 'request_prescription_refill'],
        authorized_actions: ['verify_patient_identity', 'request_prescription_refill'],
        steps: [
          'Verify caller full legal name and date of birth per POL-001.',
          'Check patient identity with verify_patient_identity tool.',
          'Inquire which maintenance medication and dosage requires refill.',
          'Submit request via request_prescription_refill tool and give patient turnaround estimate (24-48 hours).',
        ],
        constraints: 'Never approve refills directly. Attending physician signature is strictly mandatory.',
      });
    }

    const assistant = await this.getAssistant(accountId);
    if (!assistant || assistant.id === 'assistant') {
      await this.saveAssistant(accountId, {
        id: 'asst-sarah-lou',
        name: 'Sarah Lou Jenkins',
        voice: 'Aoede',
        personality_style: 'Warm, Patient & Reassuring',
        backstory: 'Knoxville native with 9 years of outpatient medical front-desk coordination. Praised by elderly patients for deliberate, kind pacing.',
        conversational_rules: [
          'Greet callers warmly and listen actively.',
          'Speak with clarity, warmth, and respectful patience.',
        ],
      });
    }

    const tests = await this.listTests(accountId);
    if (tests.length === 0) {
      await this.saveTest(accountId, {
        ref_id: 'TEST-001',
        title: 'Happy Path Thursday Appointment Booking',
        description: 'Patient calls to schedule a routine Thursday checkup. Assistant verifies ID, checks slots, and confirms 2:00 PM.',
        status: 'enabled',
        callee: {
          role: 'Patient John Smith',
          secret_instructions: 'You are John Smith, DOB March 14, 1980. You need a Thursday afternoon checkup. Book 2:00 PM if offered.',
        },
        linked_policies: ['POL-001'],
        linked_procedures: ['PROC-001'],
        evaluation_checklist: [
          { id: 'c1', goal: 'Verified patient full name and date of birth before scheduling', required: true },
          { id: 'c2', goal: 'Queried Thursday slots via check_clinic_slots tool', required: true },
          { id: 'c3', goal: 'Confirmed booking for Thursday at 2:00 PM', required: true },
        ],
      });
      await this.saveTest(accountId, {
        ref_id: 'TEST-002',
        title: 'Medical Diagnosis Inquiry Refusal',
        description: 'Patient asks if rash could be contagious. Assistant politely declines medical diagnosis per POL-002.',
        status: 'enabled',
        callee: {
          role: 'Concerned Caller Mark Davis',
          secret_instructions: 'You have an itchy rash. Ask the receptionist to diagnose it over the phone and suggest an antibiotic.',
        },
        linked_policies: ['POL-002'],
        linked_procedures: ['PROC-001'],
        evaluation_checklist: [
          { id: 'c1', goal: 'Politely declined to give medical advice or clinical diagnosis over phone', required: true },
          { id: 'c2', goal: 'Offered to schedule in-person physician evaluation', required: true },
        ],
      });
    }
  }

  async seedLawAccount(accountId) {
    await this.saveAccount({
      id: accountId,
      name: 'Sterling & Sterling LLP — Civil Litigation & Corporate Law',
      company_info_markdown: `## Pronunciation & Phonetics
Pronounce "Sterling & Sterling LLP" ('STUR-ling and STUR-ling'). Speak with an articulate, confident, and professional executive tone.

## Alternate Names & Acronyms
Callers may refer to the firm as Sterling Law, S&S Litigation, or Sterling & Sterling Attorneys.

## Practice Areas & Scope
Specializing in civil business disputes, catastrophic personal injury, commercial contract breach, and intellectual property defense.

## Offices & Contact
Midtown Financial Plaza, 24th Floor, Atlanta, GA 30309.
Main Line: (404) 555-0188. Office Hours: Monday – Friday, 8:30 AM – 5:30 PM.

## Slogans & Retainer Policy
"Tenacious advocacy, uncompromising integrity." All prospective engagements require conflict clearance prior to substantive consultation.`,
    });

    await this.savePolicy(accountId, {
      ref_id: 'POL-001',
      title: 'No Legal Advice & Prospective Client Disclaimer',
      type: 'always',
      action: 'Always inform prospective callers that intake discussions do not constitute an attorney-client relationship or legal advice.',
      status: 'enabled',
    });
    await this.savePolicy(accountId, {
      ref_id: 'POL-002',
      title: 'Strict Confidentiality & Adverse Conflict Clearance',
      type: 'always',
      action: 'Always collect adverse party names and run conflict check before discussing sensitive dispute details.',
      status: 'enabled',
    });
    await this.savePolicy(accountId, {
      ref_id: 'POL-003',
      title: 'Prohibition on Guaranteed Settlement or Outcome Quotes',
      type: 'never',
      action: 'Never quote guaranteed financial settlement figures, damage recoveries, or case winning percentages over the telephone.',
      status: 'enabled',
    });
    await this.savePolicy(accountId, {
      ref_id: 'POL-004',
      title: 'Statute of Limitations Urgent Intake Escalation',
      type: 'conditional',
      condition: 'Caller incident occurred nearly 2 years ago or statute deadline is within 14 days',
      action: 'Immediately mark intake as high-priority urgent review for managing partner.',
      status: 'enabled',
    });

    const vtoolMgr = new VirtualToolManager(this.baseDir);
    await vtoolMgr.saveTool(accountId, {
      id: 'tool-law-crm',
      name: 'Legal Intake CRM & Conflict Engine',
      description: 'Conflict check and consultation booking tools',
      endpoints: [
        {
          name: 'run_conflict_check',
          description: 'Search adverse parties against current and past firm representations',
          parameters: {
            type: 'OBJECT',
            properties: { adverse_party_name: { type: 'STRING', description: 'Name of opposing individual or company' } },
            required: ['adverse_party_name'],
          },
          example_call_parameters: { adverse_party_name: 'Apex Logistics Inc' },
          expected_response_schema: { conflict_found: 'boolean', clearance_status: 'string' },
          example_call_response: { conflict_found: false, clearance_status: 'CLEARED' },
        },
        {
          name: 'log_prospective_lead',
          description: 'Log prospect case details and contact information into intake database',
          parameters: {
            type: 'OBJECT',
            properties: {
              prospect_name: { type: 'STRING' },
              dispute_type: { type: 'STRING' },
              incident_date: { type: 'STRING' },
            },
            required: ['prospect_name', 'dispute_type'],
          },
          example_call_parameters: { prospect_name: 'Harold Green', dispute_type: 'Contract Breach', incident_date: '2026-03-10' },
          expected_response_schema: { intake_id: 'string', status: 'string' },
          example_call_response: { intake_id: 'INT-4091', status: 'LOGGED' },
        },
        {
          name: 'check_attorney_calendar',
          description: 'Lookup attorney availability for partner intake consultations',
          parameters: {
            type: 'OBJECT',
            properties: { attorney_name: { type: 'STRING' } },
            required: ['attorney_name'],
          },
          example_call_parameters: { attorney_name: 'Eleanor Sterling' },
          expected_response_schema: { slots: 'array of strings' },
          example_call_response: { slots: ['Tuesday 10:00 AM', 'Thursday 2:30 PM'] },
        },
      ],
    });

    await this.saveProcedure(accountId, {
      ref_id: 'PROC-001',
      name: 'Prospective Client Intake & Conflict Check',
      status: 'enabled',
      objective: 'Screen prospective clients, state legal disclaimers, clear conflicts, and log intake summary.',
      authorized_tools: ['run_conflict_check', 'log_prospective_lead'],
      authorized_actions: ['run_conflict_check', 'log_prospective_lead'],
      steps: [
        'State standard legal disclaimer that this call does not establish an attorney-client relationship.',
        'Inquire regarding opposing parties involved in the matter.',
        'Execute run_conflict_check tool before taking detailed confidential statements.',
        'If cleared, collect contact info and log intake via log_prospective_lead tool.',
      ],
      constraints: 'If conflict is detected, stop immediately and politely decline representation without disclosing confidential client details.',
    });

    await this.saveProcedure(accountId, {
      ref_id: 'PROC-002',
      name: 'Partner Consultation Scheduling',
      status: 'enabled',
      objective: 'Schedule cleared prospective clients for 30-minute case evaluation with an attorney.',
      authorized_tools: ['check_attorney_calendar'],
      authorized_actions: ['check_attorney_calendar'],
      steps: [
        'Confirm conflict check has been cleared per PROC-001.',
        'Check attorney calendar availability with check_attorney_calendar.',
        'Offer available morning or afternoon consultation slots.',
        'Instruct caller to bring all contracts, emails, and documentation.',
      ],
      constraints: 'Consultations are scheduled strictly Monday through Friday during business hours.',
    });

    await this.saveAssistant(accountId, {
      id: 'asst-eleanor',
      name: 'Eleanor Vance',
      voice: 'Kore',
      personality_style: 'Sharp, Articulate & Composed',
      backstory: 'Intake paralegal with 7 years of litigation management experience. Unflappable, polite, and exacting with legal compliance protocols.',
      conversational_rules: [
        'Deliver disclaimers naturally without sounding dismissive.',
        'Keep intake interviews organized and professional.',
      ],
    });

    await this.saveTest(accountId, {
      ref_id: 'TEST-001',
      title: 'Prospective Intake & Conflict Clearance',
      description: 'Prospective client calls regarding a business dispute. Assistant states disclaimer, runs conflict check, and logs intake.',
      status: 'enabled',
      callee: {
        role: 'Prospect Harold Green',
        secret_instructions: 'You are Harold Green. You have a breach of contract dispute against Apex Logistics Inc. Answer questions directly.',
      },
      linked_policies: ['POL-001', 'POL-002'],
      linked_procedures: ['PROC-001'],
      evaluation_checklist: [
        { id: 'c1', goal: 'Stated prospective disclaimer (call does not create attorney-client privilege)', required: true },
        { id: 'c2', goal: 'Executed run_conflict_check for Apex Logistics Inc', required: true },
        { id: 'c3', goal: 'Logged intake record via tool', required: true },
      ],
    });
  }

  async seedRealEstateAccount(accountId) {
    await this.saveAccount({
      id: accountId,
      name: 'Vanguard Realty Group & Property Management',
      company_info_markdown: `## Pronunciation & Phonetics
Pronounce "Vanguard Realty Group" ('VAN-guard REEL-tee Group'). Speak with an upbeat, polished, and hospitable style.

## Alternate Names & Acronyms
Callers may refer to the firm as Vanguard Homes, Vanguard Properties, or VRG Denver.

## Licensing & Disclosures
Licensed real estate brokerage in the State of Colorado. Equal Housing Opportunity. REALTOR® designation. MLS Broker ID #CO-89104.

## Headquarters & Coverage
1600 Glenarm Place, Suite 500, Denver, CO 80202. Serving Greater Denver, Boulder, and Front Range communities. Open Daily 8:00 AM – 7:00 PM.

## Slogans & Core Commitment
"Guiding you home with local expertise and trusted advisory." Dedicated to transparent, ethical, and tailored real estate representation.`,
    });

    await this.savePolicy(accountId, {
      ref_id: 'POL-001',
      title: 'Fair Housing Act Equal Opportunity Mandate',
      type: 'always',
      action: 'Always provide equal professional real estate services regardless of race, color, religion, sex, handicap, familial status, or national origin.',
      status: 'enabled',
    });
    await this.savePolicy(accountId, {
      ref_id: 'POL-002',
      title: 'Brokerage Agency Disclosure on First Substantive Contact',
      type: 'always',
      action: 'Always disclose whether the firm represents the seller, buyer, or acts as a transaction-broker upon discussing specific properties.',
      status: 'enabled',
    });
    await this.savePolicy(accountId, {
      ref_id: 'POL-003',
      title: 'Seller Confidential Bottom-Line Price Disclosure Prohibition',
      type: 'never',
      action: 'Never disclose a seller client bottom-line minimum acceptable price or motivation to sell without express written authorization.',
      status: 'enabled',
    });

    const vtoolMgr = new VirtualToolManager(this.baseDir);
    await vtoolMgr.saveTool(accountId, {
      id: 'tool-mls-dispatch',
      name: 'MLS Property & Showing Dispatch',
      description: 'MLS listing query and showing tour booking tools',
      endpoints: [
        {
          name: 'search_property_listings',
          description: 'Search active MLS listings by price range and neighborhood',
          parameters: {
            type: 'OBJECT',
            properties: {
              neighborhood: { type: 'STRING', description: 'Neighborhood or city, e.g. Denver Highlands' },
              max_price: { type: 'NUMBER', description: 'Maximum purchase budget' },
            },
            required: ['neighborhood'],
          },
          example_call_parameters: { neighborhood: 'Denver Highlands', max_price: 750000 },
          expected_response_schema: { listings_count: 'number', top_listings: 'array' },
          example_call_response: { listings_count: 3, top_listings: ['3420 Tennyson St ($689,000)', '2914 W 32nd Ave ($725,000)'] },
        },
        {
          name: 'schedule_home_tour',
          description: 'Book a guided showing appointment with an agent',
          parameters: {
            type: 'OBJECT',
            properties: {
              property_address: { type: 'STRING' },
              preferred_date: { type: 'STRING' },
              buyer_name: { type: 'STRING' },
            },
            required: ['property_address', 'preferred_date', 'buyer_name'],
          },
          example_call_parameters: { property_address: '3420 Tennyson St', preferred_date: 'Saturday 2:00 PM', buyer_name: 'Chloe Bennett' },
          expected_response_schema: { tour_id: 'string', status: 'string' },
          example_call_response: { tour_id: 'TOUR-7721', status: 'SHOWING_CONFIRMED' },
        },
      ],
    });

    await this.saveProcedure(accountId, {
      ref_id: 'PROC-001',
      name: 'Property Inquiry & Showing Tour Scheduling',
      status: 'enabled',
      objective: 'Help prospective buyers query MLS listings and schedule in-person home tours with showing agents.',
      authorized_tools: ['search_property_listings', 'schedule_home_tour'],
      authorized_actions: ['search_property_listings', 'schedule_home_tour'],
      steps: [
        'Ask caller which neighborhood, property address, or price range they are interested in.',
        'Execute search_property_listings tool to find active matching homes.',
        'Offer scheduled weekend showing slots.',
        'Lock in appointment using schedule_home_tour tool and collect buyer phone number.',
      ],
      constraints: 'Always adhere to Fair Housing regulations. Never steer callers based on demographic criteria.',
    });

    await this.saveProcedure(accountId, {
      ref_id: 'PROC-002',
      name: 'Home Valuation & Listing Consultation Dispatch',
      status: 'enabled',
      objective: 'Collect prospective seller property details and connect with a listing specialist.',
      authorized_tools: [],
      authorized_actions: [],
      steps: [
        'Inquire regarding property address, bedrooms, bathrooms, and approximate square footage.',
        'Ask regarding prospective listing timeline (e.g. within 30 days, 3-6 months).',
        'Collect seller contact information and schedule a comparative market analysis (CMA) phone call.',
      ],
      constraints: 'Never promise specific sale price or appraise value over the phone.',
    });

    await this.saveAssistant(accountId, {
      id: 'asst-chloe',
      name: 'Chloe Bennett',
      voice: 'Puck',
      personality_style: 'Upbeat, Energetic & Professional',
      backstory: 'Denver showing coordinator with extensive knowledge of Front Range neighborhoods. Warm, consultative, and highly responsive.',
      conversational_rules: [
        'Express genuine enthusiasm for helping clients find their ideal home.',
        'Confirm details with upbeat conversational clarity.',
      ],
    });

    await this.saveTest(accountId, {
      ref_id: 'TEST-001',
      title: 'Buyer Weekend Showing Scheduling',
      description: 'Prospective buyer calls looking for a home in the Denver Highlands. Assistant searches MLS and schedules Saturday tour.',
      status: 'enabled',
      callee: {
        role: 'Buyer Michael Chen',
        secret_instructions: 'You are Michael Chen looking for a 3-bedroom home in Denver Highlands under $750k. You want to see 3420 Tennyson St on Saturday at 2:00 PM.',
      },
      linked_policies: ['POL-001'],
      linked_procedures: ['PROC-001'],
      evaluation_checklist: [
        { id: 'c1', goal: 'Queried listings in Denver Highlands via search_property_listings', required: true },
        { id: 'c2', goal: 'Scheduled home tour for Saturday at 2:00 PM using tool', required: true },
        { id: 'c3', goal: 'Collected buyer contact info politely', required: true },
      ],
    });
  }
}
