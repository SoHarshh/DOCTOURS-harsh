import type Anthropic from "@anthropic-ai/sdk";
import { renderPatientSummary, type Context } from "../context/buildContext.js";

/** The packet fixes "now" for every message. */
export const CURRENT_DATETIME = "September 27, 2026 at 07:37 PM UTC";

/** Anything with a name and a body: the router's Skill type satisfies this. */
export interface PolicyModule { name: string; body: string }

/** Patient- and turn-specific facts. Everything here changes per message, so it sits after the cached core. */
export function renderContextBlock(ctx: Context, extras: string[] = []): string {
  const promo = ctx.PROMO_OFFER
    ?? "none. Do not state, confirm, hint at, or deny any discount or promo code. If asked, answer the price question with the current package price.";
  return [
    `# Patient summary\n${renderPatientSummary(ctx)}`,
    `# Clinic flags\nSource of truth for clinic Speciality and Practice type. "Afro Hair" means that clinic is an afro-hair specialist. Answer hair-type questions from these flags, never from package names.\n${ctx.CLINIC_FLAGS}`,
    `# Stage\nPipeline Status: ${ctx.PIPELINE_STATUS}\nCollection Status: ${ctx.COLLECTION_STATUS}\nAssessment clinic recommendations: ${ctx.SAVED_CLINIC_COUNT} (getSavedClinics)\nPatient images: ${ctx.PATIENT_IMAGE_COUNT} uploaded (getPatientImages)\nPromo: ${promo}`,
    `# Working memory\n${ctx.WORKING_MEMORY}`,
    `# Recent calls\n${ctx.RECENT_CALLS || "none"}`,
    ...extras,
    `# Recent conversation (canonical transcript)\n${ctx.CHAT_LIST || "(no messages yet)"}`,
    `# This turn\nCurrent date/time: ${CURRENT_DATETIME}\nCoordinator name: ${ctx.COORDINATOR_DISPLAY_NAME}\nChat kind: ${ctx.CHAT_KIND}\nTriggering sender: ${ctx.SENDER_DISPLAY_NAME} (${ctx.SENDER_PARTICIPANT_ROLE})`,
  ].join("\n\n");
}

/**
 * Two system blocks. The first is the core prompt, identical for every message, so the API cache
 * covers it (callModel marks it). The second holds only the policy modules the router chose,
 * in the router's order, then the context block.
 */
export function assembleSystem(core: string, modules: PolicyModule[], ctx: Context, extras: string[] = []): Anthropic.TextBlockParam[] {
  const policy = modules.length
    ? `# LOADED POLICY SECTIONS\n\n${modules.map((m) => `<!-- module: ${m.name} -->\n${m.body}`).join("\n\n")}`
    : "# LOADED POLICY SECTIONS\n(none for this message)";
  return [
    { type: "text", text: core },
    { type: "text", text: `${policy}\n\n# CONTEXT\n\n${renderContextBlock(ctx, extras)}` },
  ];
}
