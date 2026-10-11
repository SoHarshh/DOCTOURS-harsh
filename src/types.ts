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
export type ToolUseLabel = "Clean" | "Tool-Skip" | "Result-Ignore" | "Output-Fabrication" | "Unnecessary-Tool-Use" | "Gated";

export interface ToolCallRecord { name: string; args: unknown; ok: boolean; resultChars: number }

export interface Trace {
  id: string;
  system: "baseline" | "new";
  model: string;
  escalation: { source: EscalationSource; reason: string | null; category: string | null };
  skillsLoaded: string[];
  routing: { skill: string; by: string }[];
  suppressed: { winner: string; suppressed: string }[];
  toolsCalled: ToolCallRecord[];
  validators: { passed: string[]; failed: string[]; autoFixed: string[]; details: string[] };
  retried: boolean;
  retryFixed: boolean | null;
  subagents: string[];
  usage: Usage;
  latencyMs: number;
  rounds: number;
  promptChars: number;
  stopReason: string;
  notes: string[];
}

export function emptyTrace(id: string, system: Trace["system"], model: string): Trace {
  return {
    id, system, model,
    escalation: { source: null, reason: null, category: null },
    skillsLoaded: [], routing: [], suppressed: [], toolsCalled: [],
    validators: { passed: [], failed: [], autoFixed: [], details: [] },
    retried: false, retryFixed: null, subagents: [], usage: zeroUsage(),
    latencyMs: 0, rounds: 0, promptChars: 0, stopReason: "", notes: [],
  };
}
