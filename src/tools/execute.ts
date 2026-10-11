import * as f from "./fixtures.js";
import { ToolLog } from "./toolLog.js";

const TABLE: Record<string, (input: any) => unknown> = {
  getAllClinics: f.getAllClinics, getClinicDoctors: f.getClinicDoctors, getClinicPackages: f.getClinicPackages,
  getConsultationRescheduleLink: f.getConsultationRescheduleLink, getFullCalls: f.getFullCalls,
  getLatestAssessment: f.getLatestAssessment, getPatientContext: f.getPatientContext, getPatientImages: f.getPatientImages,
  getPaymentLink: f.getPaymentLink, getSavedClinics: f.getSavedClinics, issuePromoCode: f.issuePromoCode,
  updateUser: f.updateUser, updateUserClinicPreferences: f.updateUserClinicPreferences, updateWorkingMemory: f.updateWorkingMemory,
};

export const TOOL_NAMES = Object.keys(TABLE);

/** Accepts both `getClinicPackages` and the original prompt's `getClinicPackagesTool` spelling. */
export function normalizeToolName(name: string): string { return name.replace(/Tool$/, ""); }

/** Runs a tool, records it, and returns the JSON string the model sees. `overrides` lets a test case replace a fixture. */
export function executeTool(name: string, input: unknown, log: ToolLog, overrides: Record<string, unknown> = {}): string {
  const key = normalizeToolName(name);
  if (key in overrides) return log.record(name, input, overrides[key]);
  const fn = TABLE[key];
  if (!fn) return log.record(name, input, { error: `unknown tool ${name}` });
  try {
    return log.record(name, input, fn(input ?? {}));
  } catch (e) {
    // A bad argument (e.g. a number where a name was expected) must not end the turn; the model sees the error.
    log.record(name, input, null);
    return JSON.stringify({ error: `tool ${name} failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}
