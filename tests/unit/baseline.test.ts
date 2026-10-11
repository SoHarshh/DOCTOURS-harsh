import { describe, it, expect } from "vitest";
import { runBaseline } from "../../src/baseline/monolith.js";
import { buildContext } from "../../src/context/buildContext.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";
import { fakeClient, textResponse, toolResponse, baseReply } from "./fakeClient.js";

const deps = (client: any) => ({ client, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 });
const unparseable = { model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "??" }], usage: {} };

describe("runBaseline", () => {
  it("sends the full monolith and returns reply + trace", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "yes" }))]);
    const { reply, trace } = await runBaseline(buildContext(), "Is it free?", deps(c), "t1");
    expect(reply.response).toBe("yes");
    expect(trace.id).toBe("t1");
    expect(trace.system).toBe("baseline");
    expect(trace.model).toBe("claude-haiku-5-5");
    expect(trace.promptChars).toBeGreaterThan(50000);
    expect(trace.skillsLoaded).toEqual([]);
    expect(trace.escalation.source).toBeNull();
    expect(trace.usage.input).toBe(100);
    expect(trace.rounds).toBe(1);
    expect(trace.stopReason).toBe("end_turn");
  });

  it("fills the packet prompt and user template as the Flow section says", async () => {
    const c = fakeClient([textResponse(baseReply())]);
    await runBaseline(buildContext(), "Is it free?", deps(c), "t1");
    const p = c.calls[0];
    expect(p.system.length).toBe(1);
    expect(p.system[0].text.startsWith("# IDENTITY")).toBe(true);
    expect(p.system[0].text).toContain("Jordan Hale");
    expect(p.system[0].text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.messages[0].content).toContain('"Is it free?"');
    expect(p.messages[0].content).toContain("Recent conversation summary:");
    expect(p.tools.map((t: any) => t.name)).toEqual(TOOL_DEFINITIONS.map((t) => t.name));
  });

  it("applies context overrides to the prompt", async () => {
    const c = fakeClient([textResponse(baseReply())]);
    const { trace } = await runBaseline(buildContext({ COORDINATOR_DISPLAY_NAME: "Sam" }), "hi", deps(c));
    expect(c.calls[0].system[0].text).toContain("Sam");
    expect(trace.id).toBe("msg");
  });

  it("has no pre-gate: a demand for a human still goes to the model", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "I can help with that." }))]);
    const { reply, trace } = await runBaseline(buildContext(), "I demand to talk to a human", deps(c));
    expect(c.calls.length).toBe(1);
    expect(reply.response).toBe("I can help with that.");
    expect(trace.escalation.source).toBeNull();
  });

  it("records tool calls and passes tool overrides through", async () => {
    const c = fakeClient([toolResponse("getClinicPackages", { clinicName: "Heva" }), textResponse(baseReply())]);
    const { trace } = await runBaseline(buildContext(), "packages?", deps(c), "t", { getClinicPackages: { stub: 1 } });
    expect(trace.toolsCalled.map((t) => t.name)).toEqual(["getClinicPackages"]);
    expect(c.calls[1].messages[2].content[0].content).toBe('{"stub":1}');
    expect(trace.rounds).toBe(2);
  });

  it("keeps a model escalation as written and records source model", async () => {
    const c = fakeClient([textResponse(baseReply({ escalate: true, escalationReason: "wants a person", response: "Let me get someone." }))]);
    const { reply, trace } = await runBaseline(buildContext(), "hi", deps(c));
    expect(reply.response).toBe("Let me get someone.");
    expect(trace.escalation).toEqual({ source: "model", reason: "wants a person", category: null });
  });

  it("escalates with a validator handoff when the model output cannot be parsed", async () => {
    const c = fakeClient([unparseable]);
    const { reply, trace } = await runBaseline(buildContext(), "hi", deps(c), "t2");
    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBeTruthy();
    expect(reply.response).toMatch(/person/);
    expect(trace.escalation.source).toBe("validator");
    expect(trace.escalation.category).toBe("validator");
    expect(trace.notes.join(" ")).toMatch(/parse/i);
  });

  it("escalates with a validator handoff when the tool loop runs out of rounds", async () => {
    const c = fakeClient(Array.from({ length: 4 }, () => toolResponse("getAllClinics", {})));
    const { reply, trace } = await runBaseline(buildContext(), "hi", deps(c));
    expect(reply.escalate).toBe(true);
    expect(trace.escalation.source).toBe("validator");
    expect(trace.stopReason).toBe("max_rounds");
  });

  it("escalates with a refusal handoff on a refusal", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: {} }]);
    const { reply, trace } = await runBaseline(buildContext(), "hi", deps(c));
    expect(reply.escalate).toBe(true);
    expect(trace.escalation.source).toBe("refusal");
    expect(trace.escalation.category).toBe("refusal");
  });
});
