import { pathToFileURL } from "node:url";
import { buildContext, type Context } from "../src/context/buildContext.js";
import { SKILLS_DIR } from "../src/paths.js";
import type { CaseFile } from "./checker.js";
import { loadCases } from "./run.js";

/**
 * Blast radius of a policy module: `npm run blast -- <module>` routes every test case through the pre-gate and
 * the router, with no model call, and lists the cases whose prompt would include that module. Editing the module
 * can change only those replies.
 */

export interface BlastDeps<S extends { name: string }> {
  skills: S[];
  pregate: (text: string) => { escalate: boolean };
  route: (ctx: Context, text: string, all: S[]) => { skills: { name: string }[]; matched: { skill: string; by: string }[] };
}

export interface BlastResult { module: string; total: number; gated: number; hits: { id: string; by: string }[] }

export function blastRadius<S extends { name: string }>(module: string, cases: CaseFile[], d: BlastDeps<S>): BlastResult {
  if (!d.skills.some((s) => s.name === module)) {
    throw new Error(`unknown module ${module}; known: ${d.skills.map((s) => s.name).join(", ")}`);
  }
  let gated = 0;
  const hits: BlastResult["hits"] = [];
  for (const c of cases) {
    if (d.pregate(c.text).escalate) { gated++; continue; }
    const routed = d.route(buildContext((c.contextOverrides ?? {}) as Partial<Context>), c.text, d.skills);
    if (routed.skills.some((s) => s.name === module)) hits.push({ id: c.id, by: routed.matched.find((m) => m.skill === module)?.by ?? "" });
  }
  return { module, total: cases.length, gated, hits };
}

async function main(module: string | undefined) {
  if (!module) throw new Error("usage: npm run blast -- <module>");
  const [{ pregate }, { route }, { loadSkills }] = await Promise.all([
    import("../src/pipeline/pregate.js"), import("../src/pipeline/router.js"), import("../src/pipeline/skills.js"),
  ]);
  const r = blastRadius(module, loadCases(), { skills: loadSkills(SKILLS_DIR), pregate, route });
  console.log(`Module "${r.module}" loads for ${r.hits.length} of ${r.total} cases (${r.gated} pre-gated cases never reach the model). Editing it can change only these:`);
  const width = Math.max(0, ...r.hits.map((h) => h.id.length));
  for (const h of r.hits) console.log(`  ${h.id.padEnd(width)}  ${h.by}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
