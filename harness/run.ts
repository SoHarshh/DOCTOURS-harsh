import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { buildContext, type Context } from "../src/context/buildContext.js";
import { CASES_DIR, RESULTS_DIR } from "../src/paths.js";
import type { Reply, Trace, ToolUseLabel } from "../src/types.js";
import type { CaseFile, CheckResult } from "./checker.js";
import type { ErrorKind, Row, RunError, RunFile } from "./compare.js";
import { costUsd } from "./rates.js";

/**
 * Eval runner: `npm run eval -- --system new|baseline [--reps 3] [--tag t] [--concurrency 4] [--model id] [--out file] [--timeout ms]`.
 * Runs every case (or every case with the tag) `reps` times through one system, scores each turn with the checker
 * and the ToolFailBench labeler, and writes { meta, rows, errors }. Infra failures go to errors, never to rows.
 */

export interface RunArgs {
  system: "new" | "baseline"; reps: number; concurrency: number; timeoutMs: number; cases: string;
  tag?: string; model?: string; out?: string;
}

const FLAGS = new Set(["system", "reps", "tag", "concurrency", "model", "out", "cases", "timeout"]);

export function parseArgs(argv: string[]): RunArgs {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    const key = argv[i].slice(2);
    if (!FLAGS.has(key)) throw new Error(`unknown flag --${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value`);
    raw[key] = value;
    i++;
  }
  const int = (key: string, fallback: number) => {
    if (!(key in raw)) return fallback;
    const n = Number(raw[key]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${key} must be a positive integer, got ${raw[key]}`);
    return n;
  };
  const system = raw.system ?? "new";
  if (system !== "new" && system !== "baseline") throw new Error(`--system must be new or baseline, got ${system}`);
  return {
    system, reps: int("reps", 3), concurrency: int("concurrency", 4), timeoutMs: int("timeout", 180_000),
    cases: raw.cases ?? CASES_DIR, tag: raw.tag, model: raw.model, out: raw.out,
  };
}

/** Every case in every *.json file of `dir`, files in name order, optionally only those with `tag`. */
export function loadCases(dir: string = CASES_DIR, tag?: string): CaseFile[] {
  const all = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CaseFile[]);
  return tag ? all.filter((c) => c.tags.includes(tag)) : all;
}

/** The warm-up turn: the first case expected to reach the model, so the prompt cache is written before scoring. */
export function pickWarmup(cases: CaseFile[]): CaseFile | undefined {
  return cases.find((c) => !c.expect.escalate) ?? cases[0];
}

export class TimeoutError extends Error {
  constructor(ms: number) { super(`timed out after ${ms} ms`); this.name = "TimeoutError"; }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(ms)), ms); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** Why a thrown error is not a model failure. */
export function errorKind(e: unknown): ErrorKind {
  if (e instanceof TimeoutError) return "timeout";
  if (e instanceof Anthropic.APIError) return "api";
  if (e instanceof Error && /^served model /.test(e.message)) return "model-mismatch";
  return "harness";
}

/** A turn that returned but cannot be scored: the output was cut off or never parsed into a Reply. */
function infraIssue(trace: Trace): { kind: ErrorKind; message: string } | null {
  if (trace.stopReason === "max_tokens") return { kind: "truncated", message: "stop reason max_tokens" };
  const reason = trace.escalation?.reason ?? "";
  if (/unparseable/.test(reason)) return { kind: "unparseable", message: [reason, ...trace.notes].join("; ") };
  return null;
}

async function pool<T>(items: T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

export interface RunCasesOpts {
  reps: number; concurrency: number; timeoutMs: number;
  run: (c: CaseFile, rep: number) => Promise<{ reply: Reply; trace: Trace }>;
  check: (c: CaseFile, reply: Reply, trace: Trace) => CheckResult[];
  classify: (c: CaseFile, reply: Reply, trace: Trace) => ToolUseLabel;
  cost: (trace: Trace) => number;
  onProgress?: (done: number, total: number) => void;
}

/** Runs each case `reps` times with at most `concurrency` in flight and a per-turn timeout. */
export async function runCases(cases: CaseFile[], o: RunCasesOpts): Promise<{ rows: Row[]; errors: RunError[] }> {
  const jobs = cases.flatMap((c) => Array.from({ length: o.reps }, (_, rep) => ({ c, rep })));
  const rows: Row[] = [];
  const errors: RunError[] = [];
  let done = 0;
  await pool(jobs, o.concurrency, async ({ c, rep }) => {
    try {
      const { reply, trace } = await withTimeout(o.run(c, rep), o.timeoutMs);
      const issue = infraIssue(trace);
      if (issue) {
        errors.push({ caseId: c.id, rep, ...issue });
      } else {
        const checks = o.check(c, reply, trace);
        let toolUseLabel: ToolUseLabel | null = null;
        try { toolUseLabel = o.classify(c, reply, trace); } catch (e) { trace.notes.push(`toolUseLabel failed: ${(e as Error).message}`); }
        rows.push({ caseId: c.id, rep, tags: c.tags, pass: checks.every((x) => x.pass), checks, toolUseLabel, reply, trace, costUsd: o.cost(trace) });
      }
    } catch (e) {
      errors.push({ caseId: c.id, rep, kind: errorKind(e), message: e instanceof Error ? e.message : String(e) });
    }
    o.onProgress?.(++done, jobs.length);
  });
  const order = (x: { caseId: string; rep: number }, y: { caseId: string; rep: number }) => x.caseId.localeCompare(y.caseId) || x.rep - y.rep;
  return { rows: rows.sort(order), errors: errors.sort(order) };
}

function gitCommit(): string | null {
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; }
}

async function main() {
  await import("dotenv/config");
  const a = parseArgs(process.argv.slice(2));
  // Loaded here, not at the top, so tests and blast.ts can import this file without the model client.
  const [{ createDeps }, { runMessage }, { runBaseline }, { runChecks }, { classifyToolUse }] = await Promise.all([
    import("../src/pipeline/model.js"), import("../src/pipeline/runMessage.js"), import("../src/baseline/monolith.js"),
    import("./checker.js"), import("./toolUseLabel.js"),
  ]);
  const deps = createDeps(a.model ? { model: a.model } : {});
  const cases = loadCases(a.cases, a.tag);
  if (!cases.length) throw new Error(`no cases${a.tag ? ` tagged ${a.tag}` : ""} in ${a.cases}`);

  const run = (c: CaseFile) => {
    const ctx = buildContext((c.contextOverrides ?? {}) as Partial<Context>);
    const toolOverrides = c.toolOverrides ?? {};
    return a.system === "baseline"
      ? runBaseline(ctx, c.text, deps, c.id, toolOverrides)
      : runMessage(ctx, c.text, { deps, id: c.id, toolOverrides });
  };

  const startedAt = new Date().toISOString();
  const warm = pickWarmup(cases)!;
  try { await withTimeout(run(warm), a.timeoutMs); } catch (e) { console.error(`warm-up on ${warm.id} failed (${errorKind(e)}): ${(e as Error).message}`); }

  const { rows, errors } = await runCases(cases, {
    reps: a.reps, concurrency: a.concurrency, timeoutMs: a.timeoutMs, run,
    check: runChecks, classify: classifyToolUse, cost: (t) => costUsd(t.model || deps.model, t.usage),
    onProgress: (d, n) => process.stderr.write(`\r${d}/${n}`),
  });
  process.stderr.write("\n");

  const out = a.out ?? join(RESULTS_DIR, `${a.system}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const file: RunFile = {
    meta: { system: a.system, model: deps.model, effort: deps.effort, reps: a.reps, tag: a.tag ?? null, cases: cases.length, startedAt, finishedAt: new Date().toISOString(), commit: gitCommit() },
    rows, errors,
  };
  writeFileSync(out, JSON.stringify(file, null, 2));

  const passed = rows.filter((r) => r.pass).length;
  console.log(`${a.system} (${deps.model}): ${passed}/${rows.length} turns passed, ${errors.length} infra errors -> ${out}`);
  for (const e of errors) console.log(`  ERROR ${e.caseId}#${e.rep} ${e.kind}: ${e.message}`);
  for (const r of rows.filter((x) => !x.pass)) console.log(`  FAIL ${r.caseId}#${r.rep}: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
