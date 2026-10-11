import { describe, it, expect } from "vitest";
import { loadPrompt } from "../../src/prompts.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";

const core = loadPrompt("core");
const section = (heading: string) => {
  const start = core.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const next = core.indexOf("\n# ", start + heading.length);
  return core.slice(start, next < 0 ? undefined : next);
};

describe("core prompt", () => {
  it("is small", () => {
    expect(core.split("\n").length).toBeLessThan(150);
    expect(core.split(/\s+/).length).toBeLessThan(1400);
  });
  it("has no template placeholders", () => {
    expect(core).not.toMatch(/\{\{[A-Za-z_.]+\}\}/);
  });
  it("covers escalation, grounding, output fields and link placement", () => {
    for (const h of ["# WHEN A PERSON MUST TAKE OVER", "# GROUNDING", "# OUTPUT FIELDS", "# TOOLS AND LINKS", "last line"]) expect(core).toContain(h);
  });
  it("has no conflict-resolution prose: the router settles conflicts in code", () => {
    expect(core).not.toContain("# CONFLICTS");
    expect(core).not.toMatch(/\boverrides?\b|takes? priority|wins over|appears first wins|priority order/i);
  });
  it("lists exactly the narrow escalation triggers and leaves the handoff sentence to the system", () => {
    const esc = section("# WHEN A PERSON MUST TAKE OVER");
    for (const re of [
      /talk to a person/i,
      /charge a card/i, /card (?:numbers|digits)/i,
      /move, transfer, or refund a deposit or payment/i,
      /contact a clinic/i, /hold or reserve a date/i,
      /second time/i,
      /discount[^.]*cannot verify[^.]*will not drop/i,
      /system writes the handoff sentence/i,
      /escalationReason/,
    ]) expect(esc, String(re)).toMatch(re);
    expect(esc).not.toMatch(/no tool and no loaded section|if (?:you are )?unsure|when in doubt/i);
  });
  it("describes every tool the model can call", () => {
    const tools = section("# TOOLS AND LINKS");
    for (const t of TOOL_DEFINITIONS) expect(tools, t.name).toMatch(new RegExp(`\\b${t.name}\\b`));
    expect(tools).toMatch(/Tool suffix/);
  });
  it("settles the repeated-link conflict: a page the patient must act on gets its link", () => {
    const voice = section("# VOICE AND FORMAT");
    expect(voice).toMatch(/unless the patient asks again or you are telling them to do something on that page/i);
  });
  it("quotes a package with its price and deposit, never raw field names", () => {
    expect(section("# GROUNDING")).toMatch(/with its deposit, in plain words without field names/);
  });
  it("does not contradict the modules it is loaded with", () => {
    // moving money paid directly to a clinic is deposit-eligibility's case, answered, not handed off
    expect(section("# WHEN A PERSON MUST TAKE OVER")).toMatch(/they say they made to Doctours/);
    expect(section("# WHEN A PERSON MUST TAKE OVER")).toMatch(/deposit paid straight to a clinic[^;]*normal answer/);
    // promo says never announce that you cannot apply a discount
    expect(section("# WHAT YOU CANNOT DO")).not.toMatch(/discount/i);
    // the getPaymentLink fallback lived in packet line 1317, which the module cut drops
    expect(section("# TOOLS AND LINKS")).toMatch(/no ready link[^.]*book from their assessment/);
  });
  it("answers a call request with the free consultation instead of a handoff", () => {
    expect(section("# WHEN A PERSON MUST TAKE OVER")).toMatch(/asking for a call \(offer the free consultation call\)/);
  });
  it("hands off the new judgment cases and names the look-alike that stays a normal answer", () => {
    const esc = section("# WHEN A PERSON MUST TAKE OVER");
    // open dates at a clinic vs a package's bookable weekdays
    expect(esc).toMatch(/find out which dates are open at a clinic/i);
    expect(esc).toMatch(/which weekdays a package can be booked on[^;]*normal answer/i);
    // arranging logistics for them vs how transport works
    expect(esc).toMatch(/arrange or change their hotel, transfer, or driver for them/i);
    expect(esc).toMatch(/how transport works from their own hotel[^;]*normal answer/i);
    // a deposit move request with nothing on file vs asking about later
    expect(esc).toMatch(/move, transfer, or refund a deposit or payment they say they made to Doctours, even if none shows on file/i);
    expect(esc).toMatch(/asking whether they could move it later[^;]*normal answer/i);
  });
  it("does not copy external test sentences into the prompt", () => {
    for (const t of ["dates are still free", "Move my deposit to Gold now", "transport from my own hotel?", "a separate callback for me"]) expect(core, t).not.toContain(t);
  });
  it("replies in English even when asked for another language", () => {
    expect(section("# WHAT YOU DO EACH TURN")).toMatch(/Always reply in English, even when the patient writes in or asks for another language/);
  });
  it("does not contain any expected-reply text", () => {
    expect(core).not.toMatch(/15 to 20 minutes|getting a person for you|I can't charge a card|Sapphire, at|Silver is \$3,000|Asked to talk to a human|Asked to charge a card number/);
  });
});
