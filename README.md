# Doctours reply system

Doctours drafted every patient SMS reply from one 800-line prompt that loaded every rule on every message and had no way to hand a conversation to a person. This repository replaces it with a pipeline where **code decides and the model drafts**:

- code picks the rules each message needs and settles conflicts between them
- code checks every reply against what the tools returned
- code hands the conversation to a person when one must take over

The policy text itself is unchanged.

**Contents:** [Results](#results) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Why this structure](#why-this-structure) · [What stays loaded every turn](#what-stays-loaded-on-every-turn) · [How escalation works](#how-escalation-works) · [Evaluation](#evaluation) · [Repository layout](#repository-layout) · [Known limitations](#known-limitations)

## Results

Both systems ran on the same model, tools, schema, caching and patient data, 3 runs per case. The table shows the final runs of the frozen system on the two test sets it was never tuned on.

| | Original prompt | This system |
|---|---|---|
| Escalation stress set (60 cases, blind) | 67.8% | **96.7%** |
| Robustness set (60 cases, blind) | 78.3% | **90.6%** |
| Messages that need a person, handled correctly (blind sets) | 7–8% | **100%** |
| Median latency (all five test sets) | 5.2–6.9 s | **3.6–4.9 s** |
| Cost per 1,000 replies (all five test sets) | $1.78–2.03 | **$0.81–1.18** |

The gain is in handoffs, speed and cost. On ordinary questions that should not escalate, the two systems are within noise of each other. Full results and audits are in [`results/runs/final/`](results/runs/final/).

## Quick start

**Prerequisites:** Node 20 or later, and an Anthropic API key. The default model is Haiku 5.5.

```bash
git clone https://github.com/SoHarshh/DOCTOURS-harsh.git
cd DOCTOURS-harsh
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

**Run:** the command reads a JSON array of messages and writes a JSON array of `Reply` objects, one per message, in the same order.

```bash
npm run -s reply -- --in messages.json --out replies.json
```

```json
[
  { "id": "1", "text": "How much is the Silver package at Heva?" },
  { "id": "2", "text": "I want to talk to a real person" }
]
```

- Without `--in` it reads standard input, and without `--out` it writes standard output. Keep `-s` so npm's banner stays out of the JSON.
- Each message is answered as an independent turn on the brief's patient and conversation.
- A trace for each reply is written to `results/traces.jsonl`.

| Option | Default | What it does |
|---|---|---|
| `--concurrency N` | 4 | Messages processed at once |
| `--system baseline` | `new` | Run the original prompt instead, for comparison |
| `MODEL` (env) | Haiku 5.5 | Model for both systems |
| `ROUTER_FALLBACK=off` (env) | on | Disable the fallback classifier |

**Tests:** `npm test` runs the unit tests and needs no API key. `npm run typecheck` checks types.

## How it works

```
message
  -> pre-gate (code)     asks for a person, shares card numbers, or asks us to charge a card?
                         hand off now, with no model call
  -> router (code)       stage module + up to 3 policy modules chosen by trigger phrases;
                         rule conflicts settled here. If no phrase matched, one small
                         classifier call picks modules from their descriptions
  -> prompt (code)       core prompt + chosen modules + patient context, as 3 cached blocks
  -> model call          the same 14 tools as before, structured Reply output
  -> checks (code)       links and prices must come from tool results; plain text; link last;
                         no card digits; no claims of actions that did not happen.
                         One retry that lists the allowed values
  -> handoff (code)      when a person must take over, code writes the one-sentence reply
  -> Reply + trace       modules loaded and why, tools called, checks, escalation source
```

| Part | File |
|---|---|
| Command line | [`src/cli.ts`](src/cli.ts) |
| Pre-gate | [`src/pipeline/pregate.ts`](src/pipeline/pregate.ts) |
| Router and fallback classifier | [`src/pipeline/router.ts`](src/pipeline/router.ts), [`src/pipeline/classifier.ts`](src/pipeline/classifier.ts) |
| Core prompt, always loaded | [`prompts/core.md`](prompts/core.md) |
| 30 policy modules | [`skills/`](skills/), cut from the original prompt word for word by [`scripts/extract-skills.sh`](scripts/extract-skills.sh) |
| Model call | [`src/pipeline/model.ts`](src/pipeline/model.ts) |
| Checks and retry | [`src/pipeline/validators.ts`](src/pipeline/validators.ts) |
| Handoff sentence | [`src/pipeline/escalationReply.ts`](src/pipeline/escalationReply.ts) |
| The 14 tools and their data | [`src/tools/`](src/tools/) |
| The original prompt, for comparison | [`src/baseline/monolith.ts`](src/baseline/monolith.ts) |

A diagram of the original flow next to the new one is in [`docs/workflow.md`](docs/workflow.md).

## Why this structure

A small model follows fewer of its rules as the rule count grows, and it is poor at choosing between rules that conflict. So every decision that can be logged and tested moves into code, and the model sees only the rules a message needs. The research behind each choice is in [`docs/research/`](docs/research/), and every decision is recorded with its reason in [`docs/decisions.md`](docs/decisions.md).

| Problem in the brief | How the structure answers it |
|---|---|
| 1. Every rule loads on every turn | Only the stage module and up to 3 policy modules load per message |
| 2. A bad reply can't be traced to a rule | Every reply's trace lists the modules and why each loaded, the tools and their arguments, the failed checks, and the escalation source |
| 3. A new care line collides with the old one | A new line is a new set of modules with their own triggers and tests; [`skills/fertility.md`](skills/fertility.md) is a stub |
| 4. Subtasks have nowhere to go | Call transcripts are summarized ahead of time, not at reply time |
| 5. Every message pays for the full prompt | About a quarter of the prompt per message; pre-gated handoffs cost nothing |
| 6. A policy edit changes unrelated replies | An edited module can only change messages that load it; `npm run -s blast -- <module>` lists them |
| 7. Rule conflicts have no record of which won | The router settles conflicts in code and the trace records the winner |
| 8. One behavior can't be tested alone | Each module, check and handoff rule has its own tests |

## What stays loaded on every turn

- **The core prompt** ([`prompts/core.md`](prompts/core.md), about 1,400 words) covers:
  - identity and voice
  - answering only what was asked
  - plain text with links last
  - every fact from a tool result
  - what the coordinator cannot do
  - when a person must take over
  - the output fields

  It is identical for every message, so the API caches it.
- **The patient context:**
  - patient summary
  - clinic flags
  - pipeline stage
  - collection status
  - working memory
  - recent calls
  - the conversation

Everything else loads per message:

- The router always adds the module for the patient's stage, then up to 3 policy modules whose trigger phrases match.
- Where the original prompt said one rule overrides another, the winning module declares it and the router drops the other.
- If no phrase matches and the message is more than an acknowledgement, one small classifier call picks modules from a one-sentence description of each.

## How escalation works

`escalate: true` means a person takes over. It is decided in three places. In every case the reply is one sentence written by code, so it never answers the question, never claims something was done, and never repeats card digits. `escalationReason` says why.

| Where | Escalates when | Does not escalate |
|---|---|---|
| Pre-gate, before any model call | An explicit ask for a person; card numbers in any format; "charge my card" | "Are you a bot?"; "I need to talk to my wife first"; a first ask to reach the clinic; "can I pay with a debit card?" |
| Model, from a short fixed list | Move or refund money the patient says they paid; contact a clinic or hold a date; find which dates are open; arrange a hotel, transfer or driver; a call other than the free consultation; a second ask for clinic contact details; a discount demand that will not drop | "Can I move my deposit later?"; "which weekdays can Silver be booked?"; "how does pickup from my hotel work?"; "is the consultation a phone call?" |
| Checks, after one retry | The reply still has an invented link or price, card digits, a false "I'm getting a person" claim, or a banned promise | Only a heuristic check still failing: the reply is sent |

The list is narrow on purpose, and each trigger is paired with an answerable look-alike in the tests, because broad "escalate if unsure" rules cause false handoffs. Card digits are removed before the message reaches the model or any log.

## Evaluation

The original prompt and this system are run under identical conditions on five test sets, 3 runs per case, and scored by code.

| Set | Folder | Cases | Written by | Status for the final system |
|---|---|---|---|---|
| Dev | [`tests/cases`](tests/cases) | 107 | From the original prompt's rules, examples and tool data | Tuned on |
| Held-out | [`tests/heldout`](tests/heldout) | 25 | A separate model, from the brief only | Blind for its first run |
| External | [`tests/external`](tests/external) | 120 | A different model, from the brief only | Blind for its first runs |
| Escalation stress | [`tests/escalation-stress`](tests/escalation-stress) | 60 | A separate model, from the brief only | Blind, scored once |
| Robustness | [`tests/heldout2`](tests/heldout2) | 60 | A separate model, from the brief only | Blind, scored once |

- **What each case checks:**
  - whether the reply escalates
  - facts it must and must not contain
  - the link on the last line
  - sentence count
  - which tools were called
- **What the comparison reports:**
  - pass rate, with paired per-case differences and standard errors
  - escalation recall and false escalations by source
  - tool-use failure labels (from ToolFailBench)
  - latency and cost
- **Correct and wrong replies:** every case in the four extra sets ships with one of each, and a unit test confirms the correct reply passes and the wrong one fails.
- **No leakage:** a test confirms that no six-word run of the brief's expected replies appears in the core prompt, any module, or any test case.

To reproduce a comparison (all five sets on both systems cost about $3 at list prices):

```bash
npm run -s eval -- --system baseline --cases tests/heldout2 --reps 3 --out base.json
npm run -s eval -- --system new --cases tests/heldout2 --reps 3 --out new.json
npm run -s compare -- base.json new.json
```

## Repository layout

```
src/
  cli.ts               the command that produces replies
  pipeline/            pre-gate, router, classifier, prompt assembly, model call, checks, handoff
  tools/               the brief's 14 tools and their data
  context/             patient context built from the brief
  baseline/            the original prompt, run unchanged for comparison
  subagents/           call summaries, prepared ahead of time
prompts/               core prompt, original prompt, user-message template
skills/                30 policy modules cut from the original prompt
data/                  precomputed call summaries
harness/               eval runner, checks, tool-use labels, comparison, re-scoring, blast radius
scripts/               module extraction, call-summary precompute, smoke test
tests/                 the five case sets and the unit tests
results/runs/          every measured run: replies, traces, comparison tables, audits
docs/                  decision log, design, plan, workflow diagrams, research
```

## Known limitations

- **The checks are text rules.** They cannot judge tone, or prove that a handoff answered nothing.
- **"Can you just call me instead?" escalates.** The brief supports both readings, and I chose to hand off any call other than the free consultation.
- **Remaining errors on the blind sets:**
  - After "thanks", a reply sometimes repeats the last question.
  - A fake staff discount gets refused without the price being restated.
  - Some recovery answers include norms that are not in the data.
- **Every test case uses the brief's single patient**, as the graded command does.
