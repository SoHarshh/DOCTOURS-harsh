import { describe, it, expect } from "vitest";
import { getClinicPackages, getPaymentLink, getAllClinics, HEVA_CLINIC_ID } from "../../src/tools/fixtures.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { executeTool, TOOL_NAMES } from "../../src/tools/execute.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";

describe("fixtures", () => {
  it("Heva has two packages, matched by partial name", () => {
    expect(getClinicPackages({ clinicName: "heva" })?.packages.map((p) => p.name)).toEqual(["Silver", "Gold"]);
  });
  it("unknown clinic returns null", () => { expect(getClinicPackages({ clinicName: "nowhere" })).toBeNull(); });
  it("payment link needs a real package id", () => {
    expect(getPaymentLink({ type: "payment", clinicPackageId: "44444444-4444-4444-8444-444444444442" })?.url).toBe("https://www.doctours.com/payment/44444444-4444-4444-8444-444444444442");
    expect(getPaymentLink({ type: "payment" })?.status).toBe("missing_input");
    expect(getPaymentLink({ type: "checkout", clinicId: HEVA_CLINIC_ID })?.url).toBe("https://www.doctours.com/clinic/heva/checkout");
    expect(getPaymentLink({ type: "checkout", clinicId: "x" })).toBeNull();
  });
  it("all 14 tools are defined and named identically", () => {
    expect(TOOL_NAMES.length).toBe(14);
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });
  it("getAllClinics returns both clinics", () => { expect(getAllClinics().clinics.length).toBe(2); });
});

describe("executeTool + ToolLog", () => {
  it("logs urls and prices from results", () => {
    const log = new ToolLog();
    executeTool("getClinicPackagesTool", { clinicName: "Dr. Hakan" }, log);
    executeTool("getLatestAssessment", {}, log);
    expect(log.prices().has(3200)).toBe(true);
    expect(log.prices().has(500)).toBe(true);
    expect(log.urls().has("https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333")).toBe(true);
    expect(log.calls[0].name).toBe("getClinicPackagesTool");
  });
  it("null result is the literal string null and marked not ok", () => {
    const log = new ToolLog();
    expect(executeTool("getClinicPackages", { clinicName: "nope" }, log)).toBe("null");
    expect(log.calls[0].ok).toBe(false);
  });
  it("unknown tool name returns an error payload", () => {
    expect(executeTool("nope", {}, new ToolLog())).toContain("unknown tool");
  });
  it("overrides replace the fixture result", () => {
    const log = new ToolLog();
    expect(executeTool("getPatientImages", {}, log, { getPatientImages: { hasImages: false } })).toBe('{"hasImages":false}');
  });
  it("slugs from tool results are exposed for clinic page links", () => {
    const log = new ToolLog();
    executeTool("getAllClinics", {}, log);
    expect(log.slugs()).toEqual(new Set(["heva", "dr-hakan"]));
  });
});

describe("review minors", () => {
  it("a tool that throws returns an error result instead of ending the turn", () => {
    const log = new ToolLog();
    const out = executeTool("getClinicPackages", { clinicName: 123 }, log);
    expect(out).toMatch(/error/);
    expect(log.calls[0].ok).toBe(false);
  });
});
