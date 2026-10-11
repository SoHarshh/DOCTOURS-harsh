import { describe, it, expect } from "vitest";
import { ReplySchema } from "../../src/types.js";

const full = {
  response: "hi", escalate: false, escalationReason: null, templateId: null,
  intent: "answer", shouldFollowUp: false, followUpTiming: null,
  attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null,
};

describe("ReplySchema", () => {
  it("accepts a full reply", () => { expect(ReplySchema.parse(full).escalate).toBe(false); });
  it("rejects a missing field", () => { expect(() => ReplySchema.parse({ response: "hi" })).toThrow(); });
  it("accepts nested working memory with nulls", () => {
    const r = ReplySchema.parse({ ...full, attachmentUrls: [], highEngagement: true, workingMemoryUpdates: {
      collectionState: null, communicationStyle: "casual", escalationFlags: null, keyConcerns: "hairline",
      patientName: null, preferredPaymentMethod: null, procedureArea: null, promisesMade: null, targetProcedureWindow: null,
    } });
    expect(r.workingMemoryUpdates?.communicationStyle).toBe("casual");
  });
  it("rejects an unknown enum value", () => {
    expect(() => ReplySchema.parse({ ...full, workingMemoryUpdates: { ...full, communicationStyle: "loud" } })).toThrow();
  });
});
