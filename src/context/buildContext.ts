import * as P from "./packet.js";

/** Everything a reply depends on besides the message text. Defaults are the packet constants. */
export const DEFAULTS = {
  TIER: P.TIER as string,
  PATIENT_NAME: P.PATIENT_NAME as string | null,
  PROCEDURE_AREA: P.PROCEDURE_AREA as string | null,
  PATIENT_EMAIL: P.PATIENT_EMAIL as string | null,
  PATIENT_PHONE: P.PATIENT_PHONE as string | null,
  PATIENT_COUNTRY_CODE: P.PATIENT_COUNTRY_CODE as string | null,
  KLARNA_PAYPAL_FINANCING_ELIGIBLE: P.KLARNA_PAYPAL_FINANCING_ELIGIBLE as boolean | "unknown",
  PATIENT_SEX: P.PATIENT_SEX as string,
  PROMO_OFFER: P.PROMO_OFFER as string | null,
  PIPELINE_STATUS: P.PIPELINE_STATUS as string,
  CONSULTATION_TIME: P.CONSULTATION_TIME as string | null,
  HAS_ACTIVE_BOOKING: P.HAS_ACTIVE_BOOKING as boolean,
  PROCEDURE_INTEREST: P.PROCEDURE_INTEREST as string,
  ESTIMATED_GRAFTS: P.ESTIMATED_GRAFTS as number,
  GRAFT_RANGE: P.GRAFT_RANGE as { min: number; max: number },
  GRAFTS: P.GRAFTS as number,
  SAVED_CLINIC_COUNT: P.SAVED_CLINIC_COUNT as number,
  HAS_PATIENT_IMAGES: P.HAS_PATIENT_IMAGES as boolean,
  PATIENT_IMAGE_COUNT: P.PATIENT_IMAGE_COUNT as number,
  CHAT_KIND: P.CHAT_KIND as string,
  COORDINATOR_DISPLAY_NAME: P.COORDINATOR_DISPLAY_NAME as string,
  SENDER_DISPLAY_NAME: P.SENDER_DISPLAY_NAME as string,
  SENDER_PARTICIPANT_ROLE: P.SENDER_PARTICIPANT_ROLE as string,
  USER_ID: P.USER_ID as string,
  SUPABASE_CHAT_ID: P.SUPABASE_CHAT_ID as string,
  COLLECTION_STATUS: P.COLLECTION_STATUS as string,
  WORKING_MEMORY: P.WORKING_MEMORY as string,
  CLINIC_FLAGS: P.CLINIC_FLAGS as string,
  RECENT_CALLS: P.RECENT_CALLS as string,
  CHAT_LIST: P.CHAT_LIST as string,
  RECENT_CONVERSATION_SUMMARY: P.RECENT_CONVERSATION_SUMMARY as string,
};

export type Context = typeof DEFAULTS;

export function buildContext(overrides: Partial<Context> = {}): Context {
  return { ...structuredClone(DEFAULTS), ...structuredClone(overrides) };
}

export function renderPatientSummary(ctx: Context): string {
  const fin = ctx.KLARNA_PAYPAL_FINANCING_ELIGIBLE === "unknown" ? "unknown" : ctx.KLARNA_PAYPAL_FINANCING_ELIGIBLE ? "yes" : "no";
  return [
    `- Tier: ${ctx.TIER}`,
    `- Name: ${ctx.PATIENT_NAME ?? "Unknown"}`,
    `- Sex: ${ctx.PATIENT_SEX}`,
    `- Home country: ${ctx.PATIENT_COUNTRY_CODE ?? "Unknown"}`,
    `- Klarna/PayPal financing available: ${fin}`,
    `- Pipeline Status: ${ctx.PIPELINE_STATUS}`,
    `- Consultation: ${ctx.CONSULTATION_TIME ?? "Not scheduled"}`,
    `- Procedure Interest: ${ctx.PROCEDURE_INTEREST}`,
    `- Estimated Grafts: ${ctx.ESTIMATED_GRAFTS}`,
    `- Graft Range: ${ctx.GRAFT_RANGE.min} - ${ctx.GRAFT_RANGE.max} grafts`,
    `- Grafts (from measurement): ${ctx.GRAFTS}`,
    `- User ID: ${ctx.USER_ID}`,
  ].join("\n");
}

/** Replace {{NAME}} placeholders with values; unknown or lower-case placeholders are left untouched. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key: string) => (key in values ? values[key] : m));
}

export function templateValues(ctx: Context): Record<string, string> {
  return {
    PATIENT_SUMMARY: renderPatientSummary(ctx),
    CLINIC_FLAGS: ctx.CLINIC_FLAGS,
    RECENT_CALLS: ctx.RECENT_CALLS,
    CHAT_LIST: ctx.CHAT_LIST,
    RECENT_CONVERSATION_SUMMARY: ctx.RECENT_CONVERSATION_SUMMARY,
    COLLECTION_STATUS: ctx.COLLECTION_STATUS,
    WORKING_MEMORY: ctx.WORKING_MEMORY,
    COORDINATOR_DISPLAY_NAME: ctx.COORDINATOR_DISPLAY_NAME,
    CHAT_KIND: ctx.CHAT_KIND,
    SENDER_DISPLAY_NAME: ctx.SENDER_DISPLAY_NAME,
    SENDER_PARTICIPANT_ROLE: ctx.SENDER_PARTICIPANT_ROLE,
    SAVED_CLINIC_COUNT: String(ctx.SAVED_CLINIC_COUNT),
    PATIENT_IMAGE_COUNT: String(ctx.PATIENT_IMAGE_COUNT),
  };
}
