import type { Usage } from "../src/types.js";

/** USD per million tokens. Cache write is the 5-minute TTL rate. */
export interface Rate { input: number; output: number; cacheRead: number; cacheWrite: number }

export const RATES: Record<string, Rate> = {
  "claude-haiku-5-5": { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.20, cacheWrite: 2.50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
};

const FALLBACK = "claude-haiku-5-5";

/** Cost of one turn from the token counts the API reported. A served id with a suffix matches its base model. */
export function costUsd(model: string, u: Usage): number {
  const key = Object.keys(RATES).find((k) => model.startsWith(k));
  if (!key) console.warn(`no rates for ${model}; costing at ${FALLBACK} rates`);
  const r = RATES[key ?? FALLBACK];
  return (u.input * r.input + u.output * r.output + u.cacheRead * r.cacheRead + u.cacheWrite * r.cacheWrite) / 1_000_000;
}
