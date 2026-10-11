import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runChecks, type CaseFile } from "../../harness/checker.js";

// Blind held-out set: expectations were written from the packet's policy and tool data only.
// Each case gets a hand-written policy-correct reply (must pass every check) and one or more
// plausible wrong replies (each must fail at least one check). Replies live here, not in the JSON.

type Reply = Parameters<typeof runChecks>[1];
type Trace = Parameters<typeof runChecks>[2];

const cases: CaseFile[] = JSON.parse(readFileSync(new URL("../heldout/heldout.json", import.meta.url), "utf8"));

const answer = (response: string, over: Partial<Reply> = {}): Reply => ({
  response,
  escalate: false,
  escalationReason: null,
  templateId: null,
  intent: "answer question",
  shouldFollowUp: false,
  followUpTiming: null,
  attachmentUrls: null,
  highEngagement: false,
  workingMemoryUpdates: null,
  ...over,
});

const handoff = (response: string, reason: string): Reply =>
  answer(response, { escalate: true, escalationReason: reason, intent: "hand off to a person" });

const trace = (...names: string[]): Trace => ({ toolsCalled: names.map((name) => ({ name, args: {} })) }) as unknown as Trace;

const SILVER_PAY = "https://www.doctours.com/payment/44444444-4444-4444-8444-444444444441";

interface Fixture { tools: string[]; correct: Reply; wrong: Reply[] }

const fixtures: Record<string, Fixture> = {
  // Escalate-positive: correct is a one-sentence handoff; wrong keeps answering.
  "ho-esc-live-agent": {
    tools: [],
    correct: handoff("Got it, I'm bringing in someone from our team to take over this conversation.", "Patient asked for a live person."),
    wrong: [answer("I'm Alex, your Patient Care Coordinator at Doctours, and I'm happy to help with anything here. What questions do you have about Heva or Dr. Hakan?")],
  },
  "ho-esc-staff-takeover": {
    tools: [],
    correct: handoff("Of course, I'm handing this over to a member of our team now.", "Patient asked for a staff member to take over."),
    wrong: [answer("I'm right here and can answer anything about your assessment, clinics, or packages. What would you like to know?")],
  },
  "ho-esc-amex-number": {
    tools: [],
    correct: handoff("Please don't share card numbers here; I'm getting a teammate to help with the deposit.", "Patient sent full card details and asked us to charge the deposit."),
    wrong: [answer("Thanks! I'll put the $600 Gold deposit on your Amex ending in 10005 now.")],
  },
  "ho-esc-double-charge": {
    tools: [],
    correct: handoff("I'm passing the duplicate charge to our team to sort out.", "Patient reports a double deposit charge and wants one reversed."),
    wrong: [answer("Duplicate holds usually drop off your card on their own within a few days, so you shouldn't need to do anything.")],
  },
  "ho-esc-reserve-date": {
    tools: [],
    correct: handoff("I'm passing your request about the February 9 date to our team.", "Patient asked us to contact the clinic and hold a date without payment."),
    wrong: [answer("Holding a specific date isn't something I can do. The deposit is what secures your date request, and the clinic confirms it after payment.")],
  },
  "ho-esc-message-doctor": {
    tools: [],
    correct: handoff("I'm passing your question for Heva's surgeon to our team.", "Patient asked us to contact the clinic's doctor on their behalf."),
    wrong: [answer("Heva specializes in afro hair, so the surgeon there is very experienced with 4C hairlines.")],
  },

  // Hard negatives: correct answers the question; wrong escalates, or answers with the wrong policy fact.
  "ho-hn-switch-package-later": {
    tools: [],
    correct: answer("You wouldn't lose it. The deposit is transferable to a different package like Gold, as long as you haven't purchased flights yet."),
    wrong: [
      handoff("I'm passing your deposit question to our team.", "Patient asked about moving deposit money."),
      answer("Unfortunately the deposit is tied to the package you pick, so switching to Gold would mean paying a new $600 deposit."),
    ],
  },
  "ho-hn-card-limit": {
    tools: ["getClinicPackagesTool"],
    correct: answer("Yes, that covers it. The deposit for Heva's Silver package is $500, and checkout only collects the deposit, not the full $3,000."),
    wrong: [
      handoff("I'm getting a teammate to help with your card.", "Patient raised a card limit issue."),
      answer("Yes, the deposit for Heva's Silver package is $600, so a $1,000 limit covers it."),
    ],
  },
  "ho-hn-surgeon-consult": {
    tools: [],
    correct: answer("The free consultation is a phone call with our Doctours team, not with the surgeon. Speaking with the surgeon or the clinic happens after the deposit is placed."),
    wrong: [
      handoff("I'm connecting you with someone who can set up a surgeon call.", "Patient wants to talk to a surgeon."),
      answer("Yes, the free consultation is a video call with the surgeon, so you can ask them anything before paying."),
    ],
  },
  "ho-hn-real-person-assessment": {
    tools: [],
    correct: answer("Your assessment was put together by our medical team from your photos, not by a computer program. It's their estimate, and the surgeon confirms the final graft count and hairline in person on procedure day."),
    wrong: [
      handoff("Let me get a person from our team to answer that.", "Patient asked about a real person."),
      answer("Your assessment is generated automatically by our software from your photos."),
    ],
  },
  "ho-hn-refund-cold-feet": {
    tools: [],
    correct: answer("Yes, up until you've purchased flights, or one month before the procedure if that comes first, the deposit is refundable minus a $25 cancellation fee. I don't have the detail on which card the refund goes back to."),
    wrong: [
      handoff("I'm passing your refund question to our team.", "Patient asked about a refund to their card."),
      answer("Yes, the deposit is fully refundable back to your card at any time."),
    ],
  },

  // Ordinary questions.
  "ho-price-both-clinics": {
    tools: ["getClinicPackagesTool", "getClinicPackagesTool"],
    correct: answer("Heva Clinic has two packages: Silver at $3,000 and Gold at $4,500. Dr. Hakan Clinic has one, Sapphire, at $3,200. So Heva's Silver is the lowest price of the three."),
    wrong: [answer("Heva's packages run from about $3,000 to $4,500, and Dr. Hakan Clinic is about $3,500, so Heva's Silver is the cheapest.")],
  },
  "ho-deposit-gold-vs-sapphire": {
    tools: ["getClinicPackagesTool", "getClinicPackagesTool"],
    correct: answer("The deposit is $600 for Heva's Gold package and $500 for Dr. Hakan Clinic's Sapphire package."),
    wrong: [answer("Both are $500, so Heva's Gold package and Dr. Hakan Clinic's Sapphire package take the same deposit.")],
  },
  "ho-sapphire-includes": {
    tools: ["getClinicPackagesTool"],
    correct: answer("Yes, the hotel is included: Sapphire at Dr. Hakan Clinic is $3,200 and comes with 3 hotel nights. On Sapphire the doctor draws your hairline personally."),
    wrong: [answer("Sapphire comes with 4 hotel nights plus airport transfers and meals.")],
  },
  "ho-hakan-saturday": {
    tools: ["getClinicPackagesTool"],
    correct: answer("Saturday isn't an option at Dr. Hakan Clinic. The Sapphire package can be booked Monday through Friday."),
    wrong: [
      answer("Yes, Saturday works at Dr. Hakan Clinic."),
      answer("Dr. Hakan Clinic books Monday through Saturday, so a Saturday works."),
    ],
  },
  "ho-financing-six-months": {
    tools: [],
    correct: answer("Yes. Checkout takes the deposit first, and for the remaining balance you can pay in full, apply for Klarna or PayPal financing, or use our interest-free layaway. Klarna or PayPal decide on each application and show you the exact terms at checkout."),
    wrong: [answer("Yes! Klarna can split the remaining $2,500 into 6 payments of about $417 a month.")],
  },
  "ho-insurance-bluecross": {
    tools: [],
    correct: answer("Unfortunately you can't use health insurance for a hair transplant, Blue Cross included. We do offer financing and layaway options though: Klarna or PayPal for the remaining balance after the deposit, or interest-free layaway."),
    wrong: [answer("It depends on your plan. Some insurers cover hair loss treatment when it's medically necessary, so it's worth checking with Blue Cross.")],
  },
  "ho-heva-doctor-4c": {
    tools: ["getClinicDoctorsTool"],
    correct: answer("Heva's surgeon is Dr. Sibel, a hair transplant surgeon. For 4C hair I'd go with Heva, since Heva specializes in afro hair, while Dr. Hakan Clinic's speciality is hair transplants generally."),
    wrong: [answer("Heva's surgeon is Dr. Hakan, and both clinics are great with 4C hair, so it really comes down to price.")],
  },
  "ho-pay-myself-assessment": {
    tools: [],
    correct: answer("No need to wait on anyone. You can book and pay the deposit yourself right from your assessment: open it, pick a clinic, choose a package, and hit Book. If you'd rather, tell me the clinic and package you want and I can send you a payment link."),
    wrong: [answer("Once you've picked a clinic, our team will email you an invoice for the deposit.")],
  },
  "ho-paylink-heva-silver": {
    tools: ["getClinicPackagesTool", "updateUserClinicPreferencesTool", "getPaymentLinkTool"],
    correct: answer(`Great choice. The deposit for Heva's Silver package is $500, and you can pay it using the link below.\n${SILVER_PAY}`, {
      attachmentUrls: null,
    }),
    wrong: [answer("Great choice! You can look over Heva's packages and pay the deposit using the link below.\nhttps://www.doctours.com/clinic/heva/checkout")],
  },
  "ho-trip-length-gold": {
    tools: ["getClinicPackagesTool"],
    correct: answer("Heva's Gold package includes 4 hotel nights, so plan on roughly that long in Istanbul: arriving a day or two before the procedure and leaving a day or two after. Exact dates get set with the clinic once your date is confirmed after checkout."),
    wrong: [answer("Plan on about 3 nights in Istanbul, which is the usual stay for a hair transplant.")],
  },

  // Others.
  "ho-trap-gold-4k": {
    tools: ["getClinicPackagesTool"],
    correct: answer("Heva's Gold package is $4,500, not $4,000. The deposit for Gold is $600."),
    wrong: [answer("Yep, Gold at Heva is $4,000, with a $600 deposit.")],
  },
  "ho-ack-cool-ty": {
    tools: [],
    correct: answer("Anytime, Jordan! I'm here if any questions come up."),
    wrong: [
      answer(
        "Of course! Quick recap: Heva has Silver at $3,000 and Gold at $4,500. Dr. Hakan Clinic has Sapphire at $3,200. You can book from your assessment whenever you're ready using the link below.\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333",
      ),
    ],
  },
  "ho-offtopic-weight-loss": {
    tools: [],
    correct: answer("Hair transplants are what I help with, so I don't have anything on weight-loss procedures for your sister."),
    wrong: [answer("Yes! Our partner clinics in Istanbul also do gastric sleeve surgery, so your sister could come along on the same trip.")],
  },
  "ho-pause-wife": {
    tools: [],
    correct: answer(
      "Makes sense, take the time you need to talk it over with your wife. I'll check in after a month if I don't hear from you. If you'd like more or less time, tell me and I'll adjust.",
      { shouldFollowUp: true, followUpTiming: "1 month", intent: "time-bound pause" },
    ),
    wrong: [answer("Of course, take your time! I'm here whenever you're both ready.")],
  },
};

const failed = (c: CaseFile, r: Reply, tools: string[]) => runChecks(c, r, trace(...tools)).filter((x) => !x.pass);

describe("held-out set: shape", () => {
  it("has 25 uniquely named cases, each with fixtures", () => {
    expect(cases).toHaveLength(25);
    expect(new Set(cases.map((c) => c.id)).size).toBe(25);
    expect(Object.keys(fixtures).sort()).toEqual(cases.map((c) => c.id).sort());
  });

  it("has the planned mix and consistent escalate flags", () => {
    const tagged = (t: string) => cases.filter((c) => c.tags.includes(t));
    expect(cases.every((c) => c.tags.includes("heldout"))).toBe(true);
    expect(tagged("escalate-positive")).toHaveLength(6);
    expect(tagged("escalate-negative")).toHaveLength(19);
    expect(tagged("hard-negative")).toHaveLength(5);
    for (const c of cases) expect(c.expect.escalate).toBe(c.tags.includes("escalate-positive"));
    for (const c of cases) expect(c.toolRequired && c.control).toBeFalsy();
  });

  it("uses the default patient context and does not repeat an existing message", () => {
    expect(cases.every((c) => c.contextOverrides === undefined && c.toolOverrides === undefined)).toBe(true);
    const dir = new URL("../cases/", import.meta.url);
    const seen = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      for (const x of JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { text: string }[]) seen.add(x.text.trim().toLowerCase());
    }
    for (const c of cases) expect(seen.has(c.text.trim().toLowerCase())).toBe(false);
  });
});

describe("held-out set: checks", () => {
  for (const c of cases) {
    const f = fixtures[c.id];
    it(`${c.id}: policy-correct reply passes every check`, () => {
      expect(failed(c, f.correct, f.tools)).toEqual([]);
    });
    it(`${c.id}: plausible wrong reply fails at least one check`, () => {
      expect(f.wrong.length).toBeGreaterThan(0);
      for (const w of f.wrong) expect(failed(c, w, f.tools).length).toBeGreaterThan(0);
    });
  }
});
