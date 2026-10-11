import { describe, it, expect } from "vitest";
import { validate, autoFix, allowedValues, retryMessage, VALIDATOR_NAMES } from "../../src/pipeline/validators.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { executeTool } from "../../src/tools/execute.js";
import { buildContext } from "../../src/context/buildContext.js";
import { baseReply } from "./fakeClient.js";

const ctx = buildContext();
const reply = (over: Record<string, unknown> = {}) => baseReply(over) as any;
const names = (r: any, log = new ToolLog(), patientText?: string) => validate(r, log, ctx, patientText).map((v) => v.name);
const withTools = (...calls: [string, object][]) => {
  const log = new ToolLog();
  for (const [n, a] of calls) executeTool(n, a, log);
  return log;
};
const heva = () => withTools(["getClinicPackages", { clinicName: "Heva" }]);

describe("plainText", () => {
  it("flags bold, headers and bullets", () => {
    expect(names(reply({ response: "**Hi** there" }))).toContain("plainText");
    expect(names(reply({ response: "# Prices\nok" }))).toContain("plainText");
    expect(names(reply({ response: "Options:\n- Silver\n- Gold" }))).toContain("plainText");
  });
  it("passes plain prose with a hyphenated word", () => {
    expect(names(reply({ response: "It's a well-known clinic." }))).not.toContain("plainText");
  });
});

describe("urlLastLine", () => {
  it("flags a URL mid-sentence", () => {
    expect(names(reply({ response: "See https://www.doctours.com/consultation for details." }))).toContain("urlLastLine");
  });
  it("passes a URL on its own last line, and stacked URLs", () => {
    expect(names(reply({ response: "Book using the link below.\nhttps://www.doctours.com/consultation" }))).not.toContain("urlLastLine");
    const log = withTools(["getLatestAssessment", {}]);
    expect(names(reply({ response: "Links below.\nhttps://www.doctours.com/consultation\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333" }), log)).not.toContain("urlLastLine");
  });
});

describe("urlProvenance", () => {
  it("flags a URL no tool returned", () => {
    expect(names(reply({ response: "Pay here.\nhttps://www.doctours.com/payment/made-up" }))).toContain("urlProvenance");
    expect(names(reply({ response: "Their site.\nhttps://esthetichairmiami.com/" }))).toContain("urlProvenance");
  });
  it("allows tool URLs and the static allowlist", () => {
    const log = withTools(["getLatestAssessment", {}]);
    expect(names(reply({ response: "Here.\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333" }), log)).not.toContain("urlProvenance");
    expect(names(reply({ response: "Upload using the link below.\nhttps://www.doctours.com/image-upload" }))).not.toContain("urlProvenance");
  });
  it("allows a clinic page only when the slug came from a tool this turn", () => {
    const page = reply({ response: "Heva's page is below.\nhttps://www.doctours.com/clinic/heva" });
    expect(names(page)).toContain("urlProvenance");
    expect(names(page, withTools(["getAllClinics", {}]))).not.toContain("urlProvenance");
  });
});

describe("priceProvenance", () => {
  it("flags a price no tool returned", () => {
    expect(names(reply({ response: "Silver is $2,900." }))).toContain("priceProvenance");
  });
  it("allows tool prices in any format, the $25 fee, and price minus deposit", () => {
    const r = reply({ response: "Silver is $3,000 USD with a $500 deposit, leaving $2,500. Cancelling costs $25. Gold is 4500 USD." });
    expect(names(r, heva())).not.toContain("priceProvenance");
  });
  it("allows a number the patient quoted when echoed back", () => {
    const r = reply({ response: "Through Doctours, Silver is $3,000, not $2,600." });
    expect(names(r, heva(), "Heva quoted me $2,600")).not.toContain("priceProvenance");
    expect(names(r, heva())).toContain("priceProvenance");
  });
});

describe("priceProvenance with a wrong price in the chat history", () => {
  const hist = buildContext({ CHAT_LIST: "[Sep 26, 8:20 AM] Alex: Heva's Gold package is $4,200 with a $600 deposit." });
  it("allows the old price when the reply corrects it", () => {
    const r = reply({ response: "Heva's Gold package is $4,500 with a $600 deposit. I quoted $4,200 earlier, which was wrong." });
    expect(validate(r, heva(), hist).map((v) => v.name)).not.toContain("priceProvenance");
  });
  it("still blocks the old price stated as fact", () => {
    const r = reply({ response: "Heva's Gold package is $4,200." });
    expect(validate(r, heva(), hist).map((v) => v.name)).toContain("priceProvenance");
  });
});

describe("noCardDigits", () => {
  it("flags echoed card digits", () => {
    expect(names(reply({ response: "I can't charge the card ending in 4242." }))).toContain("noCardDigits");
    expect(names(reply({ response: "Got 4242 4242 4242 4242." }))).toContain("noCardDigits");
  });
  it("does not mistake an ID inside a URL for card digits", () => {
    const log = withTools(["getLatestAssessment", {}]);
    expect(names(reply({ response: "Pay from your assessment.\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333" }), log)).not.toContain("noCardDigits");
    expect(names(reply({ response: "Your plan id is c3d4e5f6-3333-4333-8333-333333333333." }))).not.toContain("noCardDigits");
  });
  it("does not flag a phone number or a graft count", () => {
    expect(names(reply({ response: "Your estimate is 2,800 grafts." }))).not.toContain("noCardDigits");
  });
});

describe("escalationShape", () => {
  it("needs a reason when escalating and none when not", () => {
    expect(names(reply({ escalate: true, escalationReason: null }))).toContain("escalationShape");
    expect(names(reply({ escalate: false, escalationReason: "x" }))).toContain("escalationShape");
    expect(names(reply({ escalate: true, escalationReason: "asked for a person" }))).not.toContain("escalationShape");
  });
  it("does not police the text of an escalated reply, since code replaces it", () => {
    const r = reply({ escalate: true, escalationReason: "x", response: "Sure! Silver is $2,900, see https://x.y and **someone will reach out**." });
    expect(names(r)).toEqual([]);
  });
});

describe("fieldSanity", () => {
  it("checks templateId, attachments and empty replies", () => {
    expect(names(reply({ templateId: "t" }))).toContain("fieldSanity");
    expect(names(reply({ attachmentUrls: ["https://a", "https://b", "https://c", "https://d"] }))).toContain("fieldSanity");
    expect(names(reply({ attachmentUrls: ["https://assets.example.invalid/x.jpg"] }))).toContain("fieldSanity");
    expect(names(reply({ response: "  " }))).toContain("fieldSanity");
  });
  it("allows patient image URLs a tool returned", () => {
    const log = withTools(["getPatientImages", {}]);
    const url = "https://assets.example.invalid/intake/7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11/front.jpg";
    expect(names(reply({ attachmentUrls: [url] }), log)).not.toContain("fieldSanity");
  });
});

describe("bannedPhrases", () => {
  it("bans assessment turnaround windows but not real commitments", () => {
    expect(names(reply({ response: "Your assessment should be ready in a few hours." }))).toContain("bannedPhrases");
    expect(names(reply({ response: "The clinic confirms the date within 24 hours of the deposit." }))).not.toContain("bannedPhrases");
  });
  it("bans stalling and head-covering advice", () => {
    expect(names(reply({ response: "Let me look into that and get back to you." }))).toContain("bannedPhrases");
    expect(names(reply({ response: "Bring a loose cap for afterwards." }))).toContain("bannedPhrases");
  });
});

describe("claimsVsReceipts", () => {
  it("flags a handoff claim without escalate", () => {
    expect(names(reply({ response: "I'm getting a person to help you with this." }))).toContain("claimsVsReceipts");
    expect(names(reply({ response: "Someone from our team will reach out shortly." }))).toContain("claimsVsReceipts");
  });
  it("flags a saved claim with no write tool and no memory update", () => {
    expect(names(reply({ response: "I've saved Heva as your clinic." }))).toContain("claimsVsReceipts");
    const log = withTools(["updateUserClinicPreferences", { clinicSelection: { selectedClinicId: "11111111-1111-4111-8111-111111111111" } }]);
    expect(names(reply({ response: "I've saved Heva as your clinic." }), log)).not.toContain("claimsVsReceipts");
  });
  it("flags 'link below' with no link", () => {
    expect(names(reply({ response: "You can book using the link below." }))).toContain("claimsVsReceipts");
  });
});

describe("toolRequired", () => {
  it("flags a price or package name stated with no package tool call", () => {
    expect(names(reply({ response: "Silver is $3,000." }))).toContain("toolRequired");
    expect(names(reply({ response: "Heva has Silver and Gold." }))).toContain("toolRequired");
    expect(names(reply({ response: "Silver is $3,000." }), heva())).not.toContain("toolRequired");
  });
  it("allows the $25 fee without a tool", () => {
    expect(names(reply({ response: "Until lock-in the deposit is refundable minus a $25 fee." }))).not.toContain("toolRequired");
  });
});

describe("autoFix", () => {
  it("strips markdown and moves URLs to the end", () => {
    const { reply: r, fixed } = autoFix(reply({ response: "**Yes.** Book at https://www.doctours.com/consultation today.\n- thanks" }));
    expect(r.response).toBe("Yes. Book using the link below today.\nthanks\nhttps://www.doctours.com/consultation");
    expect(fixed).toEqual(expect.arrayContaining(["plainText", "urlLastLine"]));
  });
  it("drops the word that pointed at the moved URL", () => {
    expect(autoFix(reply({ response: "You can book it at https://www.doctours.com/consultation." })).reply.response)
      .toBe("You can book it using the link below.\nhttps://www.doctours.com/consultation");
    expect(autoFix(reply({ response: "Pay here: https://www.doctours.com/consultation" })).reply.response)
      .toBe("Pay using the link below.\nhttps://www.doctours.com/consultation");
  });
  it("nulls a stray reason, fills a missing one, nulls templateId", () => {
    expect(autoFix(reply({ escalate: false, escalationReason: "x" })).reply.escalationReason).toBeNull();
    expect(autoFix(reply({ escalate: true, escalationReason: null })).reply.escalationReason).toBeTruthy();
    expect(autoFix(reply({ templateId: "t" })).reply.templateId).toBeNull();
  });
  it("leaves a clean reply untouched", () => {
    const r = reply({ response: "Yes, it's free.\nhttps://www.doctours.com/consultation" });
    expect(autoFix(r)).toEqual({ reply: r, fixed: [] });
  });
});

describe("retry message", () => {
  it("is an external verdict listing violations and allowed values", () => {
    const log = heva();
    const msg = retryMessage([{ name: "priceProvenance", detail: "price not from a tool this turn: 2900" }], log);
    expect(msg.startsWith("A validator rejected the previous reply.")).toBe(true);
    expect(msg).toContain("priceProvenance");
    expect(msg).toContain("3000");
    expect(msg).toContain("https://www.doctours.com/consultation");
    expect(allowedValues(log).prices).toEqual(expect.arrayContaining([3000, 4500, 500, 600, 25]));
  });
  it("names every validator", () => {
    expect([...VALIDATOR_NAMES].sort()).toEqual(["bannedPhrases", "claimsVsReceipts", "escalationShape", "fieldSanity", "noCardDigits", "plainText", "priceProvenance", "toolRequired", "urlLastLine", "urlProvenance"]);
  });
});
