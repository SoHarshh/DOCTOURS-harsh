import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSkills, parseSkill, type Skill } from "../../src/pipeline/skills.js";
import { route, MAX_MODULES } from "../../src/pipeline/router.js";
import { buildContext, type Context } from "../../src/context/buildContext.js";
import { ROOT, SKILLS_DIR } from "../../src/paths.js";

const all = loadSkills(SKILLS_DIR);
const byName = new Map(all.map((s) => [s.name, s]));
const names = (text: string, over: Partial<Context> = {}) => route(buildContext(over), text, all).skills.map((s) => s.name);
const nonStage = (list: string[]) => list.filter((n) => !n.startsWith("stage-"));
const OUTSTANDING = "area unknown; name unknown; photos missing. Asks so far -- area 0, name 0, photos 0 (budget 1 each).";
const STAGES = ["LEAD", "PREP_PRE_CLINICAL", "PRE_CLINICAL_SENT", "MEETING_BOOKED", "MEETING_COMPLETED", "MEETING_MISSED", "WAITING"];

describe("skill files", () => {
  it("all parse, names unique and match file names, bodies non-empty", () => {
    expect(all.length).toBe(30);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
    for (const s of all) {
      expect(s.file, s.name).toBe(`${s.name}.md`);
      expect(s.body.length, s.name).toBeGreaterThan(40);
    }
  });
  it("no expected-reply text in any module", () => {
    for (const s of all) expect(s.body, s.name).not.toMatch(/15 to 20 minutes|getting a person for you|I can't charge a card|Sapphire, at \$|Silver is \$3,000 USD/);
  });
  it("precedence bands: hard rules 20, guidance 30, stage 40", () => {
    for (const s of all) expect([20, 30, 40], s.name).toContain(s.precedence);
    for (const s of all.filter((x) => x.name.startsWith("stage-"))) {
      expect(s.precedence, s.name).toBe(40);
      expect(s.triggers, s.name).toEqual([]);
    }
  });
  it("every suppresses entry names a real non-stage module", () => {
    for (const s of all) for (const x of s.suppresses) {
      expect(byName.has(x), `${s.name} suppresses ${x}`).toBe(true);
      expect(x.startsWith("stage-"), `${s.name} suppresses ${x}`).toBe(false);
    }
  });
  it("conflicts the original settled in prose are declared as suppressions", () => {
    expect(byName.get("time-bound-pause")?.suppresses).toEqual(["collection"]);
    expect(byName.get("image-delay")?.suppresses).toEqual(["collection", "time-bound-pause"]);
  });
  it("no phrase trigger is already covered by another phrase in the same module", () => {
    // keeps hit counts honest: "payment" and "payment link" would score one mention twice
    const ctx = buildContext();
    for (const s of all) {
      const phrases = s.triggers.filter((t): t is string => typeof t === "string");
      for (const a of phrases) {
        const probe: Skill = { ...s, name: "probe", triggers: [a], contextTriggers: [], stages: [], suppresses: [] };
        for (const b of phrases) {
          if (a === b) continue;
          expect(route(ctx, b, [probe]).skills.length, `${s.name}: "${a}" already matches "${b}"`).toBe(0);
        }
      }
    }
  });
  it.skipIf(!existsSync(join(ROOT, "pre-deposit-respond-packet.md")))("module bodies are verbatim packet lines (fertility excepted)", () => {
    const packet = new Set(readFileSync(join(ROOT, "pre-deposit-respond-packet.md"), "utf8").split("\n"));
    for (const s of all.filter((x) => x.name !== "fertility")) {
      for (const line of s.body.split("\n")) if (line.trim()) expect(packet.has(line), `${s.name}: ${line.slice(0, 60)}`).toBe(true);
    }
  });
});

describe("module descriptions (for the fallback classifier)", () => {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  it("parses an optional one-line description, colons and commas included", () => {
    expect(parseSkill("d.md", "---\nname: d\ndescription: The patient asks about X: Y, or Z.\n---\nbody").description).toBe("The patient asks about X: Y, or Z.");
    expect(parseSkill("e.md", "---\nname: e\n---\nbody").description).toBeUndefined();
  });
  it("every policy module says, in one sentence of patient intent, when it is needed", () => {
    for (const s of all.filter((x) => !x.name.startsWith("stage-"))) {
      expect(s.description, s.name).toMatch(/^The (?:patient|person) /);
      expect(s.description!.length, s.name).toBeGreaterThan(60);
      expect(s.description!.length, s.name).toBeLessThan(500);
      expect(s.description!.split(/(?<=[.?!])\s+(?=[A-Z])/).length, `${s.name}: one sentence`).toBe(1);
    }
  });
  it("descriptions share no six-word run with any test case message", () => {
    const dirs = ["tests/cases", "tests/heldout", "tests/external", "tests/escalation-stress"].map((d) => join(ROOT, d)).filter((d) => existsSync(d));
    const files = [...dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => join(d, f))), join(ROOT, "tests", "packet-messages.json")].filter((f) => existsSync(f));
    const grams = new Set<string>();
    for (const f of files) {
      const data = JSON.parse(readFileSync(f, "utf8"));
      for (const c of Array.isArray(data) ? data : Object.values(data).flat()) {
        if (typeof (c as any)?.text !== "string") continue;
        const w = words((c as any).text);
        for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(" "));
      }
    }
    expect(grams.size).toBeGreaterThan(100);
    for (const s of all) {
      if (!s.description) continue;
      const w = words(s.description);
      for (let i = 0; i + 6 <= w.length; i++) expect(grams.has(w.slice(i, i + 6).join(" ")), `${s.name}: "${w.slice(i, i + 6).join(" ")}"`).toBe(false);
    }
  });
});

describe("stage modules", () => {
  it("every stage has exactly one stage module", () => {
    for (const st of STAGES) {
      const r = route(buildContext({ PIPELINE_STATUS: st }), "hi", all);
      expect(r.stageSkill, st).not.toBeNull();
      expect(r.skills.filter((s) => s.name.startsWith("stage-")).length, st).toBe(1);
    }
  });
});

describe("routing", () => {
  it("routes the packet-shaped questions", () => {
    const a = names("I'm leaning toward Heva. What packages do they have, and can I pay from the assessment? I have 4C curls — does Heva do afro hair?");
    expect(a).toEqual(expect.arrayContaining(["stage-pre-clinical-sent", "clinic-and-package-facts", "payment-and-deposit", "assessment"]));
    expect(names("What does Dr. Hakan Clinic cost?")).toEqual(["clinic-and-package-facts", "stage-pre-clinical-sent"]);
    expect(names("Is the consultation free?")).toEqual(["consultation", "stage-pre-clinical-sent"]);
  });
  it("each module loads for a message about its policy", () => {
    const cases: [string, string, Partial<Context>?][] = [
      ["financing-geography", "can I pay in monthly installments?"],
      ["health-insurance", "will my insurance cover this?"],
      ["carecredit", "do you take carecredit?"],
      ["carecredit", "Do you offer financing thru Cherry?"],
      ["clinic-website", "what's Heva's website?"],
      ["payment-and-deposit", "how do I pay the deposit?"],
      ["promo", "are there any discounts right now?"],
      ["deposit-eligibility", "I already paid a deposit directly to the clinic"],
      ["clinic-and-package-facts", "does Heva operate on Sundays?"],
      ["clinic-status-tiers", "do you have any clinics in Mexico?"],
      ["assessment", "when will my assessment be ready?"],
      ["image-delay", "I have a sew-in right now"],
      ["time-bound-pause", "I need some time to save up first"],
      ["consultation", "can I reschedule my consultation?"],
      ["off-channel-requests", "can you email me a pdf of the plan?"],
      ["off-channel-requests", "Can you call Heva and hold Dec 8 for me?"],
      ["policy-grounding", "how far is the airport from the clinic?"],
      ["creator-partnership", "I'm an influencer with 40k followers, want to collab?"],
      ["fertility", "do you do IVF?"],
      ["collection", "can I text you the photos instead?"],
      ["collection", "hey", { PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: OUTSTANDING }],
      ["reversibility", "what if I change my mind after paying?"],
      ["direct-clinic-quote", "Heva quoted me 2600 directly"],
      ["travel", "I don't have a passport yet"],
      ["preferences-and-dates", "I'm thinking about going in March"],
      ["why-doctours", "why should I book through Doctours instead of the clinic?"],
      ["recovery", "can I wear a hat after the surgery?"],
    ];
    for (const [mod, text, over] of cases) expect(names(text, over), `${mod}: ${text}`).toContain(mod);
    const covered = new Set(cases.map((c) => c[0]));
    for (const s of all.filter((x) => !x.name.startsWith("stage-"))) expect(covered.has(s.name), `no routing case for ${s.name}`).toBe(true);
  });
  it("short acknowledgements load only the stage module", () => {
    for (const t of ["ok thanks", "thanks!", "thank you", "hi", "hello", "yes", "no", "got it", "done", "perfect", "sounds good", "ok cool", "great", "awesome"]) {
      expect(names(t), t).toEqual(["stage-pre-clinical-sent"]);
    }
  });
  it("look-alike words do not load the wrong module", () => {
    expect(names("do you offer financing?")).not.toContain("promo");
    expect(names("how much coverage will I get on my crown?")).not.toContain("health-insurance");
    expect(names("will my hair fall out after?")).not.toContain("preferences-and-dates");
    expect(names("may I ask something?")).not.toContain("preferences-and-dates");
    expect(names("I'll pay the deposit when I can")).not.toContain("image-delay");
    expect(names("I saw your ad on instagram")).not.toContain("creator-partnership");
    expect(names("can you send me the payment link?")).not.toContain("clinic-website");
    expect(names("I'm interested in Heva")).not.toContain("policy-grounding");
    expect(names("how much is the package?")).not.toContain("recovery");
  });
  it("review fixes: look-alikes stay out, real asks load", () => {
    expect(names("Does the No Shave FUE package mean I won't be shaved?")).not.toContain("image-delay");
    expect(names("I just shaved my head")).toContain("image-delay");
    expect(names("my head is shaved right now")).toContain("image-delay");
    expect(names("I'm not ready yet")).not.toContain("assessment");
    expect(names("is it ready yet?")).toContain("assessment");
    expect(names("can I bring my wife?")).not.toContain("recovery");
    expect(names("what should I bring?")).toContain("recovery");
    expect(names("is that your final price?")).not.toContain("reversibility");
    expect(names("is this final?")).toContain("reversibility");
    expect(names("what's the deal with Heva?")).not.toContain("promo");
    expect(names("any deals right now?")).toContain("promo");
    expect(names("I'm close to deciding")).not.toContain("policy-grounding");
    expect(names("thinking about going in Apr")).not.toContain("policy-grounding");
    expect(names("is the hotel close to the clinic?")).toContain("policy-grounding");
    expect(names("Can I get refunded?")).toContain("payment-and-deposit");
    expect(names("If I cancelled, do I get my money back?")).toContain("payment-and-deposit");
    expect(names("Does it hurt?")).toContain("clinic-and-package-facts");
    expect(names("Does it hurt?")).toContain("recovery");
  });
  it("modules carry no text that answers a request the core hands to a person", () => {
    // packet 921 and 922: date-hold and availability-check requests answered without a handoff;
    // packet 1317: "if one slips through, answer the rest"
    for (const s of all) {
      expect(s.body, s.name).not.toContain("Clinic date-hold:");
      expect(s.body, s.name).not.toContain("Clinic-availability check:");
      // packet 1407: "if one slips through, say plainly that a call outside the consultation isn't something you can set up"
      expect(s.body, s.name).not.toContain("a call outside the consultation isn't something you can set up");
      expect(s.body, s.name).not.toContain("If one slips through, do not grant it");
    }
    expect(byName.get("stage-pre-clinical-sent")?.body).toContain("Do NOT route to human just because the patient asks for a payment link");
    expect(byName.get("off-channel-requests")?.body).toContain("Internal lookup:");
  });
  it("escalation-shaped requests load the module that says we cannot do them", () => {
    expect(names("can you see which dates are open at Heva in March?")).toContain("off-channel-requests");
    expect(names("please arrange an airport pickup for me")).toContain("off-channel-requests");
    expect(names("which weekdays can the Silver package be booked?")).not.toContain("off-channel-requests");
  });
  it("call requests still load the consultation module", () => {
    for (const t of ["could someone call me back tomorrow?", "can I get a call with the surgeon?", "is the consultation a phone call?"]) expect(names(t), t).toContain("consultation");
  });
  it("rules the module cut first left out now sit where their messages route", () => {
    // packet 884: after a failed payment method, acknowledge it and offer only the next option
    expect(byName.get("payment-and-deposit")?.body).toContain("Acknowledge what failed and move to the next option only.");
    // packet 997: no invented clinic labels or nicknames
    expect(byName.get("clinic-and-package-facts")?.body).toContain("Do not fabricate labels, nicknames, or brand names for clinics.");
    for (const t of ["PayPal didn't work for me, what else can I use?", "my bank declined it", "the transfer did not go through", "Klarna turned me down"]) {
      expect(names(t), t).toContain("payment-and-deposit");
    }
  });
  it("rules a module's intents need are in that module, not only in one that may not load with it", () => {
    // [module that now carries it, packet line, distinctive text]
    const copies: [string, number, string][] = [
      ["financing-geography", 1445, "The Klarna account does NOT have to be in the patient's own name"],
      ["financing-geography", 1440, "The deposit is paid in full at checkout."],
      ["financing-geography", 1451, "Layaway is available regardless of home country."],
      ["financing-geography", 932, "Never compute or state financing schedules"],
      ["promo", 923, "Claimed discount: BAD"],
      ["off-channel-requests", 980, "**Can they message the clinic themselves:**"],
      ["off-channel-requests", 1436, "a request to verify specific open dates is routed to a person"],
      ["policy-grounding", 1438, "**Date confirmation flow:**"],
      ["travel", 978, "**Why we need the passport:**"],
      ["travel", 935, "Never claim which airports an airport transfer covers"],
      ["why-doctours", 998, "Do not fabricate Doctours' track record"],
      ["why-doctours", 817, "do not use them as Doctours differentiators"],
    ];
    for (const [mod, line, text] of copies) expect(byName.get(mod)?.body, `${mod} should carry packet ${line}`).toContain(text);
  });
  it("a question about how many nights to plan loads travel's stay-length rule", () => {
    for (const t of ["how many nights should I plan for?", "how many days do I need to be there?"]) expect(names(t), t).toContain("travel");
  });
  it("a deposit paid to a clinic directly loads deposit eligibility", () => {
    for (const t of [
      "Can the deposit I put down directly with Heva be moved into Doctours?",
      "I gave Hakan a deposit directly, do I need a new deposit?",
      "could my clinic deposit count toward Doctours?",
    ]) expect(names(t), t).toContain("deposit-eligibility");
  });
  it("fertility loads without hair-transplant facts", () => {
    const r = names("do you do IVF?");
    expect(r).toContain("fertility");
    expect(r).not.toContain("clinic-and-package-facts");
  });
  it("collection loads only when something is outstanding", () => {
    expect(names("hi")).not.toContain("collection");
    expect(names("hi", { PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: OUTSTANDING })).toContain("collection");
  });
  it("precedence puts hard rules before guidance before stage", () => {
    const r = names("I'm torn between Silver and Gold, what's the price?");
    expect(r.indexOf("clinic-and-package-facts")).toBeLessThan(r.indexOf("reversibility"));
    expect(r.indexOf("reversibility")).toBeLessThan(r.indexOf("stage-pre-clinical-sent"));
  });
  it("a message touching many policies still loads at most the cap plus the stage", () => {
    const r = names("Can I use CareCredit or insurance, do you have clinics in Mexico, I need a passport, and can I wear a hat after?");
    expect(nonStage(r).length).toBe(MAX_MODULES);
    expect(r).toContain("stage-pre-clinical-sent");
  });
});

describe("conflicts settled in code", () => {
  const lead = { PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: OUTSTANDING };
  it("a time-bound pause drops the collection module", () => {
    const r = route(buildContext(lead), "I need some time to save up first", all);
    expect(r.skills.map((s) => s.name)).toEqual(["time-bound-pause", "stage-lead"]);
    expect(r.suppressed).toEqual([{ winner: "time-bound-pause", suppressed: "collection" }]);
  });
  it("a hair-state photo delay drops collection and the generic pause", () => {
    const r = route(buildContext(lead), "I have braids in right now, I need some time before photos", all);
    expect(r.skills.map((s) => s.name)).toContain("image-delay");
    expect(r.skills.map((s) => s.name)).not.toContain("collection");
    expect(r.skills.map((s) => s.name)).not.toContain("time-bound-pause");
    expect(r.suppressed).toEqual([
      { winner: "image-delay", suppressed: "collection" },
      { winner: "image-delay", suppressed: "time-bound-pause" },
    ]);
  });
});

describe("routing fixes from the first measured run", () => {
  const lead = { PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: "area unknown; name unknown; photos missing." };
  it("a hyphenated '$300-off code' loads the promo module", () => {
    expect(names("I saw on Instagram there's a $300-off code this month. What's the code?")).toContain("promo");
    expect(names("do you have a promo code?")).toContain("promo");
  });
  it("asking whether the clinic or surgeon will contact them loads the consultation module", () => {
    expect(names("will the clinic contact me before the procedure?")).toContain("consultation");
    expect(names("when do I get to talk to the surgeon?")).toContain("consultation");
  });
  it("braids as the cause of hair loss do not count as a photo delay", () => {
    const r = names("my edges got pulled out from braids and I'm so embarrassed!! I just want them back", lead);
    expect(r).not.toContain("image-delay");
    expect(r).toContain("collection");
  });
  it("braids worn right now still count as a photo delay", () => {
    expect(names("I have box braids right now so photos won't show much", lead)).toContain("image-delay");
    expect(names("my hair is braided at the moment", lead)).toContain("image-delay");
  });
});

describe("review minors: homonyms", () => {
  it("'Visa' the card does not load travel; a travel visa does", () => {
    expect(names("can I pay the deposit with my Visa?")).not.toContain("travel");
    expect(names("do I need a visa for Turkey?")).toContain("travel");
  });
  it("'form of payment' does not load off-channel requests; a paperwork form does", () => {
    expect(names("what form of payment do you take?")).not.toContain("off-channel-requests");
    expect(names("can you fill out a form for my employer?")).toContain("off-channel-requests");
  });
});
