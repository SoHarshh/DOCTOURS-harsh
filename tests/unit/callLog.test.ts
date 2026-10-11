import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isAboutCall, summarizeCall, callSummaryExtra, loadCallSummaries } from "../../src/subagents/callLog.js";
import { getFullCalls } from "../../src/tools/fixtures.js";
import { buildContext } from "../../src/context/buildContext.js";
import { fakeClient } from "./fakeClient.js";

const deps = (c: any) => ({ client: c, model: "claude-haiku-5-5", effort: "low" as const, maxRounds: 1 });
const call = getFullCalls({}).calls[0];

describe("isAboutCall", () => {
  it("detects questions about a call", () => {
    for (const t of ["what did we talk about on the call?", "remind me what you said on the phone", "what did we discuss when we spoke?"]) expect(isAboutCall(t), t).toBe(true);
  });
  it("ignores other messages, including asking for a call", () => {
    for (const t of ["what does Heva cost?", "can you call me?", "is the consultation free?"]) expect(isAboutCall(t), t).toBe(false);
  });
});

describe("summarizeCall", () => {
  it("makes one small model call over the transcript and returns text and usage", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Jordan wants a hairline fix and has 4C hair. Photos were the next step." }], usage: { input_tokens: 300, output_tokens: 30 } }]);
    const r = await summarizeCall(deps(c), call);
    expect(r.text).toContain("4C");
    expect(r.usage.input).toBe(300);
    expect(c.calls.length).toBe(1);
    expect(JSON.stringify(c.calls[0].messages)).toContain("transcript");
    expect(c.calls[0].max_tokens).toBeLessThanOrEqual(400);
  });
});

describe("callSummaryExtra", () => {
  it("returns nothing when the message is not about a call", () => {
    expect(callSummaryExtra(buildContext(), "price?", {})).toBeNull();
  });
  it("returns nothing when there are no calls on record", () => {
    expect(callSummaryExtra(buildContext({ RECENT_CALLS: "" }), "what did we discuss on the call?", {})).toBeNull();
  });
  it("uses the precomputed summary when one exists", () => {
    const out = callSummaryExtra(buildContext(), "what did we discuss on the call?", { [call.id]: "PRECOMPUTED SUMMARY" });
    expect(out).toContain("PRECOMPUTED SUMMARY");
  });
  it("falls back to the record's own summary without a live model call", () => {
    expect(callSummaryExtra(buildContext(), "what did we discuss on the call?", {})).toContain("4C curls");
  });
});

describe("loadCallSummaries", () => {
  it("returns an empty store when the file is missing", () => {
    expect(loadCallSummaries(join(tmpdir(), "nope-does-not-exist.json"))).toEqual({});
  });
  it("reads a stored file", () => {
    const p = join(mkdtempSync(join(tmpdir(), "cl-")), "s.json");
    writeFileSync(p, JSON.stringify({ a: "b" }));
    expect(loadCallSummaries(p)).toEqual({ a: "b" });
  });
});
