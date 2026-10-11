import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, type Context } from "./context/buildContext.js";
import { createDeps, type ClientLike, type ModelDeps } from "./pipeline/model.js";
import { handoffReply } from "./pipeline/escalationReply.js";
import { runBaseline } from "./baseline/monolith.js";
import { RESULTS_DIR } from "./paths.js";
import { emptyTrace, type Reply, type Trace } from "./types.js";

export type SystemName = "new" | "baseline";
export interface Message { id: string; text: string }
export interface Args { system: SystemName; in?: string; out?: string; trace?: string; model?: string }
export interface RunAllOpts { client?: ClientLike; concurrency?: number }

const FLAGS = ["system", "in", "out", "trace", "model"] as const;

export function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = { system: "new" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const name = a.startsWith("--") ? a.slice(2) : null;
    if (!name || !(FLAGS as readonly string[]).includes(name)) throw new Error(`unknown argument ${a} (expected ${FLAGS.map((f) => `--${f}`).join(", ")})`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${a} needs a value`);
    out[name] = value;
    i++;
  }
  if (out.system !== "new" && out.system !== "baseline") throw new Error(`--system must be "new" or "baseline", got "${out.system}"`);
  return out as unknown as Args;
}

/** Validates the CLI input: a JSON array of {id, text}. A missing id is filled from the item's position. */
export function parseMessages(raw: string): Message[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("input is not valid JSON; expected a JSON array of {id, text}"); }
  if (!Array.isArray(data)) throw new Error("input must be a JSON array of {id, text}");
  return data.map((item: any, i) => {
    if (!item || typeof item !== "object" || typeof item.text !== "string") throw new Error(`item ${i} needs a string "text" field`);
    return { id: item.id === undefined || item.id === null ? `msg-${i}` : String(item.id), text: item.text };
  });
}

type RunOne = (ctx: Context, m: Message, deps: ModelDeps) => Promise<{ reply: Reply; trace: Trace }>;

async function runnerFor(system: SystemName): Promise<RunOne> {
  if (system === "baseline") return (ctx, m, deps) => runBaseline(ctx, m.text, deps, m.id);
  const { runMessage } = await import("./pipeline/runMessage.js");
  return (ctx, m, deps) => runMessage(ctx, m.text, { deps, id: m.id });
}

/** A message whose run threw (API error after retries): a person takes over, the batch goes on. */
function failedTurn(system: SystemName, m: Message, model: string, err: unknown): { reply: Reply; trace: Trace } {
  const trace = emptyTrace(m.id, system, model);
  trace.escalation = { source: "validator", reason: "system_error", category: "validator" };
  trace.notes.push(`error: ${oneLine(err)}`);
  return { reply: handoffReply("validator", "system_error"), trace };
}

/**
 * Runs every message as an independent turn on the same fixed history and returns replies in input order.
 * Up to `concurrency` turns run at once (env CONCURRENCY, default 4). Throws only if every message failed.
 */
export async function runAll(system: SystemName, messages: Message[], model?: string, opts: RunAllOpts = {}) {
  if (messages.length === 0) return { replies: [] as Reply[], traces: [] as Trace[] };
  const deps = createDeps({ ...(model ? { model } : {}), ...(opts.client ? { client: opts.client } : {}) });
  const runOne = await runnerFor(system);
  const concurrency = Math.max(1, opts.concurrency ?? (Number(process.env.CONCURRENCY) || 4));
  const results: { reply: Reply; trace: Trace }[] = new Array(messages.length);
  const errors: unknown[] = [];
  let next = 0;

  const worker = async () => {
    while (next < messages.length) {
      const i = next++;
      const m = messages[i];
      try {
        results[i] = await runOne(buildContext(), m, deps);
      } catch (e) {
        errors.push(e);
        process.stderr.write(`warning: message ${m.id} failed and was handed to a person: ${oneLine(e)}\n`);
        results[i] = failedTurn(system, m, deps.model, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, messages.length) }, worker));
  if (errors.length === messages.length) throw errors[0];
  return { replies: results.map((r) => r.reply), traces: results.map((r) => r.trace) };
}

function oneLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/\s*\n\s*/g, " ").trim();
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const messages = parseMessages(readFileSync(args.in ?? 0, "utf8"));
    const { replies, traces } = await runAll(args.system, messages, args.model);
    const json = JSON.stringify(replies, null, 2) + "\n";
    if (args.out) writeFileSync(args.out, json); else process.stdout.write(json);
    const tracePath = args.trace ?? join(RESULTS_DIR, "traces.jsonl");
    mkdirSync(dirname(tracePath), { recursive: true });
    writeFileSync(tracePath, traces.map((t) => JSON.stringify(t) + "\n").join(""));
    process.stderr.write(`wrote ${replies.length} replies; traces in ${tracePath}\n`);
  } catch (e) {
    process.stderr.write(`error: ${oneLine(e)}\n`);
    process.exitCode = 1;
  }
}

/** True when this file is the entry point; compares real paths so a symlinked checkout still runs. */
function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isEntryPoint()) await main();
