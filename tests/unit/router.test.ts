import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkills, parseSkill } from "../../src/pipeline/skills.js";
import { route, stageSkillName } from "../../src/pipeline/router.js";
import { buildContext } from "../../src/context/buildContext.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "skills");
const OUTSTANDING = "area unknown; name unknown; photos missing.";

describe("skills", () => {
  it("parses frontmatter with phrase and regex triggers", () => {
    const s = parseSkill("x.md", "---\nname: x\nprecedence: 5\ntriggers: [a b, /c\\d{1,3}/i, Dr. Hakan]\nstages: [LEAD, WAITING]\ncontext_triggers: [collection_outstanding]\nsuppresses: [y, z]\n---\nbody\n");
    expect(s.name).toBe("x");
    expect(s.precedence).toBe(5);
    expect(s.stages).toEqual(["LEAD", "WAITING"]);
    expect(s.contextTriggers).toEqual(["collection_outstanding"]);
    expect(s.suppresses).toEqual(["y", "z"]);
    expect(s.triggers[0]).toBe("a b");
    expect(s.triggers[1]).toBeInstanceOf(RegExp);
    expect((s.triggers[1] as RegExp).test("C12")).toBe(true);
    expect(s.triggers[2]).toBe("dr. hakan");
    expect(s.body).toBe("body");
    expect(s.file).toBe("x.md");
  });
  it("defaults missing lists to empty and precedence to 50", () => {
    const s = parseSkill("y.md", "---\nname: y\n---\nbody");
    expect(s).toMatchObject({ precedence: 50, triggers: [], stages: [], contextTriggers: [], suppresses: [] });
  });
  it("rejects a file without frontmatter or name", () => {
    expect(() => parseSkill("bad.md", "no frontmatter")).toThrow(/frontmatter/);
    expect(() => parseSkill("bad.md", "---\nprecedence: 1\n---\nbody")).toThrow(/name/);
  });
  it("loads a directory", () => {
    expect(loadSkills(dir).map((s) => s.name).sort()).toEqual(
      ["carecredit", "collection", "lead-only", "pause", "payment", "stage-lead", "stage-meeting-booked", "travel"],
    );
  });
});

describe("stageSkillName", () => {
  it("maps status to a stage skill name", () => {
    expect(stageSkillName("PRE_CLINICAL_SENT")).toBe("stage-pre-clinical-sent");
    expect(stageSkillName("LEAD")).toBe("stage-lead");
  });
  it("treats MEETING_COMPLETED as MEETING_BOOKED", () => {
    expect(stageSkillName("MEETING_COMPLETED")).toBe("stage-meeting-booked");
  });
});

describe("route", () => {
  const all = loadSkills(dir);
  const lead = (over = {}) => buildContext({ PIPELINE_STATUS: "LEAD", ...over });
  const names = (r: { skills: { name: string }[] }) => r.skills.map((s) => s.name);

  it("loads the stage skill and phrase matches, sorted by precedence", () => {
    const r = route(lead(), "Do you take CareCredit?", all);
    expect(names(r)).toEqual(["carecredit", "stage-lead"]);
    expect(r.stageSkill).toBe("stage-lead");
    expect(r.matched).toContainEqual({ skill: "carecredit", by: "carecredit" });
    expect(r.matched).toContainEqual({ skill: "stage-lead", by: "stage" });
  });
  it("regex trigger works and whole-word phrase does not match inside words", () => {
    expect(names(route(lead(), "cherry?", all))).toContain("carecredit");
    expect(names(route(lead(), "photographic memory", all))).not.toContain("collection");
  });
  it("matches curly apostrophes and line breaks like plain ones", () => {
    const s = parseSkill("u.md", "---\nname: upload\ntriggers: [can't upload, sew in]\n---\nbody");
    expect(names(route(lead(), "I can’t upload", [s]))).toEqual(["upload"]);
    expect(names(route(lead(), "a sew\nin", [s]))).toEqual(["upload"]);
  });
  it("context trigger loads collection only when something is outstanding", () => {
    const r = route(lead({ COLLECTION_STATUS: OUTSTANDING }), "hi", all);
    expect(names(r)).toContain("collection");
    expect(r.matched).toContainEqual({ skill: "collection", by: "context:collection_outstanding" });
    expect(names(route(lead(), "hi", all))).toEqual(["stage-lead"]);
  });
  it("unknown stage loads no stage skill but still routes the message", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "BOOKED" }), "hi", all);
    expect(r.stageSkill).toBeNull();
    expect(r.skills).toEqual([]);
    expect(names(route(buildContext({ PIPELINE_STATUS: "BOOKED" }), "carecredit?", all))).toEqual(["carecredit"]);
  });
  it("MEETING_COMPLETED loads the meeting-booked stage skill", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "MEETING_COMPLETED" }), "hi", all);
    expect(r.stageSkill).toBe("stage-meeting-booked");
    expect(names(r)).toEqual(["stage-meeting-booked"]);
  });
  it("a non-stage skill restricted to some stages loads only there", () => {
    expect(names(route(lead(), "how many grafts?", all))).toContain("lead-only");
    expect(names(route(buildContext(), "how many grafts?", all))).not.toContain("lead-only");
  });
});

describe("route suppression", () => {
  const all = loadSkills(dir);
  const names = (r: { skills: { name: string }[] }) => r.skills.map((s) => s.name);

  it("drops a suppressed module when its winner also matched, and records it", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: OUTSTANDING }), "I need time, I'll send photos later", all);
    expect(names(r)).toEqual(["pause", "stage-lead"]);
    expect(r.suppressed).toEqual([{ winner: "pause", suppressed: "collection" }]);
  });
  it("records nothing when the suppressed module did not match", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "I need time", all);
    expect(names(r)).toEqual(["pause", "stage-lead"]);
    expect(r.suppressed).toEqual([]);
  });
  it("a module that is itself suppressed cannot suppress others, whatever the name order", () => {
    const mk = (name: string, sup: string) => parseSkill(`${name}.md`, `---\nname: ${name}\nprecedence: 20\ntriggers: [hello]\nsuppresses: [${sup}]\n---\nbody`);
    const coll = parseSkill("c.md", "---\nname: coll\nprecedence: 30\ntriggers: [hello]\n---\nbody");
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "hello", [mk("a-pause", "coll"), mk("z-delay", "a-pause, coll"), coll]);
    expect(names(r)).toEqual(["z-delay"]);
    expect(r.suppressed).toEqual([{ winner: "z-delay", suppressed: "a-pause" }, { winner: "z-delay", suppressed: "coll" }]);
  });
  it("never suppresses the stage module", () => {
    const greedy = parseSkill("g.md", "---\nname: greedy\nprecedence: 1\ntriggers: [hello]\nsuppresses: [stage-lead]\n---\nbody");
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "hello", [...all, greedy]);
    expect(names(r)).toEqual(["greedy", "stage-lead"]);
    expect(r.suppressed).toEqual([]);
  });
});

describe("route cap", () => {
  const all = loadSkills(dir);
  const names = (r: { skills: { name: string }[] }) => r.skills.map((s) => s.name);

  it("loads at most 3 non-stage modules, preferring more trigger hits", () => {
    // payment 2 hits, travel 2 hits, carecredit 1, pause 1 (collection is suppressed by pause)
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "carecredit for the deposit at checkout? I need time. flight and passport. photo", all);
    expect(names(r)).toEqual(["carecredit", "payment", "travel", "stage-lead"]);
    expect(r.suppressed).toEqual([{ winner: "pause", suppressed: "collection" }]);
    expect(r.matched.map((m) => m.skill)).toContain("pause"); // matched, then cut by the cap
  });
  it("breaks equal hit counts by lower precedence, then name", () => {
    // all four have one hit: carecredit 20, payment 20, collection 30, travel 30
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "carecredit, pay, flight, photo", all);
    expect(names(r)).toEqual(["carecredit", "payment", "collection", "stage-lead"]);
  });
  it("the stage module does not count toward the cap", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "carecredit, deposit, passport", all);
    expect(names(r)).toEqual(["carecredit", "payment", "travel", "stage-lead"]);
  });
});
