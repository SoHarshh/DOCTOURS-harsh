import { describe, it, expect } from "vitest";
import { runMessage } from "../../src/pipeline/runMessage.js";
import { buildContext } from "../../src/context/buildContext.js";
import { fakeClient, textResponse, toolResponse, baseReply } from "./fakeClient.js";

const skill = (name: string, triggers: string[], over: Record<string, unknown> = {}) => ({
  name, precedence: 20, triggers, stages: [] as string[], contextTriggers: [] as string[], suppresses: [] as string[],
  body: `${name.toUpperCase()} POLICY`, file: `${name}.md`, ...over,
});
const SKILLS = [
  skill("stage-pre-clinical-sent", [], { precedence: 40, stages: ["PRE_CLINICAL_SENT"] }),
  skill("clinic-and-package-facts", ["cost", "price", "package"]),
  skill("consultation", ["consultation"]),
] as any[];

const opts = (client: any, over: Record<string, unknown> = {}) => ({
  deps: { client, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 },
  id: "t", skills: SKILLS, core: "CORE PROMPT", callSummaries: {}, ...over,
});
const lastUser = (c: any, i: number) => { const m = c.calls[i].messages; return JSON.stringify(m[0].content); };

describe("runMessage", () => {
  it("a pre-gated handoff skips the model entirely", async () => {
    const c = fakeClient([]);
    const { reply, trace } = await runMessage(buildContext(), "I demand to talk to a human", opts(c));
    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBeTruthy();
    expect(trace.escalation.source).toBe("pregate");
    expect(c.calls.length).toBe(0);
    expect(trace.usage.input).toBe(0);
  });

  it("happy path: routes, calls tools, validates, and records the trace", async () => {
    const c = fakeClient([
      toolResponse("getClinicPackages", { clinicName: "Dr. Hakan" }),
      textResponse(baseReply({ response: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 USD with a $500 deposit." })),
    ]);
    const { reply, trace } = await runMessage(buildContext(), "What does Dr. Hakan Clinic cost?", opts(c));
    expect(reply.escalate).toBe(false);
    expect(reply.response).toContain("Sapphire");
    expect(trace.skillsLoaded).toEqual(["clinic-and-package-facts", "stage-pre-clinical-sent"]);
    expect(trace.routing.length).toBeGreaterThan(0);
    expect(trace.toolsCalled.map((t) => t.name)).toEqual(["getClinicPackages"]);
    expect(trace.validators.failed).toEqual([]);
    expect(trace.retried).toBe(false);
    expect(trace.attempts?.length).toBe(1);
    expect(c.calls[0].system[0].text).toBe("CORE PROMPT");
    expect(c.calls[0].system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(c.calls[0].system[1].text).toContain("CLINIC-AND-PACKAGE-FACTS POLICY");
    expect(c.calls[0].system[1].text).not.toContain("CONSULTATION POLICY");
  });

  it("fixes formatting in code without a retry", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "**Yes**, it is free. Book at https://www.doctours.com/consultation" }))]);
    const { reply, trace } = await runMessage(buildContext(), "Is the consultation free?", opts(c));
    expect(reply.response.endsWith("\nhttps://www.doctours.com/consultation")).toBe(true);
    expect(reply.response).not.toContain("**");
    expect(trace.validators.autoFixed).toEqual(expect.arrayContaining(["plainText", "urlLastLine"]));
    expect(trace.retried).toBe(false);
    expect(c.calls.length).toBe(1);
  });

  it("retries once with an external verdict listing allowed values, then accepts a fixed reply", async () => {
    const c = fakeClient([
      toolResponse("getClinicPackages", { clinicName: "Heva" }),
      textResponse(baseReply({ response: "Silver is $2,900." })),
      textResponse(baseReply({ response: "Silver is $3,000 with a $500 deposit." })),
    ]);
    const { reply, trace } = await runMessage(buildContext(), "how much is Heva silver?", opts(c));
    expect(trace.retried).toBe(true);
    expect(trace.retryFixed).toBe(true);
    expect(reply.escalate).toBe(false);
    expect(reply.response).toContain("$3,000");
    expect(lastUser(c, 2)).toContain("A validator rejected the previous reply.");
    expect(lastUser(c, 2)).toContain("3000");
    expect(trace.attempts?.map((a) => a.violations.length > 0)).toEqual([true, false]);
  });

  it("escalates to a person when the retry still fails", async () => {
    const bad = baseReply({ response: "Silver is $2,900." });
    const c = fakeClient([textResponse(bad), textResponse(bad)]);
    const { reply, trace } = await runMessage(buildContext(), "price of silver?", opts(c));
    expect(c.calls.length).toBe(2);
    expect(trace.retryFixed).toBe(false);
    expect(reply.escalate).toBe(true);
    expect(trace.escalation.source).toBe("validator");
    expect(reply.escalationReason).toMatch(/^validator:/);
  });

  it("a model escalation keeps the reason but code writes the sentence", async () => {
    const c = fakeClient([textResponse(baseReply({ escalate: true, escalationReason: "asked us to contact the clinic", response: "Sure! I'll call Heva and hold Dec 8, Silver is $3,000." }))]);
    const { reply, trace } = await runMessage(buildContext(), "call Heva and hold Dec 8 for me", opts(c));
    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBe("asked us to contact the clinic");
    expect(reply.response).not.toMatch(/\$|Heva|Dec/);
    expect(trace.escalation.source).toBe("model");
  });

  it("a refusal escalates", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: {} }]);
    const { reply, trace } = await runMessage(buildContext(), "hi", opts(c));
    expect(reply.escalate).toBe(true);
    expect(trace.escalation.source).toBe("refusal");
  });

  it("adds the stored call summary only when the patient asks about a call", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "We talked about your hairline and your 4C curls." })), textResponse(baseReply({ response: "Anytime." }))]);
    const store = { "66666666-6666-4666-8666-666666666666": "STORED CALL SUMMARY" };
    const a = await runMessage(buildContext(), "remind me what we talked about on the call?", opts(c, { callSummaries: store }));
    expect(c.calls[0].system[2].text).toContain("STORED CALL SUMMARY");
    expect(a.trace.subagents).toEqual(["callLog"]);
    await runMessage(buildContext(), "ok thanks", opts(c, { callSummaries: store }));
    expect(c.calls[1].system[2].text).not.toContain("STORED CALL SUMMARY");
  });

  it("adds the assessment link in code when the reply tells the patient to act on it", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "Yes, you can pay the deposit right from your assessment." }))]);
    const { reply, trace } = await runMessage(buildContext(), "can I pay from the assessment?", opts(c));
    expect(reply.response.endsWith("\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333")).toBe(true);
    expect(trace.validators.autoFixed).toContain("assessmentLink");
    expect(c.calls.length).toBe(1);
  });
  it("records total latency and prompt size", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "Anytime." }))]);
    const { trace } = await runMessage(buildContext(), "ok thanks", opts(c));
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
    expect(trace.promptChars).toBeGreaterThan(0);
    expect(trace.skillsLoaded).toEqual(["stage-pre-clinical-sent"]);
  });
});
