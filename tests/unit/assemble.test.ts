import { describe, it, expect } from "vitest";
import { assembleSystem, renderContextBlock } from "../../src/pipeline/assemble.js";
import { buildContext } from "../../src/context/buildContext.js";

const mod = (name: string, body: string) => ({ name, body });

describe("assembleSystem", () => {
  it("returns three blocks: fixed core, then chosen modules, then patient context", () => {
    const blocks = assembleSystem("CORE", [mod("a", "A body"), mod("b", "B body")], buildContext());
    expect(blocks.map((b) => b.type)).toEqual(["text", "text", "text"]);
    expect(blocks[0].text).toBe("CORE");
    expect(blocks[1].text.indexOf("A body")).toBeLessThan(blocks[1].text.indexOf("B body"));
    expect(blocks[1].text).toContain("<!-- module: a -->");
    expect(blocks[1].text).not.toContain("Jordan Hale");
    expect(blocks[2].text).toContain("Jordan Hale");
  });
  it("the core block is byte-identical across messages so it stays cached", () => {
    const a = assembleSystem("CORE", [mod("a", "A")], buildContext());
    const b = assembleSystem("CORE", [mod("b", "B")], buildContext({ PIPELINE_STATUS: "LEAD" }));
    expect(a[0]).toEqual(b[0]);
  });
  it("the modules block depends only on the modules, so it caches across patients", () => {
    const a = assembleSystem("CORE", [mod("a", "A")], buildContext());
    const b = assembleSystem("CORE", [mod("a", "A")], buildContext({ PATIENT_NAME: "Someone Else", CHAT_LIST: "different" }));
    expect(a[1]).toEqual(b[1]);
    expect(a[2]).not.toEqual(b[2]);
  });
  it("says so when no module loaded", () => {
    expect(assembleSystem("CORE", [], buildContext())[1].text).toContain("(none for this message)");
  });
});

describe("renderContextBlock", () => {
  const block = renderContextBlock(buildContext());
  it("carries patient summary, clinic flags, stage, memory, calls, conversation and date", () => {
    for (const s of ["# Patient summary", "Jordan Hale", "Speciality=Afro Hair", "Pipeline Status: PRE_CLINICAL_SENT", "Everything is collected", "receding hairline", "4C curls", "Did any clinic catch your eye", "September 27, 2026", "Coordinator name: Alex"]) {
      expect(block, s).toContain(s);
    }
  });
  it("states the promo rule when there is no promo and shows the promo otherwise", () => {
    expect(block).toContain("Promo: none");
    expect(renderContextBlock(buildContext({ PROMO_OFFER: "$200 off, code SPRING" }))).toContain("$200 off, code SPRING");
  });
  it("includes extras such as a call summary", () => {
    expect(renderContextBlock(buildContext(), ["# Call summary\nhe asked about 4C hair"])).toContain("he asked about 4C hair");
  });
  it("handles an empty conversation", () => {
    expect(renderContextBlock(buildContext({ CHAT_LIST: "", RECENT_CALLS: "" }))).toContain("(no messages yet)");
  });
});
