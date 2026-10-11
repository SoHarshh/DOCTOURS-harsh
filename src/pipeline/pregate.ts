/**
 * Deterministic pre-gate. Runs on the raw message before any model call and fires
 * escalation for patterns that are unambiguous from text alone. Everything that needs
 * judgment (moving paid money, contacting a clinic, holding a date) is left to the model.
 */
export type PregateCategory = "human_request" | "card_details" | "charge_request";
export interface PregateResult { escalate: boolean; category: PregateCategory | null; reason: string | null; redactedText: string }

const REASONS: Record<PregateCategory, string> = {
  human_request: "Patient asked for a person",
  card_details: "Patient shared card details",
  charge_request: "Patient asked us to charge a card",
};

const PERSON = "(?:human|real person|actual person|live person|person|someone|somebody|agent|representative|rep|operator|manager|supervisor|staff member|team member)";
const VERB = "(?:talk|speak|chat|connect|transfer|put me through|get me|give me|reach|escalate)";
const HUMAN_PATTERNS = [
  // verb ... to/with ... person, inside one sentence
  new RegExp(`\\b${VERB}\\b[^.?!]{0,30}?\\b(?:to|with|through to)\\s+(?:a |an |the |your )?${PERSON}\\b`, "i"),
  // need/want/demand + person, no verb needed
  /\b(?:get me|give me|i need|i want|i demand|i'd like|send me)\s+(?:a |an |the |your )?(?:real |actual |live )?(?:human|person|agent|representative|rep|operator|manager|supervisor)\b/i,
  /\b(?:stop|no more|not)\s+(?:the\s+)?(?:bot|ai|robot|automated)\b.*\b(?:human|person|agent)\b/i,
  /\bis there (?:a |an )?(?:human|real person|actual person|agent|representative)\b/i,
];
// "are you a bot?", "am I talking to a human?" are identity questions the model answers
const IDENTITY = /\b(?:are you|is this|am i (?:talking|speaking|chatting) (?:to|with))\b[^.?!]{0,20}\b(?:a |an )?(?:bot|ai|robot|human|real person|person)\b/i;
// "will I talk to a person on the call?" asks how something works, it is not a request
const INFO_QUESTION = /\b(?:will|would|do|does|did|should)\s+(?:i|we)\s+(?:get to\s+|be able to\s+)?(?:talk|speak|chat)\b/i;

// 13-19 digits with optional single space or dash separators, not glued to other word characters or dashes (UUIDs)
const CARD_RUN = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/;
const CARD_RUN_G = new RegExp(CARD_RUN.source, "g");
const CARD_ENDING = /\b(?:card|visa|mastercard|amex|discover)\b[^.?!]{0,30}\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}\b\d{4}\b/i;
const ENDING_DIGITS_G = /(\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!\d]{0,12}?)\b\d{4}\b/gi;

const CARD = "(?:my|the|this)\\s+(?:credit\\s+|debit\\s+)?card\\b";
const CHARGE_OBJECT = "(?:it|that|me|the deposit|the payment|the balance|the full amount)";
// imperative: "charge my card", "charge the deposit on my card", "take the deposit from my card"
const CHARGE = new RegExp(
  `\\b(?:charge|run|bill|swipe|process)\\b(?:\\s+${CHARGE_OBJECT})?\\s+(?:(?:on|to|from|with|through)\\s+)?${CARD}` +
    `|\\btake\\s+${CHARGE_OBJECT}\\s+(?:from|off|out of)\\s+${CARD}`,
  "i",
);
// "can you charge my card?" is a request even though it ends in a question mark
const POLITE_REQUEST = /\b(?:can|could|would) you\b|\bplease\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return /^(?:can|could|would|will|do|does|did|is|are|am|was|were|should|may|might|what|how|which|where|when|why|who)\b/i.test(t);
}

export function redactCardDigits(text: string): string {
  return text.replace(CARD_RUN_G, "[redacted]").replace(ENDING_DIGITS_G, "$1[redacted]");
}

export function pregate(text: string): PregateResult {
  const t = text.trim();
  const redactedText = redactCardDigits(t);
  const fire = (category: PregateCategory): PregateResult => ({ escalate: true, category, reason: REASONS[category], redactedText });

  if (CARD_RUN.test(t) || CARD_ENDING.test(t)) return fire("card_details");
  if (CHARGE.test(t) && (!isQuestion(t) || POLITE_REQUEST.test(t))) return fire("charge_request");
  if (!IDENTITY.test(t) && !INFO_QUESTION.test(t) && HUMAN_PATTERNS.some((p) => p.test(t))) return fire("human_request");
  return { escalate: false, category: null, reason: null, redactedText };
}
