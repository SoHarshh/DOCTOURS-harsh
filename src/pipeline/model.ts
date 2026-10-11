import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ReplySchema, WorkingMemoryUpdatesSchema, type Reply, type Usage, zeroUsage, addUsage } from "../types.js";
import type { ToolLog } from "../tools/toolLog.js";
import { executeTool } from "../tools/execute.js";

export interface ClientLike { messages: { create(params: any): Promise<any> } }
export interface ModelDeps { client: ClientLike; model: string; effort: "low" | "medium" | "high"; maxRounds: number }
export interface ModelCallInput {
  system: Anthropic.TextBlockParam[];
  user: string;
  tools: Anthropic.Tool[];
  log: ToolLog;
  toolOverrides?: Record<string, unknown>;
}
export interface ModelCallResult {
  reply: Reply | null;
  rawText: string;
  stopReason: string;
  usage: Usage;
  rounds: number;
  latencyMs: number;
  servedModel: string;
  parseError: string | null;
}

const EFFORTS = ["low", "medium", "high"] as const;

const WM = WorkingMemoryUpdatesSchema.shape;
const CS = WM.collectionState.unwrap().shape;

/** Turns nullable fields into optional ones: omitted means "no update", as in the packet's own WorkingMemoryUpdates interface. */
const optionalFields = (shape: Record<string, z.ZodType>) =>
  Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, (v instanceof z.ZodNullable ? (v.unwrap() as z.ZodType) : v).optional()]));

/**
 * The schema sent to the API. The API allows at most 16 union-typed parameters and ReplySchema has 18 nullable
 * fields, so working-memory fields are optional here and filled back to null before ReplySchema parses the output.
 */
const ReplyWireSchema = ReplySchema.extend({
  workingMemoryUpdates: z.object({ ...optionalFields(WM), collectionState: z.object(optionalFields(CS)).optional() }).nullable(),
});

/** Only the wire fields of the output format; the helper's parse function is dropped. Built once so every request is byte-identical. */
const REPLY_FORMAT = (() => {
  const { type, schema } = zodOutputFormat(ReplyWireSchema);
  return { type, schema };
})();

/** Each field's value if its schema accepts it, else null ("no update"). */
const validFields = (shape: Record<string, z.ZodType>, obj: any) =>
  Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, s.safeParse(obj[k] ?? null).success ? obj[k] ?? null : null]));

/**
 * Fills omitted working-memory fields with null so the output matches ReplySchema exactly. A field with an
 * off-list value also becomes null: the SDK moves enum lists into descriptions, so the API does not enforce them,
 * and one bad memory field should not throw away the whole reply.
 */
function normalize(raw: any): unknown {
  const wm = raw?.workingMemoryUpdates;
  if (!wm || typeof wm !== "object") return raw;
  const { collectionState: _cs, ...rest } = WM;
  const cs = wm.collectionState;
  return {
    ...raw,
    workingMemoryUpdates: {
      ...validFields(rest, wm),
      collectionState: cs && typeof cs === "object" ? validFields(CS, cs) : null,
    },
  };
}

export function createDeps(overrides: Partial<ModelDeps> = {}): ModelDeps {
  const effort = process.env.EFFORT ?? "medium";
  if (!(EFFORTS as readonly string[]).includes(effort)) throw new Error(`invalid EFFORT value: ${effort} (expected low, medium or high)`);
  return {
    client: overrides.client ?? new Anthropic(),
    model: process.env.MODEL ?? "claude-haiku-5-5",
    effort: effort as ModelDeps["effort"],
    maxRounds: 8,
    ...overrides,
  };
}

function usageOf(u: any): Usage {
  return {
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
  };
}

/** One model turn: a manual tool loop capped at maxRounds, ending in a structured Reply. Never throws on bad output, only on a wrong served model or an API error. */
export async function callModel(deps: ModelDeps, input: ModelCallInput): Promise<ModelCallResult> {
  const system = input.system.map((b, i) => (i === 0 ? { ...b, cache_control: { type: "ephemeral" as const } } : b));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.user }];
  let usage = zeroUsage();
  let rounds = 0;
  let latencyMs = 0;
  let servedModel = "";
  let stopReason = "";
  let rawText = "";
  const result = (reply: Reply | null, parseError: string | null): ModelCallResult =>
    ({ reply, rawText, stopReason, usage, rounds, latencyMs, servedModel, parseError });

  while (rounds < deps.maxRounds) {
    rounds++;
    const t0 = Date.now();
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: 8192,
      system,
      tools: input.tools,
      messages,
      output_config: { effort: deps.effort, format: REPLY_FORMAT },
    });
    latencyMs += Date.now() - t0;
    usage = addUsage(usage, usageOf(res.usage));
    servedModel = res.model ?? "";
    if (servedModel && !servedModel.startsWith(deps.model)) throw new Error(`served model ${servedModel} != requested ${deps.model}`);
    stopReason = res.stop_reason ?? "";

    if (stopReason === "refusal") return result(null, "refusal");

    const content = (res.content ?? []) as any[];
    const toolUses = content.filter((b) => b.type === "tool_use");
    if (stopReason === "tool_use" && toolUses.length > 0) {
      messages.push({ role: "assistant", content });
      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: executeTool(tu.name, tu.input, input.log, input.toolOverrides),
      }));
      messages.push({ role: "user", content: results });
      continue;
    }

    rawText = content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return result(ReplySchema.parse(normalize(JSON.parse(rawText))), null);
    } catch (e) {
      return result(null, String(e).slice(0, 300));
    }
  }
  stopReason = "max_rounds";
  return result(null, "max_rounds");
}
