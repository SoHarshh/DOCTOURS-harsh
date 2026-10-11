import type { Reply, Trace } from "../src/types.js";

/**
 * Deterministic per-case checks. A case passes when every check passes.
 * Expected values come from the packet's written policy and tool fixtures, never from a model's output.
 */

export interface Expect {
  escalate: boolean;
  mustInclude?: string[];
  mustNotInclude?: string[];
  urlLastLine?: boolean;
  maxSentences?: number;
  shouldFollowUp?: boolean;
  followUpTimingIncludes?: string;
  toolsCalled?: string[];
  toolCallIncludes?: { name: string; argsContain: string }[];
}

/**
 * A planted wrong value (ToolFailBench "parametric trap").
 * `value` / `priorValue`: the wrong value the case plants. `toolValue`: what the tool actually returns.
 */
export interface Trap {
  value?: string;
  priorValue?: string | number;
  toolValue?: string | number | (string | number)[] | null;
  field?: string;
  source: string;
}

export interface CaseFile {
  id: string;
  text: string;
  tags: string[];
  contextOverrides?: Record<string, unknown>;
  toolOverrides?: Record<string, unknown>;
  /** The correct answer needs a clinic or package tool this turn. */
  toolRequired?: boolean;
  /** No tool is needed; calling one counts as Unnecessary-Tool-Use. */
  control?: boolean;
  trap?: Trap;
  expect: Expect;
}

export interface CheckResult { name: string; pass: boolean; detail: string }

/** Lowercase, drop "$", drop thousands commas, collapse whitespace. */
export const normalize = (s: string) => s.toLowerCase().replace(/\$/g, "").replace(/(\d),(?=\d{3})/g, "$1").replace(/\s+/g, " ").trim();

const URL_RE = /https?:\/\/\S+/g;
const isUrlLine = (l: string) => /^https?:\/\/\S+$/.test(l.trim());

/** Sentences in the reply, not counting URL-only lines. */
export function sentenceCount(text: string): number {
  const body = text.split("\n").filter((l) => !isUrlLine(l)).join(" ");
  // Titles such as "Dr." end with a period but do not end a sentence.
  const masked = body.replace(/\b(Dr|Mr|Mrs|Ms|St|vs|e\.g|i\.e)\./gi, "$1");
  return masked.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

/**
 * Does `raw` contain `entry`? `/re/flags` is a regex on the raw text. Otherwise `a|b` alternates are
 * matched after normalize; a purely numeric alternate must match a whole number ("500" is not in "4500").
 */
export function textIncludes(entry: string, raw: string): boolean {
  const re = entry.match(/^\/(.+)\/([a-z]*)$/);
  if (re) return new RegExp(re[1], re[2]).test(raw);
  const n = normalize(raw);
  return entry.split("|").some((alt) => {
    const a = normalize(alt);
    if (/^\d+(?:\.\d+)?$/.test(a)) return new RegExp(`(?<![\\d.])${a.replace(".", "\\.")}(?![\\d])`).test(n);
    return n.includes(a);
  });
}

const bare = (name: string) => name.replace(/Tool$/, "");

export function runChecks(c: CaseFile, reply: Reply, trace: Pick<Trace, "toolsCalled">): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail = "") => out.push({ name, pass, detail });
  const text = reply.response ?? "";
  const e = c.expect;

  add("escalate", reply.escalate === e.escalate, `expected ${e.escalate}, got ${reply.escalate}`);
  add("escalationReason", e.escalate ? !!reply.escalationReason : reply.escalationReason === null, String(reply.escalationReason));
  add("plainText", !/(\*\*|__|`|^#{1,6}\s|^\s*[-*•]\s+)/m.test(text), "markdown present");
  const digitsText = text.replace(/https?:\/\/\S+/g, " ").replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ");
  add("noCardDigits", !/\b(?:\d[ -]?){13,19}\b|\b(?:ending|ends|last (?:four|4))\b[^.?!]{0,12}\b\d{4}\b/i.test(digitsText), "card digits echoed");

  const urls = text.match(URL_RE) ?? [];
  if (urls.length || e.urlLastLine) {
    const lines = text.trim().split("\n");
    const ok = urls.length > 0
      && lines.slice(-urls.length).every(isUrlLine)
      && !lines.slice(0, lines.length - urls.length).some((l) => /https?:\/\//.test(l));
    add("urlLastLine", ok, urls.length ? "URL must be alone on the last line(s)" : "expected a URL on the last line");
  }
  if (e.escalate) add("escalationShort", sentenceCount(text) <= 2 && urls.length === 0, "handoff must be at most two sentences with no link");
  else add("notEmpty", text.trim().length > 0, "empty reply");

  for (const m of e.mustInclude ?? []) add(`include:${m}`, textIncludes(m, text));
  for (const m of e.mustNotInclude ?? []) add(`exclude:${m}`, !textIncludes(m, text));
  if (e.maxSentences !== undefined) add("maxSentences", sentenceCount(text) <= e.maxSentences, `${sentenceCount(text)} sentences`);
  if (e.shouldFollowUp !== undefined) add("shouldFollowUp", reply.shouldFollowUp === e.shouldFollowUp, String(reply.shouldFollowUp));
  if (e.followUpTimingIncludes) add("followUpTiming", textIncludes(e.followUpTimingIncludes, reply.followUpTiming ?? ""), String(reply.followUpTiming));
  for (const t of e.toolsCalled ?? []) add(`tool:${t}`, trace.toolsCalled.some((x) => bare(x.name) === t));
  for (const t of e.toolCallIncludes ?? []) {
    add(`toolArgs:${t.name}`, trace.toolsCalled.some((x) => bare(x.name) === t.name && JSON.stringify(x.args ?? {}).includes(t.argsContain)));
  }
  return out;
}
