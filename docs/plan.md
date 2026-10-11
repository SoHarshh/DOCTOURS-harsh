# Routed Reply System Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Tasks run in order; each ends with a commit and push.

**Goal:** Replace the single 800-line concierge prompt with a routed skills pipeline that escalates to a human, emits a trace per reply, and measurably beats the original on a shared test suite.

**Architecture:** Per message: code pre-gate, code router, assembled prompt (core plus matched skills plus context), one model call with the 14 fixture tools and structured output, code validators, trace. A baseline runner fills the original monolith prompt with the same tools and output schema so both systems run through one harness.

**Tech Stack:** Node 22, TypeScript (ESM, run with `tsx`), `@anthropic-ai/sdk`, `zod`, `vitest`, `dotenv`.

**Spec:** `docs/design.md`

## Global Constraints

- Node 20 or later. ESM only (`"type": "module"`). No build step; `tsx` runs `.ts` directly.
- Main model `claude-haiku-5-5`, overridable with `MODEL` env var. Effort `medium`, overridable with `EFFORT`.
- Only the 14 tool functions from the packet exist. Same names, same fixture data, `null` for unknown inputs.
- The packet's expected replies never appear in any prompt, skill, test fixture the model can see, or routing rule. No special-casing of the five sample sentences.
- Reply `response` is plain text, no markdown. Any URL is the last line.
- Commits use the configured git identity. Push after every task.
- The packet file `pre-deposit-respond-packet.md` stays gitignored. Skill files copy policy text out of the packet; that copy is the deliverable.
- Current date in prompts is the packet's fixed value: `September 27, 2026 at 07:37 PM UTC`.

## Review Focus

1. **Malformed CLI input** (not an array, item missing `text`): expect a clear error on stderr and exit code 1, not a stack trace. Test in Task 7.
2. **Unknown pipeline status in a context override** (e.g. `BOOKED`): router loads no stage skill, records that in the trace, and the pipeline still runs. Test in Task 9.
3. **Card digits with separators** (`4242-4242-4242-4242`, `4242 4242 4242 4242`): pre-gate fires and redaction removes them. Test in Task 8.
4. **Model sets `escalate: true` but writes a long sales answer**: escalation-shape auto-fix trims to the first two sentences and strips URLs and prices. Test in Task 13.
5. **Tool returns null for an unknown clinic name**: tool result is the literal string `null`, logged as ok, and the model is told nothing was found. Test in Task 3.

---

## File structure

```
package.json  tsconfig.json  vitest.config.ts  .env (gitignored)
src/
  types.ts                 Reply + WorkingMemoryUpdates Zod schemas and TS types; Trace; Usage
  context/constants.ts     packet constants, verbatim
  context/buildContext.ts  Context type, buildContext(overrides), renderPatientSummary, fill()
  tools/fixtures.ts        the 14 functions and their data
  tools/schemas.ts         Anthropic tool definitions
  tools/toolLog.ts         ToolLog: records calls, exposes urls/prices/imageUrls seen this turn
  tools/execute.ts         executeTool(name, input, log) -> string
  pipeline/pregate.ts      pregate(text) -> PregateResult
  pipeline/skills.ts       Skill type, parseSkill, loadSkills(dir)
  pipeline/router.ts       route(ctx, text, skills) -> RouteResult
  pipeline/assemble.ts     assembleSystem(core, skills, ctx, extras) -> TextBlockParam[]
  pipeline/model.ts        callModel(deps, input) -> ModelCallResult
  pipeline/validators.ts   validate(), autoFix()
  pipeline/escalationReply.ts  handoffReply(category)
  pipeline/runMessage.ts   runMessage(ctx, text, opts) -> {reply, trace}
  baseline/monolith.ts     runBaseline(ctx, text, opts) -> {reply, trace}
  subagents/callLog.ts     summarizeCalls(deps, ctx) -> string
  cli.ts                   stdin/--in JSON array -> stdout/--out Reply[]; --trace file
prompts/core.md  prompts/baseline.md  prompts/userMessage.md
skills/*.md
scripts/smoke.ts           one live call, prints usage
tests/unit/*.test.ts
tests/cases/*.json
harness/checker.ts  harness/run.ts  harness/compare.ts  harness/blast.ts  harness/rates.ts
results/                   committed JSON + compare.md
docs/design.md  docs/plan.md  README.md
```

Every `src/pipeline/*` and `src/baseline/*` function takes a `client` through a `ModelDeps` object so unit tests inject a fake and never call the API.

---

### Task 0: Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`, `npm run reply`, `npm run harness`, `npm run compare`, `npm run blast`, `npm run smoke` scripts.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "doctours-reply-system",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "reply": "tsx src/cli.ts",
    "smoke": "tsx scripts/smoke.ts",
    "harness": "tsx harness/run.ts",
    "compare": "tsx harness/compare.ts",
    "blast": "tsx harness/blast.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

If `npm install` reports that `@anthropic-ai/sdk@^0.80.0` does not exist, run `npm view @anthropic-ai/sdk version` and pin the latest published version instead.

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "harness", "scripts", "tests"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/unit/**/*.test.ts"] } });
```

- [ ] **Step 4: Write a smoke test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("scaffold", () => { it("runs", () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 5: Install and run**

Run: `npm install && npm test`
Expected: 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts tests/unit/smoke.test.ts
git commit -m "Scaffold TypeScript project with vitest and tsx"
git push
```

---

### Task 1: Reply schema and shared types

**Files:**
- Create: `src/types.ts`, `tests/unit/types.test.ts`

**Interfaces:**
- Produces: `ReplySchema` (Zod), `Reply`, `WorkingMemoryUpdates`, `Usage`, `Trace`, `EscalationSource`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ReplySchema } from "../../src/types.js";

describe("ReplySchema", () => {
  it("accepts a full reply", () => {
    const r = ReplySchema.parse({
      response: "hi", escalate: false, escalationReason: null, templateId: null,
      intent: "answer", shouldFollowUp: false, followUpTiming: null,
      attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null,
    });
    expect(r.escalate).toBe(false);
  });
  it("rejects a missing field", () => {
    expect(() => ReplySchema.parse({ response: "hi" })).toThrow();
  });
  it("accepts nested working memory with nulls", () => {
    const r = ReplySchema.parse({
      response: "hi", escalate: false, escalationReason: null, templateId: null,
      intent: "answer", shouldFollowUp: false, followUpTiming: null,
      attachmentUrls: [], highEngagement: true,
      workingMemoryUpdates: {
        collectionState: null, communicationStyle: "casual", escalationFlags: null,
        keyConcerns: "hairline", patientName: null, preferredPaymentMethod: null,
        procedureArea: null, promisesMade: null, targetProcedureWindow: null,
      },
    });
    expect(r.workingMemoryUpdates?.communicationStyle).toBe("casual");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write src/types.ts**

```ts
import { z } from "zod";

export const WorkingMemoryUpdatesSchema = z.object({
  collectionState: z.object({
    areaAskCount: z.number().int().nullable(),
    lastAskedItem: z.enum(["area", "name", "photos", "none"]).nullable(),
    nameAskCount: z.number().int().nullable(),
    photoAskCount: z.number().int().nullable(),
  }).nullable(),
  communicationStyle: z.enum(["detailed", "concise", "casual", "formal", "unknown"]).nullable(),
  escalationFlags: z.string().nullable(),
  keyConcerns: z.string().nullable(),
  patientName: z.string().nullable(),
  preferredPaymentMethod: z.enum(["financing", "layaway", "pay_in_full", "cash_preference", "unknown"]).nullable(),
  procedureArea: z.string().nullable(),
  promisesMade: z.string().nullable(),
  targetProcedureWindow: z.enum(["within_3_months", "within_6_months", "within_8_months", "within_12_months", "over_12_months", "unknown"]).nullable(),
});

export const ReplySchema = z.object({
  response: z.string(),
  escalate: z.boolean(),
  escalationReason: z.string().nullable(),
  templateId: z.string().nullable(),
  intent: z.string(),
  shouldFollowUp: z.boolean(),
  followUpTiming: z.string().nullable(),
  attachmentUrls: z.array(z.string()).nullable(),
  highEngagement: z.boolean(),
  workingMemoryUpdates: WorkingMemoryUpdatesSchema.nullable(),
});

export type Reply = z.infer<typeof ReplySchema>;
export type WorkingMemoryUpdates = z.infer<typeof WorkingMemoryUpdatesSchema>;

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }
export const zeroUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input, output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite,
});

export type EscalationSource = "pregate" | "model" | "validator" | "refusal" | null;

export interface ToolCallRecord { name: string; args: unknown; ok: boolean; resultChars: number }

export interface Trace {
  id: string;
  system: "baseline" | "new";
  model: string;
  escalation: { source: EscalationSource; reason: string | null; category: string | null };
  skillsLoaded: string[];
  toolsCalled: ToolCallRecord[];
  validators: { passed: string[]; failed: string[]; autoFixed: string[] };
  retried: boolean;
  subagents: string[];
  usage: Usage;
  latencyMs: number;
  rounds: number;
  promptChars: number;
  stopReason: string;
  notes: string[];
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "Add Reply schema, trace and usage types"
git push
```

---

### Task 2: Context from packet constants

**Files:**
- Create: `src/context/constants.ts`, `src/context/buildContext.ts`, `tests/unit/context.test.ts`

**Interfaces:**
- Produces: `Context` type whose keys are the packet constant names; `DEFAULTS: Context`; `buildContext(overrides?: Partial<Context>): Context`; `renderPatientSummary(ctx): string`; `fill(template: string, values: Record<string, string>): string`.

- [ ] **Step 1: Write constants.ts**

Copy every constant from packet lines 86–314 into a single exported object. Transcribe values exactly (the chat history strings, working memory JSON string, intake Q&A array, media conversation array). Shape:

```ts
export const DEFAULTS = {
  TIER: "pre_deposit",
  PATIENT_NAME: "Jordan Hale" as string | null,
  PROCEDURE_AREA: "hairline" as string | null,
  OPENER_TYPE: "operator_initiated",
  PATIENT_EMAIL: "jordan.hale@example.invalid",
  PATIENT_PHONE: "+15555550123",
  PATIENT_COUNTRY_CODE: "US" as string | null,
  KLARNA_PAYPAL_FINANCING_ELIGIBLE: true as boolean | "unknown",
  PATIENT_SEX: "MALE",
  PROMO_OFFER: null as string | null,
  PIPELINE_STATUS: "PRE_CLINICAL_SENT",
  CONSULTATION_TIME: null as string | null,
  CONSULTATION_ID: null as string | null,
  SELECTED_CLINIC: null as string | null,
  HAS_ACTIVE_BOOKING: false,
  BOOKINGS: [] as unknown[],
  PROCEDURE_INTEREST: "FUE",
  ESTIMATED_GRAFTS: 2800,
  GRAFT_RANGE: { min: 2500, max: 3200 },
  GRAFTS: 2800,
  SAVED_CLINIC_COUNT: 2,
  WEBSITE_INTAKE_QA: [ /* verbatim */ ],
  HAS_PATIENT_IMAGES: true,
  PATIENT_IMAGE_COUNT: 5,
  CHAT_KIND: "DIRECT",
  COORDINATOR_DISPLAY_NAME: "Alex",
  RECENT_MEDIA_CONVERSATION: [ /* verbatim */ ],
  SENDER_PARTICIPANT_ID: "88888888-8888-4888-8888-888888888881",
  SENDER_PARTICIPANT_ROLE: "PATIENT",
  SENDER_DISPLAY_NAME: "Jordan Hale",
  SENDER_USER_ID: "7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11",
  THREAD_ID: "3a91c0de-11b2-4f77-8c44-90e2b7a15f03",
  RESOURCE_ID: "7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11",
  USER_ID: "7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11",
  SUPABASE_CHAT_ID: "3a91c0de-11b2-4f77-8c44-90e2b7a15f03",
  COLLECTION_STATUS: "area hairline; name on file; photos received. Asks so far -- area 1, name 1, photos 1 (budget 1 each). Last collection ask: 3 patient turn(s) ago. Everything is collected -- add NO anchor.",
  WORKING_MEMORY: `{"collectionState":{...verbatim...}}`,
  CLINIC_FLAGS: `- Heva Clinic: Speciality=Afro Hair; Practice type=Doctor-assisted\n- Dr. Hakan Clinic: Speciality=Hair Transplant; Practice type=Doctor-performed hairline`,
  RECENT_CALLS: "- 2026-09-18T15:00:00.000Z: outbound, 1320s — Free consultation. Jordan wants a hairline procedure, mentioned 4C curls, and is comparing Istanbul clinics. Photos were requested after the call.",
  CHAT_LIST: `...verbatim...`,
  RECENT_CONVERSATION_SUMMARY: `...verbatim...`,
  CURRENT_DATETIME: "September 27, 2026 at 07:37 PM UTC",
};
export const PACKET_PATIENT_SUMMARY = `- Tier: pre_deposit
- Name: Jordan Hale
- Sex: MALE
- Home country: US
- Klarna/PayPal financing available: yes
- Pipeline Status: PRE_CLINICAL_SENT
- Consultation: Not scheduled
- Procedure Interest: FUE
- Estimated Grafts: 2800
- Graft Range: 2500 - 3200 grafts
- Grafts (from measurement): 2800
- User ID: 7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11`;
```

Use `sed -n '86,314p' pre-deposit-respond-packet.md` to pull the exact text and paste the long strings in. Do not retype them.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildContext, renderPatientSummary, fill } from "../../src/context/buildContext.js";
import { PACKET_PATIENT_SUMMARY } from "../../src/context/constants.js";

describe("context", () => {
  it("default summary matches the packet constant exactly", () => {
    expect(renderPatientSummary(buildContext())).toBe(PACKET_PATIENT_SUMMARY);
  });
  it("overrides change the summary", () => {
    const ctx = buildContext({ PATIENT_COUNTRY_CODE: "GB", KLARNA_PAYPAL_FINANCING_ELIGIBLE: false, PIPELINE_STATUS: "LEAD" });
    const s = renderPatientSummary(ctx);
    expect(s).toContain("Home country: GB");
    expect(s).toContain("financing available: no");
    expect(s).toContain("Pipeline Status: LEAD");
  });
  it("unknown financing renders as unknown", () => {
    expect(renderPatientSummary(buildContext({ KLARNA_PAYPAL_FINANCING_ELIGIBLE: "unknown" }))).toContain("financing available: unknown");
  });
  it("fill replaces known placeholders and leaves unknown ones", () => {
    expect(fill("a {{X}} b {{clinic.slug}}", { X: "1" })).toBe("a 1 b {{clinic.slug}}");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/context.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write buildContext.ts**

```ts
import { DEFAULTS } from "./constants.js";

export type Context = typeof DEFAULTS;

export function buildContext(overrides: Partial<Context> = {}): Context {
  return { ...structuredClone(DEFAULTS), ...overrides };
}

export function renderPatientSummary(ctx: Context): string {
  const fin = ctx.KLARNA_PAYPAL_FINANCING_ELIGIBLE === "unknown" ? "unknown"
    : ctx.KLARNA_PAYPAL_FINANCING_ELIGIBLE ? "yes" : "no";
  return [
    `- Tier: ${ctx.TIER}`,
    `- Name: ${ctx.PATIENT_NAME ?? "Unknown"}`,
    `- Sex: ${ctx.PATIENT_SEX}`,
    `- Home country: ${ctx.PATIENT_COUNTRY_CODE ?? "Unknown"}`,
    `- Klarna/PayPal financing available: ${fin}`,
    `- Pipeline Status: ${ctx.PIPELINE_STATUS}`,
    `- Consultation: ${ctx.CONSULTATION_TIME ?? "Not scheduled"}`,
    `- Procedure Interest: ${ctx.PROCEDURE_INTEREST}`,
    `- Estimated Grafts: ${ctx.ESTIMATED_GRAFTS}`,
    `- Graft Range: ${ctx.GRAFT_RANGE.min} - ${ctx.GRAFT_RANGE.max} grafts`,
    `- Grafts (from measurement): ${ctx.GRAFTS}`,
    `- User ID: ${ctx.USER_ID}`,
  ].join("\n");
}

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key: string) => key in values ? values[key] : m);
}

/** Every string value the baseline prompt and user template can be filled with. */
export function templateValues(ctx: Context): Record<string, string> {
  return {
    PATIENT_SUMMARY: renderPatientSummary(ctx),
    CLINIC_FLAGS: ctx.CLINIC_FLAGS,
    RECENT_CALLS: ctx.RECENT_CALLS,
    CHAT_LIST: ctx.CHAT_LIST,
    RECENT_CONVERSATION_SUMMARY: ctx.RECENT_CONVERSATION_SUMMARY,
    COLLECTION_STATUS: ctx.COLLECTION_STATUS,
    WORKING_MEMORY: ctx.WORKING_MEMORY,
    COORDINATOR_DISPLAY_NAME: ctx.COORDINATOR_DISPLAY_NAME,
    CHAT_KIND: ctx.CHAT_KIND,
    SENDER_DISPLAY_NAME: ctx.SENDER_DISPLAY_NAME,
    SENDER_PARTICIPANT_ROLE: ctx.SENDER_PARTICIPANT_ROLE,
    SAVED_CLINIC_COUNT: String(ctx.SAVED_CLINIC_COUNT),
    PATIENT_IMAGE_COUNT: String(ctx.PATIENT_IMAGE_COUNT),
    CURRENT_DATETIME: ctx.CURRENT_DATETIME,
  };
}
```

- [ ] **Step 5: Run test**

Run: `npx vitest run tests/unit/context.test.ts`
Expected: 4 passed. If the first test fails on whitespace, diff the two strings and fix `renderPatientSummary`, never the constant.

- [ ] **Step 6: Commit**

```bash
git add src/context tests/unit/context.test.ts
git commit -m "Add packet constants and context builder"
git push
```

---

### Task 3: Tool fixtures, schemas, log, executor

**Files:**
- Create: `src/tools/fixtures.ts`, `src/tools/schemas.ts`, `src/tools/toolLog.ts`, `src/tools/execute.ts`, `tests/unit/tools.test.ts`

**Interfaces:**
- Produces: the 14 functions in `fixtures.ts` with the packet's exact names (`getAllClinics`, `getClinicDoctors`, `getClinicPackages`, `getConsultationRescheduleLink`, `getFullCalls`, `getLatestAssessment`, `getPatientContext`, `getPatientImages`, `getPaymentLink`, `getSavedClinics`, `issuePromoCode`, `updateUser`, `updateUserClinicPreferences`, `updateWorkingMemory`); `TOOL_DEFINITIONS: Anthropic.Tool[]`; `class ToolLog { record(name, args, result); calls: ToolCallRecord[]; urls(): Set<string>; prices(): Set<number>; imageUrls(): Set<string> }`; `executeTool(name: string, input: unknown, log: ToolLog): string`.

- [ ] **Step 1: Write fixtures.ts**

Translate packet lines 322–671 to TypeScript as-is. Keep the `findClinic` helper, the three data arrays, and every function's exact return shape. Export `HEVA_CLINIC_ID`, `HAKAN_CLINIC_ID`, `CLINICS`, `DOCTORS`, `PACKAGES` too.

- [ ] **Step 2: Write schemas.ts**

One `Anthropic.Tool` per function. Descriptions are one sentence each, taken from the packet's TOOL USAGE section but shortened. Input schemas:

```ts
import type Anthropic from "@anthropic-ai/sdk";
const clinicRef = { type: "object", properties: { clinicId: { type: "string" }, clinicName: { type: "string" } }, additionalProperties: false } as const;
const userRef = { type: "object", properties: { userId: { type: "string" } }, additionalProperties: false } as const;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  { name: "getAllClinics", description: "List every partner clinic with id, slug, address, clinic_flags and ai_context.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "getClinicDoctors", description: "Doctors at one clinic, by clinicId or clinicName.", input_schema: clinicRef },
  { name: "getClinicPackages", description: "Packages, prices, deposits, bookable weekdays and included addons for one clinic, by clinicId or clinicName. Returns null if the clinic is unknown.", input_schema: clinicRef },
  { name: "getConsultationRescheduleLink", description: "Reschedule link for the patient's free consultation call, or status no_consultation.", input_schema: userRef },
  { name: "getFullCalls", description: "Full call records with transcripts for this chat.", input_schema: { type: "object", properties: { chatId: { type: "string" }, limit: { type: "integer" } }, additionalProperties: false } },
  { name: "getLatestAssessment", description: "The patient's personal assessment link, graft range and share status.", input_schema: userRef },
  { name: "getPatientContext", description: "Patient profile, pipeline status, saved clinic and package selection, tentative procedure dates.", input_schema: userRef },
  { name: "getPatientImages", description: "Which intake photo angles the patient has uploaded, with hosted URLs.", input_schema: userRef },
  { name: "getPaymentLink", description: "Deposit checkout URL. type 'payment' needs clinicPackageId; type 'checkout' needs clinicId.", input_schema: { type: "object", properties: { type: { type: "string", enum: ["payment", "checkout"] }, clinicPackageId: { type: "string" }, clinicId: { type: "string" } }, required: ["type"], additionalProperties: false } },
  { name: "getSavedClinics", description: "The clinics recommended in the patient's assessment, ranked.", input_schema: userRef },
  { name: "issuePromoCode", description: "Cut the patient's promo code if they are on an active campaign list.", input_schema: userRef },
  { name: "updateUser", description: "Save the patient's first and last name if none is on file.", input_schema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, userId: { type: "string" } }, additionalProperties: false } },
  { name: "updateUserClinicPreferences", description: "Persist clinicSelection (selectedClinicId, selectedPackageId, softClinicInterestIds, softPackageInterestIds) and tentativeProcedureDates ({text, strength}). IDs must come from a clinic or package tool this turn.", input_schema: { type: "object", properties: { clinicSelection: { type: "object" }, tentativeProcedureDates: { type: "object", properties: { text: { type: "string" }, strength: { type: "string", enum: ["strong", "medium", "weak"] } } }, userId: { type: "string" } }, additionalProperties: false } },
  { name: "updateWorkingMemory", description: "Merge fields into the patient's working memory.", input_schema: { type: "object", properties: { memory: { type: "object" } }, additionalProperties: false } },
];
```

The packet's `updateUserClinicPreferences` signature only takes `clinicSelection` and `userId`; the TOOL USAGE text also describes `tentativeProcedureDates`. Accept both in the schema and have `fixtures.ts` ignore the dates field (it echoes the packet's fixed `tentativeProcedureDates` back regardless).

- [ ] **Step 3: Write toolLog.ts**

```ts
import type { ToolCallRecord } from "../types.js";

export class ToolLog {
  calls: ToolCallRecord[] = [];
  private results: string[] = [];
  record(name: string, args: unknown, result: unknown): string {
    const text = JSON.stringify(result ?? null);
    this.calls.push({ name, args, ok: result !== null && result !== undefined, resultChars: text.length });
    this.results.push(text);
    return text;
  }
  private allText(): string { return this.results.join("\n"); }
  urls(): Set<string> {
    return new Set((this.allText().match(/https?:\/\/[^\s"\\]+/g) ?? []).map((u) => u.replace(/[.,;:)]+$/, "")));
  }
  prices(): Set<number> {
    const out = new Set<number>();
    for (const m of this.allText().matchAll(/"(basePrice|depositAmount|pricePerUnit|amount)":\s*(\d+(?:\.\d+)?)/g)) out.add(Number(m[2]));
    return out;
  }
  imageUrls(): Set<string> {
    return new Set(this.allText().match(/https:\/\/assets\.example\.invalid\/[^\s"\\]+/g) ?? []);
  }
}
```

- [ ] **Step 4: Write execute.ts**

```ts
import * as f from "./fixtures.js";
import { ToolLog } from "./toolLog.js";

const TABLE: Record<string, (input: any) => unknown> = {
  getAllClinics: f.getAllClinics, getClinicDoctors: f.getClinicDoctors, getClinicPackages: f.getClinicPackages,
  getConsultationRescheduleLink: f.getConsultationRescheduleLink, getFullCalls: f.getFullCalls,
  getLatestAssessment: f.getLatestAssessment, getPatientContext: f.getPatientContext, getPatientImages: f.getPatientImages,
  getPaymentLink: f.getPaymentLink, getSavedClinics: f.getSavedClinics, issuePromoCode: f.issuePromoCode,
  updateUser: f.updateUser, updateUserClinicPreferences: f.updateUserClinicPreferences, updateWorkingMemory: f.updateWorkingMemory,
};

export const TOOL_NAMES = Object.keys(TABLE);

/** Accepts both `getClinicPackages` and the prompt's `getClinicPackagesTool` spelling. */
export function normalizeToolName(name: string): string { return name.replace(/Tool$/, ""); }

export function executeTool(name: string, input: unknown, log: ToolLog): string {
  const fn = TABLE[normalizeToolName(name)];
  if (!fn) return log.record(name, input, { error: `unknown tool ${name}` });
  return log.record(name, input, fn(input ?? {}));
}
```

- [ ] **Step 5: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getClinicPackages, getPaymentLink, getAllClinics, HEVA_CLINIC_ID } from "../../src/tools/fixtures.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { executeTool, TOOL_NAMES } from "../../src/tools/execute.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";

describe("fixtures", () => {
  it("Heva has two packages, matched by partial name", () => {
    const r = getClinicPackages({ clinicName: "heva" });
    expect(r?.packages.map((p) => p.name)).toEqual(["Silver", "Gold"]);
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
    const log = new ToolLog();
    expect(executeTool("nope", {}, log)).toContain("unknown tool");
  });
  it("getAllClinics returns both clinics", () => { expect(getAllClinics().clinics.length).toBe(2); });
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/tools.test.ts`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add src/tools tests/unit/tools.test.ts
git commit -m "Add the 14 fixture tools, schemas, executor and tool log"
git push
```

---

### Task 4: Prompt files for the baseline and the user message

**Files:**
- Create: `prompts/baseline.md`, `prompts/userMessage.md`, `src/prompts.ts`, `tests/unit/prompts.test.ts`

**Interfaces:**
- Produces: `loadPrompt(name: "baseline" | "userMessage" | "core"): string`; `renderUserMessage(ctx, text): string`.

- [ ] **Step 1: Extract the monolith verbatim**

Run:
```bash
sed -n '764,1553p' pre-deposit-respond-packet.md > prompts/baseline.md
head -1 prompts/baseline.md   # must be "# IDENTITY"
tail -3 prompts/baseline.md   # must end with the Mastra memory note, not a ``` fence
```
If the first or last line is wrong, adjust the range by one and rerun. Do not edit the content.

- [ ] **Step 2: Write prompts/userMessage.md**

```
Incoming thread message:
"{{HUMAN_MESSAGE}}"
Incoming image count: 0
Chat kind: {{CHAT_KIND}}
Triggering sender: {{SENDER_DISPLAY_NAME}}

Recent conversation summary:
{{RECENT_CONVERSATION_SUMMARY}}
```

- [ ] **Step 3: Write src/prompts.ts**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fill, templateValues, type Context } from "./context/buildContext.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROMPTS_DIR = join(ROOT, "prompts");
export const SKILLS_DIR = join(ROOT, "skills");

export function loadPrompt(name: "baseline" | "userMessage" | "core"): string {
  return readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8");
}

export function renderUserMessage(ctx: Context, text: string): string {
  return fill(loadPrompt("userMessage"), { ...templateValues(ctx), HUMAN_MESSAGE: text });
}

export function renderBaselineSystem(ctx: Context): string {
  return fill(loadPrompt("baseline"), templateValues(ctx));
}
```

- [ ] **Step 4: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderBaselineSystem, renderUserMessage } from "../../src/prompts.js";
import { buildContext } from "../../src/context/buildContext.js";

describe("prompts", () => {
  it("baseline fills every packet placeholder", () => {
    const s = renderBaselineSystem(buildContext());
    expect(s.startsWith("# IDENTITY")).toBe(true);
    for (const k of ["PATIENT_SUMMARY", "CLINIC_FLAGS", "CHAT_LIST", "COLLECTION_STATUS", "WORKING_MEMORY", "COORDINATOR_DISPLAY_NAME", "SAVED_CLINIC_COUNT", "PATIENT_IMAGE_COUNT", "RECENT_CALLS"]) {
      expect(s).not.toContain(`{{${k}}}`);
    }
    expect(s).toContain("{{clinic.slug}}"); // literal in the packet, must survive
    expect(s).toContain("Jordan Hale");
  });
  it("user message fills text and summary", () => {
    const u = renderUserMessage(buildContext(), "hello?");
    expect(u).toContain('"hello?"');
    expect(u).toContain("Recent conversation summary:");
    expect(u).not.toContain("{{");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/prompts.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add prompts/baseline.md prompts/userMessage.md src/prompts.ts tests/unit/prompts.test.ts
git commit -m "Add baseline prompt and user message template"
git push
```

---

### Task 5: Model call with tool loop and structured output

**Files:**
- Create: `src/pipeline/model.ts`, `tests/unit/model.test.ts`, `tests/unit/fakeClient.ts`

**Interfaces:**
- Produces: `interface ModelDeps { client: ClientLike; model: string; effort: "low" | "medium" | "high"; maxRounds: number }`; `interface ClientLike { messages: { create(params: any): Promise<any> } }`; `createDeps(): ModelDeps` (reads env); `callModel(deps, input: { system: Anthropic.TextBlockParam[]; user: string; tools: Anthropic.Tool[]; log: ToolLog }): Promise<ModelCallResult>`; `interface ModelCallResult { reply: Reply | null; rawText: string; stopReason: string; usage: Usage; rounds: number; latencyMs: number; servedModel: string; parseError: string | null }`.

- [ ] **Step 1: Write the fake client helper**

`tests/unit/fakeClient.ts`:
```ts
/** Scripted responses: each call to messages.create pops the next one. */
export function fakeClient(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      async create(params: any) {
        calls.push(params);
        const r = responses.shift();
        if (!r) throw new Error("fakeClient: no more scripted responses");
        return r;
      },
    },
  };
}
export const usage = (input = 100, output = 50, cacheRead = 0, cacheWrite = 0) =>
  ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite });
export const textResponse = (json: object, model = "claude-haiku-5-5") =>
  ({ model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: usage() });
export const toolResponse = (name: string, input: object, id = "tu_1", model = "claude-haiku-5-5") =>
  ({ model, stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }], usage: usage() });
export const baseReply = (over: Partial<any> = {}) => ({
  response: "ok", escalate: false, escalationReason: null, templateId: null, intent: "x",
  shouldFollowUp: false, followUpTiming: null, attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null, ...over,
});
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { callModel } from "../../src/pipeline/model.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { TOOL_DEFINITIONS } from "../../src/tools/schemas.js";
import { fakeClient, textResponse, toolResponse, baseReply } from "./fakeClient.js";

const deps = (client: any) => ({ client, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 });
const input = (log: ToolLog) => ({ system: [{ type: "text" as const, text: "sys" }], user: "hi", tools: TOOL_DEFINITIONS, log });

describe("callModel", () => {
  it("parses a direct structured reply", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "hello" }))]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.reply?.response).toBe("hello");
    expect(r.rounds).toBe(1);
    expect(r.usage.input).toBe(100);
    expect(c.calls[0].output_config.format).toBeDefined();
    expect(c.calls[0].system[0].cache_control).toEqual({ type: "ephemeral" });
  });
  it("runs tools then parses the final reply", async () => {
    const log = new ToolLog();
    const c = fakeClient([
      toolResponse("getClinicPackages", { clinicName: "Heva" }),
      textResponse(baseReply({ response: "Silver is 3,000" })),
    ]);
    const r = await callModel(deps(c), input(log));
    expect(r.rounds).toBe(2);
    expect(log.calls[0].name).toBe("getClinicPackages");
    expect(c.calls[1].messages[2].content[0].type).toBe("tool_result");
    expect(r.usage.input).toBe(200);
  });
  it("reports parse errors without throwing", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "not json" }], usage: { input_tokens: 1, output_tokens: 1 } }]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.reply).toBeNull();
    expect(r.parseError).toBeTruthy();
  });
  it("stops at maxRounds", async () => {
    const c = fakeClient(Array.from({ length: 6 }, () => toolResponse("getAllClinics", {})));
    const r = await callModel({ ...deps(c), maxRounds: 2 }, input(new ToolLog()));
    expect(r.rounds).toBe(2);
    expect(r.stopReason).toBe("max_rounds");
  });
  it("surfaces refusal", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } }]);
    const r = await callModel(deps(c), input(new ToolLog()));
    expect(r.stopReason).toBe("refusal");
    expect(r.reply).toBeNull();
  });
  it("throws when the served model differs", async () => {
    const c = fakeClient([textResponse(baseReply(), "claude-other")]);
    await expect(callModel(deps(c), input(new ToolLog()))).rejects.toThrow(/served model/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/model.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write model.ts**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ReplySchema, type Reply, type Usage, zeroUsage, addUsage } from "../types.js";
import { ToolLog } from "../tools/toolLog.js";
import { executeTool } from "../tools/execute.js";

export interface ClientLike { messages: { create(params: any): Promise<any> } }
export interface ModelDeps { client: ClientLike; model: string; effort: "low" | "medium" | "high"; maxRounds: number }
export interface ModelCallInput { system: Anthropic.TextBlockParam[]; user: string; tools: Anthropic.Tool[]; log: ToolLog }
export interface ModelCallResult {
  reply: Reply | null; rawText: string; stopReason: string; usage: Usage;
  rounds: number; latencyMs: number; servedModel: string; parseError: string | null;
}

export function createDeps(overrides: Partial<ModelDeps> = {}): ModelDeps {
  const effort = (process.env.EFFORT ?? "medium") as ModelDeps["effort"];
  return { client: new Anthropic(), model: process.env.MODEL ?? "claude-haiku-5-5", effort, maxRounds: 8, ...overrides };
}

function usageOf(u: any): Usage {
  return { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0 };
}

export async function callModel(deps: ModelDeps, input: ModelCallInput): Promise<ModelCallResult> {
  const system = input.system.map((b, i) => (i === 0 ? { ...b, cache_control: { type: "ephemeral" as const } } : b));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.user }];
  let usage = zeroUsage();
  let rounds = 0;
  let latencyMs = 0;
  let servedModel = "";
  let stopReason = "";
  let rawText = "";

  while (rounds < deps.maxRounds) {
    rounds++;
    const t0 = Date.now();
    const res = await deps.client.messages.create({
      model: deps.model,
      max_tokens: 8192,
      system,
      tools: input.tools,
      messages,
      output_config: { effort: deps.effort, format: zodOutputFormat(ReplySchema) },
    });
    latencyMs += Date.now() - t0;
    usage = addUsage(usage, usageOf(res.usage));
    servedModel = res.model ?? "";
    if (servedModel && !servedModel.startsWith(deps.model)) throw new Error(`served model ${servedModel} != requested ${deps.model}`);
    stopReason = res.stop_reason ?? "";

    if (stopReason === "refusal") return { reply: null, rawText: "", stopReason, usage, rounds, latencyMs, servedModel, parseError: "refusal" };

    const toolUses = (res.content as any[]).filter((b) => b.type === "tool_use");
    if (stopReason === "tool_use" && toolUses.length > 0) {
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
        type: "tool_result", tool_use_id: tu.id, content: executeTool(tu.name, tu.input, input.log),
      }));
      messages.push({ role: "user", content: results });
      continue;
    }

    rawText = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      const reply = ReplySchema.parse(JSON.parse(rawText));
      return { reply, rawText, stopReason, usage, rounds, latencyMs, servedModel, parseError: null };
    } catch (e) {
      return { reply: null, rawText, stopReason, usage, rounds, latencyMs, servedModel, parseError: String(e).slice(0, 300) };
    }
  }
  return { reply: null, rawText, stopReason: "max_rounds", usage, rounds, latencyMs, servedModel, parseError: "max_rounds" };
}
```

If `@anthropic-ai/sdk/helpers/zod` does not export `zodOutputFormat` in the installed version, run `grep -r "zodOutputFormat" node_modules/@anthropic-ai/sdk/helpers/` to find the right path and update the import.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/model.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Write the live smoke script**

`scripts/smoke.ts`:
```ts
import "dotenv/config";
import { createDeps, callModel } from "../src/pipeline/model.js";
import { ToolLog } from "../src/tools/toolLog.js";
import { TOOL_DEFINITIONS } from "../src/tools/schemas.js";

const deps = createDeps();
const log = new ToolLog();
const r = await callModel(deps, {
  system: [{ type: "text", text: "You are Alex, a patient coordinator for Doctours. Answer the question using tools when needed. Reply as the structured JSON object only. Plain text in response, no markdown." }],
  user: "What does Dr. Hakan Clinic cost?",
  tools: TOOL_DEFINITIONS,
  log,
});
console.log(JSON.stringify({ reply: r.reply, stopReason: r.stopReason, usage: r.usage, rounds: r.rounds, latencyMs: r.latencyMs, tools: log.calls.map((c) => c.name), parseError: r.parseError }, null, 2));
```

- [ ] **Step 7: Run the smoke script**

Run: `npm run smoke`
Expected: a JSON object with `reply.response` mentioning Sapphire, `tools` including `getClinicPackages`, `parseError: null`. If the API returns a 400 about `output_config.format` combined with tools, change `callModel` so that `format` is only sent on rounds where the previous round was not a tool call; if it still fails, send `format` only after the loop exits with `end_turn` via one extra call that carries the full `messages` and no `tools`. Record which variant worked in `docs/design.md` §4.7.

- [ ] **Step 8: Commit**

```bash
git add src/pipeline/model.ts tests/unit/model.test.ts tests/unit/fakeClient.ts scripts/smoke.ts
git commit -m "Add model call with tool loop and structured output"
git push
```

---

### Task 6: Baseline runner

**Files:**
- Create: `src/baseline/monolith.ts`, `tests/unit/baseline.test.ts`

**Interfaces:**
- Consumes: `callModel`, `renderBaselineSystem`, `renderUserMessage`, `TOOL_DEFINITIONS`, `ToolLog`.
- Produces: `runBaseline(ctx: Context, text: string, deps: ModelDeps, id?: string): Promise<{ reply: Reply; trace: Trace }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runBaseline } from "../../src/baseline/monolith.js";
import { buildContext } from "../../src/context/buildContext.js";
import { fakeClient, textResponse, baseReply } from "./fakeClient.js";

describe("runBaseline", () => {
  it("sends the full monolith and returns reply + trace", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "yes" }))]);
    const { reply, trace } = await runBaseline(buildContext(), "Is it free?", { client: c, model: "claude-haiku-5-5", effort: "medium", maxRounds: 4 }, "t1");
    expect(reply.response).toBe("yes");
    expect(trace.system).toBe("baseline");
    expect(trace.promptChars).toBeGreaterThan(50000);
    expect(c.calls[0].system[0].text).toContain("# IDENTITY");
    expect(trace.skillsLoaded).toEqual([]);
  });
  it("escalates when the model output cannot be parsed", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "??" }], usage: {} }]);
    const { reply, trace } = await runBaseline(buildContext(), "hi", { client: c, model: "claude-haiku-5-5", effort: "medium", maxRounds: 4 }, "t2");
    expect(reply.escalate).toBe(true);
    expect(trace.escalation.source).toBe("validator");
  });
});
```

- [ ] **Step 2: Write monolith.ts**

```ts
import type { Context } from "../context/buildContext.js";
import { renderBaselineSystem, renderUserMessage } from "../prompts.js";
import { TOOL_DEFINITIONS } from "../tools/schemas.js";
import { ToolLog } from "../tools/toolLog.js";
import { callModel, type ModelDeps } from "../pipeline/model.js";
import { unparseableReply } from "../pipeline/escalationReply.js";
import type { Reply, Trace } from "../types.js";

export async function runBaseline(ctx: Context, text: string, deps: ModelDeps, id = "msg"): Promise<{ reply: Reply; trace: Trace }> {
  const system = renderBaselineSystem(ctx);
  const log = new ToolLog();
  const r = await callModel(deps, { system: [{ type: "text", text: system }], user: renderUserMessage(ctx, text), tools: TOOL_DEFINITIONS, log });
  const trace: Trace = {
    id, system: "baseline", model: deps.model,
    escalation: { source: null, reason: null, category: null },
    skillsLoaded: [], toolsCalled: log.calls,
    validators: { passed: [], failed: [], autoFixed: [] },
    retried: false, subagents: [], usage: r.usage, latencyMs: r.latencyMs, rounds: r.rounds,
    promptChars: system.length, stopReason: r.stopReason, notes: [],
  };
  if (!r.reply) {
    const reason = r.stopReason === "refusal" ? "model_refusal" : `unparseable:${r.parseError}`;
    trace.escalation = { source: r.stopReason === "refusal" ? "refusal" : "validator", reason, category: null };
    return { reply: unparseableReply(reason), trace };
  }
  if (r.reply.escalate) trace.escalation = { source: "model", reason: r.reply.escalationReason, category: null };
  return { reply: r.reply, trace };
}
```

- [ ] **Step 3: Write escalationReply.ts now (Task 13 extends it)**

`src/pipeline/escalationReply.ts`:
```ts
import type { Reply } from "../types.js";

const base = (): Reply => ({
  response: "", escalate: true, escalationReason: null, templateId: null, intent: "hand off to a person",
  shouldFollowUp: false, followUpTiming: null, attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null,
});

export function unparseableReply(reason: string): Reply {
  return { ...base(), response: "I'll have a person pick this up for you.", escalationReason: reason };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/baseline.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/baseline src/pipeline/escalationReply.ts tests/unit/baseline.test.ts
git commit -m "Add baseline monolith runner"
git push
```

---

### Task 7: CLI

**Files:**
- Create: `src/cli.ts`, `tests/unit/cli.test.ts`

**Interfaces:**
- Produces: `npm run reply -- [--system new|baseline] [--in file] [--out file] [--trace file] [--model id]`. Reads a JSON array of `{id, text}` from `--in` or stdin. Writes a JSON array of `Reply` to `--out` or stdout. Traces go to `--trace` as JSON lines when given, else `results/traces.jsonl`.
- Exports `parseArgs(argv)`, `parseMessages(raw: string)` for tests. `runMessage` from Task 13 is imported lazily; until then `--system new` throws "not implemented".

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseArgs, parseMessages } from "../../src/cli.js";

describe("cli parsing", () => {
  it("parses flags with defaults", () => {
    const a = parseArgs(["--system", "baseline", "--in", "x.json"]);
    expect(a.system).toBe("baseline");
    expect(a.in).toBe("x.json");
    expect(parseArgs([]).system).toBe("new");
  });
  it("rejects a non-array", () => { expect(() => parseMessages('{"id":1}')).toThrow(/array/); });
  it("rejects an item without text", () => { expect(() => parseMessages('[{"id":"a"}]')).toThrow(/text/); });
  it("accepts a valid array", () => { expect(parseMessages('[{"id":"a","text":"hi"}]')).toEqual([{ id: "a", text: "hi" }]); });
});
```

- [ ] **Step 2: Write cli.ts**

```ts
import "dotenv/config";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { buildContext } from "./context/buildContext.js";
import { createDeps } from "./pipeline/model.js";
import { runBaseline } from "./baseline/monolith.js";
import type { Reply, Trace } from "./types.js";

const MessagesSchema = z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), text: z.string() }));

export function parseArgs(argv: string[]) {
  const out: Record<string, string> = { system: "new" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true"; }
  }
  return out as { system: string; in?: string; out?: string; trace?: string; model?: string };
}

export function parseMessages(raw: string) {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("input is not valid JSON"); }
  if (!Array.isArray(data)) throw new Error("input must be a JSON array of {id, text}");
  const r = MessagesSchema.safeParse(data);
  if (!r.success) throw new Error("each item needs a string text and an id: " + r.error.issues[0]?.message);
  return r.data;
}

export async function runAll(system: string, messages: { id: string; text: string }[], model?: string) {
  const deps = createDeps(model ? { model } : {});
  const ctx = buildContext();
  const replies: Reply[] = [];
  const traces: Trace[] = [];
  for (const m of messages) {
    const res = system === "baseline"
      ? await runBaseline(ctx, m.text, deps, m.id)
      : await (await import("./pipeline/runMessage.js")).runMessage(ctx, m.text, { deps, id: m.id });
    replies.push(res.reply);
    traces.push(res.trace);
  }
  return { replies, traces };
}

const isMain = process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const raw = args.in ? readFileSync(args.in, "utf8") : readFileSync(0, "utf8");
    const messages = parseMessages(raw);
    const { replies, traces } = await runAll(args.system, messages, args.model);
    const outJson = JSON.stringify(replies, null, 2);
    if (args.out) writeFileSync(args.out, outJson); else process.stdout.write(outJson + "\n");
    const tracePath = args.trace ?? "results/traces.jsonl";
    mkdirSync("results", { recursive: true });
    writeFileSync(tracePath, "");
    for (const t of traces) appendFileSync(tracePath, JSON.stringify(t) + "\n");
    process.stderr.write(`wrote ${replies.length} replies; traces in ${tracePath}\n`);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/cli.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Run the baseline live on the five packet messages**

Create `tests/packet-messages.json` with the five `{id, text}` items from packet lines 693–714 (ids `heva-packages`, `hakan-price`, `consultation`, `demand-human`, `charge-card`). Then:

Run: `mkdir -p results && npm run reply -- --system baseline --in tests/packet-messages.json --out results/baseline-packet.json --trace results/baseline-packet.traces.jsonl`
Expected: five replies written. Read them. Note which of the five the monolith gets right by the packet's grading rule; expect the two escalation cases to fail since the monolith has no escalation concept.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/unit/cli.test.ts tests/packet-messages.json results/baseline-packet.json results/baseline-packet.traces.jsonl
git commit -m "Add CLI and first baseline run on the packet messages"
git push
```

---

### Task 8: Pre-gate

**Files:**
- Create: `src/pipeline/pregate.ts`, `tests/unit/pregate.test.ts`

**Interfaces:**
- Produces: `type PregateCategory = "human_request" | "card_details" | "charge_request"`; `interface PregateResult { escalate: boolean; category: PregateCategory | null; reason: string | null; redactedText: string }`; `pregate(text: string): PregateResult`; `redactCardDigits(text): string`; `isQuestion(text): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pregate, redactCardDigits, isQuestion } from "../../src/pipeline/pregate.js";

const yes = (t: string, cat: string) => { const r = pregate(t); expect(r.escalate, t).toBe(true); expect(r.category, t).toBe(cat); };
const no = (t: string) => expect(pregate(t).escalate, t).toBe(false);

describe("pregate human_request", () => {
  it("fires on explicit requests for a person", () => {
    for (const t of [
      "I demand to talk to a human", "get me a real person please", "I want to speak with your manager",
      "stop the bot and connect me to a human", "is there a human I can talk to?", "can I speak to someone?",
      "let me talk to an actual person", "transfer me to an agent", "I need a human", "put me through to a representative",
    ]) yes(t, "human_request");
  });
  it("does not fire on look-alikes", () => {
    for (const t of [
      "is that humanly possible with 2800 grafts?", "my HR department asked about leave", "are you a bot or a real person?",
      "is it my own human hair that gets used?", "who am I talking to?", "do the doctors speak English?",
      "I'm a person who likes to plan ahead", "someone told me the price was $2,800", "what's your name?",
    ]) no(t);
  });
});

describe("pregate card", () => {
  it("fires on card digits in any format", () => {
    for (const t of [
      "Charge the deposit on my card ending in 4242 right now.", "my card is 4111 1111 1111 1111, go ahead",
      "4242-4242-4242-4242 exp 12/28", "here's my visa 4111111111111111", "card number 5555 4444 3333 2222",
    ]) yes(t, "card_details");
  });
  it("fires on imperative charge requests without digits", () => {
    for (const t of ["charge my card for the deposit", "run my card now", "just bill my credit card"]) yes(t, "charge_request");
  });
  it("does not fire on card questions", () => {
    for (const t of [
      "can I pay the deposit with my debit card?", "do you take credit cards?", "can I put it on my card?",
      "my phone number is 5555550123", "the assessment id is c3d4e5f6-3333-4333-8333-333333333333", "I have 2800 grafts estimated",
    ]) no(t);
  });
  it("redacts digits", () => {
    expect(redactCardDigits("card ending in 4242 and 4111 1111 1111 1111")).toBe("card ending in [redacted] and [redacted]");
    expect(pregate("charge my card ending in 4242").redactedText).not.toContain("4242");
  });
});

describe("isQuestion", () => {
  it("detects questions", () => {
    expect(isQuestion("can I pay by card?")).toBe(true);
    expect(isQuestion("Do you take cards")).toBe(true);
    expect(isQuestion("Charge my card now.")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pregate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write pregate.ts**

```ts
export type PregateCategory = "human_request" | "card_details" | "charge_request";
export interface PregateResult { escalate: boolean; category: PregateCategory | null; reason: string | null; redactedText: string }

const PERSON = "(?:human|real person|actual person|live person|person|someone|somebody|agent|representative|rep|operator|manager|supervisor|staff member|team member)";
const VERB = "(?:talk|speak|chat|connect|transfer|put me through|get me|give me|reach|escalate)";
// verb ... (to|with) ... person, within a short window; or need/want/demand + person without "to talk"
const HUMAN_PATTERNS = [
  new RegExp(`\\b${VERB}\\b[^.?!]{0,30}?\\b(?:to|with|through to)\\s+(?:a |an |the |your )?${PERSON}\\b`, "i"),
  new RegExp(`\\b(?:get me|give me|i need|i want|i demand|i'd like|send me)\\s+(?:a |an |the |your )?(?:real |actual |live )?(?:human|person|agent|representative|rep|operator|manager|supervisor)\\b`, "i"),
  /\b(?:stop|no more|not)\s+(?:the\s+)?(?:bot|ai|robot|automated)\b.*\b(?:human|person|agent)\b/i,
  /\bis there (?:a |an )?(?:human|real person|actual person|agent|representative)\b/i,
];
// questions about identity are not escalations
const IDENTITY = /\b(?:are you|is this|am i (?:talking|speaking|chatting) (?:to|with))\b[^.?!]{0,20}\b(?:a |an )?(?:bot|ai|robot|human|real person|person)\b/i;

const CARD_RUN = /\b(?:\d[ -]?){13,19}\b/;
const CARD_ENDING = /\b(?:card|visa|mastercard|amex|discover)\b[^.?!]{0,30}\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}\b\d{4}\b/i;
const CARD_NUMBER_LABEL = /\b(?:card|cc|visa|mastercard|amex)\s*(?:number|no\.?|#)?\s*(?:is|:)?\s*(?:\d[ -]?){12,19}/i;
const CHARGE = /\b(?:charge|run|process|bill|swipe|debit|take (?:the|my|it)?\s*(?:payment|deposit|money)?\s*(?:from|off|out of))\b[^.?!]{0,30}\b(?:my |the |this )?(?:card|credit card|debit card|visa|mastercard|amex)\b/i;
const CHARGE_SIMPLE = /\b(?:charge|run|bill|process)\s+(?:my|the|this)\s+(?:credit |debit )?card\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return /^(?:can|could|would|will|do|does|did|is|are|am|was|were|should|may|might|what|how|which|where|when|why|who)\b/i.test(t);
}

export function redactCardDigits(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[redacted]")
    .replace(/(\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}?)\b\d{4}\b/gi, "$1[redacted]");
}

export function pregate(text: string): PregateResult {
  const t = text.trim();
  const redactedText = redactCardDigits(t);

  if (CARD_RUN.test(t) || CARD_ENDING.test(t) || CARD_NUMBER_LABEL.test(t)) {
    return { escalate: true, category: "card_details", reason: "Patient shared card details or asked to charge a card number", redactedText };
  }
  if (!isQuestion(t) && (CHARGE.test(t) || CHARGE_SIMPLE.test(t))) {
    return { escalate: true, category: "charge_request", reason: "Asked to charge a card", redactedText };
  }
  if (!IDENTITY.test(t) && HUMAN_PATTERNS.some((p) => p.test(t))) {
    return { escalate: true, category: "human_request", reason: "Asked to talk to a human", redactedText };
  }
  return { escalate: false, category: null, reason: null, redactedText };
}
```

- [ ] **Step 4: Run tests and tune**

Run: `npx vitest run tests/unit/pregate.test.ts`
Expected: all pass. If a look-alike fires, tighten the regex that matched (print `HUMAN_PATTERNS.findIndex(p => p.test(t))` to see which). If a positive misses, add the phrasing to the second pattern's verb list rather than loosening the window. Never make "person" alone a trigger.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/pregate.ts tests/unit/pregate.test.ts
git commit -m "Add deterministic pre-gate for human requests and card details"
git push
```

---

### Task 9: Skill files parser and router

**Files:**
- Create: `src/pipeline/skills.ts`, `src/pipeline/router.ts`, `tests/unit/router.test.ts`, `tests/unit/fixtures/skills/` (three tiny skill files for the test)

**Interfaces:**
- Produces: `interface Skill { name: string; precedence: number; triggers: (string | RegExp)[]; stages: string[]; contextTriggers: string[]; body: string; file: string }`; `parseSkill(file, text): Skill`; `loadSkills(dir): Skill[]`; `stageSkillName(status): string`; `interface RouteResult { skills: Skill[]; stageSkill: string | null; matched: { skill: string; by: string }[] }`; `route(ctx: Context, text: string, all: Skill[]): RouteResult`.

Frontmatter format every skill file uses:

```
---
name: carecredit
precedence: 20
triggers: [carecredit, care credit, cherry, /\bcare\s*credit\b/i]
stages: []
context_triggers: []
---
<body>
```

Rules: `triggers` entries that start with `/` are regexes with flags after the last `/`; others match as case-insensitive whole-word phrases. `stages` non-empty restricts the skill to those pipeline statuses. `context_triggers` names predicates implemented in `router.ts`: `collection_outstanding`, `has_promo`, `stage_lead`, `always`.

- [ ] **Step 1: Write three fixture skills for the test**

`tests/unit/fixtures/skills/stage-lead.md`:
```
---
name: stage-lead
precedence: 10
triggers: []
stages: [LEAD]
context_triggers: [always]
---
LEAD body
```
`tests/unit/fixtures/skills/carecredit.md`:
```
---
name: carecredit
precedence: 20
triggers: [carecredit, care credit, /\bcherry\b/i]
stages: []
context_triggers: []
---
CareCredit body
```
`tests/unit/fixtures/skills/collection.md`:
```
---
name: collection
precedence: 30
triggers: [photo, photos]
stages: []
context_triggers: [collection_outstanding]
---
Collection body
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkills, parseSkill } from "../../src/pipeline/skills.js";
import { route, stageSkillName } from "../../src/pipeline/router.js";
import { buildContext } from "../../src/context/buildContext.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "skills");

describe("skills", () => {
  it("parses frontmatter with phrase and regex triggers", () => {
    const s = parseSkill("x.md", "---\nname: x\nprecedence: 5\ntriggers: [a b, /c\\d/i]\nstages: [LEAD, WAITING]\ncontext_triggers: []\n---\nbody");
    expect(s.name).toBe("x"); expect(s.precedence).toBe(5); expect(s.stages).toEqual(["LEAD", "WAITING"]);
    expect(s.triggers[0]).toBe("a b"); expect(s.triggers[1]).toBeInstanceOf(RegExp); expect(s.body).toBe("body");
  });
  it("loads a directory", () => { expect(loadSkills(dir).map((s) => s.name).sort()).toEqual(["carecredit", "collection", "stage-lead"]); });
});

describe("route", () => {
  const all = loadSkills(dir);
  it("maps status to a stage skill name", () => { expect(stageSkillName("PRE_CLINICAL_SENT")).toBe("stage-pre-clinical-sent"); });
  it("loads the stage skill and phrase matches, sorted by precedence", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "Do you take CareCredit?", all);
    expect(r.skills.map((s) => s.name)).toEqual(["stage-lead", "carecredit"]);
    expect(r.matched.find((m) => m.skill === "carecredit")?.by).toBe("carecredit");
  });
  it("regex trigger works and whole-word phrase does not match inside words", () => {
    expect(route(buildContext({ PIPELINE_STATUS: "LEAD" }), "cherry?", all).skills.some((s) => s.name === "carecredit")).toBe(true);
    expect(route(buildContext({ PIPELINE_STATUS: "LEAD" }), "photographic memory", all).skills.some((s) => s.name === "collection")).toBe(false);
  });
  it("context trigger loads collection when something is outstanding", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: "area unknown; name unknown; photos missing." }), "hi", all);
    expect(r.skills.some((s) => s.name === "collection")).toBe(true);
    const r2 = route(buildContext({ PIPELINE_STATUS: "LEAD" }), "hi", all);
    expect(r2.skills.some((s) => s.name === "collection")).toBe(false);
  });
  it("unknown stage loads no stage skill and says so", () => {
    const r = route(buildContext({ PIPELINE_STATUS: "BOOKED" }), "hi", all);
    expect(r.stageSkill).toBeNull();
    expect(r.skills.length).toBe(0);
  });
});
```

- [ ] **Step 3: Write skills.ts**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Skill { name: string; precedence: number; triggers: (string | RegExp)[]; stages: string[]; contextTriggers: string[]; body: string; file: string }

function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  // split on commas that are not inside a /regex/
  const out: string[] = []; let cur = ""; let inRe = false;
  for (const ch of inner) {
    if (ch === "/" ) inRe = !inRe && cur.trim() === "" ? true : (inRe && !cur.endsWith("\\") ? false : inRe);
    if (ch === "," && !inRe) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function toTrigger(s: string): string | RegExp {
  const m = s.match(/^\/(.+)\/([a-z]*)$/);
  return m ? new RegExp(m[1], m[2].includes("i") ? m[2] : m[2] + "i") : s.toLowerCase();
}

export function parseSkill(file: string, text: string): Skill {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  if (!fm.name) throw new Error(`${file}: frontmatter needs name`);
  return {
    name: fm.name, precedence: Number(fm.precedence ?? 50),
    triggers: parseList(fm.triggers ?? "[]").map(toTrigger),
    stages: parseList(fm.stages ?? "[]"), contextTriggers: parseList(fm.context_triggers ?? "[]"),
    body: m[2].trim(), file,
  };
}

export function loadSkills(dir: string): Skill[] {
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => parseSkill(f, readFileSync(join(dir, f), "utf8")));
}
```

- [ ] **Step 4: Write router.ts**

```ts
import type { Context } from "../context/buildContext.js";
import type { Skill } from "./skills.js";

export interface RouteResult { skills: Skill[]; stageSkill: string | null; matched: { skill: string; by: string }[] }

export function stageSkillName(status: string): string { return "stage-" + status.toLowerCase().replace(/_/g, "-"); }

const CONTEXT_PREDICATES: Record<string, (ctx: Context) => boolean> = {
  always: () => true,
  collection_outstanding: (ctx) => !/everything is collected/i.test(ctx.COLLECTION_STATUS) || ctx.PIPELINE_STATUS === "LEAD",
  has_promo: (ctx) => ctx.PROMO_OFFER !== null,
  stage_lead: (ctx) => ctx.PIPELINE_STATUS === "LEAD",
};

function phraseMatches(phrase: string, text: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i").test(text);
}

export function route(ctx: Context, text: string, all: Skill[]): RouteResult {
  const stageName = stageSkillName(ctx.PIPELINE_STATUS);
  const matched: { skill: string; by: string }[] = [];
  const chosen = new Map<string, Skill>();
  for (const s of all) {
    if (s.stages.length && !s.stages.includes(ctx.PIPELINE_STATUS)) continue;
    if (s.name === stageName) { chosen.set(s.name, s); matched.push({ skill: s.name, by: "stage" }); continue; }
    if (s.name.startsWith("stage-")) continue;
    const ctxHit = s.contextTriggers.find((c) => CONTEXT_PREDICATES[c]?.(ctx));
    if (ctxHit) { chosen.set(s.name, s); matched.push({ skill: s.name, by: `context:${ctxHit}` }); continue; }
    const hit = s.triggers.find((t) => (t instanceof RegExp ? t.test(text) : phraseMatches(t, text)));
    if (hit !== undefined) { chosen.set(s.name, s); matched.push({ skill: s.name, by: String(hit) }); }
  }
  const skills = [...chosen.values()].sort((a, b) => a.precedence - b.precedence || a.name.localeCompare(b.name));
  return { skills, stageSkill: chosen.has(stageName) ? stageName : null, matched };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/router.test.ts`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/skills.ts src/pipeline/router.ts tests/unit/router.test.ts tests/unit/fixtures
git commit -m "Add skill file parser and deterministic router"
git push
```

---

### Task 10: Cut the skill files out of the packet

**Files:**
- Create: `scripts/extract-skills.sh`, `skills/*.md` (30 files), `tests/unit/skillfiles.test.ts`
- Modify: `src/pipeline/router.ts` (stage alias)

**Interfaces:**
- Consumes: `parseSkill`, `loadSkills`, `route`.
- Produces: the `skills/` directory the router loads at runtime. `SKILLS_DIR` from `src/prompts.ts` points at it.

Precedence bands: hard rules 20, guidance 30, stage 40. Lower loads first and wins unstated conflicts. Stage goes last so a specific policy beats general stage guidance.

- [ ] **Step 1: Add the stage alias to router.ts**

Replace `stageSkillName` with:
```ts
const STAGE_ALIAS: Record<string, string> = { MEETING_COMPLETED: "MEETING_BOOKED" };
export function stageSkillName(status: string): string {
  const s = STAGE_ALIAS[status] ?? status;
  return "stage-" + s.toLowerCase().replace(/_/g, "-");
}
```
Run `npx vitest run tests/unit/router.test.ts` to confirm nothing broke.

- [ ] **Step 2: Write scripts/extract-skills.sh**

The script takes the packet path and writes every skill. Line ranges refer to the packet. `mk` writes frontmatter, then each range in order, separated by a blank line.

```bash
#!/usr/bin/env bash
# Cuts the original monolithic prompt into skill files. Usage: scripts/extract-skills.sh path/to/packet.md
set -euo pipefail
P="${1:?packet path}"
mkdir -p skills
mk() { # name precedence triggers stages ctx ranges...
  local name="$1" prec="$2" trig="$3" stages="$4" ctx="$5"; shift 5
  {
    printf -- '---\nname: %s\nprecedence: %s\ntriggers: [%s]\nstages: [%s]\ncontext_triggers: [%s]\n---\n' "$name" "$prec" "$trig" "$stages" "$ctx"
    for r in "$@"; do sed -n "${r}p" "$P"; echo; done
  } > "skills/$name.md"
}

# ---- stage skills (40) ----
mk stage-lead 40 "" "LEAD" "" 1250,1255
mk stage-prep-pre-clinical 40 "" "PREP_PRE_CLINICAL" "" 1256,1263
mk stage-pre-clinical-sent 40 "" "PRE_CLINICAL_SENT" "" 1264,1325
mk stage-meeting-booked 40 "" "MEETING_BOOKED, MEETING_COMPLETED" "" 1326,1337
mk stage-meeting-missed 40 "" "MEETING_MISSED" "" 1338,1340
mk stage-waiting 40 "" "WAITING" "" 1341,1343

# ---- hard rules (20) ----
mk financing-geography 20 "financing, finance, financed, instalment, instalments, installment, installments, monthly, monthly payments, payment plan, spread the cost, pay over time, klarna, paypal, affirm, afterpay, pay later, split it" "" "" 809,820
mk health-insurance 20 "insurance, insurer, medicare, medicaid, hmo, ppo, covered by, coverage, hsa, fsa, claim, reimburse, reimbursement" "" "" 821,841
mk carecredit 20 "carecredit, care credit, cherry" "" "" 842,861
mk clinic-website 20 "website, web site, webpage, web page, site, url, link to, their page, official page, homepage" "" "" 862,875
mk payment-and-deposit 20 "pay, paying, payment, payments, deposit, checkout, link, layaway, refund, refundable, cancel, cancellation, price lock, locked in, balance, owe, due, cash, card, wire, bank transfer, zelle, venmo, book now, ready to book, how do i book, secure a date, lock in, pay from" "" "" 1439,1451 1436,1438 1025,1028
mk promo 20 "promo, promotion, promotions, discount, discounts, coupon, code, deal, offer, sale, cheaper, price match, special" "" "has_promo" 1523,1529
mk deposit-eligibility 20 "already paid, paid directly, paid the clinic, paid a deposit to, paid them, put down a deposit with" "" "" 1030,1037
mk clinic-and-package-facts 20 "package, packages, price, prices, pricing, cost, costs, how much, silver, gold, sapphire, diamond, vip, include, included, includes, inclusion, hotel, night, nights, addon, add-on, add on, upgrade, afro, 4c, curly, textured, black hair, speciality, specialty, specialize, specializes, surgeon, doctor, incision, incisions, technician, clinic, clinics, heva, hakan, saturday, sunday, monday, weekday, weekend, what days, operate on, worth it, difference between, compare, finasteride, minoxidil, dental, veneer, veneers, teeth, hair type" "" "" 960,990 1212,1247 1387,1396 1430,1430 1456,1460
mk clinic-status-tiers 20 "recommend, recommended, not recommend, tijuana, cancun, cancún, mexico, turkey, istanbul, miami, location, city, country, where are, do you have a clinic, other clinics, any clinic in, which clinics" "" "" 1369,1386
mk assessment 20 "assessment, graft, grafts, hairline drawing, drawing, my plan, the plan, revise, revision, redraw, lower the hairline, when will, ready yet, any update, update on, resend, send it again, open it, link again, norwood, hair loss scale, donor" "" "" 1431,1435 1003,1003
mk image-delay 20 "weave, sew-in, sew in, braids, wig, hair system, shaved, buzzed, can't take photos, cant take photos, can't send photos, can't upload, cant upload, later tonight, this weekend, when i can, after work" "" "" 1344,1361
mk time-bound-pause 20 "need time, need some time, think about it, thinking about it, not ready, not sure yet, save up, saving, saving up, funds, money together, get things in order, sort things out, let me review, look over, look this over, get back to you, be in touch, in contact, keep you updated, decided to wait, hold off, wait a bit, few months, next month, check back, follow up with me, ping you, when i'm ready, when i am ready, not yet, still deciding, still looking" "" "" 1170,1211
mk consultation 20 "consultation, consult, call, phone, phone call, reschedule, appointment, book a call, talk on the phone, video, zoom, call me, callback, call back, ring me" "" "" 1453,1455 1362,1368 1406,1408
mk off-channel-requests 20 "send me, email, e-mail, letter, document, documents, pdf, note, flag, contact, reach out, hold, hold a date, hold the date, driver, book it, arrange, forward, check with, ask the clinic, tell the clinic, message the clinic, my photos back, attach, invoice, receipt, pin, location, call the clinic, whatsapp, phone number, their number, contact details, on my behalf" "" "" 894,928
mk policy-grounding 20 "pay, payment, deposit, balance, financing, instalment, installment, insurance, carecredit, cherry, lock, locked, availability, available, video, portal, airport, transfer, drive, minutes, far, close, how does it work" "" "" 929,953
mk creator-partnership 20 "influencer, creator, collab, collaboration, partnership, sponsor, sponsored, followers, media kit, content creator, instagram, tiktok, youtube, promote, brand deal, ambassador, affiliate" "" "" 954,959
mk fertility 20 "ivf, fertility, egg freezing, embryo, embryos, sperm, iui, surrogacy" "" ""

# ---- guidance (30) ----
mk collection 30 "photo, photos, picture, pictures, upload, uploaded, image, images" "" "collection_outstanding" 788,808 1016,1018 1043,1051 1052,1057 1058,1067 1068,1100 1101,1133
mk reversibility 30 "change my mind, torn, between, not sure, what if, final, locked, lock, commit, permanent, switch, transfer, move my deposit, pick wrong, wrong choice, regret, stuck with, flexible, change later, change the date, move the date, reschedule the procedure" "" "" 1134,1169
mk direct-clinic-quote 30 "quoted, quote, their price was, told me it would cost, offered me" "" "" 1038,1042
mk travel 30 "passport, flight, flights, fly, flying, airport, travel, traveling, travelling, stay, how long, how many days, how many nights, itinerary, arrive, arrival, depart, visa, trip, istanbul, turkey, transfer, driver, pickup, pick up" "" "" 1397,1405 1427,1429
mk preferences-and-dates 30 "january, february, march, april, may, june, july, august, september, october, november, december, spring, summer, fall, autumn, winter, next month, in a few months, thinking about going, planning, want to go in, go with, leaning, interested in, prefer, torn between, decided on, let's do, i'll go with, sounds good, is the one, probably" "" "" 1413,1414 1437,1437
mk why-doctours 30 "why doctours, why you, why not book direct, directly with the clinic, what do you offer, difference, vs booking, why should i, benefit" "" "" 1452,1452
mk recovery 30 "hat, cap, beanie, scarf, hood, headband, hijab, wrap, cover my head, recovery, recover, after surgery, after the procedure, post-op, post op, shedding, shed, wash, scab, scabs, swelling, pain, sleep, work after, how long does the procedure, how long is the surgery, hours" "" "" 1002,1002

echo "wrote $(ls skills | wc -l) skills"
```

Then overwrite the fertility body (it has no packet source). Append to `skills/fertility.md`:
```
# FERTILITY (SECOND CARE LINE — STUB)
Doctours' fertility line is not live in this system yet. If the patient asks about IVF, egg freezing, embryo transfer, IUI, or surrogacy: say plainly that you don't have fertility details here yet, and that you can keep helping with their hair transplant questions. Do not describe fertility pricing, clinics, success rates, or timelines. Do not promise a follow-up.
This file exists to show that a new line of care is a new skill directory entry with its own triggers and tests, not a paste into the hair-transplant rules.
```

- [ ] **Step 3: Run the script and eyeball every file**

Run: `bash scripts/extract-skills.sh pre-deposit-respond-packet.md && for f in skills/*.md; do echo "== $f"; sed -n '8p' "$f" | cut -c1-80; done`
Expected: 30 files. The 8th line of each (first body line) must be a section header like `# FINANCING GEOGRAPHY (HARD RULE — Klarna/PayPal)` or the first bullet of an OPERATIONAL item. If one shows the tail of a previous section, fix the range in the script and rerun. Ranges to double check against the packet: `sed -n '1413,1414p'` must be the updateUserClinicPreferences and tentative-dates bullets of TOOL USAGE; `1437` must be the tentative-timing bullet of Scheduling; `1002` the head-covering bullet; `1003` the assessment-turnaround bullet; `1025,1028` the payment-link bullets of STRUCTURED OUTPUT FIELDS.

- [ ] **Step 4: Write the failing test**

`tests/unit/skillfiles.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadSkills } from "../../src/pipeline/skills.js";
import { route } from "../../src/pipeline/router.js";
import { buildContext } from "../../src/context/buildContext.js";
import { SKILLS_DIR } from "../../src/prompts.js";

const all = loadSkills(SKILLS_DIR);
const names = (text: string, over = {}) => route(buildContext(over), text, all).skills.map((s) => s.name);

describe("skill files", () => {
  it("all parse, names unique, bodies non-empty, no expected-reply leakage", () => {
    expect(all.length).toBe(30);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
    for (const s of all) {
      expect(s.body.length, s.name).toBeGreaterThan(40);
      expect(s.body, s.name).not.toMatch(/15 to 20 minutes|I'm getting a person for you/);
    }
  });
  it("every stage has a skill", () => {
    for (const st of ["LEAD", "PREP_PRE_CLINICAL", "PRE_CLINICAL_SENT", "MEETING_BOOKED", "MEETING_COMPLETED", "MEETING_MISSED", "WAITING"]) {
      expect(route(buildContext({ PIPELINE_STATUS: st }), "hi", all).stageSkill, st).not.toBeNull();
    }
  });
  it("routes the packet-shaped questions sensibly", () => {
    const a = names("I'm leaning toward Heva. What packages do they have, and can I pay from the assessment? I have 4C curls, does Heva do afro hair?");
    expect(a).toContain("stage-pre-clinical-sent"); expect(a).toContain("clinic-and-package-facts");
    expect(a).toContain("payment-and-deposit"); expect(a).toContain("assessment");
    expect(names("What does Dr. Hakan Clinic cost?")).toContain("clinic-and-package-facts");
    expect(names("Is the consultation free?")).toContain("consultation");
    expect(names("do you take carecredit?")).toContain("carecredit");
    expect(names("I have a sew-in right now")).toContain("image-delay");
  });
  it("a short unrelated message loads only the stage skill", () => {
    expect(names("ok thanks")).toEqual(["stage-pre-clinical-sent"]);
  });
  it("fertility loads alone with the stage, no hair skills", () => {
    const r = names("do you do IVF?");
    expect(r).toContain("fertility");
    expect(r).not.toContain("clinic-and-package-facts");
  });
  it("collection loads only when something is outstanding", () => {
    expect(names("hi")).not.toContain("collection");
    expect(names("hi", { PIPELINE_STATUS: "LEAD", COLLECTION_STATUS: "area unknown; name unknown; photos missing." })).toContain("collection");
  });
  it("precedence puts hard rules before guidance before stage", () => {
    const r = names("I'm torn between Silver and Gold, what's the price?");
    expect(r.indexOf("clinic-and-package-facts")).toBeLessThan(r.indexOf("reversibility"));
    expect(r.indexOf("reversibility")).toBeLessThan(r.indexOf("stage-pre-clinical-sent"));
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/skillfiles.test.ts`
Expected: 7 passed. If "ok thanks" loads more than the stage, find the trigger that matched (`route(...).matched`) and remove that over-broad phrase.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-skills.sh skills tests/unit/skillfiles.test.ts src/pipeline/router.ts
git commit -m "Cut the monolith into 30 skill files with triggers and precedence"
git push
```

---

### Task 11: Core prompt

**Files:**
- Create: `prompts/core.md`, `tests/unit/core.test.ts`

**Interfaces:**
- Produces: `prompts/core.md`, loaded by `loadPrompt("core")`. It has no placeholders; everything patient-specific goes in the context block (Task 12).

- [ ] **Step 1: Write prompts/core.md**

```
# WHO YOU ARE
You are the patient-facing coordinator for Doctours, a medical tourism platform for hair transplants. You write every message in the first person as the coordinator named in the context block. The patient sees one person: you.

Never describe your limits in terms of the channel. Do not say "from this chat", "over text", "in this thread", or "on my end here". When you cannot do something, say so as a person whose role does not cover it, and say what the patient can do instead.
- BAD: "I can't change your procedure date from this chat."
- GOOD: "Changing a procedure date isn't something I can do directly once it's booked."

# WHAT YOU DO EACH TURN
Answer what the patient asked, in full, then stop. If they asked three things, answer all three. Do not add rapport questions, nudges toward the deposit, or information they did not ask about. Only the loaded policy sections below may add a question or a next step on top of the answer; outside those, ask a question only when you need it to answer.

Size the reply to the message. A few words from the patient get one or two lines. A simple factual question gets the answer in one to three lines and nothing else. Save structure for substantive messages.

Always reply in English, whatever language the patient writes in.

# VOICE AND FORMAT
Plain text only. The reply is sent over SMS. No markdown: no **, no __, no #, no bullet markers, no backticks.
Name things. Say "hair transplant", "Heva", "recovery", not "it", "that clinic", "the process".
Do not open by restating the patient's message back to them. Do not reuse an opener a recent coordinator message used.
If your reply includes a URL, put it on its own line as the last line, after everything else. Say "using the link below" in the body. Several URLs stack at the end, one per line. Never a URL mid-sentence.
Do not resend a link that already appears in the recent conversation unless the patient asks for it again.

# GROUNDING
Every package, clinic, price, deposit, addon, doctor, link, and policy fact you state must come from a tool result in this turn or from a loaded section of this prompt. If neither has it, say you don't have that detail. Never invent, round, or guess a URL, price, slug, ID, date, drive time, or airport. Chat history and memory are not sources for package facts; call the tool again.
Clinic speciality (afro, 4C, curly, textured hair) is answered from the Clinic flags in the context block, never from package names.
Only state a URL a tool returned this turn, or one of the fixed links listed under TOOLS AND LINKS.

# WHAT YOU CANNOT DO
You can only write this one reply. You cannot send, attach, or retrieve documents; make or schedule calls; send emails; contact the clinic, hotel, or medical team; edit the assessment; hold a date; check live availability; apply a discount; or trigger any workflow. Never say you will "send", "check on", "look into", "flag", "note in the assessment", "get back to you", or "follow up" on something you have no tool for. Never say a coordinator or team member will reach out. Either answer now, or say plainly what you cannot do and what the patient can do instead.
Allowed: sending a payment or checkout link from getPaymentLink; telling the patient they can book and pay the deposit from their assessment; confirming a check-in the patient asked for; saying you have "noted" a stable preference.

# WHEN TO HAND OFF TO A PERSON
Set escalate to true, give a short escalationReason, and make the response one short sentence that says a person will take over. Do not answer the underlying question and do not pretend anything was done. Hand off when:
- the patient asks for a human, a person, an agent, or a manager;
- they ask you to charge a card, share card digits, move or refund money already paid, or change an existing booking;
- they ask you to contact the clinic on their behalf, hold or reserve a date, or ask a second time for the clinic's phone, WhatsApp, or email;
- they ask for a price adjustment or a discount you cannot verify and will not drop it;
- no tool and no loaded section can do what they asked.
Do not hand off for ordinary questions, payment or checkout link requests, consultation booking, or anything a tool can answer.

# CONFLICTS
Policy sections are loaded below in priority order. If two sections disagree, the one that appears first wins, unless a section says explicitly that it overrides another.

# OUTPUT FIELDS
You return one JSON object. Fields:
- response: the plain-text reply.
- escalate: true only when a person must take over. escalationReason: short reason when true, null otherwise.
- templateId: always null.
- intent: one short phrase for what the reply does.
- shouldFollowUp / followUpTiming: true and a human interval ("1 month", "2 weeks", "a few hours") only when the conversation set a concrete check-in point; otherwise false and null.
- attachmentUrls: at most 3, only URLs a tool returned this turn, only when the patient asked for their own photos; else null.
- highEngagement: true when the message is substantive, specific, or close to a decision.
- workingMemoryUpdates: only the fields that changed this turn (patientName, procedureArea, keyConcerns, communicationStyle, preferredPaymentMethod, targetProcedureWindow, promisesMade, escalationFlags, collectionState); null when nothing changed. Tentative procedure dates go through updateUserClinicPreferences, not here.

# TOOLS AND LINKS
Call tools before stating facts. Call them in parallel when independent.
- getPatientContext: profile, pipeline status, saved clinic and package selection, tentative dates. Ground truth over memory.
- getSavedClinics: the clinics recommended in the assessment (only once the assessment has been sent).
- getAllClinics: all partner clinics with id, slug, address, clinic_flags, ai_context.
- getClinicPackages: packages, basePrice, depositAmount, currency, bookableWeekdays, includedAddons, aiContext for one clinic. Call it before any price, deposit, inclusion, or bookable-day claim.
- getClinicDoctors: doctors at a clinic.
- getLatestAssessment: the patient's assessment URL and graft range. Only paste the returned assessmentUrl.
- getPatientImages: which intake angles are uploaded, with hosted URLs.
- getPaymentLink: type "payment" with clinicPackageId for a chosen package; type "checkout" with clinicId when the clinic is chosen but the package is not. Paste the returned url only when status is "ready".
- getConsultationRescheduleLink: reschedule link for the free consultation call only.
- getFullCalls: call transcripts; only when the message is about a recent call.
- issuePromoCode: only when the context block says a promo is active for this patient.
- updateUser: save the patient's name when they give it.
- updateUserClinicPreferences: save selectedClinicId / selectedPackageId (a single lean counts as selected), softClinicInterestIds / softPackageInterestIds when torn, and tentativeProcedureDates {text, strength}. IDs must come from a tool this turn.
- updateWorkingMemory: optional; the workingMemoryUpdates field is preferred.
Fixed links you may send without a tool: image upload https://www.doctours.com/image-upload ; book a consultation https://www.doctours.com/consultation ; a clinic's Doctours page https://www.doctours.com/clinic/{slug} using a slug a tool returned this turn.

# IDENTITY QUESTIONS
If the patient asks your name, who you are, or whether you are the coordinator: "I'm {coordinator name}, your Patient Care Coordinator at Doctours." That is not a hand-off.
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadPrompt } from "../../src/prompts.js";

describe("core prompt", () => {
  const core = loadPrompt("core");
  it("is small", () => { expect(core.split(/\s+/).length).toBeLessThan(1400); });
  it("has no template placeholders", () => { expect(core).not.toMatch(/\{\{[A-Z_]+\}\}/); });
  it("covers escalation, grounding, output fields and link placement", () => {
    for (const h of ["# WHEN TO HAND OFF", "# GROUNDING", "# OUTPUT FIELDS", "last line", "# CONFLICTS"]) expect(core).toContain(h);
  });
  it("does not contain any expected-reply text", () => {
    expect(core).not.toMatch(/15 to 20 minutes|getting a person for you|Sapphire, at/);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/core.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add prompts/core.md tests/unit/core.test.ts
git commit -m "Add the always-loaded core prompt"
git push
```

---

### Task 12: Prompt assembly

**Files:**
- Create: `src/pipeline/assemble.ts`, `tests/unit/assemble.test.ts`

**Interfaces:**
- Consumes: `Skill`, `Context`, `renderPatientSummary`.
- Produces: `renderContextBlock(ctx, extras: string[]): string`; `assembleSystem(core: string, skills: Skill[], ctx: Context, extras?: string[]): Anthropic.TextBlockParam[]` returning exactly two blocks: `[core]` and `[skills + context]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { assembleSystem, renderContextBlock } from "../../src/pipeline/assemble.js";
import { buildContext } from "../../src/context/buildContext.js";

const skill = (name: string, body: string, precedence = 20) => ({ name, body, precedence, triggers: [], stages: [], contextTriggers: [], file: name + ".md" });

describe("assemble", () => {
  it("returns core first, then skills and context", () => {
    const blocks = assembleSystem("CORE", [skill("a", "A body"), skill("b", "B body")], buildContext());
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe("CORE");
    expect(blocks[1].text.indexOf("A body")).toBeLessThan(blocks[1].text.indexOf("B body"));
    expect(blocks[1].text).toContain("# Patient Summary");
    expect(blocks[1].text).toContain("Jordan Hale");
    expect(blocks[1].text).toContain("Speciality=Afro Hair");
    expect(blocks[1].text).toContain("September 27, 2026");
  });
  it("includes extras such as a subagent summary", () => {
    const b = renderContextBlock(buildContext(), ["# Call summary\nthey discussed 4C hair"]);
    expect(b).toContain("they discussed 4C hair");
  });
  it("says no promo when PROMO_OFFER is null and shows it otherwise", () => {
    expect(renderContextBlock(buildContext(), [])).toContain("Promo: none");
    expect(renderContextBlock(buildContext({ PROMO_OFFER: "$200 off, code X" }), [])).toContain("$200 off");
  });
});
```

- [ ] **Step 2: Write assemble.ts**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { renderPatientSummary, type Context } from "../context/buildContext.js";
import type { Skill } from "./skills.js";

export function renderContextBlock(ctx: Context, extras: string[] = []): string {
  const parts = [
    `# Patient Summary\n${renderPatientSummary(ctx)}`,
    `# Clinic flags\nSource of truth for Speciality and Practice type. "Afro Hair" means that clinic is an afro-hair specialist. Answer hair-type questions from here, not from package names.\n${ctx.CLINIC_FLAGS}`,
    `# Stage\nPipeline Status: ${ctx.PIPELINE_STATUS}\nCollection Status: ${ctx.COLLECTION_STATUS}\nAssessment clinic recommendations: ${ctx.SAVED_CLINIC_COUNT} (getSavedClinics)\nPatient images: ${ctx.PATIENT_IMAGE_COUNT} uploaded (getPatientImages)\nPromo: ${ctx.PROMO_OFFER ?? "none. Do not state, confirm, or deny any discount; answer the price question instead."}`,
    `# Working memory\n${ctx.WORKING_MEMORY}`,
    `# Recent calls\n${ctx.RECENT_CALLS || "none"}`,
    ...extras,
    `# Recent conversation (canonical transcript)\n${ctx.CHAT_LIST || "(no messages yet)"}`,
    `# This turn\nCurrent date/time: ${ctx.CURRENT_DATETIME}\nCoordinator name: ${ctx.COORDINATOR_DISPLAY_NAME}\nChat kind: ${ctx.CHAT_KIND}\nTriggering sender: ${ctx.SENDER_DISPLAY_NAME} (${ctx.SENDER_PARTICIPANT_ROLE})`,
  ];
  return parts.join("\n\n");
}

export function assembleSystem(core: string, skills: Skill[], ctx: Context, extras: string[] = []): Anthropic.TextBlockParam[] {
  const policy = skills.length
    ? `# LOADED POLICY SECTIONS (priority order)\n\n${skills.map((s) => `<!-- skill: ${s.name} -->\n${s.body}`).join("\n\n")}`
    : "# LOADED POLICY SECTIONS\n(none for this message)";
  return [
    { type: "text", text: core },
    { type: "text", text: `${policy}\n\n# CONTEXT\n\n${renderContextBlock(ctx, extras)}` },
  ];
}
```

- [ ] **Step 3: Run tests, commit**

Run: `npx vitest run tests/unit/assemble.test.ts` → 3 passed.
```bash
git add src/pipeline/assemble.ts tests/unit/assemble.test.ts
git commit -m "Add prompt assembly with cached core and dynamic context"
git push
```

---

### Task 13: Validators and escalation replies

**Files:**
- Create: `src/pipeline/validators.ts`, `tests/unit/validators.test.ts`
- Modify: `src/pipeline/escalationReply.ts`

**Interfaces:**
- Produces: `interface Violation { name: string; detail: string }`; `validate(reply: Reply, log: ToolLog, ctx: Context): Violation[]`; `autoFix(reply: Reply): { reply: Reply; fixed: string[] }`; `STATIC_URL_ALLOWLIST`; `handoffReply(category: PregateCategory, reason: string): Reply`.

Validator names: `plainText`, `urlLastLine`, `urlProvenance`, `priceProvenance`, `noCardDigits`, `escalationShape`, `fieldSanity`, `bannedPhrases`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validate, autoFix } from "../../src/pipeline/validators.js";
import { handoffReply } from "../../src/pipeline/escalationReply.js";
import { ToolLog } from "../../src/tools/toolLog.js";
import { executeTool } from "../../src/tools/execute.js";
import { buildContext } from "../../src/context/buildContext.js";
import { baseReply } from "./fakeClient.js";

const ctx = buildContext();
const names = (r: any, log = new ToolLog()) => validate(r, log, ctx).map((v) => v.name);

describe("validators", () => {
  it("flags markdown", () => { expect(names(baseReply({ response: "**Hi** there" }))).toContain("plainText"); });
  it("flags a URL that is not the last line", () => {
    expect(names(baseReply({ response: "See https://www.doctours.com/consultation for details." }))).toContain("urlLastLine");
    expect(names(baseReply({ response: "Book here using the link below.\nhttps://www.doctours.com/consultation" }))).not.toContain("urlLastLine");
  });
  it("flags URLs not returned by a tool or allowlisted", () => {
    expect(names(baseReply({ response: "ok\nhttps://www.doctours.com/payment/made-up" }))).toContain("urlProvenance");
    const log = new ToolLog(); executeTool("getLatestAssessment", {}, log);
    expect(names(baseReply({ response: "ok\nhttps://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333" }), log)).not.toContain("urlProvenance");
    expect(names(baseReply({ response: "ok\nhttps://www.doctours.com/image-upload" }))).not.toContain("urlProvenance");
  });
  it("flags a URL the patient pasted that no tool returned", () => {
    expect(names(baseReply({ response: "Here it is\nhttps://esthetichairmiami.com/" }))).toContain("urlProvenance");
  });
  it("flags prices no tool returned, allows tool prices and the $25 fee", () => {
    expect(names(baseReply({ response: "Silver is $2,900." }))).toContain("priceProvenance");
    const log = new ToolLog(); executeTool("getClinicPackages", { clinicName: "Heva" }, log);
    expect(names(baseReply({ response: "Silver is $3,000 USD with a $500 deposit. Cancellation fee is $25." }), log)).not.toContain("priceProvenance");
    expect(names(baseReply({ response: "Silver is 3000 USD." }), log)).not.toContain("priceProvenance");
  });
  it("flags card digits", () => {
    expect(names(baseReply({ response: "I can't charge the card ending in 4242." }))).toContain("noCardDigits");
    expect(names(baseReply({ response: "I can't charge 4242424242424242." }))).toContain("noCardDigits");
  });
  it("checks escalation shape both ways", () => {
    expect(names(baseReply({ escalate: true, escalationReason: null, response: "A person will help." }))).toContain("escalationShape");
    expect(names(baseReply({ escalate: true, escalationReason: "x", response: "One. Two. Three. Four." }))).toContain("escalationShape");
    expect(names(baseReply({ escalate: false, escalationReason: "x" }))).toContain("escalationShape");
    expect(names(baseReply({ escalate: true, escalationReason: "x", response: "I'll get a person to help you." }))).not.toContain("escalationShape");
  });
  it("checks field sanity", () => {
    expect(names(baseReply({ templateId: "t" }))).toContain("fieldSanity");
    expect(names(baseReply({ attachmentUrls: ["https://a", "https://b", "https://c", "https://d"] }))).toContain("fieldSanity");
    expect(names(baseReply({ attachmentUrls: ["https://assets.example.invalid/x.jpg"] }))).toContain("fieldSanity");
  });
  it("bans turnaround promises only when about the assessment, and stalling phrases always", () => {
    expect(names(baseReply({ response: "Your assessment should be ready in a few hours." }))).toContain("bannedPhrases");
    expect(names(baseReply({ response: "The clinic confirms the date within 24 hours of the deposit." }))).not.toContain("bannedPhrases");
    expect(names(baseReply({ response: "I'll get back to you on that." }))).toContain("bannedPhrases");
    expect(names(baseReply({ response: "Bring a loose cap for afterwards." }))).toContain("bannedPhrases");
  });
});

describe("autoFix", () => {
  it("strips markdown and moves URLs to the end", () => {
    const { reply, fixed } = autoFix(baseReply({ response: "**Yes.** Book at https://www.doctours.com/consultation today.\n- thanks" }));
    expect(reply.response).toBe("Yes. Book at using the link below today.\nthanks\nhttps://www.doctours.com/consultation");
    expect(fixed).toContain("plainText"); expect(fixed).toContain("urlLastLine");
  });
  it("trims an over-long escalation and nulls a stray reason", () => {
    const a = autoFix(baseReply({ escalate: true, escalationReason: "x", response: "Sure. Silver is $3,000. I'll get a person. More text here. And more." }));
    expect(a.reply.response.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
    expect(a.reply.response).not.toContain("$3,000");
    const b = autoFix(baseReply({ escalate: false, escalationReason: "x" }));
    expect(b.reply.escalationReason).toBeNull();
  });
});

describe("handoffReply", () => {
  it("is short, escalates, carries no digits", () => {
    const r = handoffReply("card_details", "Patient shared card details");
    expect(r.escalate).toBe(true); expect(r.escalationReason).toBeTruthy();
    expect(r.response.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
    expect(r.response).not.toMatch(/\d{4}/);
    expect(handoffReply("human_request", "Asked to talk to a human").response.toLowerCase()).toMatch(/person|someone/);
  });
});
```

- [ ] **Step 2: Write validators.ts**

```ts
import type { Reply } from "../types.js";
import type { ToolLog } from "../tools/toolLog.js";
import type { Context } from "../context/buildContext.js";

export interface Violation { name: string; detail: string }

export const STATIC_URL_ALLOWLIST = ["https://www.doctours.com/image-upload", "https://www.doctours.com/consultation"];
const URL_RE = /https?:\/\/[^\s]+/g;
const MD_RE = /(\*\*|__|`|^#{1,6}\s|^\s*[-*]\s+)/m;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b|\b(?:ending|ends|last (?:four|4)|last digits?)\b[^.?!]{0,12}\b\d{4}\b/i;
const MONEY_RE = /(?:\$|usd\s?|€|£)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars|eur|gbp)\b/gi;
const STALL_RE = /\b(i'?ll (?:get back to you|check on|look into|follow up|find out)|let me (?:check|look into|find out)|(?:someone|a coordinator|a team member|the team) will (?:reach out|get back|follow up|be in touch)|i checked our (?:side|system))\b/i;
const TURNAROUND_RE = /\b(a few hours|couple of hours|later today|by tomorrow|within a day|24 hours|24-48 hours|48 hours|a few days|couple of days|typically takes|usually takes|should be ready)\b/i;
const HEADCOVER_RE = /\b(bring|wear|pack|buy|get|grab)\b[^.?!]{0,30}\b(hat|cap|beanie|scarf|hood|headband|hijab|head wrap)\b/i;

const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const clean = (u: string) => u.replace(/[.,;:)!?]+$/, "");

export function validate(reply: Reply, log: ToolLog, _ctx: Context): Violation[] {
  const v: Violation[] = [];
  const text = reply.response;
  const urls = (text.match(URL_RE) ?? []).map(clean);

  if (MD_RE.test(text)) v.push({ name: "plainText", detail: "markdown markers present" });

  if (urls.length) {
    const lines = text.trim().split("\n");
    const tail = lines.slice(-urls.length);
    const tailOk = tail.every((l) => /^https?:\/\/\S+$/.test(l.trim()));
    const bodyHasUrl = lines.slice(0, -urls.length).some((l) => URL_RE.test(l));
    if (!tailOk || bodyHasUrl) v.push({ name: "urlLastLine", detail: "URL not on its own final line" });
  }

  const allowed = new Set([...STATIC_URL_ALLOWLIST, ...log.urls()]);
  for (const u of urls) if (!allowed.has(u)) v.push({ name: "urlProvenance", detail: `URL not from a tool this turn: ${u}` });

  const allowedPrices = new Set([25, ...log.prices()]);
  for (const m of text.matchAll(MONEY_RE)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (!allowedPrices.has(n)) v.push({ name: "priceProvenance", detail: `price not from a tool this turn: ${n}` });
  }

  if (CARD_RE.test(text)) v.push({ name: "noCardDigits", detail: "card digits echoed" });

  if (reply.escalate) {
    if (!reply.escalationReason) v.push({ name: "escalationShape", detail: "escalate without reason" });
    if (sentences(text).length > 2 || urls.length || MONEY_RE.test(text)) v.push({ name: "escalationShape", detail: "escalation reply too long or carries a link/price" });
  } else if (reply.escalationReason) {
    v.push({ name: "escalationShape", detail: "reason set but escalate is false" });
  }

  if (reply.templateId !== null) v.push({ name: "fieldSanity", detail: "templateId must be null" });
  if (reply.attachmentUrls) {
    if (reply.attachmentUrls.length > 3) v.push({ name: "fieldSanity", detail: "more than 3 attachments" });
    const imgs = log.imageUrls();
    for (const a of reply.attachmentUrls) if (!imgs.has(a)) v.push({ name: "fieldSanity", detail: `attachment not from a tool: ${a}` });
  }

  if (STALL_RE.test(text)) v.push({ name: "bannedPhrases", detail: "stalling or off-channel promise" });
  for (const s of sentences(text)) if (/assessment/i.test(s) && TURNAROUND_RE.test(s)) v.push({ name: "bannedPhrases", detail: `assessment turnaround promise: ${s}` });
  if (HEADCOVER_RE.test(text)) v.push({ name: "bannedPhrases", detail: "head-covering advice" });

  return v;
}

export function autoFix(reply: Reply): { reply: Reply; fixed: string[] } {
  const fixed: string[] = [];
  let text = reply.response;

  if (MD_RE.test(text)) {
    text = text.replace(/\*\*|__|`/g, "").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "");
    fixed.push("plainText");
  }
  const urls = (text.match(URL_RE) ?? []).map(clean);
  if (urls.length) {
    const lines = text.trim().split("\n");
    const tailOk = lines.slice(-urls.length).every((l) => /^https?:\/\/\S+$/.test(l.trim()));
    if (!tailOk) {
      let body = text;
      for (const u of urls) body = body.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[.,;:)!?]*"), "using the link below");
      body = body.split("\n").map((l) => l.trim()).filter((l) => l && !/^https?:\/\/\S+$/.test(l)).join("\n");
      text = body + "\n" + [...new Set(urls)].join("\n");
      fixed.push("urlLastLine");
    }
  }
  let out: Reply = { ...reply, response: text };
  if (out.escalate) {
    const kept = sentences(text).filter((s) => !URL_RE.test(s) && !MONEY_RE.test(s)).slice(0, 2);
    const trimmed = kept.join(" ") || "I'll get a person to help you with this.";
    if (trimmed !== text) { out = { ...out, response: trimmed }; fixed.push("escalationShape"); }
    if (!out.escalationReason) { out = { ...out, escalationReason: "model escalated without a reason" }; fixed.push("escalationShape"); }
  } else if (out.escalationReason) {
    out = { ...out, escalationReason: null }; fixed.push("escalationShape");
  }
  if (out.templateId !== null) { out = { ...out, templateId: null }; fixed.push("fieldSanity"); }
  return { reply: out, fixed: [...new Set(fixed)] };
}
```

- [ ] **Step 3: Extend escalationReply.ts**

Replace the file with:
```ts
import type { Reply } from "../types.js";
import type { PregateCategory } from "./pregate.js";

const base = (): Reply => ({
  response: "", escalate: true, escalationReason: null, templateId: null, intent: "hand off to a person",
  shouldFollowUp: false, followUpTiming: null, attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null,
});

const TEXT: Record<PregateCategory, string> = {
  human_request: "Of course. I'll get a person to pick this up with you now.",
  card_details: "I can't take or charge card details myself. I'll get a person to help you with the payment.",
  charge_request: "Charging a card isn't something I can do myself. I'll get a person to help you with that.",
};

export function handoffReply(category: PregateCategory, reason: string): Reply {
  return { ...base(), response: TEXT[category], escalationReason: reason };
}

export function unparseableReply(reason: string): Reply {
  return { ...base(), response: "I'll have a person pick this up for you.", escalationReason: reason };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/validators.test.ts tests/unit/baseline.test.ts`
Expected: all pass. If `MONEY_RE` with the `g` flag misbehaves in `.test()` inside the escalation check, create a fresh non-global copy for that test (`new RegExp(MONEY_RE.source, "i")`).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/validators.ts src/pipeline/escalationReply.ts tests/unit/validators.test.ts
git commit -m "Add output validators, auto-fix, and hand-off replies"
git push
```

---

### Task 14: runMessage pipeline

**Files:**
- Create: `src/pipeline/runMessage.ts`, `tests/unit/runMessage.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `interface RunOpts { deps: ModelDeps; id?: string; skills?: Skill[]; core?: string; subagents?: boolean }`; `runMessage(ctx, text, opts): Promise<{ reply: Reply; trace: Trace }>`.

Flow: pregate → route → optional call-log subagent (Task 15) → assemble → callModel → refusal/parse handling → autoFix → validate → one retry with violations → escalate on persistent violation → trace.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runMessage } from "../../src/pipeline/runMessage.js";
import { buildContext } from "../../src/context/buildContext.js";
import { fakeClient, textResponse, toolResponse, baseReply } from "./fakeClient.js";

const opts = (client: any) => ({ deps: { client, model: "claude-haiku-5-5", effort: "medium" as const, maxRounds: 4 }, id: "t", subagents: false });

describe("runMessage", () => {
  it("pregate escalation skips the model entirely", async () => {
    const c = fakeClient([]);
    const { reply, trace } = await runMessage(buildContext(), "I demand to talk to a human", opts(c));
    expect(reply.escalate).toBe(true); expect(trace.escalation.source).toBe("pregate");
    expect(c.calls.length).toBe(0); expect(trace.usage.input).toBe(0);
  });
  it("happy path records skills, tools, validators", async () => {
    const c = fakeClient([toolResponse("getClinicPackages", { clinicName: "Dr. Hakan" }), textResponse(baseReply({ response: "Sapphire is 3,200 USD with a 500 USD deposit." }))]);
    const { reply, trace } = await runMessage(buildContext(), "What does Dr. Hakan cost?", opts(c));
    expect(reply.escalate).toBe(false);
    expect(trace.skillsLoaded).toContain("clinic-and-package-facts");
    expect(trace.toolsCalled[0].name).toBe("getClinicPackages");
    expect(trace.validators.failed).toEqual([]);
    expect(trace.retried).toBe(false);
    expect(c.calls[0].system[0].cache_control).toBeDefined();
  });
  it("auto-fixes formatting without a retry", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "**Yes** it is free. https://www.doctours.com/consultation ok" }))]);
    const { reply, trace } = await runMessage(buildContext(), "Is the consultation free?", opts(c));
    expect(reply.response.endsWith("https://www.doctours.com/consultation")).toBe(true);
    expect(reply.response).not.toContain("**");
    expect(trace.validators.autoFixed).toContain("plainText");
    expect(trace.retried).toBe(false);
  });
  it("retries once on a provenance violation, then escalates if it persists", async () => {
    const bad = baseReply({ response: "Silver is $2,900." });
    const c = fakeClient([textResponse(bad), textResponse(bad)]);
    const { reply, trace } = await runMessage(buildContext(), "price?", opts(c));
    expect(trace.retried).toBe(true);
    expect(c.calls[1].messages[c.calls[1].messages.length - 1].content).toMatch(/priceProvenance/);
    expect(reply.escalate).toBe(true); expect(trace.escalation.source).toBe("validator");
  });
  it("retry that succeeds is accepted", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "Silver is $2,900." })), textResponse(baseReply({ response: "I don't have that price on hand." }))]);
    const { reply, trace } = await runMessage(buildContext(), "price?", opts(c));
    expect(reply.escalate).toBe(false); expect(trace.retried).toBe(true);
  });
  it("model escalation is kept and shaped", async () => {
    const c = fakeClient([textResponse(baseReply({ escalate: true, escalationReason: "asked to contact clinic", response: "I can't contact the clinic. I'll get a person to help." }))]);
    const { reply, trace } = await runMessage(buildContext(), "call Heva and hold Dec 8", opts(c));
    expect(reply.escalate).toBe(true); expect(trace.escalation.source).toBe("model");
  });
  it("refusal escalates", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: {} }]);
    const { reply, trace } = await runMessage(buildContext(), "hi", opts(c));
    expect(reply.escalate).toBe(true); expect(trace.escalation.source).toBe("refusal");
  });
  it("empty message still produces a reply", async () => {
    const c = fakeClient([textResponse(baseReply({ response: "How can I help?" }))]);
    const { reply } = await runMessage(buildContext(), "", opts(c));
    expect(reply.response).toBe("How can I help?");
  });
});
```

- [ ] **Step 2: Write runMessage.ts**

```ts
import type { Context } from "../context/buildContext.js";
import type { Reply, Trace } from "../types.js";
import { zeroUsage, addUsage } from "../types.js";
import { loadPrompt, renderUserMessage, SKILLS_DIR } from "../prompts.js";
import { TOOL_DEFINITIONS } from "../tools/schemas.js";
import { ToolLog } from "../tools/toolLog.js";
import { pregate } from "./pregate.js";
import { loadSkills, type Skill } from "./skills.js";
import { route } from "./router.js";
import { assembleSystem } from "./assemble.js";
import { callModel, type ModelDeps } from "./model.js";
import { validate, autoFix } from "./validators.js";
import { handoffReply, unparseableReply } from "./escalationReply.js";
import { maybeSummarizeCalls } from "../subagents/callLog.js";

export interface RunOpts { deps: ModelDeps; id?: string; skills?: Skill[]; core?: string; subagents?: boolean }

let cachedSkills: Skill[] | null = null;
let cachedCore: string | null = null;

export async function runMessage(ctx: Context, text: string, opts: RunOpts): Promise<{ reply: Reply; trace: Trace }> {
  const id = opts.id ?? "msg";
  const skills = opts.skills ?? (cachedSkills ??= loadSkills(SKILLS_DIR));
  const core = opts.core ?? (cachedCore ??= loadPrompt("core"));
  const trace: Trace = {
    id, system: "new", model: opts.deps.model,
    escalation: { source: null, reason: null, category: null },
    skillsLoaded: [], toolsCalled: [], validators: { passed: [], failed: [], autoFixed: [] },
    retried: false, subagents: [], usage: zeroUsage(), latencyMs: 0, rounds: 0, promptChars: 0, stopReason: "", notes: [],
  };

  const gate = pregate(text);
  if (gate.escalate && gate.category) {
    trace.escalation = { source: "pregate", reason: gate.reason, category: gate.category };
    trace.notes.push("model call skipped");
    return { reply: handoffReply(gate.category, gate.reason ?? "pregate"), trace };
  }

  const r = route(ctx, text, skills);
  trace.skillsLoaded = r.skills.map((s) => s.name);
  if (!r.stageSkill) trace.notes.push(`no stage skill for ${ctx.PIPELINE_STATUS}`);

  const extras: string[] = [];
  if (opts.subagents !== false) {
    const summary = await maybeSummarizeCalls(opts.deps, ctx, text);
    if (summary) { extras.push(`# Call summary (from call-log review)\n${summary.text}`); trace.subagents.push("callLog"); trace.usage = addUsage(trace.usage, summary.usage); }
  }

  const system = assembleSystem(core, r.skills, ctx, extras);
  trace.promptChars = system.reduce((n, b) => n + b.text.length, 0);
  const log = new ToolLog();
  let user = renderUserMessage(ctx, gate.redactedText);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callModel(opts.deps, { system, user, tools: TOOL_DEFINITIONS, log });
    trace.usage = addUsage(trace.usage, res.usage); trace.latencyMs += res.latencyMs; trace.rounds += res.rounds;
    trace.stopReason = res.stopReason; trace.toolsCalled = log.calls;

    if (res.stopReason === "refusal") {
      trace.escalation = { source: "refusal", reason: "model_refusal", category: null };
      return { reply: unparseableReply("model_refusal"), trace };
    }
    if (!res.reply) {
      if (attempt === 0) { trace.retried = true; user += `\n\n(Your previous output could not be parsed as the Reply JSON object: ${res.parseError}. Return only the JSON object.)`; continue; }
      trace.escalation = { source: "validator", reason: `unparseable:${res.parseError}`, category: null };
      return { reply: unparseableReply("unparseable output"), trace };
    }

    const fixed = autoFix(res.reply);
    trace.validators.autoFixed = fixed.fixed;
    const violations = validate(fixed.reply, log, ctx);
    const failedNames = [...new Set(violations.map((v) => v.name))];
    const ALL = ["plainText", "urlLastLine", "urlProvenance", "priceProvenance", "noCardDigits", "escalationShape", "fieldSanity", "bannedPhrases"];
    trace.validators.passed = ALL.filter((n) => !failedNames.includes(n));
    trace.validators.failed = failedNames;

    if (violations.length === 0) {
      if (fixed.reply.escalate) trace.escalation = { source: "model", reason: fixed.reply.escalationReason, category: null };
      return { reply: fixed.reply, trace };
    }
    if (attempt === 0) {
      trace.retried = true;
      user += `\n\n(Your previous draft was rejected by validators: ${violations.map((v) => `${v.name}: ${v.detail}`).join("; ")}. Rewrite the reply so every URL and price comes from a tool result in this turn, with no markdown and any URL as the last line.)`;
      continue;
    }
    trace.escalation = { source: "validator", reason: `validator:${failedNames[0]}`, category: null };
    return { reply: unparseableReply(`validator:${failedNames[0]}`), trace };
  }
  throw new Error("unreachable");
}
```

- [ ] **Step 3: Stub the subagent so this task compiles**

`src/subagents/callLog.ts` (Task 15 replaces the body):
```ts
import type { Context } from "../context/buildContext.js";
import type { ModelDeps } from "../pipeline/model.js";
import type { Usage } from "../types.js";
export async function maybeSummarizeCalls(_deps: ModelDeps, _ctx: Context, _text: string): Promise<{ text: string; usage: Usage } | null> { return null; }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/runMessage.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Live check on the five packet messages**

Run: `npm run reply -- --system new --in tests/packet-messages.json --out results/new-packet.json --trace results/new-packet.traces.jsonl`
Read the five replies against the packet's grading note. The two escalation cases must have `escalate: true` with a short response and no digits. The three others must carry the facts. If a fact is missing, read the trace: which skills loaded, which tools were called. Fix the trigger list or the skill body, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/runMessage.ts src/subagents/callLog.ts tests/unit/runMessage.test.ts results/new-packet.json results/new-packet.traces.jsonl
git commit -m "Add the routed pipeline with validators, retry and trace"
git push
```

---

### Task 15: Call-log subagent

**Files:**
- Modify: `src/subagents/callLog.ts`
- Create: `tests/unit/callLog.test.ts`

**Interfaces:**
- Produces: `maybeSummarizeCalls(deps, ctx, text): Promise<{ text: string; usage: Usage } | null>`. Returns null unless the message is about a call and `ctx.RECENT_CALLS` is non-empty. Otherwise runs one small model call over `getFullCalls()` output and returns a two-sentence summary. Uses `deps.client` so tests inject the fake.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { maybeSummarizeCalls, isAboutCall } from "../../src/subagents/callLog.js";
import { buildContext } from "../../src/context/buildContext.js";
import { fakeClient } from "./fakeClient.js";

const deps = (c: any) => ({ client: c, model: "claude-haiku-5-5", effort: "low" as const, maxRounds: 1 });

describe("callLog subagent", () => {
  it("detects call questions", () => {
    expect(isAboutCall("what did we talk about on the call?")).toBe(true);
    expect(isAboutCall("remind me what you said on the phone")).toBe(true);
    expect(isAboutCall("what does Heva cost?")).toBe(false);
  });
  it("returns null without a call question or without calls", async () => {
    const c = fakeClient([]);
    expect(await maybeSummarizeCalls(deps(c), buildContext(), "price?")).toBeNull();
    expect(await maybeSummarizeCalls(deps(c), buildContext({ RECENT_CALLS: "" }), "what did we discuss on the call?")).toBeNull();
    expect(c.calls.length).toBe(0);
  });
  it("summarizes with one small call", async () => {
    const c = fakeClient([{ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Jordan wants a hairline fix and has 4C hair. Photos were requested next." }], usage: { input_tokens: 300, output_tokens: 30 } }]);
    const r = await maybeSummarizeCalls(deps(c), buildContext(), "what did we discuss on the call?");
    expect(r?.text).toContain("4C");
    expect(r?.usage.input).toBe(300);
    expect(c.calls[0].messages[0].content).toContain("transcript");
  });
});
```

- [ ] **Step 2: Write callLog.ts**

```ts
import type { Context } from "../context/buildContext.js";
import type { ModelDeps } from "../pipeline/model.js";
import type { Usage } from "../types.js";
import { getFullCalls } from "../tools/fixtures.js";

const CALL_RE = /\b(on the call|the call|our call|phone call|on the phone|when we spoke|when we talked|what did we (?:discuss|talk about|say)|you said on|the consultation call|last time we spoke)\b/i;
export function isAboutCall(text: string): boolean { return CALL_RE.test(text); }

export async function maybeSummarizeCalls(deps: ModelDeps, ctx: Context, text: string): Promise<{ text: string; usage: Usage } | null> {
  if (!isAboutCall(text) || !ctx.RECENT_CALLS.trim()) return null;
  const calls = getFullCalls({ chatId: ctx.SUPABASE_CHAT_ID, limit: 5 });
  const res = await deps.client.messages.create({
    model: process.env.SUBAGENT_MODEL ?? deps.model,
    max_tokens: 400,
    output_config: { effort: "low" },
    system: "You summarize call records for a patient coordinator. Return two plain sentences: what the patient wanted and what was agreed as the next step. Facts only from the records given. No markdown.",
    messages: [{ role: "user", content: `Call records (summary and transcript):\n${JSON.stringify(calls, null, 2)}\n\nThe patient now asks: "${text}"` }],
  });
  const out = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  const u = res.usage ?? {};
  return { text: out, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } };
}
```

- [ ] **Step 3: Run tests, commit**

Run: `npx vitest run tests/unit/callLog.test.ts tests/unit/runMessage.test.ts` → all pass.
```bash
git add src/subagents/callLog.ts tests/unit/callLog.test.ts
git commit -m "Add call-log subagent that summarizes transcripts on demand"
git push
```

---

### Task 16: Checker

**Files:**
- Create: `harness/checker.ts`, `tests/unit/checker.test.ts`

**Interfaces:**
- Produces: `interface CaseFile { id: string; text: string; tags: string[]; contextOverrides?: Record<string, unknown>; expect: Expect }`; `interface Expect { escalate: boolean; mustInclude?: string[]; mustNotInclude?: string[]; urlLastLine?: boolean; maxSentences?: number; shouldFollowUp?: boolean; followUpTimingIncludes?: string; toolsCalled?: string[]; toolCallIncludes?: { name: string; argsContain: string }[] }`; `interface CheckResult { name: string; pass: boolean; detail: string }`; `runChecks(c: CaseFile, reply: Reply, trace: Trace): CheckResult[]`; `normalize(s): string`.

Matching: `normalize` lowercases, strips `$`, removes commas between digits, collapses whitespace. A `mustInclude` entry wrapped in `/.../` is a regex on the raw response; otherwise it is split on `|` and any alternate matching in the normalized response passes. Always-on checks: `escalate`, `escalationReason`, `plainText`, `urlLastLine`, `noCardDigits`, `escalationShort`.

- [ ] **Step 1: Write the failing test (oracle and null)**

```ts
import { describe, it, expect } from "vitest";
import { runChecks, normalize } from "../../harness/checker.js";
import { baseReply } from "./fakeClient.js";

const trace: any = { toolsCalled: [{ name: "getClinicPackages", args: { clinicName: "Dr. Hakan" } }], skillsLoaded: [] };
const hakan = { id: "hakan", text: "What does Dr. Hakan cost?", tags: ["pricing"], expect: { escalate: false, mustInclude: ["Sapphire", "3,200", "500"], toolsCalled: ["getClinicPackages"] } };
const human = { id: "h", text: "I demand a human", tags: ["escalate-positive"], expect: { escalate: true } };
const pass = (rs: any[]) => rs.every((r) => r.pass);

describe("checker", () => {
  it("normalizes money", () => { expect(normalize("Gold is $4,500 USD")).toBe("gold is 4500 usd"); });
  it("oracle passes", () => {
    expect(pass(runChecks(hakan, baseReply({ response: "Dr. Hakan has one package called Sapphire. It's 3,200 USD and the deposit is 500 USD." }), trace))).toBe(true);
    expect(pass(runChecks(human, baseReply({ escalate: true, escalationReason: "asked for a human", response: "I'll get a person to help you." }), trace))).toBe(true);
  });
  it("null and wrong replies fail", () => {
    expect(pass(runChecks(hakan, baseReply({ response: "" }), trace))).toBe(false);
    expect(pass(runChecks(hakan, baseReply({ response: "Sapphire is $3,500 with a $500 deposit." }), trace))).toBe(false);
    expect(pass(runChecks(human, baseReply({ response: "Sure, Silver is $3,000." }), trace))).toBe(false);
    expect(pass(runChecks(hakan, baseReply({ response: "Sapphire 3,200, deposit 500.\nhttps://x.y" , escalate: false }), trace).filter((r) => r.name === "urlLastLine"))).toBe(true);
  });
  it("supports alternates, regex, mustNotInclude, tool checks", () => {
    const c = { id: "c", text: "x", tags: [], expect: { escalate: false, mustInclude: ["klarna|paypal", "/don.?t accept/i"], mustNotInclude: ["depends"], toolCallIncludes: [{ name: "getClinicPackages", argsContain: "Hakan" }] } };
    expect(pass(runChecks(c, baseReply({ response: "We don't accept CareCredit. Klarna works." }), trace))).toBe(true);
    expect(pass(runChecks(c, baseReply({ response: "It depends. Klarna works, we don't accept it." }), trace))).toBe(false);
  });
  it("checks follow-up fields and sentence cap", () => {
    const c = { id: "p", text: "x", tags: [], expect: { escalate: false, shouldFollowUp: true, followUpTimingIncludes: "month", maxSentences: 3 } };
    expect(pass(runChecks(c, baseReply({ response: "Take your time. I'll check in next month.", shouldFollowUp: true, followUpTiming: "1 month" }), trace))).toBe(true);
    expect(pass(runChecks(c, baseReply({ response: "Take your time.", shouldFollowUp: false }), trace))).toBe(false);
  });
});
```

- [ ] **Step 2: Write checker.ts**

```ts
import type { Reply, Trace } from "../src/types.js";

export interface Expect {
  escalate: boolean; mustInclude?: string[]; mustNotInclude?: string[]; urlLastLine?: boolean; maxSentences?: number;
  shouldFollowUp?: boolean; followUpTimingIncludes?: string; toolsCalled?: string[]; toolCallIncludes?: { name: string; argsContain: string }[];
}
export interface CaseFile { id: string; text: string; tags: string[]; contextOverrides?: Record<string, unknown>; expect: Expect }
export interface CheckResult { name: string; pass: boolean; detail: string }

export const normalize = (s: string) => s.toLowerCase().replace(/\$/g, "").replace(/(\d),(?=\d{3})/g, "$1").replace(/\s+/g, " ").trim();
const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const URL_RE = /https?:\/\/\S+/g;

function includes(entry: string, raw: string): boolean {
  const re = entry.match(/^\/(.+)\/([a-z]*)$/);
  if (re) return new RegExp(re[1], re[2]).test(raw);
  const n = normalize(raw);
  return entry.split("|").some((alt) => n.includes(normalize(alt)));
}

export function runChecks(c: CaseFile, reply: Reply, trace: Pick<Trace, "toolsCalled">): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail = "") => out.push({ name, pass, detail });
  const text = reply.response ?? "";
  const e = c.expect;

  add("escalate", reply.escalate === e.escalate, `expected ${e.escalate}, got ${reply.escalate}`);
  add("escalationReason", e.escalate ? !!reply.escalationReason : reply.escalationReason === null);
  add("plainText", !/(\*\*|__|`|^#{1,6}\s|^\s*[-*]\s+)/m.test(text));
  add("noCardDigits", !/\b(?:\d[ -]?){13,19}\b|\bending[^.?!]{0,12}\b\d{4}\b/i.test(text));
  const urls = text.match(URL_RE) ?? [];
  if (urls.length || e.urlLastLine) {
    const lines = text.trim().split("\n");
    const ok = urls.length > 0 && lines.slice(-urls.length).every((l) => /^https?:\/\/\S+$/.test(l.trim())) && !lines.slice(0, -urls.length).some((l) => URL_RE.test(l));
    add("urlLastLine", ok, urls.length ? "URL placement" : "expected a URL");
  }
  if (e.escalate) add("escalationShort", sentences(text).length <= 2 && urls.length === 0, "escalation reply must be short with no link");
  if (!e.escalate) add("notEmpty", text.trim().length > 0);

  for (const m of e.mustInclude ?? []) add(`include:${m}`, includes(m, text));
  for (const m of e.mustNotInclude ?? []) add(`exclude:${m}`, !includes(m, text));
  if (e.maxSentences) add("maxSentences", sentences(text).length <= e.maxSentences, `${sentences(text).length} sentences`);
  if (e.shouldFollowUp !== undefined) add("shouldFollowUp", reply.shouldFollowUp === e.shouldFollowUp);
  if (e.followUpTimingIncludes) add("followUpTiming", includes(e.followUpTimingIncludes, reply.followUpTiming ?? ""));
  for (const t of e.toolsCalled ?? []) add(`tool:${t}`, trace.toolsCalled.some((x) => x.name.replace(/Tool$/, "") === t));
  for (const t of e.toolCallIncludes ?? []) add(`toolArgs:${t.name}`, trace.toolsCalled.some((x) => x.name.replace(/Tool$/, "") === t.name && JSON.stringify(x.args).includes(t.argsContain)));
  return out;
}
```

- [ ] **Step 3: Run tests, commit**

Run: `npx vitest run tests/unit/checker.test.ts` → 5 passed.
```bash
git add harness/checker.ts tests/unit/checker.test.ts
git commit -m "Add fact-based checker with oracle and null tests"
git push
```

---

### Task 17: Test cases and per-case tool overrides

**Files:**
- Create: `tests/cases/packet.json`, `tests/cases/payment.json`, `tests/cases/clinic.json`, `tests/cases/collection.json`, `tests/cases/pacing.json`, `tests/cases/escalation.json`, `tests/unit/cases.test.ts`
- Modify: `src/tools/execute.ts`, `src/pipeline/model.ts`, `src/pipeline/runMessage.ts`, `src/baseline/monolith.ts` (thread `toolOverrides`)

**Interfaces:**
- `CaseFile` gains `toolOverrides?: Record<string, unknown>`: when present, `executeTool` returns the override instead of calling the fixture, so LEAD-stage cases can see "no photos yet" even though the fixture always has five. Threaded as `ModelCallInput.toolOverrides`, `RunOpts.toolOverrides`, and a fifth parameter on `runBaseline`.
- `expect` values come from the packet's written policy and tool fixtures. Never from the packet's expected replies.

- [ ] **Step 1: Thread toolOverrides**

In `execute.ts`:
```ts
export function executeTool(name: string, input: unknown, log: ToolLog, overrides: Record<string, unknown> = {}): string {
  const key = normalizeToolName(name);
  if (key in overrides) return log.record(name, input, overrides[key]);
  const fn = TABLE[key];
  if (!fn) return log.record(name, input, { error: `unknown tool ${name}` });
  return log.record(name, input, fn(input ?? {}));
}
```
In `model.ts`: add `toolOverrides?: Record<string, unknown>` to `ModelCallInput` and pass `input.toolOverrides ?? {}` as the fourth argument of `executeTool`. In `runMessage.ts`: add `toolOverrides?: Record<string, unknown>` to `RunOpts` and pass it into `callModel`. In `monolith.ts`: add `toolOverrides: Record<string, unknown> = {}` as the fifth parameter and pass it through. Run `npm test` to confirm nothing broke.

- [ ] **Step 2: Write the LEAD override block once, reuse by copy**

Every LEAD case below uses this `contextOverrides` and `toolOverrides` pair (copy it verbatim into each such case):

```json
"contextOverrides": { "PIPELINE_STATUS": "LEAD", "COLLECTION_STATUS": "area unknown; name unknown; photos missing. Asks so far -- area 0, name 0, photos 0 (budget 1 each).", "CHAT_LIST": "", "RECENT_CONVERSATION_SUMMARY": "", "RECENT_CALLS": "", "PATIENT_NAME": null, "PROCEDURE_AREA": null, "HAS_PATIENT_IMAGES": false, "PATIENT_IMAGE_COUNT": 0, "SAVED_CLINIC_COUNT": 0, "WORKING_MEMORY": "{}" },
"toolOverrides": {
  "getPatientImages": { "allAnglesUploaded": false, "angles": {}, "hasImages": false, "imageCount": 0, "missingAngles": ["front","top","left","right","back"], "uploadedAngles": [] },
  "getLatestAssessment": { "assessmentUrl": null, "graftRange": null, "hasAssessment": false, "hasHairlineDrawing": false, "shareStatus": "not_ready", "version": 0 },
  "getSavedClinics": { "count": 0, "recommendationStatus": "none", "savedClinics": [] },
  "getPatientContext": { "clinicSelectionPreferences": { "budgetMax": null, "excludedDestinations": null, "preferredDestinations": null, "selectedClinicId": null, "selectedPackageId": null, "softClinicInterestIds": null, "softPackageInterestIds": null }, "consultationTime": null, "email": null, "name": null, "phone": "+15555550123", "pipelineStatus": "LEAD", "tentativeProcedureDates": null }
}
```

- [ ] **Step 3: Write tests/cases/packet.json**

```json
[
  { "id": "heva-packages", "text": "I'm leaning toward Heva. What packages do they have, and can I pay from the assessment? I have 4C curls — does Heva do afro hair?", "tags": ["packet", "pricing", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Silver", "Gold", "3,000", "500", "4,500", "600", "afro", "assessment"], "urlLastLine": true, "toolsCalled": ["getClinicPackages"] } },
  { "id": "hakan-price", "text": "What does Dr. Hakan Clinic cost?", "tags": ["packet", "pricing", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Sapphire", "3,200", "500"], "toolsCalled": ["getClinicPackages"] } },
  { "id": "consultation", "text": "Is the consultation free?", "tags": ["packet", "consultation", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["free", "https://www.doctours.com/consultation"], "urlLastLine": true, "maxSentences": 4 } },
  { "id": "demand-human", "text": "I demand to talk to a human", "tags": ["packet", "escalate-positive"],
    "expect": { "escalate": true, "mustNotInclude": ["Silver", "Gold", "3,000"] } },
  { "id": "charge-card", "text": "Charge the deposit on my card ending in 4242 right now.", "tags": ["packet", "escalate-positive"],
    "expect": { "escalate": true, "mustNotInclude": ["4242", "https://"] } }
]
```

- [ ] **Step 4: Write tests/cases/payment.json**

```json
[
  { "id": "carecredit-us", "text": "do you take carecredit?", "tags": ["payment", "carecredit", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/don.?t accept|do not accept|not accept/i", "CareCredit", "Klarna|PayPal", "layaway"], "mustNotInclude": ["depends", "provider", "try applying"] } },
  { "id": "cherry-us", "text": "can I use Cherry to finance this?", "tags": ["payment", "carecredit", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/don.?t accept|do not accept|not accept/i", "Cherry", "Klarna|PayPal", "layaway"], "mustNotInclude": ["depends", "provider"] } },
  { "id": "insurance-us", "text": "will my health insurance cover this?", "tags": ["payment", "insurance", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/can.?t use|cannot use|doesn.?t take|does not take|not (?:be )?(?:covered|cover)|no,? /i", "Klarna|PayPal", "layaway"], "mustNotInclude": ["depends on your plan", "medically necessary", "submit a claim", "superbill", "reimburse"] } },
  { "id": "financing-us", "text": "can I do monthly payments?", "tags": ["payment", "financing", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Klarna|PayPal"], "mustNotInclude": ["/\\$?\\d+(?:\\.\\d+)?\\s?(?:\\/|per) ?month/i", "APR", "approved"] } },
  { "id": "financing-gb", "text": "can I pay in instalments?", "tags": ["payment", "financing", "escalate-negative"],
    "contextOverrides": { "PATIENT_COUNTRY_CODE": "GB", "KLARNA_PAYPAL_FINANCING_ELIGIBLE": false },
    "expect": { "escalate": false, "mustInclude": ["US|United States", "Canada", "pay in full|full"], "mustNotInclude": ["/^yes/i", "/\\$?\\d+(?:\\.\\d+)?\\s?(?:\\/|per) ?month/i"] } },
  { "id": "financing-unknown", "text": "do you offer financing?", "tags": ["payment", "financing", "escalate-negative"],
    "contextOverrides": { "PATIENT_COUNTRY_CODE": null, "KLARNA_PAYPAL_FINANCING_ELIGIBLE": "unknown" },
    "expect": { "escalate": false, "mustInclude": ["US|United States", "Canada", "/live|located|based|where/i"] } },
  { "id": "layaway", "text": "how does your layaway work?", "tags": ["payment", "layaway", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["monthly|month", "/interest.?free|no interest|without interest/i", "before the procedure|before your procedure|paid off before|fully paid before"], "mustNotInclude": ["deposit option", "APR"] } },
  { "id": "deposit-refund-terms", "text": "is the deposit refundable?", "tags": ["payment", "deposit", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["25", "refund"], "mustNotInclude": ["non-refundable under any", "never refundable"] } },
  { "id": "pay-link-gold", "text": "I'm ready, send me the payment link for the Heva Gold package", "tags": ["payment", "links", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/payment/44444444-4444-4444-8444-444444444442"], "urlLastLine": true, "toolsCalled": ["getPaymentLink"] } },
  { "id": "checkout-link-heva", "text": "I want to go with Heva but haven't picked a package yet, can you send me a link so I can look at them?", "tags": ["payment", "links", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/clinic/heva/checkout|https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333"], "urlLastLine": true } },
  { "id": "promo-ask", "text": "do you have any discount codes going right now?", "tags": ["payment", "promo", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["3,000|4,500|3,200"], "mustNotInclude": ["/no promo|no discount|don.?t have any (?:promo|discount)|nothing running|no promotions|can.?t apply|not able to apply/i", "/may be|might be|will check|I'll check/i"] } },
  { "id": "claimed-discount", "text": "I saw a $200 off coupon on instagram, can you apply it to my package?", "tags": ["payment", "promo", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["/we.?ll honor|applied|confirmed the \\$?200|200 off your/i"] } },
  { "id": "direct-clinic-quote", "text": "Heva quoted me $2,600 directly, is that the real price?", "tags": ["payment", "pricing", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["3,000|4,500"], "mustNotInclude": ["/can.?t verify|cannot verify|unable to verify/i", "/we.?ll match|can match/i"] } },
  { "id": "paid-clinic-directly", "text": "I already paid a deposit directly to Heva last week, can you take over my booking from here?", "tags": ["payment", "deposit-eligibility", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["new deposit|through Doctours"], "mustNotInclude": ["/import|transfer(?:red)? (?:it|that) (?:in|into|over)|count(?:s)? as your Doctours/i"] } },
  { "id": "debit-card-question", "text": "can I pay the deposit with my debit card?", "tags": ["payment", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["card|yes"], "mustNotInclude": ["person will", "getting a person"] } },
  { "id": "balance-to-clinic", "text": "do I pay the rest to the clinic when I get there?", "tags": ["payment", "balance", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Doctours", "7 days|seven days"], "mustNotInclude": ["/pay (?:the rest|the balance|the remaining) (?:to|at) the clinic|on procedure day/i"] } },
  { "id": "deposit-split", "text": "can I split the deposit into two payments?", "tags": ["payment", "deposit", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/in full|full amount|one payment|can.?t be split|cannot be split|not (?:able to )?split/i"], "mustNotInclude": ["/yes,? you can split|installments for the deposit/i"] } }
]
```

- [ ] **Step 5: Write tests/cases/clinic.json**

```json
[
  { "id": "afro-hakan", "text": "does Dr. Hakan do afro hair?", "tags": ["clinic", "speciality", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/not (?:have|got) (?:dr\\.? )?hakan (?:flagged|listed)|don.?t have (?:dr\\.? )?hakan flagged|isn.?t flagged|not flagged|not listed as|no afro|Heva/i"], "mustNotInclude": ["/yes,? (?:dr\\.? )?hakan (?:does|specializes)|hakan specializes in afro/i"] } },
  { "id": "clinic-website-first", "text": "what's Heva's website?", "tags": ["clinic", "website", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/clinic/heva"], "urlLastLine": true } },
  { "id": "bookable-days", "text": "does Heva operate on Saturdays?", "tags": ["clinic", "packages", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Gold", "Silver", "Saturday|Sat"], "mustNotInclude": ["/heva (?:runs|operates|is open) monday/i"], "toolsCalled": ["getClinicPackages"] } },
  { "id": "hotel-nights-silver", "text": "how many hotel nights does the Heva Silver package include?", "tags": ["clinic", "packages", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["3|three"], "mustNotInclude": ["4 night", "four night", "2 night"], "toolsCalled": ["getClinicPackages"] } },
  { "id": "gold-vs-silver", "text": "should I get Gold or Silver at Heva? is Gold worth the extra?", "tags": ["clinic", "packages", "overbuy", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Silver", "Gold", "doctor|surgeon|incision"], "mustNotInclude": ["gimmick", "waste", "/want me to add that/i"], "toolsCalled": ["getClinicPackages"] } },
  { "id": "who-does-incisions", "text": "at Dr. Hakan who actually makes the incisions, the doctor or a tech?", "tags": ["clinic", "packages", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["hairline", "doctor|Dr. Hakan"], "mustNotInclude": ["guarantee", "in writing"] } },
  { "id": "heva-doctor", "text": "who is the surgeon at Heva?", "tags": ["clinic", "doctors", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Dr. Sibel|Sibel"], "toolsCalled": ["getClinicDoctors"] } },
  { "id": "graft-count", "text": "how many grafts do I need?", "tags": ["clinic", "assessment", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["2,500|2500|2,800|2800", "3,200|3200|2,800|2800", "surgeon|final"], "mustNotInclude": ["/exactly \\d/i"] } },
  { "id": "assessment-resend", "text": "can you send my assessment link again?", "tags": ["clinic", "assessment", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333"], "urlLastLine": true, "toolsCalled": ["getLatestAssessment"] } },
  { "id": "assessment-revision", "text": "can you lower the hairline a bit in my plan?", "tags": ["clinic", "assessment", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/revis|redraw|updated plan|lower/i"], "mustNotInclude": ["/can.?t change|cannot change|not able to change|within 24 hours|by tomorrow|a few days|a few hours/i"] } },
  { "id": "airport", "text": "which airport should I fly into for Heva?", "tags": ["clinic", "travel", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["/\\d+\\s?(?:-|to)\\s?\\d+ minutes|minutes by car|minute drive|km from|miles from/i"] } },
  { "id": "travel-timing", "text": "how long would I need to stay in Istanbul?", "tags": ["clinic", "travel", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/day or two|1-2 days|a day before|two days|3 night|three night|2-3|couple of days/i"], "mustNotInclude": ["/monday|tuesday|wednesday|thursday|friday|arrive (?:on )?the \\d|fly home that/i"] } },
  { "id": "flights-help", "text": "do you help with flights?", "tags": ["clinic", "travel", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["deposit", "link|options"], "mustNotInclude": ["/trip/", "/book your own|on your own/i"] } },
  { "id": "passport", "text": "I don't have a passport, can I still go to Turkey?", "tags": ["clinic", "travel", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/perfect reason|great reason|good reason|many of our patients|normal|common/i"], "mustNotInclude": ["/^turkey requires/i"] } },
  { "id": "finasteride", "text": "where can I buy finasteride?", "tags": ["clinic", "meds", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["hims", "keeps"], "mustNotInclude": ["amazon", "walgreens", "cvs"] } },
  { "id": "dental", "text": "do you guys do dental too?", "tags": ["clinic", "scope", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["implants", "crowns", "whitening"], "maxSentences": 4 } },
  { "id": "two-questions", "text": "What's Heva's price and do they have a doctor there?", "tags": ["clinic", "pricing", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["3,000", "4,500", "Sibel"], "toolsCalled": ["getClinicPackages", "getClinicDoctors"] } },
  { "id": "select-clinic-persist", "text": "I think Heva is the one for me", "tags": ["clinic", "funnel", "escalate-negative"],
    "expect": { "escalate": false, "toolCallIncludes": [{ "name": "updateUserClinicPreferences", "argsContain": "11111111-1111-4111-8111-111111111111" }] } },
  { "id": "tentative-dates", "text": "I'm thinking about going in March", "tags": ["clinic", "dates", "escalate-negative"],
    "expect": { "escalate": false, "toolCallIncludes": [{ "name": "updateUserClinicPreferences", "argsContain": "March" }], "mustNotInclude": ["/monday|tuesday|wednesday|thursday|friday/i"] } },
  { "id": "why-doctours", "text": "why should I book through you instead of going to Heva directly?", "tags": ["clinic", "why", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/vetted|transparen|support|reviews|layaway/i"], "maxSentences": 6 } },
  { "id": "fertility-stub", "text": "do you also do IVF?", "tags": ["clinic", "fertility", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/don.?t have|not (?:yet )?(?:available|live|something)|can.?t help with|not offer/i"], "mustNotInclude": ["/\\$\\d|success rate|clinic in/i"] } }
]
```

- [ ] **Step 6: Write tests/cases/collection.json**

Every case here includes the LEAD override block from Step 2 (copy it in; shown as `"...LEAD..."` below for brevity in this plan only, the file must contain the full objects).

```json
[
  { "id": "lead-first-contact", "text": "hi, I'm interested in getting a hair transplant", "tags": ["collection", "lead", "escalate-negative"],
    "contextOverrides": "...LEAD...", "toolOverrides": "...LEAD...",
    "expect": { "escalate": false, "mustInclude": ["Alex", "12 to 18|12-18", "hairline", "crown"], "mustNotInclude": ["image-upload", "/what.?s your name/i"] } },
  { "id": "lead-concern-distressed", "text": "my edges got pulled out from braids and I'm so embarrassed!! I just want them back", "tags": ["collection", "lead", "concern", "escalate-negative"],
    "contextOverrides": "...LEAD...", "toolOverrides": "...LEAD...",
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/image-upload", "Front", "done|finished|completed"], "urlLastLine": true, "mustNotInclude": ["/thanks for sharing|thank you for sharing/i"] } },
  { "id": "lead-concern-routine", "text": "my crown is thinning a bit", "tags": ["collection", "lead", "concern", "escalate-negative"],
    "contextOverrides": "...LEAD...", "toolOverrides": "...LEAD...",
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/image-upload"], "urlLastLine": true, "mustNotInclude": ["/^sorry|ugh|oof|yikes/i", "/hairline, crown, or both/i"] } },
  { "id": "weave-delay", "text": "I have a sew-in right now so I can't take photos for a while", "tags": ["collection", "image-delay", "escalate-negative"],
    "contextOverrides": { "PIPELINE_STATUS": "LEAD", "COLLECTION_STATUS": "area hairline; name on file; photos missing. Asks so far -- area 1, name 1, photos 1 (budget 1 each). Last collection ask: 1 patient turn(s) ago.", "HAS_PATIENT_IMAGES": false, "PATIENT_IMAGE_COUNT": 0, "SAVED_CLINIC_COUNT": 0 },
    "toolOverrides": "...LEAD toolOverrides...",
    "expect": { "escalate": false, "shouldFollowUp": true, "followUpTimingIncludes": "2 week|two week|14 day", "mustInclude": ["two weeks|2 weeks", "sew-in|sew in"], "mustNotInclude": ["image-upload", "Front, Top"] } },
  { "id": "back-photo-pushback", "text": "why do you need a photo of the back of my head? the back is fine", "tags": ["collection", "images", "escalate-negative"],
    "contextOverrides": { "PIPELINE_STATUS": "LEAD", "COLLECTION_STATUS": "area hairline; name on file; photos missing. Asks so far -- area 1, name 1, photos 1 (budget 1 each).", "HAS_PATIENT_IMAGES": false, "PATIENT_IMAGE_COUNT": 0, "SAVED_CLINIC_COUNT": 0 },
    "toolOverrides": "...LEAD toolOverrides...",
    "expect": { "escalate": false, "mustInclude": ["donor"], "maxSentences": 5 } },
  { "id": "photos-in-chat-fallback", "text": "the upload page won't let me select photos, can I just send them here?", "tags": ["collection", "images", "escalate-negative"],
    "contextOverrides": { "PIPELINE_STATUS": "LEAD", "COLLECTION_STATUS": "area hairline; name on file; photos missing. Asks so far -- area 1, name 1, photos 1 (budget 1 each).", "HAS_PATIENT_IMAGES": false, "PATIENT_IMAGE_COUNT": 0, "SAVED_CLINIC_COUNT": 0 },
    "toolOverrides": "...LEAD toolOverrides...",
    "expect": { "escalate": false, "mustInclude": ["/send them (?:to me )?here|here/i", "Front"], "mustNotInclude": ["image-upload", "/can.?t accept|won.?t reach|only way/i"] } },
  { "id": "assessment-turnaround", "text": "when will my assessment be ready?", "tags": ["collection", "assessment", "escalate-negative"],
    "contextOverrides": { "PIPELINE_STATUS": "PREP_PRE_CLINICAL", "SAVED_CLINIC_COUNT": 0, "CHAT_LIST": "[Sep 21, 11:41 AM] Alex: Got them — all five angles are in. The medical team will send your assessment as soon as it's ready.", "RECENT_CONVERSATION_SUMMARY": "[Sep 21, 11:41 AM] Alex: Got them — all five angles are in. The medical team will send your assessment as soon as it's ready." },
    "toolOverrides": { "getLatestAssessment": { "assessmentUrl": null, "graftRange": null, "hasAssessment": false, "hasHairlineDrawing": false, "shareStatus": "not_ready", "version": 1 }, "getSavedClinics": { "count": 0, "recommendationStatus": "none", "savedClinics": [] } },
    "expect": { "escalate": false, "mustNotInclude": ["/24 hours|48 hours|few hours|couple of hours|by tomorrow|a few days|within a day|typically|usually|should be ready|I.?ll check/i"], "mustInclude": ["/working on|as soon as|once it.?s ready|when it.?s ready/i"] } }
]
```

- [ ] **Step 7: Write tests/cases/pacing.json**

```json
[
  { "id": "pause-saving", "text": "I need to save up for a few months before I can do the deposit", "tags": ["pacing", "pause", "escalate-negative"],
    "expect": { "escalate": false, "shouldFollowUp": true, "followUpTimingIncludes": "month|week", "mustInclude": ["/check in|check back|reach out|follow up/i", "month|weeks"], "mustNotInclude": ["https://www.doctours.com/payment", "checkout"] } },
  { "id": "pause-reviewing", "text": "let me look over the two clinics and I'll get back to you", "tags": ["pacing", "pause", "escalate-negative"],
    "expect": { "escalate": false, "shouldFollowUp": true, "mustInclude": ["/check in|check back|reach out|follow up/i", "month|weeks"], "mustNotInclude": ["/take your time!$|whenever you.?re ready\\.?$/i"] } },
  { "id": "pause-named-window", "text": "can you check back with me in two weeks? I'll decide by then", "tags": ["pacing", "pause", "escalate-negative"],
    "expect": { "escalate": false, "shouldFollowUp": true, "followUpTimingIncludes": "2 week|two week", "mustInclude": ["two weeks|2 weeks"], "maxSentences": 4 } },
  { "id": "reversibility-torn", "text": "I'm torn between Silver and Gold, what if I pick the wrong one?", "tags": ["pacing", "reversibility", "escalate-negative"],
    "expect": { "escalate": false, "shouldFollowUp": false, "mustInclude": ["/transfer|move|switch|change/i"], "mustNotInclude": ["/locked in|can.?t change|final decision/i"] } },
  { "id": "move-deposit-question", "text": "can I move my deposit to a different clinic later if I change my mind?", "tags": ["pacing", "reversibility", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["/yes|transferable|transfer|move/i", "flights|flight"] } },
  { "id": "ack-thanks", "text": "ok thanks", "tags": ["pacing", "short", "escalate-negative"],
    "expect": { "escalate": false, "maxSentences": 2, "mustNotInclude": ["https://"] } },
  { "id": "spanish", "text": "¿La consulta es gratis?", "tags": ["pacing", "language", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["free"], "mustNotInclude": ["gratis", "consulta"] } },
  { "id": "hat-advice", "text": "should I bring a hat for after the surgery?", "tags": ["pacing", "recovery", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["/bring a (?:loose )?(?:hat|cap)|pack a hat|loose cap|beanie|scarf/i"], "mustInclude": ["/two weeks|2 weeks|button|zip|front.?opening|nothing on (?:your|the) head/i"] } },
  { "id": "call-recap", "text": "remind me what we talked about on the call?", "tags": ["pacing", "subagent", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["hairline|4C"], "maxSentences": 5 } },
  { "id": "consult-reschedule-none", "text": "can I reschedule my consultation?", "tags": ["pacing", "consultation", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["https://www.doctours.com/consultation"], "urlLastLine": true, "toolsCalled": ["getConsultationRescheduleLink"] } },
  { "id": "identity-bot", "text": "are you a bot or a real person?", "tags": ["pacing", "identity", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["Alex", "Coordinator|coordinator"] } },
  { "id": "creator-collab", "text": "I'm an influencer with 40k followers, do you do creator discounts or collabs?", "tags": ["pacing", "creator", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["molly@doctours.com"], "mustNotInclude": ["/you qualify|story frames|reels|engagement rate|\\d+%/i"] } },
  { "id": "phone-call-request", "text": "can you just call me instead?", "tags": ["pacing", "phone", "escalate-negative"],
    "expect": { "escalate": false, "mustInclude": ["consultation"], "mustNotInclude": ["/I.?ll call you|I will call you|give you a call/i"] } },
  { "id": "clinic-contact-first-ask", "text": "can I message Heva directly?", "tags": ["pacing", "clinic-contact", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["whatsapp", "@heva", "+90"], "mustInclude": ["?"] } },
  { "id": "hr-leave-question", "text": "my HR department asked what paperwork they'd need for my leave, what do I tell them?", "tags": ["pacing", "documents", "escalate-negative"],
    "expect": { "escalate": false, "mustNotInclude": ["/I.?ll send|I will send|look for Doctours as the sender|check your spam/i"] } }
]
```

- [ ] **Step 8: Write tests/cases/escalation.json**

```json
[
  { "id": "esc-real-person", "text": "get me a real person please", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-manager", "text": "I want to speak with your manager", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-stop-bot", "text": "stop the bot and connect me to a human", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-is-there-human", "text": "is there a human I can talk to?", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-card-full", "text": "my card is 4111 1111 1111 1111, go ahead and charge the deposit", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true, "mustNotInclude": ["4111", "1111"] } },
  { "id": "esc-card-dashes", "text": "use 4242-4242-4242-4242 for the $500", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true, "mustNotInclude": ["4242"] } },
  { "id": "esc-charge-no-digits", "text": "just charge my card for the deposit, you have it on file", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-move-paid-money", "text": "move the $500 I already paid over to Dr. Hakan instead", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-refund", "text": "refund my deposit to my card", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-hold-date", "text": "call Heva and ask them to hold December 8 for me", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-email-clinic", "text": "can you email the clinic and ask if they have availability the week of the 15th?", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "esc-clinic-contact-second-ask", "text": "I already asked once, just give me Heva's WhatsApp number", "tags": ["escalation", "escalate-positive"], "expect": { "escalate": true } },
  { "id": "neg-humanly", "text": "is that humanly possible with 2800 grafts?", "tags": ["escalation", "escalate-negative"], "expect": { "escalate": false } },
  { "id": "neg-someone-said-price", "text": "someone told me the price was $2,800, is that right?", "tags": ["escalation", "escalate-negative"], "expect": { "escalate": false, "mustInclude": ["3,000|4,500|3,200"] } },
  { "id": "neg-pay-link", "text": "can you send me the payment link?", "tags": ["escalation", "escalate-negative"], "expect": { "escalate": false } },
  { "id": "neg-own-hair", "text": "is it my own human hair that gets moved?", "tags": ["escalation", "escalate-negative"], "expect": { "escalate": false } },
  { "id": "neg-cancel-question", "text": "what happens if I need to cancel after paying the deposit?", "tags": ["escalation", "escalate-negative"], "expect": { "escalate": false, "mustInclude": ["25"] } }
]
```

- [ ] **Step 9: Write the test that loads every case**

`tests/unit/cases.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseFile } from "../../harness/checker.js";

const dir = join(process.cwd(), "tests", "cases");
const all: CaseFile[] = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

describe("test cases", () => {
  it("load, have unique ids, and both escalation directions", () => {
    expect(all.length).toBeGreaterThanOrEqual(60);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(all.filter((c) => c.tags.includes("escalate-positive")).length).toBeGreaterThanOrEqual(12);
    expect(all.filter((c) => c.tags.includes("escalate-negative")).length).toBeGreaterThanOrEqual(40);
    for (const c of all) { expect(typeof c.text).toBe("string"); expect(typeof c.expect.escalate).toBe("boolean"); }
  });
  it("no case carries the packet's expected prose", () => {
    const blob = JSON.stringify(all);
    expect(blob).not.toMatch(/15 to 20 minutes|getting a person for you|Sapphire, at \$3,200/);
  });
});
```

- [ ] **Step 10: Run tests, commit**

Run: `npm test` → all pass (the LEAD placeholders `"...LEAD..."` must have been replaced with the real objects, or JSON parsing of the override fails in the harness later; the test above only checks shape, so grep for `"...LEAD` and confirm zero hits).
```bash
git add tests/cases tests/unit/cases.test.ts src/tools/execute.ts src/pipeline/model.ts src/pipeline/runMessage.ts src/baseline/monolith.ts
git commit -m "Add 66 test cases from the packet's rules and per-case tool overrides"
git push
```

---

### Task 18: Harness runner, compare, blast radius

**Files:**
- Create: `harness/rates.ts`, `harness/run.ts`, `harness/compare.ts`, `harness/blast.ts`, `tests/unit/harness.test.ts`

**Interfaces:**
- `harness/rates.ts`: `costUsd(model: string, usage: Usage): number` using per-million rates: haiku-5-5 in 0.10 / out 0.50 / cacheRead 0.01 / cacheWrite 0.125; sonnet-5-5 2 / 10 / 0.20 / 2.50; opus-5-5 4 / 20 / 0.20 / 5. Unknown model → haiku rates with a console warning.
- `harness/run.ts` CLI: `--system new|baseline --cases tests/cases --out results/x.json [--reps 2] [--tag t] [--concurrency 4] [--model id]`. Writes `{ meta, rows, errors }`. `rows[]`: `{ caseId, rep, tags, pass, checks, reply, trace, costUsd }`. `errors[]`: `{ caseId, rep, kind: "api"|"timeout"|"harness", message }`. Does one unscored warm-up call per system before the measured pass. Exports `loadCases(dir, tag?)`, `summarize(rows)`.
- `harness/compare.ts`: `npm run compare -- results/baseline.json results/new.json` prints a markdown table and writes `results/compare.md`. Exports `summarize(rows)` consumers: pass rate (mean across reps, min/max), per-tag pass rate, escalation precision/recall, mean uncached input, mean cache-read, mean output, mean promptChars, mean latency, cost per 1000 turns.
- `harness/blast.ts`: `npm run blast -- <skill-name>` routes every case through `pregate` + `route` with no model and prints the case ids that would load that skill. That set is the maximum blast radius of editing it.

- [ ] **Step 1: Write rates.ts**

```ts
import type { Usage } from "../src/types.js";
const RATES: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  "claude-haiku-5-5": { in: 0.10, out: 0.50, cr: 0.01, cw: 0.125 },
  "claude-sonnet-5-5": { in: 2, out: 10, cr: 0.20, cw: 2.5 },
  "claude-opus-5-5": { in: 4, out: 20, cr: 0.20, cw: 5 },
};
export function costUsd(model: string, u: Usage): number {
  const key = Object.keys(RATES).find((k) => model.startsWith(k));
  if (!key) console.warn(`no rates for ${model}; using haiku rates`);
  const r = RATES[key ?? "claude-haiku-5-5"];
  return (u.input * r.in + u.output * r.out + u.cacheRead * r.cr + u.cacheWrite * r.cw) / 1_000_000;
}
```

- [ ] **Step 2: Write the failing test for summarize**

```ts
import { describe, it, expect } from "vitest";
import { summarize } from "../../harness/compare.js";
import { costUsd } from "../../harness/rates.js";

const row = (caseId: string, rep: number, pass: boolean, tags: string[], esc: boolean, input = 1000) => ({
  caseId, rep, tags, pass, checks: [], costUsd: 0.001,
  reply: { escalate: esc }, trace: { usage: { input, output: 100, cacheRead: 0, cacheWrite: 0 }, latencyMs: 500, promptChars: 5000, escalation: { source: esc ? "model" : null } },
});

describe("summarize", () => {
  it("computes pass rate, precision/recall, means", () => {
    const rows: any[] = [
      row("a", 0, true, ["escalate-positive"], true), row("a", 1, true, ["escalate-positive"], true),
      row("b", 0, false, ["escalate-positive"], false), row("b", 1, true, ["escalate-positive"], true),
      row("c", 0, true, ["pricing", "escalate-negative"], false), row("c", 1, false, ["pricing", "escalate-negative"], true),
    ];
    const s = summarize(rows);
    expect(s.passRate).toBeCloseTo(4 / 6, 5);
    expect(s.passRateByRep).toEqual([2 / 3, 2 / 3]);
    expect(s.escalation.recall).toBeCloseTo(3 / 4, 5);
    expect(s.escalation.precision).toBeCloseTo(3 / 4, 5);
    expect(s.byTag["pricing"].passRate).toBeCloseTo(0.5, 5);
    expect(s.meanInput).toBe(1000);
  });
  it("costs by model", () => {
    expect(costUsd("claude-haiku-5-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.10, 6);
  });
});
```

- [ ] **Step 3: Write compare.ts**

```ts
import { readFileSync, writeFileSync } from "node:fs";

export interface Row { caseId: string; rep: number; tags: string[]; pass: boolean; checks: any[]; reply: any; trace: any; costUsd: number }
export interface Summary {
  n: number; passRate: number; passRateByRep: number[]; byTag: Record<string, { n: number; passRate: number }>;
  escalation: { precision: number; recall: number; tp: number; fp: number; fn: number; tn: number };
  meanInput: number; meanCacheRead: number; meanOutput: number; meanPromptChars: number; meanLatencyMs: number; costPer1000: number;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(rows: Row[]): Summary {
  const reps = [...new Set(rows.map((r) => r.rep))].sort();
  const byTag: Summary["byTag"] = {};
  for (const r of rows) for (const t of r.tags) { byTag[t] ??= { n: 0, passRate: 0 }; byTag[t].n++; byTag[t].passRate += r.pass ? 1 : 0; }
  for (const t of Object.keys(byTag)) byTag[t].passRate /= byTag[t].n;
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const shouldEsc = r.tags.includes("escalate-positive"); const did = !!r.reply?.escalate;
    if (shouldEsc && did) tp++; else if (shouldEsc && !did) fn++; else if (!shouldEsc && did) fp++; else tn++;
  }
  return {
    n: rows.length, passRate: mean(rows.map((r) => (r.pass ? 1 : 0))),
    passRateByRep: reps.map((rep) => mean(rows.filter((r) => r.rep === rep).map((r) => (r.pass ? 1 : 0)))),
    byTag,
    escalation: { precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1, tp, fp, fn, tn },
    meanInput: mean(rows.map((r) => r.trace.usage.input)), meanCacheRead: mean(rows.map((r) => r.trace.usage.cacheRead)),
    meanOutput: mean(rows.map((r) => r.trace.usage.output)), meanPromptChars: mean(rows.map((r) => r.trace.promptChars)),
    meanLatencyMs: mean(rows.map((r) => r.trace.latencyMs)), costPer1000: mean(rows.map((r) => r.costUsd)) * 1000,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => Math.round(x).toLocaleString("en-US");

export function renderTable(a: { name: string; s: Summary }, b: { name: string; s: Summary }): string {
  const lines = [
    `| Metric | ${a.name} | ${b.name} |`, `|---|---|---|`,
    `| Cases x reps | ${a.s.n} | ${b.s.n} |`,
    `| Pass rate (all checks) | ${pct(a.s.passRate)} (reps: ${a.s.passRateByRep.map(pct).join(", ")}) | ${pct(b.s.passRate)} (reps: ${b.s.passRateByRep.map(pct).join(", ")}) |`,
    `| Escalation recall | ${pct(a.s.escalation.recall)} (${a.s.escalation.tp}/${a.s.escalation.tp + a.s.escalation.fn}) | ${pct(b.s.escalation.recall)} (${b.s.escalation.tp}/${b.s.escalation.tp + b.s.escalation.fn}) |`,
    `| Escalation precision | ${pct(a.s.escalation.precision)} | ${pct(b.s.escalation.precision)} |`,
    `| Mean prompt size (chars) | ${num(a.s.meanPromptChars)} | ${num(b.s.meanPromptChars)} |`,
    `| Mean uncached input tokens | ${num(a.s.meanInput)} | ${num(b.s.meanInput)} |`,
    `| Mean cache-read tokens | ${num(a.s.meanCacheRead)} | ${num(b.s.meanCacheRead)} |`,
    `| Mean output tokens | ${num(a.s.meanOutput)} | ${num(b.s.meanOutput)} |`,
    `| Mean latency (ms) | ${num(a.s.meanLatencyMs)} | ${num(b.s.meanLatencyMs)} |`,
    `| Cost per 1,000 turns (USD) | ${a.s.costPer1000.toFixed(2)} | ${b.s.costPer1000.toFixed(2)} |`,
    ``, `| Tag | ${a.name} | ${b.name} |`, `|---|---|---|`,
  ];
  const tags = [...new Set([...Object.keys(a.s.byTag), ...Object.keys(b.s.byTag)])].sort();
  for (const t of tags) lines.push(`| ${t} | ${a.s.byTag[t] ? pct(a.s.byTag[t].passRate) : "-"} | ${b.s.byTag[t] ? pct(b.s.byTag[t].passRate) : "-"} |`);
  return lines.join("\n");
}

const isMain = process.argv[1] && /compare\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const [fa, fb] = process.argv.slice(2);
  if (!fa || !fb) { console.error("usage: compare <a.json> <b.json>"); process.exit(1); }
  const A = JSON.parse(readFileSync(fa, "utf8")); const B = JSON.parse(readFileSync(fb, "utf8"));
  const table = renderTable({ name: A.meta.system + " (" + A.meta.model + ")", s: summarize(A.rows) }, { name: B.meta.system + " (" + B.meta.model + ")", s: summarize(B.rows) });
  const errs = `\nErrors excluded from scoring: ${A.meta.system}=${A.errors.length}, ${B.meta.system}=${B.errors.length}\n`;
  console.log(table + errs);
  writeFileSync("results/compare.md", table + errs);
}
```

- [ ] **Step 4: Write run.ts**

```ts
import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildContext } from "../src/context/buildContext.js";
import { createDeps } from "../src/pipeline/model.js";
import { runMessage } from "../src/pipeline/runMessage.js";
import { runBaseline } from "../src/baseline/monolith.js";
import { runChecks, type CaseFile } from "./checker.js";
import { costUsd } from "./rates.js";
import type { Row } from "./compare.js";

export function loadCases(dir: string, tag?: string): CaseFile[] {
  const all = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CaseFile[]);
  return tag ? all.filter((c) => c.tags.includes(tag)) : all;
}

function parseArgs(argv: string[]) {
  const o: Record<string, string> = { system: "new", cases: "tests/cases", reps: "2", concurrency: "4" };
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  return o;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const isMain = process.argv[1] && /run\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  const deps = createDeps(a.model ? { model: a.model } : {});
  const cases = loadCases(a.cases, a.tag);
  const reps = Number(a.reps);
  const rows: Row[] = []; const errors: any[] = [];
  const runOne = async (c: CaseFile, rep: number) => {
    const ctx = buildContext((c.contextOverrides ?? {}) as any);
    const overrides = c.toolOverrides ?? {};
    const res = a.system === "baseline"
      ? await runBaseline(ctx, c.text, deps, c.id, overrides)
      : await runMessage(ctx, c.text, { deps, id: c.id, toolOverrides: overrides });
    return res;
  };
  // warm-up: one unscored call so cache state is comparable across systems
  try { await withTimeout(runOne(cases[0], -1), 120_000); } catch (e) { console.error("warm-up failed:", (e as Error).message); }
  const jobs = cases.flatMap((c) => Array.from({ length: reps }, (_, rep) => ({ c, rep })));
  let done = 0;
  await pool(jobs, Number(a.concurrency), async ({ c, rep }) => {
    try {
      const { reply, trace } = await withTimeout(runOne(c, rep), 180_000);
      const checks = runChecks(c, reply, trace);
      rows.push({ caseId: c.id, rep, tags: c.tags, pass: checks.every((x) => x.pass), checks, reply, trace, costUsd: costUsd(deps.model, trace.usage) });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      errors.push({ caseId: c.id, rep, kind: /timeout/i.test(msg) ? "timeout" : /served model|unreachable/.test(msg) ? "harness" : "api", message: msg });
    }
    done++; process.stderr.write(`\r${done}/${jobs.length}`);
  });
  process.stderr.write("\n");
  rows.sort((x, y) => x.caseId.localeCompare(y.caseId) || x.rep - y.rep);
  mkdirSync("results", { recursive: true });
  const out = a.out ?? `results/${a.system}.json`;
  writeFileSync(out, JSON.stringify({ meta: { system: a.system, model: deps.model, effort: deps.effort, reps, tag: a.tag ?? null, startedAt: new Date().toISOString(), cases: cases.length }, rows, errors }, null, 2));
  const passed = rows.filter((r) => r.pass).length;
  console.log(`${a.system}: ${passed}/${rows.length} passed, ${errors.length} errors -> ${out}`);
  for (const r of rows.filter((r) => !r.pass)) console.log(`  FAIL ${r.caseId}#${r.rep}: ${r.checks.filter((c: any) => !c.pass).map((c: any) => c.name).join(", ")}`);
}
```

- [ ] **Step 5: Write blast.ts**

```ts
import { loadSkills } from "../src/pipeline/skills.js";
import { route } from "../src/pipeline/router.js";
import { pregate } from "../src/pipeline/pregate.js";
import { buildContext } from "../src/context/buildContext.js";
import { SKILLS_DIR } from "../src/prompts.js";
import { loadCases } from "./run.js";

const skill = process.argv[2];
if (!skill) { console.error("usage: blast <skill-name>"); process.exit(1); }
const all = loadSkills(SKILLS_DIR);
if (!all.some((s) => s.name === skill)) { console.error(`unknown skill ${skill}; known: ${all.map((s) => s.name).join(", ")}`); process.exit(1); }
const cases = loadCases("tests/cases");
const hits = cases.filter((c) => !pregate(c.text).escalate && route(buildContext((c.contextOverrides ?? {}) as any), c.text, all).skills.some((s) => s.name === skill));
console.log(`Skill "${skill}" loads for ${hits.length} of ${cases.length} cases. Editing it can only change these:`);
for (const h of hits) console.log(`  ${h.id}`);
```

Note: `loadCases` is exported from `run.ts`, whose main block is guarded by the filename check, so importing it does not start a run.

- [ ] **Step 6: Run tests, then a dry blast**

Run: `npx vitest run tests/unit/harness.test.ts` → 2 passed.
Run: `npm run blast -- carecredit` → lists `carecredit-us`, `cherry-us` and nothing else. If more appear, a trigger is too broad.

- [ ] **Step 7: Commit**

```bash
git add harness tests/unit/harness.test.ts
git commit -m "Add harness runner, comparison table, and blast-radius tool"
git push
```

---

### Task 19: Measured runs and iteration

**Files:**
- Create: `results/baseline.json`, `results/new.json`, `results/compare.md`
- Modify: `skills/*.md`, `prompts/core.md`, `src/pipeline/*` as failures dictate

- [ ] **Step 1: Run the baseline, two reps**

Run: `npm run harness -- --system baseline --reps 2 --out results/baseline.json`
Expected: finishes in roughly 10 minutes at concurrency 4. Note the pass count and the list of failing cases. Expect every `escalate-positive` case to fail on the baseline except possibly ones the monolith answers with a refusal-shaped sentence.

- [ ] **Step 2: Run the new system, two reps**

Run: `npm run harness -- --system new --reps 2 --out results/new.json && npm run compare -- results/baseline.json results/new.json`

- [ ] **Step 3: Triage every new-system failure by reading its trace**

For each failing case id, open `results/new.json`, find the row, and classify:
- **Wrong skills loaded** (the trace's `skillsLoaded` lacks the policy the case needs): add the missing phrase to that skill's `triggers` in `scripts/extract-skills.sh`, rerun the script, rerun that case with `--tag`.
- **Skill loaded but rule not followed**: the skill body is the packet's text; add one sentence at the top of the body in `extract-skills.sh` via a post-step (`sed -i '' '8i\...' skills/x.md`) that states the rule in one line. Keep additions short and recorded in the script so they are reproducible.
- **Validator false positive** (a correct reply escalated as `validator:*`): fix the validator regex and add the case to `tests/unit/validators.test.ts`.
- **Checker too strict** (a reply any reviewer would accept fails `mustInclude`): widen the alternates in the case file. Never weaken an `escalate` expectation.
- **Model variance** (passes one rep, fails the other): note it; do not chase single-rep flakes unless the same case flakes twice.

Rerun only the affected tag: `npm run harness -- --system new --reps 2 --tag payment --out results/new-payment.json`. When the full set is stable, rerun the full new-system pass and regenerate `results/compare.md`.

- [ ] **Step 4: Confirm the five packet cases by hand**

Run: `npm run reply -- --in tests/packet-messages.json --out results/packet-replies.json` and read the five replies against the packet's grading note one more time.

- [ ] **Step 5: Commit the results**

```bash
git add results/baseline.json results/new.json results/compare.md results/packet-replies.json skills scripts/extract-skills.sh prompts/core.md src tests
git commit -m "Record measured baseline vs new results and fixes from triage"
git push
```

---

### Task 20: README

**Files:**
- Create: `README.md`

Write it plainly. Sections, in order, each opening with its one-sentence answer:

1. **What this is.** Two sentences: the original was one prompt; this is a pipeline that loads only what a message needs and hands off to a human when it must.
2. **How to run.** Prerequisites (Node 20+, an Anthropic API key in `.env` as `ANTHROPIC_API_KEY`), `npm install`, the command: `npm run reply -- --in messages.json --out replies.json`. Input and output shapes. Optional flags: `--system baseline`, `--model`, `--trace`. How to run the tests and the harness.
3. **How it works.** The pipeline in seven lines. What stays loaded every turn (the core prompt and the context block, with their sizes). How routing picks skills (frontmatter triggers, precedence bands, stage). The list of skills with one phrase each. Where to look when a reply is wrong (the trace fields).
4. **Escalation.** Two sources, one shape. The categories. Why a refusal escalates. What a human sees.
5. **Results.** Paste `results/compare.md`. Two sentences on what the numbers mean and the noise floor (about ±9 points at this set size). Name the cases the new system still fails and why.
6. **The eight problems, answered.** The table from `docs/design.md` §8, with the command or file that demonstrates each.
7. **Adding a care line.** Three steps, using `skills/fertility.md` as the example.
8. **Where this breaks at scale, and the fix.** The list from `docs/design.md` §9, each as: limit, fix, why not in v0.
9. **What I'd do next.** The cut items: router fallback classifier, LLM judge for tone, prompt optimization against the harness, more reps.
10. **Layout.** The directory tree with one phrase per entry.

Constraints: no marketing tone, no em-dashes, short sentences, numbers in tables. No mention of the tool that helped write it.

- [ ] **Step 1: Write README.md following the outline above, filling numbers from `results/compare.md`.**
- [ ] **Step 2: Read it once as the grader: can they clone, install, add a key, and run in under five minutes?**
- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "Add README with design, results, escalation, and scaling notes"
git push
```

---

### Task 21 (optional, if time remains): Larger-model pass

- [ ] Run `npm run harness -- --system baseline --reps 1 --model claude-sonnet-5-5 --out results/baseline-sonnet.json` and the same for `--system new`. Add a second table to the README comparing the four cells. Commit.

---

## Self-review notes

- **Spec coverage.** §3 pipeline → Tasks 8, 9, 12, 5, 13, 14. §4.1 → Task 2. §4.2 → Task 3. §4.3 → Task 8. §4.4 → Tasks 9, 10. §4.5 → Task 11. §4.6 → Task 10. §4.7 → Task 5. §4.8 → Task 13. §4.9 → Tasks 1, 14. §5 → Task 6. §6 → Tasks 16, 17, 18. §7 → Tasks 8, 13, 14. §8 → Tasks 10 (fertility), 15 (subagent), 18 (blast), 14 (trace), 17 (per-policy cases). §9, §10 → Task 20.
- **Type consistency.** `executeTool(name, input, log, overrides?)` is introduced in Task 3 with three parameters and extended in Task 17; `callModel` input gains `toolOverrides` in Task 17; `runBaseline` gains a fifth parameter in Task 17. `Trace` fields used in Tasks 6, 14, 18 match Task 1.
- **Review Focus coverage.** 1 → Task 7 test. 2 → Task 9 test. 3 → Task 8 test and `esc-card-dashes`. 4 → Task 13 `autoFix` test. 5 → Task 3 test.
- **Known risk.** `output_config.format` together with `tools` in one request is assumed to compose. Task 5 Step 7 is the live check with a documented fallback.

---

## Revisions after research (2026-10-11)

These override the task bodies above where they differ. See `docs/design.md` and `docs/decisions.md`.

- **Task 9 (router):** cap non-stage modules at 3 (most trigger hits, then lower precedence). Add `suppresses: [names]` frontmatter; when a winner and a suppressed module both match, drop the suppressed one and return `suppressed: [{winner, suppressed}]` in `RouteResult`. Tests: cap at 3; suppression drops and records.
- **Task 10 (modules):** `time-bound-pause` suppresses `collection`; `image-delay` suppresses `collection`. Skill count stays as built.
- **Task 11 (core prompt):** delete the CONFLICTS section. Escalation section lists triggers narrowly and says code writes the handoff sentence; the model sets `escalate` and `escalationReason` only.
- **Task 13 (validators):** add `claimsVsReceipts` and `toolRequired`. `escalationShape` no longer checks length, because code replaces the response on escalation.
- **Task 14 (runMessage):** when the final reply has `escalate: true`, replace `response` with the code-owned handoff sentence. Retry message is an external verdict listing allowed URLs and prices from the tool log. Trace adds `routing`, `suppressed`, `retryFixed`, `toolUseLabel`.
- **Task 15 (call log):** summary computed once per call record and cached in memory keyed by call id; replies read the cache.
- **Task 16 (checker):** add `classifyToolUse(case, reply, trace)` returning the ToolFailBench label. Case schema gains `toolRequired?: boolean` and `trap?: { value: string }`.
- **Task 17 (cases):** add trap and control cases from `docs/research/notes/addendum_toolfailbench.md`.
- **Task 18 (harness):** default `--reps 3`; compare reports p50 and p95 latency, Clean Tool-Use Rate and each failure rate, retry rate and first-retry fix rate, and paired per-case wins and losses.
- **Execution:** task by task, commit and push after each.
