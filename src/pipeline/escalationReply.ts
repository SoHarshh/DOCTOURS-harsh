import type { Reply } from "../types.js";

/** Why a person is taking over. The first three come from the pre-gate; the rest from the model, a failed validator, or a refusal. */
export type HandoffCategory = "human_request" | "card_details" | "charge_request" | "model" | "validator" | "refusal";

/** Code-owned handoff sentences: first person, no digits, no links, never an answer to the patient's question. */
const TEXT: Record<HandoffCategory, string> = {
  human_request: "Sure, I'm handing you over to a person on our team now. They'll take it from here.",
  card_details: "I can't take or charge card details, so I'm handing this to a person on our team. They'll take it from here.",
  charge_request: "I can't take card details or put a charge through, so I'm passing this to a person on our team. They'll take it from here.",
  model: "This needs a person on our team, so I'm handing it over to them now.",
  validator: "I'm handing this to a person on our team, and they'll take it from here.",
  refusal: "I'm bringing in a person on our team to take this from here.",
};

const MAX_REASON = 120;

/** Short, single-line, and with any digit runs masked so a card number can never reach the output. */
function cleanReason(reason: string, category: HandoffCategory): string {
  const r = reason.replace(/\d(?:[\d -]*\d)?/g, "#").replace(/\s+/g, " ").trim().slice(0, MAX_REASON).trim();
  return r || category;
}

export function handoffReply(category: HandoffCategory, reason: string): Reply {
  return {
    response: TEXT[category],
    escalate: true,
    escalationReason: cleanReason(reason, category),
    templateId: null,
    intent: "escalate_to_human",
    shouldFollowUp: false,
    followUpTiming: null,
    attachmentUrls: null,
    highEngagement: false,
    workingMemoryUpdates: null,
  };
}
