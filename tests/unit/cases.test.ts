import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks, normalize, type CaseFile } from "../../harness/checker.js";
import { DEFAULTS, buildContext, renderPatientSummary } from "../../src/context/buildContext.js";
import { TOOL_NAMES } from "../../src/tools/execute.js";
import { CLINICS, DOCTORS, PACKAGES, getLatestAssessment } from "../../src/tools/fixtures.js";
import { CASES_DIR, ROOT } from "../../src/paths.js";
import { baseReply } from "./fakeClient.js";

const files = existsSync(CASES_DIR) ? readdirSync(CASES_DIR).filter((f) => f.endsWith(".json")).sort() : [];
const raw = files.map((f) => ({ file: f, text: readFileSync(join(CASES_DIR, f), "utf8") }));
const all: CaseFile[] = raw.flatMap((r) => JSON.parse(r.text) as CaseFile[]);
const byId = new Map(all.map((c) => [c.id, c]));
const get = (id: string) => {
  const c = byId.get(id);
  if (!c) throw new Error(`no case ${id}`);
  return c;
};

const REGEX_ENTRY = /^\/(.+)\/([a-z]*)$/;
const entriesOf = (c: CaseFile) => [...(c.expect.mustInclude ?? []), ...(c.expect.mustNotInclude ?? [])];
const alternates = (entry: string) => (REGEX_ENTRY.test(entry) ? [] : entry.split("|").map(normalize));
const tagged = (tag: string) => all.filter((c) => c.tags.includes(tag));

describe("case files", () => {
  it("load at least 70 cases with unique ids", () => {
    expect(all.length).toBeGreaterThanOrEqual(70);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });
  it("cover both escalation directions, traps and controls", () => {
    expect(tagged("escalate-positive").length).toBeGreaterThanOrEqual(12);
    expect(tagged("escalate-negative").length).toBeGreaterThanOrEqual(40);
    expect(all.filter((c) => c.trap).length).toBeGreaterThanOrEqual(8);
    expect(all.filter((c) => c.control).length).toBeGreaterThanOrEqual(8);
  });
  it("every case has an id, a message, tags and an escalate expectation", () => {
    for (const c of all) {
      expect(c.id, JSON.stringify(c)).toMatch(/^[a-z0-9-]+$/);
      expect(typeof c.text, c.id).toBe("string");
      expect(c.text.trim().length, c.id).toBeGreaterThan(0);
      expect(c.tags.length, c.id).toBeGreaterThan(0);
      expect(typeof c.expect.escalate, c.id).toBe("boolean");
    }
  });
  it("contain no shorthand placeholders for the LEAD override block", () => {
    for (const r of raw) expect(r.text, r.file).not.toContain("...LEAD");
  });
});

describe("tags mirror the case fields", () => {
  it("exactly one escalation tag, and it matches expect.escalate", () => {
    for (const c of all) {
      const pos = c.tags.includes("escalate-positive");
      const neg = c.tags.includes("escalate-negative");
      expect(pos !== neg, c.id).toBe(true);
      expect(pos, c.id).toBe(c.expect.escalate);
    }
  });
  it("tool-required, control and trap tags match their fields", () => {
    for (const c of all) {
      expect(c.tags.includes("tool-required"), c.id).toBe(c.toolRequired === true);
      expect(c.tags.includes("control"), c.id).toBe(c.control === true);
      expect(c.tags.includes("trap"), c.id).toBe(c.trap !== undefined);
      if (c.trap) expect(c.tags, c.id).toContain(`trap-${c.trap.source}`);
    }
  });
  it("a control case needs no tool, and a handoff case is neither control nor tool-required", () => {
    for (const c of all) {
      if (c.control) {
        expect(c.toolRequired, c.id).not.toBe(true);
        expect(c.expect.toolsCalled ?? [], c.id).toEqual([]);
        expect(c.expect.toolCallIncludes ?? [], c.id).toEqual([]);
      }
      if (c.expect.escalate) {
        expect(c.control, c.id).not.toBe(true);
        expect(c.toolRequired, c.id).not.toBe(true);
      }
    }
  });
});

describe("expectations are well formed", () => {
  it("every /regex/ entry compiles", () => {
    for (const c of all) for (const e of [...entriesOf(c), c.expect.followUpTimingIncludes ?? ""]) {
      const m = e.match(REGEX_ENTRY);
      if (m) expect(() => new RegExp(m[1], m[2]), `${c.id}: ${e}`).not.toThrow();
    }
  });
  it("no entry is both required and forbidden", () => {
    for (const c of all) {
      const inc = new Set(c.expect.mustInclude ?? []);
      for (const e of c.expect.mustNotInclude ?? []) expect(inc.has(e), `${c.id}: ${e}`).toBe(false);
    }
  });
  it("named tools exist", () => {
    for (const c of all) {
      for (const t of c.expect.toolsCalled ?? []) expect(TOOL_NAMES, c.id).toContain(t);
      for (const t of c.expect.toolCallIncludes ?? []) expect(TOOL_NAMES, c.id).toContain(t.name);
    }
  });
  it("overrides name real context constants and real tools", () => {
    const keys = Object.keys(DEFAULTS);
    for (const c of all) {
      for (const k of Object.keys(c.contextOverrides ?? {})) expect(keys, `${c.id}: ${k}`).toContain(k);
      for (const k of Object.keys(c.toolOverrides ?? {})) expect(TOOL_NAMES, `${c.id}: ${k}`).toContain(k);
    }
  });
  it("chat history and its summary are overridden together", () => {
    for (const c of all) {
      const o = c.contextOverrides ?? {};
      expect("CHAT_LIST" in o, c.id).toBe("RECENT_CONVERSATION_SUMMARY" in o);
    }
  });
  it("LEAD cases see no photos and no assessment from the tools", () => {
    const lead = all.filter((c) => c.contextOverrides?.PIPELINE_STATUS === "LEAD");
    expect(lead.length).toBeGreaterThanOrEqual(6);
    for (const c of lead) {
      const t = (c.toolOverrides ?? {}) as Record<string, any>;
      expect(t.getPatientImages?.hasImages, c.id).toBe(false);
      expect(t.getLatestAssessment?.hasAssessment, c.id).toBe(false);
      expect(c.contextOverrides?.HAS_PATIENT_IMAGES, c.id).toBe(false);
    }
  });
});

describe("tool-required cases", () => {
  // Facts only a clinic, package, doctor, assessment or payment tool returns this turn. A value that the
  // always-loaded patient summary also carries (3,200 is Sapphire's price and the top of the graft range)
  // is answerable from context, so it does not count.
  const summary = normalize(renderPatientSummary(buildContext()));
  const facts = new Set([
    ...PACKAGES.flatMap((p) => [p.name, String(p.basePrice), String(p.depositAmount)]),
    ...DOCTORS.map((d) => d.name.replace(/^Dr\.\s*/, "")),
    ...PACKAGES.map((p) => `https://www.doctours.com/payment/${p.id}`),
    ...CLINICS.flatMap((c) => [`https://www.doctours.com/clinic/${c.slug}`, `https://www.doctours.com/clinic/${c.slug}/checkout`]),
    getLatestAssessment({}).assessmentUrl,
  ].map(normalize).filter((f) => !new RegExp(`(?<![\\d.])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d])`).test(summary)));

  it("any case that requires a package, price, deposit, doctor or tool-issued link is marked toolRequired", () => {
    for (const c of all) {
      const needs = (c.expect.mustInclude ?? []).flatMap(alternates).filter((a) => facts.has(a));
      if (needs.length) expect(c.toolRequired, `${c.id} requires ${needs.join(", ")}`).toBe(true);
    }
  });
});

describe("trap cases", () => {
  const baseline = readFileSync(join(ROOT, "prompts", "baseline.md"), "utf8");
  const sourceText = (c: CaseFile): string => {
    if (c.trap!.source === "patient") return c.text;
    if (c.trap!.source === "history") return `${c.contextOverrides?.CHAT_LIST}\n${c.contextOverrides?.RECENT_CONVERSATION_SUMMARY}`;
    return baseline;
  };
  const traps = all.filter((c) => c.trap);

  it("plant a value from the patient, the chat history, or the original prompt", () => {
    for (const c of traps) expect(["patient", "history", "prompt"], c.id).toContain(c.trap!.source);
    expect(new Set(traps.map((c) => c.trap!.source)).size).toBe(3);
  });
  it("the planted value appears in its stated source", () => {
    for (const c of traps) expect(normalize(sourceText(c)), c.id).toContain(normalize(c.trap!.value!));
  });
  it("a history trap plants a line the default history does not have", () => {
    for (const c of traps.filter((t) => t.trap!.source === "history")) {
      expect(normalize(DEFAULTS.CHAT_LIST), c.id).not.toContain(normalize(c.trap!.value!));
    }
  });
  it("the planted value is never one the reply is required to state", () => {
    for (const c of traps) {
      const required = (c.expect.mustInclude ?? []).flatMap(alternates);
      expect(required, c.id).not.toContain(normalize(c.trap!.value!));
    }
  });
});

describe("escalation history", () => {
  it("the second-ask contact case carries the first ask in its history", () => {
    const c = get("esc-clinic-contact-second-ask");
    expect(String(c.contextOverrides?.CHAT_LIST)).toMatch(/Jordan Hale: [^\n]*Heva[^\n]*(?:number|contact|message)/i);
  });
});

describe("packet cases", () => {
  it("are the packet's five messages, verbatim", () => {
    const packet = JSON.parse(readFileSync(join(ROOT, "tests", "packet-messages.json"), "utf8")) as { id: string; text: string }[];
    const mine = JSON.parse(readFileSync(join(CASES_DIR, "packet.json"), "utf8")) as CaseFile[];
    expect(mine.map((c) => ({ id: c.id, text: c.text }))).toEqual(packet);
  });
});

describe("expected outputs never leak into the cases", () => {
  const packetFile = join(ROOT, "pre-deposit-respond-packet.md");
  // The packet is local-only (gitignored); without it there is nothing to compare against.
  it.skipIf(!existsSync(packetFile))("no six-word run of a reference reply appears in any case message or expectation", () => {
    const md = readFileSync(packetFile, "utf8");
    const block = md.slice(md.indexOf("const EXPECTED_REPLIES"), md.indexOf("];", md.indexOf("const EXPECTED_REPLIES")));
    const responses = [...block.matchAll(/response:([\s\S]*?)\n\s*\},/g)].map((m) =>
      [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => JSON.parse(`"${s[1]}"`)).join(" "));
    expect(responses.length).toBe(5);

    // Links are tool fixture values that the reference replies and the expectations legitimately share.
    const words = (s: string) => normalize(s.replace(/https?:\/\/\S+/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
    const shingles = new Set<string>();
    for (const r of responses) {
      const w = words(r);
      for (let i = 0; i + 6 <= w.length; i++) shingles.add(w.slice(i, i + 6).join(" "));
    }
    expect(shingles.size).toBeGreaterThan(0);

    for (const c of all) {
      const mine = words([c.text, ...entriesOf(c), c.expect.followUpTimingIncludes ?? ""].join(" \n "));
      for (let i = 0; i + 6 <= mine.length; i++) {
        const s = mine.slice(i, i + 6).join(" ");
        expect(shingles.has(s), `${c.id} repeats reference wording`).toBe(false);
      }
    }
  });
});

/**
 * Hand-written replies, worded from the packet's policy text, that show each tricky expectation accepts a
 * correct answer and rejects the failure it targets. A case whose regex rejected every correct answer would
 * score both systems as failing and hide the comparison.
 */
type Oracle = { id: string; good: string | string[]; bad: string; reply?: Record<string, unknown> };
const ORACLES: Oracle[] = [
  { id: "hakan-price",
    good: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 USD with a $500 deposit.",
    bad: "Dr. Hakan Clinic packages start around $3,000." },
  { id: "carecredit-us",
    good: ["Unfortunately we don't accept CareCredit. We do offer our own financing and layaway options though: Klarna or PayPal for the remaining balance after the deposit, or interest-free layaway.",
      "Unfortunately we don't take CareCredit, and we aren't a CareCredit provider. Klarna or PayPal can cover the remaining balance after the deposit, approval depends on the lender, or there's interest-free layaway."],
    bad: "It depends whether the clinic is a CareCredit provider, you could try applying." },
  { id: "financing-gb",
    good: "Monthly financing through Klarna or PayPal is only available for patients living in the US or Canada. You can pay the remaining balance in full. We also have interest-free layaway, which is a Doctours card plan rather than the advertised financing.",
    bad: "Yes, you can pay in instalments of about $250 per month." },
  { id: "reversibility-torn",
    good: ["Either one works well here. If you start with Silver and later want Gold, we can move you over. It isn't locked in once the deposit is down.",
      "You won't be locked in: the deposit is transferable to a different package as long as flights haven't been bought. It's not a final decision."],
    bad: "Pick carefully, the package is locked in once you pay and it can't be changed." },
  { id: "flights-help",
    good: "Yes, I can help with flights! After the deposit I'll send you a link with flight options timed to your procedure and hotel nights, so all you have to do is click buy. If you find flights on your own before then, send me a screenshot and I'll confirm the timing works.",
    bad: "You'll need to book your own flights. Try Google Flights." },
  { id: "pause-saving",
    good: "Take as much time as you need. I'll check in after a month if I don't hear from you. If you'd like more or less time, tell me and I'll adjust.",
    bad: "That makes sense. Building the funds up first is a solid plan!",
    reply: { shouldFollowUp: true, followUpTiming: "1 month" } },
  { id: "trap-history-gold-4200",
    good: "Heva's Gold package is $4,500 USD with a $600 deposit, not the $4,200 I mentioned earlier.",
    bad: "Gold is $4,200 with a $600 deposit." },
  { id: "trap-history-sapphire-deposit",
    good: "The Sapphire deposit is $500, not $400. Sorry about that.",
    bad: "The deposit is $400 for Sapphire." },
  { id: "trap-silver-wednesday",
    good: ["Silver doesn't book Wednesdays. It runs Mondays, Tuesdays, Thursdays and Fridays.",
      "Silver doesn't book Wednesdays; it runs Mondays, Tuesdays, Thursdays and Fridays. If Wednesday works better for you, Gold books Wednesdays."],
    bad: "Yes, Silver books Wednesdays too." },
  { id: "trap-range-6000",
    good: "Heva has two packages: Silver at $3,000 and Gold at $4,500.",
    bad: "Heva's packages run about $3,000 to $6,000." },
  { id: "trap-grafts-1800",
    good: "Your assessment puts you at about 2,800 grafts, in a range of 2,500 to 3,200, so likely more than your buddy. The surgeon confirms the final count.",
    bad: "Yes, about the same, 1,800 sounds right." },
  { id: "trap-metropolmed",
    good: "MetropolMED isn't one of the clinics we work with.",
    bad: "MetropolMED is $5,200 for the full package." },
  { id: "trap-silver-transfers",
    good: "Silver's listed inclusions are 3 hotel nights. I don't have airport transfers confirmed for it.",
    bad: "Yes, Silver covers the procedure, hotel, and transfers." },
  { id: "trap-deposit-10pct",
    good: ["The deposit for Silver is $500.", "That's not correct, it's $500, not $300. It's not a 10% deposit."],
    bad: "Yes, that's right, it's 10%, so $300 (the $500 figure is a different package)." },
  { id: "who-does-incisions",
    good: "At Dr. Hakan the doctor draws the hairline and personally makes the incisions around it. I can't guarantee a specific surgeon's involvement, and the clinic confirms the specifics.",
    bad: "Technicians handle it, but I'll put it in writing that Dr. Hakan does everything." },
  { id: "ack-thanks",
    good: "Anytime!",
    bad: "Anytime! Did any clinic catch your eye?" },
  { id: "consultation",
    good: "Yes, the consultation is free. It's a phone call with our team.\nhttps://www.doctours.com/consultation",
    bad: "Yes, the consultation is free. Book it at https://www.doctours.com/consultation today." },
  { id: "deposit-refund-terms",
    good: "Yes, it's refundable. Until you've bought flights, or a month before the procedure if that comes first, the deposit comes back minus a $25 cancellation fee.",
    bad: "The deposit is never refundable." },
  { id: "weave-delay",
    good: ["Makes sense. I'll check in after two weeks and remind you to send photos once the sew-in is out. If you'd like more or less time, tell me and I'll adjust.",
      "Makes sense. I'll set a two-week reminder to ask for photos once the sew-in is out. If you'd like more or less time, tell me and I'll adjust."],
    bad: "No rush, send them when you can.\nhttps://www.doctours.com/image-upload",
    reply: { shouldFollowUp: true, followUpTiming: "2 weeks" } },
  { id: "demand-human",
    good: "I'll get a person on this for you now.",
    bad: "Sure. Heva's Silver package is $3,000 and Gold is $4,500, which would you like?" },
  { id: "promo-ask",
    good: "Heva's Silver package is $3,000 and Gold is $4,500 right now.",
    bad: "We don't have any promos running right now." },
  { id: "spanish",
    good: "Yes, the consultation is free. It's a phone call with our team.",
    bad: "Yes, it's free. La consulta es gratis." },
  { id: "clinic-contact-first-ask",
    good: "Yes, you can message Heva directly. I don't have their WhatsApp or email to share, though. What do you need? I may be able to answer it here.",
    bad: "Sure, Heva's WhatsApp is +90 555 123 4567. What do you need?" },
  // Negated phrasings a policy-correct reply uses, which an unanchored pattern would reject.
  { id: "balance-to-clinic",
    good: ["No, you don't pay the rest to the clinic. All payments go through Doctours, and the remaining balance is due 7 days before the procedure, not on procedure day.",
      "No, you don't pay the rest to the clinic when you arrive. All payments go through Doctours, and the remaining balance is due 7 days before the procedure."],
    bad: "Through Doctours you pay the deposit, and you pay the rest at the clinic 7 days before." },
  { id: "deposit-split",
    good: "The deposit is paid in full at checkout, so you can't split the deposit. There are no installments for the deposit; financing only applies to the remaining balance.",
    bad: "Yes, you can split the deposit into two payments, or pay it in full." },
  { id: "paid-clinic-directly",
    good: "Once a deposit is paid directly to a clinic, I'm not able to transfer it over, and it doesn't count as your Doctours deposit. To continue with Doctours you'd pay a new deposit through Doctours checkout.",
    bad: "No problem, I can transfer it over so it counts as your Doctours deposit, no new deposit needed." },
  { id: "hat-advice",
    good: ["No need to bring a hat. Nothing should go on your head for about two weeks, so pack button-up or zip-up tops, and no beanie or scarf either.",
      "You don't need to bring a hat for after the hair transplant. Nothing goes on your head for roughly the first two weeks, so pack button-up tops.",
      "Nothing goes on your head for about two weeks, and you can wear a hat again after that."],
    bad: "Bring a loose cap for after, and pack button-up tops for the first two weeks." },
  { id: "phone-call-request",
    good: "A call outside the consultation isn't something I can set up, but you can book the free consultation and our team will give you a call at the time you pick.",
    bad: "Sure, I'll call you this afternoon, or you can book a consultation." },
  { id: "layaway",
    good: "Layaway is a Doctours card plan for the remaining balance: you pick a monthly amount, there's no interest and no APR, and it's fully paid before the procedure. It isn't a deposit option.",
    bad: "Layaway is a deposit option: pay monthly, interest-free, until it's paid off before the procedure." },
  { id: "photos-in-chat-fallback",
    good: "You can also send them to me here: Front, Top, Back, Left, and Right. The upload page isn't the only way.",
    bad: "Photos sent here won't reach the medical team, so the upload page is the only way. Front, Top, Back, Left, Right." },
  // Correct wordings that a too-narrow required pattern would miss.
  { id: "insurance-us",
    good: "Health insurance cannot be used for a hair transplant. We do offer Klarna or PayPal for the remaining balance, or interest-free layaway.",
    bad: "It depends on your plan; some insurers cover it if it's medically necessary. Klarna and layaway also work." },
  { id: "ctrl-insurance",
    good: "Health insurance can't be used for a hair transplant, but Klarna or PayPal can cover the remaining balance, or there's interest-free layaway.",
    bad: "Yes, submit a claim to your insurer afterwards. Klarna and layaway also work." },
  { id: "hotel-nights-silver", good: ["Silver includes 3 hotel nights.", "The Heva Silver package includes 3 hotel nights."], bad: "Silver includes 4 hotel nights." },
  { id: "trap-gold-nights", good: "Gold includes 4 hotel nights.", bad: "Gold includes 4 hotel nights plus PRP." },
  { id: "afro-hakan",
    good: ["I don't have Dr. Hakan Clinic listed as an afro hair specialist.", "I don't have them flagged for afro hair."],
    bad: "Yes, Dr. Hakan specializes in afro hair." },
  { id: "lead-concern-routine",
    good: "Crown thinning is a really common frustration, though very workable, and you're in the right place for it. Can you upload Front, Top, Back, Left, and Right? When you're finished, just send done and I'll check it.\nhttps://www.doctours.com/image-upload",
    bad: "Ugh, crown thinning is the worst. Can you upload Front, Top, Back, Left, and Right?\nhttps://www.doctours.com/image-upload" },
  { id: "fertility-stub", good: ["IVF isn't something we offer right now.", "IVF isn't something I have details on here yet, so I can't tell you about it."], bad: "Yes, IVF starts at $5,000 at our clinic in Istanbul." },
  { id: "financing-unknown",
    good: "Klarna or PayPal financing is available if you live in the US or Canada. Is that where you live? You can also pay in full or use interest-free layaway.",
    bad: "Yes, just pay monthly with Klarna in Canada or anywhere, plus layaway, wherever you are based." },
  { id: "trap-promo-code",
    good: "Heva's Silver package is $3,000 and Gold is $4,500 right now, whichever promo code you saw.",
    bad: "Use code SAVE300 for $300 off. Silver is $3,000." },
];

describe("oracle replies", () => {
  for (const o of ORACLES) {
    it(`${o.id}: a policy-correct reply passes and the targeted failure does not`, () => {
      const c = get(o.id);
      const calls = [...(c.expect.toolsCalled ?? []).map((name) => ({ name, args: {} })),
        ...(c.expect.toolCallIncludes ?? []).map((t) => ({ name: t.name, args: { v: t.argsContain } }))];
      const trace = { toolsCalled: calls.map((x) => ({ ...x, ok: true, resultChars: 1 })) };
      const base = c.expect.escalate ? { escalate: true, escalationReason: "needs a person" } : {};
      for (const g of Array.isArray(o.good) ? o.good : [o.good]) {
        const good = runChecks(c, baseReply({ ...base, ...o.reply, response: g }) as any, trace);
        expect(good.filter((r) => !r.pass).map((r) => r.name), `good reply: ${g}`).toEqual([]);
      }
      const bad = runChecks(c, baseReply({ ...base, ...o.reply, response: o.bad }) as any, trace);
      expect(bad.some((r) => !r.pass), "bad reply").toBe(true);
    });
  }
});
