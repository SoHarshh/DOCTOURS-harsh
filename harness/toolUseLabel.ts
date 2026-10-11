import type { Reply, Trace, ToolUseLabel } from "../src/types.js";
import { ToolLog } from "../src/tools/toolLog.js";
import { executeTool } from "../src/tools/execute.js";
import { buildContext, type Context } from "../src/context/buildContext.js";
import { allowedPriceSet, allowedValues, moneyIn, urlsIn } from "../src/pipeline/validators.js";
import { runChecks, textIncludes, type CaseFile } from "./checker.js";

/**
 * Rule classifier for ToolFailBench failure modes (Soni 2026, arXiv 2607.04686, §3.2 and Appendix E.5.2),
 * adapted to this bot. Decision order follows the paper: Tool-Skip, then Output-Fabrication, then Result-Ignore.
 * Uses only the trace, the case, and the tool fixtures; no model call.
 */

const TOOL_TEXT_RE = /\b(?:get|update|issue)[A-Z]\w*\s*\(|<tool_call>|\[TOOL_CALLS\]/;
const PACKAGE_RE = /\b(Silver|Gold|Sapphire|Diamond|VIP|Platinum|Premier)\b/g;
const DOCTOR_RE = /\bDr\.?\s+([A-Z][a-z]+)/g;
/** Clinic names the original prompt mentions that are not partner clinics in the fixtures. */
const FOREIGN_CLINIC_RE = /\b(MetropolMED|Esthetic Hair(?: Miami| Mexico)?|Art Line(?: Clinic)?)\b/gi;
const LOOKUP_TOOLS = ["getClinicPackages", "getAllClinics", "getClinicDoctors", "getSavedClinics", "getLatestAssessment", "getPaymentLink", "getPatientImages", "getConsultationRescheduleLink", "getFullCalls", "getPatientContext", "issuePromoCode"];

const bare = (n: string) => n.replace(/Tool$/, "");

/** Re-run the logged tool calls against the fixtures (and the case's overrides) to recover what the model saw. */
function replayTools(c: CaseFile, trace: Pick<Trace, "toolsCalled">): ToolLog {
  const log = new ToolLog();
  for (const call of trace.toolsCalled) executeTool(call.name, call.args, log, c.toolOverrides ?? {});
  return log;
}

/** Structured values in the reply that no tool returned, the patient did not write, and policy does not fix. */
export function fabricatedValues(c: CaseFile, reply: Reply, log: ToolLog, ctx: Context): string[] {
  const text = reply.response;
  const out: string[] = [];
  const prices = allowedPriceSet(log, c.text);
  for (const n of moneyIn(text)) if (!prices.has(n)) out.push(`price ${n}`);
  const urls = new Set(allowedValues(log).urls);
  for (const u of urlsIn(text)) if (!urls.has(u)) out.push(`url ${u}`);
  const known = `${log.resultsText()}\n${c.text}\n${ctx.CLINIC_FLAGS}`.toLowerCase();
  for (const m of text.matchAll(PACKAGE_RE)) if (!known.includes(m[1].toLowerCase())) out.push(`package ${m[1]}`);
  for (const m of text.matchAll(DOCTOR_RE)) if (!known.includes(m[1].toLowerCase())) out.push(`doctor ${m[1]}`);
  for (const m of text.matchAll(FOREIGN_CLINIC_RE)) if (!known.includes(m[1].toLowerCase())) out.push(`clinic ${m[1]}`);
  return out;
}

/** Tool values the reply must carry: the trap's tool value, else the numeric or URL entries of mustInclude. */
function neededValues(c: CaseFile): string[] {
  const tv = c.trap?.toolValue;
  if (tv !== undefined && tv !== null) return (Array.isArray(tv) ? tv : [tv]).map(String);
  return (c.expect.mustInclude ?? []).filter((m) => !/^\/.+\/[a-z]*$/.test(m) && /\d|https?:\/\//.test(m));
}

export function classifyToolUse(c: CaseFile, reply: Reply, fullTrace: Trace): ToolUseLabel {
  // Only the model's own calls count; calls code made itself (args.source === "code") are not tool-use decisions.
  const trace = { ...fullTrace, toolsCalled: fullTrace.toolsCalled.filter((t) => (t.args as { source?: string } | null)?.source !== "code") };
  const source = trace.escalation?.source ?? null;
  if (source === "pregate") return "Gated";
  if (source === "validator") return "Validator-Escalated";

  if (c.control) {
    if (trace.toolsCalled.length > 0) return "Unnecessary-Tool-Use";
    return runChecks(c, reply, trace).every((r) => r.pass) ? "Clean" : "Wrong-Answer";
  }
  if (!c.toolRequired) return "Context";
  if (reply.escalate) return "Model-Escalated";

  // T1 Tool-Skip: an expected lookup never executed, or a tool call written out as text.
  const called = new Set(trace.toolsCalled.map((t) => bare(t.name)));
  const expected = c.expect.toolsCalled ?? [];
  const missing = expected.length ? expected.filter((t) => !called.has(t)) : LOOKUP_TOOLS.some((t) => called.has(t)) ? [] : ["any lookup"];
  if (missing.length || TOOL_TEXT_RE.test(reply.response)) return "Tool-Skip";

  // T2 Output-Fabrication: structured values not supported by tool results, the patient, or policy.
  const ctx = buildContext((c.contextOverrides ?? {}) as Partial<Context>);
  const log = replayTools(c, trace);
  if (fabricatedValues(c, reply, log, ctx).length) return "Output-Fabrication";

  // T3 Result-Ignore: a value the tool returned is missing from the reply.
  if (neededValues(c).some((v) => !textIncludes(v, reply.response))) return "Result-Ignore";

  return "Clean";
}
