import { describe, it, expect } from "vitest";
import { pregate, redactCardDigits, isQuestion } from "../../src/pipeline/pregate.js";

const yes = (t: string, cat: string) => {
  const r = pregate(t);
  expect(r.escalate, t).toBe(true);
  expect(r.category, t).toBe(cat);
  expect(r.reason, t).toBeTruthy();
};
const no = (t: string) => {
  const r = pregate(t);
  expect(r.escalate, t).toBe(false);
  expect(r.category, t).toBeNull();
  expect(r.reason, t).toBeNull();
};

describe("pregate human_request", () => {
  it("fires on explicit requests for a person", () => {
    for (const t of [
      "I demand to talk to a human", "get me a real person please", "I want to speak with your manager",
      "stop the bot and connect me to a human", "is there a human I can talk to?", "can I speak to someone?",
      "let me talk to an actual person", "transfer me to an agent", "I need a human", "put me through to a representative",
      "I'd like to talk to a person", "Can I chat with a live person", "I want a human",
    ]) yes(t, "human_request");
  });
  it("does not fire on look-alikes or identity questions", () => {
    for (const t of [
      "is that humanly possible with 2800 grafts?", "my HR department asked about leave", "are you a bot or a real person?",
      "is it my own human hair that gets used?", "who am I talking to?", "do the doctors speak English?",
      "I'm a person who likes to plan ahead", "someone told me the price was $2,800", "what's your name?",
      "are you a bot?", "am I talking to a human?", "is this a real person?", "can I talk to the surgeon before surgery?",
      "will I talk to a real person on the consultation call?", "do I get to speak with the doctor first?",
    ]) no(t);
  });
});

describe("pregate card", () => {
  it("fires on card digits in any format", () => {
    for (const t of [
      "Charge the deposit on my card ending in 4242 right now.", "my card is 4111 1111 1111 1111, go ahead",
      "4242-4242-4242-4242 exp 12/28", "here's my visa 4111111111111111", "card number 5555 4444 3333 2222",
      "4242 4242 4242 4242", "use the visa that ends in 1234", "can you charge my card ending in 4242?",
    ]) yes(t, "card_details");
  });
  it("fires on charge requests without digits", () => {
    for (const t of [
      "charge my card for the deposit", "run my card now", "just bill my credit card", "charge it to my card",
      "can you charge my card for the deposit?", "could you run my card please", "take the deposit from my card",
    ]) yes(t, "charge_request");
  });
  it("does not fire on card questions or other numbers", () => {
    for (const t of [
      "can I pay the deposit with my debit card?", "do you take credit cards?", "can I put it on my card?",
      "my phone number is 5555550123", "the assessment id is c3d4e5f6-3333-4333-8333-333333333333", "I have 2800 grafts estimated",
      "I only have a debit card.", "I'll put it on my card when I'm ready", "what's the process for paying by card",
      "will my card be charged each month for layaway?", "my phone ends in 0123",
    ]) no(t);
  });
  it("redacts digits", () => {
    expect(redactCardDigits("card ending in 4242 and 4111 1111 1111 1111")).toBe("card ending in [redacted] and [redacted]");
    expect(redactCardDigits("4242-4242-4242-4242 exp 12/28")).toBe("[redacted] exp 12/28");
    expect(redactCardDigits("visa 4242 4242 4242 4242.")).toBe("visa [redacted].");
    expect(pregate("charge my card ending in 4242").redactedText).not.toContain("4242");
    expect(pregate("my card is 4111 1111 1111 1111, go ahead").redactedText).not.toMatch(/1111/);
  });
  it("leaves other numbers alone", () => {
    const t = "the assessment id is c3d4e5f6-3333-4333-8333-333333333333 and I have 2800 grafts";
    expect(redactCardDigits(t)).toBe(t);
    expect(pregate("Is the consultation free?").redactedText).toBe("Is the consultation free?");
  });
});

describe("isQuestion", () => {
  it("detects questions", () => {
    expect(isQuestion("can I pay by card?")).toBe(true);
    expect(isQuestion("Do you take cards")).toBe(true);
    expect(isQuestion("Charge my card now.")).toBe(false);
    expect(isQuestion("I want to book")).toBe(false);
  });
});
