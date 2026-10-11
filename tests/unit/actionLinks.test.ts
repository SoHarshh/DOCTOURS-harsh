import { describe, it, expect } from "vitest";
import { ensureActionLink } from "../../src/pipeline/actionLinks.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { baseReply } from "./fakeClient.js";

const URL = "https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333";
const reply = (response: string, over: Record<string, unknown> = {}) => baseReply({ response, ...over }) as any;

describe("ensureActionLink", () => {
  it("appends the assessment link when the reply tells the patient to act on the assessment", () => {
    const log = new ToolLog();
    const r = ensureActionLink(reply("You can pay the deposit right from your assessment: open it and hit Book."), log);
    expect(r.added).toBe(true);
    expect(r.reply.response.endsWith(`\n${URL}`)).toBe(true);
    expect(log.calls.map((c) => c.name)).toEqual(["getLatestAssessment"]);
  });
  it("keeps any other URLs stacked at the end, assessment link last", () => {
    const r = ensureActionLink(reply("Book from your assessment, or book a call using the links below.\nhttps://www.doctours.com/consultation"), new ToolLog());
    expect(r.reply.response.split("\n").slice(-2)).toEqual(["https://www.doctours.com/consultation", URL]);
  });
  it("does nothing when the link is already there", () => {
    const text = `Pay from your assessment using the link below.\n${URL}`;
    const r = ensureActionLink(reply(text), new ToolLog());
    expect(r.added).toBe(false);
    expect(r.reply.response).toBe(text);
  });
  it("does nothing when the assessment is only mentioned, not acted on", () => {
    for (const t of ["Your assessment shows 2,500 to 3,200 grafts.", "The medical team is still working on your assessment."]) {
      expect(ensureActionLink(reply(t), new ToolLog()).added, t).toBe(false);
    }
  });
  it("does nothing on an escalated reply", () => {
    expect(ensureActionLink(reply("Pay from your assessment.", { escalate: true, escalationReason: "x" }), new ToolLog()).added).toBe(false);
  });
  it("does nothing when the tool has no link to give", () => {
    const overrides = { getLatestAssessment: { assessmentUrl: null, shareStatus: "not_ready" } };
    const r = ensureActionLink(reply("You can pay from your assessment once it's ready."), new ToolLog(), overrides);
    expect(r.added).toBe(false);
  });
});

describe("review minors", () => {
  it("does not add the link when the assessment is described rather than acted on", () => {
    for (const t of ["The photos from your assessment look fine.", "The graft range from your assessment is 2,500 to 3,200."]) {
      expect(ensureActionLink(reply(t), new ToolLog()).added, t).toBe(false);
    }
  });
  it("still adds it for instructions to open, use or book from the assessment", () => {
    for (const t of ["Open your assessment and pick Heva.", "You can book Silver from your assessment."]) {
      expect(ensureActionLink(reply(t), new ToolLog()).added, t).toBe(true);
    }
  });
});
