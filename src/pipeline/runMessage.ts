import type { Context } from "../context/buildContext.js";
import { emptyTrace, addUsage, type Reply, type Trace } from "../types.js";
import { loadPrompt, renderUserMessage } from "../prompts.js";
import { SKILLS_DIR } from "../paths.js";
import { TOOL_DEFINITIONS } from "../tools/schemas.js";
import { ToolLog } from "../tools/toolLog.js";
import { pregate } from "./pregate.js";
import { loadSkills, type Skill } from "./skills.js";
import { route } from "./router.js";
import { assembleSystem } from "./assemble.js";
import { callModel, type ModelDeps } from "./model.js";
import { validate, autoFix, retryMessage, VALIDATOR_NAMES } from "./validators.js";
import { handoffReply } from "./escalationReply.js";
import { ensureActionLink } from "./actionLinks.js";
import { classifyModules, isAcknowledgement } from "./classifier.js";
import { callSummaryExtra, loadCallSummaries, type SummaryStore } from "../subagents/callLog.js";

export interface RunOpts {
  deps: ModelDeps;
  id?: string;
  /** Policy modules; defaults to the skills/ directory. */
  skills?: Skill[];
  /** Core prompt text; defaults to prompts/core.md. */
  core?: string;
  /** Per-test-case replacement tool results. */
  toolOverrides?: Record<string, unknown>;
  /** Precomputed call summaries; defaults to data/call-summaries.json. */
  callSummaries?: SummaryStore;
  /** When no module matched, ask a small classifier (default on; env ROUTER_FALLBACK=off turns it off). */
  routerFallback?: boolean;
}

let defaultSkills: Skill[] | null = null;
let defaultCore: string | null = null;

/**
 * One patient message in, one Reply and one Trace out.
 *
 *   pre-gate (code) -> router (code) -> assemble (code) -> model call (tools) -> validators (code)
 *   -> at most one retry -> code-owned handoff sentence when escalating
 *
 * Code decides routing, conflicts, escalation and validity. The model drafts the reply.
 */
export async function runMessage(ctx: Context, text: string, opts: RunOpts): Promise<{ reply: Reply; trace: Trace }> {
  const started = Date.now();
  const trace = emptyTrace(opts.id ?? "msg", "new", opts.deps.model);
  const finish = (reply: Reply) => {
    trace.latencyMs = Date.now() - started;
    return { reply, trace };
  };

  // 1. Pre-gate: unambiguous handoffs never reach the model.
  const gate = pregate(text);
  if (gate.escalate && gate.category) {
    trace.escalation = { source: "pregate", reason: gate.reason, category: gate.category };
    trace.notes.push("model call skipped by pre-gate");
    return finish(handoffReply(gate.category, gate.reason ?? "pre-gate"));
  }

  // 2. Router: which policy modules this message needs, with conflicts settled in code.
  const skills = opts.skills ?? (defaultSkills ??= loadSkills(SKILLS_DIR));
  const core = opts.core ?? (defaultCore ??= loadPrompt("core"));
  const routed = route(ctx, text, skills);
  trace.skillsLoaded = routed.skills.map((s) => s.name);
  trace.routing = routed.matched;
  trace.suppressed = routed.suppressed;
  if (!routed.stageSkill) trace.notes.push(`no stage module for ${ctx.PIPELINE_STATUS}`);

  // 2b. Router fallback: no phrase matched and the message is more than an acknowledgement.
  let chosen = routed.skills;
  const fallbackOn = opts.routerFallback ?? process.env.ROUTER_FALLBACK !== "off";
  const anyPolicy = chosen.some((s) => !s.name.startsWith("stage-"));
  if (fallbackOn && !anyPolicy && !isAcknowledgement(text)) {
    const picked = await classifyModules(opts.deps, gate.redactedText, skills);
    trace.subagents.push("routerFallback");
    trace.usage = addUsage(trace.usage, picked.usage);
    if (picked.error) trace.notes.push(`router fallback: ${picked.error}`);
    const extra = skills.filter((s) => picked.names.includes(s.name));
    for (const s of extra) trace.routing.push({ skill: s.name, by: "classifier" });
    chosen = [...chosen, ...extra].sort((a, b) => a.precedence - b.precedence || a.name.localeCompare(b.name));
    trace.skillsLoaded = chosen.map((s) => s.name);
  }

  // 3. Side task: a call summary prepared ahead of time, added only when the patient asks about a call.
  const extras: string[] = [];
  const callExtra = callSummaryExtra(ctx, text, opts.callSummaries ?? loadCallSummaries());
  if (callExtra) { extras.push(callExtra); trace.subagents.push("callLog"); }

  // 4. Assemble: fixed core (cached) + chosen modules + context.
  const system = assembleSystem(core, chosen, ctx, extras);
  trace.promptChars = system.reduce((n, b) => n + b.text.length, 0);

  // 5. Model call, validators, and at most one retry.
  const log = new ToolLog();
  const firstUser = renderUserMessage(ctx, gate.redactedText);
  let user = firstUser;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callModel(opts.deps, { system, user, tools: TOOL_DEFINITIONS, log, toolOverrides: opts.toolOverrides });
    trace.usage = addUsage(trace.usage, res.usage);
    trace.rounds += res.rounds;
    trace.stopReason = res.stopReason;
    trace.toolsCalled = log.calls;

    if (res.stopReason === "refusal") {
      trace.escalation = { source: "refusal", reason: "model_refusal", category: "refusal" };
      return finish(handoffReply("refusal", "model_refusal"));
    }

    if (!res.reply) {
      trace.attempts?.push({ response: res.rawText, escalate: false, toolCallCount: log.calls.length, violations: ["unparseable"] });
      if (attempt === 0) {
        trace.retried = true;
        user = res.parseError === "max_rounds"
          ? `${firstUser}\n\nThe previous attempt used every tool round without answering. Answer now with what you already know, calling at most one more tool, and return only the JSON object.`
          : `${firstUser}\n\nA validator rejected the previous reply: it was not a valid JSON object of the required shape (${res.parseError}). Return only the JSON object.`;
        continue;
      }
      trace.retryFixed = false;
      trace.escalation = { source: "validator", reason: "validator:unparseable", category: "validator" };
      return finish(handoffReply("validator", "validator:unparseable"));
    }

    const fixed = autoFix(res.reply);
    const violations = validate(fixed.reply, log, ctx, text);
    const failed = [...new Set(violations.map((v) => v.name))];
    trace.attempts?.push({ response: res.reply.response, escalate: res.reply.escalate, toolCallCount: log.calls.length, violations: failed });
    trace.validators = {
      passed: VALIDATOR_NAMES.filter((n) => !failed.includes(n)),
      failed,
      autoFixed: fixed.fixed,
      details: violations.map((v) => `${v.name}: ${v.detail}`),
    };

    if (violations.length === 0) {
      if (attempt === 1) trace.retryFixed = true;
      if (fixed.reply.escalate) {
        const reason = fixed.reply.escalationReason ?? "model escalated";
        trace.escalation = { source: "model", reason, category: "model" };
        return finish(handoffReply("model", reason));
      }
      const linked = ensureActionLink(fixed.reply, log, opts.toolOverrides);
      if (linked.added) { trace.validators.autoFixed.push("assessmentLink"); trace.toolsCalled = log.calls; }
      return finish(linked.reply);
    }

    if (attempt === 0) {
      trace.retried = true;
      user = `${firstUser}\n\n${retryMessage(violations, log)}`;
      continue;
    }
    trace.retryFixed = false;
    const reason = `validator:${failed[0]}`;
    trace.escalation = { source: "validator", reason, category: "validator" };
    return finish(handoffReply("validator", reason));
  }
  throw new Error("unreachable: the attempt loop always returns");
}
