import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One policy module. Frontmatter decides when it loads; the body is policy text cut from the
 * original prompt.
 *
 *   ---
 *   name: carecredit
 *   precedence: 20                 lower loads first
 *   triggers: [carecredit, care credit, /\bcherry\b/i]
 *   stages: []                     empty = any pipeline status
 *   context_triggers: []           predicates named in router.ts
 *   suppresses: []                 modules dropped when this one also matched
 *   description: The patient ...   optional; one sentence of patient intent for the fallback classifier
 *   ---
 */
export interface Skill {
  name: string;
  precedence: number;
  triggers: (string | RegExp)[];
  stages: string[];
  contextTriggers: string[];
  suppresses: string[];
  /** When the module is needed, in patient terms. Read by the fallback classifier. */
  description?: string;
  body: string;
  file: string;
}

/** Splits "[a, b, /x{1,2}/i]" on commas that are not inside a /regex/. */
function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  const out: string[] = [];
  let cur = "";
  let inRegex = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "/" && !inRegex && cur.trim() === "") inRegex = true;
    else if (ch === "/" && inRegex && inner[i - 1] !== "\\") inRegex = false;
    if (ch === "," && !inRegex) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter((s) => s !== "");
}

/** "/src/flags" becomes a case-insensitive RegExp; anything else is a lower-case whole-word phrase. */
function toTrigger(s: string): string | RegExp {
  const m = s.match(/^\/(.+)\/([a-z]*)$/);
  if (!m) return s.toLowerCase();
  const flags = m[2].includes("i") ? m[2] : m[2] + "i";
  return new RegExp(m[1], flags.replace("g", ""));
}

export function parseSkill(file: string, text: string): Skill {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!fm.name) throw new Error(`${file}: frontmatter needs name`);
  return {
    name: fm.name,
    precedence: Number(fm.precedence ?? 50),
    triggers: parseList(fm.triggers ?? "[]").map(toTrigger),
    stages: parseList(fm.stages ?? "[]"),
    contextTriggers: parseList(fm.context_triggers ?? "[]"),
    suppresses: parseList(fm.suppresses ?? "[]"),
    ...(fm.description ? { description: fm.description } : {}),
    body: m[2].trim(),
    file,
  };
}

export function loadSkills(dir: string): Skill[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseSkill(f, readFileSync(join(dir, f), "utf8")));
}
