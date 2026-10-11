import { readFileSync, writeFileSync } from "node:fs";
import { runChecks, type CaseFile } from "./checker.js";
import { classifyToolUse } from "./toolUseLabel.js";
import { loadCases } from "./run.js";
import type { RunFile } from "./compare.js";

/**
 * Re-applies the current case expectations and tool-use labels to replies already saved in a run file.
 * No model calls: correcting an over-strict test case never costs a rerun.
 *   npm run rescore -- results/baseline.json [results/new.json ...]
 */
export function rescore(file: RunFile, cases: CaseFile[]): RunFile & { meta: RunFile["meta"] & { rescoredAt: string; droppedCases: string[] } } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const dropped = new Set<string>();
  const rows = file.rows.flatMap((r) => {
    const c = byId.get(r.caseId);
    if (!c) { dropped.add(r.caseId); return []; }
    const checks = runChecks(c, r.reply, r.trace);
    return [{ ...r, tags: c.tags, checks, pass: checks.every((x) => x.pass), toolUseLabel: classifyToolUse(c, r.reply, r.trace) }];
  });
  return { ...file, meta: { ...file.meta, rescoredAt: new Date().toISOString(), droppedCases: [...dropped] }, rows };
}

/** rescore, but refuse when no row matches a case: that means the wrong case folder was passed, and writing would erase the run. */
export function rescoreFileSafe(file: RunFile, cases: CaseFile[]) {
  const after = rescore(file, cases);
  if (file.rows.length > 0 && after.rows.length === 0) throw new Error("no rows matched any case; pass --cases <dir> for this run's case folder");
  return after;
}

const isMain = process.argv[1] && /rescore\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const ci = args.indexOf("--cases");
  const dir = ci >= 0 ? args[ci + 1] : undefined;
  const files = args.filter((_, i) => i !== ci && i !== ci + 1);
  if (!files.length) { console.error("usage: rescore [--cases <dir>] <run.json> [more.json ...]"); process.exit(1); }
  const cases = dir ? loadCases(dir) : loadCases();
  for (const f of files) {
    const before = JSON.parse(readFileSync(f, "utf8")) as RunFile;
    const after = rescoreFileSafe(before, cases);
    writeFileSync(f, JSON.stringify(after, null, 2));
    const was = before.rows.filter((r) => r.pass).length;
    const now = after.rows.filter((r) => r.pass).length;
    console.log(`${f}: ${was} -> ${now} passed of ${after.rows.length}${after.meta.droppedCases.length ? `; dropped ${after.meta.droppedCases.join(", ")}` : ""}`);
  }
}
