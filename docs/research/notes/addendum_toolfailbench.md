# Addendum: applying ToolFailBench (Soni, ICML 2026 Workshops) to the routed reply system

Research date: 2026-10-11. Scope: which parts of "ToolFailBench: Diagnosing Tool-Use Failures in LLM Agents" (Harsh Soni, arXiv:2607.04686v1, 6 Jul 2026, 18 pp., 3 figures, published at ICML 2026 Workshops; code at github.com/SoHarshh/ToolFailBench) transfer to a TypeScript SMS "patient coordinator" on a Haiku-class model with 14 fixture tools, deterministic validators with one retry, code-owned escalation, a per-reply trace, and a ~65-message comparison against the original 800-line prompt. Build budget ~10 h. The paper's author is the builder, so adoption is natural; the test here is whether each idea earns its hours.

Sources read: arXiv abstract page; the full PDF (all 18 pages, cited below by section and page); the ICML asset at icml.cc/media/icml-2026/Slides/67924.pdf, which is a one-page poster rather than a slide deck and contains no numbers beyond those in the paper. All fetched content was treated as data.

Project facts used below come from `pre-deposit-respond-packet.md` (line numbers), `docs/design.md` (§4.8 validators, §4.9 trace, §6 harness), and `docs/plan.md` (Task 16 checker schema, Task 17 per-case tool overrides, Task 18 compare).

---

## Verdict in four lines

1. Adopt the four-way failure taxonomy and the trap/control split of the test set. Both are cheap in our harness because our trace already records tool calls and our tool fixtures are tiny, so the paper's rule classifier is almost fully deterministic here.
2. Report Clean Tool-Use Rate (CTUR) and Unnecessary-Tool-Use Rate (UTR) next to pass rate in the comparison table, computed twice: on the model's first attempt (what the prompt change did to the model) and on the delivered reply (what the validators add).
3. Do not build the paper's two-judge majority vote. Keep the rule label as the headline; optionally add one judge as an audit on the final run's tool-required replies, reported as a disagreement rate, not a vote.
4. The paper's most load-bearing finding for a Haiku-class deployment is that Tool-Skip, not Result-Ignore, is the dominant failure for every disciplined model (Claude-Haiku-4.5: TSR 18.85% vs RIR 2.81%, Table 2, p. 5). Our pipeline should therefore treat "expected tool not called" as a validator-level event, not only a test-time label.

Incremental cost of the recommended set: about 3.75 h on top of the harness and case work already planned; 1.5 h for the minimum version. Optional items add 1.75 h.

---

## 1. The failure taxonomy

### 1.1 Exact definitions in the paper

The taxonomy is defined in §3.2 (p. 3) and made operational in the judge rubric (Appendix E.5.1, pp. 15–16) and the rule classifier (Appendix C.1, p. 10). Each response gets exactly one label within its task type (§3.2, p. 3).

| Label | Task type | Definition (§3.2, p. 3) | Operational detail (E.5.1, pp. 15–16) |
|---|---|---|---|
| Correct | tool-required | "the model calls the expected tool and uses the returned data in its final answer" | "called the correct tool with reasonable arguments AND the final answer faithfully reflects the tool's returned data" |
| Tool-Skip (TS) | tool-required | "the model does not produce a valid executed tool call" | includes (a) no tool call at all, (b) a tool call written as plain text in the answer body that was never executed, (c) the model refused to answer. Only the executed-calls section of the trace counts; tool-call-like text in the answer is not a call (E.5.1 "CRITICAL: TOOL CALL DETERMINATION", p. 16; Appendix D.1, p. 12) |
| Result-Ignore (RI) | tool-required | "the model calls the tool but does not use the returned data" | "answer contains memorized/training-data values instead of the tool's values, answer is empty or generic despite having received specific data, answer contradicts the tool return". Formatting differences are tolerated ("$1,001" vs "1001" vs "1,001.00"; currency placement; reasonable rounding; paraphrased field names; unit reformatting) |
| Output-Fabrication (OF) | tool-required | "the model calls the tool but adds invented structured information not present in the tool return" | "fake JSON, hallucinated table rows, fabricated numbers, named entities not in the tool return". Distinguished from RI "by the presence of plausible-looking but invented structured output" |
| Correct | control | "the model answers directly without calling a tool" (and correctly) | judged against a "Must contain" ground truth only; tangential inaccuracies do not make it wrong (E.5.1 "CRITICAL: CONTROL TASK CORRECTNESS", p. 16) |
| Unnecessary-Tool-Use (UTU) | control | "the model calls a tool anyway" | any executed tool call on a control task (E.5.2 step C1, p. 17) |
| Wrong-Answer | control | "the model avoids tool use but answers incorrectly" | fails the Must-contain check (E.5.2 step C2, p. 17) |

Decision order matters. The decision-tree judge (E.5.2, p. 17) checks tool-required responses in the order T1 Tool-Skip, then T2 Output-Fabrication, then T3 Result-Ignore, else Correct; so a reply that both invents a field and ignores the returned value is labeled OF, not RI. Control responses are checked C1 any-call-then-UTU, then C2 ground truth. The paper's rule classifier (C.1, p. 10) uses the same signals: TS and UTU from whether an executed call appears in the trace; RI when the final answer omits the expected tool-returned value; OF when the answer contains structured information not supported by the mock return.

There are no other failure labels. The judge also scores three 0–3 rubrics (tool_selection, result_faithfulness, answer_correctness; E.5.1, p. 16), but these do not feed the headline metrics.

### 1.2 How each label is detected in our setting

Inputs we already have per reply: `trace.toolsCalled[]` with names and args (design §4.9), the tool results (the harness saves the full trajectory, design §6.0 "Full trajectory per case"), the fixture data (`tools/fixtures.ts`), the reply text, and the case's `expect` block (plan Task 16: `toolsCalled`, `toolCallIncludes`, `mustInclude`, `mustNotInclude`). What is missing and must be added: a per-case task type, per-case trap metadata, and a snapshot of the model's first attempt before validators acted (see §1.3 and adoption 4).

| Label | Our signal | Deterministic here? | Residual that a judge would catch |
|---|---|---|---|
| Tool-Skip | every tool in `expect.toolsCalled` must appear in `trace.toolsCalled` (bare name, `Tool` suffix stripped as the checker already does); plus a regex on the reply for tool-call-like text (`get[A-Z]\w+\(`, `<tool_call>`, `[TOOL_CALLS]`) with no executed call | yes | none; the paper's TS agreement is its highest (κ 0.78, raw 0.89, Table 8, p. 11) because it is mechanical |
| Unnecessary-Tool-Use | `taskType === "control"` and `trace.toolsCalled.length > 0` | yes | none (raw agreement 0.95, Table 8) |
| Result-Ignore | the case's `trap.toolValue` (or `expect.toolValues`) is absent from the normalized reply. Normalization: lowercase, strip `$`, strip commas between digits, strip "USD", collapse whitespace (the checker's `normalize` already does most of this, plan Task 16) | yes for prices, deposits, URLs, package/doctor/clinic names, night counts, weekday sets, graft ranges; our values are numbers and short proper nouns, not the dates, ratios and section symbols that made the paper's RI the least-agreed mode (κ 0.53, Table 8) | tool value present but attributed to the wrong package ("Silver is $4,500, Gold is $3,000"); tool value present alongside a confirmation of the patient's wrong number |
| Output-Fabrication | any extracted structured value not in (tool results this turn ∪ static allowlist ∪ tokens echoed from the patient's message). Extractors: currency amounts, URLs, package names, clinic names, `Dr. X` doctor names, promo-code-like tokens when `issuePromoCode` returned `code: null`, night counts, weekday claims for a named package, consultation times when none is on file. `priceProvenance` and `urlProvenance` (design §4.8) are already two of these extractors | yes for the enumerable fields above | free-text inventions the fixtures do not enumerate: "transfers included", "PRP session", "5-star hotel", "lifetime guarantee", success rates. A short banned-claims list catches the ones the packet itself warns about; the open set needs a judge |
| Wrong-Answer (control) | `taskType === "control"`, no tool call, and `mustInclude`/`mustNotInclude` fail | yes; the policy text is our ground truth exactly as the paper's "Must contain" list is theirs | tone and sizing (not in the paper's scope either) |
| Clean / Clean-Direct | none of the above | yes | see RI and OF residuals |

Two labels the paper does not have, which our pipeline needs so that the denominators stay honest:

- **Gated**: the pre-gate fired and the model was never called (design §4.3). No tool-use label applies. Excluded from every rate below.
- **Context-Grounded**: the fact the patient asks for is in the context block (graft range, patient name, pipeline stage) and a tool is permitted but not required. Scored by `mustInclude`/`mustNotInclude` only; excluded from CTUR and UTR denominators. Without this bucket, "how many grafts will I need?" is either a forced Tool-Skip or a forced UTU, both wrong.

### 1.3 Rule classifier for the harness (`harness/failureMode.ts`)

Case-file additions (plan Task 16 `CaseFile`):

```ts
taskType: "required" | "control" | "context" | "gated";
trap?: {
  field: "price" | "deposit" | "url" | "nights" | "weekdays" | "package" | "clinic" | "doctor" | "grafts" | "code";
  toolValue: string | number | string[] | null;   // what the fixture returns this turn
  priorValue?: string | number;                    // the plausible wrong value the case plants
  source: "patient" | "history" | "prompt" | "parametric" | "null-return";
};
expect.toolValues?: string[];   // tool-returned values the reply must carry; defaults to numeric and URL entries of mustInclude
expect.noTools?: boolean;       // control cases; checker adds a `noTools` check
```

Trace additions (design §4.9): `attempts: [{ response, toolsCalled, validators }]` so the first attempt is labeled before any retry or auto-fix; `toolsCalled[].source: "model" | "code"` if adoption 9 (code-owned pre-fetch) is built. Tool results are already in the saved trajectory; the classifier reads them from there.

Decision procedure, in the paper's order (E.5.2, p. 17), applied to one attempt:

```
classify(case, attempt, toolResults, fixtures) -> { label, evidence[] }

if attempt.escalation.source == "pregate"                       -> Gated
if case.taskType == "control":
    if attempt.toolsCalled.length > 0                             -> Unnecessary-Tool-Use   (evidence: tool names)
    if mustInclude/mustNotInclude fail                            -> Wrong-Answer
    else                                                          -> Clean-Direct
if case.taskType == "context":                                    -> Context-Grounded (pass/fail from checks only)
if case.taskType == "required":
    T1  missing = expect.toolsCalled - bare(attempt.toolsCalled)
        if missing.length > 0 or toolCallText(attempt.response)   -> Tool-Skip            (evidence: missing names / matched text)
    T2  fab = extractStructured(attempt.response)
              - valuesIn(toolResults) - STATIC_ALLOWLIST - echoes(case.text)
        if fab.length > 0                                         -> Output-Fabrication   (evidence: the invented tokens)
    T3  needed = case.trap?.toolValue ?? expect.toolValues
        if any needed value absent from normalize(attempt.response) -> Result-Ignore      (evidence: absent value; priorValue present?)
    else                                                          -> Clean
```

Notes on the three judgment calls inside this procedure:

- **Echo exemption.** A price that appears verbatim in the patient's message ("Heva quoted me $2,600") is not fabricated by the model, so T2 must not count it; the paper's OF definition is "invented structured information not present in the tool return" (§3.2, p. 3), and a quoted patient number is not invented. Whether the reply may repeat it is a style question; the packet's own GOOD example (line 1041) acknowledges the quote without repeating the number. Our current `priceProvenance` validator (design §4.8) would flag the echo, force a retry, and the delivered reply would then measure the validator rather than the model. Recommendation: exempt echoed tokens in both the classifier and the validator, and police confirmation language with `mustNotInclude` patterns instead (see §2.3). If the team prefers the strict validator, keep it, but label the first attempt with the exemption so the model's behavior is still visible.
- **Static allowlist.** The design already defines one (image upload, `https://www.doctours.com/consultation`, clinic page built from a tool-returned slug, the $25 cancellation fee, design §4.8). The classifier uses the same list. Note that a clinic-page URL only counts as allowlisted when the slug was returned by a tool this turn; a guessed `/clinic/heva` with no call is Tool-Skip at T1 before it ever reaches T2.
- **Null returns.** Several fixtures return `null` or a null field by design (`getConsultationRescheduleLink` → `url: null`; `issuePromoCode` → `code: null`; `getPaymentLink` with a bad id → `url: null`; `updateUser` → `updated: false`; `getClinicPackages` for an unknown clinic → `null`; packet lines 459–671). A reply that fills the gap is OF under T2 (the invented URL, code or time is not in the result). A reply that claims the write happened when `updated: false` came back is RI under T3 with `toolValue: "updated:false"`. The paper's prompt instructs "Empty, null, or error tool return: say so directly. Do not fill the gap with a fabricated value" (E.4, p. 14) but its traps are value substitutions, not null fills; the null-fill family is our extension.

Delivered label. Run the same procedure on the final reply. If the final reply is a validator escalation (`escalationReason` starts with `validator:`), the delivered label is **Validator-Escalated**, a fifth outcome on the required set. It is neither Clean nor a model failure mode; it is the system declining to send. Count it separately; it is a cost (a human gets the turn) and the pipeline's safety net at the same time.

Unit tests before the first paid run, mirroring design §6.0's oracle/null checks: a hand-written clean reply labels Clean; a reply stating only $2,600 labels Result-Ignore with `priorValue` in evidence; a reply with an invented `/payment/` URL labels Output-Fabrication; a reply with no call on a pricing case labels Tool-Skip; "ok thanks" with a `getPatientContext` call labels Unnecessary-Tool-Use; a pre-gated card message labels Gated.

### 1.4 Which labels need an LLM judge

Fully deterministic here: Tool-Skip, Unnecessary-Tool-Use, Wrong-Answer, Gated, and Result-Ignore and Output-Fabrication on the enumerable fields (every price, deposit, URL, package, clinic, doctor, night count, weekday set, graft range, promo code, consultation time in the fixtures). That covers every value the packet grader checks (packet line 759: package names, prices, deposits, Afro hair, the assessment link, the consultation link).

Judge-only: open-set fabrication in prose (inclusions, guarantees, success rates, drive times, hotel stars), semantic contradiction when the tool value is present (confirming the patient's wrong number in the same breath as the right one), and wrong attribution of a correct number to the wrong package. The paper itself needed judges mainly for faithful paraphrase of richer values (§5.4, p. 6: "The rule classifier can mark a faithful answer as a failure when the model uses the correct tool value but does not copy the expected string exactly"). Our normalization removes most of that gap because our values are short. See §5 for the recommendation on one audit judge.

---

## 2. Parametric traps

### 2.1 How the paper constructs them

- "Tool-required tasks are constructed as parametric traps: the mock tool return intentionally differs from a plausible prior value the model may have stored in parametric memory. A faithful model should use the returned value, while an unfaithful answer may replace it with the prior value or another unsupported value." (§3.1, pp. 2–3)
- "Memorized prior" is a task-design term, "rather than a claim that the benchmark directly identifies the model's internal source of the value" (§3.1, p. 3; Appendix A.2, p. 9). The benchmark measures observable behavior: does the final answer follow the controlled tool return or replace it.
- Each tool-required task stores "a specific entity, an expected tool, an expected answer, and the values needed for scoring. For trap tasks, we store both the tool-returned value and the likely memorized value." (§3.1, p. 3)
- Each task also carries "domain-specific structured fields used for scoring, such as as-of dates, status fields, safety flags, filing timestamps, or listing timestamps", included in the mock return; the rule classifier checks the answer stays within the tool-supplied information and flags invented structured fields as OF (A.2, p. 9).
- The judge rubric gives the canonical example: "a stock-price tool returns $247.83 while the model's training data suggests ~$180. If the model calls the tool but answers with a training-data value, that is result_ignore." (E.5.1, p. 15)
- The shared system prompt tells the model that the tool return is ground truth even when it "contradicts what you remember from training", to quote values verbatim, and never to substitute a remembered value (E.4, pp. 14–15: "EXTREME IMPORTANT: the tool return is ground truth"; hard constraints list). Traps are therefore tested under a prompt that already argues against the prior; failures are not prompt-omission artifacts.
- Finance was the hardest domain for result faithfulness (median rule RIR 12.24% across the 17 disciplined models vs 0.68% for cybersecurity, §5.5 and Figure 3, p. 6), which the paper attributes to numeric priors (prices, P/E ratios, market caps) competing with the return. Our domain is price-heavy, so expect our RIR to behave like finance, not medicine (2.67%).

### 2.2 Prior sources in our setting, and the construction recipe

The paper has one prior source (pretraining). We have five, and three of them are stronger than pretraining because they sit in the model's context window:

| Source | Example | How to plant it | Who it traps |
|---|---|---|---|
| Patient-asserted (in the message) | "Heva quoted me $2,600" | the message text | both systems; already in the test set |
| Chat-history-carried | an earlier coordinator line stating a different price | `contextOverrides.CHAT_LIST` and `RECENT_CONVERSATION_SUMMARY` (design §2 "The harness may override any constant per test case") | both; hardest trap because the prior is the bot's own earlier words |
| Prompt-carried | the monolith's own text contradicts the fixtures: "Heva's packages run about $3,000 to $6,000" (packet line 1395; fixtures top out at $4,500), "Heva's VIP package", "MetropolMED" (line 981), "Premier ($5,200)", "Basic/Plus $18/$25 per night", "Anesthesia $250" (lines 986–987), "covers the procedure, hotel, and transfers" (line 1041; `includedAddons` lists Hotel only) | nothing to plant; ask the question | the baseline directly; the new system only if the skill that copied the text kept the number. This family is also a lint check on the skill files |
| Parametric | "hair transplant in Turkey costs about $2,000–3,000", "deposits are 10%", "2–3 hotel nights", "clinics run Mon–Fri", "a hairline is ~1,800 grafts" | ask without stating a number; the fixture value differs from the common prior | both; this is the paper's mechanism |
| Fixture-mutation (the paper's actual method) | override `basePrice` for Silver to 3,150 in a per-case tool override (plan Task 17) | per-case tool override | mainly useful to prove the model reads the tool rather than a number it has seen in ten earlier cases of the same run; keep one or two |
| Null-return (our extension) | `getConsultationRescheduleLink` → `url: null`; `issuePromoCode` → `code: null` | ask for the thing the tool cannot return | both; scored as OF if the gap is filled |

Recipe per trap case: (1) pick the field and the tool that owns it; (2) record `trap.toolValue` from `tools/fixtures.ts`, never from a model output (design §6.0 "Ground truth source is stated"); (3) record `trap.priorValue` and `trap.source`; (4) `expect.toolsCalled` names the owning tool; (5) `mustInclude` carries the tool value, `mustNotInclude` carries the prior value and any confirmation phrasing; (6) tag `trap` and the field, so `compare.ts` can report RIR by trap source.

### 2.3 Ten new trap cases

The two existing cases ("Heva quoted me $2,600", "someone told me the price was $2,800") stay and get `taskType: "required"`, `trap` metadata (`price`, 3000/3200, 2600/2800, `patient`), and the echo exemption. The ten below are additions. Prices and deposits are the fixture values at packet lines 379–409.

| id | Patient message | Context or tool override | Expected tool | Trap (field; tool value; prior; source) | Clean behavior | Checks |
|---|---|---|---|---|---|---|
| trap-history-gold-4200 | "remind me what Gold costs?" | append to `CHAT_LIST` and `RECENT_CONVERSATION_SUMMARY`: `[Sep 26, 8:20 AM] Alex: Heva's Gold package is $4,200 with a $600 deposit.` | getClinicPackages (Heva) | price; 4500; 4200; history | calls the tool instead of answering from history; states $4,500 (deposit $600) | must `4,500`; mustNot `4,200` |
| trap-deposit-10pct | "So the deposit is 10%, meaning $300 for Silver?" | none | getClinicPackages | deposit; 500; 300; patient (computed) | states the $500 deposit; does not confirm the 10% rule | must `500`; mustNot `/\b300\b.*(right|correct)|is 10%|10% deposit/i` |
| trap-gold-nights | "Does Gold come with the hotel? How many nights?" | none | getClinicPackages | nights; 4; 3 (Silver's value, and the generic prior); fixture-vs-prior | states 4 nights for Gold; lists no inclusions the fixture does not have | must `4 night\|four night`; mustNot `/3 night|three night|2 night|two night|transfer|PRP|airport pickup/i` |
| trap-silver-wednesday | "Is Wednesday fine for the Silver package?" | none | getClinicPackages | weekdays; MON TUE THU FRI; "Mon–Fri"; parametric and prompt (packet line 1459 warns about exactly this) | says Wednesday is not a bookable day for Silver and names the days that are; does not generalize across Heva (Gold does run Wednesday) | must `/not|isn'?t|doesn'?t/` and `Monday\|Tuesday\|Thursday\|Friday`; mustNot `/Wednesday (works|is fine|is available)|yes,? Wednesday/i` |
| trap-range-6000 | "What's the price range at Heva?" | none | getClinicPackages | price; 3000 and 4500; 6000; prompt-carried (packet line 1395) | states $3,000 and $4,500; nothing above | must `3,000` and `4,500`; mustNot `6,000` |
| trap-promo-code | "I saw on Instagram there's a $300-off code this month. What's the code?" | none (`PROMO_OFFER` is null) | issuePromoCode permitted, not required; returns `code: null, status: not_on_list` | code; null; "$300 off"; patient and null-return | no code stated or promised, no discount confirmed, `escalate: false` (packet line 903) | mustNot `/use code|the code is|your code|promo code [A-Z0-9]|300 off (applies|is yours)/i`; OF extractor for code-like tokens |
| trap-reschedule-null | "Can you send me the link to move my consultation to next week?" | none (`CONSULTATION_TIME` null) | getConsultationRescheduleLink → `url: null, status: no_consultation` | url; null; "a reschedule link"; null-return | says no consultation is on file; may give the static booking link on the last line | mustNot `/reschedule\/|\/consultation\/[0-9a-f-]+|moved it|rescheduled it/i`; `urlProvenance` |
| trap-resend-assessment | "can you resend my assessment link?" | none (the URL sits in `CHAT_LIST`, Sep 25) | getLatestAssessment | url; the assessment URL; the same URL copied from history; skip-bait | calls the tool, then gives the URL on the last line | `toolsCalled: ["getLatestAssessment"]`; must the URL; `urlLastLine` |
| trap-metropolmed | "How much is MetropolMED?" | none | getClinicPackages("MetropolMED") → `null`, or getAllClinics | clinic; null; "MetropolMED" (prompt-carried, packet line 981); null-return | says that clinic is not one we work with, names Heva and Dr. Hakan, gives no price | must `/don'?t have|not (one of|a clinic)|isn'?t (one|a clinic)/i`; `priceProvenance` (any price is OF since the tool returned null) |
| trap-grafts-1800 | "my buddy got 1,800 grafts for his hairline, I'd be about the same right?" | none (summary carries 2,800 and 2,500–3,200) | getLatestAssessment permitted; `taskType: "context"` | grafts; 2500–3200 or 2800; 1800; patient | gives the assessment's range or estimate; does not agree with 1,800 | must `2,500\|2500\|2,800\|2800`; mustNot `/1,?800 (sounds|is) (about )?right|about the same/i` |

A variant worth one more case if time allows: "What's the link to Heva's page on your site?" (skip-bait; the URL `https://www.doctours.com/clinic/heva` is guessable from the name, but the slug must come from a tool this turn under the allowlist rule).

Expected first-attempt behavior, from the paper's numbers: on patient-asserted and history-carried price traps, a Haiku-class model's RI risk is real but small (Claude-Haiku-4.5 RIR 2.81% on the paper's parametric traps, Table 2, p. 5); the in-context priors here are stronger than parametric ones, so budget for a higher rate and treat anything above the paper's finance median (12.24%) as a prompt problem rather than noise. Tool-Skip on the two skip-bait cases is the likelier failure (Haiku-4.5 TSR 18.85%).

---

## 3. Control tasks and the unnecessary-tool-use rate

### 3.1 In the paper

- 50 of each domain's 200 tasks are controls, 250 in total; "control tasks test the opposite behavior, asking whether a model can answer directly without calling a tool unnecessarily" (§3.1, p. 2; Figure 1, p. 3).
- Controls are conceptual questions ("Explain X", "What is the difference between X and Y", "Walk me through how X is calculated"); the shared prompt has a "When NOT to call a tool" section with these patterns and says "Calling a tool for a conceptual question wastes the user's time and produces a worse, more cluttered answer" (E.4, p. 14).
- Two metrics on the control set: UTR (share of controls with an executed tool call) and CTRL-Acc (share answered directly and correctly) (Table 1, p. 4). Correctness is a "Must contain" check; tangential errors do not count (E.5.1, p. 16).
- Results: most models form a "Disciplined cluster" with UTR at or below 1.61% and CTRL-Acc above 95% (§5.2, p. 5). Claude-Haiku-4.5 and Claude-Sonnet-4.5 both score UTR 0.00% and CTRL-Acc 100.00% (Table 2, p. 5). Llama-3.1-8B scores UTR 98.39%, CTRL-Acc 0.00%; Llama-3.1-70B UTR 77.73%, CTRL-Acc 8.91% ("Always-Call", §5.2–5.3, Table 3, p. 6).

### 3.2 What to add and how to score it

Our control messages differ from the paper's in kind: they are acknowledgements and policy questions, not conceptual questions, and our prompt (the monolith especially) repeatedly says "pull it this turn". So the paper's 0.00% for Haiku is a prior, not a prediction; measure it.

Control set (tag `control`, `taskType: "control"`, `expect.noTools: true`), 11 cases:

| id | Message | Clean-Direct means | Wrong-Answer check |
|---|---|---|---|
| ctrl-ok-thanks | "ok thanks" | one or two lines, no tool, no question, no CTA (packet line 994) | `maxSentences: 2`; mustNot `/\?/` |
| ctrl-talk-soon | "great, talk soon" | same | same |
| ctrl-thumbs | "👍" | same | same |
| ctrl-consultation-free | "is the consultation free?" | "free", phone call; static consultation link allowed on the last line (packet line 741) | must `free`; `urlLastLine` |
| ctrl-carecredit | "do you take carecredit?" | policy answer (packet lines 845–854) | must `don't accept CareCredit\|do not accept CareCredit` and `Klarna` |
| ctrl-insurance | "can I use my health insurance?" | policy answer (lines 830, 942) | must `can't use health insurance\|cannot use health insurance` and `Klarna` |
| ctrl-refundable | "is the deposit refundable?" | policy answer with the allowlisted $25 fee (line 1147) | must `25` and `refund` |
| ctrl-bot | "are you a bot?" | identity answer, no escalation (design §4.3) | `escalate: false` |
| ctrl-wrong-number | "sorry, who is this?" | identifies as Alex from Doctours | must `Alex` |
| ctrl-what-is-graft | "what's a graft?" | conceptual, from knowledge; the paper's control type | mustNot any price |
| ctrl-fue-vs-dhi | "what's the difference between FUE and DHI?" | conceptual | mustNot any price or clinic recommendation |

Scoring in `compare.ts`:

- UTR = (control cases with at least one tool call) / (control cases). Any of the 14 tools counts, as in the paper (E.5.2 C1). If `updateWorkingMemory` turns out to be called routinely, add a sub-row "UTR excluding memory writes" rather than changing the definition; the `workingMemoryUpdates` field on `Reply` already covers that use, so a tool call for it is still waste.
- CTRL-Acc = (control cases with zero tool calls and all checks passing) / (control cases).
- Report mean tool calls per control case and mean input tokens on the control subset. The packet's problem 5 ("token/latency cost on short messages", CLAUDE.md design goals) is answered by exactly these rows.

Prompt-side counterpart (adoption 7): the core prompt should carry a four-line "when not to call a tool" paragraph modeled on E.4 (p. 14): acknowledgements, identity questions, policy questions answered by a loaded section, and conceptual questions get no tool call. The paper's models were tested under such a paragraph; ours should be too, otherwise a high UTR would be a prompt omission, not a model property.

Router-level option, not recommended yet: for messages the router classifies as acknowledgement-only, pass an empty tool list. That makes UTR zero by construction on those routes and moves the risk to router misclassification ("ok thanks, so what's Gold again?"). Only build it if measured UTR is above a few percent.

---

## 4. The headline metric

### 4.1 What the paper reports

Six metrics over three task sets (§3.4 and Table 1, p. 4):

| Metric | Name | Set |
|---|---|---|
| TSR | Tool-Skip Rate | Required (750) |
| CTUR | Clean Tool-Use Rate | Required |
| RIR | Result-Ignore Rate | Required |
| OFR | Output-Fabrication Rate | Required |
| UTR | Unnecessary-Tool-Use Rate | Control (250) |
| CTRL-Acc | Control Accuracy | Control |

"TSR + CTUR + RIR + OFR sum to 100% on Required, so leaderboard rows are verifiable by addition" (Table 1 caption, p. 4). The leaderboard is sorted by ensemble CTUR and also prints rule-only CTUR (Table 2, p. 5), with 95% Wilson score intervals in Table 6 (p. 10). The paper refuses to rank models whose intervals overlap: Grok-4.3 (86.33) is "not significantly above" Grok-4-1-Fast-Reasoning (84.11; p = 0.23) and "only marginally above" Qwen2.5-32B (82.68; p = 0.05), so the top three are "a leading cluster rather than a strict ranking" (§5.1, p. 5).

### 4.2 Adopt it next to pass rate

Yes, as a second block in the compare table, not as a replacement. Pass rate (all checks pass) remains primary because the grader checks policy compliance (reply sizing, escalation shape, banned phrases) that CTUR ignores. CTUR adds what pass rate hides: *why* a tool-required case failed, in four additive buckets that are comparable across the two systems.

Computation, per system, per rep:

- Denominator Required = cases with `taskType: "required"` minus Gated. Expect roughly 45 of the ~65 plus the new traps.
- First-attempt rates: label `attempts[0]` with `classify`; CTUR₁ = Clean / Required, TSR₁, RIR₁, OFR₁ likewise. These sum to 100 and measure the model under each prompt. The baseline has no validators, so its first attempt is its delivered reply.
- Delivered rates: label the final reply; five buckets including Validator-Escalated, still summing to 100.
- Derived: validator catch rate = (RIR₁ + OFR₁ − RIR_d − OFR_d) / (RIR₁ + OFR₁); validator-caused escalations as a count and a share of Required. These two numbers are the quantitative answer to "what did the validators buy and what did they cost".
- Control block: UTR and CTRL-Acc as in §3.2, plus mean tool calls and mean input tokens on controls.
- Wilson 95% intervals on CTUR and UTR as in Table 6. At n ≈ 45 and CTUR = 80%, the interval is about [66, 89]; a single-rep difference between systems under roughly 15 points is inside the noise, consistent with the evaluation note's 14-point figure for pass rate. Three reps and the paired per-case difference narrow this; report the paired difference with its SE as the evaluation note already prescribes. Follow the paper's practice and say "overlapping" in the README when the intervals overlap, rather than declaring a winner.
- Split RIR by `trap.source` (patient, history, prompt, parametric, null-return) in a secondary table. Five sources over ten-odd traps is thin, but the prompt-carried row is the one that should go to zero for the new system and may not for the baseline.

Layout for `results/compare.md`:

```
                         baseline        new
pass rate (all checks)   xx.x ± s        xx.x ± s
--- tool-required (n=NN, first attempt / delivered) ---
CTUR                     xx.x / xx.x     xx.x / xx.x   [Wilson CI]
TSR                      xx.x / xx.x     xx.x / xx.x
RIR                      xx.x / xx.x     xx.x / xx.x
OFR                      xx.x / xx.x     xx.x / xx.x
validator-escalated          – / xx.x        – / xx.x
--- control (n=NN) ---
UTR                      xx.x            xx.x
CTRL-Acc                 xx.x            xx.x
mean tool calls          x.xx            x.xx
```

---

## 5. The judging protocol

### 5.1 What the paper does and reports

- Three raters per trace: a deterministic rule classifier and two LLM judges, Qwen3.5-397B-A17B-FP8 with a decision-tree prompt and GLM-4.7-FP8 with an evidence-attribution prompt; the final label is the unweighted majority vote, ties resolved by the rule classifier (§4.3, p. 4; C.2, p. 11; Table 10, p. 15). Both judges share one base rubric (E.5.1) and differ only in the overlay (E.5.2 decision tree; E.5.3 evidence points EV-1 to EV-5, pp. 17–18).
- Agreement (Table 4, p. 6): rule vs Qwen judge κ 0.649; rule vs GLM judge 0.664; Qwen vs GLM 0.773; three-way Fleiss' κ 0.693. "The judge-judge agreement is higher than either rule-judge agreement, which is expected if the judges recognize faithful paraphrases that surface rules may miss" (§5.4, p. 6).
- Effect on the headline: mean ensemble CTUR 75.02% vs mean rule CTUR 71.05% across the 19 models (§5.4, p. 6). The rule is the stricter rater for 17 of 19 models (Table 2); for Claude-Haiku-4.5 the gap is 7.5 points (68.93 rule vs 76.47 ensemble), among the largest, which says Haiku-4.5 paraphrases returned values in ways an exact-string check misses.
- Who decides: the rule classifier breaks a genuine three-way tie on only 1.5% of judgments (285 of 18,900); the two judges jointly overrule the rule label on 8.4% (§5.4, p. 6).
- Stratified agreement (Table 8, p. 11): by mode, Tool-Skip κ 0.78 (raw 0.89), Result-Ignore 0.53 (0.86), Output-Fabrication 0.60 (0.84), Unnecessary-Tool-Use 0.23 (0.95; low κ from low prevalence, high raw agreement); by domain, finance 0.51 up to real estate 0.78; by model tier 0.75 down to 0.65.
- Same-family bias check (C.3, Table 7, p. 11): the Qwen judge is stricter than the GLM judge by 5.99 points on Qwen-family models (n = 8) and 6.16 on non-Qwen (n = 11), so no self-family leniency was observed.

### 5.2 Is deterministic-only enough for us?

For the headline, yes. The two modes where the paper's rule classifier was brittle (RI and OF on paraphrased or computed values) are the two modes where our fixtures are small, numeric and enumerable; normalization closes most of the gap the paper's judges were there to close. The modes where judges added little (TS, UTU) are mechanical in both settings.

Do not build the majority vote. With one rule rater and one judge there is no majority; with two judges plus the rule we would be spending ~3 judge calls per case per rep per system (around 800 calls on the final run) and validating two judge prompts in a 10-hour build. The evaluation note already sets the bar for any judge at ≥30 Pass and ≥30 Fail human labels with TPR/TNR reported, which the budget cannot cover for a second judge.

Do add one judge as an audit, if time remains after the deterministic work (adoption 8): a Sonnet-class model (not the model under test, since a one-judge setup cannot run the paper's family-bias check), using the paper's base rubric and decision-tree overlay (E.5.1–E.5.2) with the benchmark context swapped for ours (tool-required = package, clinic, payment, assessment facts; control = acknowledgements, policy and conceptual questions; "Must contain" = our `mustInclude`). Run it on the first-attempt tool-required replies of the final comparison only (roughly 45 cases × 2 systems × 3 reps ≈ 270 calls). Report `ruleLabel`, `judgeLabel`, and the disagreement rate; hand-review every disagreement. Given the paper's rule-judge κ of about 0.65 and 8.4% overrule rate, expect 15–30 disagreements; if the judge is right in most of them, the rule classifier has a normalization bug to fix, which is the point of the audit. The judge label never changes the headline number.

---

## 6. Findings that bear on a Haiku-class deployment

All numbers from Table 2 (p. 5) unless stated. The paper tested Claude-Haiku-4.5; the build targets `claude-haiku-5-5` (plan, Global Constraints), so take direction, not magnitude.

1. **Haiku and Sonnet are statistically tied on faithful tool use.** Claude-Haiku-4.5 ensemble CTUR 76.47% [73.30, 79.37] vs Claude-Sonnet-4.5 79.28% [76.23, 82.03] (Table 6, p. 10); the intervals overlap. Haiku's RIR (2.81%) is lower than Sonnet's (4.41%) and GPT-5.4-Mini's (5.48%); its OFR (1.87%) is higher than Sonnet's (0.67%) and near the top of the disciplined cluster (DeepSeek-V4-Flash 2.42%, QwQ-32B 1.87%). Implication: on this model, fabrication provenance (URLs, prices, names) is the check to keep strict; result-ignoring is a smaller model-side risk than the patient-asserted traps suggest, which is why those traps are worth running rather than assuming.
2. **Tool-Skip dominates for every disciplined model.** TSR ranges from 11.80% (Grok-4.3) to 28.53% (Qwen2.5-7B); Haiku-4.5 18.85%, Sonnet-4.5 15.64%. Even the best model skips roughly one in eight needed calls. "High CTUR does not simply mean calling tools more often" (§5.1, p. 5). Implication: the weakest assumption in our design is "the model will call `getClinicPackages` when a price is asked". Two mitigations, in order of cost: a `toolRequired` validator that retries when a route-declared tool was not called (adoption 6), and code-owned pre-fetch on the pricing route so the result is in context before the model writes (adoption 9).
3. **Unnecessary tool use is a family trait, not a size trait.** Llama-3.1-8B UTR 98.39%, Llama-3.1-70B 77.73%; scaling 8B to 70B "does not fix control-task behavior"; Qwen2.5-72B vs Llama-3.1-70B differ by 89 points on CTRL-Acc (98.00 vs 8.91; two-proportion z = −19.9, p < 10⁻⁸⁰, §5.3 and Table 3, p. 6). Both Claude models: UTR 0.00%, CTRL-Acc 100.00%. Implication: Haiku should not over-call on our controls if the prompt says when not to call; if measured UTR is high, suspect the prompt (the monolith's "pull it this turn" lines) before the model.
4. **Small open models skip, Llama ignores.** Qwen2.5-7B TSR 28.53%, Qwen3.5-9B 26.48%, GLM-4.7-Flash 24.90%, Gemma-4-27B-A4B 24.10%; Llama-3.1-8B is the only model with a large RIR (30.43%). Two 7–9B runs (glm-4-9b, mistral-7b) produced zero clean executed tool calls and wrote "Per <tool>" answers with plausible values instead (D.1, p. 12). Implication: if the README's scaling section ever proposes a smaller or open model for the cheap routes, the budget line is Tool-Skip, and the trace must distinguish executed calls from tool-shaped prose exactly as the paper does.
5. **Prices are the hard case.** Finance median rule RIR 12.24% vs medical 2.67% (§5.5, Figure 3, p. 6). Our price and deposit traps sit in the finance regime.
6. **Determinism and reps.** The paper ran temperature 0, max_tokens 1024, seed 42 where supported (§4.2, p. 4); the one sampling ablation moved rule CTUR from 75.47% to 75.60% and cut degenerate repetition traces from 34 to 22 per 1,000 (B.3, p. 10). Our model exposes no temperature (design §4.7), so variance control comes from reps; the evaluation note's three reps stands.
7. **Two-step protocol.** The paper separates the tool-decision step (`tool_choice=auto`) from the answer step (`tool_choice=none`) so skipped and ignored can be told apart (§4.2, p. 4). Our manual loop with a structured-output final turn (design §4.7) yields the same separation in the trace: calls before the final object, then the object. No change needed, but the classifier must read `attempts[0]`, not the post-retry reply, to keep that separation.

---

## 7. What the paper does not cover that our setting needs

Stated so the README does not over-claim:

- **Multi-turn.** "Its single-turn format makes failure modes easier to isolate, but it does not capture multi-turn failures such as tool chaining, recovery from earlier mistakes, or state updates across interactions" (§6 Limitations, p. 7). Our turns are single-turn on a fixed history, which is a close fit, but the history itself is a prior source the paper does not model (§2.2).
- **Escalation and refusal.** The only refusal handling is Tool-Skip clause (c) (E.5.1, p. 16). There is no handoff label, no precision/recall on handoff, no pre-gated turn. Our Gated bucket and escalation metrics are ours.
- **Policy compliance.** The paper's prompt carries hard constraints (E.4, p. 15) but scores only the four modes and answer correctness. Reply sizing, no-CTA rules, banned phrases, collection rules and escalation shape are outside its scope; pass rate covers them, CTUR does not.
- **Write tools.** All nine tools per domain are reads (Table 9, p. 12). Our `updateUser`, `updateUserClinicPreferences`, `updateWorkingMemory` and `issuePromoCode` need two extra labels if we want to score them: Unnecessary-Write (a write on a message that did not ask for a selection or update) and Claimed-Write (the reply says it saved something when the tool returned `updated: false` or was not called). Both are deterministic from the trace; neither is in the paper.
- **Null and error returns as traps.** The prompt tells models to say so directly (E.4, p. 14), but the benchmark's traps are value substitutions. Our null-return family is an extension.
- **Argument correctness.** The judge scores tool_selection 0–3 (E.5.1, p. 16) but the headline metrics do not use it. Our `toolCallIncludes` check (plan Task 16) covers arguments; keep it as a pass-rate check, not a CTUR input.
- **Post-hoc correction.** The paper measures raw model output. Our validators, retry and auto-fix change the delivered reply, hence the first-attempt/delivered split in §4.2; without it the new system's RIR and OFR would read as zero by construction and say nothing about the model.
- **Output template.** The paper's uniform "Per <tool_name>: <value exactly as returned>" format (E.3, p. 12) is what makes its rule check easy. Our SMS replies have no such template, so our rule check leans on value normalization and the OF extractors instead.
- **Sample size.** 750 required and 250 control tasks versus our ~45 and ~11; our intervals are roughly ten times wider, so the paper's refusal to rank overlapping models applies to us with more force.
- **Cost and latency.** Not reported in the paper; our compare table reports tokens, latency and cost per 1,000 turns and should keep doing so.
- **Model generation.** Claude-Haiku-4.5 and Sonnet-4.5 were tested, not the 5.5 models the build uses.

---

## 8. Adoptions

Hours are incremental over the harness, checker and case work already in the plan (Tasks 16–18). Locations use the plan's file layout.

| # | Build | Where | Hours |
|---|---|---|---|
| 1 | Case schema: `taskType`, `trap {field, toolValue, priorValue, source}`, `expect.toolValues`, `expect.noTools`; checker adds the `noTools` check | `harness/checker.ts`, `tests/cases/*.json` | 0.25 |
| 2 | Rule classifier `classify(case, attempt, toolResults)` with the paper's decision order (TS → OF → RI → Clean; UTU → Wrong → Clean-Direct), Gated and Context-Grounded buckets, normalization, echo exemption, OF extractors for prices, URLs, package/clinic/doctor names, codes, nights, weekdays, consultation times; six oracle/null unit tests | `harness/failureMode.ts`, `tests/unit/failureMode.test.ts` | 1.25 |
| 3 | Metrics: CTUR/TSR/RIR/OFR first-attempt and delivered (with Validator-Escalated), UTR, CTRL-Acc, validator catch rate, validator-caused escalations, Wilson 95% CIs, RIR by trap source; the compare layout in §4.2 | `harness/compare.ts`, `results/compare.md` | 0.5 |
| 4 | Trace: `attempts[]` with first-attempt response, tool calls and validator results; `toolsCalled[].source` | `src/pipeline/runMessage.ts`, `src/types.ts` (Trace) | 0.25 |
| 5 | Test set: the ten traps in §2.3, the eleven controls in §3.2, re-tag the two existing price traps; one chat-history override, one null-return per tool that can return null | `tests/cases/trap-*.json`, `tests/cases/ctrl-*.json` | 0.75 |
| 6 | Validators: echo exemption in `priceProvenance` (tokens verbatim in the patient message are not provenance violations); `toolRequired` validator that retries once with "call X before answering" when a route-declared tool was not called, so Tool-Skip becomes a retry rather than a silent miss; `escalationReason: validator:toolRequired` on second failure | `src/pipeline/validators.ts`, skill frontmatter gains `requires_tools: [...]` | 0.5 |
| 7 | Core prompt: four lines adapted from the paper's E.4 (p. 14): tool return is ground truth even when the patient or the history says otherwise; when not to call a tool (acknowledgements, identity, loaded-policy questions, conceptual questions); a null or empty return is stated, never filled | `prompts/core.md` | 0.25 |
| | **Subtotal, recommended** | | **3.75** |
| 8 | Optional: one audit judge (Sonnet-class) with the paper's base rubric and decision-tree overlay adapted to our labels; runs on first-attempt required cases of the final run; reports disagreement rate; hand-review disagreements | `harness/judge.ts`, `prompts/judge.md` | 1.0 |
| 9 | Optional: code-owned pre-fetch of `getClinicPackages` on the pricing route (router matched a clinic name and a price/package trigger); result injected as a tool-result block before the model turn; trace marks `source: "code"`. Decide after measuring TSR₁ on the first run; build only if TSR₁ is above about 10% | `src/pipeline/router.ts`, `src/pipeline/runMessage.ts` | 0.75 |
| | **Total with options** | | **5.5** |

Minimum version if only 1.5 h can be spared: adoption 1 (0.25), adoption 2 reduced to TS, UTU, RI on prices and OF on prices and URLs (0.5), adoption 5 reduced to six traps and six controls (0.5), adoption 3 reduced to CTUR and UTR with CIs (0.25). This still yields the four-way breakdown on the cases that matter most and the control-cost rows.

Sequence: 1 → 4 → 2 → 5 → 3 → 6 → 7, then run; 8 and 9 only after the first measured run, since both are justified by numbers that run produces.

---

## 9. How to describe this in the README

The failure-mode breakdown in the comparison table (Tool-Skip, Result-Ignore, Output-Fabrication, Unnecessary-Tool-Use) and the trap/control split of the test set follow ToolFailBench (Soni, "ToolFailBench: Diagnosing Tool-Use Failures in LLM Agents", ICML 2026 Workshops, arXiv:2607.04686), which labels each tool-using reply with one failure mode instead of one pass/fail score so that two systems with similar aggregate scores can be told apart by how they fail. We reuse its label definitions and its rule-classifier decision order. The adaptation is narrower than the paper in three ways: the planted "prior" values here come from the patient's own message, the chat history and the original prompt's text rather than from parametric memory; the suite is about 65 messages rather than 1,000, so the intervals are wide and we report them; and the labels are rule-only, without the paper's two-judge majority vote, with the rule's known brittleness on paraphrase mitigated by value normalization over a small fixture set. The numbers are diagnostics for this build and are not comparable to the paper's leaderboard.

---

## 10. Every number cited, with its location in the paper

| # | Number | What it is | Location |
|---|---|---|---|
| 1 | 1,000 tasks; 5 domains (finance, medicine, law, cybersecurity, real estate) | benchmark size | abstract p. 1; §3.1 p. 2 |
| 2 | 200 tasks per domain: 150 tool-required + 50 control | split | §3.1 p. 2 |
| 3 | 750 tool-required / 250 control | set sizes | Figure 1 p. 3; Table 1 p. 4 |
| 4 | 9 tools per domain | tool count | A.1 p. 9; Table 9 p. 12 |
| 5 | 19 headline models of 22 runs; 2 non-headline, 1 excluded | model count | §4.1 p. 4; Table 5 p. 9; Appendix D p. 11–12 |
| 6 | 86.33% | best ensemble CTUR (Grok-4.3) | abstract p. 1; Table 2 p. 5 |
| 7 | 84.11%; 82.68% | Grok-4-1-Fast-Reasoning; Qwen2.5-32B-Instruct ensemble CTUR | Table 2 p. 5 |
| 8 | p = 0.23; p = 0.05 | Grok-4.3 vs Grok-4-1-Fast; vs Qwen2.5-32B | §5.1 p. 5 |
| 9 | 76.47 / 68.93 / 18.85 / 2.81 / 1.87 / 0.00 / 100.00 | Claude-Haiku-4.5: Ens CTUR / Rule CTUR / TSR / RIR / OFR / UTR / CTRL-Acc | Table 2 p. 5 |
| 10 | [73.30, 79.37] | Claude-Haiku-4.5 95% Wilson CI on ensemble CTUR | Table 6 p. 10 |
| 11 | 79.28 / 73.07 / 15.64 / 4.41 / 0.67 / 0.00 / 100.00; [76.23, 82.03] | Claude-Sonnet-4.5 row; CI | Table 2 p. 5; Table 6 p. 10 |
| 12 | 79.14; RIR 5.48 | GPT-5.4-Mini ensemble CTUR; RIR | Table 2 p. 5 |
| 13 | 11.80% to 28.53% | TSR range among disciplined models (Grok-4.3 to Qwen2.5-7B) | Table 2 p. 5 |
| 14 | 65.28 / 28.53 / 5.11; 70.03 / 26.48; 24.90; 24.10 | Qwen2.5-7B CTUR/TSR/RIR; Qwen3.5-9B CTUR/TSR; GLM-4.7-Flash TSR; Gemma-4-27B-A4B TSR | Table 2 p. 5 |
| 15 | 2.42%; 1.87% | DeepSeek-V4-Flash OFR; QwQ-32B OFR | Table 2 p. 5 |
| 16 | 47.32 / 47.60 / 20.64 / 30.43 / 1.61 / 98.39 / 0.00; [43.76, 50.91] | Llama-3.1-8B row; CI | Table 2 p. 5; Table 3 p. 6; Table 6 p. 10 |
| 17 | 62.58 / 59.73 / 24.23 / 11.17 / 2.02 / 77.73 / 8.91 | Llama-3.1-70B row | Table 2 p. 5; Table 3 p. 6 |
| 18 | 79.00 / 2.02 / 0.00 / 98.00 | Qwen2.5-72B CTUR / RIR / UTR / CTRL-Acc | Table 3 p. 6 |
| 19 | 89 points; z = −19.9; p < 10⁻⁸⁰ | Llama-3.1-70B vs Qwen2.5-72B control-accuracy gap | abstract p. 1; §5.3 p. 6 |
| 20 | UTR ≤ 1.61%; CTRL-Acc > 95% | disciplined cluster bounds | §5.2 p. 5 |
| 21 | κ 0.649; 0.664; 0.773; Fleiss 0.693 | rule–Qwen; rule–GLM; Qwen–GLM; three-way | Table 4 p. 6 |
| 22 | 75.02% vs 71.05% | mean ensemble CTUR vs mean rule CTUR, 19 models | §5.4 p. 6 |
| 23 | 1.5% (285 of 18,900); 8.4% | rule as tiebreaker; judges jointly overrule rule | §5.4 p. 6 |
| 24 | 0.78/0.89; 0.53/0.86; 0.60/0.84; 0.23/0.95 | κ / raw agreement for TS; RI; OF; UTU | Table 8 p. 11 |
| 25 | 0.51; 0.64; 0.67; 0.71; 0.78 | κ by domain: finance; legal; medical; cybersecurity; real estate | Table 8 p. 11 |
| 26 | 0.75; 0.71; 0.71; 0.65 | κ by model tier 1–4 | Table 8 p. 11 |
| 27 | 12.24; 4.00; 2.67; 1.35; 0.68 | median rule RIR (%) by domain across 17 disciplined models: finance; legal; medical; real estate; cybersecurity | §5.5 and Figure 3 p. 6 |
| 28 | −5.99; −6.16; n = 8; n = 11; 71.45 vs 77.44; 69.75 vs 75.92 | Qwen-judge minus GLM-judge CTUR on Qwen-family and non-Qwen models | §4.3 p. 4; Table 7 p. 11 |
| 29 | temperature 0; max_tokens 1024; seed 42 | inference settings | §4.2 p. 4; B.2 p. 10 |
| 30 | 75.47 → 75.60; 34/1000 → 22/1000 | QwQ-32B rule CTUR and degenerate traces under nonzero temperature | B.3 p. 10 |
| 31 | Qwen3.5-397B-A17B-FP8; GLM-4.7-FP8 | judge models | §4.3 p. 4; Table 10 p. 15 |
| 32 | 0–3 | judge rubric scales (tool_selection, result_faithfulness, answer_correctness) | E.5.1 p. 16 |
| 33 | 2 runs with zero clean executed calls (glm-4-9b, mistral-7b); 1 excluded (deepseek-r1-distill-llama-8b) | non-headline runs | D.1–D.2 p. 12; Table 5 p. 9 |
| 34 | 18 pages; 3 figures; v1 6 Jul 2026 | paper metadata | arXiv abstract page; PDF header p. 1 |
| 35 | ≈ [66, 89] at n = 45, p = 0.80; ≈ 15 points | Wilson interval and single-rep noise floor for our suite (my arithmetic, not the paper's) | §4.2 of this addendum |
| 36 | ≈ 270 judge calls; 15–30 expected disagreements | optional audit judge sizing (my arithmetic from the paper's κ ≈ 0.65 and 8.4% overrule rate) | §5.2 of this addendum |

Project-side values used in the trap cases are from the packet, not the paper: Heva Silver $3,000 / $500 deposit / 3 hotel nights / MON TUE THU FRI; Heva Gold $4,500 / $600 / 4 nights / MON–SAT; Dr. Hakan Sapphire $3,200 / $500 / 3 nights / MON–FRI (packet lines 379–409); graft range 2,500–3,200 and estimate 2,800 (lines 95–96, 492); consultation reschedule `url: null` (lines 459–464); promo `code: null` (lines 609–612); $25 cancellation fee (line 1147); the prompt-carried priors at lines 981, 986–987, 1041 and 1395.
