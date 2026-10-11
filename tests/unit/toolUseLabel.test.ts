import { describe, it, expect } from "vitest";
import { classifyToolUse } from "../../harness/toolUseLabel.js";
import type { CaseFile } from "../../harness/checker.js";
import { emptyTrace } from "../../src/types.js";
import { baseReply } from "./fakeClient.js";

const trace = (calls: [string, object][] = [], source: any = null) => {
  const t = emptyTrace("t", "new", "m");
  t.toolsCalled = calls.map(([name, args]) => ({ name, args, ok: true, resultChars: 1 }));
  t.escalation = { source, reason: source ? "r" : null, category: null };
  return t;
};
const reply = (over: Record<string, unknown> = {}) => baseReply(over) as any;
const hevaCall: [string, object] = ["getClinicPackages", { clinicName: "Heva" }];

const pricing: CaseFile = { id: "p", text: "What does Heva cost?", tags: [], toolRequired: true,
  expect: { escalate: false, mustInclude: ["3,000", "4,500"], toolsCalled: ["getClinicPackages"] } };
const quoted: CaseFile = { id: "q", text: "Heva quoted me $2,600 directly, is that the real price?", tags: [], toolRequired: true,
  trap: { value: "2600", source: "patient" }, expect: { escalate: false, mustInclude: ["3,000"], toolsCalled: ["getClinicPackages"] } };
const control: CaseFile = { id: "c", text: "ok thanks", tags: [], control: true, expect: { escalate: false, maxSentences: 2 } };
const context: CaseFile = { id: "x", text: "how many grafts do I need?", tags: [], expect: { escalate: false } };

describe("classifyToolUse", () => {
  it("Gated when the pre-gate handled the message", () => {
    expect(classifyToolUse(pricing, reply({ escalate: true }), trace([], "pregate"))).toBe("Gated");
  });
  it("Validator-Escalated and Model-Escalated on required cases", () => {
    expect(classifyToolUse(pricing, reply({ escalate: true }), trace([hevaCall], "validator"))).toBe("Validator-Escalated");
    expect(classifyToolUse(pricing, reply({ escalate: true }), trace([hevaCall], "model"))).toBe("Model-Escalated");
  });
  it("Tool-Skip when the expected tool never ran", () => {
    expect(classifyToolUse(pricing, reply({ response: "Silver is $3,000 and Gold is $4,500." }), trace([]))).toBe("Tool-Skip");
  });
  it("Tool-Skip when a tool call is written as text instead of executed", () => {
    expect(classifyToolUse(pricing, reply({ response: "getClinicPackages(Heva) shows $3,000 and $4,500" }), trace([["getAllClinics", {}]]))).toBe("Tool-Skip");
  });
  it("Output-Fabrication for an invented price, URL, package or doctor", () => {
    expect(classifyToolUse(pricing, reply({ response: "Silver is $3,000, Gold $4,500, VIP is $6,000." }), trace([hevaCall]))).toBe("Output-Fabrication");
    expect(classifyToolUse(pricing, reply({ response: "$3,000 and $4,500.\nhttps://www.doctours.com/payment/guess" }), trace([hevaCall]))).toBe("Output-Fabrication");
    expect(classifyToolUse(pricing, reply({ response: "$3,000 and $4,500, and Dr. Mehmet does the hairline." }), trace([hevaCall]))).toBe("Output-Fabrication");
  });
  it("Result-Ignore when a tool value is missing from the reply", () => {
    expect(classifyToolUse(quoted, reply({ response: "Yes, $2,600 sounds right for Heva." }), trace([hevaCall]))).toBe("Result-Ignore");
  });
  it("Clean when tool values are used, with the patient's own number exempt", () => {
    expect(classifyToolUse(pricing, reply({ response: "Silver is $3,000 and Gold is $4,500." }), trace([hevaCall]))).toBe("Clean");
    expect(classifyToolUse(quoted, reply({ response: "Through Doctours, Silver is $3,000 rather than the $2,600 quote." }), trace([hevaCall]))).toBe("Clean");
  });
  it("uses per-case tool overrides when recomputing results", () => {
    const c: CaseFile = { ...pricing, toolOverrides: { getClinicPackages: { packages: [{ name: "Silver", basePrice: 3150, depositAmount: 500 }] } }, expect: { escalate: false, mustInclude: ["3,150"], toolsCalled: ["getClinicPackages"] } };
    expect(classifyToolUse(c, reply({ response: "Silver is $3,150." }), trace([hevaCall]))).toBe("Clean");
    expect(classifyToolUse(c, reply({ response: "Silver is $3,000." }), trace([hevaCall]))).not.toBe("Clean");
  });
  it("control cases: Unnecessary-Tool-Use, Wrong-Answer, or Clean", () => {
    expect(classifyToolUse(control, reply({ response: "Anytime!" }), trace([["getPatientContext", {}]]))).toBe("Unnecessary-Tool-Use");
    expect(classifyToolUse(control, reply({ response: "One. Two. Three." }), trace([]))).toBe("Wrong-Answer");
    expect(classifyToolUse(control, reply({ response: "Anytime!" }), trace([]))).toBe("Clean");
  });
  it("ignores tool calls code made itself, such as the appended assessment link", () => {
    expect(classifyToolUse(control, reply({ response: "Anytime!" }), trace([["getLatestAssessment", { source: "code" }]]))).toBe("Clean");
  });
  it("Context when a case neither requires a tool nor is a control", () => {
    expect(classifyToolUse(context, reply({ response: "About 2,800." }), trace([]))).toBe("Context");
  });
});
