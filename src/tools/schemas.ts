import type Anthropic from "@anthropic-ai/sdk";

const clinicRef = { type: "object" as const, properties: { clinicId: { type: "string" }, clinicName: { type: "string" } }, additionalProperties: false };
const userRef = { type: "object" as const, properties: { userId: { type: "string" } }, additionalProperties: false };

/** Tool definitions sent to the model. Order and content are fixed so the prompt cache stays valid. */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  { name: "getAllClinics", description: "List every partner clinic with id, slug, address, clinic_flags and ai_context.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getClinicDoctors", description: "Doctors at one clinic, by clinicId or clinicName. Returns null if the clinic is unknown.", input_schema: clinicRef },
  { name: "getClinicPackages", description: "Packages for one clinic, by clinicId or clinicName: name, basePrice, depositAmount, currency, bookableWeekdays, includedAddons, aiContext. Returns null if the clinic is unknown.", input_schema: clinicRef },
  { name: "getConsultationRescheduleLink", description: "Reschedule link for the patient's free consultation call, or status no_consultation.", input_schema: userRef },
  { name: "getFullCalls", description: "Full call records with summaries and transcripts for this chat.", input_schema: { type: "object", properties: { chatId: { type: "string" }, limit: { type: "integer" } }, additionalProperties: false } },
  { name: "getLatestAssessment", description: "The patient's personal assessment link, graft range and share status.", input_schema: userRef },
  { name: "getPatientContext", description: "Patient profile, pipeline status, saved clinic and package selection, tentative procedure dates.", input_schema: userRef },
  { name: "getPatientImages", description: "Which intake photo angles the patient has uploaded, with hosted URLs.", input_schema: userRef },
  { name: "getPaymentLink", description: "Deposit checkout URL. type 'payment' needs clinicPackageId; type 'checkout' needs clinicId.", input_schema: { type: "object", properties: { type: { type: "string", enum: ["payment", "checkout"] }, clinicPackageId: { type: "string" }, clinicId: { type: "string" } }, required: ["type"], additionalProperties: false } },
  { name: "getSavedClinics", description: "The clinics recommended in the patient's assessment, ranked.", input_schema: userRef },
  { name: "issuePromoCode", description: "Cut the patient's promo code if they are on an active campaign list.", input_schema: userRef },
  { name: "updateUser", description: "Save the patient's first and last name if none is on file.", input_schema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, userId: { type: "string" } }, additionalProperties: false } },
  { name: "updateUserClinicPreferences", description: "Persist clinicSelection (selectedClinicId, selectedPackageId, softClinicInterestIds, softPackageInterestIds) and tentativeProcedureDates {text, strength}. IDs must come from a clinic or package tool result this turn.", input_schema: { type: "object", properties: { clinicSelection: { type: "object" }, tentativeProcedureDates: { type: "object", properties: { text: { type: "string" }, strength: { type: "string", enum: ["strong", "medium", "weak"] } } }, userId: { type: "string" } }, additionalProperties: false } },
  { name: "updateWorkingMemory", description: "Merge fields into the patient's working memory.", input_schema: { type: "object", properties: { memory: { type: "object" } }, additionalProperties: false } },
];
