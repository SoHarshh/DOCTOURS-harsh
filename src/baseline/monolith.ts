import type { Context } from "../context/buildContext.js";
import { renderBaselineSystem, renderUserMessage } from "../prompts.js";
import { TOOL_DEFINITIONS } from "../tools/schemas.js";
import { ToolLog } from "../tools/toolLog.js";
import { callModel, type ModelDeps } from "../pipeline/model.js";
import { handoffReply } from "../pipeline/escalationReply.js";
import { emptyTrace, type Reply, type Trace } from "../types.js";

/**
 * The "before": the packet's monolith prompt filled exactly as its Flow section says, with the same model, tools,
 * output schema and cache breakpoint as the new system. No pre-gate, router or validators.
 */
export async function runBaseline(
  ctx: Context, text: string, deps: ModelDeps, id = "msg", toolOverrides?: Record<string, unknown>,
): Promise<{ reply: Reply; trace: Trace }> {
  const system = renderBaselineSystem(ctx);
  const log = new ToolLog();
  const r = await callModel(deps, {
    system: [{ type: "text", text: system }], user: renderUserMessage(ctx, text), tools: TOOL_DEFINITIONS, log, toolOverrides,
  });

  const trace = emptyTrace(id, "baseline", deps.model);
  Object.assign(trace, { toolsCalled: log.calls, usage: r.usage, latencyMs: r.latencyMs, rounds: r.rounds, promptChars: system.length, stopReason: r.stopReason });

  if (!r.reply) {
    const category = r.stopReason === "refusal" ? "refusal" : "validator";
    const reason = r.stopReason === "refusal" ? "model_refusal" : r.stopReason === "max_rounds" ? "max_tool_rounds" : "unparseable_output";
    trace.escalation = { source: category, reason, category };
    if (r.stopReason === "max_rounds") trace.notes.push(`tool loop hit ${deps.maxRounds} rounds`);
    else if (r.stopReason !== "refusal") trace.notes.push(`parse error: ${r.parseError}`);
    return { reply: handoffReply(category, reason), trace };
  }
  if (r.reply.escalate) trace.escalation = { source: "model", reason: r.reply.escalationReason, category: null };
  return { reply: r.reply, trace };
}
