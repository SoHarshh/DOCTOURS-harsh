# Decision log

This file records how the design was reached: what was asked, what was considered, what was chosen, and why. Newest decisions at the bottom.

## 1. Reading the task

The packet asks for three things: break up an 800-line single prompt that drafts patient SMS replies, add a human handoff (`escalate: true`), and ship a repo with a command that turns a JSON array of messages into a JSON array of replies. The owners list eight problems with the single prompt. They grade on their own hidden messages, so the five sample messages are a sanity check, not a target.

Early reading: the prompt already contains its own modules (every "HARD RULE" and stage section) and about 60 BAD/GOOD example pairs taken from real flagged replies. Those pairs are a test set the company already paid for.

## 2. First design, then a correction

A first design was drafted without research: a rule router, skill files, validators, an escalation flag, and precedence numbers inside the prompt. A full build plan followed.

That skipped a step that had been asked for: research first, then scope several methods, then build and compare. The plan was set aside as one candidate, and research was run before any code.

## 3. Research

Six parallel research tracks covered skills and context loading, routing and prompt-length cost, rule precedence and validators, human handoff, evaluation and prompt optimization, and tracing and sub-agents. A writer merged them into `reports/Prompt decomposition and escalation methods.md`. A separate practitioner scrape (`research_notes/twitter_raw/`) was compared against it, and the ToolFailBench paper (arXiv 2607.04686) was mapped onto the evaluation. Both addenda are in `research_notes/`.

What the evidence changed:

| Earlier idea | Evidence | Decision |
|---|---|---|
| Precedence numbers in the prompt | A Haiku-class model resolves conflicting instructions correctly 28% of the time, and a priority sentence does not help (IHEval). Moving policy into code took compliance from 48% to 93% (PCAS). | Resolve conflicts in code. No precedence prose. |
| Model picks which skill to load | Model-picked skills under-trigger. In Vercel's test a skill went unused 56% of the time. Anthropic reports no numbers for Skills. | Code picks modules. |
| Model sets an escalate flag | Bots claiming a handoff that never happened are a large failure class (45–48% of failures in one study). Model confidence is poorly calibrated. | Code owns escalation triggers, state, and the handoff sentence. |
| Retry when a validator fails | Retry helps only when the feedback lists allowed values (14/50 to 36/50 fixed, VeriHarness). Gains stop after one retry. | One retry, naming allowed URLs and prices. |
| Change tools per route | Changing tools breaks the cache and confuses the model. | Keep all 14 tools fixed. |
| Compare on one run | 65 cases on one run carry about a 5-point standard error. | Three reps, scored per case in pairs. |
| Sub-agents | Multi-agent setups degrade sequential tasks by 39–70%. | Side tasks (call summary) are one inline call. |

Why decompose at all: cost is small (about $0.0025 per message for the full prompt on Haiku). Quality is the reason. A Haiku-class model's instruction-following falls from 98% at 10 instructions to 43% at 100 (IFScale). The single prompt is well past 100.

## 4. Model

Claude Haiku 5.5, chosen for cost so the whole build and all eval runs stay at a few dollars. It can be overridden by an environment variable. Running open-source models locally was considered and rejected, because the graders must run the command with a hosted key.

## 5. ToolFailBench's role

ToolFailBench is used as an evaluation lens, not as the design. Its four labels (Tool-Skip, Result-Ignore, Output-Fabrication, Unnecessary-Tool-Use) are computed from the trace with no extra model call. Its trap idea becomes test cases where a wrong price comes from the patient, the chat history, or stale text inside the old prompt itself. The design choices above stand on the wider research, not on the paper.

## 6. Starting setup (v1)

The starting point is the best-evidenced setup, not a strawman. Later changes are run as A/B experiments against it on the same harness.

- System: code pre-gate, code router, small core prompt plus original policy text cut into modules, one model call with fixed tools, code validators with one retry, code-owned escalation, trace.
- Eval: deterministic checks, three reps, compared against the original prompt with caching on.
- First pivots to test: router fallback classifier, model-loaded modules versus code-loaded modules, retry with versus without allowed values.

## Ground rules for the repo

- Commits under the author's own name. No tool attribution anywhere in the repo.
- Push after every step so the history shows the work.
- README written plainly.
