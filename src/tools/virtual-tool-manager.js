/**
 * Virtual Tool Manager for Talk Dojo
 * Manages Grouped Service Stubs with MCP-compatible endpoint schemas, expected parameters,
 * explicit example call parameters, and explicit example call responses.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { config } from '../config.js';

export class VirtualToolManager {
  constructor(baseDir = 'data/accounts') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  getToolsDir(accountId) {
    return path.join(this.baseDir, accountId, 'virtual-tools');
  }

  normalizeEndpoint(ep) {
    return {
      name: ep.name || 'unnamed_endpoint',
      description: ep.description || '',
      parameters: ep.parameters || { type: 'OBJECT', properties: {} },
      example_call_parameters: ep.example_call_parameters || ep.example_call || {},
      expected_response_schema: ep.expected_response_schema || { status: 'string' },
      example_call_response: ep.example_call_response || ep.example_response || { status: 'SUCCESS' },
    };
  }

  async listTools(accountId) {
    const dir = this.getToolsDir(accountId);
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      const tools = [];
      for (const f of yamlFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const data = yaml.parse(raw);
          data.id = data.id || path.basename(f, path.extname(f));
          data.endpoints = (data.endpoints || []).map(ep => this.normalizeEndpoint(ep));
          tools.push(data);
        } catch (e) {}
      }
      return tools;
    } catch (e) {
      return [];
    }
  }

  async getTool(accountId, toolId) {
    const file = path.join(this.getToolsDir(accountId), `${toolId}.yaml`);
    const raw = await fs.readFile(file, 'utf8');
    const data = yaml.parse(raw);
    data.id = toolId;
    data.endpoints = (data.endpoints || []).map(ep => this.normalizeEndpoint(ep));
    return data;
  }

  async saveTool(accountId, toolData) {
    const id = toolData.id || (toolData.name ? toolData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : `tool-${Date.now().toString(36)}`);
    const dir = this.getToolsDir(accountId);
    await fs.mkdir(dir, { recursive: true });

    const normalizedEndpoints = (toolData.endpoints || []).map(ep => this.normalizeEndpoint(ep));

    const payload = {
      id,
      name: toolData.name || 'Custom Service',
      description: toolData.description || '',
      endpoints: normalizedEndpoints,
      created_at: toolData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(path.join(dir, `${id}.yaml`), yaml.stringify(payload), 'utf8');
    return payload;
  }

  async deleteTool(accountId, toolId) {
    const file = path.join(this.getToolsDir(accountId), `${toolId}.yaml`);
    await fs.unlink(file);
    return { success: true };
  }

  /**
   * AI-Assisted Tool Authoring: Generates MCP-like endpoints with explicit parameter schemas,
   * example call parameters, expected response schemas, and example call responses.
   */
  async generateToolStubFromDescription(prompt, apiKey = config.geminiApiKey) {
    const fallback = this.getFallbackToolStub(prompt);
    if (!apiKey) return fallback;

    const systemPrompt = `You are a Principal API & MCP (Model Context Protocol) Architect.
The user is describing virtual tools their AI voice assistant needs to access on phone calls.
Generate a comprehensive Grouped Service Stub with endpoints, explicit parameter schemas, realistic example call parameters, expected response schemas, and realistic example call responses.

### USER DESCRIPTION:
"${prompt}"

### OUTPUT STRICT VALID JSON:
{
  "name": string (e.g. "Clinic EHR & Scheduling Service"),
  "description": string,
  "endpoints": [
    {
      "name": string (snake_case function name, e.g. "check_doctor_availability"),
      "description": string (clear instruction of when and how the assistant should call this endpoint),
      "parameters": {
        "type": "OBJECT",
        "properties": {
          "doctor_name": { "type": "STRING", "description": "Full name of doctor" },
          "date_range": { "type": "STRING", "description": "Relative or specific dates, e.g. Next Week" }
        },
        "required": ["doctor_name"]
      },
      "example_call_parameters": {
        "doctor_name": "Dr. Meredith Grey",
        "date_range": "Tomorrow afternoon"
      },
      "expected_response_schema": {
        "status": "string",
        "slots": "array of strings"
      },
      "example_call_response": {
        "status": "AVAILABLE",
        "slots": ["Tomorrow at 2:00 PM", "Tomorrow at 4:15 PM"]
      }
    }
  ]
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText || '{}');
      if (parsed.name && Array.isArray(parsed.endpoints)) {
        parsed.endpoints = parsed.endpoints.map(ep => this.normalizeEndpoint(ep));
        return parsed;
      }
      return fallback;
    } catch (e) {
      console.warn('AI tool generation failed, using fallback:', e.message);
      return fallback;
    }
  }

  getFallbackToolStub(prompt = '') {
    const slug = prompt.toLowerCase();
    if (slug.includes('calendar') || slug.includes('schedul') || slug.includes('appointment') || slug.includes('clinic')) {
      return {
        name: 'Clinic EHR & Scheduling Service',
        description: 'Virtual stub for practice management, calendar appointments, and patient charts.',
        endpoints: [
          {
            name: 'check_doctor_availability',
            description: 'Look up open appointment slots for a specific physician using relative dates.',
            parameters: {
              type: 'OBJECT',
              properties: {
                doctor_name: { type: 'STRING', description: 'Name of the physician' },
                preferred_range: { type: 'STRING', description: 'e.g. Next Week or Tomorrow' },
              },
              required: ['doctor_name'],
            },
            example_call_parameters: { doctor_name: 'Dr. Sarah Adams', preferred_range: 'Next Week' },
            expected_response_schema: { available_slots: 'array of strings' },
            example_call_response: { available_slots: ['Tomorrow at 2:00 PM', 'Next Tuesday at 10:00 AM', 'Next Wednesday at 3:15 PM'] },
          },
          {
            name: 'book_clinic_appointment',
            description: 'Lock in and confirm an appointment slot in the practice management database.',
            parameters: {
              type: 'OBJECT',
              properties: {
                doctor_name: { type: 'STRING' },
                date: { type: 'STRING', description: 'e.g. Next Wednesday' },
                time: { type: 'STRING', description: 'e.g. 3:15 PM' },
                patient_name: { type: 'STRING' },
              },
              required: ['doctor_name', 'date', 'time', 'patient_name'],
            },
            example_call_parameters: { doctor_name: 'Dr. Sarah Adams', date: 'Next Wednesday', time: '3:15 PM', patient_name: 'John Smith' },
            expected_response_schema: { status: 'string', booking_id: 'string' },
            example_call_response: { status: 'CONFIRMED', booking_id: 'APT-94812', timestamp: 'Next Wednesday at 3:15 PM' },
          },
        ],
      };
    }

    return {
      name: 'Custom Virtual Service',
      description: prompt || 'Custom enterprise tool stub for virtual integrations.',
      endpoints: [
        {
          name: 'query_account_records',
          description: 'Fetch customer account records and current standing.',
          parameters: {
            type: 'OBJECT',
            properties: {
              account_id: { type: 'STRING' },
            },
            required: ['account_id'],
          },
          example_call_parameters: { account_id: 'ACC-12345' },
          expected_response_schema: { status: 'string', balance: 'number' },
          example_call_response: { status: 'ACTIVE', balance: 0.00 },
        },
      ],
    };
  }
}
