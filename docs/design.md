# Design: routed reply system with human escalation

Date: 2026-10-10, revised 2026-10-11 after research. Budget: one 10–12 hour session.

Revision note: the research in `reports/` and the decision log in `docs/decisions.md` changed five things from the first draft. Conflicts are resolved in code, not by precedence prose. Escalation is code-owned and the handoff sentence is written by code. Validator retries name the allowed values. The router has no fallback classifier in v1, for latency. Evaluation uses three reps and adds ToolFailBench failure labels, trap cases, control cases, and latency targets.

## 1. Goal

Replace one 800-line system prompt with a system that loads only the rules a message needs, hands off to a human when it must, records why every reply came out the way it did, and measurably beats the original on the same inputs.

Success means:

- Every case in our test set passes the deterministic checks, and the five packet cases match on `escalate` and required facts.
- Pass rate beats the original prompt by more than the noise floor (about 7 points at three reps), with the original prompt given the same model, tools, schema, and caching.
- Median and p95 latency are no worse than the original prompt's. This is a hard rule: a change that breaks it is rejected.
- Mean input tokens per turn drop substantially versus the baseline (target: under 40% of baseline).
- Escalation recall is 100% on the adversarial set; precision is high enough that ordinary questions never escalate.
- Each of the packet's eight problems has a concrete artifact that answers it (see §9).
- The README states where the system breaks at scale and the fix for each break.

## 2. Fixed constraints

- **CLI contract.** Reads a JSON array of `{id, text}`; writes a JSON array of `Reply`, same order. Each message is an independent turn on the fixed packet history.
- **Tools.** Only the 14 functions in the packet, reimplemented with identical fixture data and `null` behavior.
- **Never leak.** The packet's expected replies appear nowhere the model can see: not in prompts, skills, examples, or routing rules. No special-casing of those five sentences.
- **Context.** The packet constants are the default context. The harness may override any constant per test case (for example, a non-US patient or a LEAD-stage patient) so rules the defaults cannot reach are still testable.
- **Stack.** TypeScript, Node 20+, Anthropic SDK, Zod, Vitest. One model call per turn for the main reply.
- **Model.** `claude-haiku-5-5` for the main reply and the call-log subagent, chosen for cost: the full development session runs for a few dollars. Overridable by environment variable so the final comparison can also be run on a larger model. Effort `medium` on the main call, tunable.

## 3. Pipeline

```
message
  → pre-gate (code)         escalation triggers, card-digit redaction
  → router (code)           stage + triggers → at most 3 modules + stage; suppressions applied
  → assemble (code)         cached core prompt + modules + context block
  → model call (1 call)     tool loop, ends with structured Reply
  → validators (code)       format, provenance, claims vs tool log; one retry naming allowed values
  → escalation (code)       if escalate: replace response with code-owned handoff sentence
  → Reply + Trace
```

Code decides routing, conflicts, escalation, and validity. The model drafts prose and makes judgment calls the code cannot. Everything runs per message at reply time; the only extra model calls are a retry after a failed check and nothing else on the normal path.

## 4. Components

### 4.1 Context

A single `Context` object built from the packet constants. Holds patient summary, clinic flags, pipeline status, collection status, working memory, chat history, recent calls, and the coordinator name. `buildContext(overrides?)` returns the defaults with any per-case overrides applied.

### 4.2 Tools

`tools/fixtures.ts` implements the 14 functions verbatim from the packet. `tools/schemas.ts` exposes them to the API as tool definitions. Every tool result in a turn is captured in a `ToolLog` so validators can check provenance and the trace can list calls. Baseline and new system share this layer.

### 4.3 Pre-gate

Pure functions over the message text. Fires `escalate` with a reason category when it sees:

- **human_request**: a request to talk to, speak with, or get a human, person, agent, representative, manager, or operator. Verb plus noun pattern, so "is that humanly possible" does not fire. Identity questions ("are you a bot", "who am I talking to") do not fire; the model answers those.
- **card_details**: a 13–19 digit sequence, or "card ending in NNNN", or a charge/run/process verb applied to "my card". Digits are redacted from the text before it is logged or sent anywhere.

When the pre-gate fires, the main model call is skipped. The reply is a fixed-shape one-to-two sentence handoff keyed by reason category, in the coordinator's first-person voice. `escalate: true`, `escalationReason` set, no URL, no price.

Other escalation triggers (moving already-paid money, refunds, asking us to contact a clinic or hold a date, a second request for clinic contact details) are judgment calls that depend on phrasing and intent. The core prompt lists them narrowly; the model sets `escalate: true` and a reason. Code then replaces whatever response the model wrote with the code-owned handoff sentence, so the handoff text never answers the sales question and never varies. The trace records whether escalation came from `pregate`, `model`, `validator`, or `refusal`. No confidence threshold is used: research shows model confidence is poorly calibrated and "escalate if unsure" inflates false handoffs.

### 4.4 Router

Input: context plus message text. Output: ordered list of skill names.

- The stage skill for the current pipeline status always loads.
- Each skill file's frontmatter declares `triggers` (case-insensitive phrases or regexes) and optional `context_triggers` (predicates on context, for example "collection has an outstanding item"). A skill loads when any trigger matches.
- At most 3 non-stage modules load. When more match, the ones with the most trigger hits win, then lower `precedence`.
- **Conflicts are resolved here, in code.** A module may declare `suppresses: [other-module]`. When both match, the suppressed one is dropped before the prompt is built and the trace records `{winner, suppressed}`. Example: `time-bound-pause` suppresses `collection`, because the packet says a pause close overrides the collection ask. This replaces "this overrides X" prose, which a Haiku-class model follows about 28% of the time (IHEval).
- Loaded modules are ordered by `precedence`, non-negotiables first within each module.
- No model call. The router's decision is fully reproducible from inputs and is written to the trace.

If the measured run shows the router missing intents on unseen phrasings, the upgrade path is a small-model classifier that runs only when no non-stage module matched. It is not in v1 because it adds about a second to those messages and would break the latency rule.

### 4.5 Core prompt (always loaded)

Target under 150 lines. Contains only what every turn needs:

- Identity and first-person voice; never describe limits in terms of the channel.
- Answer what was asked, then stop. Size the reply to the message.
- Plain text, no markdown. Any URL is the last line.
- Grounding: package, clinic, price, and policy facts come only from a tool result this turn or a loaded section. Never invent URLs, prices, slugs, or IDs. If not grounded, say you don't have it.
- No off-channel promises: never say you will send, check, call, contact, or follow up on anything you have no tool for.
- Escalation rule: a short enumerated list of what needs a person; set `escalate: true` and a reason. Code writes the handoff sentence.
- No conflict rule. Conflicts are settled by the router before the prompt exists. Instructions in the original that only told the model how to arbitrate between sections are dropped, and each drop is listed in `docs/decisions.md`.
- Output field definitions for the structured reply.
- One-line description of each tool.

Then the dynamic context block: patient summary, clinic flags, stage, collection status, working memory, recent calls, recent conversation.

### 4.6 Skills

One markdown file per policy under `skills/`. Frontmatter:

```yaml
name: carecredit
precedence: 20
triggers: ["carecredit", "care credit", "cherry"]
stages: []            # empty = any stage
```

Body is the policy text, cut from the packet with minimal editing. Skills planned for v0, grouped:

- **Stage** (exactly one loads): `stage-lead`, `stage-prep-pre-clinical`, `stage-pre-clinical-sent`, `stage-meeting-booked`, `stage-meeting-missed`, `stage-waiting`.
- **Payment**: `financing-geography`, `health-insurance`, `carecredit`, `payment-and-deposit` (links, deposit terms, layaway, price lock), `promo`, `deposit-eligibility`, `direct-clinic-quote`.
- **Clinic and package**: `packages-and-pricing` (grounding details, what matters vs nice to have, pre-assessment length cap, bookable days, hotels, airports), `clinic-website`, `clinic-status-tiers`, `assessment`.
- **Collection**: `collection` (persistence, one-thing-at-a-time, first-contact intro, instant-form, concern reflection, image guidance), `image-delay`.
- **Pacing**: `time-bound-pause`, `reversibility`.
- **Other**: `consultation` (free, phone, booking confirmation, rescheduling), `travel` (passport, flights, timing), `phone-contact`, `creator-partnership`.
- **Demonstration**: `fertility`, a stub for a second care line, to show problem 3.

### 4.7 Model call

One Anthropic call with the assembled system prompt, the tool definitions, and the user message template from the packet. Verified live: tools and structured output (`output_config.format`) work together in one request, so no fallback was needed. The API allows at most 16 union-typed (nullable) parameters in an output schema and `Reply` has 18, so the 13 working-memory fields are sent as optional and filled back to null before parsing; the output shape is unchanged. The SDK moves enum lists into descriptions, so an off-list working-memory value becomes null rather than failing the reply. Manual tool loop with a cap of 8 rounds, so every tool call and token count is captured. The final turn is constrained with structured output (`output_config.format` from a Zod schema of `Reply`), so the reply is always valid JSON of the right shape. Forced tool choice is not available on current models, which is why structured output is used instead of a submit tool. Temperature is not a parameter on these models; reproducibility comes from the fixed effort level and the output schema.

A `refusal` stop reason escalates with reason `model_refusal`. For a patient-facing concierge, a human taking over is the correct behavior when the model declines, so no server-side model fallback is configured.

Prompt caching: the system prompt is three blocks, each with a cache breakpoint: the core (same for every message), the chosen modules (same for every message that routes the same way), and the patient context (reused across tool rounds). A top-level breakpoint caches tool results between rounds. That uses all four breakpoints the API allows, so adding one anywhere else will fail. Earlier wording, kept for history: tools and the core prompt are the stable prefix and carry the cache breakpoint. Skills and the context block follow it and are not cached. The baseline monolith also caches its whole prompt, so the comparison reports both uncached input tokens and cache-read tokens, and cost is computed at cache pricing for both systems. Raw assembled prompt size is reported separately as the measure of context crowding, which caching does not change.

### 4.8 Validators

Pure functions over `(reply, toolLog, context)`. Each returns a list of violations.

- `plainText`: no markdown markers.
- `urlLastLine`: if any URL exists, the last line is a URL and no URL sits mid-sentence; multiple URLs stack at the end.
- `urlProvenance`: every URL is in the tool log for this turn, or in the small static allowlist the packet defines (image upload, consultation, clinic page built from a tool-returned slug).
- `priceProvenance`: every currency figure matches a tool-returned price or deposit this turn, or the allowlisted $25 cancellation fee.
- `noCardDigits`: no 13–19 digit sequence and no "ending in NNNN" echo.
- `escalationShape`: `escalate: true` implies at most two sentences, no URL, no price, non-empty reason; `escalate: false` implies reason is null.
- `fieldSanity`: `templateId` null, `attachmentUrls` at most 3 and all from the tool log.
- `bannedPhrases`: a short list from the packet's HARD rules (assessment turnaround windows, "I'll check on", "I'll get back to you", "let me look into", head coverings).
- `claimsVsReceipts`: the reply may not claim an action the tool log does not show. "I've saved", "I've updated", "I've sent you the link" need the matching tool call; "I'm getting a person", "I've passed this to the team" need `escalate: true`. Research found false success claims are a large failure class and simple text checks catch them better than judges.
- `toolRequired` (ToolFailBench Tool-Skip): a package price, deposit, or clinic fact stated with no clinic or package tool call this turn.

Policy on failure: formatting violations are auto-fixed in code (strip markdown, move URLs to the end). Any other violation triggers one retry. The retry message is phrased as an external verdict ("A validator rejected the previous reply") and lists the allowed values: the URLs and prices that tool results this turn actually contain. Retries stop at one. If the retry still fails, the reply escalates with reason `validator:<name>`. The trace records which validator fired and whether the retry fixed it, so the first-retry fix rate is measured.

### 4.9 Trace

Emitted beside every reply, written to stdout as a separate stream or file by the harness, never into `Reply`:

```json
{
  "id": "...",
  "escalation": { "source": "pregate" | "model" | "validator" | null, "reason": "..." },
  "skillsLoaded": ["stage-pre-clinical-sent", "packages-and-pricing"],
  "routing": [{ "module": "carecredit", "by": "trigger:carecredit" }],
  "suppressed": [{ "winner": "time-bound-pause", "suppressed": "collection" }],
  "toolsCalled": [{ "name": "getClinicPackages", "args": {...} }],
  "validators": { "passed": [...], "failed": [...], "autoFixed": [...] },
  "retried": false,
  "retryFixed": null,
  "toolUseLabel": "Clean" | "Tool-Skip" | "Result-Ignore" | "Output-Fabrication" | "Unnecessary-Tool-Use" | "Gated",
  "tokens": { "input": 0, "output": 0, "cacheRead": 0 },
  "latencyMs": 0
}
```

This is what a human reads on handoff and what a debugger reads on a bad reply.

## 5. Baseline runner

`baseline/monolith.ts` fills the packet's system prompt from the constants exactly as the packet's Flow section says, uses the same tools, the same structured-output schema, the same model and effort, and the same cache breakpoint. It has no pre-gate, router, or validators. Its trace records tokens and tool calls only. This is the "before."

## 6. Harness

- `harness/run.ts --system baseline|new --cases tests/cases --out results/<name>.json`. For each case: build context with overrides, run the system, run the case's checks, record pass/fail per check, tokens, latency, and the trace.
- `harness/compare.ts results/a.json results/b.json`: prints a table of pass rate overall and per tag, escalation precision and recall, mean input and output tokens, mean latency, estimated cost per 1,000 turns.
- `harness/blast.ts <skill>`: lists the test cases whose trace loaded that skill. That set is the maximum blast radius of a change to it. Deterministic, no model call.

### 6.0 Harness hygiene

Rules so the comparison is trustworthy, not just favorable:

- **Infra errors are not model failures.** A timeout, API error after retries, unparseable output, or truncated response goes to an errors sidecar with a failure class. It never lands in results as a fail.
- **Reps.** The runner takes `--reps N`. Default 3. Results are paired per case between systems. With about seventy cases and three reps, differences under about seven points are inside the noise and the README says so (Miller 2024).
- **Latency.** Median and p95 per system, from the final successful request. The new system must not be worse on either.
- **ToolFailBench labels.** A rule classifier assigns each reply one label from the trace and fixtures: Clean, Tool-Skip, Result-Ignore, Output-Fabrication, Unnecessary-Tool-Use, or Gated (pre-gate handled it, no model call). The compare table reports Clean Tool-Use Rate and each failure rate, on the first attempt and on the delivered reply.
- **Oracle and null checks before the first paid run.** A hand-written correct reply for a few cases must pass the checker. An empty reply and a reply with an invented URL must fail. If either check is wrong, the checker is fixed before any model run.
- **Tokens from the API, cost from the row's model and cache rates.** Never estimated from string length. Latency is the final successful request only, retries excluded and counted separately.
- **Warm cache for both systems.** Each system runs one unscored warm-up call before the measured pass so cache-read share is comparable.
- **Assert the served model.** The response's model field is checked against the requested one on every call.
- **Full trajectory per case.** Every request, tool call, tool result, and validator output is saved so a surprising score can be traced without a rerun.
- **Ground truth source is stated.** Every expected value comes from the packet's written policy or its tool fixtures, never from a model's output.

### 6.1 Test case format

```json
{
  "id": "carecredit-us",
  "text": "do you take carecredit?",
  "tags": ["payment", "carecredit"],
  "contextOverrides": {},
  "expect": {
    "escalate": false,
    "mustInclude": ["don't accept CareCredit", "Klarna"],
    "mustNotInclude": ["depends", "provider"],
    "urlLastLine": true
  }
}
```

`mustInclude` entries are matched case-insensitively and may be alternates separated by `|`.

### 6.2 Test set sources

- The five packet messages, with `expect` written from the packet's grading note (facts and `escalate`), never the expected prose.
- Roughly forty cases extracted from the packet's BAD/GOOD contrastive pairs. Each becomes a patient message that triggers the rule, `mustInclude` from the GOOD shape, `mustNotInclude` from the BAD shape.
- Roughly fifteen escalation cases: clear positives (demand a human, card digits, "move the $500 I paid to Hakan", "call Heva and hold Dec 8"), and hard negatives that must not escalate ("is that humanly possible", "my HR department asked about leave", "can I move my deposit later?", "are you a bot").
- A few stage and country overrides: LEAD with no photos, non-US financing question, unknown country.
- **Trap cases** (ToolFailBench): a wrong price or fact planted by the patient, by the chat history, or by stale text inside the original prompt itself (its "$3,000 to $6,000" range, "MetropolMED", "VIP package"). Clean behavior states the tool's value.
- **Control cases** (ToolFailBench): messages that need no tool ("ok thanks", identity questions). Calling clinic or payment tools on these counts as Unnecessary-Tool-Use.

## 7. Escalation design

Two sources, one shape.

- **Pre-gate** handles patterns that are unambiguous from text alone. Zero model cost, zero variance.
- **Model** handles intent that needs reading: executing a transfer of paid money versus asking whether one is possible, asking us to contact a clinic versus asking whether they can.
- Both produce the same reply shape, enforced by the validator.
- The handoff sentence never pretends work was done and never answers the sales question.
- Precision and recall are measured separately on the tagged set. A false positive wastes a human's time; a false negative is the failure the packet is guarding against. Recall is the hard floor.

## 8. Demonstrations mapped to the packet's eight problems

| Problem | Artifact |
|---|---|
| 1, 5 Context bloat and cost | compare table: mean input tokens, baseline vs new |
| 2 Untraceable failures | trace per reply with skills, tools, validators |
| 3 New care line collides | `skills/fertility.md` plus a test showing it loads alone |
| 4 Subtasks have nowhere to go | `subagents/callLog.ts`: a separate small call summarizes `getFullCalls` output. It runs once when a call is logged and is cached, so no reply pays for it live; the summary is injected only when the message asks about a call |
| 6 Policy change blast radius | `harness/blast.ts` output for one skill |
| 7 Conflicts resolve differently | precedence numbers in frontmatter, order recorded in trace |
| 8 Can't test one behavior | one test case file per policy, runnable by tag |

## 9. Scaling section of the README

Each item states the limit, the fix, and why it is not in v0.

- Stateless per turn: horizontal scaling works, but conversation state is rebuilt per call. Fix: a session cache keyed by thread.
- Core prompt is cached by the API; the dynamic block is not. Fix: move stable patient facts into the cached region per thread.
- Clinic and package data fetched per turn. Fix: an in-process cache with a short TTL, since that data changes rarely.
- No rate-limit handling toward the model API. Fix: a queue with backpressure and retry with jitter.
- Escalation sets a flag; nothing routes it. Fix: an inbox with SLA and the trace attached.
- Trace goes to a file. Fix: OpenTelemetry spans.
- Eval runs by hand. Fix: CI gate that blocks a skill change when its blast-radius cases regress.
- Skills are files in the repo. Fix: versioned, with a changelog, so a reply can be reproduced against the skill set that produced it.

## 10. Pivots and out of scope

First pivots, each run as an A/B against v1 on the same harness and accepted only if it beats v1 beyond the noise without breaking the latency rule:

1. Code-chosen modules versus a tool the model calls to load a module.
2. Escalation by code triggers versus by the prompt alone.
3. Validator retry with the allowed values listed versus without.
4. Router fallback classifier for unmatched messages, only if the trace shows misses.

Out of scope for v1: prompt optimization loops (GEPA, DSPy), an LLM judge for tone, a trimmed-monolith second baseline. Each is a README next step with the reason it was cut.

## 11. Repository layout

```
src/
  cli.ts                 reads JSON array, writes Reply[]
  context/               Context type, packet constants, buildContext
  tools/                 fixtures, schemas, ToolLog
  pipeline/              pregate, router, assemble, model, validators, trace, runMessage
  baseline/              monolith runner
  subagents/             callLog
prompts/
  core.md
  baseline.md            packet prompt verbatim with placeholders
  userMessage.md
skills/                  one .md per policy
tests/
  cases/                 *.json
  unit/                  pregate, router, validators
harness/
  run.ts  compare.ts  blast.ts
results/                 committed snapshots used in the README
docs/design.md
README.md
```
