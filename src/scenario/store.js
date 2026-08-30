import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { config } from '../config.js';

export class ScenarioStore {
  constructor(scenariosDir = config.scenariosDir) {
    this.scenariosDir = scenariosDir;
  }

  /**
   * Ensure directory exists and populate starter scenarios if empty
   */
  async init() {
    await fs.mkdir(this.scenariosDir, { recursive: true });
    await fs.mkdir(config.runsDir, { recursive: true });

    const files = await fs.readdir(this.scenariosDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    if (yamlFiles.length === 0) {
      await this.seedStarterScenarios();
    }
  }

  /**
   * Get all scenario metadata
   */
  async listScenarios() {
    await this.init();
    const files = await fs.readdir(this.scenariosDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    const list = [];
    for (const filename of yamlFiles) {
      try {
        const fullPath = path.join(this.scenariosDir, filename);
        const content = await fs.readFile(fullPath, 'utf8');
        const parsed = YAML.parse(content);
        if (parsed && parsed.id) {
          list.push({
            id: parsed.id,
            filename,
            title: parsed.title || parsed.id,
            description: parsed.description || '',
            language: parsed.language || 'en',
            category: parsed.category || 'general',
            impairments: parsed.impairments || { static_level: 0, target: 'none' },
            callerRole: parsed.caller?.role || 'Caller',
            calleeRole: parsed.callee?.role || 'Callee',
            checklistCount: Array.isArray(parsed.evaluation_checklist) ? parsed.evaluation_checklist.length : 0,
          });
        }
      } catch (err) {
        console.error(`Error loading scenario file ${filename}:`, err);
      }
    }
    return list;
  }

  /**
   * Get full scenario object by ID
   */
  async getScenario(id) {
    await this.init();
    const files = await fs.readdir(this.scenariosDir);
    for (const filename of files) {
      if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) continue;
      const fullPath = path.join(this.scenariosDir, filename);
      const content = await fs.readFile(fullPath, 'utf8');
      const parsed = YAML.parse(content);
      if (parsed && parsed.id === id) {
        return {
          ...parsed,
          _rawYaml: content,
          _filename: filename,
        };
      }
    }
    return null;
  }

  /**
   * Save scenario (from raw YAML or JS object)
   */
  async saveScenario(scenarioData, rawYaml = null) {
    await fs.mkdir(this.scenariosDir, { recursive: true });
    let id = scenarioData.id;
    if (!id) {
      id = 'scenario-' + Date.now();
      scenarioData.id = id;
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const filename = `${safeId}.yaml`;
    const fullPath = path.join(this.scenariosDir, filename);

    const contentToWrite = rawYaml || YAML.stringify(scenarioData);
    await fs.writeFile(fullPath, contentToWrite, 'utf8');

    return { id: safeId, filename };
  }

  /**
   * Delete a scenario
   */
  async deleteScenario(id) {
    const scenario = await this.getScenario(id);
    if (!scenario || !scenario._filename) {
      return false;
    }
    const fullPath = path.join(this.scenariosDir, scenario._filename);
    await fs.unlink(fullPath);
    return true;
  }

  /**
   * Create seed scenarios to get started immediately
   */
  async seedStarterScenarios() {
    const seedMedical = {
      id: 'medical-appointment-01',
      title: "Clinic Outbound Appointment Confirmation",
      description: "Medical secretary calls patient to confirm Thursday cardiology appointment and collect missing insurance & address info.",
      language: 'en',
      impairments: {
        static_level: 0.15,
        target: 'callee_only',
        apply_bandpass: true,
      },
      caller: {
        role: "Medical Clinic Secretary (Sarah)",
        voice: "Aoede",
        initial_greeting: "Hello, is this John Smith? This is Sarah calling from Dr. Henderson's cardiology clinic.",
        system_instruction: `You are Sarah, a professional, warm medical receptionist at Dr. Henderson's cardiology clinic.
Your objective on this telephone call:
1. Confirm John Smith's appointment for this Thursday at 2:00 PM.
2. Inform him that he needs to arrive 15 minutes early with his ID.
3. Verify his current home address and insurance provider.
4. If he asks about fasting, inform him that he should fast (water only) for 4 hours prior to the appointment.
Keep your responses conversational, natural, brief, and courteous like a real phone receptionist.`
      },
      callee: {
        role: "Patient (John Smith)",
        voice: "Fenrir",
        system_instruction: `You are John Smith answering your mobile phone. You are busy at work.
When the receptionist introduces herself:
1. Confirm that you are John Smith.
2. Confirm the appointment for Thursday at 2:00 PM.
3. Your address is 742 Evergreen Terrace and your insurance carrier is Blue Shield.
4. Explicitly ask: "Do I need to fast or skip breakfast for this test?"
5. If the connection sounds a little crackly, mention: "The line was a bit fuzzy, could you repeat that?" if needed.
Keep your responses brief and natural as a customer on a mobile phone call.`
      },
      evaluation_checklist: [
        {
          id: "verify_identity",
          goal: "Confirm speaking with patient John Smith",
          required: true
        },
        {
          id: "confirm_datetime",
          goal: "Confirm appointment for Thursday at 2:00 PM",
          required: true
        },
        {
          id: "arrive_early_instruction",
          goal: "Instruct patient to arrive 15 minutes early with ID",
          required: true
        },
        {
          id: "collect_address",
          goal: "Collect/verify patient address (742 Evergreen Terrace)",
          required: true
        },
        {
          id: "collect_insurance",
          goal: "Collect/verify insurance provider (Blue Shield)",
          required: true
        },
        {
          id: "answer_fasting",
          goal: "Provide clear fasting instructions (4 hours prior, water only)",
          required: true
        }
      ]
    };

    const seedSpanish = {
      id: 'spanish-utility-billing-02',
      title: "Spanish Customer Service: High Water Bill Inquiry",
      description: "Spanish-speaking customer calls municipal water utility regarding an unexpectedly high water bill.",
      language: 'es',
      impairments: {
        static_level: 0.2,
        target: 'both',
        apply_bandpass: true,
      },
      caller: {
        role: "Cliente (Mateo Gómez)",
        voice: "Puck",
        initial_greeting: "Hola, buenos días. Llamo porque recibí una factura de agua altísima y creo que hay un error.",
        system_instruction: `Eres Mateo Gómez, un cliente preocupado que llama a la compañía de agua municipal.
Hablas en español.
Tu número de cuenta es 9845-22.
Tu última factura fue de $240 dólares, cuando normalmente pagas $45.
No tienes fugas visibles en la casa.
Pide amablemente una revisión del medidor o un plan de pago.`
      },
      callee: {
        role: "Agente de Servicio al Cliente (Elena)",
        voice: "Kore",
        system_instruction: `Eres Elena, una representante de atención al cliente de la compañía de agua municipal.
Hablas un español profesional, empático y fluido.
Tu objetivo en esta llamada:
1. Saludar cortésmente al cliente.
2. Solicitar el número de cuenta y verificar su nombre.
3. Explicar posibles causas de consumo elevado (fugas ocultas en inodoros, riego).
4. Ofrecer enviar a un técnico para inspeccionar el medidor en un plazo de 48 horas.
5. Poner en espera el cobro hasta que concluya la inspección.
Sé empática, clara y concisa en el teléfono.`
      },
      evaluation_checklist: [
        {
          id: "spanish_fluency",
          goal: "Maintain natural, professional conversational Spanish throughout the call",
          required: true
        },
        {
          id: "account_number_collected",
          goal: "Request and obtain customer account number (9845-22)",
          required: true
        },
        {
          id: "empathy_shown",
          goal: "Acknowledge customer frustration regarding the unexpectedly high $240 bill",
          required: true
        },
        {
          id: "technician_inspection_offered",
          goal: "Offer technician meter inspection within 48 hours",
          required: true
        },
        {
          id: "billing_hold_offered",
          goal: "Place billing collection on temporary hold during investigation",
          required: true
        }
      ]
    };

    await this.saveScenario(seedMedical);
    await this.saveScenario(seedSpanish);
  }
}
