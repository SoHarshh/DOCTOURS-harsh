# Doctours reply system

Doctours drafted every patient SMS reply from one 800-line prompt. That prompt loaded every rule on every message and had no way to hand a conversation to a person.

This repository replaces it with a pipeline where **code decides and the model drafts**. Code:

- picks the rules each message needs and settles conflicts between them,
- checks every reply against what the tools returned,
- hands the conversation to a person when one must take over.

The policy text itself is unchanged: it is the original prompt's wording, cut into modules.

## Results

| | Original prompt | This system |
|---|---|---|
| Escalation stress set (60 cases, blind) | 67.8% | **96.7%** |
| Robustness set (60 cases, blind) | 78.3% | **90.6%** |
| Messages that need a person, handled correctly (blind sets) | 7–8% | **100%** |
| Median latency (all five test sets) | 5.2–6.9 s | **3.6–4.9 s** |
| Cost per 1,000 replies (all five test sets) | $1.78–2.03 | **$0.81–1.18** |

The gain is in handoffs, speed and cost. On ordinary questions that should not escalate, the two systems are within noise of each other.

**What it was tested on.** Both systems ran on the same model, tools, patient data and conversation, three times per case, scored by code. There were five test sets, 372 cases in total:

| Set | Cases | Written by | Blind? |
|---|---|---|---|
| Dev | 107 | Built from the original prompt's rules and examples; includes the brief's five sample messages | No, the system was tuned on it |
| Held-out | 25 | Another model, from the brief only | Only for its first run |
| External | 120 | Another model, from the brief only | Only for its first runs |
| Escalation stress | 60 | Another model, from the brief only | Yes, scored once on the frozen system |
| Robustness | 60 | Another model, from the brief only | Yes, scored once on the frozen system |

Every case uses the brief's single patient and conversation. The two blind sets, stress and robustness, are the headline numbers above. Every run is saved in [`results/runs/`](results/runs/).

## Quick start

**You need:** Node 20 or later and an Anthropic API key. The default model is Haiku 5.5.

```bash
git clone https://github.com/SoHarshh/DOCTOURS-harsh.git
cd DOCTOURS-harsh
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run -s reply -- --in messages.json --out replies.json
```

`messages.json` is a JSON array of messages:

```json
[
  { "id": "1", "text": "How much is the Silver package at Heva?" },
  { "id": "2", "text": "I want to talk to a real person" }
]
```

The output is a JSON array of `Reply` objects, one per message, in the same order. Each message is answered as an independent turn on the brief's patient and conversation.

- Without `--in`, input is read from standard input. Without `--out`, replies go to standard output.
- Keep `-s` so npm's banner stays out of the JSON.
- A trace for each reply goes to `results/traces.jsonl`.
- `--concurrency N` sets how many messages run at once (the default is 4).
- `--system baseline` runs the original prompt instead.
- `npm test` runs the unit tests and needs no API key.

## How it works

<p align="center"><img src="docs/images/new-flow.png" width="430" alt="How one patient message flows through the system"></p>

Green steps are code, blue steps are model calls, and amber is a handoff to a person.

1. **Pre-gate (code).** Explicit requests for a person, card numbers, and "charge my card" are handed off with no model call.
2. **Router (code).** The router loads the patient's stage module plus up to 3 of 30 policy modules, chosen by trigger phrases. It also settles conflicts between rules. If no phrase matched and the message is more than an acknowledgement, one small classifier call picks modules from their descriptions.
3. **Prompt.** The core prompt, the chosen modules and the patient context are sent as three cached blocks.
4. **Model.** The model has the same 14 tools as the original and returns a structured `Reply`.
5. **Checks (code).** Links and prices must come from this turn's tool results. The reply must be plain text with the link last, contain no card digits, and claim no action that did not happen. A failing reply gets one retry, with feedback listing the allowed values:

<p align="center"><img src="docs/images/checks-and-retry.png" width="520" alt="How a reply is checked and retried"></p>

6. **Handoff (code).** Whenever a person must take over, code writes the one-sentence reply. It never answers the question or claims something was done.
7. **Trace.** Every reply records which modules loaded and why, the tools called, the checks, and where any escalation came from.

The full walkthrough, with the reasons behind each step, is in [`docs/how-it-works.md`](docs/how-it-works.md).

## Design in brief

- **Why this structure.** A small model follows fewer of its rules as the rule count grows, and it is poor at choosing between rules that conflict. So every decision that can be logged and tested moves into code, and the model sees only the rules a message needs. That answers the brief's eight problems:
  - smaller context per message
  - a trace for every reply
  - a new care line is just new modules (see the [`skills/fertility.md`](skills/fertility.md) stub)
  - side tasks are done ahead of time
  - lower cost
  - an edit reaches only the messages that load that module
  - conflicts are settled in code and recorded
  - tests per module
- **What stays loaded on every turn.**
  - The core prompt ([`prompts/core.md`](prompts/core.md), about 1,400 words): identity and voice, grounding, what the coordinator cannot do, when to hand off, and the output fields.
  - The patient context.
  - Everything else is the stage module plus at most 3 policy modules ([`skills/`](skills/)).
- **How escalation works.** Escalation is decided in three places:
  1. The pre-gate catches explicit asks for a person and card details.
  2. The model escalates from a short fixed list: moving paid money, contacting a clinic or holding a date, checking open dates, arranging hotel or transport, a call other than the free consultation, a repeated ask for clinic contacts, and a discount demand that won't drop.
  3. The checks escalate a reply that still has an invented link or price, card digits, or a false claim after the retry.

  In every case code writes the handoff sentence. Each trigger is tested against an answerable look-alike, for example "move my deposit" against "can I move it later?".

## More detail

- [`docs/how-it-works.md`](docs/how-it-works.md): the full explainer: each step and why it exists, escalation in full, how it was evaluated, results, and how it evolved
- [`docs/decisions.md`](docs/decisions.md): every decision in order, with the reason and the numbers
- [`docs/research/`](docs/research/): the research behind the design
- [`results/runs/`](results/runs/): every measured run, with comparison tables and audits
- [`tests/`](tests/): the five test sets and the unit tests
