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

describe("pregate review fixes", () => {
  it("a request still fires when an identity or how-it-works question sits in another sentence", () => {
    for (const t of [
      "Are you a bot? I want to talk to a real person.", "are you a bot? get me a human",
      "Would I be able to speak with a real person please?", "am I talking to a human? I need a human",
    ]) yes(t, "human_request");
  });
  it("a bare request for a person fires", () => {
    for (const t of ["Human please", "Agent", "representative", "a real person pls!!", "Operator."]) yes(t, "human_request");
  });
  it("other people in the patient's life are not a request for staff", () => {
    for (const t of [
      "Do I need a person to drive me home after surgery?", "Is there an agent fee on top of the clinic price?",
      "Is there a representative at the airport to meet me?", "Can I transfer my deposit to someone else?",
      "I need to talk to someone at home before deciding", "I want an agent fee waived",
      "Do I need to talk to a human to cancel?",
    ]) no(t);
  });
  it("can still ask for someone else on the team", () => {
    yes("can I talk to someone else?", "human_request");
    yes("I don't want to talk to a bot anymore", "human_request");
  });
  it("asking to hear from a past patient is not a handoff", () => {
    no("Can I speak to someone who has had the procedure at Heva?");
  });
  it("past-patient asks with contractions, 'who is/was' or 'that' do not fire", () => {
    for (const t of [
      "my brother would like to speak with someone who's had a transplant",
      "can I talk to a person who’s been through this?",
      "is there any way to chat with somebody who was a patient at Hakan",
      "I'd love to talk to someone that has done it before",
      "could my wife speak with someone who's a former patient?",
      "can I talk to someone who went to Heva?",
      "can I speak to somebody who've done the Gold package",
    ]) no(t);
  });
  it("a request for staff still fires, including 'who is' about our side", () => {
    for (const t of ["can I talk to someone on your team?", "I want to speak to someone who can actually help me", "let me talk to someone who is in charge"]) yes(t, "human_request");
  });
  it("charge requests naming the card brand or using 'put' fire", () => {
    yes("Charge my Visa for the deposit", "charge_request");
    yes("Put the deposit on my card please", "charge_request");
    no("I'll put it on my card when I'm ready");
  });
  it("negated or how-it-works charge sentences do not fire", () => {
    for (const t of [
      "Please don't charge my card until I pick a date", "Would you charge my card automatically each month for layaway?",
      "can you charge my card each month for layaway?",
    ]) no(t);
  });
  it("international phone numbers are not card numbers", () => {
    for (const t of ["call me on +234 803 123 4567", "my number is +55 11 98765 4321", "+86 138 0013 8000"]) no(t);
  });
  it("a long digit run that fails the card checksum fires only next to a card word", () => {
    no("my reference is 2348031234562");
    yes("my card is 2348031234562", "card_details");
  });
  it("card numbers with double spaces or dots fire and are redacted", () => {
    for (const t of ["4111  1111  1111  1111", "4111.1111.1111.1111", "4111 - 1111 - 1111 - 1111"]) {
      yes(t, "card_details");
      expect(pregate(t).redactedText, t).toBe("[redacted]");
    }
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

describe("pregate final review fixes", () => {
  it("asking to reach someone at the clinic is a clinic-contact question for the model, not a handoff", () => {
    for (const t of [
      "can I talk to someone at the clinic before I pay?",
      "can I speak with a representative from the clinic?",
      "could I chat with someone from Heva first?",
      "can I talk to a person at Dr. Hakan's office?",
    ]) expect(pregate(t).escalate, t).toBe(false);
  });
  it("asking for someone on our side still fires", () => {
    expect(pregate("can I talk to someone at Doctours?").escalate).toBe(true);
    expect(pregate("I want to speak to a real person").escalate).toBe(true);
  });
});

describe("review minors: redaction", () => {
  it("does not redact a year or a phone ending that is not next to a card word", () => {
    expect(redactCardDigits("my lease ends in 2027 so maybe after that")).toBe("my lease ends in 2027 so maybe after that");
    expect(redactCardDigits("card ending in 4242")).toBe("card ending in [redacted]");
  });
});
