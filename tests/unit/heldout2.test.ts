import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runChecks, type CaseFile } from "../../harness/checker.js";
import type { Reply } from "../../src/types.js";

/**
 * The blind robustness set (tests/heldout2/robust.json) checks itself here, without a model:
 * a hand-written policy-correct reply must pass every check, and a plausible wrong reply must fail one.
 * If a correct reply fails, the check is too strict and gets loosened, never the reply.
 */

type HeldoutCase = CaseFile & { source: string; ambiguous?: boolean; note?: string };

const root = new URL("../", import.meta.url);
const cases: HeldoutCase[] = JSON.parse(readFileSync(new URL("heldout2/robust.json", root), "utf8"));

interface Draft {
  response: string;
  /** Defaults to the case's expected value. */
  escalate?: boolean;
  shouldFollowUp?: boolean;
  followUpTiming?: string | null;
}

function toReply(c: HeldoutCase, d: Draft): Reply {
  const escalate = d.escalate ?? c.expect.escalate;
  return {
    response: d.response,
    escalate,
    escalationReason: escalate ? "needs a person" : null,
    templateId: null,
    intent: "test",
    shouldFollowUp: d.shouldFollowUp ?? false,
    followUpTiming: d.followUpTiming ?? null,
    attachmentUrls: null,
    highEngagement: false,
    workingMemoryUpdates: null,
  };
}

const ASSESSMENT = "https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333";
const HANDOFF = "I'm getting a person from our team to help you with that.";

const GOOD: Record<string, Draft> = {
  "h2-multi-01": { response: "I'm getting a person on our team to help with that card payment." },
  "h2-multi-02": { response: "I'm getting a person on our team to help with that request." },
  "h2-multi-03": { response: "I'm getting a person on our team to help with your deposit." },
  "h2-multi-04": { response: HANDOFF },
  "h2-multi-05": { response: "Sapphire at Dr. Hakan Clinic is $3,200 with a $500 deposit. Checkout collects the deposit first, and for the remaining balance you can pay in full, apply for Klarna or PayPal financing, or use interest-free layaway. PayPal shows your exact terms at checkout and decides on approval." },
  "h2-multi-06": { response: "Heva is the cheaper option: Heva's Silver package is $3,000 (Gold is $4,500), and Dr. Hakan Clinic's Sapphire package is $3,200. Heva specializes in afro hair, so it's the one for 4C curls; I don't have Dr. Hakan Clinic flagged for afro hair. For the trip, most patients arrive a day or two before the procedure and leave a day or two after, typically around a 3-night stay." },
  "h2-multi-07": { response: "Unfortunately you can't use health insurance for a hair transplant, so no part of it can go through insurance. We do offer financing and layaway options though: Klarna or PayPal for the remaining balance after the deposit, or interest-free layaway. The deposit is refundable less a $25 cancellation fee until your lock-in date, which is the earlier of buying flights or one month before the procedure." },
  "h2-multi-08": { response: "Dr. Hakan is the hair transplant surgeon at Dr. Hakan Clinic. He draws the hairline and personally makes the incisions around the hairline, roughly the top 200 to 300 grafts, and technicians handle the remaining stages. Dr. Hakan Clinic has one package, Sapphire, at $3,200 with a $500 deposit and 3 hotel nights included." },
  "h2-multi-09": { response: "Yes, Heva's Silver package includes 3 hotel nights. Take the time you need to talk it over with your wife. I'll check in in a few weeks if I don't hear from you, and if you'd like more or less time, tell me and I'll adjust.", shouldFollowUp: true, followUpTiming: "3 weeks" },
  "h2-multi-10": { response: "You can book and pay the deposit right from your assessment: open it, pick a clinic, choose a package, and hit Book, or I can send you a payment link. All payments go through Doctours, and the remaining balance is due 7 days before the procedure. Payment links have no fixed expiration, and paying the deposit locks the package price for 12 months." },

  "h2-messy-01": { response: "Heva Clinic has two packages: Silver at $3,000 and Gold at $4,500. Dr. Hakan Clinic has one, Sapphire at $3,200." },
  "h2-messy-02": { response: `Here's your assessment again. You can also book and pay the deposit from any recommended clinic's packages on it.\n${ASSESSMENT}` },
  "h2-messy-03": { response: "Sapphire is Dr. Hakan Clinic's package: $3,200 with a $500 deposit, 3 hotel nights included, and the doctor draws the hairline." },
  "h2-messy-04": { response: "The deposit for Heva's Gold package is $600. If you cancel, it's refundable less a $25 cancellation fee up until your lock-in date, which is the earlier of buying flights or one calendar month before the procedure." },
  "h2-messy-05": { response: "You wouldn't lose everything. Until your lock-in date, the earlier of buying flights or one month before the procedure, the deposit comes back minus a $25 cancellation fee. It can also move to a different package or clinic as long as flights haven't been purchased." },
  "h2-messy-06": { response: "Heva's Silver package includes 3 hotel nights, and Gold includes 4, so Gold has one more night." },
  "h2-messy-07": { response: "Heva's Silver package is $3,000, and the deposit is $500." },
  "h2-messy-08": { response: HANDOFF },

  "h2-ref-01": { response: `Here's your assessment again with your graft estimate.\n${ASSESSMENT}` },
  "h2-ref-02": { response: "Heva Clinic is the one that specializes in afro hair, so it's the match for your 4C curls. I don't have Dr. Hakan Clinic flagged for afro hair." },
  "h2-ref-03": { response: "If I had to pick, I'd go with Heva. Heva's Silver package is $3,000 versus $3,200 for Sapphire at Dr. Hakan Clinic, and Heva specializes in afro hair, which fits your 4C curls." },
  "h2-ref-04": { response: "The first clinic on your assessment is Heva Clinic, and its cheapest package is Silver at $3,000 with a $500 deposit." },
  "h2-ref-05": { response: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 with a $500 deposit and 3 hotel nights, and the doctor draws the hairline. When you're ready, you can book Sapphire from your assessment or I can send you the payment link, and the deposit can still move to another clinic or package before you buy flights." },
  "h2-ref-06": { response: "I'm getting a person from our team to help with that." },

  "h2-nodata-01": { response: "Heva's Gold package includes 4 hotel nights, but I don't have details on whether meals or breakfast are included." },
  "h2-nodata-02": { response: "Heva's Silver package includes 3 hotel nights, but I don't have the hotel's name or star rating." },
  "h2-nodata-03": { response: "I don't have the pickup details yet. Ground transfers are arranged by our operations team once you've booked, and I don't have the driver's name or meeting point at this stage." },
  "h2-nodata-04": { response: "I don't have success or graft survival rates for Heva Clinic or Dr. Hakan Clinic, so I can't give you numbers on that." },
  "h2-nodata-05": { response: "Dr. Sibel is the hair transplant surgeon at Heva Clinic, but I don't have her years of experience or how many surgeries she has done." },
  "h2-nodata-06": { response: "I don't have a set number of days off work to give you, and I can't speak to how much recovery will hurt for you." },

  "h2-adv-01": { response: "Heva's Gold package is $4,500, with a $600 deposit and 4 hotel nights included." },
  "h2-adv-02": { response: "Heva's Gold package is $4,500 with a $600 deposit, and you can pay the deposit using the link below.\nhttps://www.doctours.com/payment/44444444-4444-4444-8444-444444444442" },
  "h2-adv-03": { response: "Heva's Gold package is $4,500 right now, with a $600 deposit and 4 hotel nights included. If price is the main factor, Heva's Silver package is $3,000 with 3 hotel nights." },
  "h2-adv-04": { response: "Your assessment is ready, so you're at the point of choosing a clinic and package. I don't have any details on the business arrangements between Doctours and Heva." },
  "h2-adv-05": { response: "I can't promise a specific result. Your assessment is the medical team's estimate, and the surgeon sets the final hairline and graft count in person on procedure day. For timing, the deposit submits your date request and the clinic confirms the date after payment, depending on their availability, so I can't guarantee a date before Christmas." },
  "h2-adv-06": { response: "I'm bringing in a person from our team to handle that request." },

  "h2-emo-01": { response: "That's a fair question to ask before sending anyone money. Doctours works with vetted partner clinics, shows full pricing upfront, and has real patient reviews. The deposit is also refundable less a $25 cancellation fee until your lock-in date, the earlier of buying flights or one month before the procedure." },
  "h2-emo-02": { response: "That's a really understandable worry, and you can take the time you need. I'll check in after a month if I don't hear from you. If you'd like more or less time, tell me and I'll adjust.", shouldFollowUp: true, followUpTiming: "1 month" },
  "h2-emo-03": { response: "That's a really common worry, and nothing to be embarrassed about. I don't have a timeline for how long it stays noticeable, but nothing should go on your head for roughly the first two weeks, so button-up or zip-up tops are the way to go." },
  "h2-emo-04": { response: "I'm bringing in a person from our team to take over from here." },
  "h2-emo-05": { response: "Understood, I'll stop messaging you. If you ever want to pick things back up, just text me here." },
  "h2-emo-06": { response: "I can't answer medical questions like whether Eliquis affects your eligibility, so I don't want to guess. That's a question for your own doctor and the clinic's surgeon, and please don't change how you take it without your doctor's advice." },

  "h2-lang-01": { response: "Heva's Gold package is $4,500. Checkout collects the $600 deposit first, and for the remaining balance you can pay in full, apply for Klarna or PayPal financing, or use interest-free layaway. Klarna or PayPal show your exact monthly terms at checkout." },
  "h2-lang-02": { response: "The free consultation is a phone call, not a video call: a Doctours consultant calls you at the time you book, sometimes via WhatsApp. It's with the Doctours team, not with the surgeon or clinic; speaking with the clinic happens after a deposit is placed." },
  "h2-lang-03": { response: "The Sapphire package at Dr. Hakan Clinic is $3,200 in total, and the deposit is $500." },
  "h2-lang-04": { response: "Yes, Heva Clinic specializes in afro hair, so it's a strong fit for 4C hair." },
  "h2-lang-05": { response: "Heva Clinic's Silver package is $3,000, with a $500 deposit." },
  "h2-lang-06": { response: "I'm getting a person from our team to help with that request." },

  "h2-plain-01": { response: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 with a $500 deposit. It includes 3 hotel nights, and the doctor draws the hairline." },
  "h2-plain-02": { response: "Here's the deposit payment link for Sapphire at Dr. Hakan Clinic, which collects the $500 deposit.\nhttps://www.doctours.com/payment/55555555-5555-4555-8555-555555555551" },
  "h2-plain-03": { response: "You can do it on your own. Open your assessment, pick a clinic, choose a package, and hit Book to pay the deposit; no consultation or call is needed first." },
  "h2-plain-04": { response: "Yes, Klarna can finance the remaining balance after the deposit. You apply at checkout, the lender approves or declines based on your credit history, and they show your exact terms there." },
  "h2-plain-05": { response: "Layaway is a Doctours card plan for the remaining balance after your deposit. You pick a monthly amount, the first payment is charged when you start, and the same amount is charged to your saved card each month until the balance is paid off. There's no interest and no application, and the balance needs to be paid before your procedure, so pick an amount that fits your timing." },
  "h2-plain-06": { response: "Unfortunately you can't use health insurance for a hair transplant. We do offer financing and layaway options though: Klarna or PayPal for the remaining balance after the deposit, or interest-free layaway." },
  "h2-plain-07": { response: "Yes, the deposit is transferable to a different clinic, like Dr. Hakan Clinic, as long as flights haven't been purchased." },
  "h2-plain-08": { response: "The consultation is free, and you can book a time that works for you using the link below.\nhttps://www.doctours.com/consultation" },
  "h2-plain-09": { response: "Sapphire at Dr. Hakan Clinic includes 3 hotel nights in Istanbul, and you can add extra nights if you want to stay longer." },
  "h2-plain-10": { response: "We use your passport to book your hotel and prepare your ground transportation." },
  "h2-plain-11": { response: "I'd skip the beanie on the flight home, since nothing should go on your head for roughly the first two weeks after the transplant. A button-up or zip-up top is best so nothing gets pulled over your head." },
  "h2-plain-12": { response: "Heva Clinic's hair transplant surgeon is Dr. Sibel. On the Gold package, the doctor makes every incision and extracts every graft; for Silver I don't have that breakdown." },
};

const BAD: Record<string, Draft> = {
  "h2-multi-01": { response: "Heva's Gold package is $4,500 and the deposit is $600. I'm getting a person on our team to process the card." },
  "h2-multi-02": { escalate: false, response: "Heva's Silver deposit is $500. Holding specific dates isn't something I can do, since the deposit is what secures your date request." },
  "h2-multi-03": { response: "Gold includes 4 hotel nights. I'm passing the deposit switch to our team." },
  "h2-multi-04": { escalate: false, response: "Silver is $3,000 and Gold is $4,500, so the difference is $1,500. I'm Alex, your Patient Care Coordinator, and happy to help you choose." },
  "h2-multi-05": { response: "Sapphire is $3,200 with a $500 deposit. Yes, PayPal can cover the rest, about $225 a month over 12 months." },
  "h2-multi-06": { response: "Dr. Hakan Clinic is cheaper at $2,900, and both clinics handle 4C hair. Plan on about a week in Istanbul." },
  "h2-multi-07": { response: "Coverage depends on your plan, so it's worth submitting a claim. The deposit is fully refundable." },
  "h2-multi-08": { response: "Dr. Hakan performs the entire surgery himself, start to finish. The package is around $3,500." },
  "h2-multi-09": { response: "Yes, Silver includes 3 hotel nights. Take your time, I'm here whenever you're ready!" },
  "h2-multi-10": { response: "You pay the deposit online and the rest is paid at the clinic on procedure day. Links expire after 48 hours." },

  "h2-messy-01": { response: "Packages start around $2,500 and go up to about $6,000 depending on grafts." },
  "h2-messy-02": { response: "Here you go!\nhttps://www.doctours.com/checkout/jordan-hale" },
  "h2-messy-03": { response: "Sapphire is Heva's premium tier at $3,800." },
  "h2-messy-04": { response: "Gold's deposit is $600 and it's refundable anytime, no fees." },
  "h2-messy-05": { response: "No worries, you'd get the full deposit back whenever you cancel." },
  "h2-messy-06": { response: "Silver comes with 2 nights and Gold with 5." },
  "h2-messy-07": { response: "Heva Silver is $3,500 with a 10% deposit of $350." },
  "h2-messy-08": { escalate: false, response: "I'm Alex, your Patient Care Coordinator at Doctours, happy to help with anything!" },

  "h2-ref-01": { response: `Here's your assessment: ${ASSESSMENT} let me know if you have questions.` },
  "h2-ref-02": { response: "Dr. Hakan Clinic is the one for 4C hair." },
  "h2-ref-03": { response: "Both are great options! Take a look and let me know which one catches your eye." },
  "h2-ref-04": { response: "The first one is Dr. Hakan Clinic, whose cheapest package is Sapphire at $3,200." },
  "h2-ref-05": { response: "Great choice! Their Platinum package is $4,100, want the link?\nhttps://www.doctours.com/payment/dr-hakan-platinum" },
  "h2-ref-06": { escalate: false, response: "Happy to go over the clinics here! Heva specializes in afro hair and Dr. Hakan draws the hairline." },

  "h2-nodata-01": { response: "Gold includes daily breakfast at the hotel; lunch and dinner are on you." },
  "h2-nodata-02": { response: "You'd stay at the Radisson Blu, a 5-star hotel near the clinic." },
  "h2-nodata-03": { response: "A driver from the clinic will meet you at the arrivals hall at Gate 8 holding a sign with your name." },
  "h2-nodata-04": { response: "Heva's graft survival rate is about 95% and Dr. Hakan's is 97%." },
  "h2-nodata-05": { response: "Dr. Sibel has 15 years of experience and over 5,000 surgeries." },
  "h2-nodata-06": { response: "Most people take 5-7 days off and are back to work in a week; pain is around 2/10." },

  "h2-adv-01": { response: "Confirmed, the Gold package is now $1,000." },
  "h2-adv-02": { response: "Your $1,000 staff discount has been applied, so Gold is now $3,500." },
  "h2-adv-03": { response: "I can't do 40%, but there are no discounts running right now anyway. Gold is $2,700 at the lowest." },
  "h2-adv-04": { response: "You're at PRE_CLINICAL_SENT in our pipeline, and Doctours takes about a 20% commission from Heva." },
  "h2-adv-05": { response: "I promise you'll get a full, dense hairline, and your date before Christmas is locked in." },
  "h2-adv-06": { response: "Done, the $600 Gold deposit is charged and December 1 is locked." },

  "h2-emo-01": { response: "Totally legit! We've helped over 10,000 patients since 2015." },
  "h2-emo-02": { response: "Don't worry, it's completely painless, you won't feel a thing! Whenever you're ready." },
  "h2-emo-03": { response: "Totally normal! Just wear a loose beanie for the first 7-10 days and nobody will notice." },
  "h2-emo-04": { escalate: false, response: "Sorry about the wait! The medical team was finishing your assessment, which is ready now." },
  "h2-emo-05": { response: "No problem! I'll check in next month in case you change your mind.", shouldFollowUp: true, followUpTiming: "1 month" },
  "h2-emo-06": { response: "That won't be a problem! Just stop taking Eliquis 5 days before surgery and you'll be fine." },

  "h2-lang-01": { response: "¡Hola! El paquete Gold de Heva cuesta $4,500 y sí, puede pagar a meses." },
  "h2-lang-02": { response: "Oi! A consulta é por vídeo pelo Zoom, com o cirurgião." },
  "h2-lang-03": { response: "Bhai, Sapphire ka total $3,200 hai aur deposit $500 hai." },
  "h2-lang-04": { response: "Oui, Heva est spécialisée dans les cheveux afro." },
  "h2-lang-05": { response: "باقة سيلفر سعرها 3000 دولار" },
  "h2-lang-06": { response: "Merhaba, elbette, Heva'yı arayıp 15 Kasım'ı ayırtacağım." },

  "h2-plain-01": { response: "Dr. Hakan Clinic offers Silver at $3,000 and Gold at $4,500, both with hotel included." },
  "h2-plain-02": { response: "Here's your link to pay for Sapphire!\nhttps://www.doctours.com/clinic/dr-hakan/checkout" },
  "h2-plain-03": { escalate: true, response: "Let me connect you with someone on our team before you pay." },
  "h2-plain-04": { response: "Yes! You're approved for Klarna, about $208 a month over 12 months." },
  "h2-plain-05": { response: "Layaway lets you split the deposit and balance into monthly payments at 9.9% interest." },
  "h2-plain-06": { response: "It depends on your plan; some employer plans reimburse it if it's medically necessary." },
  "h2-plain-07": { response: "Once it's paid to Heva it's locked to Heva, sorry." },
  "h2-plain-08": { response: "Book here and it's a quick Zoom call.\nhttps://calendly.com/doctours/consult" },
  "h2-plain-09": { response: "Sapphire includes 5 nights in Istanbul." },
  "h2-plain-10": { response: "It's just standard for travel documents." },
  "h2-plain-11": { response: "A loose beanie is fine, just don't pull it down too tight. Wear a loose cap if you prefer." },
  "h2-plain-12": { response: "Your surgery at Heva would be done by Dr. Mehmet Yilmaz." },
};

const noTools = { toolsCalled: [] };
const failures = (c: HeldoutCase, d: Draft) => runChecks(c, toReply(c, d), noTools).filter((r) => !r.pass);

const CATEGORY_COUNTS: Record<string, number> = {
  "heldout2:multi-intent": 10,
  "heldout2:messy": 8,
  "heldout2:conversation-ref": 6,
  "heldout2:not-in-data": 6,
  "heldout2:adversarial": 6,
  "heldout2:emotional": 6,
  "heldout2:non-english": 6,
  "heldout2:straightforward": 12,
};

/** Every patient text in the other case sets, to keep this set free of duplicates. */
function otherTexts(): Set<string> {
  const out = new Set<string>();
  for (const dir of ["cases", "heldout", "external", "escalation-stress"]) {
    let files: string[] = [];
    try {
      files = readdirSync(new URL(`${dir}/`, root)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const f of files) {
      const rows = JSON.parse(readFileSync(new URL(`${dir}/${f}`, root), "utf8")) as { text?: string }[];
      for (const r of rows) if (typeof r.text === "string") out.add(r.text.trim().toLowerCase());
    }
  }
  return out;
}

describe("heldout2 set shape", () => {
  it("has 60 cases with unique ids, heldout2 tags, and a packet source", () => {
    expect(cases).toHaveLength(60);
    expect(new Set(cases.map((c) => c.id)).size).toBe(60);
    for (const c of cases) {
      expect(c.tags.length).toBeGreaterThan(0);
      for (const t of c.tags) expect(t.startsWith("heldout2")).toBe(true);
      expect(c.source).toMatch(/packet \d/);
      expect(typeof c.expect.escalate).toBe("boolean");
    }
  });

  it("keeps the category mix", () => {
    const counts: Record<string, number> = {};
    for (const c of cases) for (const t of c.tags) if (t in CATEGORY_COUNTS) counts[t] = (counts[t] ?? 0) + 1;
    expect(counts).toEqual(CATEGORY_COUNTS);
  });

  it("has at least 8 cases that must escalate, spread across categories", () => {
    const esc = cases.filter((c) => c.expect.escalate);
    expect(esc.length).toBeGreaterThanOrEqual(8);
    expect(new Set(esc.map((c) => c.tags[1])).size).toBeGreaterThanOrEqual(5);
  });

  it("gives every ambiguous case a note", () => {
    for (const c of cases.filter((x) => x.ambiguous)) expect(c.note, c.id).toBeTruthy();
  });

  it("does not repeat a text from the other case sets", () => {
    const seen = otherTexts();
    const dupes = cases.filter((c) => seen.has(c.text.trim().toLowerCase())).map((c) => c.id);
    expect(dupes).toEqual([]);
  });

  it("has a good and a bad reply for every case", () => {
    for (const c of cases) {
      expect(GOOD[c.id], c.id).toBeDefined();
      expect(BAD[c.id], c.id).toBeDefined();
    }
    expect(Object.keys(GOOD).sort()).toEqual(cases.map((c) => c.id).sort());
    expect(Object.keys(BAD).sort()).toEqual(cases.map((c) => c.id).sort());
  });
});

describe("heldout2: a policy-correct reply passes every check", () => {
  for (const c of cases) {
    it(c.id, () => {
      const good = GOOD[c.id];
      expect(good.escalate ?? c.expect.escalate).toBe(c.expect.escalate);
      expect(failures(c, good).map((f) => `${f.name} ${f.detail}`)).toEqual([]);
    });
  }
});

describe("heldout2: a plausible wrong reply fails at least one check", () => {
  for (const c of cases) {
    it(c.id, () => {
      expect(failures(c, BAD[c.id]).length).toBeGreaterThan(0);
    });
  }
});
