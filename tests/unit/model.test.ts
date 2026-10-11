import { describe, it, expect, afterEach } from "vitest";
import { callModel, createDeps } from "../../src/pipeline/model.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";
import { fakeClient, textResponse, toolResponse, baseReply, usage } from "./fakeClient.js";

const deps = (client: any) => ({ client, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 });
const input = (log: ToolLog) => ({ system: [{ type: "text" as const, text: "sys" }, { type: "text" as const, text: "ctx" }], user: "hi", tools: TOOL_DEFINITIONS, log });

describe("callModel", () => {
  it("parses a direct structured reply", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "hello" }))]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.reply?.response).toBe("hello");
    expect(r.rounds).toBe(1);
    expect(r.usage.input).toBe(100);
    expect(r.parseError).toBeNull();
    expect(r.servedModel).toBe("claude-haiku-5-5");
    expect(r.stopReason).toBe("end_turn");
  });

  it("sends the schema, effort, tools and a cache breakpoint on the first system block only", async () => {
    const c = fakeClient([textResponse(baseReply())]);
    await callModel(deps(c), input(new ToolLog()));
    const p = c.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.output_config.effort).toBe("medium");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.output_config.format.schema.properties.response).toBeDefined();
    expect(p.output_config.format.schema.properties.workingMemoryUpdates).toBeDefined();
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.system[1].cache_control).toBeUndefined();
    expect(p.tools.map((t: any) => t.name)).toEqual(TOOL_DEFINITIONS.map((t) => t.name));
    expect(p.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(p.tool_choice).toBeUndefined();
  });

  it("keeps the wire schema under the API limit of 16 union-typed parameters", async () => {
    const c = fakeClient([textResponse(baseReply())]);
    await callModel(deps(c), input(new ToolLog()));
    let unions = 0;
    const walk = (s: any) => {
      if (!s || typeof s !== "object") return;
      for (const p of Object.values<any>(s.properties ?? {})) {
        if (p.anyOf || Array.isArray(p.type)) unions++;
        walk(p);
        for (const alt of p.anyOf ?? []) walk(alt);
        if (p.items) walk(p.items);
      }
    };
    walk(c.calls[0].output_config.format.schema);
    expect(unions).toBeGreaterThan(0);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it("fills omitted working-memory fields with null", async () => {
    const reply = baseReply({ workingMemoryUpdates: { patientName: "Jordan", collectionState: { photoAskCount: 1 } } });
    const r = await callModel(deps(fakeClient([textResponse(reply)])), input(new ToolLog()));
    expect(r.parseError).toBeNull();
    expect(r.reply?.workingMemoryUpdates).toMatchObject({
      patientName: "Jordan", keyConcerns: null, targetProcedureWindow: null,
      collectionState: { photoAskCount: 1, areaAskCount: null, lastAskedItem: null, nameAskCount: null },
    });
  });

  it("still accepts working memory written with explicit nulls", async () => {
    const wm = { collectionState: null, communicationStyle: null, escalationFlags: null, keyConcerns: null, patientName: null, preferredPaymentMethod: null, procedureArea: "hairline", promisesMade: null, targetProcedureWindow: null };
    const r = await callModel(deps(fakeClient([textResponse(baseReply({ workingMemoryUpdates: wm }))])), input(new ToolLog()));
    expect(r.reply?.workingMemoryUpdates).toEqual(wm);
  });

  it("does not mutate the caller's system blocks", async () => {
    const c = fakeClient([textResponse(baseReply())]);
    const inp = input(new ToolLog());
    await callModel(deps(c), inp);
    expect((inp.system[0] as any).cache_control).toBeUndefined();
  });

  it("runs tools then parses the final reply", async () => {
    const log = new ToolLog();
    const c = fakeClient([
      toolResponse("getClinicPackages", { clinicName: "Heva" }),
      textResponse(baseReply({ response: "Silver is 3,000" })),
    ]);
    const r = await callModel(deps(c), input(log));
    expect(r.rounds).toBe(2);
    expect(r.reply?.response).toBe("Silver is 3,000");
    expect(log.calls[0].name).toBe("getClinicPackages");
    expect(c.calls[1].messages[1].role).toBe("assistant");
    const result = c.calls[1].messages[2].content[0];
    expect(result.type).toBe("tool_result");
    expect(result.tool_use_id).toBe("tu_1");
    expect(result.content).toContain("Silver");
    expect(r.usage.input).toBe(200);
    expect(r.usage.output).toBe(100);
  });

  it("answers every tool call of one turn in a single user message", async () => {
    const log = new ToolLog();
    const twoCalls = {
      model: "claude-haiku-5-5", stop_reason: "tool_use", usage: usage(),
      content: [
        { type: "tool_use", id: "a", name: "getClinicPackages", input: { clinicName: "Heva" } },
        { type: "tool_use", id: "b", name: "getLatestAssessment", input: {} },
      ],
    };
    const c = fakeClient([twoCalls, textResponse(baseReply())]);
    await callModel(deps(c), input(log));
    const results = c.calls[1].messages[2].content;
    expect(results.map((b: any) => b.tool_use_id)).toEqual(["a", "b"]);
    expect(c.calls[1].messages.length).toBe(3);
    expect(log.calls.map((x) => x.name)).toEqual(["getClinicPackages", "getLatestAssessment"]);
  });

  it("passes tool overrides through to the executor", async () => {
    const log = new ToolLog();
    const c = fakeClient([toolResponse("getClinicPackages", { clinicName: "Heva" }), textResponse(baseReply())]);
    await callModel(deps(c), { ...input(log), toolOverrides: { getClinicPackages: { overridden: true } } });
    expect(c.calls[1].messages[2].content[0].content).toBe('{"overridden":true}');
  });

  it("joins text blocks and ignores thinking blocks when parsing", async () => {
    const json = JSON.stringify(baseReply({ response: "joined" }));
    const res = {
      model: "claude-haiku-5-5", stop_reason: "end_turn", usage: usage(),
      content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: json.slice(0, 10) }, { type: "text", text: json.slice(10) }],
    };
    const r = await callModel(deps(fakeClient([res])), input(new ToolLog()));
    expect(r.reply?.response).toBe("joined");
  });

  it("reports parse errors without throwing", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "not json" }], usage: { input_tokens: 1, output_tokens: 1 } }]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.reply).toBeNull();
    expect(r.rawText).toBe("not json");
    expect(r.parseError).toBeTruthy();
  });

  it("reports schema violations as parse errors", async () => {
    const c = fakeClient([textResponse({ response: "missing fields" })]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.reply).toBeNull();
    expect(r.parseError).toBeTruthy();
  });

  it("stops at maxRounds", async () => {
    const c = fakeClient(Array.from({ length: 6 }, () => toolResponse("getAllClinics", {})));
    const r = await callModel({ ...deps(c), maxRounds: 2 }, input(new ToolLog()));
    expect(r.rounds).toBe(2);
    expect(c.calls.length).toBe(2);
    expect(r.reply).toBeNull();
    expect(r.stopReason).toBe("max_rounds");
  });

  it("surfaces refusal", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } }]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.stopReason).toBe("refusal");
    expect(r.reply).toBeNull();
  });

  it("throws when the served model differs", async () => {
    const c = fakeClient([textResponse(baseReply(), "claude-other")]);
    await expect(callModel(deps(c), input(new ToolLog()))).rejects.toThrow(/served model/);
  });

  it("accepts a served model id that extends the requested one", async () => {
    const c = fakeClient([textResponse(baseReply(), "claude-haiku-5-5-20261001")]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.servedModel).toBe("claude-haiku-5-5-20261001");
  });

  it("sums cache usage across rounds", async () => {
    const first = { ...toolResponse("getAllClinics", {}), usage: usage(10, 5, 300, 40) };
    const second = { ...textResponse(baseReply()), usage: usage(20, 7, 300, 0) };
    const r = await callModel(deps(fakeClient([first, second])), input(new ToolLog()));
    expect(r.usage).toEqual({ input: 30, output: 12, cacheRead: 600, cacheWrite: 40 });
  });
});

describe("createDeps", () => {
  const saved = { MODEL: process.env.MODEL, EFFORT: process.env.EFFORT };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  it("defaults to haiku, medium effort, 8 rounds", () => {
    delete process.env.MODEL; delete process.env.EFFORT;
    const c = fakeClient([]);
    const d = createDeps({ client: c });
    expect(d).toMatchObject({ model: "claude-haiku-5-5", effort: "medium", maxRounds: 8 });
    expect(d.client).toBe(c);
  });

  it("reads MODEL and EFFORT from the environment, overrides win", () => {
    process.env.MODEL = "claude-sonnet-5-5"; process.env.EFFORT = "low";
    const c = fakeClient([]);
    expect(createDeps({ client: c })).toMatchObject({ model: "claude-sonnet-5-5", effort: "low" });
    expect(createDeps({ client: c, model: "m", maxRounds: 3 })).toMatchObject({ model: "m", maxRounds: 3 });
  });

  it("rejects an unknown EFFORT value", () => {
    process.env.EFFORT = "extreme";
    expect(() => createDeps({ client: fakeClient([]) })).toThrow(/EFFORT/);
  });
});
