# Doctours reply system

The original system drafted every patient reply from one 800-line prompt and had no way to hand a conversation to a person. This repo replaces it with a pipeline where code decides which rules apply, checks every reply, and owns the handoff, while the model only drafts. The original prompt runs through the same test harness, so the difference below is measured, not claimed.

## Results

Both systems use the same model (`claude-haiku-5-5`), the same 14 tools, the same output format, and the same prompt caching. Only the system around the model differs. Every case runs 3 times per system and is scored by code.

**Headline, on 25 cases neither system was ever tuned on** (written blind from the brief by a separate agent that never saw either system's output):

| | Original prompt | New system |
|---|---|---|
| Pass rate | 74.7% | **89.3%** |
| Cases that must escalate, handled right | 83.3% | **100%** |

**Every measurement:**

| Test set | What it is | Original | New |
|---|---|---|---|
| The brief's 5 sample messages | The only expected replies we were given, scored by the brief's own rule | 3 of 15 runs | **15 of 15** |
| Held-out, blind (25 cases) | Written from the brief only; run before any change was made because of it | 74.7% | **89.3%** |
| Dev set, first run (107 cases) | Written from the original prompt's rules; first run, before any tuning | 76.0% | **93.5%** |
| Dev set, final (107 cases) | After fixing what the runs exposed; optimistic, since fixes were found on these cases | 76.0% | **99.4%** |
| Held-out, after the router fallback | No longer blind: its failures motivated the fallback | 74.7% | **100%** |

**Split by kind of case** (dev set, final):

| | Original | New |
|---|---|---|
| Must escalate (51 runs) | 3.9% | **100%** |
| Everything else (270 runs) | 89.6% | **99.3%** |
| Escalation precision (handoffs that were right) | 90.9% | **100%** |

**Speed and cost** (dev set, final; latency over replies that reached the model):

| | Original | New |
|---|---|---|
| Median latency | 5.3 s | **3.7 s** |
| Slowest 5% | 9.8 s | **7.2 s** |
| Prompt size per message | 167k characters | **40k characters** |
| Cost per 1,000 replies | $1.72 | **$0.86** |
| Handoffs answered with no model call | 0 | 33 of 321 |

What the numbers say:

- **Escalation is the biggest difference.** The original prompt has no handoff rule. When a patient asked for a person it often set the flag, then kept writing a sales answer. The new system hands off in one sentence written by code.
- **On everything else the original prompt was already decent** (about 90%). The new system's first, untuned run was only about 3 points better there. The fixes that followed came from studying failures, which is why the blind held-out number is the one to trust.
- **The new system's main weakness is new wording.** On the blind set, two messages missed their policy module because no trigger phrase matched ("does blue cross cover any of this?", "need to talk to my wife first"). A small fallback classifier now handles messages no phrase matches. It fixed both, but that result is no longer blind.
- **It is faster and cheaper,** because each message reads about a quarter of the prompt.

Each run is in [`results/runs/`](results/runs/) with every reply and trace. [`results/compare.md`](results/compare.md) has the full table by policy area. Every fix, and why, is in [`docs/decisions.md`](docs/decisions.md).

## Run it

You need Node 20 or later and an Anthropic API key.

```bash
git clone https://github.com/SoHarshh/DOCTOURS-harsh.git
cd DOCTOURS-harsh
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

The command that answers messages reads a JSON array of `{ "id", "text" }` and writes a JSON array of replies in the same order:

```bash
npm run -s reply -- --in messages.json --out replies.json
```

Use `-s` (or `--out`) so npm's banner does not end up in the JSON. API errors are retried; a message that still fails is handed to a person and a warning is printed to stderr. A trace for every reply goes to `results/traces.jsonl`. Add `--system baseline` to run the original prompt instead.

Tests and the comparison:

```bash
npm test                                                      # unit tests, no API calls, no key needed
npm run -s eval -- --system baseline --out results/baseline.json
npm run -s eval -- --system new --out results/new.json
npm run -s compare -- results/baseline.json results/new.json
```

A full eval run is 321 turns per system, about 10 minutes and under a dollar on Haiku. Add `--tag escalation` (or any tag) to run a subset. The model is set with `MODEL=...`.

## How it works

```
message
  -> pre-gate (code)      asks for a person, or shares card details? hand off now, no model call
  -> router (code)        pick the stage module plus up to 3 policy modules; settle conflicts here
                          if no phrase matched (and it is not "ok thanks"), one small classifier call picks modules
  -> assemble (code)      core prompt + chosen modules + patient context, each block cached
  -> model call           the same 14 tools as before; reads only what this message needs
  -> validators (code)    links and prices from tools? plain text? link last? no card digits? no false claims?
                          one retry that lists the allowed values; if still wrong, hand off
  -> handoff (code)       if the model asks to escalate, code writes the sentence
  -> reply + trace
```

There is a before-and-after diagram in [`docs/workflow.md`](docs/workflow.md).

**What stays loaded on every turn:** the core prompt, [`prompts/core.md`](prompts/core.md), about 1,400 words. It covers identity and voice, answering only what was asked, plain text with links last, grounding every fact in a tool result, what the coordinator cannot do, when a person must take over, and the output fields. Plus the patient's context.

**What loads per message:** the stage module for the patient's pipeline stage, and up to three policy modules from [`skills/`](skills/). There are 30 modules. Each one is the original prompt's text for one policy, copied word for word, so the gains come from structure, not from rewriting their rules. Each module declares the phrases that load it, a priority, and which other modules it overrides. The router is plain code, so its choice is the same every time and is written to the trace. When no phrase matches, a small classifier call picks modules from one-line descriptions; it fails open, adds about a second, and runs on roughly 5 to 15% of messages. Set `ROUTER_FALLBACK=off` to disable it.

**How conflicts are settled:** in code, before the prompt is built. Where the original prompt said "this overrides that", the module declares it, and the router drops the losing module. Research shows a small model follows "this rule beats that rule" instructions poorly, so the model never has to decide.

**What the model still decides:** the wording of the reply, which tools to call, and judgment-call handoffs, such as "move the $500 I already paid to Hakan".

**What code enforces after the model:** every link and price must come from a tool result this turn. Formatting is fixed in code. A reply that tells the patient to pay from their assessment gets the assessment link added by code. Anything else wrong gets one retry that tells the model which links and prices are allowed. If it is still wrong, a person takes over.

## Escalation

`escalate: true` means a person takes over. It happens three ways, and the reply is always one sentence written by code, so it never answers the question or claims something was done.

| Source | When | Example |
|---|---|---|
| Pre-gate (code) | The patient asks for a person, shares card digits, or asks us to charge a card | "I demand to talk to a human" |
| Model | Something no tool or rule can do: move or refund paid money, contact a clinic, hold a date, a second ask for clinic contact details | "Call Heva and hold December 8 for me" |
| Validator | The reply still breaks a check after one retry | an invented price, twice |

Card digits are removed before the message reaches the model or any log. The trace records which source escalated and why, so the person taking over sees the reason.

Things that look like handoffs but are not: "are you a bot?", "can I move my deposit later?", "can you call me?" (the free consultation call is offered), and a payment link request.

## The eight problems, answered

| Problem in the brief | What answers it | Where to look |
|---|---|---|
| 1. Every rule on every turn | Only the stage module and up to 3 policy modules load | `trace.skillsLoaded` |
| 2. Can't trace a bad reply | Every reply has a trace: modules and why they loaded, tools and arguments, checks that failed, escalation source | `results/traces.jsonl` |
| 3. A new care line collides | A new line is a new set of modules with their own triggers and tests | [`skills/fertility.md`](skills/fertility.md) |
| 4. Subtasks have nowhere to go | Call transcripts are summarized by a separate small call, ahead of time | `npm run precompute`, [`src/subagents/callLog.ts`](src/subagents/callLog.ts) |
| 5. Every message pays for everything | About a quarter of the prompt per message; handoffs caught by the pre-gate cost nothing | `compare.md` cost and prompt-size rows |
| 6. A policy edit changes unrelated replies | Editing a module can only change messages that load it; a command lists them | `npm run -s blast -- carecredit` |
| 7. Conflicts with no record of which won | Settled in code by the router, recorded in the trace | `trace.suppressed` |
| 8. Can't test one behavior alone | Tests for each module, each check, and each case tag | `tests/unit/`, `npm run -s eval -- --tag <tag>` |

Example of problem 6:

```
$ npm run -s blast -- carecredit
Module "carecredit" loads for 2 of 107 cases. Editing it can change only these:
  carecredit-us  carecredit
  cherry-us      cherry
```

## Adding a care line

1. Write the new line's policies as modules in `skills/`, each with the phrases that should load it.
2. Add test cases for them in `tests/cases/`.
3. Run `npm test` and `npm run -s eval -- --tag <new tag>`. The blast command shows the change touches only the new cases.

`skills/fertility.md` is a stub that shows this: it loads only for fertility questions and no hair module loads with it.

## How it was tested

- **The test set** is 107 cases written from the original prompt's own rules, its examples of good and bad replies, and the tool data. None of them copy the sample replies in the brief. It includes 17 cases that must escalate, hard cases that must not ("is that humanly possible?"), 13 trap cases where a wrong price is planted in the message, the chat history, or the original prompt's own outdated text, and 38 cases that need no tool at all.
- **A blind held-out set** of 25 more cases was written by a separate agent from the brief alone. It never saw the system's prompts, modules, code, or results. It is in `tests/heldout/`.
- **The checks** are code, not a judging model: required facts, forbidden phrases, link placement, escalation, tools called. A rescore command reapplies corrected checks to saved replies without new API calls.
- **The tool-use labels** follow ToolFailBench (arXiv 2607.04686): did the model skip a tool, ignore its result, or invent a value, and did it call tools it did not need.
- **Fairness:** the original prompt gets the same model, tools, schema and caching. Infra errors are counted separately, never as failures. Three reps per case, compared case by case.
- **Limits:** we wrote the test set, so it can share our blind spots. Most cases use the brief's patient (Jordan, after the assessment was sent); first-contact cases are fewer.

## Where it breaks at scale, and the fix

At 200,000 active users and a few messages each per day, expect around a million replies a day, with peaks of perhaps 50 per second. Each reply is one or two model calls. This version runs one process with no shared state, so here is what would break first.

| Limit | What happens at scale | Fix | Why it is not in this version |
|---|---|---|---|
| Model API rate limits | Peaks hit output-token limits; requests fail | A queue with backpressure, retries with jitter, and a higher rate-limit tier. Cache reads do not count toward input limits, which helps | One process and one key are enough to measure the design |
| Prompt cache sharing | The core and module blocks are shared across patients, but only within one API workspace and only for 5 minutes | Keep traffic in one workspace; send a cheap keep-alive request for the most-used module sets | Needs real traffic to know which module sets are hot |
| Conversation state | Each message is answered on its own, from the history passed in | A session store per thread for working memory and handoff state, so a handed-off thread stays with the person | The brief's command answers independent messages |
| Escalation | Sets a flag; nothing routes it | A handoff inbox with a response-time target, with the trace attached so the person sees why | Outside the reply system |
| Traces | Written to a file | OpenTelemetry spans to a tracing backend, with module names as attributes | A file is enough to debug and grade |
| Router misses | Wording no trigger expects falls to the fallback classifier, which costs a second | Log every fallback decision and turn frequent ones into trigger phrases, so the fallback runs less over time | Needs real traffic |
| Policy changes | Modules are files in the repo | Version the module set, run the affected test cases in CI on every change, and block a change that drops their pass rate | Needs a CI setup |
| Call summaries | Summarized by a script | Summarize when a call is logged, from an event | Needs the call system |

## What's next

Each of these runs as an experiment against the current version on the same harness, and is kept only if it wins beyond the noise without making replies slower:

- On the retry path only, let the model consult a stronger model (the API's advisor tool), and measure whether more retries succeed.
- Let the model load a module itself, as a tool, versus code choosing. Code choosing is the current design, based on published results; the experiment would measure it here.
- More first-contact test cases, and a judging model for tone, checked against hand labels.

## Repository layout

```
src/
  cli.ts                 the command: JSON messages in, JSON replies out
  pipeline/              pre-gate, router, assembly, model call, validators, handoff, the pipeline itself
  baseline/monolith.ts   the original single prompt, run the same way for comparison
  subagents/callLog.ts   call transcript summaries
  tools/                 the 14 tools and their data, exactly as given
  context/               the patient context from the brief
prompts/
  core.md                the always-loaded core prompt
  baseline.md            the original prompt, unchanged
skills/                  30 policy modules cut from the original prompt
scripts/extract-skills.sh  how the modules were cut (needs the brief's packet file to rerun)
tests/
  unit/                  unit tests for every part
  cases/                 the 107 test cases
harness/                 eval runner, checks, tool-use labels, comparison, blast radius, rescore
results/                 measured runs and the comparison table
docs/
  decisions.md           every design decision and why, in order
  design.md              the design spec
  workflow.md            before-and-after diagrams
reports/                 the research behind the design
```
