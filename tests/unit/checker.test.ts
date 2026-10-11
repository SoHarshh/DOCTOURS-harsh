import { describe, it, expect } from "vitest";
import { runChecks, normalize, type CaseFile } from "../../harness/checker.js";
import { baseReply } from "./fakeClient.js";

const trace = (calls: [string, object][] = [["getClinicPackages", { clinicName: "Dr. Hakan" }]]) =>
  ({ toolsCalled: calls.map(([name, args]) => ({ name, args, ok: true, resultChars: 1 })) }) as any;
const reply = (over: Record<string, unknown> = {}) => baseReply(over) as any;
const allPass = (rs: { pass: boolean }[]) => rs.every((r) => r.pass);
const failed = (rs: { name: string; pass: boolean }[]) => rs.filter((r) => !r.pass).map((r) => r.name);

const hakan: CaseFile = { id: "hakan", text: "What does Dr. Hakan cost?", tags: ["pricing"], toolRequired: true,
  expect: { escalate: false, mustInclude: ["Sapphire", "3,200", "500"], toolsCalled: ["getClinicPackages"] } };
const human: CaseFile = { id: "h", text: "I demand a human", tags: ["escalate-positive"], expect: { escalate: true } };

describe("normalize", () => {
  it("lowercases, drops $ and thousands commas, collapses space", () => {
    expect(normalize("Gold  is $4,500 USD")).toBe("gold is 4500 usd");
  });
});

describe("oracle replies pass", () => {
  it("a correct price answer passes", () => {
    expect(allPass(runChecks(hakan, reply({ response: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 USD with a $500 deposit." }), trace()))).toBe(true);
  });
  it("a correct handoff passes", () => {
    expect(allPass(runChecks(human, reply({ escalate: true, escalationReason: "asked for a person", response: "A person will pick this up with you now." }), trace([])))).toBe(true);
  });
});

describe("null and wrong replies fail", () => {
  it("empty reply fails", () => { expect(failed(runChecks(hakan, reply({ response: "" }), trace()))).toContain("notEmpty"); });
  it("wrong price fails", () => {
    expect(allPass(runChecks(hakan, reply({ response: "Sapphire is $3,500 with a $500 deposit." }), trace()))).toBe(false);
  });
  it("a deposit number inside a bigger number does not count", () => {
    const c: CaseFile = { ...hakan, expect: { escalate: false, mustInclude: ["500"] } };
    expect(failed(runChecks(c, reply({ response: "Gold is $4,500." }), trace()))).toContain("include:500");
  });
  it("answering a sales question instead of escalating fails", () => {
    expect(failed(runChecks(human, reply({ response: "Sure, Silver is $3,000." }), trace()))).toContain("escalate");
  });
  it("a long or linked escalation reply fails", () => {
    expect(failed(runChecks(human, reply({ escalate: true, escalationReason: "x", response: "One. Two. Three.\nhttps://x.y" }), trace()))).toContain("escalationShort");
  });
  it("missing expected tool fails", () => {
    expect(failed(runChecks(hakan, reply({ response: "Sapphire is $3,200, deposit $500." }), trace([])))).toContain("tool:getClinicPackages");
  });
  it("markdown and card digits fail", () => {
    const c: CaseFile = { id: "c", text: "x", tags: [], expect: { escalate: false } };
    expect(failed(runChecks(c, reply({ response: "**Yes** card ending in 4242" }), trace()))).toEqual(expect.arrayContaining(["plainText", "noCardDigits"]));
  });
});

describe("matching rules", () => {
  it("supports alternates, regex, mustNotInclude and tool args", () => {
    const c: CaseFile = { id: "c", text: "x", tags: [], expect: { escalate: false, mustInclude: ["klarna|paypal", "/don.?t accept/i"], mustNotInclude: ["depends"], toolCallIncludes: [{ name: "getClinicPackages", argsContain: "Hakan" }] } };
    expect(allPass(runChecks(c, reply({ response: "We don't accept CareCredit. Klarna works." }), trace()))).toBe(true);
    expect(allPass(runChecks(c, reply({ response: "It depends. Klarna works, we don't accept it." }), trace()))).toBe(false);
  });
  it("accepts the Tool-suffixed spelling of a tool name", () => {
    expect(failed(runChecks(hakan, reply({ response: "Sapphire is $3,200 with a $500 deposit." }), trace([["getClinicPackagesTool", {}]])))).toEqual([]);
  });
  it("checks follow-up fields and the sentence cap, ignoring a trailing URL line", () => {
    const c: CaseFile = { id: "p", text: "x", tags: [], expect: { escalate: false, shouldFollowUp: true, followUpTimingIncludes: "month", maxSentences: 2 } };
    expect(allPass(runChecks(c, reply({ response: "Take your time. I'll check in next month.\nhttps://www.doctours.com/consultation", shouldFollowUp: true, followUpTiming: "1 month" }), trace()))).toBe(true);
    expect(allPass(runChecks(c, reply({ response: "Take your time.", shouldFollowUp: false }), trace()))).toBe(false);
  });
  it("requires a URL on the last line when the case asks for one", () => {
    const c: CaseFile = { id: "u", text: "x", tags: [], expect: { escalate: false, urlLastLine: true } };
    expect(failed(runChecks(c, reply({ response: "No link here." }), trace()))).toContain("urlLastLine");
  });
});
