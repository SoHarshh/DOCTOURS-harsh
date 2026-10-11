import { describe, it, expect } from "vitest";
import { handoffReply, type HandoffCategory } from "../../src/pipeline/escalationReply.js";
import { ReplySchema } from "../../src/types.js";

const CATEGORIES: HandoffCategory[] = ["human_request", "card_details", "charge_request", "model", "validator", "refusal"];
const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

describe("handoffReply", () => {
  for (const cat of CATEGORIES) {
    describe(cat, () => {
      const r = handoffReply(cat, "some reason");

      it("is a valid escalating Reply", () => {
        expect(ReplySchema.parse(r)).toEqual(r);
        expect(r.escalate).toBe(true);
        expect(r.escalationReason).toBe("some reason");
        expect(r.templateId).toBeNull();
        expect(r.attachmentUrls).toBeNull();
        expect(r.workingMemoryUpdates).toBeNull();
        expect(r.shouldFollowUp).toBe(false);
      });

      it("is one short first-person sentence", () => {
        const s = sentences(r.response);
        expect(s.length).toBe(1);
        for (const x of s) expect(x.split(/\s+/).length).toBeLessThanOrEqual(20);
        expect(r.response).toMatch(/\bI\b|\bI'm\b/);
      });

      it("says a person takes over", () => {
        expect(r.response.toLowerCase()).toMatch(/person|someone/);
      });

      it("carries no digits, URLs, prices, questions or markdown", () => {
        expect(r.response).not.toMatch(/\d/);
        expect(r.response).not.toMatch(/https?:|www\./);
        expect(r.response).not.toMatch(/[$€£]/);
        expect(r.response).not.toContain("?");
        expect(r.response).not.toMatch(/\*\*|__|`|^#|^\s*[-*]\s/m);
      });

      it("makes no claim that work was done or will be sent", () => {
        expect(r.response).not.toMatch(/\b(I've|I have) (sent|saved|updated|charged|booked|contacted)\b/i);
        expect(r.response).not.toMatch(/\bI'll (send|check|call|email|text|follow up|get back)\b/i);
      });
    });
  }

  it("says plainly that card details can't be taken or charged", () => {
    for (const cat of ["card_details", "charge_request"] as const) {
      const t = handoffReply(cat, "x").response.toLowerCase();
      expect(t).toMatch(/can't|cannot/);
      expect(t).toMatch(/card/);
      expect(t).toMatch(/take/);
      expect(t).toMatch(/charge/);
    }
  });

  it("keeps the reason short and free of digits", () => {
    const long = handoffReply("validator", `unparseable: ${"x ".repeat(200)}`);
    expect(long.escalationReason!.length).toBeLessThanOrEqual(120);
    const digits = handoffReply("card_details", "card 4242 4242 4242 4242 shared, ending in 4242");
    expect(digits.escalationReason).not.toMatch(/\d{2}/);
  });

  it("falls back to the category when the reason is empty", () => {
    expect(handoffReply("refusal", "  ").escalationReason).toBe("refusal");
  });

  it("returns a fresh object on every call", () => {
    const a = handoffReply("model", "x");
    a.response = "changed";
    expect(handoffReply("model", "x").response).not.toBe("changed");
  });
});
