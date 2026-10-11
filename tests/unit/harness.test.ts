import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { costUsd } from "../../harness/rates.js";
import { summarize, paired, percentile, renderTable, type Row } from "../../harness/compare.js";
import { parseArgs, loadCases, pickWarmup, runCases, withTimeout, TimeoutError } from "../../harness/run.js";
import { blastRadius } from "../../harness/blast.js";
import type { CaseFile } from "../../harness/checker.js";
import { CASES_DIR } from "../../src/paths.js";
import { emptyTrace, type ToolUseLabel } from "../../src/types.js";
import { baseReply } from "./fakeClient.js";

afterEach(() => { vi.restoreAllMocks(); });

const usage = (input = 1000, output = 100, cacheRead = 0, cacheWrite = 0) => ({ input, output, cacheRead, cacheWrite });

describe("costUsd", () => {
  it("prices Haiku 5.5 per million tokens", () => {
    expect(costUsd("claude-haiku-5-5", usage(1_000_000, 0))).toBeCloseTo(0.10, 9);
    expect(costUsd("claude-haiku-5-5", usage(2_000_000, 1_000_000, 10_000_000, 4_000_000))).toBeCloseTo(0.2 + 0.5 + 0.1 + 0.5, 9);
  });
  it("prices Sonnet 5.5 and Opus 5.5", () => {
    expect(costUsd("claude-sonnet-5-5", usage(1_000_000, 1_000_000, 1_000_000, 1_000_000))).toBeCloseTo(2 + 10 + 0.2 + 2.5, 9);
    expect(costUsd("claude-opus-5-5", usage(1_000_000, 1_000_000, 1_000_000, 1_000_000))).toBeCloseTo(4 + 20 + 0.2 + 5, 9);
  });
  it("matches a served model id with a suffix", () => {
    expect(costUsd("claude-sonnet-5-5-20261001", usage(1_000_000, 0))).toBeCloseTo(2, 9);
  });
  it("falls back to Haiku rates with a warning for an unknown model", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(costUsd("mystery-model", usage(1_000_000, 0))).toBeCloseTo(0.10, 9);
    expect(warn).toHaveBeenCalled();
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const xs = [1000, 100, 900, 200, 800, 300, 700, 400, 600, 500];
    expect(percentile(xs, 0.5)).toBe(500);
    expect(percentile(xs, 0.95)).toBe(1000);
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([], 0.5)).toBe(0);
  });
});

type RowOpts = { tags?: string[]; esc?: boolean; label?: ToolUseLabel | null; input?: number; latency?: number; retried?: boolean; retryFixed?: boolean | null; gated?: boolean; cost?: number };
function row(caseId: string, rep: number, pass: boolean, o: RowOpts = {}): Row {
  const trace = emptyTrace(caseId, "new", "claude-haiku-5-5");
  trace.usage = usage(o.input ?? 1000, 100, 2000, 0);
  trace.latencyMs = o.latency ?? 500;
  trace.promptChars = 5000;
  trace.retried = o.retried ?? false;
  trace.retryFixed = o.retryFixed ?? null;
  if (o.gated) trace.escalation = { source: "pregate", reason: "r", category: "human_request" };
  return {
    caseId, rep, tags: o.tags ?? ["escalate-negative"], pass, checks: [],
    toolUseLabel: o.label === undefined ? "Context" : o.label,
    reply: baseReply({ escalate: o.esc ?? false }) as any, trace, costUsd: o.cost ?? 0.001,
  };
}

describe("summarize", () => {
  const rows: Row[] = [
    row("a", 0, true, { tags: ["escalate-positive"], esc: true, gated: true, label: "Gated" }),
    row("a", 1, true, { tags: ["escalate-positive"], esc: true, gated: true, label: "Gated" }),
    row("b", 0, false, { tags: ["escalate-positive"], esc: false }),
    row("b", 1, true, { tags: ["escalate-positive"], esc: true }),
    row("c", 0, true, { tags: ["pricing", "escalate-negative"], esc: false }),
    row("c", 1, false, { tags: ["pricing", "escalate-negative"], esc: true }),
  ];

  it("computes pass rate overall, per rep, per tag and per case", () => {
    const s = summarize(rows);
    expect(s.n).toBe(6);
    expect(s.passRate).toBeCloseTo(4 / 6, 9);
    expect(s.passRateByRep).toEqual([2 / 3, 2 / 3]);
    expect(s.byTag["pricing"]).toEqual({ n: 2, passRate: 0.5 });
    expect(s.perCase["b"]).toEqual({ n: 2, passes: 1 });
  });
  it("sorts reps numerically", () => {
    const s = summarize([row("a", 10, false), row("a", 2, true)]);
    expect(s.passRateByRep).toEqual([1, 0]);
  });
  it("computes escalation precision and recall from the escalate-positive tag", () => {
    const s = summarize(rows);
    expect(s.escalation).toMatchObject({ tp: 3, fn: 1, fp: 1, tn: 1 });
    expect(s.escalation.recall).toBeCloseTo(3 / 4, 9);
    expect(s.escalation.precision).toBeCloseTo(3 / 4, 9);
  });
  it("reports null precision and recall when nothing escalated or nothing should", () => {
    const s = summarize([row("x", 0, true)]);
    expect(s.escalation.recall).toBeNull();
    expect(s.escalation.precision).toBeNull();
  });
  it("computes tool-use rates over tool-required and control cases, excluding gated turns", () => {
    const req = ["tool-required", "escalate-negative"];
    const ctl = ["control", "escalate-negative"];
    const s = summarize([
      row("p1", 0, true, { tags: req, label: "Clean" }),
      row("p2", 0, false, { tags: req, label: "Tool-Skip" }),
      row("p3", 0, false, { tags: req, label: "Result-Ignore" }),
      row("p4", 0, false, { tags: req, label: "Output-Fabrication" }),
      row("p5", 0, true, { tags: req, label: "Gated", gated: true }),
      row("k1", 0, true, { tags: ctl, label: "Clean" }),
      row("k2", 0, false, { tags: ctl, label: "Unnecessary-Tool-Use" }),
      row("k3", 0, true, { tags: ctl, label: "Gated", gated: true }),
    ]);
    expect(s.toolUse.required).toBe(4);
    expect(s.toolUse.control).toBe(2);
    expect(s.toolUse.ctur).toBeCloseTo(0.25, 9);
    expect(s.toolUse.tsr).toBeCloseTo(0.25, 9);
    expect(s.toolUse.rir).toBeCloseTo(0.25, 9);
    expect(s.toolUse.ofr).toBeCloseTo(0.25, 9);
    expect(s.toolUse.utr).toBeCloseTo(0.5, 9);
    expect(s.toolUse.labels["Gated"]).toBeUndefined();
    expect(s.toolUse.labels["Clean"]).toBe(1);
  });
  it("reports null tool-use rates when the run had no such cases", () => {
    const s = summarize([row("x", 0, true)]);
    expect(s.toolUse.ctur).toBeNull();
    expect(s.toolUse.utr).toBeNull();
  });
  it("computes retry rate over model-called turns and the first-retry fix rate", () => {
    const s = summarize([
      row("a", 0, true, { retried: true, retryFixed: true }),
      row("b", 0, false, { retried: true, retryFixed: false }),
      row("c", 0, true),
      row("d", 0, true, { gated: true, label: "Gated" }),
    ]);
    expect(s.retry).toMatchObject({ retried: 2, fixed: 1 });
    expect(s.retry.rate).toBeCloseTo(2 / 3, 9);
    expect(s.retry.fixRate).toBeCloseTo(0.5, 9);
    expect(summarize([row("c", 0, true)]).retry.fixRate).toBeNull();
  });
  it("computes latency percentiles, token means and cost per 1,000 turns", () => {
    const s = summarize([
      row("a", 0, true, { latency: 100, input: 1000, cost: 0.002 }),
      row("b", 0, true, { latency: 300, input: 3000, cost: 0.004 }),
    ]);
    expect(s.latency).toEqual({ p50: 100, p95: 300 });
    expect(s.meanInput).toBe(2000);
    expect(s.meanCacheRead).toBe(2000);
    expect(s.meanOutput).toBe(100);
    expect(s.meanPromptChars).toBe(5000);
    expect(s.costPer1000).toBeCloseTo(3, 9);
  });
});

describe("paired", () => {
  it("counts per-case wins, losses and ties of b against a, with the mean difference and its standard error", () => {
    const a = summarize([row("w", 0, false), row("w", 1, false), row("l", 0, true), row("l", 1, true), row("t", 0, true), row("t", 1, false), row("only-a", 0, true)]);
    const b = summarize([row("w", 0, true), row("w", 1, true), row("l", 0, false), row("l", 1, true), row("t", 0, false), row("t", 1, true), row("only-b", 0, true)]);
    const p = paired(a, b);
    expect(p).toMatchObject({ n: 3, wins: 1, losses: 1, ties: 1 });
    // per-case differences: +1, -0.5, 0
    expect(p.meanDiff).toBeCloseTo(0.5 / 3, 9);
    const sd = Math.sqrt(((1 - 0.5 / 3) ** 2 + (-0.5 - 0.5 / 3) ** 2 + (0 - 0.5 / 3) ** 2) / 2);
    expect(p.se).toBeCloseTo(sd / Math.sqrt(3), 9);
  });
  it("has no standard error with fewer than two shared cases", () => {
    expect(paired(summarize([row("x", 0, true)]), summarize([row("x", 0, false)])).se).toBeNull();
  });
});

describe("renderTable", () => {
  const a = summarize([row("x", 0, true), row("y", 0, false, { tags: ["pricing", "escalate-negative"] })]);
  const b = summarize([row("x", 0, true), row("y", 0, true, { tags: ["pricing", "escalate-negative"] })]);
  const md = renderTable({ name: "baseline", s: a, errors: 2 }, { name: "new", s: b, errors: 0 });

  it("has one column per system", () => {
    expect(md).toContain("| Metric | baseline | new |");
  });
  it("shows pass rate with per-rep rates, and n/a for undefined rates", () => {
    expect(md).toMatch(/\| Pass rate \(all checks\) \| 50\.0% \(reps 50\.0%\) \| 100\.0% \(reps 100\.0%\) \|/);
    expect(md).toMatch(/\| Escalation recall \| n\/a \| n\/a \|/);
    expect(md).toMatch(/\| Clean Tool-Use Rate[^|]*\| n\/a \| n\/a \|/);
  });
  it("lists every metric the comparison reports", () => {
    for (const label of ["Escalation precision", "Tool-Skip", "Result-Ignore", "Output-Fabrication", "Unnecessary-Tool-Use",
      "Retry rate", "First-retry fix rate", "Latency p50", "Latency p95", "Mean prompt size", "Mean uncached input",
      "Mean cache-read", "Mean output", "Cost per 1,000 turns", "Infra errors excluded"]) expect(md, label).toContain(label);
    expect(md).toMatch(/\| Infra errors excluded \| 2 \| 0 \|/);
  });
  it("states the paired per-case result", () => {
    expect(md).toContain("new vs baseline on 2 shared cases: 1 wins, 0 losses, 1 ties");
  });
  it("adds a per-tag table, sorted", () => {
    const tagRows = md.split("\n").filter((l) => /^\| (escalate-negative|pricing) \|/.test(l));
    expect(tagRows).toEqual(["| escalate-negative | 50.0% (2) | 100.0% (2) |", "| pricing | 0.0% (1) | 100.0% (1) |"]);
  });
});

describe("parseArgs", () => {
  it("defaults to the new system, 3 reps, concurrency 4, every case", () => {
    expect(parseArgs([])).toMatchObject({ system: "new", reps: 3, concurrency: 4, cases: CASES_DIR, tag: undefined, model: undefined, out: undefined });
  });
  it("reads every flag", () => {
    expect(parseArgs(["--system", "baseline", "--reps", "1", "--tag", "trap", "--concurrency", "2", "--model", "claude-sonnet-5-5", "--out", "x.json", "--timeout", "5000"]))
      .toMatchObject({ system: "baseline", reps: 1, tag: "trap", concurrency: 2, model: "claude-sonnet-5-5", out: "x.json", timeoutMs: 5000 });
  });
  it("rejects bad values and unknown flags", () => {
    expect(() => parseArgs(["--system", "old"])).toThrow(/system/);
    expect(() => parseArgs(["--reps", "0"])).toThrow(/reps/);
    expect(() => parseArgs(["--concurrency", "x"])).toThrow(/concurrency/);
    expect(() => parseArgs(["--bogus", "1"])).toThrow(/unknown/);
    expect(() => parseArgs(["--tag"])).toThrow(/tag/);
  });
});

describe("loadCases and pickWarmup", () => {
  it("loads every case file, and filters by tag", () => {
    const all = loadCases(CASES_DIR);
    expect(all.length).toBeGreaterThanOrEqual(70);
    const traps = loadCases(CASES_DIR, "trap");
    expect(traps.length).toBeGreaterThan(0);
    expect(traps.every((c) => c.tags.includes("trap"))).toBe(true);
  });
  it("warms up on the first case that reaches the model", () => {
    const cs = [{ id: "h", expect: { escalate: true } }, { id: "q", expect: { escalate: false } }] as CaseFile[];
    expect(pickWarmup(cs)?.id).toBe("q");
    expect(pickWarmup([cs[0]])?.id).toBe("h");
  });
});

describe("withTimeout", () => {
  it("rejects with a TimeoutError when the work is slower than the limit", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toBeInstanceOf(TimeoutError);
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe("runCases", () => {
  const mk = (id: string, tags = ["escalate-negative"]): CaseFile => ({ id, text: id, tags, expect: { escalate: false } });
  const ok = (id: string) => ({ reply: baseReply({ response: id }) as any, trace: emptyTrace(id, "new", "claude-haiku-5-5") });
  const base = {
    reps: 1, concurrency: 2, timeoutMs: 200,
    check: (_c: CaseFile, reply: any) => [{ name: "notEmpty", pass: reply.response !== "bad", detail: "" }],
    classify: () => "Clean" as ToolUseLabel,
    cost: () => 0.5,
  };

  it("records one scored row per case and rep, sorted, with checks, label and cost", async () => {
    const res = await runCases([mk("b"), mk("a")], { ...base, reps: 2, run: async (c) => ok(c.id === "b" ? "bad" : c.id) });
    expect(res.errors).toEqual([]);
    expect(res.rows.map((r) => `${r.caseId}#${r.rep}`)).toEqual(["a#0", "a#1", "b#0", "b#1"]);
    expect(res.rows.map((r) => r.pass)).toEqual([true, true, false, false]);
    expect(res.rows[0]).toMatchObject({ tags: ["escalate-negative"], toolUseLabel: "Clean", costUsd: 0.5 });
    expect(res.rows[0].checks).toEqual([{ name: "notEmpty", pass: true, detail: "" }]);
  });
  it("sends infra failures to errors with a kind, never to rows", async () => {
    const run = async (c: CaseFile) => {
      const r = ok(c.id);
      switch (c.id) {
        case "api": throw new Anthropic.APIConnectionError({ message: "connection reset" });
        case "slow": return new Promise<never>(() => {});
        case "mismatch": throw new Error("served model claude-x != requested claude-haiku-5-5");
        case "bug": throw new TypeError("cannot read properties of undefined");
        case "trunc": r.trace.stopReason = "max_tokens"; return r;
        case "unparse-new": r.trace.escalation = { source: "validator", reason: "validator:unparseable", category: "validator" }; return r;
        case "unparse-base": r.trace.escalation = { source: "validator", reason: "unparseable_output", category: "validator" }; return r;
        default: return r;
      }
    };
    const ids = ["api", "slow", "mismatch", "bug", "trunc", "unparse-new", "unparse-base", "fine"];
    const res = await runCases(ids.map((i) => mk(i)), { ...base, concurrency: 8, timeoutMs: 30, run });
    expect(res.rows.map((r) => r.caseId)).toEqual(["fine"]);
    const kinds = Object.fromEntries(res.errors.map((e) => [e.caseId, e.kind]));
    expect(kinds).toEqual({ api: "api", slow: "timeout", mismatch: "model-mismatch", bug: "harness", trunc: "truncated", "unparse-new": "unparseable", "unparse-base": "unparseable" });
    for (const e of res.errors) { expect(e.rep).toBe(0); expect(e.message.length).toBeGreaterThan(0); }
  });
  it("keeps a row with a null label when the classifier throws", async () => {
    const res = await runCases([mk("a")], { ...base, run: async (c) => ok(c.id), classify: () => { throw new Error("boom"); } });
    expect(res.errors).toEqual([]);
    expect(res.rows[0].toolUseLabel).toBeNull();
  });
  it("never runs more cases at once than the concurrency limit", async () => {
    let inFlight = 0, peak = 0;
    const run = async (c: CaseFile) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return ok(c.id); };
    const res = await runCases(["a", "b", "c", "d", "e", "f"].map((i) => mk(i)), { ...base, concurrency: 2, run });
    expect(res.rows.length).toBe(6);
    expect(peak).toBe(2);
  });
});

describe("blastRadius", () => {
  const cases: CaseFile[] = [
    { id: "cc", text: "do you take carecredit?", tags: [], expect: { escalate: false } },
    { id: "cc-human", text: "carecredit? get me a human", tags: [], expect: { escalate: true } },
    { id: "price", text: "what does Heva cost?", tags: [], expect: { escalate: false } },
    { id: "lead-cc", text: "carecredit ok?", tags: [], contextOverrides: { PIPELINE_STATUS: "LEAD" }, expect: { escalate: false } },
  ];
  const skills = [{ name: "carecredit" }, { name: "stage-lead" }, { name: "stage-pre-clinical-sent" }] as any[];
  const deps = {
    skills,
    pregate: (t: string) => ({ escalate: /human/.test(t) }),
    route: (ctx: any, t: string) => {
      const stage = ctx.PIPELINE_STATUS === "LEAD" ? "stage-lead" : "stage-pre-clinical-sent";
      const loaded = [{ name: stage }, ...(/carecredit/.test(t) ? [{ name: "carecredit" }] : [])];
      return { skills: loaded, matched: loaded.map((s) => ({ skill: s.name, by: s.name.startsWith("stage") ? "stage" : "trigger:carecredit" })) } as any;
    },
  };

  it("lists the cases whose routing loads the module, skipping pre-gated messages", () => {
    const r = blastRadius("carecredit", cases, deps);
    expect(r.hits.map((h) => h.id)).toEqual(["cc", "lead-cc"]);
    expect(r.hits[0].by).toBe("trigger:carecredit");
    expect(r.gated).toBe(1);
    expect(r.total).toBe(4);
  });
  it("applies each case's context overrides before routing", () => {
    expect(blastRadius("stage-lead", cases, deps).hits.map((h) => h.id)).toEqual(["lead-cc"]);
  });
  it("rejects a module name that does not exist", () => {
    expect(() => blastRadius("nope", cases, deps)).toThrow(/unknown module nope.*carecredit/);
  });
});
