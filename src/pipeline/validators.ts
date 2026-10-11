import type { Reply } from "../types.js";
import type { ToolLog } from "../tools/toolLog.js";
import type { Context } from "../context/buildContext.js";

/**
 * Output validators. Each one is a plain function over the reply, the tool log for this turn,
 * and optionally the patient's message. None of them call a model.
 *
 * When escalate is true, the reply text is replaced by a code-owned handoff sentence later,
 * so only the escalation fields are checked here.
 */

export interface Violation { name: string; detail: string }

export const VALIDATOR_NAMES = [
  "plainText", "urlLastLine", "urlProvenance", "priceProvenance", "noCardDigits",
  "escalationShape", "fieldSanity", "bannedPhrases", "claimsVsReceipts", "toolRequired",
] as const;

export const STATIC_URL_ALLOWLIST = ["https://www.doctours.com/image-upload", "https://www.doctours.com/consultation"];
/** The deposit cancellation fee is stated in the policy text itself, not returned by a tool. */
const POLICY_PRICES = [25];

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const MD_RE = /(\*\*|__|`|^#{1,6}\s|^\s*[-*•]\s+)/m;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b|\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}\b\d{4}\b/i;
const MONEY_SRC = String.raw`(?:\$|usd\s?|€|£)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars|eur|euros|gbp)\b`;
const PACKAGE_NAME_RE = /\b(Silver|Gold|Sapphire|Diamond|VIP|Platinum|Premier)\b/;

const STALL_RE = /\b(?:I'?ll (?:get back to you|check on|look into|find out)|let me (?:check|look into|find out)|I(?:'ve)? checked our (?:side|system))\b/i;
const TURNAROUND_RE = /\b(?:a few hours|couple of hours|later today|by tomorrow|within a day|24 hours|24-48 hours|48 hours|a few days|couple of days|typically takes|usually takes|should be ready|will be ready (?:in|by|within))\b/i;
const HEADCOVER_RE = /\b(?:bring|wear|pack|buy|get|grab|use)\b[^.?!]{0,30}\b(?:hat|cap|beanie|scarf|hood|headband|hijab|head ?wrap|bandana)\b/i;
const HEADCOVER_TIMING_RE = /\b(?:after|until|again|weeks?)\b/i;
const HEADCOVER_NEGATED_RE = /\b(?:don'?t|do not|no need to|won'?t need|never|not|avoid|skip)\b[^.?!]{0,25}\b(?:bring|wear|wearing|pack|buy|get|grab|use)\b/i;

const HANDOFF_CLAIM_RE = /\b(?:I'?m|I am) (?:getting|bringing in|looping in|connecting you|passing|handing)\b|\b(?:someone|somebody|a (?:person|human|team member|coordinator|specialist|colleague)|(?:our|the) team)(?: from (?:our|the) team)? will (?:reach out|be in touch|contact you|get back|follow up|call you|help you|take over|pick (?:this|it) up)|\b(?:I'?ve|I have) (?:passed|handed|forwarded|escalated)\b/i;
const SAVED_CLAIM_RE = /\b(?:I'?ve|I have) (?:saved|updated|noted|recorded|logged|added|locked in)\b/i;
const SENT_CLAIM_RE = /\b(?:I'?ve|I have) sent\b|\blinks? below\b/i;
const WRITE_TOOLS = ["updateUserClinicPreferences", "updateWorkingMemory", "updateUser"];

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const cleanUrl = (u: string) => u.replace(/[.,;:)!?'"]+$/, "");
/** Text with URLs and IDs removed, so digits inside a link or an ID are not mistaken for a card number. */
export const withoutLinksAndIds = (s: string) => s.replace(URL_RE, " ").replace(UUID_RE, " ");
export const urlsIn = (s: string) => (s.match(URL_RE) ?? []).map(cleanUrl);
const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const numbersIn = (s: string) => [
  ...(s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, ""))),
  // "1k", "2.5k": patients write thousands this way
  ...[...s.matchAll(/(\d+(?:\.\d+)?)\s?k\b/gi)].map((m) => Math.round(Number(m[1]) * 1000)),
];

export function moneyIn(s: string): number[] {
  return [...s.matchAll(new RegExp(MONEY_SRC, "gi"))].map((m) => Number((m[1] ?? m[2]).replace(/,/g, "")));
}

function clinicPages(log: ToolLog): string[] {
  return [...log.slugs()].map((slug) => `https://www.doctours.com/clinic/${slug}`);
}

/** The URLs and prices a reply may state this turn: tool results plus the fixed policy values. */
export function allowedValues(log: ToolLog): { urls: string[]; prices: number[] } {
  const urls = [...new Set([...STATIC_URL_ALLOWLIST, ...log.urls(), ...clinicPages(log)])];
  const prices = [...new Set([...log.prices(), ...POLICY_PRICES])].sort((a, b) => a - b);
  return { urls, prices };
}

export function allowedPriceSet(log: ToolLog, patientText?: string): Set<number> {
  const tool = [...log.prices()];
  const out = new Set<number>([...tool, ...POLICY_PRICES]);
  // A package price minus a deposit (the remaining balance) is derived from tool values.
  for (const a of tool) for (const b of tool) if (a > b) out.add(a - b);
  // A number the patient wrote themselves is not invented by the model.
  if (patientText) for (const n of numbersIn(patientText)) out.add(n);
  return out;
}

/** A sentence that corrects an earlier figure rather than asserting it. */
const CORRECTION_RE = /\b(?:wrong|earlier|incorrect|mistake|mistaken|not|instead|rather than|disregard|correction|actually|outdated|old)\b/i;

export const historyText = (ctx: Context) => `${ctx.CHAT_LIST}\n${ctx.RECENT_CONVERSATION_SUMMARY}`;

/**
 * Prices in the reply that nothing supports. Supported: tool results this turn, policy values, a price minus a deposit,
 * numbers the patient wrote, and a number from the chat history when the sentence is correcting it
 * ("I quoted $4,200 earlier, which was wrong"). A history number stated as fact is still unsupported.
 */
export function unsupportedPrices(text: string, log: ToolLog, patientText?: string, history?: string): number[] {
  const ok = allowedPriceSet(log, patientText);
  const fromHistory = new Set(history ? numbersIn(history) : []);
  const out: number[] = [];
  for (const sentence of sentences(text)) {
    for (const n of moneyIn(sentence)) {
      if (ok.has(n)) continue;
      if (fromHistory.has(n) && CORRECTION_RE.test(sentence)) continue;
      out.push(n);
    }
  }
  return out;
}

function urlPlacementOk(text: string): boolean {
  const urls = urlsIn(text);
  if (urls.length === 0) return true;
  const lines = text.trim().split("\n");
  const tail = lines.slice(-urls.length);
  const tailOk = tail.every((l) => /^https?:\/\/\S+$/.test(l.trim()));
  const bodyHasUrl = lines.slice(0, lines.length - urls.length).some((l) => /https?:\/\//.test(l));
  return tailOk && !bodyHasUrl;
}

export function validate(reply: Reply, log: ToolLog, _ctx: Context, patientText?: string): Violation[] {
  const v: Violation[] = [];
  const add = (name: (typeof VALIDATOR_NAMES)[number], detail: string) => v.push({ name, detail });

  // Escalation fields, checked in both directions.
  if (reply.escalate && !reply.escalationReason) add("escalationShape", "escalate is true but escalationReason is empty");
  if (!reply.escalate && reply.escalationReason !== null) add("escalationShape", "escalationReason must be null when escalate is false");

  // Structured fields.
  if (reply.templateId !== null) add("fieldSanity", "templateId must be null");
  if (reply.attachmentUrls) {
    if (reply.attachmentUrls.length > 3) add("fieldSanity", "more than 3 attachments");
    const images = log.imageUrls();
    for (const a of reply.attachmentUrls) if (!images.has(a)) add("fieldSanity", `attachment not returned by a tool: ${a}`);
  }

  // The text of an escalated reply is replaced by code, so stop here.
  if (reply.escalate) return v;

  const text = reply.response;
  if (!text.trim()) add("fieldSanity", "response is empty");

  if (MD_RE.test(text)) add("plainText", "markdown markers present");
  if (!urlPlacementOk(text)) add("urlLastLine", "every URL must be on its own line at the end of the reply");

  const okUrls = new Set(allowedValues(log).urls);
  for (const u of urlsIn(text)) if (!okUrls.has(u)) add("urlProvenance", `URL not returned by a tool this turn: ${u}`);

  for (const n of unsupportedPrices(text, log, patientText, historyText(_ctx))) add("priceProvenance", `price not returned by a tool this turn: ${n}`);

  if (CARD_RE.test(withoutLinksAndIds(text))) add("noCardDigits", "card digits echoed back");

  if (STALL_RE.test(text)) add("bannedPhrases", "promises a later check or follow-up nobody can trigger");
  for (const s of sentences(text)) {
    if (/assessment/i.test(s) && TURNAROUND_RE.test(s)) add("bannedPhrases", `assessment turnaround promise: ${s}`);
    if (HEADCOVER_RE.test(s) && !HEADCOVER_TIMING_RE.test(s) && !HEADCOVER_NEGATED_RE.test(s)) add("bannedPhrases", `head-covering advice: ${s}`);
  }

  if (HANDOFF_CLAIM_RE.test(text)) add("claimsVsReceipts", "claims a hand-off to a person but escalate is false");
  const wrote = WRITE_TOOLS.some((t) => log.called(t)) || reply.workingMemoryUpdates !== null;
  if (SAVED_CLAIM_RE.test(text) && !wrote) add("claimsVsReceipts", "claims something was saved but no write tool ran and no memory update was returned");
  if (SENT_CLAIM_RE.test(text) && urlsIn(text).length === 0) add("claimsVsReceipts", "refers to a link but the reply contains none");

  if (!log.called("getClinicPackages")) {
    const prices = moneyIn(text).filter((n) => !POLICY_PRICES.includes(n));
    const pkg = text.match(PACKAGE_NAME_RE);
    if (prices.length) add("toolRequired", `states a price (${prices[0]}) without calling getClinicPackages this turn`);
    else if (pkg) add("toolRequired", `names a package (${pkg[1]}) without calling getClinicPackages this turn`);
  }

  return v;
}

/** Fixes formatting problems in code so they never cost a retry. */
export function autoFix(reply: Reply): { reply: Reply; fixed: string[] } {
  const fixed: string[] = [];
  let out: Reply = reply;
  let text = reply.response;

  if (!reply.escalate) {
    if (MD_RE.test(text)) {
      text = text.replace(/\*\*|__|`/g, "").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*•]\s+/gm, "");
      fixed.push("plainText");
    }
    if (!urlPlacementOk(text)) {
      const urls = urlsIn(text);
      let body = text;
      for (const u of urls) {
        const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        body = body.replace(new RegExp(`^\\s*${esc}[.,;:)!?]*\\s*$`, "m"), "");
        // Drop the word that pointed at the URL ("at", "here:"), keep any sentence punctuation after it.
        body = body.replace(new RegExp(`(?:\\s+\\b(?:at|via|on|from|here)\\b\\s*:?|\\s*:)?\\s*${esc}`), " using the link below");
      }
      body = body.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
        .map((l) => (/using the link below$/.test(l) ? `${l}.` : l)).join("\n");
      text = `${body}\n${[...new Set(urls)].join("\n")}`;
      fixed.push("urlLastLine");
    }
    if (text !== reply.response) out = { ...out, response: text };
    if (out.escalationReason !== null) { out = { ...out, escalationReason: null }; fixed.push("escalationShape"); }
  } else if (!out.escalationReason) {
    out = { ...out, escalationReason: "model escalated without a reason" };
    fixed.push("escalationShape");
  }
  if (out.templateId !== null) { out = { ...out, templateId: null }; fixed.push("fieldSanity"); }
  return { reply: out, fixed: [...new Set(fixed)] };
}

/** The retry message: an external verdict that names each violation and lists what is allowed. */
export function retryMessage(violations: Violation[], log: ToolLog): string {
  const allowed = allowedValues(log);
  return [
    "A validator rejected the previous reply.",
    ...violations.map((x) => `- ${x.name}: ${x.detail}`),
    `Allowed URLs this turn: ${allowed.urls.join(", ")}`,
    `Allowed prices this turn: ${allowed.prices.join(", ")}`,
    "Any other URL or price is not allowed. If you need a price you have not looked up, call getClinicPackages first.",
    "Rewrite the reply. Return only the JSON object.",
  ].join("\n");
}
