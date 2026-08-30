export const doctorWhoFixture = {
  id: "doctor-who-reschedule-id-verify-08",
  title: "Doctor Who Appointment Rescheduling (Healthcare 2-Identifier Verification & Relative Calendar Sync)",
  description: "Sarah calls patient Johnathan Doe to reschedule an upcoming appointment with Doctor Who using strict 3-phase outbound healthcare workflow.",
  category: "healthcare_compliance",
  language: "en",
  caller: {
    role: "Clinic Secretary (Sarah)",
    voice: "Aoede",
    initial_greeting: "Hello, this is Sarah from Medical Associates Clinic. May I please speak with Johnathan Doe?",
    tools: [
      {
        name: "verify_patient_identity",
        description: "Verify patient identity against clinic EHR database using 2-identifier protocol",
        parameters: {
          type: "OBJECT",
          properties: {
            full_name: { type: "STRING" },
            dob: { type: "STRING" },
            secondary_id: { type: "STRING" }
          },
          required: ["full_name"]
        }
      },
      {
        name: "check_doctor_availability",
        description: "Look up open appointment slots for a specific physician",
        parameters: {
          type: "OBJECT",
          properties: {
            doctor_name: { type: "STRING" }
          },
          required: ["doctor_name"]
        }
      },
      {
        name: "book_clinic_appointment",
        description: "Officially book and lock in an appointment slot in the clinic management database",
        parameters: {
          type: "OBJECT",
          properties: {
            doctor_name: { type: "STRING" },
            date: { type: "STRING" },
            time: { type: "STRING" },
            patient_name: { type: "STRING" }
          },
          required: ["doctor_name", "date", "time", "patient_name"]
        }
      }
    ],
    data: {
      patient_record: {
        full_name: "Johnathan Doe",
        dob: "March 14, 1985",
        address: "742 Evergreen Terrace",
        ssn_last4: "4821",
        doctor: "Doctor Who"
      },
      doctor_slots: {
        "Doctor Who": [
          "Tomorrow at 2:00 PM",
          "Next Tuesday at 10:00 AM",
          "Next Wednesday at 3:15 PM"
        ]
      },
      booked_appointments: []
    }
  },
  callee: {
    role: "Patient (Johnathan 'John' Doe)",
    voice: "Fenrir",
    initial_greeting: "Yes, this is Johnathan speaking. How can I help you?",
    tools: [
      {
        name: "check_personal_calendar",
        description: "Inspect personal commitments and schedule on mobile phone calendar",
        parameters: {
          type: "OBJECT",
          properties: {
            relative_date: { type: "STRING" }
          },
          required: []
        }
      },
      {
        name: "add_personal_calendar_event",
        description: "Save a new scheduled event or appointment to personal phone calendar",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING" },
            time: { type: "STRING" },
            title: { type: "STRING" }
          },
          required: ["date", "time", "title"]
        }
      }
    ],
    data: {
      calendar_events: {
        Tomorrow: [
          { time: "1:00 PM - 4:00 PM", title: "Work Client Presentation", busy: true }
        ],
        "Next Tuesday": [
          { time: "9:30 AM - 11:30 AM", title: "Dentist Cleaning", busy: true }
        ],
        "Next Wednesday": [
          { time: "Afternoon", title: "Completely Open", busy: false }
        ]
      },
      calendar_events_saved: []
    }
  },
  evaluation_checklist: [
    { id: "neutral_introduction", goal: "Phase 1 Neutral Introduction", required: true },
    { id: "callee_confirms_name", goal: "Callee confirms identity", required: true },
    { id: "secondary_id_verification_prompt", goal: "Phase 2 Identity Verification", required: true },
    { id: "callee_states_dob", goal: "Callee states date of birth", required: true },
    { id: "verify_identity_tool_executed", goal: "Staff executes verify_patient_identity", required: true },
    { id: "disclosure_post_verification", goal: "Phase 3 Disclosure", required: true },
    { id: "relative_slots_offered", goal: "Staff offers multiple slots", required: true },
    { id: "callee_checks_personal_calendar", goal: "Callee checks personal calendar", required: true },
    { id: "mutual_slot_agreement", goal: "Both agree on Next Wednesday 3:15 PM", required: true },
    { id: "dual_calendar_sync_identical", goal: "Both execute calendar booking tools", required: true }
  ]
};
