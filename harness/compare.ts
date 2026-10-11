import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Reply, Trace, ToolUseLabel } from "../src/types.js";
import type { CheckResult } from "./checker.js";
import { RESULTS_DIR } from "../src/paths.js";

/** One scored turn: a case at one rep. */
export interface Row {
  caseId: string; rep: number; tags: string[]; pass: boolean; checks: CheckResult[];
  toolUseLabel: ToolUseLabel | null; reply: Reply; trace: Trace; costUsd: number;
}

/** A turn that could not be scored because of infrastructure, not the system under test. */
export type ErrorKind = "timeout" | "api" | "model-mismatch" | "truncated" | "unparseable" | "harness";
export interface RunError { caseId: string; rep: number; kind: ErrorKind; message: string }

export interface RunFile {
  meta: { system: string; model: string; effort: string; reps: number; tag: string | null; cases: number; startedAt: string; finishedAt: string; commit: string | null };
  rows: Row[];
  errors: RunError[];
}

export interface Summary {
  n: number;
  passRate: number;
  passRateByRep: number[];
  byTag: Record<string, { n: number; passRate: number }>;
  perCase: Record<string, { n: number; passes: number }>;
  escalation: { precision: number | null; recall: number | null; tp: number; fp: number; fn: number; tn: number };
  /** ToolFailBench rates. Tool-required and control denominators exclude pre-gated turns, where no model ran. */
  toolUse: {
    required: number; control: number; labels: Record<string, number>;
    ctur: number | null; tsr: number | null; rir: number | null; ofr: number | null; utr: number | null;
  };
  /** Retry rate is over turns that reached the model; fix rate is over retried turns. */
  retry: { retried: number; fixed: number; rate: number | null; fixRate: number | null };
  latency: { p50: number; p95: number };
  meanPromptChars: number; meanInput: number; meanCacheRead: number; meanOutput: number; costPer1000: number;
}

export interface Paired { n: number; wins: number; losses: number; ties: number; meanDiff: number; se: number | null }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ratio = (num: number, den: number) => (den ? num / den : null);
const gated = (r: Row) => r.trace.escalation?.source === "pregate";

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length))) - 1];
}

export function summarize(rows: Row[]): Summary {
  const passOf = (rs: Row[]) => mean(rs.map((r) => (r.pass ? 1 : 0)));

  const byTag: Summary["byTag"] = {};
  for (const tag of [...new Set(rows.flatMap((r) => r.tags))]) {
    const rs = rows.filter((r) => r.tags.includes(tag));
    byTag[tag] = { n: rs.length, passRate: passOf(rs) };
  }
  const perCase: Summary["perCase"] = {};
  for (const r of rows) {
    perCase[r.caseId] ??= { n: 0, passes: 0 };
    perCase[r.caseId].n++;
    if (r.pass) perCase[r.caseId].passes++;
  }

  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const should = r.tags.includes("escalate-positive");
    const did = !!r.reply?.escalate;
    if (should && did) tp++; else if (should) fn++; else if (did) fp++; else tn++;
  }

  const required = rows.filter((r) => r.tags.includes("tool-required") && !gated(r));
  const control = rows.filter((r) => r.tags.includes("control") && !gated(r));
  const labels: Record<string, number> = {};
  for (const r of required) labels[r.toolUseLabel ?? "unlabeled"] = (labels[r.toolUseLabel ?? "unlabeled"] ?? 0) + 1;
  const share = (label: ToolUseLabel) => ratio(required.filter((r) => r.toolUseLabel === label).length, required.length);

  const modelTurns = rows.filter((r) => !gated(r));
  const retried = modelTurns.filter((r) => r.trace.retried);
  const fixed = retried.filter((r) => r.trace.retryFixed === true);
  const latencies = rows.map((r) => r.trace.latencyMs);

  return {
    n: rows.length,
    passRate: passOf(rows),
    passRateByRep: [...new Set(rows.map((r) => r.rep))].sort((a, b) => a - b).map((rep) => passOf(rows.filter((r) => r.rep === rep))),
    byTag,
    perCase,
    escalation: { precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), tp, fp, fn, tn },
    toolUse: {
      required: required.length, control: control.length, labels,
      ctur: share("Clean"), tsr: share("Tool-Skip"), rir: share("Result-Ignore"), ofr: share("Output-Fabrication"),
      utr: ratio(control.filter((r) => r.toolUseLabel === "Unnecessary-Tool-Use").length, control.length),
    },
    retry: { retried: retried.length, fixed: fixed.length, rate: ratio(retried.length, modelTurns.length), fixRate: ratio(fixed.length, retried.length) },
    latency: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    meanPromptChars: mean(rows.map((r) => r.trace.promptChars)),
    meanInput: mean(rows.map((r) => r.trace.usage.input)),
    meanCacheRead: mean(rows.map((r) => r.trace.usage.cacheRead)),
    meanOutput: mean(rows.map((r) => r.trace.usage.output)),
    costPer1000: mean(rows.map((r) => r.costUsd)) * 1000,
  };
}

/** Per-case comparison of b against a, on the cases both ran: each case's pass rate across its reps. */
export function paired(a: Summary, b: Summary): Paired {
  const ids = Object.keys(a.perCase).filter((id) => id in b.perCase);
  const diffs = ids.map((id) => b.perCase[id].passes / b.perCase[id].n - a.perCase[id].passes / a.perCase[id].n);
  const meanDiff = mean(diffs);
  const se = diffs.length > 1 ? Math.sqrt(diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / (diffs.length - 1)) / Math.sqrt(diffs.length) : null;
  return {
    n: ids.length,
    wins: diffs.filter((d) => d > 0).length,
    losses: diffs.filter((d) => d < 0).length,
    ties: diffs.filter((d) => d === 0).length,
    meanDiff,
    se,
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const num = (x: number) => Math.round(x).toLocaleString("en-US");
const frac = (x: number | null, k: number, n: number) => (x === null ? "n/a" : `${pct(x)} (${k}/${n})`);

export function renderTable(a: { name: string; s: Summary; errors?: number }, b: { name: string; s: Summary; errors?: number }): string {
  const row = (label: string, f: (s: Summary) => string, g?: (x: { errors?: number }) => string) =>
    `| ${label} | ${g ? g(a) : f(a.s)} | ${g ? g(b) : f(b.s)} |`;
  const count = (s: Summary, label: ToolUseLabel) => s.toolUse.labels[label] ?? 0;
  const lines = [
    `| Metric | ${a.name} | ${b.name} |`,
    `|---|---|---|`,
    row("Cases x reps", (s) => String(s.n)),
    row("Pass rate (all checks)", (s) => `${pct(s.passRate)} (reps ${s.passRateByRep.map(pct).join(", ")})`),
    row("Escalation recall", (s) => frac(s.escalation.recall, s.escalation.tp, s.escalation.tp + s.escalation.fn)),
    row("Escalation precision", (s) => frac(s.escalation.precision, s.escalation.tp, s.escalation.tp + s.escalation.fp)),
    row("Clean Tool-Use Rate (tool-required turns)", (s) => frac(s.toolUse.ctur, count(s, "Clean"), s.toolUse.required)),
    row("Tool-Skip rate", (s) => frac(s.toolUse.tsr, count(s, "Tool-Skip"), s.toolUse.required)),
    row("Result-Ignore rate", (s) => frac(s.toolUse.rir, count(s, "Result-Ignore"), s.toolUse.required)),
    row("Output-Fabrication rate", (s) => frac(s.toolUse.ofr, count(s, "Output-Fabrication"), s.toolUse.required)),
    row("Unnecessary-Tool-Use rate (control turns)", (s) => (s.toolUse.utr === null ? "n/a" : `${pct(s.toolUse.utr)} (n=${s.toolUse.control})`)),
    row("Retry rate", (s) => frac(s.retry.rate, s.retry.retried, s.n)),
    row("First-retry fix rate", (s) => frac(s.retry.fixRate, s.retry.fixed, s.retry.retried)),
    row("Latency p50 (ms)", (s) => num(s.latency.p50)),
    row("Latency p95 (ms)", (s) => num(s.latency.p95)),
    row("Mean prompt size (chars)", (s) => num(s.meanPromptChars)),
    row("Mean uncached input tokens", (s) => num(s.meanInput)),
    row("Mean cache-read tokens", (s) => num(s.meanCacheRead)),
    row("Mean output tokens", (s) => num(s.meanOutput)),
    row("Cost per 1,000 turns (USD)", (s) => s.costPer1000.toFixed(2)),
    row("Infra errors excluded", () => "", (x) => String(x.errors ?? 0)),
  ];
  const p = paired(a.s, b.s);
  const diff = `${p.meanDiff >= 0 ? "+" : ""}${(p.meanDiff * 100).toFixed(1)} points`;
  lines.push("", `Paired per case, ${b.name} vs ${a.name} on ${p.n} shared cases: ${p.wins} wins, ${p.losses} losses, ${p.ties} ties. ` +
    `Mean per-case pass-rate difference ${diff}${p.se === null ? "" : ` (SE ${(p.se * 100).toFixed(1)} points)`}.`);
  lines.push("", `| Tag | ${a.name} | ${b.name} |`, `|---|---|---|`);
  const tagCell = (s: Summary, t: string) => (s.byTag[t] ? `${pct(s.byTag[t].passRate)} (${s.byTag[t].n})` : "-");
  for (const t of [...new Set([...Object.keys(a.s.byTag), ...Object.keys(b.s.byTag)])].sort()) lines.push(`| ${t} | ${tagCell(a.s, t)} | ${tagCell(b.s, t)} |`);
  return lines.join("\n") + "\n";
}

function main(argv: string[]) {
  const [fa, fb] = argv;
  if (!fa || !fb) {
    console.error("usage: npm run compare -- <a.json> <b.json>   (b is reported against a)");
    process.exit(1);
  }
  const load = (f: string) => JSON.parse(readFileSync(f, "utf8")) as RunFile;
  const A = load(fa), B = load(fb);
  const label = (f: RunFile) => `${f.meta.system} (${f.meta.model})`;
  const md = renderTable({ name: label(A), s: summarize(A.rows), errors: A.errors.length }, { name: label(B), s: summarize(B.rows), errors: B.errors.length });
  process.stdout.write(md);
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, "compare.md"), md);
  console.error(`wrote ${join(RESULTS_DIR, "compare.md")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
