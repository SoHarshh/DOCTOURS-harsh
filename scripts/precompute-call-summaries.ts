import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createDeps } from "../src/pipeline/model.js";
import { getFullCalls } from "../src/tools/fixtures.js";
import { loadCallSummaries, summarizeCall, SUMMARY_STORE } from "../src/subagents/callLog.js";

// Runs ahead of time (in production: when a call is logged). Summarizes any call without a stored summary.
const store = loadCallSummaries();
const deps = createDeps({ effort: "low" });
let added = 0;
for (const call of getFullCalls({}).calls) {
  if (store[call.id]) continue;
  const { text, usage } = await summarizeCall(deps, call);
  store[call.id] = text;
  added++;
  console.log(`${call.id}: ${text}\n  tokens in ${usage.input}, out ${usage.output}`);
}
mkdirSync(dirname(SUMMARY_STORE), { recursive: true });
writeFileSync(SUMMARY_STORE, JSON.stringify(store, null, 2) + "\n");
console.log(`${added} new summaries; store has ${Object.keys(store).length}`);
