import { describe, it, expect } from "vitest";
import { buildContext, renderPatientSummary, fill, templateValues } from "../../src/context/buildContext.js";
import { PATIENT_SUMMARY } from "../../src/context/packet.js";

describe("context", () => {
  it("default summary matches the packet constant exactly", () => {
    expect(renderPatientSummary(buildContext())).toBe(PATIENT_SUMMARY);
  });
  it("overrides change the summary", () => {
    const s = renderPatientSummary(buildContext({ PATIENT_COUNTRY_CODE: "GB", KLARNA_PAYPAL_FINANCING_ELIGIBLE: false, PIPELINE_STATUS: "LEAD" }));
    expect(s).toContain("Home country: GB");
    expect(s).toContain("financing available: no");
    expect(s).toContain("Pipeline Status: LEAD");
  });
  it("unknown financing renders as unknown", () => {
    expect(renderPatientSummary(buildContext({ KLARNA_PAYPAL_FINANCING_ELIGIBLE: "unknown" }))).toContain("financing available: unknown");
  });
  it("overrides do not leak between contexts", () => {
    buildContext({ PIPELINE_STATUS: "LEAD" });
    expect(buildContext().PIPELINE_STATUS).toBe("PRE_CLINICAL_SENT");
  });
  it("fill replaces known placeholders and leaves unknown ones", () => {
    expect(fill("a {{X}} b {{clinic.slug}} {{Y}}", { X: "1" })).toBe("a 1 b {{clinic.slug}} {{Y}}");
  });
  it("template values cover the packet placeholders", () => {
    const v = templateValues(buildContext());
    for (const k of ["PATIENT_SUMMARY", "CLINIC_FLAGS", "RECENT_CALLS", "CHAT_LIST", "RECENT_CONVERSATION_SUMMARY", "COLLECTION_STATUS", "WORKING_MEMORY", "COORDINATOR_DISPLAY_NAME", "CHAT_KIND", "SENDER_DISPLAY_NAME", "SENDER_PARTICIPANT_ROLE", "SAVED_CLINIC_COUNT", "PATIENT_IMAGE_COUNT"]) expect(v[k], k).toBeTypeOf("string");
  });
});
