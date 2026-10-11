import type { Reply } from "../types.js";
import type { ToolLog } from "../tools/toolLog.js";
import { executeTool } from "../tools/execute.js";

/**
 * Code-owned links. When a reply tells the patient to do something in their assessment (pay, book, open it),
 * the patient needs the link. The prompt says so, but a small model follows that rule only some of the time,
 * so code enforces it: fetch the link from the same tool the model would use and put it on the last line.
 * No retry, no extra model call.
 */

const ACT_ON_ASSESSMENT = /\b(?:pay|paying|book|booking|open|from|use|check|review)\b[^.?!\n]{0,40}\byour assessment\b/i;

export function ensureActionLink(reply: Reply, log: ToolLog, toolOverrides: Record<string, unknown> = {}): { reply: Reply; added: boolean } {
  if (reply.escalate || !ACT_ON_ASSESSMENT.test(reply.response)) return { reply, added: false };
  if (/https?:\/\/\S*\/assessment\//.test(reply.response)) return { reply, added: false };
  const result = JSON.parse(executeTool("getLatestAssessment", { source: "code" }, log, toolOverrides)) as { assessmentUrl?: string | null } | null;
  const url = result?.assessmentUrl;
  if (!url) return { reply, added: false };
  return { reply: { ...reply, response: `${reply.response.trimEnd()}\n${url}` }, added: true };
}
