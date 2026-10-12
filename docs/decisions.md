# Decision log

This file records how the design was reached: what was asked, what was considered, what was chosen, and why. Newest decisions at the bottom.

## 1. Reading the task

The packet asks for three things: break up an 800-line single prompt that drafts patient SMS replies, add a human handoff (`escalate: true`), and ship a repo with a command that turns a JSON array of messages into a JSON array of replies. The owners list eight problems with the single prompt. They grade on their own hidden messages, so the five sample messages are a sanity check, not a target.

Early reading: the prompt already contains its own modules (every "HARD RULE" and stage section) and about 60 BAD/GOOD example pairs taken from real flagged replies. Those pairs are a test set the company already paid for.

## 2. First design, then a correction

A first design was drafted without research: a rule router, skill files, validators, an escalation flag, and precedence numbers inside the prompt. A full build plan followed.

That skipped a step that had been asked for: research first, then scope several methods, then build and compare. The plan was set aside as one candidate, and research was run before any code.

## 3. Research

Six parallel research tracks covered skills and context loading, routing and prompt-length cost, rule precedence and validators, human handoff, evaluation and prompt optimization, and tracing and sub-agents. A writer merged them into `docs/research/report.md`. A separate scrape of practitioner posts was compared against it, and the ToolFailBench paper (arXiv 2607.04686) was mapped onto the evaluation. Both addenda are in `docs/research/notes/`.

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
| Rule text | Policies mixed in one block | Same policy wording, cut into one file per policy | Keeps their policy intact so gains come from structure; each file has its own tests | Packet's own sections; scoped rule files in coding-assistant tools (Cursor, Codex) |
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

## Workflow diagram

Diagrams of the original single-prompt flow and the new flow, with what each part does and why, are in `docs/how-it-works.md`.

## 9. Findings from the first live run (five packet messages)

**Cache gap.** The first run cached only the fixed core prompt. The per-message block (modules plus context, about 13,000 tokens) was re-sent uncached on every tool round, so a message with six tool calls cost about three times the original prompt, which caches its whole 60,000-token prompt as one block. Fix: a second cache breakpoint on the per-message block and automatic caching of the growing tool results. Both systems use the same model-call code, so the comparison stays fair.

**Link conflict.** "Do not resend a link already sent" collided with "tell the patient they can pay from their assessment". The model followed the first rule and left the assessment link out. Resolution, in the core prompt: when you tell the patient to do something on a page (pay, book), include that page's link even if it was sent before. This is a general rule, but it was found because a sample message exposed it, and that is stated here so a reviewer can judge it.

**Baseline on the same five messages.** The original prompt missed the Hakan deposit, left out the consultation link, kept answering after "I demand to talk to a human", and did not escalate the card request.

**Quoting rule.** A second run of the Hakan question printed "a basePrice of 3200 USD" and dropped the deposit. Core prompt now says to give a package's price in the clinic's currency with its deposit, in plain words, without field names. Before a deposit is paid, the deposit is the patient's next cost, so it belongs with every price.

**Cache layout.** The prompt is now three blocks, each cached: the core (same for every message), the chosen modules (same for every message that routes the same way, across patients), and the patient context (reused across tool rounds of one message).

**False positive fixed.** The assessment link contains an ID with long digit runs, and the card-number check read it as a card, which escalated a correct reply. Card checks now ignore links and IDs.

**Assessment link moved from prompt to code.** With the link rule in the prompt, the model included the assessment link in one run and left it out in the next. That is the pattern the research predicts for a small model. Code now enforces it: when a reply tells the patient to pay, book, or open something in their assessment and has no assessment link, code calls the same tool the model would and appends the link as the last line. No retry and no model call. These code-made tool calls are tagged so the tool-use labels ignore them.

## 10. How the original prompt was cut into modules

Each module's body is the original prompt's text for those packet lines, copied verbatim by `scripts/extract-skills.sh`. Nothing in a module was rewritten. Precedence bands: hard rules 20, guidance 30, stage 40 (stage loads last so a specific rule sits before general stage guidance).

| Module | Packet lines |
|---|---|
| stage-lead | 1250–1254 |
| stage-prep-pre-clinical | 1256–1262 |
| stage-pre-clinical-sent | 1264–1316, 1318–1324 |
| stage-meeting-booked (also MEETING_COMPLETED) | 1326–1336 |
| stage-meeting-missed | 1338–1339 |
| stage-waiting | 1341–1342 |
| financing-geography | 809–817 |
| health-insurance | 821–838 |
| carecredit | 842–858 |
| clinic-website | 862–873 |
| payment-and-deposit | 1439–1451, 1436–1438, 1026–1027 |
| promo | 1523–1528 |
| deposit-eligibility | 1030–1036 |
| clinic-and-package-facts | 960–989, 1212–1246, 1387–1395, 1430, 1456–1460, 1412 |
| clinic-status-tiers | 1369–1385 |
| assessment | 1431–1435, 1000, 1418 |
| image-delay | 1344–1360 |
| time-bound-pause | 1170–1210, 996 |
| consultation | 1453–1455, 1362–1367, 1406–1407, 1420 |
| off-channel-requests | 894–920, 922–927 |
| policy-grounding | 929–952 |
| creator-partnership | 954–958 |
| collection | 788–805, 1004, 1016–1017, 1043–1050, 1052–1056, 1058–1066, 1068–1099, 1101–1132, 1417 |
| reversibility | 1134–1168 |
| direct-clinic-quote | 1038–1041 |
| travel | 1397–1404, 1427–1429, 1006 |
| preferences-and-dates | 1414–1415, 1437 |
| why-doctours | 1452 |
| recovery | 999, 1000 |
| fertility | written stub for a second care line, no packet source |

**Two lines dropped**, because they contradicted the core escalation list:

- Line 921: an example whose "correct" reply answers a request to hold a clinic date. Holding a date is now a handoff to a person.
- Line 1317: "requests outside normal checkout are routed to a person before they reach you; if one slips through, answer the rest." Those requests now escalate. Its payment-link fallback sentence moved into the core prompt.

**Conflict rules now enforced in code** (the sentence stays in the module text, the router does what it says):

- time-bound-pause suppresses collection: packet lines 785 and 805 say a pause skips the collection ask.
- image-delay suppresses collection: lines 1110, 1128 and 1345 say a hair-state photo delay overrides the photo ask.
- image-delay suppresses time-bound-pause: lines 1190 and 1203 say a hair-state delay keeps the two-week reminder, not a month.

These apply to the current message only. Rules that depend on earlier turns ("photos stay deferred on later turns", lines 805, 1352, 1393) still rely on the model reading the history.

**Conflict rules left as text**, because both modules are needed in the same reply or the rule depends on tool data or history: financing vs insurance vs CareCredit lead-in order (815, 1450, 1321), pausing vs funnel advancement (1324), Instant Form intro vs consultation intro (1050, 1053), no URL before a first reply (1004), reversibility vs stage rules (1138, 1146), package aiContext overriding general rules (971, 972, 981).

**Known gaps**, in neither the core nor any module: don't invent clinic nicknames (997), after a failed payment method suggest only the next option (884, 1549), and the hold-notice rule. Each is rare for a pre-deposit patient and would push the core past its size cap.

## 11. Pre-gate and router details

- The pre-gate matches per sentence. A card number needs a Luhn-valid run or a card word next to it, and a number starting with "+" is treated as a phone number. Negated or recurring-billing charge sentences do not fire. Identity questions ("are you a bot?") do not fire.
- The router applies suppression before the three-module cap, and the stage module can never be suppressed. The cap keeps the modules with the most trigger hits, then lower precedence, then the more specific module.
- The trace's routing list includes every module that matched, so capped modules are visible: routing minus loaded minus suppressed.

## 12. First measured run and triage

Run v1 (`results/runs/v1/`): 107 cases, 3 reps each, same model (claude-haiku-5-5), same tools, same schema, same caching for both systems.

| | Original prompt | New system |
|---|---|---|
| Pass rate | 70.7% | 88.5% |
| Paired per case | | +17.8 points (SE 4.5); 35 wins, 11 losses, 61 ties |
| Escalation recall | 58.8% | 98.0% |
| Escalation precision | 90.9% | 89.3% |
| Median / p95 latency | 5.3 s / 9.8 s | 3.4 s / 7.4 s |
| Cost per 1,000 turns | $1.72 | $0.90 |

The original prompt is strong on ordinary policy questions (83% on the 90 cases that should not escalate). Most of the gain comes from escalation and from fewer ignored or invented tool values.

Triage of the 11 per-case losses:

- **Validator too strict (history traps).** The model gave the right price and corrected the wrong one from the chat history ("I quoted $4,200 earlier, which was wrong"). The price check treated $4,200 as invented and escalated. Fix: a number from the chat history is allowed when its sentence is a correction; stated as fact it is still blocked. Same rule in the tool-use labeler.
- **Routing misses.** "$300-off code" did not load the promo module (hyphen); "will the clinic contact me?" did not load the module that says clinic contact comes after the deposit; "edges pulled out from braids" loaded the photo-delay module, which then suppressed the photo request. Trigger lists fixed, each with a test.
- **Call requests.** In one rep the model escalated "can you just call me instead?". The packet's rule is to offer the free consultation call and keep helping. The core prompt now lists a call request among the things that get a normal answer.
- **Test-case bugs**, reported to the case owner: "3 hotel nights" did not match "3 night"; negated replies ("you don't need to bring a hat", "you don't pay the rest to the clinic") matched forbidden phrases; the fertility check missed "isn't something I have details on".
- **Left as known gaps:** first-contact lead replies sometimes open with "Sorry" or leave out the upload link (both systems fail these); the model sometimes answers "who makes the incisions" without checking the package's notes.

## 13. Advisor tool: considered, not on the main path

The advisor tool lets a fast model consult a stronger one mid-generation. Not adopted on the main reply path: the docs call it a weak fit for single-turn Q&A, each consult adds a non-streaming call to a larger model, which would break the latency rule, and most remaining failures are routing and checking problems, not reasoning. It is a candidate pivot on the retry path only (2.8% of turns, first-retry fix rate 37.5%), paired with an advisor that returns plaintext advice (Opus 4.8 on a Haiku 5.5 executor) so the trace stays readable.

## 14. Run v2

Run v2 (`results/runs/v2/`): the new system after the triage fixes in section 12, against the same baseline replies, all rescored under the corrected test cases.

| | Original prompt | New system |
|---|---|---|
| Pass rate | 74.1% | 97.2% |
| Paired per case | | +23.1 points (SE 3.8); 35 wins, 2 losses, 70 ties |
| Escalation recall / precision | 58.8% / 90.9% | 100% / 96.2% |
| Median / p95 latency (turns that reached the model) | 5.3 s / 9.8 s | 3.7 s / 7.1 s |
| Cost per 1,000 turns | $1.72 | $0.88 |
| Retries that fixed the reply | n/a | 4 of 4 |

**Caveat.** The v1 to v2 gain came from fixing problems found on this same test set. Each fix is a general rule (a routing phrase, a validator rule, one core prompt line), not a patch for one case, but the v2 number is still optimistic for unseen messages. The v1 number (92.8% after case fixes) is the better estimate of first-contact performance.

**Open judgment call: call requests.** The consultation module keeps the original text "requests for such a call are routed to a person before they reach you; if one slips through, ... keep helping over text". The core prompt says to answer a call request with the free consultation. The model escalated "can you just call me instead?" in 2 of 3 reps. Both readings are defensible from the brief. Offering the consultation keeps the patient helped; escalating matches the company's upstream routing. Left as is and reported.

**Remaining failures** (9 of 321 turns): the call-request ambiguity (2), "who makes the incisions" answered without checking the package's notes (2), first-contact replies missing the upload link (2), and three single-rep misses.

## 15. Blind held-out set

The dev set's numbers are optimistic because fixes were found on it. A fresh agent wrote 25 new cases from the brief alone: it could not see the modules, the core prompt, the pipeline, any results, or the dev set's expectations. Every case uses the brief's patient. Each has a correct and a wrong reply checked against the case's own tests. Both systems ran once, 3 reps, before any change was made because of it (`results/runs/heldout/`).

| | Original prompt | New system |
|---|---|---|
| Held-out pass rate | 74.7% (56/75) | 89.3% (67/75) |
| Must-escalate recall | 83.3% | 100% |

The original prompt failed mostly on escalation (it flagged the handoff, then kept writing). The new system's 8 failures were three kinds, all coverage gaps on new wording:

- "does blue cross cover any of this?" did not load the insurance module (no trigger phrase matched).
- "need to talk to my wife first" did not load the pause module.
- "my card limit is like 1k" made the reply's "$1,000" look invented, because "1k" was not read as 1,000.

## 16. Final review and fixes

A fresh reviewer, with no part in the build, read the whole codebase. No critical issues. Four important ones, each fixed with a test that failed first:

- The pre-gate handed off "can I talk to someone at the clinic?" on the first ask; the brief says the first ask gets an answer.
- An empty-string escalation reason could reach the output where the contract requires null.
- The head-covering check flagged the correct reply "you don't need to bring a hat".
- An API rate-limit error after the SDK's retries became a handoff. Now the client retries 6 times with backoff, and the CLI retries a failed message once more before handing it to a person.

Also fixed: "1k" is now read as 1,000 (found on the held-out set, so disclosed). Thirteen minor findings were deferred; the ones that still matter are under Known limitations in the README.

## 17. Router fallback

The held-out set showed the expected weakness of phrase routing: new wording misses its module. The plan already named the fix, to be added only once traces showed misses. When no policy module matched and the message is more than an acknowledgement, one small model call picks up to three modules from one-line descriptions. It fails open: on any error the message goes ahead with the stage module only. `ROUTER_FALLBACK=off` turns it off.

Cost: about one extra second, only on messages no phrase matched and that are not acknowledgements (about 5 to 15% of messages in the dev and held-out sets). The latency rule is checked again in run v3.

This change was motivated by held-out failures, so the held-out set is no longer blind to it. The clean test is an external set written by a different author and model, which neither system has seen.

## 18. External test set

A different model wrote 120 cases from the brief alone (`tests/external/`, with its rule inventory in `coverage.md`). It never saw the repo. Every case's own good example passes its checks and its bad example fails, before either system ran. Both systems ran 3 reps (`results/runs/external/`). The minor review fixes (section 16 list, committed 4d24129..2aa0948) were chosen before any external result was seen, so both new-system runs are blind.

| | Original prompt | New, before minor fixes | New, after minor fixes |
|---|---|---|---|
| All cases | 68.3% | 85.8% | 86.4% |
| Must escalate (75 runs) | 0% | 77.3% | 82.7% |
| Must not escalate (285 runs) | 86.3% | 88.1% | 87.4% |
| Escalation recall / precision | 50.7% / 92.7% | 77.3% / 98.3% | 82.7% / 98.4% |

What the failures show (after reading every failing reply):

- **Escalation list is narrower than the brief.** Missed: "check which dates are still free" (the original prompt itself says this goes to a person), "arrange transport from my own hotel", "move my deposit to Gold now" (no deposit is on file, so the model said there was nothing to move), and "arrange a separate callback". The last one conflicts with our earlier choice to offer the free consultation; the original prompt supports both readings.
- **One validator false positive.** The patient named "Silver and Gold"; the reply repeated the names, the package-name check fired, and after the retry it handed off. Package names the patient wrote should be exempt, as prices already are.
- **A regression of ours.** Trimming the core prompt shortened "always reply in English, whatever language the patient writes in" to "always reply in English", and the model answered a Spanish request in Spanish.
- **A routing miss.** "Could a direct Heva deposit move into Doctours?" did not load the direct-deposit module.
- **Checks that are stricter than the policy** (not counted as system failures in this analysis, but left in the score): "automatic" required where the reply said "charged to your saved card each month", "not refundable" required where it said "wouldn't qualify for that refund", and a ban on resending the assessment link that conflicts with the brief's own graded sample reply, which includes it.

## 19. Generalization round

Asked to make the system better on messages nobody has seen, without fitting it to the test sets. Rules for this round: every fix is a general rule stated in policy terms; each new escalation trigger comes with its look-alike that must not escalate; no test-set sentence appears in any prompt, module or description (a test enforces this); two new blind sets were written by fresh agents before the fixes were finished, and are scored once, on the frozen system.

Changes, each with tests:

- **Escalation coverage** (from the external set's misses): checking which dates are open, arranging hotel, transfer or driver, moving or refunding a payment the patient says they made to Doctours even if none shows, and a call other than the free consultation (own commit, user-approved reading). Each paired with the answerable look-alike in the core prompt. Two original-prompt examples that answered these without a handoff (lines 922 and 1406–1407) were dropped from modules.
- **English only**, even when asked for another language (a regression from trimming the core prompt).
- **Package names the patient wrote** no longer trip the "named a package without looking it up" check (the one false escalation on the external set).
- **Soft vs hard checks.** After one failed retry, a reply that only trips a heuristic is sent; only invented links or prices, card digits, false handoff claims and banned promises go to a person.
- **Module descriptions.** Each policy module has one sentence of patient intent, so the fallback classifier routes unseen wording by meaning. Its prompt is cached.
- **Uncovered rules placed:** after a failed payment method suggest only the next option; never invent clinic nicknames; an earlier hold notice is already handled.
- **Edge inputs** (a separate session, 30 tests): found and fixed a regex that froze on long "kkkk…" runs and card numbers split across lines that slipped past the pre-gate.

**Routing A/B** (`results/runs/ab-routing/`). Union mode runs the classifier on every message and merges its picks with phrase matches. Pre-registered rule: adopt only if it raises the combined pass rate on dev, held-out and external and keeps median and p95 latency below the original prompt's.

| | Fallback | Union | Original prompt, same load |
|---|---|---|---|
| Dev | 98.1% | 97.2% | 78.5% |
| Held-out | 100% | 100% | |
| External | 90.0% | 90.0% | |
| Median latency, dev / external | 3.5 s / 4.2 s | 4.7 s / 5.3 s | 5.2 s (dev) |

Union did not help and broke the latency rule on the external set. Fallback stays the default; union remains available with `ROUTER_MODE=union`.

Remaining ambiguities: "can you just call me instead?" now escalates (3 of 3) under the callback rule, while the dev set expected an answer; "move my direct Heva deposit into Doctours now" gets the direct-deposit answer (new deposit needed) in 2 of 3, while the external set expected a handoff. Both readings are defensible from the brief.

## 20. Final runs, blind sets, and after the freeze

The system was frozen at commit 8ec6390 and run once on all five sets (`results/runs/final/`). The two sets written blind during the generalization round (escalation stress, robustness) were scored only then.

| Set | Original | New (frozen) | Paired difference |
|---|---|---|---|
| Escalation stress (blind) | 67.8% | 96.7% | +28.9 (SE 6.5) |
| Robustness (blind) | 78.3% | 90.6% | +12.2 (SE 5.4) |
| External | 68.3% | 92.5% | +24.2 (SE 3.9) |
| Held-out | 74.7% | 100% | +25.3 (SE 8.5) |
| Dev | 78.5% | 98.8% | +20.2 (SE 3.8) |

The honest reading: the lead is in handoffs. On blind cases that should not escalate, the systems are within noise of each other (95.0% vs 97.5% stress, 88.9% vs 90.8% robustness). The new system is faster and about half the cost on every set.

Three general bugs from the blind sets were fixed after scoring (commits 2b964ec, 7b55b31, f5e2652): past-patient phrasing in the pre-gate, refund-terms questions read as refund requests, and pause signals in multi-question messages. A regression run stopped partway when the API credit ran out; on the 636 turns both versions completed, passes went 606 to 608, false escalations 3 to 0, missed escalations 3 to 4. Not blind, not used in the headline.

## 21. Completed post-freeze run and final audit

After the API credit was topped up, all five sets were rerun on the post-freeze system (f5e2652) with no infra errors: stress 100% (false escalations 5 to 0), robustness 91.1% (1 to 0), external 92.2%, held-out 98.7%, dev 97.8%. Across 1,116 turns, 1,062 passes before the fixes and 1,064 after.

The independent audit of the frozen runs (`results/runs/final/audit.md`) re-scored every reply with no mismatches and confirmed the reading: all of the new system's lead is in handoffs; on blind cases that should not escalate the original prompt is 1.4 to 3.5 points ahead in every scoring variant. It also corrected one point: the external set is not blind for the final system, because fixes were made from reading its failures. False passes were under 5% of passing turns for both systems and change no comparison. Remaining known gaps are listed under Known limitations in the README.
