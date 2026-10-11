import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks, type CaseFile } from "../../harness/checker.js";
import { ROOT } from "../../src/paths.js";

/**
 * The external test set was written by a different model from the brief alone. Before either system runs on it,
 * every case's own "good" example must pass its checks and its "bad" example must fail at least one,
 * so no case can fail a correct reply.
 */
type ExtCase = CaseFile & { oracle: { good: string; bad: string }; ambiguous?: boolean };
const cases: ExtCase[] = JSON.parse(readFileSync(join(ROOT, "tests", "external", "external.json"), "utf8"));

const replyFor = (c: ExtCase, response: string) => ({
  response, escalate: c.expect.escalate, escalationReason: c.expect.escalate ? "handoff" : null, templateId: null, intent: "x",
  shouldFollowUp: c.expect.shouldFollowUp ?? false, followUpTiming: c.expect.shouldFollowUp ? "1 month" : null,
  attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null,
});
const trace = { toolsCalled: [] };

describe("external test set", () => {
  it("has 120 cases with unique ids", () => {
    expect(cases.length).toBe(120);
    expect(new Set(cases.map((c) => c.id)).size).toBe(120);
  });
  for (const c of cases) {
    it(`${c.id}: the good example passes and the bad example fails`, () => {
      const good = runChecks(c, replyFor(c, c.oracle.good) as any, trace as any).filter((r) => !r.pass);
      expect(good.map((r) => r.name), `good failed: ${c.oracle.good}`).toEqual([]);
      const bad = runChecks(c, replyFor(c, c.oracle.bad) as any, trace as any).filter((r) => !r.pass);
      expect(bad.length, `bad passed: ${c.oracle.bad}`).toBeGreaterThan(0);
    });
  }
});
