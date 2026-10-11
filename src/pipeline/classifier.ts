import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ModelDeps } from "./model.js";
import type { Skill } from "./skills.js";
import { zeroUsage, type Usage } from "../types.js";

/**
 * Router fallback. The phrase router is exact on wording it knows and misses new wording
 * ("does blue cross cover any of this?" has no "insurance"). When no policy module matched,
 * one small model call picks up to three modules from their one-line descriptions.
 * It runs only on those messages, and never on plain acknowledgements, so most replies pay nothing.
 * It fails open: on any error the message goes ahead with the stage module only.
 */

const MAX = 3;

// No two alternatives may match the same text ("k" and "kk" did): a long run of such letters that then fails
// makes the regex try every split, which takes seconds at 30 characters and hangs at 50.
const ACK_RE = /^(?:ok(?:ay)?|k|cool|great|nice|perfect|sounds good|got it|thanks?|thank you|ty|thx|lol|haha|awesome|sure|yes|yep|yeah|no worries|talk soon|will do|alright|appreciate it|[\p{Emoji}\s])+[\s,.!]*$/iu;

/** Longer than any acknowledgement; also bounds the regex's work on odd input. */
const MAX_ACK_CHARS = 80;

/** "ok thanks", "👍", "great, talk soon": nothing to route. */
export function isAcknowledgement(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[,.!]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= MAX_ACK_CHARS && t.split(" ").length <= 5 && ACK_RE.test(t);
}

/** One line per module: its description when it has one, else its heading plus a few of its trigger phrases. */
export function describeModule(s: Skill): string {
  if (s.description) return `- ${s.name}: ${s.description}`;
  const heading = s.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? s.name;
  const phrases = s.triggers.filter((t): t is string => typeof t === "string").slice(0, 6);
  const clean = heading.replace(/^#+\s*/, "").replace(/\*\*/g, "").slice(0, 110);
  return `- ${s.name}: ${clean}${phrases.length ? ` (e.g. ${phrases.join(", ")})` : ""}`;
}

const OutputSchema = z.object({ modules: z.array(z.string()) });
const FORMAT = (() => { const { type, schema } = zodOutputFormat(OutputSchema); return { type, schema }; })();

export interface ClassifierResult { names: string[]; usage: Usage; latencyMs: number; error: string | null }

export async function classifyModules(deps: ModelDeps, text: string, modules: Skill[]): Promise<ClassifierResult> {
  const candidates = modules.filter((m) => !m.name.startsWith("stage-"));
  const known = new Set(candidates.map((m) => m.name));
  const started = Date.now();
  try {
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: 300,
      output_config: { effort: "low", format: FORMAT },
      // Identical on every call, so it is cached; only the patient message varies.
      system: [{
        type: "text",
        text:
          "You route a patient's SMS to the policy sections a coordinator needs to answer it. " +
          "Pick at most three section names from the list, only ones the message clearly needs. Pick none if none apply.\n\n" +
          candidates.map(describeModule).join("\n"),
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: `Patient message: "${text}"` }],
    });
    const raw = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = OutputSchema.safeParse(JSON.parse(raw));
    const names = parsed.success ? [...new Set(parsed.data.modules.filter((n) => known.has(n)))].slice(0, MAX) : [];
    const u = res.usage ?? {};
    return {
      names,
      usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
      latencyMs: Date.now() - started,
      error: parsed.success ? null : "unparseable classifier output",
    };
  } catch (e) {
    return { names: [], usage: zeroUsage(), latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}
