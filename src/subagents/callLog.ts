import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "../context/buildContext.js";
import type { ModelDeps } from "../pipeline/model.js";
import type { Usage } from "../types.js";
import { getFullCalls } from "../tools/fixtures.js";
import { ROOT } from "../paths.js";

/**
 * Call-log summarization, handled as a separate small task (packet problem 4).
 *
 * Summaries are computed once per call, ahead of time, by scripts/precompute-call-summaries.ts,
 * and stored in data/call-summaries.json. A reply only reads that store, so no patient message
 * waits on this model call. If a call has no stored summary yet, the call record's own short
 * summary is used instead; there is never a live model call on the reply path.
 */

export const SUMMARY_STORE = join(ROOT, "data", "call-summaries.json");

type CallRecord = ReturnType<typeof getFullCalls>["calls"][number];
export type SummaryStore = Record<string, string>;

const CALL_RE = /\b(?:on the call|the call|our call|that call|phone call|on the phone|when we (?:spoke|talked)|what did we (?:discuss|talk about|say)|you said (?:on|during)|last time we spoke|the consultation call)\b/i;

export function isAboutCall(text: string): boolean {
  return CALL_RE.test(text);
}

export function loadCallSummaries(path = SUMMARY_STORE): SummaryStore {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as SummaryStore;
}

/** One small model call over one call record. Used only by the precompute script. */
export async function summarizeCall(deps: ModelDeps, call: CallRecord): Promise<{ text: string; usage: Usage }> {
  const res = await deps.client.messages.create({
    model: deps.model,
    max_tokens: 300,
    output_config: { effort: "low" },
    system: "You summarize one phone call record for a patient coordinator. Write two plain sentences: what the patient wanted, and what was agreed as the next step. Use only facts in the record. No markdown.",
    messages: [{ role: "user", content: `Call record (summary and transcript):\n${JSON.stringify(call, null, 2)}` }],
  });
  const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  const u = res.usage ?? {};
  return { text, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } };
}

/** The context block to add when the patient asks about a call, or null when it is not needed. */
export function callSummaryExtra(ctx: Context, text: string, store: SummaryStore = loadCallSummaries()): string | null {
  if (!isAboutCall(text) || !ctx.RECENT_CALLS.trim()) return null;
  const calls = getFullCalls({ chatId: ctx.SUPABASE_CHAT_ID }).calls;
  if (!calls.length) return null;
  const lines = calls.map((c) => `- ${c.createdAt} (${c.direction}, ${Math.round(c.duration / 60)} min): ${store[c.id] ?? c.summary}`);
  return `# Call summary (prepared from the call transcript)\n${lines.join("\n")}`;
}
