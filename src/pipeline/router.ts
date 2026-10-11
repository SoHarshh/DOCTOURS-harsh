import type { Context } from "../context/buildContext.js";
import type { Skill } from "./skills.js";

/**
 * skills: what loads, in prompt order (precedence, then name).
 * stageSkill: the stage module for this pipeline status, or null when none exists.
 * matched: every module whose stage, trigger, or context predicate matched, with the first thing
 *   that matched. Includes modules later dropped by suppression or by the cap; compare with skills.
 * suppressed: conflicts settled in code, one entry per dropped module.
 */
export interface RouteResult {
  skills: Skill[];
  stageSkill: string | null;
  matched: { skill: string; by: string }[];
  suppressed: { winner: string; suppressed: string }[];
}

/** Non-stage modules loaded per message. The stage module is extra. */
export const MAX_MODULES = 3;

const STAGE_ALIAS: Record<string, string> = { MEETING_COMPLETED: "MEETING_BOOKED" };

export function stageSkillName(status: string): string {
  const s = STAGE_ALIAS[status] ?? status;
  return "stage-" + s.toLowerCase().replace(/_/g, "-");
}

const CONTEXT_PREDICATES: Record<string, (ctx: Context) => boolean> = {
  always: () => true,
  collection_outstanding: (ctx) => !/everything is collected/i.test(ctx.COLLECTION_STATUS),
  has_promo: (ctx) => ctx.PROMO_OFFER !== null,
  stage_lead: (ctx) => ctx.PIPELINE_STATUS === "LEAD",
};

function normalize(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLowerCase();
}

function phraseMatches(phrase: string, text: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i").test(text);
}

function triggerHits(s: Skill, ctx: Context, text: string): string[] {
  const hits: string[] = [];
  for (const c of s.contextTriggers) {
    const pred = CONTEXT_PREDICATES[c];
    if (!pred) throw new Error(`${s.file}: unknown context trigger "${c}"`);
    if (pred(ctx)) hits.push(`context:${c}`);
  }
  for (const t of s.triggers) {
    if (t instanceof RegExp ? t.test(text) : phraseMatches(t, text)) hits.push(String(t));
  }
  return hits;
}

const byPrecedence = (a: Skill, b: Skill) => a.precedence - b.precedence || a.name.localeCompare(b.name);

export function route(ctx: Context, text: string, all: Skill[]): RouteResult {
  const norm = normalize(text);
  const stageName = stageSkillName(ctx.PIPELINE_STATUS);
  const matched: RouteResult["matched"] = [];
  let stage: Skill | null = null;
  const candidates: { skill: Skill; hits: number }[] = [];

  for (const s of all) {
    if (s.stages.length && !s.stages.includes(ctx.PIPELINE_STATUS)) continue;
    if (s.name === stageName) {
      stage = s;
      matched.push({ skill: s.name, by: "stage" });
      continue;
    }
    if (s.name.startsWith("stage-")) continue;
    const hits = triggerHits(s, ctx, norm);
    if (hits.length) {
      candidates.push({ skill: s, hits: hits.length });
      matched.push({ skill: s.name, by: hits[0] });
    }
  }

  // Conflicts: a winner drops the modules it suppresses, when both matched. Winners are visited
  // in precedence order and a module already dropped cannot drop others.
  const suppressed: RouteResult["suppressed"] = [];
  const dropped = new Set<string>();
  const present = new Set(candidates.map((c) => c.skill.name));
  for (const { skill: w } of [...candidates].sort((a, b) => byPrecedence(a.skill, b.skill))) {
    if (dropped.has(w.name)) continue;
    for (const loser of w.suppresses) {
      if (present.has(loser) && !dropped.has(loser)) {
        dropped.add(loser);
        suppressed.push({ winner: w.name, suppressed: loser });
      }
    }
  }

  // Cap: most trigger hits first, then lower precedence, then name.
  const kept = candidates
    .filter((c) => !dropped.has(c.skill.name))
    .sort((a, b) => b.hits - a.hits || byPrecedence(a.skill, b.skill))
    .slice(0, MAX_MODULES)
    .map((c) => c.skill);

  const skills = (stage ? [...kept, stage] : kept).sort(byPrecedence);
  return { skills, stageSkill: stage ? stage.name : null, matched, suppressed };
}
