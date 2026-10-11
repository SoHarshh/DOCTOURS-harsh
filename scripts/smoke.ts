import "dotenv/config";
import { createDeps, callModel } from "../src/pipeline/model.js";
import { ToolLog } from "../src/tools/toolLog.js";
import { TOOL_DEFINITIONS } from "../src/tools/schemas.js";

/** One live call: checks that tools and structured output work together, and prints usage. */
const deps = createDeps();
const log = new ToolLog();
const r = await callModel(deps, {
  system: [{ type: "text", text: "You are Alex, a patient coordinator for Doctours. Answer the question using tools when needed. Reply as the structured JSON object only. Plain text in response, no markdown." }],
  user: "What does Dr. Hakan Clinic cost?",
  tools: TOOL_DEFINITIONS,
  log,
});
console.log(JSON.stringify({
  servedModel: r.servedModel, reply: r.reply, stopReason: r.stopReason, usage: r.usage, rounds: r.rounds,
  latencyMs: r.latencyMs, tools: log.calls.map((c) => c.name), parseError: r.parseError,
}, null, 2));
