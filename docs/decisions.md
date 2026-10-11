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

## 7. Before and after, item by item

| Area | What was there | What replaces it | Why it should be better | Evidence |
|---|---|---|---|---|
| Rule loading | One 800-line prompt, every rule on every turn | Short core prompt plus only the modules this message needs, chosen by code | Small models follow far fewer of their rules as rule count rises | IFScale 2025; Levy et al. 2024; Chroma Context Rot 2025 |
| Rule text | Policies mixed in one block | Same policy wording, cut into one file per policy | Keeps their policy intact so gains come from structure; each file has its own tests | Packet's own sections; Claude Code and Cursor scoped rule files |
| Choosing rules | Implicit, the model reads all of it | Code router on stage and keywords, list logged in the trace | Model-picked rule loading under-triggers; code choice is repeatable and traceable | Anthropic Skills docs; Vercel skills test; Arora et al. 2024 |
| Conflicts | Prose like "this overrides X" inside the prompt | Code decides which module applies before the prompt is built | Haiku-class models resolve prompt-level conflicts 28% of the time; code engines raise compliance 48% to 93% | IHEval; PCAS |
| Human handoff | None | Code triggers for clear cases, model may request for judgment cases, code writes the sentence and blocks false handoff claims | False "I handed you off" claims are a large failure class; confidence-based escalation is unreliable | Intercom, Zendesk, τ²-bench; arXiv 2606.09863; Xiong et al. 2024 |
| Output checks | Rules in the prompt only, nothing checks the reply | Code checks links, prices, format, card digits, handoff shape; one retry naming allowed values | External, specific feedback fixes errors; self-review does not | VeriHarness; Guardrails AI; Huang et al. 2024 |
| Debugging | Reread the whole prompt | Trace per reply: modules, tools, failed checks, escalation source | No standard exists for this; logging what code decided is the practical route | OTel GenAI conventions; Langfuse |
| Side tasks | None | Call-log summary as one small separate call | Sub-agent loops hurt sequential tasks; inline worker calls are what vendors use | Google 2026 agent scaling study; Intercom Fin |
| New care line | Paste into the same prompt | New folder of modules with its own tests | Per-product content with a shared core is the standard pattern | Intercom multi-brand; DoorDash |
| Cost | Full prompt every turn | Smaller prompt, fixed part cached, pre-gated handoffs skip the model | Cheaper and faster; quality is the main reason though | Anthropic prompt caching docs |
| Evaluation | None | Test set from their rules, three reps, ToolFailBench failure labels, against the original prompt with caching | Small single runs are too noisy to trust | Miller 2024; ToolFailBench |

## 8. Latency rule

Everything runs per message at reply time. The new system's median and p95 latency must be no worse than the original prompt's on the same harness. A change that improves accuracy but breaks this is rejected.

- Pre-gate, router, prompt assembly and validators are plain code, each under a millisecond.
- The model reads a much smaller prompt, so the first token arrives sooner.
- A pre-gated handoff skips the model entirely.
- The fallback classifier for the router is left out of v1 because it would add about a second to unmatched messages.
- The call-log summary is precomputed when a call is logged, not built at reply time.
- Retry is capped at one, and its rate is reported. A high rate means a rule file needs fixing.

Work that happens once, before any patient texts: cutting the prompt into files, writing tests, running evals, precomputing summaries.

## Owed before hand-in

- A workflow diagram comparing the original single-prompt flow with the new flow, marking what is new and how each part works.

## 9. Findings from the first live run (five packet messages)

**Cache gap.** The first run cached only the fixed core prompt. The per-message block (modules plus context, about 13,000 tokens) was re-sent uncached on every tool round, so a message with six tool calls cost about three times the original prompt, which caches its whole 60,000-token prompt as one block. Fix: a second cache breakpoint on the per-message block and automatic caching of the growing tool results. Both systems use the same model-call code, so the comparison stays fair.

**Link conflict.** "Do not resend a link already sent" collided with "tell the patient they can pay from their assessment". The model followed the first rule and left the assessment link out. Resolution, in the core prompt: when you tell the patient to do something on a page (pay, book), include that page's link even if it was sent before. This is a general rule, but it was found because a sample message exposed it, and that is stated here so a reviewer can judge it.

**Baseline on the same five messages.** The original prompt missed the Hakan deposit, left out the consultation link, kept answering after "I demand to talk to a human", and did not escalate the card request.
