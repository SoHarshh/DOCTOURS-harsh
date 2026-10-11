import { describe, it, expect } from "vitest";
import { classifyModules, isAcknowledgement, describeModule } from "../../src/pipeline/classifier.js";
import { fakeClient, usage } from "./fakeClient.js";

const skill = (name: string, body: string, triggers: string[] = []) => ({
  name, precedence: 20, triggers, stages: [] as string[], contextTriggers: [] as string[], suppresses: [] as string[], body, file: `${name}.md`,
});
const MODULES = [
  skill("health-insurance", "# HEALTH INSURANCE (HARD RULE)\nInsurance cannot be used.", ["insurance", "medicare"]),
  skill("time-bound-pause", "# TIME-BOUND PAUSE\nA pause gets a dated check-in.", ["need time", "save up"]),
  skill("stage-pre-clinical-sent", "## PRE_CLINICAL_SENT", []),
] as any[];
const deps = (c: any) => ({ client: c, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 });
const answer = (modules: string[]) => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ modules }) }], usage: usage(300, 20) });

describe("isAcknowledgement", () => {
  it("recognizes short acknowledgements", () => {
    for (const t of ["ok thanks", "ok cool ty", "👍", "great, talk soon", "lol ok", "thank you!"]) expect(isAcknowledgement(t), t).toBe(true);
  });
  it("does not treat questions or longer messages as acknowledgements", () => {
    for (const t of ["ok but does blue cross cover this?", "need to talk to my wife first", "thanks, what's the deposit?"]) expect(isAcknowledgement(t), t).toBe(false);
  });
});

describe("describeModule", () => {
  it("uses the first line of the body and a few triggers", () => {
    expect(describeModule(MODULES[0])).toContain("HEALTH INSURANCE");
    expect(describeModule(MODULES[0])).toContain("insurance");
  });
});

describe("classifyModules", () => {
  it("asks the model once and returns known non-stage module names only", async () => {
    const c = fakeClient([answer(["health-insurance", "made-up-module", "stage-pre-clinical-sent"])]);
    const r = await classifyModules(deps(c), "does blue cross cover any of this?", MODULES);
    expect(r.names).toEqual(["health-insurance"]);
    expect(r.usage.input).toBe(300);
    expect(c.calls.length).toBe(1);
    expect(JSON.stringify(c.calls[0].messages)).toContain("blue cross");
    expect(JSON.stringify(c.calls[0].system ?? c.calls[0].messages)).toContain("time-bound-pause");
    expect(c.calls[0].max_tokens).toBeLessThanOrEqual(400);
    expect(c.calls[0].tools).toBeUndefined();
  });
  it("caps the answer at three modules", async () => {
    const c = fakeClient([answer(["health-insurance", "time-bound-pause", "health-insurance", "time-bound-pause"])]);
    expect((await classifyModules(deps(c), "x", MODULES)).names.length).toBeLessThanOrEqual(3);
  });
  it("fails open: an API error or bad output returns no modules", async () => {
    const broken = { messages: { async create() { throw new Error("overloaded"); } } };
    const r = await classifyModules(deps(broken), "x", MODULES);
    expect(r.names).toEqual([]);
    expect(r.error).toMatch(/overloaded/);
    const garbage = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "not json" }], usage: usage() }]);
    expect((await classifyModules(deps(garbage), "x", MODULES)).names).toEqual([]);
  });
});
