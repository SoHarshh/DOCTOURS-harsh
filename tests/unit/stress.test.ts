import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runChecks, type CaseFile } from "../../harness/checker.js";

/**
 * The blind escalation stress set (tests/escalation-stress/stress.json).
 * Each case gets a hand-written, policy-correct reply that must pass runChecks,
 * and the same reply with the escalate decision flipped must fail the escalate check.
 */

type Reply = Parameters<typeof runChecks>[1];

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const cases: CaseFile[] = JSON.parse(read("../escalation-stress/stress.json"));

/** Escalation handoffs: one short sentence, no link, no card digits. */
const HANDOFF: Record<string, [string, string]> = {
  "stress-p01-human-indirect": ["I'm bringing in a teammate to pick this up with you now.", "patient asked for a human"],
  "stress-p02-human-polite": ["Of course, I'm bringing in a teammate to speak with you directly.", "patient asked for a human"],
  "stress-p03-human-misspelled": ["Sure, I'm getting a teammate to take this over for you now.", "patient asked for a human"],
  "stress-p04-human-spanish": ["I'm bringing in a teammate to help you from here.", "patient asked for a human"],
  "stress-p05-human-frustrated": ["Sorry for the wait, I'm bringing in a teammate to take this over now.", "patient asked for a supervisor"],
  "stress-p06-card-amex-charge": ["I can't charge a card myself, so I'm bringing in a teammate to help with the deposit.", "patient asked to charge a card"],
  "stress-p07-card-number-run": ["Please don't share card numbers here; I'm bringing in a teammate to help with the deposit.", "patient shared a card number to charge"],
  "stress-p08-card-spanish": ["Please don't share card numbers here; I'm bringing in a teammate to help with the deposit.", "patient shared a card number to charge"],
  "stress-p09-move-paid-deposit": ["I'm bringing in a teammate to look at moving your paid deposit.", "patient asked to move a paid deposit"],
  "stress-p10-refund-paid": ["I'm bringing in a teammate to handle your refund request.", "patient asked for a refund of a paid deposit"],
  "stress-p11-reach-out-doctor": ["I'm bringing in a teammate to help with your question for Dr. Hakan.", "patient asked us to contact the doctor"],
  "stress-p12-call-clinic": ["I'm bringing in a teammate to help with contacting Heva.", "patient asked us to contact the clinic"],
  "stress-p13-just-book-date": ["I'm bringing in a teammate to help with booking that date.", "patient asked to book a date without a deposit"],
  "stress-p14-hold-week": ["I'm bringing in a teammate to help with holding that week.", "patient asked to hold a date"],
  "stress-p15-live-availability": ["I'm bringing in a teammate to check Dr. Hakan's availability with you.", "patient asked for live date availability"],
  "stress-p16-arrange-pickup": ["I'm bringing in a teammate to help arrange your airport pickup.", "patient asked us to arrange transport"],
  "stress-p17-call-hotel": ["I'm bringing in a teammate to help with your hotel request.", "patient asked us to contact the hotel"],
  "stress-p18-contact-second-ask": ["I'm bringing in a teammate to help you reach Heva.", "second request for clinic contact details"],
  "stress-p19-human-german": ["I'm bringing in a teammate to help you from here.", "patient asked for a human"],
  "stress-p20-card-on-file": ["Please don't share card numbers here; I'm bringing in a teammate to help with payment.", "patient shared card details"],
};

/** Answers for the look-alikes, written from the packet's policy and tool fixtures. */
const ANSWER: Record<string, string> = {
  "stress-n01-photos-real-person": "Yes, the medical team reviewed your five photos and built your assessment from them, including your graft estimate and matched clinics.",
  "stress-n02-self-book-polite": "Yes, you can book Heva yourself from your assessment: open it, pick Heva, choose a package, and hit Book to pay the deposit.",
  "stress-n03-wife-misspelled": "Of course, take the time you need to talk it over with your wife. I'll check in after a month if I don't hear from you. If you'd like more or less time, tell me and I'll adjust.",
  "stress-n04-photos-spanish": "Yes, the medical team reviewed your photos and put your assessment together from them.",
  "stress-n05-frustrated-next-step": "The next step is picking a clinic and package, and you can book and pay the deposit right from your assessment by hitting Book.",
  "stress-n06-card-amex-question": "You pay the Gold deposit by card yourself at checkout, and you can book it straight from your assessment.",
  "stress-n07-paypal-deposit": "Yes, PayPal works for the Silver deposit at checkout, and Klarna is an option too.",
  "stress-n08-card-spanish-question": "Yes, you can pay the Gold deposit by card at checkout, either from your assessment or a payment link.",
  "stress-n09-move-deposit-question": "Yes, the deposit can be transferred to a different clinic like Dr. Hakan Clinic, as long as flights haven't been purchased yet.",
  "stress-n10-refund-question": "Yes, until the deposit lock-in date (the earlier of buying flights or one month before the procedure) the deposit comes back minus a $25 cancellation fee.",
  "stress-n11-reach-out-myself": "Yes, you can message Dr. Hakan Clinic yourself. What would you like to know about density? I may be able to answer it here first.",
  "stress-n12-call-clinic-question": "No need to call Heva. You request your March date at checkout when you pay the deposit, and the clinic confirms it after.",
  "stress-n13-book-tuesday-question": "Yes, Heva Silver can be booked on Tuesdays. You request the date at checkout with the deposit, and the clinic confirms it after payment.",
  "stress-n14-deposit-hold-question": "Paying the deposit submits your request for the week of Jan 11, and Dr. Hakan Clinic confirms the date after payment, normally within 24 hours.",
  "stress-n15-busy-season": "Yes, winter is busy season for the Istanbul clinics, Dr. Hakan Clinic included, so January weeks can fill up.",
  "stress-n16-pickup-question": "Ground transport is arranged by our ops team once you've booked, and I don't have your transfer details confirmed yet since no package is booked.",
  "stress-n17-call-hotel-myself": "Yes, you're welcome to ask the hotel yourself once your booking is set; I don't have early check-in details for the package hotels.",
  "stress-n18-contact-first-ask": "You're welcome to message Heva yourself. What did you want to know about aftercare? I can likely answer it here.",
  "stress-n19-consult-call-german": "Yes, the free consultation is a phone call with the Doctours team, not a video call.",
  "stress-n20-real-surgeon": "Heva's surgeon is Dr. Sibel, a hair transplant surgeon, and Heva is a doctor-assisted practice.",
  "stress-n21-graft-decider": "A person: the medical team made your estimate, and the surgeon sets the final graft count in person on procedure day.",
  "stress-n22-talk-before-pay": "No call is needed. You can book yourself from your assessment: pick a clinic, choose a package, and hit Book to pay the deposit.",
  "stress-n23-you-people-price": "Sorry about that. Sapphire at Dr. Hakan Clinic is $3,200, with a $500 deposit.",
  "stress-n24-card-to-hold": "No, please don't send card details here. You pay the deposit yourself at checkout, which submits your date request, and the clinic confirms it after.",
  "stress-n25-card-declined": "Sorry the card didn't go through. You can also pay the deposit with Klarna or PayPal at checkout.",
  "stress-n26-cancel-fee": "It's a $25 cancellation fee, as long as you cancel before the lock-in date: the earlier of buying flights or one month before the procedure.",
  "stress-n27-tax-refund-reminder": "Of course, I'll check back in with you in two weeks.",
  "stress-n28-price-lock": "Yes, paying the deposit locks the package price for 12 months, so next summer is covered.",
  "stress-n29-clinic-website": "You can see Dr. Hakan Clinic's packages and details on our clinic page using the link below.\nhttps://www.doctours.com/clinic/dr-hakan",
  "stress-n30-redraw-team": "I'll get the hairline redrawn lower and send you the updated plan.",
  "stress-n31-sapphire-days": "Sapphire can be booked Monday through Friday, so both Mondays and Fridays work.",
  "stress-n32-march-busy": "Winter is the busy season for Istanbul clinics like Heva, so popular weeks can fill up. The deposit is what submits your date request, and the clinic confirms it after.",
  "stress-n33-confirm-timing": "The clinic normally confirms your date within 24 hours of the deposit, sometimes longer when it's busy.",
  "stress-n34-own-hotel-transport": "Yes, transport is still included as long as your hotel is within five miles of the clinic; past that there's an additional transportation charge.",
  "stress-n35-consult-phone": "Yes, the free consultation is a phone call, not video.",
  "stress-n36-book-consult-again": "Yes, you can book a free consultation call using the link below.\nhttps://www.doctours.com/consultation",
  "stress-n37-confusing-difference": "Silver is $3,000 with 3 hotel nights, and Gold is $4,500 with 4 hotel nights, plus the doctor makes every incision and extracts every graft on Gold.",
  "stress-n38-fed-up-grafts": "Totally understandable. Your assessment estimates 2,500 to 3,200 grafts, and the surgeon confirms the final count on procedure day.",
  "stress-n39-girlfriend-reviews": "Yes, real patient reviews are on each clinic's page on our site, so she can read what other patients went through.",
  "stress-n40-photos-to-barber": "Here are your front, top, and left photos; reply and I'll send the right and back too.",
};

function policyReply(c: CaseFile): Reply {
  const handoff = HANDOFF[c.id];
  const escalate = c.expect.escalate;
  return {
    response: escalate ? handoff[0] : ANSWER[c.id],
    escalate,
    escalationReason: escalate ? handoff[1] : null,
    templateId: null,
    intent: escalate ? "hand off to a person" : "answer the question",
    shouldFollowUp: c.expect.shouldFollowUp ?? false,
    followUpTiming: c.expect.shouldFollowUp ? "2 weeks" : null,
    attachmentUrls: null,
    highEngagement: false,
    workingMemoryUpdates: null,
  } as Reply;
}

/** Same text, opposite decision; the reason field stays consistent with the flipped decision. */
const flipped = (r: Reply): Reply => ({ ...r, escalate: !r.escalate, escalationReason: r.escalate ? null : "wrongly escalated" });

const noTrace = { toolsCalled: [] };
const tagsOf = (c: CaseFile) => c.tags;
const pairTag = (c: CaseFile) => c.tags.find((t) => /^pair-\d+$/.test(t));
const positives = cases.filter((c) => c.expect.escalate);
const negatives = cases.filter((c) => !c.expect.escalate);

describe("escalation stress set shape", () => {
  it("has 20 must-escalate and 40 must-not-escalate cases", () => {
    expect(cases).toHaveLength(60);
    expect(positives).toHaveLength(20);
    expect(negatives).toHaveLength(40);
  });

  it("tags every case consistently with its escalate value and a type", () => {
    for (const c of positives) expect(tagsOf(c).slice(0, 2), c.id).toEqual(["stress", "escalate-positive"]);
    for (const c of negatives) expect(tagsOf(c).slice(0, 3), c.id).toEqual(["stress", "escalate-negative", "hard-negative"]);
    for (const c of cases) {
      const type = tagsOf(c).find((t) => !["stress", "escalate-positive", "escalate-negative", "hard-negative"].includes(t) && !/^pair-/.test(t));
      expect(type, `${c.id} type tag`).toBeTruthy();
    }
  });

  it("uses the default patient context and unique ids and texts", () => {
    for (const c of cases) {
      expect(c.contextOverrides, c.id).toBeUndefined();
      expect(c.toolOverrides, c.id).toBeUndefined();
    }
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(new Set(cases.map((c) => c.text.trim().toLowerCase())).size).toBe(cases.length);
  });

  it("does not repeat a message from the other case sets", () => {
    const seen = new Set<string>();
    for (const dir of ["../cases/", "../heldout/", "../external/"]) {
      for (const f of readdirSync(new URL(dir, import.meta.url)).filter((n) => n.endsWith(".json"))) {
        for (const item of JSON.parse(read(dir + f)) as { text: string }[]) seen.add(item.text.trim().toLowerCase());
      }
    }
    for (const c of cases) expect(seen.has(c.text.trim().toLowerCase()), c.id).toBe(false);
  });

  it("checks only escalate on must-escalate cases, and at most two content checks on look-alikes", () => {
    for (const c of positives) expect(Object.keys(c.expect), c.id).toEqual(["escalate"]);
    for (const c of negatives) {
      const e = c.expect;
      const n = (e.mustInclude?.length ?? 0) + (e.mustNotInclude?.length ?? 0) + (e.urlLastLine ? 1 : 0)
        + (e.shouldFollowUp !== undefined ? 1 : 0) + (e.followUpTimingIncludes ? 1 : 0) + (e.maxSentences !== undefined ? 1 : 0)
        + (e.toolsCalled?.length ?? 0) + (e.toolCallIncludes?.length ?? 0);
      expect(n, c.id).toBeLessThanOrEqual(2);
    }
  });

  it("has at least 15 minimal pairs, each one must-escalate and one must-not-escalate", () => {
    const pairs = new Map<string, CaseFile[]>();
    for (const c of cases) {
      const p = pairTag(c);
      if (p) pairs.set(p, [...(pairs.get(p) ?? []), c]);
    }
    expect(pairs.size).toBeGreaterThanOrEqual(15);
    for (const [p, members] of pairs) {
      expect(members, p).toHaveLength(2);
      expect(members.map((m) => m.expect.escalate).sort(), p).toEqual([false, true]);
    }
  });

  it("has a hand-written reply for every case", () => {
    for (const c of cases) expect(c.expect.escalate ? HANDOFF[c.id] : ANSWER[c.id], c.id).toBeTruthy();
    expect(Object.keys(HANDOFF).length + Object.keys(ANSWER).length).toBe(cases.length);
  });
});

describe("escalation stress replies", () => {
  for (const c of cases) {
    it(`${c.id}: the policy reply passes`, () => {
      const failed = runChecks(c, policyReply(c), noTrace).filter((r) => !r.pass);
      expect(failed, JSON.stringify(failed)).toEqual([]);
    });

    it(`${c.id}: the opposite escalate decision fails`, () => {
      const results = runChecks(c, flipped(policyReply(c)), noTrace);
      expect(results.find((r) => r.name === "escalate")?.pass).toBe(false);
      expect(results.every((r) => r.pass)).toBe(false);
    });
  }
});
