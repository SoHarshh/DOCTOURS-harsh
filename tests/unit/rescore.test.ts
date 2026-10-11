import { describe, it, expect } from "vitest";
import { rescore } from "../../harness/rescore.js";
import type { CaseFile } from "../../harness/checker.js";
import { emptyTrace } from "../../src/types.js";
import { baseReply } from "./fakeClient.js";

const cases: CaseFile[] = [
  { id: "a", text: "is it free?", tags: ["x"], control: true, expect: { escalate: false, mustInclude: ["free"] } },
  { id: "b", text: "hi", tags: ["y"], expect: { escalate: false } },
];
const row = (caseId: string, response: string) => ({
  caseId, rep: 0, tags: ["stale-tag"], pass: false, checks: [], toolUseLabel: null,
  reply: baseReply({ response }) as any, trace: emptyTrace(caseId, "new", "m"), costUsd: 0.001,
});

describe("rescore", () => {
  it("re-applies current case expectations to saved replies without calling a model", () => {
    const file = { meta: { system: "new" } as any, rows: [row("a", "Yes, it's free."), row("b", "")], errors: [] };
    const out = rescore(file, cases);
    expect(out.rows[0].pass).toBe(true);
    expect(out.rows[0].tags).toEqual(["x"]);
    expect(out.rows[0].toolUseLabel).toBe("Clean");
    expect(out.rows[1].pass).toBe(false);
    expect(out.rows[0].costUsd).toBe(0.001);
    expect(out.meta.rescoredAt).toBeTruthy();
  });
  it("drops rows whose case no longer exists and says so", () => {
    const file = { meta: {} as any, rows: [row("gone", "x")], errors: [] };
    const out = rescore(file, cases);
    expect(out.rows).toEqual([]);
    expect(out.meta.droppedCases).toEqual(["gone"]);
  });
});
