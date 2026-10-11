# Doctours reply system

The original system drafted every patient reply from one 800-line prompt and had no way to hand a conversation to a person. This repo replaces it with a pipeline where code decides which rules apply, checks every reply, and owns the handoff, while the model only drafts. The original prompt runs through the same test harness, so the difference below is measured, not claimed.

## Results

Both systems use the same model (`claude-haiku-5-5`), the same 14 tools, the same output format, and the same prompt caching. Only the system around the model differs. Every case runs 3 times per system, is scored by code, and the comparison is made case by case.

**Headline: two sets written blind by separate agents, scored once on the frozen system.** Nobody tuned the system on them.

| Blind set | What it tests | Original prompt | New system | Per case, new minus original |
|---|---|---|---|---|
| Escalation stress (60 cases) | 20 must-escalate, 40 look-alikes that must not, 19 minimal pairs | 67.8% | **96.7%** | +28.9 points (SE 6.5) |
| Robustness (60 cases) | Multi-question, messy, emotional, adversarial, non-English, answers not in the data | 78.3% | **90.6%** | +12.2 points (SE 5.4) |

**Every set:**

| Test set | Written by | Original | New |
|---|---|---|---|
| The brief's 5 sample messages | The brief | 3 of 15 runs | **15 of 15** |
| Escalation stress (60) | Fresh agent, brief only | 67.8% | **96.7%** |
| Robustness (60) | Fresh agent, brief only | 78.3% | **90.6%** |
| External (120) | A different model, brief only | 68.3% | **92.5%** |
| Held-out (25) | Fresh agent, brief only | 74.7% | **100%** |
| Dev (107) | Us, from the original prompt's rules | 78.5% | **98.8%** |

The external, held-out and dev sets were each used to find and fix problems after their first blind run, so their final numbers are optimistic. Their first runs were 86.4%, 89.3% and 93.5%.

**Handoffs** (frozen system):

| Set | Must-escalate missed, original → new | False escalations, original → new |
|---|---|---|
| Escalation stress | 26 of 60 → **0** | 0 of 120 → 5 |
| Robustness | 11 of 27 → **0** | 6 of 153 → **1** |
| External | 37 of 75 → **3** | 3 of 285 → **0** |

**Speed and cost** (replies that reached the model):

| | Original | New |
|---|---|---|
| Median latency | 5.2 to 6.9 s | **3.6 to 4.9 s** |
| Slowest 5% | 9.4 to 13.4 s | **6.8 to 9.0 s** |
| Prompt size per message | 167k characters | **40k to 48k characters** |
| Cost per 1,000 replies | $1.78 to $2.03 | **$0.81 to $1.18** |

What the numbers say, plainly:

- **The lead is in handoffs.** The original prompt has no handoff rule; it missed 41% to 49% of the messages that needed a person on the three independent sets, and when it did flag one it kept writing a sales answer. The new system misses almost none, and code writes the one-sentence handoff.
- **On everything else the two are about even on unseen messages.** On blind cases that should not escalate, the original scored 97.5% and 90.8% and the new system 95.0% and 88.9%, within the noise. An independent audit of the external set reached the same conclusion. The restructuring did not make ordinary answers better on new wording; it made them cheaper, faster, traceable and testable, without making them worse.
- **The new system's remaining errors on blind sets** were a pre-gate false handoff ("my girlfriend wants to talk to someone who's been through it"), refund-terms questions read as refund requests, and pause signals inside a multi-question message. These were fixed after the freeze; see "After the freeze" below.
- **It is faster and cheaper on every set.**

Every reply and trace is in [`results/runs/`](results/runs/). Per-set tables are in [`results/runs/final/`](results/runs/final/), with an independent audit of the scoring. Every decision and fix is in [`docs/decisions.md`](docs/decisions.md).

### After the freeze

Three bugs the blind sets exposed were fixed after their scores were recorded, each as a general rule with tests for its look-alikes:

- The pre-gate handed off "my girlfriend wants to talk to someone who's been through it". Talking to a past patient is no longer read as asking for staff.
- "If I change my mind after the deposit, can I get it back?" was sometimes read as a refund request. A what-if about refund terms is now named as a normal answer.
- A pause inside a multi-question message ("does Silver include the hotel? I'll need a few weeks to talk it over with my wife") did not load the pause rules. It now does.

A regression run on all five sets stopped partway when the API credit ran out (held-out finished; the others completed 29% to 69% of their turns). On the 636 turns both versions completed, the results were unchanged within run-to-run noise: 606 passes before, 608 after; false escalations 3 before, 0 after; missed escalations 3 before, 4 after. Each targeted case that ran now passes. These numbers are not blind and are not used in the headline. Runs are in `results/runs/postfreeze/`.

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

Use `-s` (or `--out`) so npm's banner does not end up in the JSON. Up to 4 messages run at once (`--concurrency N` to change). A trace for every reply goes to `results/traces.jsonl`. API errors are retried; a message that still fails is handed to a person, and stderr ends with a line like `wrote 120 replies; 0 handed off after errors`. Add `--system baseline` to run the original prompt instead.

Tests and the comparison:

```bash
npm test                                                                   # unit tests, no API calls, no key needed
npm run -s eval -- --system baseline --cases tests/heldout2 --out results/b.json
npm run -s eval -- --system new --cases tests/heldout2 --out results/n.json
npm run -s compare -- results/b.json results/n.json
```

Test sets: `tests/cases` (dev), `tests/heldout`, `tests/external`, `tests/escalation-stress`, `tests/heldout2` (robustness). A run of 60 cases takes a few minutes and costs well under a dollar on Haiku. `--tag <tag>` runs a subset. Settings: `MODEL=...`; `ROUTER_FALLBACK=off` turns off the classifier fallback; `ROUTER_MODE=union` runs the classifier on every message (tested and not adopted, see below).

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

**What loads per message:** the stage module for the patient's pipeline stage, and up to three policy modules from [`skills/`](skills/). There are 30 modules. Each one is the original prompt's text for one policy, copied word for word, so the gains come from structure, not from rewriting their rules. Each module declares the phrases that load it, a priority, and which other modules it overrides. The router is plain code, so its choice is the same every time and is written to the trace. When no phrase matches, a small classifier call picks modules from a one-sentence description of each module's patient intent; it fails open, adds about a second, and runs on roughly 5 to 15% of messages. Running it on every message ("union mode") was tested and rejected: no accuracy gain, about a second slower.

**How conflicts are settled:** in code, before the prompt is built. Where the original prompt said "this overrides that", the module declares it, and the router drops the losing module. Research shows a small model follows "this rule beats that rule" instructions poorly, so the model never has to decide.

**What the model still decides:** the wording of the reply, which tools to call, and judgment-call handoffs, such as "move the $500 I already paid to Hakan".

**What code enforces after the model:** every link and price must come from a tool result this turn. Formatting is fixed in code. A reply that tells the patient to pay from their assessment gets the assessment link added by code. Anything else wrong gets one retry that tells the model which links and prices are allowed. If a hard problem remains (an invented link or price, card digits, a false handoff claim, a banned promise), a person takes over; if only a heuristic check still fails, the reply is sent.

## Escalation

`escalate: true` means a person takes over. It is decided in three places, and the reply is always one sentence written by code, so it never answers the question or claims something was done.

| Source | Escalates when | Does not escalate (tested look-alikes) |
|---|---|---|
| Pre-gate (code, no model call) | An explicit ask for a person; card numbers, including split across lines; "charge my card" | "Are you a bot?"; "I need to talk to my wife"; "can I talk to someone at the clinic?" (first ask); "can I pay with a debit card?" |
| Model, from a short fixed list | Move or refund money the patient says they paid; contact a clinic or hold a date; find which dates are open; arrange their hotel, transfer or driver; a call other than the free consultation; a second ask for clinic contact details; a discount demand that will not drop | "Can I move my deposit later?"; "which weekdays can Silver be booked?"; "how does pickup from my own hotel work?"; "is the consultation a phone call?" |
| Validator | A reply still has an invented link or price, card digits, a false "I'm getting a person" claim, or a banned promise after one retry | Only a heuristic check failing (for example, naming a package without looking it up): the reply is sent |

The list is narrow and fixed on purpose. Research on support bots found that "escalate if unsure" inflates false handoffs, and model confidence is a poor signal, so each trigger is paired with its answerable look-alike. False escalations are measured on every run (see the Handoffs table above). Card digits are removed before the message reaches the model or any log. The trace records which source escalated and why, so the person taking over sees the reason.

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

- **Five test sets, 372 cases.** Our dev set (107) was written from the original prompt's rules and its examples of good and bad replies. Four more were written from the brief alone by authors who never saw the system: a held-out set (25), an external set by a different model (120, with a 100-rule coverage map in `tests/external/coverage.md`), an escalation stress set (60, with 19 minimal pairs), and a robustness set (60). None copies the brief's sample replies.
- **Every check is proven before any run.** Each case outside the dev set has a correct reply that must pass and a wrong one that must fail, run as unit tests, so no case can fail a correct answer.
- **The checks** are code, not a judging model: escalation, required facts, forbidden content, link placement, follow-up. The tool-use labels follow ToolFailBench (arXiv 2607.04686).
- **Fairness:** the same model, tools, output format, caching and patient data for both systems. Infra errors are kept out of the scores. Three reps per case, compared case by case, with a standard error.
- **Independent audits.** A separate session re-scored every saved reply (no mismatches), read every failing reply by hand to separate system errors from over-strict checks, and sampled passing replies for false passes. Its reports are in `results/runs/external/audit.md` and `results/runs/final/audit.md`.
- **Blind first.** Each blind set was scored before any change was made because of it, and those numbers are reported as the result. Later fixes are disclosed.
- **Limits:** checks are text rules, so they cannot fully judge tone or whether a handoff answered nothing. Every case uses the brief's patient, as the graded command does. Samples are small (standard errors of 4 to 9 points).

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

Each runs as an experiment against the current version on the same harness, and is kept only if it wins beyond the noise without making replies slower:

- Log every fallback-classifier decision in production and turn frequent ones into trigger phrases, so the router covers new wording without the extra call.
- On the retry path only, let the model consult a stronger model (the API's advisor tool), and measure whether more retries succeed.
- A judging model for tone and for "the handoff answered nothing", checked against hand labels.

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
