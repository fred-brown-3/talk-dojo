/**
 * Isolated Tool Execution Engine for Talk Dojo Telephone Agents
 * Manages agent toolbelts and private sandbox data stores.
 */

export class ToolExecutor {
  constructor(agentRole = 'agent', toolsConfig = [], initialData = {}) {
    this.agentRole = agentRole;
    this.toolsConfig = toolsConfig || [];
    // Deep clone initial data so each agent gets completely isolated state
    this.data = JSON.parse(JSON.stringify(initialData || {}));
    this.executionLog = [];
  }

  /**
   * Convert scenario tools configuration into Gemini functionDeclarations
   */
  getFunctionDeclarations() {
    if (!Array.isArray(this.toolsConfig) || this.toolsConfig.length === 0) {
      return [];
    }

    return this.toolsConfig.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {
        type: 'OBJECT',
        properties: {},
      },
    }));
  }

  /**
   * Execute a function call against this agent's isolated data
   */
  async execute(functionName, args = {}) {
    const timestamp = Date.now();
    let result = null;

    try {
      const toolDef = this.toolsConfig.find(t => t.name === functionName);
      if (!toolDef) {
        throw new Error(`Tool '${functionName}' is not available in ${this.agentRole}'s toolbelt.`);
      }

      // 1. Healthcare 2-Piece Identity Verification Protocol
      if (functionName === 'verify_patient_identity') {
        const fullName = (args.full_name || args.name || '').toLowerCase().trim();
        const dob = (args.dob || args.date_of_birth || '').toLowerCase().trim();
        const secondary = (args.secondary_id || args.address || args.ssn_last4 || '').toLowerCase().trim();

        const record = this.data.patient_record || {
          full_name: 'Johnathan Doe',
          dob: 'March 14, 1985',
          address: '742 Evergreen Terrace',
          ssn_last4: '4821',
        };

        const recName = (record.full_name || '').toLowerCase();
        const nameMatch = fullName.includes('john') || fullName.includes('doe') || recName.includes(fullName);
        const recDob = (record.dob || '').toLowerCase();
        const dobMatch = dob && (recDob.includes(dob) || dob.includes('1985') || dob.includes('march 14') || dob.includes('03/14/1985'));
        const secondaryMatch = secondary && (
          (record.address && record.address.toLowerCase().includes(secondary)) ||
          (record.ssn_last4 && record.ssn_last4.includes(secondary))
        );

        if (nameMatch && (dobMatch || secondaryMatch)) {
          result = {
            verified: true,
            status: 'IDENTITY_CONFIRMED',
            patient_id: record.patient_id || 'PAT-90210',
            patient_name: record.full_name,
            matched_criteria: ['full_legal_name', dobMatch ? 'date_of_birth' : 'secondary_identifier'],
            message: 'Identity verified according to healthcare 2-identifier protocol.'
          };
        } else {
          result = {
            verified: false,
            status: 'VERIFICATION_FAILED',
            message: 'Provided credentials do not match patient records. (Required: Full Legal Name + DOB or secondary identifier).'
          };
        }
      }

      // 2. Built-in Doctor & Clinic Schedule tools
      else if (functionName === 'check_doctor_availability' || functionName === 'check_clinic_schedule' || functionName === 'check_available_slots' || functionName === 'check_clinic_slots') {
        const doctor = args.doctor_name || args.doctor || 'Doctor Who';
        const slots = this.data.doctor_slots?.[doctor] || this.data.available_slots || [
          'Tomorrow at 2:00 PM',
          'Next Tuesday at 10:00 AM',
          'Next Wednesday at 3:15 PM'
        ];
        result = { doctor, available_slots: slots };
      }
      else if (functionName === 'book_clinic_appointment' || functionName === 'book_appointment' || functionName === 'reserve_slot') {
        const { date, time, patient_name, doctor_name, doctor, notes } = args;
        const targetDoctor = doctor_name || doctor || 'Doctor Who';
        if (!this.data.booked_appointments) this.data.booked_appointments = [];
        const booking = {
          booking_id: 'APPT-' + Math.floor(1000 + Math.random() * 9000),
          doctor: targetDoctor,
          date: date || 'Next Wednesday',
          time: time || '3:15 PM',
          patient_name: patient_name || 'Johnathan Doe',
          notes: notes || 'Rescheduled visit',
          confirmed_at: new Date().toISOString()
        };
        this.data.booked_appointments.push(booking);
        if (Array.isArray(this.data.available_slots)) {
          this.data.available_slots = this.data.available_slots.filter(s => !s.includes(time));
        }
        result = { success: true, status: 'CONFIRMED', message: `Confirmed appointment with ${targetDoctor} on ${date || 'Next Wednesday'} at ${time || '3:15 PM'}`, booking };
      }
      else if (functionName === 'check_personal_calendar' || functionName === 'view_my_schedule') {
        const day = args.relative_date || args.day || args.date || 'all';
        const events = this.data.calendar_events || {
          'Tomorrow': [{ time: '1:00 PM - 4:00 PM', title: 'Work Client Presentation', busy: true }],
          'Next Tuesday': [{ time: '9:30 AM - 11:30 AM', title: 'Dentist Cleaning', busy: true }],
          'Next Wednesday': [{ time: 'Afternoon', title: 'Completely Open', busy: false }]
        };
        result = { queried_date: day, schedule: events };
      }
      else if (functionName === 'add_personal_calendar_event' || functionName === 'add_calendar_event') {
        const date = args.date || args.relative_date || args.day || 'Next Wednesday';
        const time = args.time || '3:15 PM';
        const title = args.title || 'Doctor Who Appointment';
        if (!this.data.calendar_events_saved) this.data.calendar_events_saved = [];
        const newEvent = { date, time, title, busy: true, status: 'EVENT_CONFIRMED' };
        this.data.calendar_events_saved.push(newEvent);
        result = { success: true, status: 'EVENT_ADDED', message: `Added '${title}' on ${date} at ${time} to personal calendar`, event: newEvent };
      }

      // 2. Built-in Account / Verification tools
      else if (functionName === 'lookup_account' || functionName === 'verify_customer') {
        const account = this.data.customer_record || {
          account_number: args.account_number,
          status: 'Active',
          balance: '$120.00'
        };
        result = { found: true, account };
      }

      // 3. Custom scripted tools defined in YAML
      else if (toolDef.mock_return !== undefined) {
        result = typeof toolDef.mock_return === 'function' ? toolDef.mock_return(args, this.data) : toolDef.mock_return;
      }
      else {
        // Generic fallback inspection of isolated data
        const propName = functionName.replace(/^(get_|check_|lookup_)/, '');
        if (this.data[propName] !== undefined) {
          result = { [propName]: this.data[propName] };
        } else {
          result = { status: 'success', executed: functionName, params: args };
        }
      }
    } catch (err) {
      result = { error: err.message };
    }

    const logEntry = {
      timestamp,
      agentRole: this.agentRole,
      functionName,
      args,
      result,
    };
    this.executionLog.push(logEntry);
    return { output: result, logEntry };
  }
}
