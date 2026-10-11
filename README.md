# Doctours reply system

The original system drafted every patient reply from one 800-line prompt and had no way to hand a conversation to a person. This replaces it with a pipeline where code decides which rules apply, checks every reply, and owns the handoff, while the model only drafts the reply.

## What I built

Each message goes through these steps:

```
message
  -> pre-gate (code)     asks for a person, or shares card details? hand off now, no model call
  -> router (code)       pick the stage module and up to 3 policy modules; settle rule conflicts
                         if no phrase matched, one small classifier call picks modules instead
  -> prompt (code)       core prompt + chosen modules + patient context, each block cached
  -> model call          the same 14 tools as before, structured Reply output
  -> checks (code)       links and prices from tools, plain text, link last, no card digits,
                         no false claims; one retry that lists the allowed values
  -> handoff (code)      when a person must take over, code writes the one-sentence reply
  -> Reply + trace       the trace records modules loaded and why, tools, checks, escalation source
```

The policy text is the original prompt's, cut into 30 modules in [`skills/`](skills/) and copied word for word, so the rules themselves did not change. A diagram is in [`docs/workflow.md`](docs/workflow.md).

## Why this structure

A small model follows fewer of its rules as the rule count grows, and it is poor at choosing between rules that conflict. So the structure moves every decision it can into code that can be logged and tested, and gives the model only the rules a message needs.

| Problem in the brief | How the structure answers it |
|---|---|
| 1. Every rule loads on every turn | Only the stage module and up to 3 policy modules load per message |
| 2. A bad reply can't be traced to a rule | Every reply has a trace: modules and why they loaded, tools and arguments, checks that failed, escalation source |
| 3. A new care line collides with the old one | A new line is a new set of modules with their own triggers and tests; [`skills/fertility.md`](skills/fertility.md) is a stub |
| 4. Subtasks have nowhere to go | Call transcripts are summarized by a separate small call ahead of time, not at reply time |
| 5. Every message pays for the full prompt | About a quarter of the prompt per message; handoffs caught by the pre-gate cost nothing |
| 6. A policy edit changes unrelated replies | Editing a module can only change messages that load it; `npm run -s blast -- <module>` lists them |
| 7. Rule conflicts have no record of which won | Conflicts are settled by the router in code and recorded in the trace |
| 8. One behavior can't be tested alone | Each module, check and handoff rule has its own tests |

## What stays loaded on every turn

- **The core prompt**, [`prompts/core.md`](prompts/core.md), about 1,400 words: identity and voice, answer only what was asked, plain text with links last, every fact from a tool result, what the coordinator cannot do, when a person must take over, and the output fields. It is identical for every message, so the API caches it.
- **The patient context**: patient summary, clinic flags, stage, collection status, working memory, recent calls and the conversation.

Everything else loads per message. The router always adds the module for the patient's pipeline stage, then up to 3 policy modules whose trigger phrases match the message. Where the original prompt said one rule overrides another, the winning module declares it and the router drops the other. If no phrase matches and the message is more than an acknowledgement, one small classifier call picks modules from a one-sentence description of each module.

## How escalation works

`escalate: true` means a person takes over. It is decided in three places. In every case the reply is one sentence written by code, so it never answers the question or claims something was done, and `escalationReason` says why.

| Where | Escalates when | Does not escalate |
|---|---|---|
| Pre-gate (code, before any model call) | An explicit ask for a person; card numbers in any format; "charge my card" | "Are you a bot?"; "I need to talk to my wife first"; a first ask to reach the clinic; "can I pay with a debit card?" |
| Model, from a short fixed list | Move or refund money the patient says they paid; contact a clinic or hold a date; find which dates are open; arrange their hotel, transfer or driver; a call other than the free consultation; a second ask for clinic contact details; a discount demand that will not drop | "Can I move my deposit later?"; "which weekdays can Silver be booked?"; "how does pickup from my hotel work?"; "is the consultation a phone call?" |
| Checks (code) | After one retry, a reply still has an invented link or price, card digits, a false "I'm getting a person" claim, or a banned promise | Only a heuristic check still failing: the reply is sent |

The list is narrow on purpose, and each trigger is paired with its answerable look-alike, because broad "escalate if unsure" rules cause false handoffs. Card digits are removed before the message reaches the model or any log.

## How to run it

**Prerequisites:** Node 20 or later, and an Anthropic API key. The model is `claude-haiku-5-5`.

**Install:**

```bash
git clone https://github.com/SoHarshh/DOCTOURS-harsh.git
cd DOCTOURS-harsh
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

**Run:** the command reads a JSON array of `{ "id", "text" }` messages and writes a JSON array of `Reply` objects, one per message, in the same order.

```bash
npm run -s reply -- --in messages.json --out replies.json
```

Without `--in` it reads standard input; without `--out` it writes standard output (keep `-s` so npm's banner stays out of the JSON). A trace for each reply is written to `results/traces.jsonl`. Up to 4 messages run at once; `--concurrency N` changes that.

Design notes, test sets and measured results are in [`docs/`](docs/), [`tests/`](tests/) and [`results/`](results/).
