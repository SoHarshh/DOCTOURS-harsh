/**
 * Deterministic pre-gate. Runs on the raw message before any model call and fires
 * escalation for patterns that are unambiguous from text alone. Everything that needs
 * judgment (moving paid money, contacting a clinic, holding a date) is left to the model.
 * Requests are matched per sentence, so "Are you a bot? I want a real person." still fires.
 */
export type PregateCategory = "human_request" | "card_details" | "charge_request";
export interface PregateResult { escalate: boolean; category: PregateCategory | null; reason: string | null; redactedText: string }

const REASONS: Record<PregateCategory, string> = {
  human_request: "Patient asked for a person",
  card_details: "Patient shared card details",
  charge_request: "Patient asked us to charge a card",
};

const STAFF = "(?:human being|human|real person|actual person|live person|real human|person|someone|somebody|agent|representative|rep|operator|manager|supervisor|staff member|team member)";
// "talk to someone at home first" is about the patient's own people, not our staff
// "someone at the clinic", "a rep from Heva": reaching the clinic is a first-ask question the model answers
const NOT_STAFF_AFTER = "(?!\\s+(?:at home|in my family|i know|close to me|first|before|about it first|who (?:has|had|have|did|went|got)|(?:at|from|with|in) (?:the clinic|the hospital|heva|hakan|dr\\b|dr\\.? ?hakan|dr\\.? ?hakan'?s office|the surgeon'?s office|the doctor'?s office)))";
const LONE_STAFF = "(?:human being|human|person|agent|representative|rep|operator|manager|supervisor)";
const HUMAN_PATTERNS = [
  // talk/speak/chat/reach ... to/with ... a person
  new RegExp(`\\b(?:talk|speak|chat|reach)\\b[^.?!]{0,30}?\\b(?:to|with)\\s+(?:a |an |the |your |some )?${STAFF}\\b${NOT_STAFF_AFTER}`, "i"),
  // connect/transfer/put me ... to a person (not "transfer my deposit to someone")
  new RegExp(`\\b(?:connect|transfer|put|pass|hand|send|escalate)\\s+(?:me|this)\\b[^.?!]{0,15}?\\b(?:to|with|through to|over to)\\s+(?:a |an |the |your )?${STAFF}\\b${NOT_STAFF_AFTER}`, "i"),
  // need/want/demand a person, where the person ends the request ("I want an agent fee waived" does not)
  new RegExp(
    `\\b(?:get me|give me|i need|i want|i demand|i'd like|i would like|send me|find me)\\s+(?:a |an |the |your )?(?:real |actual |live )?${LONE_STAFF}\\b` +
      `(?=\\s*(?:$|[.,!?;:]|please|pls|now|right now|asap|immediately|instead|here|on the phone|who|that|to (?:talk|speak|chat|help)))`,
    "i",
  ),
  /\b(?:stop|no more|not)\s+(?:the\s+|a\s+|this\s+)?(?:bot|ai|robot|automated)\b[^.?!]{0,60}\b(?:human|person|agent)\b/i,
  /\bis there (?:a |an )?(?:human|real person|actual person|live person|real human)\b/i,
  /\b(?:don'?t|do not)\s+want\s+(?:to\s+(?:talk|speak|chat)\s+(?:to|with)\s+)?(?:a |an |the |this )?(?:bot|ai|robot|machine|automated)/i,
];
// the whole message is just "Human please", "Agent", "representative"
const LONE_REQUEST = new RegExp(`^(?:a |an |the )?(?:real |live |actual )?${LONE_STAFF}(?:\\s+(?:please|pls|now|asap))?[\\s.!?]*$`, "i");
// "are you a bot?", "am I talking to a human?" are identity questions the model answers
const IDENTITY = /\b(?:are you|is this|am i (?:talking|speaking|chatting) (?:to|with))\b[^.?!]{0,20}\b(?:a |an )?(?:bot|ai|robot|human|real person|person)\b/i;
// "will I talk to a person on the call?", "do I need a person to drive me?" ask how something works
const INFO_QUESTION = /\b(?:will|do|does|did|should)\s+(?:i|we)\s+(?:get to\s+)?(?:talk|speak|chat|need)\b/i;

// 13-19 digits, separators of up to three spaces, dots or dashes; not glued to word characters,
// dashes (UUIDs) or a leading "+" (international phone numbers)
const CARD_RUN_SRC = "(?<![\\w+-])\\d(?:[ .\\-]{0,3}\\d){12,18}(?![\\w-])";
const CARD_RUN_G = new RegExp(CARD_RUN_SRC, "g");
const CARD_WORD = /\b(?:card|visa|mastercard|amex|discover|credit|debit|cvv|cvc|exp|expiry|expires)\b/i;
const CARD_ENDING = /\b(?:card|visa|mastercard|amex|discover)\b[^.?!]{0,30}\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}\b\d{4}\b/i;
const ENDING_DIGITS_G = /(\b(?:card|visa|mastercard|amex|discover|credit|debit)\b[^.?!]{0,30}?\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!\d]{0,12}?)\b\d{4}\b/gi;

const CARD = "(?:my|the|this)\\s+(?:credit\\s+|debit\\s+)?(?:card|visa|mastercard|amex)\\b";
const CHARGE_OBJECT = "(?:it|that|me|the deposit|the payment|the balance|the full amount)";
// imperative: "charge my card", "charge the deposit on my card", "take the deposit from my card"
const CHARGE = new RegExp(
  `\\b(?:charge|run|bill|swipe|process)\\b(?:\\s+${CHARGE_OBJECT})?\\s+(?:(?:on|to|from|with|through)\\s+)?${CARD}` +
    `|\\btake\\s+${CHARGE_OBJECT}\\s+(?:from|off|out of)\\s+${CARD}` +
    // "put it on my card" only as an instruction to us, never "I'll put it on my card"
    `|(?:^|\\b(?:please|can you|could you)\\s+)put\\s+${CHARGE_OBJECT}\\s+on\\s+${CARD}`,
  "i",
);
// "can you charge my card?" is a request even though it ends in a question mark
const POLITE_REQUEST = /\b(?:can|could) you\b|\bplease\b/i;
const NEGATED = /\b(?:don'?t|do not|never|not|no need to|stop|without)\s+(?:\w+\s+){0,2}?(?:charge|run|bill|swipe|process|take)\b/i;
// "will my card be charged each month?" is a layaway question
const RECURRING = /\b(?:automatically|each month|every month|monthly|per month)\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return /^(?:can|could|would|will|do|does|did|is|are|am|was|were|should|may|might|what|how|which|where|when|why|who)\b/i.test(t);
}

export function redactCardDigits(text: string): string {
  return text.replace(CARD_RUN_G, "[redacted]").replace(ENDING_DIGITS_G, "$1[redacted]");
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function hasCardNumber(t: string): boolean {
  const runs = [...t.matchAll(CARD_RUN_G)].map((m) => m[0].replace(/\D/g, ""));
  return runs.some((d) => luhn(d)) || (runs.length > 0 && CARD_WORD.test(t));
}

export function pregate(text: string): PregateResult {
  const t = text.trim();
  const redactedText = redactCardDigits(t);
  const fire = (category: PregateCategory): PregateResult => ({ escalate: true, category, reason: REASONS[category], redactedText });
  const parts = sentences(t);

  if (hasCardNumber(t) || CARD_ENDING.test(t)) return fire("card_details");
  if (parts.some((s) => CHARGE.test(s) && !NEGATED.test(s) && !RECURRING.test(s) && (!isQuestion(s) || POLITE_REQUEST.test(s)))) {
    return fire("charge_request");
  }
  if (LONE_REQUEST.test(t) || parts.some((s) => !IDENTITY.test(s) && !INFO_QUESTION.test(s) && HUMAN_PATTERNS.some((p) => p.test(s)))) {
    return fire("human_request");
  }
  return { escalate: false, category: null, reason: null, redactedText };
}
