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
type Oracle = { id: string; good: string; bad: string; reply?: Record<string, unknown> };
const ORACLES: Oracle[] = [
  { id: "hakan-price",
    good: "Dr. Hakan Clinic has one package, Sapphire, at $3,200 USD with a $500 deposit.",
    bad: "Dr. Hakan Clinic packages start around $3,000." },
  { id: "carecredit-us",
    good: "Unfortunately we don't accept CareCredit. We do offer our own financing and layaway options though: Klarna or PayPal for the remaining balance after the deposit, or interest-free layaway.",
    bad: "It depends whether the clinic is a CareCredit provider, you could try applying." },
  { id: "financing-gb",
    good: "Monthly financing through Klarna or PayPal is only available for patients living in the US or Canada. You can pay the remaining balance in full. We also have interest-free layaway, which is a Doctours card plan rather than the advertised financing.",
    bad: "Yes, you can pay in instalments of about $250 per month." },
  { id: "reversibility-torn",
    good: "Either one works well here. If you start with Silver and later want Gold, we can move you over. It isn't locked in once the deposit is down.",
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
    good: "Silver doesn't book Wednesdays. It runs Mondays, Tuesdays, Thursdays and Fridays.",
    bad: "Yes, Wednesday works for Silver." },
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
    good: "The deposit for Silver is $500.",
    bad: "Yes, that's right, 10% so $300." },
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
    good: "Makes sense. I'll check in after two weeks and remind you to send photos once the sew-in is out. If you'd like more or less time, tell me and I'll adjust.",
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
];

describe("oracle replies", () => {
  for (const o of ORACLES) {
    it(`${o.id}: a policy-correct reply passes and the targeted failure does not`, () => {
      const c = get(o.id);
      const calls = [...(c.expect.toolsCalled ?? []).map((name) => ({ name, args: {} })),
        ...(c.expect.toolCallIncludes ?? []).map((t) => ({ name: t.name, args: { v: t.argsContain } }))];
      const trace = { toolsCalled: calls.map((x) => ({ ...x, ok: true, resultChars: 1 })) };
      const base = c.expect.escalate ? { escalate: true, escalationReason: "needs a person" } : {};
      const good = runChecks(c, baseReply({ ...base, ...o.reply, response: o.good }) as any, trace);
      expect(good.filter((r) => !r.pass).map((r) => r.name), "good reply").toEqual([]);
      const bad = runChecks(c, baseReply({ ...base, ...o.reply, response: o.bad }) as any, trace);
      expect(bad.some((r) => !r.pass), "bad reply").toBe(true);
    });
  }
});
