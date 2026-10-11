# Instruction precedence / rule-conflict handling, and output validators + retry-with-feedback

Scope: (a) how precedence and rule conflicts are encoded, enforced and logged in LLM systems; (b) output validators/guardrails that check a reply and retry with the violation fed back. Judged against the patient-coordinator rebuild (TypeScript, hosted Haiku-class model, no fine-tuning, ~10 dev-hours, deterministic post-generation checks: every URL/price must match a tool result from this turn, no markdown, URL on last line, escalation reply one sentence). Owner problems referenced by number: (1) every turn loads every rule; (2) can't tell which rule caused a bad reply; (3) adding a domain means pasting it in; (4) subtasks have nowhere to go; (5) every message pays full prompt cost; (6) editing one policy changes unrelated replies; (7) conflicting rules with no record of which won; (8) can't test one behavior alone.

Research date: 2026-10-11. Roughly 45 tool calls; several primary pages were truncated at 100k chars (noted where relevant).

---

## KQ1. OpenAI "The Instruction Hierarchy" (Wallace et al. 2024) and the OpenAI Model Spec: how is precedence defined and evaluated?

### Takeaway
Both encode precedence as a fixed, small set of ordered authority levels with one combining rule: a lower-level instruction that conflicts with a higher-level one is treated as inapplicable (ignored, or refused if it cannot be ignored). Wallace et al. make this stick by fine-tuning (prompting alone performed "much worse"); the Model Spec is a written policy evaluated by behavior, and independent benchmarks (IHEval) show even GPT-4o drops from 91% to 70% accuracy when instructions conflict and that adding a "priority" sentence to the system prompt does not help.

### Cited Findings
- Wallace et al. propose an instruction hierarchy that "explicitly defines how models should behave when instructions of different priorities conflict"; the core problem is that models weight developer system prompts the same as untrusted user and third-party text. Submitted 19 Apr 2024. — [arXiv:2404.13208 abstract](https://arxiv.org/abs/2404.13208)
- Ordering: system > user > third-party content. The paper's own baseline prompt (Appendix A) assigns explicit numeric priority levels: system = 0, user = 10, images/audio = 20, tool text such as web results = 30. — [arXiv:2404.13208 HTML](https://arxiv.org/html/2404.13208)
- "Aligned" lower-privileged instructions (share the higher-level goals/constraints, e.g. "speak in Spanish" for a car-sales bot) should be followed; "misaligned" ones (oppose or are orthogonal to higher-level ones) should be ignored when possible and otherwise refused. Training uses "context synthesis" (follow decomposed aligned instructions) and "context ignorance" (answer as if the misaligned instruction was never seen). — [arXiv:2404.13208 HTML](https://arxiv.org/html/2404.13208)
- Results on GPT-3.5 Turbo (SFT + RLHF, i.e. training-based): system-prompt-extraction defense improved 63%; robustness to held-out jailbreaks rose by over 30% (generalization "up to 34%"); TriviaQA/LAMBADA/HellaSwag comparable to baseline; some over-refusal regressions on "System Message Probing Questions" and "Jailbreakchat with Allowed Prompts" (no exact rates given). A prompting-only baseline (a system message describing the hierarchy) "performed much worse" than training. — [arXiv:2404.13208 HTML](https://arxiv.org/html/2404.13208)
- OpenAI Model Spec (version dated 18 Aug 2026; the page notes a newer version exists) chain of command, highest to lowest: Root (fixed Model Spec rules nobody can override) > System (OpenAI rules) > Developer > User > Guideline (defaults overridable implicitly by context) > No authority (assistant messages, tool outputs, quoted/untrusted content). — [OpenAI Model Spec 2026-08-18](https://model-spec.openai.com/2026-08-18.html)
- Conflict rule: a lower-level instruction is treated as inapplicable if it conflicts with a higher-level one; developer beats user (tutoring example: no full answers even if user asks); when two root-level principles conflict the model should default to inaction. — [OpenAI Model Spec 2026-08-18](https://model-spec.openai.com/2026-08-18.html)
- Tool outputs, quoted text, file attachments and multimodal data have no instruction authority by default; instructions inside them are treated as information. Authority can be delegated to them only by unquoted higher-level text. For tool outputs: ignore unrelated instructions, follow clearly intended low-risk ones, ask when side effects could be serious. — [OpenAI Model Spec 2026-08-18](https://model-spec.openai.com/2026-08-18.html)
- Same-level ordering: a later instruction at the same level can supersede an earlier one; assume earlier context still applies when a follow-up is plausibly related. No explicit "more specific beats more general" rule is stated. — [OpenAI Model Spec 2026-08-18](https://model-spec.openai.com/2026-08-18.html)
- IHEval (NAACL 2025; v2 26 Mar 2025): 3,538 examples, nine tasks, four categories, priority order system > user > conversation history > tool outputs, scored programmatically. Average accuracy aligned vs conflict: GPT-4o 91.0 → 70.0; GPT-4o mini 84.2 → 44.3; Qwen-2 72B 85.7 → 47.8; Mistral-Large 86.3 → 29.4; Claude-3 Sonnet 85.1 → 30.7; Claude-3 Haiku 75.9 → 27.9; Llama-3.1 70B 78.8 → 14.0; Llama-3.1 8B 55.6 → 11.3. — [arXiv:2502.08745v2](https://arxiv.org/html/2502.08745v2)
- IHEval: adding an instruction-priority prompt to the system message did not reliably help (GPT-4o 70.0 → 67.2; Llama-3.1 70B 14.0 → 17.1; Mistral-Large 29.4 → 28.3). Authors conclude dedicated training, not prompt engineering, is needed. — [arXiv:2502.08745v2](https://arxiv.org/html/2502.08745v2)

### Inferences
- Neither OpenAI document uses numeric priority numbers at the policy level; precedence is a short ordered list of *sources* plus one combining rule ("conflicting lower-level instruction is inapplicable"). The only place numeric levels appear is Wallace et al.'s prompt baseline (0/10/20/30), and that baseline was the weak one.
- For a Haiku-class model with no fine-tuning, IHEval's Claude-3 Haiku number (27.9% under conflict, prompting does not help) is the strongest evidence that conflict resolution must happen in code *before* the prompt is assembled rather than being delegated to the model via "HARD RULE: this overrides X" prose. That directly targets problems 6, 7 and 8.
- The Model Spec's "tool outputs have no authority" rule is a precedent for our design that tool results are *data the validator checks against*, not instructions.

### Gaps
- Wallace et al. report no prompt-injection-specific percentage and no exact over-refusal rate (none reported).
- The Model Spec page was read to 100k of 124k characters; the omitted tail may contain more same-level tie-break guidance.
- No current-generation (2026) IHEval-style numbers for Haiku 4.5 / Sonnet 4.6 were found.

---

## KQ2. Anthropic's constitution: how does it order conflicting principles?

### Takeaway
Anthropic's constitution (published 22 Jan 2026) orders four properties, broadly safe > broadly ethical > compliant with Anthropic guidelines > genuinely helpful, but calls the prioritization "holistic rather than strict," puts "hard constraints" outside the weighing entirely, and layers a separate, also non-strict principal hierarchy (Anthropic > operators > users) with a documented default for operator-vs-user conflicts.

### Cited Findings
- "In cases of apparent conflict, Claude should generally prioritize these properties in the order in which they are listed": broad safety, broad ethics, guideline compliance, genuine helpfulness. The prioritization is "holistic rather than strict." — [anthropic.com/constitution](https://www.anthropic.com/constitution)
- Hard constraints sit outside the weighing: the ordering applies "assuming Claude is not violating any hard constraints," and hard constraints "remain constant regardless of instructions." — [anthropic.com/constitution](https://www.anthropic.com/constitution)
- Principal hierarchy: Anthropic, then operators, then users, each given greater trust "in roughly the order given above"; "This is not a strict hierarchy, however." Anthropic is a background entity "whose guidelines take precedence over those of the operator." Conflicts between guidelines and ethics are treated as a flaw to be fixed, not resolved case-by-case. — [anthropic.com/constitution](https://www.anthropic.com/constitution)
- Operator vs user conflicts: "Claude should err on the side of following operator instructions," except where that means actively harming users, deceiving them in damaging ways, or similar; some defaults are kept regardless of operator instructions (e.g., telling users what it cannot help with). — [anthropic.com/constitution](https://www.anthropic.com/constitution)
- Publication date 22 Jan 2026; safety ranks above ethics because current models may act on flawed beliefs/values/limited context, not because safety matters more in the abstract. — [anthropic.com/news/claude-new-constitution](https://www.anthropic.com/news/claude-new-constitution)
- Secondary coverage phrases the order more absolutely ("safety trumps everything") than the primary text's "generally." — [implicator.ai](https://www.implicator.ai/anthropic-rewrites-the-rulebook-for-ai-behavior/) (secondary; disagrees in tone with primary)

### Inferences
- The reusable structural idea is the three-tier split: (i) hard constraints that are never weighed, (ii) a short ordered list of *categories* (not individual rules), (iii) a principal/source order. Our monolith's "HARD RULE overrides X on this turn" sections conflate all three.
- "Guideline conflicts are a flaw to fix" is a maintainability stance that maps to problem 7: log the conflict, fix the rules, don't silently pick a winner forever.

### Gaps
- The constitution page is ~200k characters; only the first 100k was read. The ordering and principal-hierarchy text were in the read portion.
- No quantitative evaluation of how Claude models actually resolve the ordering was found from Anthropic (none reported).

---

## KQ3. 2025–2026 "policy as code" / policy engines for LLM agents: explicit priorities, override declarations, logging which rule fired; how to make "rule X overrides rule Y" testable

### Takeaway
The policy-engine literature avoids priority numbers; it uses a structural combining rule (deny/forbid overrides allow/permit; default deny) and returns a decision trace naming the rules that determined the outcome. Testability comes from (a) putting rules in code evaluated by a solver/engine rather than prose evaluated by the model, (b) emitting which rules fired on every decision, and (c) programmatic benchmarks of conflict cases (IHEval). Published engines also report that moving the policy out of the prompt into the engine cut token cost (~3.3%) and raised τ²-bench compliance from 48% to 93%.

### Cited Findings
- Cedar authorization semantics: "If any `forbid` policy evaluates to true, then the final result is Deny"; otherwise Allow if at least one `permit` is satisfied; default Deny; policies that error are skipped. No priority numbers or policy ordering. The response's diagnostics list the "determining policies" (satisfied forbids for a forbid-Deny, satisfied permits for Allow, empty for default Deny) plus error IDs. — [Cedar docs: authorization](https://docs.cedarpolicy.com/auth/authorization.html) (undated docs page)
- Policy Compiler for Secure Agentic Systems (PCAS; v2 19 Feb 2026, UW–Madison/Langroid): Datalog-derived declarative policy language over a dependency graph of agent events, compiled via Differential Datalog to Rust. No explicit priority numbers or override declarations; an action is authorized only if some `Allowed` rule matches and no `Denied` rule matches (denylist wins). Engine returns allow/deny plus a "decision trace." Rule annotations `@deny_message`, `@suggestion`, `@url_pattern` feed structured feedback to the agent, which can retry with a corrected request. — [arXiv:2602.16708v2](https://arxiv.org/html/2602.16708v2)
- PCAS numbers: prompt injection (GPT-4.1-mini, 5 trials) attack success 5/5 → 0/5 with benign utility 5/5, runtime ~5.3 s → 8.5–10.4 s; τ²-bench (airline + retail, three frontier models) average compliance 48% → 93% with zero policy violations, runtime +~20%, token cost −~3.3% because the policy document was removed from the prompt; no false positives observed in instrumented prompt-injection runs. Code "will be released soon" (not yet open source). — [arXiv:2602.16708v2](https://arxiv.org/html/2602.16708v2)
- Agentic Permissions Policy Algebra (APPA; 27 Jul 2026): labels only narrow (every update is a meet), so rule combination is order-independent; no precedence ordering among rules; explicit "rulings" can permit a dispatch despite an unmet predicate but are scoped to one call and do not alter the trajectory label. Append-only event log shared across the trajectory tree records rulings, dispatches, branch boundaries, merges, narrowing acceptances, sanitizer applications; ruling, plan and dispatch are recorded atomically. Attack success 31–50% → 0–7% across 4 models; latency not reported; false denials not measured directly. — [arXiv:2607.24625v1](https://arxiv.org/html/2607.24625v1)
- Policy-as-logic (12 Aug 2026, RobustifAI workshop @ IJCAI-ECAI '26): policies expressed in formal logic; the LLM extracts facts to ground predicates and an answer-set solver does the reasoning; outperforms policy-as-prompt and policy-as-code "in most cases" with roughly 10x lower token usage. Conflict/precedence handling not described in the abstract. — [arXiv:2608.11905](https://arxiv.org/abs/2608.11905)
- IHEval is scored programmatically (not GPT-graded as in concurrent SysBench) for cost-efficiency and reproducibility; it covers system prompts, user instructions, conversation history and tool outputs. — [arXiv:2502.08745v2](https://arxiv.org/html/2502.08745v2); [amazon.science](https://amazon.science/publications/iheval-evaluating-language-models-on-following-the-instruction-hierarchy)
- 2025 guide to resilient agents: a task-level tool list takes priority over the agent's own tool list regardless of what the agent could otherwise use (precedence by scope, not by number). — [arXiv:2509.08646](https://arxiv.org/pdf/2509.08646) (Sep 2025; from search snippet, not opened in full)

### Inferences
- The consensus mechanism for "rule X overrides rule Y" is not a declared override but a *kind*: forbid/deny rules structurally beat permit/allow rules, and the engine reports which rules determined the result. For our system: give each rule a `kind: 'forbid' | 'require' | 'permit'`, evaluate all applicable rules in code, and log `{ruleId, kind, fired, determining}` per turn. That makes "X overrides Y" a unit test (construct a context where both apply; assert the decision and the determining-rule list), addressing problems 2, 7 and 8.
- PCAS's −3.3% tokens / +45 pt compliance from moving policy out of the prompt is the only quantified evidence I found for the "load only needed rules, enforce the rest in code" thesis (problems 1, 5).
- PCAS's `@deny_message`/`@suggestion` is the same shape as our planned "retry with the violation fed back": the engine, not the model, authors the correction hint.

### Gaps
- None of PCAS, APPA or Policy-as-logic are confirmed open source; none is TypeScript. Use them as design references only.
- No paper found that uses explicit numeric priorities with override declarations *and* evaluates them; "priority numbers" appear only in Wallace et al.'s weak prompt baseline.
- No published latency numbers for APPA (none reported).

---

## KQ4. NeMo Guardrails, Guardrails AI, Rebuff, LLM Guard: post-generation checks, retry-with-feedback, false-positive rates, latency

### Takeaway
Only Guardrails AI has a built-in retry-with-feedback ("reask", default 1 reask, prompt auto-includes the failed criteria); NeMo output rails block or alter but do not retry; LLM Guard and Rebuff are archived. Independent measurements: NeMo adds ~+443 ms median (+6.8%), 3 API calls and +65% tokens per request with 0/241 benign blocks; Guardrails AI blocked 6/241 benign prompts (2.5% FPR) with no significant latency overhead; a 2025 benchmark puts per-call guardrail latency at 0.35 s (Guardrails AI), 0.69–1.02 s (NeMo w/ gpt-4o-mini), 0.05–0.28 s (classifier/API guards). All are Python; none ships deterministic "every URL must be in the tool result" checks out of the box.

### Cited Findings
**Guardrails AI**
- On-fail actions: NOOP (log only), EXCEPTION, REASK (ask the LLM to regenerate output meeting the validator's criteria; the reask prompt includes which quality criteria failed, auto-generated by the validator), FIX (deterministic rewrite, e.g. `provenance_llm` removes sentences estimated hallucinated), FILTER (structured only; drop failing field), REFRAIN (return None), FIX_REASK (fix, re-validate, reask only if still failing). REASK/FIX/FILTER/REFRAIN/FIX_REASK do not support streaming. Custom on-fail actions supported. — [Guardrails AI docs: error remediation](https://www.guardrailsai.com/docs/concepts/error_remediation) (undated)
- `num_reasks` defaults to 1 on `Guard.__call__` (None on `Guard.parse`); `full_schema_reask` defaults to True if a Pydantic model is provided (regenerate whole schema) else False (regenerate only incorrect values); `ValidationOutcome.reask` holds the reask that would have been sent if more reasks were allowed. — [Guardrails AI API reference: guards](https://www.guardrailsai.com/docs/api_reference_markdown/guards) (undated)
- Measured (Mar 2026, claude-sonnet-4-5 target, gpt-5 judge, 1,500 prompt-configuration pairs): Guardrails AI blocked 6/241 benign prompts (2.5% FPR), median latency 261 ms *faster* than native (not significant), error rate 1.6%, indirect-injection attack success 31.0% (vs native 28.9%). — [Liu, "Quantifying the Safety Tax", 14 Mar 2026](https://zihaoliu.substack.com/p/quantifying-the-safety-tax-where) (independent blog; library versions not stated)
- Weighted F1 on usability datasets 0.62–0.92, adversarial 0.60–0.82; latency 0.357 s (usability) / 0.348 s (adversarial). — [No Free Lunch with Guardrails, arXiv:2504.00441v2, Apr 2025](https://arxiv.org/html/2504.00441v2) (authors are from Enkrypt AI, an evaluated vendor)
- The "AI Guardrails Index" (12 Feb 2025) evaluated 20+ solutions across 6 domains with an open-sourced dataset/codebase, but the announcement page gives no per-category accuracy, FPR or latency numbers. — [guardrailsai.com blog](https://guardrailsai.com/blog/introducing-the-ai-guardrails-index) (vendor)

**NeMo Guardrails (NVIDIA)**
- Five rail types: input, dialog, retrieval, execution (tool I/O), output. Output rails "can reject it, so it isn't returned, or alter it" (e.g. remove sensitive data); README does not mention retry/regenerate. LLM-based output checks include "self check facts" and "self check hallucination"; NVIDIA safety NIMs and jailbreak detection available. Tracing can be configured to send to your own observability backend. Apache-2.0; latest release 0.24.1. — [NVIDIA/NeMo-Guardrails README](https://github.com/NVIDIA/NeMo-Guardrails) (undated)
- Measured (same Liu 2026 study): NeMo median overhead +443 ms (+6.8%, Bonferroni p = 0.13, not significant); ~600–960 ms overhead on benign queries; 3 API calls per request (input check, generation, output check); tokens 1,084 vs 656 baseline (+65%); 0/241 benign prompts blocked (0% FPR); error rate 0.0%; indirect-injection attack success 10.5% vs native 28.9%. — [Liu, 14 Mar 2026](https://zihaoliu.substack.com/p/quantifying-the-safety-tax-where)
- No Free Lunch (gpt-4o-mini as NeMo core model): weighted F1 usability 0.64–0.99, adversarial 0.84–0.98; latency 1.019 s (usability) / 0.690 s (adversarial). — [arXiv:2504.00441v2](https://arxiv.org/html/2504.00441v2)
- A NeMo-style input rail on Vicuna-13b raised detection but also raised the false-positive rate vs baseline; LLM-based guards add latency/throughput cost dependent on input length (input rails, not output). — [Adversarial Prompt Evaluation, arXiv:2502.15427, 21 Feb 2025](https://arxiv.org/pdf/2502.15427) (from search snippet; full numbers not extracted)
- NeMo evaluation CLI reports latency, throughput and false-positive rate for moderation rails; no published numbers from it were found. — [NeMo evaluation docs (Mintlify mirror)](https://www.mintlify.com/NVIDIA-NeMo/Guardrails/evaluation/overview)
- Secondary news claims NVIDIA's guardrail NIMs add "only half a second of latency"; no official NVIDIA ms figure found. — [getcoai.com](https://getcoai.com/news/nvidias-nemo-guardrails-aim-to-make-ai-agents-safe-and-secure) (secondary, unverified)
- Streaming output rails: smaller chunks (128 tokens) lower latency but risk missing cross-chunk violations. — [NVIDIA developer blog](https://developer.nvidia.com/blog/stream-smarter-and-safer-learn-how-nvidia-nemo-guardrails-enhance-llm-output-streaming/)

**LLM Guard (Protect AI)**
- 21 output scanners: BanCode, BanCompetitors, BanSubstrings, BanTopics, Bias, Code, Deanonymize, JSON, Language, LanguageSame, MaliciousURLs, NoRefusal, ReadingTime, FactualConsistency, Gibberish, Regex, Relevance, Sensitive, Sentiment, Toxicity, URLReachability. No retry/regenerate. No latency/accuracy numbers on the README. Project states it "is no longer under active development or maintained." — [protectai/llm-guard](https://github.com/protectai/llm-guard)

**Rebuff (Protect AI)**
- Input-side prompt-injection detector (heuristics, LLM check, vector DB of past attacks, canary tokens that detect leakage in completions). "Still a prototype"; no output validation or retry; no accuracy/latency numbers; repository archived 16 May 2025. — [protectai/rebuff](https://github.com/protectai/rebuff)

**Other framework references**
- OpenAI Agents SDK output guardrails always run after the agent completes (no parallel), only on the last agent; a triggered tripwire raises `OutputGuardrailTripwireTriggered` and halts; the rejected output is excluded from the session; no built-in retry/regenerate. — [OpenAI Agents SDK: guardrails](https://openai.github.io/openai-agents-python/guardrails/) (undated)
- Red Hat benchmark (secondary report): a 200M-parameter DeBERTa prompt-injection classifier reached 89.01% accuracy at 54.1 ms median latency. — [letsdatascience.com](https://letsdatascience.com/news/red-hat-benchmark-finds-lightweight-guardrails-can-rival-lar-1bb3c815) (secondary)
- Stacking guards compounds false positives: five guards at 90% accuracy ≈ 41% system FPR (illustrative arithmetic, vendor-adjacent blog). — [premai.io](https://www.premai.io/blog/production-llm-guardrails-nemo-guardrails-ai-llama-guard-compared/) (vendor-adjacent, not measured)

### Inferences
- The frameworks' measured FPRs (0–2.5%) and latencies (50 ms–1 s) all concern *LLM- or classifier-based* safety checks. Our planned checks (URL/price set membership, markdown regex, last-line URL, sentence count) are deterministic string checks with ~0 ms latency and an FPR that is exactly the rate at which the rule itself is wrong, so the frameworks' numbers are an upper bound on what we'd pay, not a prediction.
- Guardrails AI's REASK is the closest packaged version of our plan (validator → auto-generated failure description → one reask by default). Since it is Python-only and our stack is TypeScript, copy the contract (validator returns `{pass, violation, fixHint}`; one reask; log outcome) rather than depend on it.
- NeMo's "3 calls per request, +65% tokens" is what an LLM-based output check costs; it argues for deterministic checks first and an LLM judge only for things regex cannot express.

### Gaps
- No official NVIDIA latency or FPR numbers for NeMo output rails (none reported); the NeMo output-rails tutorial page 404'd on both docs.nvidia.com and GitHub raw, so `rails.explain()` / per-rail duration logging could not be confirmed from a primary page.
- Guardrails AI publishes no measured reask success rate or reask latency (none reported).
- Guardrails Index per-category FPR/latency were not retrievable from the announcement page.

---

## KQ5. Chain-of-Verification, Reflexion, self-critique loops: does feeding a violation back and re-asking fix it? Retries before diminishing returns? First-retry fix rate?

### Takeaway
The literature is consistent on the condition that matters: correction works when the feedback is *external and reliable* (unit tests, environment signal, a validator, an oracle) and fails or backfires when the model critiques itself (GPT-4 GSM8K 95.5 → 91.5 → 89.0 under intrinsic self-correction; +10 pts on HotpotQA with oracle feedback). Where multi-trial curves are reported, most of the gain lands on the first retry (vision agents ~62% → ~70% → ~79% by attempt 5; Reflexion's "immediate spike between the first two trials"; Prompt2Craft found no significant gain after two re-prompt rounds). No study reports a clean first-retry fix rate for text chat replies; practitioners say one retry "catches the vast majority" without a number.

### Cited Findings
**Feedback must be external**
- Huang et al. (ICLR 2024): intrinsic self-correction (no external feedback) hurts: GPT-3.5 GSM8K 75.9 → 75.1 → 74.7; GPT-3.5 CommonSenseQA 75.8 → 38.1 → 41.8; GPT-4 GSM8K 95.5 → 91.5 → 89.0; GPT-4 HotpotQA 49.0 → 49.0 → 43.0. With oracle (ground-truth) feedback telling it when to stop: GPT-4 GSM8K 97.5, CSQA 85.5, HotpotQA 59.0; GPT-3.5 GSM8K 84.3, CSQA 89.7. Conclusion: "when valid external feedback is available, it is beneficial to leverage it properly." — [arXiv:2310.01798](https://arxiv.org/html/2310.01798) (Oct 2023, rev. Mar 2024)
- Kamoi et al. (TACL 2024): no prior work shows successful self-correction from prompted self-feedback except on tasks "exceptionally suited" to it; "self-correction works well in tasks that can use reliable external feedback"; large-scale fine-tuning also enables it. — [arXiv:2406.01297](https://arxiv.org/abs/2406.01297) (v3 Dec 2024)
- Self-Correction Bench (COLM 2026): across 14 open non-reasoning models, a 64.5% "self-correction blind spot": models correct an error when it is presented as external but often fail on the identical error attributed to themselves. Appending "Wait" reduces the blind spot by 89.3% with no training. — [arXiv:2507.02778](https://arxiv.org/abs/2507.02778) (Jul 2025, v3 Aug 2026)
- CRITIC: QA gains depend on tool feedback; without the search API improvements shrink to near zero or reverse. — [beancount.io summary of CRITIC](https://beancount.io/bean-labs/research-logs/2026/04/26/critic-llm-self-correct-tool-interactive-critiquing) (secondary)
- ACL 2025 "dark side of intrinsic self-correction": Llama-3.1-8B shows a 20.4% accuracy drop and 58.8% of correct answers overturned under self-correction on complex tasks. — [aclanthology 2025.acl-long.1314](https://aclanthology.org/2025.acl-long.1314.pdf) (from search snippet)

**Feedback content matters**
- VeriHarness (15 Jul 2026): external validators decide acceptance, budgets and traces; 50 paired TextWorld games, four-call cap. Feedback with failure location + observed value + "admissible alternatives" raised success from 14/50 → 36/50 (Qwen2.5-Coder-14B) and 8/50 → 29/50 (Llama-3.1-8B); location + observed value alone performed close to raw diagnostics, so most of the gain comes from naming what *is* allowed. Prose vs keyed-JSON feedback made nearly no difference. Ordering held across call budgets. — [arXiv:2607.14167](https://arxiv.org/abs/2607.14167)
- Self-Debugging (2023): execution/unit-test feedback improves code accuracy up to 12% (TransCoder, MBPP); code-explanation feedback +2–3% on Spider (+9% on hardest). — [arXiv:2304.05128](https://arxiv.org/abs/2304.05128)
- PCAS: denial messages with `@suggestion` let the agent "retry with a corrected request"; compliance 48% → 93% under that regime. — [arXiv:2602.16708v2](https://arxiv.org/html/2602.16708v2)

**How many retries**
- Reflexion: HumanEval pass@1 91.0% (Python) vs GPT-4 80.1%, 68.0% Rust vs 60.0%; AlfWorld 130/134 after 12 trials with "an immediate spike between the first two trials, then steady gains"; HotpotQA +20% overall, ReAct+GPT-4 0.39 → 0.51; retried until 3 consecutive failures; WebShop runs terminated after 4 trials for lack of improvement. Evaluators were external (exact match, environment) or self-written unit tests. — [arXiv:2303.11366](https://arxiv.org/html/2303.11366) (Mar 2023, v4 Oct 2023)
- Self-correcting vision agents (Jan 2026): first correction raised cumulative success from ≈62% (attempt 1) to ≈70% (attempt 2), saturating near 79% by attempt 5. — [arXiv:2601.11637](https://arxiv.org/pdf/2601.11637) (from search snippet; different modality)
- Prompt2Craft (Dec 2025): "more than two re-prompt rounds gave no significant gain" in early tests. — [arXiv:2512.04568](https://arxiv.org/pdf/2512.04568) (from search snippet)
- IaC-Guard-V (Sep 2026): feedback-driven retry loop produced "retry confusion" in 3/50 (6%) of Sonnet items, overall net effect still positive. — [arXiv:2609.28488](https://arxiv.org/pdf/2609.28488) (from search snippet; code-repair task)
- Reflect-Retry-Reward (2025) lists "diminishing returns from repeated reflection" as a known limitation and retries only cases flagged by an external verifier. — [arXiv:2505.24726](https://arxiv.org/html/2505.24726) (from search snippet; RL method, not applicable without training)

**Chain-of-Verification**
- CoVe (Sep 2023), Llama 65B: Wikidata list precision 0.17 → 0.36 (two-step); Wiki-Category 0.12 → 0.22; MultiSpanQA F1 0.39 → 0.48; longform biography FactScore 55.9 → 71.4 (factor+revise) while average facts per answer fell 16.6 → 12.3. Extra cost: one planning prompt, one prompt per verification question (factored), optional cross-check per question, plus final revision. — [arXiv:2309.11495](https://arxiv.org/html/2309.11495)

**Practitioner reports (no measured rates)**
- Pattern: append the validation error (rewritten as a plain instruction) and the model's prior bad output to the next request; model edits rather than regenerates; cap attempts; truncated/empty output has nothing to correct so a plain retry is still needed underneath; a provider failover shouldn't count as an attempt. No success-rate numbers. — [dev.to/nhirschfeld](https://dev.to/nhirschfeld/when-an-llm-response-fails-validation-feed-the-error-back-into-the-retry-2e1e) (posted Jul 2, year not shown)
- "For most applications, one retry catches the vast majority of failures"; a single retry with the error included recovers most correctable mistakes; if the loop fires on 15% of requests the prompt/schema is the bug. — [TianPan, 10 Nov 2025](https://tianpan.co/blog/2025-11-10-structured-output-production-llms); [TianPan, 9 Apr 2026](https://tianpan.co/blog/2026-04-09-structured-output-failures-production-llm)
- One practitioner found a single enum field caused most retries; rewriting its description cut retries more than changing the loop. — [dev.to comment thread](https://dev.to/nhirschfeld/when-an-llm-response-fails-validation-feed-the-error-back-into-the-retry-2e1e)

### Inferences
- Our plan (deterministic validator → violation text → one retry) sits exactly in the regime the literature says works: the feedback is external, reliable and specific. The two measured risks are "retry confusion" (~6% in one code study) and wasted retries on truncated output; both argue for a hard cap of 1–2 and for logging retry outcomes.
- VeriHarness's finding is the most actionable detail: the violation message should list the admissible values (e.g. "allowed URLs this turn: [...]; allowed prices: [...]"), not just "URL not from tool result."
- Self-Correction Bench suggests phrasing the retry as an external check ("A validator rejected the reply because ...") rather than asking the model to "review your answer."
- CoVe is the wrong tool for us: it spends 3–10 extra LLM calls to establish facts the model doesn't have; in our case the ground truth (tool results) is already in hand, so a set-membership check replaces the whole verification chain.

### Gaps
- No peer-reviewed first-retry fix rate for chat-style replies validated by deterministic checks (none reported). The nearest numbers are the vision-agent curve (+8 pts on retry 1 of +17 total) and Reflexion's qualitative "spike between first two trials."
- Reflexion's HumanEval trial count is not stated in the text read.

---

## KQ6. Grounding/provenance checks: verifying every number or URL came from a tool result; known implementations and accuracy

### Takeaway
Published attribution checkers split into cheap deterministic checks (link liveness, exact-span pointers) that are near-perfect, and claim-support checks (LLM judge or NLI classifier) that top out around 82–88% accuracy and have no published false-positive rates. Every study finds URL validity is high (94–100% for frontier models) while claim support is low (39–77%), i.e. "the link exists" and "the link supports the sentence" are different problems. For our case, "every URL/price must literally appear in this turn's tool results" is the deterministic kind and needs no model.

### Cited Findings
- "Cited but Not Verified" (7 May 2026): 14 LLMs, 130 research queries; Link Works (automatic HTTP check, no LLM) 94–100% for frontier models, 80.8–100% open source; Relevant Content >80% frontier (top 95.7%, Claude Opus 4.5); Fact Check (LLM-judge, calibrated on 50–100 manual reviews) 24.4% (OSS-120B) to 76.8% (Claude Opus 4.5), abstract range 39–77% for strongest models; fact-check fell from 78.6% → 16.7% (GPT-5.4) and 80.0% → 57.9% (Claude Opus 4.6) as tool calls rose from 2 to 150. — [arXiv:2605.06635v1](https://arxiv.org/html/2605.06635v1)
- Wu et al. (medical references; Feb 2024 arXiv, Nature Communications 2025): 1,200 questions, >40K statement-source pairs; across five top LLMs 50–90% of responses not fully supported by their own sources; GPT-4 + RAG: ~30% of statements unsupported, nearly half of responses not fully supported; GPT-4 as verifier agreed with a panel of medical doctors 88% of the time. — [arXiv:2402.02008](https://arxiv.org/abs/2402.02008); [Nature Comms](https://www.nature.com/articles/s41467-025-58551-6) (search snippet adds: GPT-4o+RAG 100% valid URLs, 75.7% statement-level, 38.4% response-level support; Nature page itself blocked by cookie redirect)
- GhostCite: across 13 LLMs and 375,440 citations, citation hallucination rates ranged 14.23% to 94.93%; no model reached zero. — [arXiv:2602.06718v1](https://arxiv.org/html/2602.06718v1) (from search snippet)
- CiteGuard: retrieval-augmented citation verifier reaches up to 68.1% accuracy on CiteME vs 69.2% human baseline; 45.1% avg with GPT-4o vs 35.4% CiteAgent baseline. — [arXiv:2510.17853v4](https://arxiv.org/html/2510.17853v4) (from search snippet)
- CiteVerifier (ICCS 2025): GPT-4o ≈ 0.88 accuracy as a citation verifier in one configuration. — [ICCS 2025 paper](https://www.iccs-meeting.org/archive/iccs2025/papers/159110235.pdf) (from search snippet)
- HHEM (Vectara) with non-fabrication checking: accuracy 82.2%, TPR 78.9%; reduces evaluation time from 8 h (multi-stage LLM pipeline) to 10 min; struggles with localized hallucinations in summarization. No published FPR. — [arXiv:2512.22416](https://arxiv.org/abs/2512.22416v1) (Dec 2025); vendor claim that HHEM-2.1 beats GPT-3.5/GPT-4 at detection — [vectara.com](https://www.vectara.com/blog/hhem-2-1-a-better-hallucination-detection-model) (vendor)
- AIMon HDM-2 docs argue precision matters more than recall for grounding checks because false positives degrade UX. — [aimon.ai](https://aimon.ai/announcements/aimon-hdm-1-hallucination-detection-model) (vendor)
- Anthropic Citations API: `cited_text` plus `document_index` and `start_char_index`/`end_char_index` (0-indexed, exclusive end), or page / content-block indices; "citations are guaranteed to contain valid pointers to the provided documents" because the API parses the model's standardized citation output and extracts `cited_text` directly; in Anthropic's evaluations the feature "is significantly more likely to cite the most relevant quotes" than prompt-based citing (no number given); `cited_text` not counted toward output or later input tokens; works on `document` and `search_result` blocks; cannot be combined with structured outputs (400 error); all active models supported. — [platform.claude.com citations](https://platform.claude.com/docs/en/build-with-claude/citations) (undated, current)
- Guardrails AI `provenance_llm` validator: FIX action removes sentences estimated hallucinated (LLM-based). — [Guardrails AI error remediation](https://www.guardrailsai.com/docs/concepts/error_remediation)
- LLM Guard output scanners include `MaliciousURLs`, `URLReachability`, `Regex`, `BanSubstrings`, `FactualConsistency` (archived project). — [protectai/llm-guard](https://github.com/protectai/llm-guard)

### Inferences
- Our rule is stricter and simpler than anything benchmarked: it is not "does the source support the claim" but "is this exact string in the allowed set." Extract URLs (regex) and prices (currency/number regex) from the reply, build the allowed sets from this turn's tool results, and fail on any token outside the set. Expected FPR is whatever your extractor mis-tokenizes (e.g. "$1,500–$2,000" ranges, "1.500 €" locale formats); plan a normalizer and test fixtures for those.
- Anthropic Citations would give span-level provenance for free if clinic/package data were passed as `search_result` blocks, but it is incompatible with structured outputs and does not verify numbers the model restates in prose; keep it as an optional add-on, not the primary check.
- LLM-judge grounding checks (HHEM ~82% accuracy, judge agreement 88%) are not accurate enough to be the gate for prices in SMS; they are a fallback for free-text claims only.

### Gaps
- No published false-positive rate for HHEM, Guardrails `provenance_llm`, or any LLM-judge grounding check (none reported).
- No implementation found that specifically does "numbers/URLs must match tool results from this turn" with reported accuracy; the deterministic variant appears only in practitioner posts (e.g. "rule-based LLM output validation" on dev.to), not evaluated.

---

## KQ7. Structured-output schemas (API-enforced JSON schema) as a validator: what they catch and what they cannot

### Takeaway
API-enforced schemas (OpenAI strict mode, Anthropic `output_config.format` via constrained decoding) guarantee *shape*: valid JSON, required keys present, enum values valid, and on Anthropic a regex subset and a few string formats (uri, email, date). They do not guarantee content truth (OpenAI: outputs "can still contain mistakes"), Anthropic does not support `minimum/maximum`, `minLength/maxLength` or recursive schemas (400 error), refusals and `max_tokens` truncation bypass the schema, the first use of a schema adds grammar-compilation latency, and citations cannot be combined with structured outputs. Of our four checks, only "URL on the last line" can be made structural (a `{body, url}` object); "URL/price from tool results," "no markdown," and "one sentence" need deterministic post-checks.

### Cited Findings
- Anthropic structured outputs: "guarantee schema-compliant responses through constrained decoding." Supported: object/array/string/integer/number/boolean/null, `enum` (primitives only), `const`, `anyOf`, `allOf` (not with `$ref`), internal `$ref`/`$defs`, `required`, `additionalProperties: false` (required for objects), string formats `date-time, time, date, duration, email, hostname, uri, ipv4, ipv6, uuid`, array `minItems` only 0 or 1, regex `pattern` subset (anchors, `* + ?`, simple `{n,m}`, character classes, groups). Not supported (400 error): recursive schemas, external `$ref`, `minimum/maximum/multipleOf`, `minLength/maxLength`, other array constraints, `additionalProperties` other than false, backreferences, lookaround, `\b`. SDK helpers can move numeric/length constraints into descriptions and validate client-side. — [platform.claude.com structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (undated, current)
- Anthropic limitations: `stop_reason: "refusal"` returns 200, is billed, may not match schema; `stop_reason: "max_tokens"` output may be incomplete/invalid; enum casing may differ (compare case-insensitively); first use of a schema compiles a grammar (adds latency), compiled grammars cached 24 h from last use, invalidated by schema-structure or tool-set changes; changing `output_config.format` invalidates the prompt cache; a small system prompt is added and counts as input tokens; per-request limits 20 strict tools / 24 optional params / 16 union-typed params / 180 s compile timeout. Supported models include claude-haiku-4-5-20251001 and claude-haiku-5-5. — [platform.claude.com structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- OpenAI Structured Outputs: "ensures the model will always generate responses that adhere to your supplied JSON Schema" (no percentage on the page). Supported: `pattern`, formats (`date-time, time, date, duration, email, hostname, ipv4, ipv6, uuid`), `multipleOf/minimum/maximum/exclusive*`, `minItems/maxItems`; `minLength/maxLength` not listed. All fields must be `required` (emulate optional with `null` union), `additionalProperties: false`, root must be an object. Limits: 5,000 properties, depth 10, 1,000 enum values, 120,000 chars of names/enums. Refusals come back in a separate `refusal` field; `max_output_tokens` can yield `status == "incomplete"`. "Structured Outputs can still contain mistakes." — [developers.openai.com structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) (undated, current)
- Anthropic Citations cannot be used with structured outputs (400 if both `citations.enabled` and `output_config.format`). — [platform.claude.com citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- PydanticAI: structured output validated with Pydantic; on failure "Pydantic AI tells the model to try again"; `@agent.output_validator` raises `ModelRetry(message)` to request another output; output retry budget defaults to 1 (`Agent(retries={'output': N})`, `agent.run(retries=...)`, `ToolOutput(max_retries=N)`); `ctx.max_retries`/`ctx.retry` exposed; streaming runs validators on partial outputs too. — [pydantic.dev PydanticAI output docs](https://pydantic.dev/docs/ai/core-concepts/output/) (undated)
- Instructor: `max_retries=N` means at most N+1 SDK calls; failed attempts propagate to reask handlers "enabling contextual error messages and progressive corrections"; optional `token_budget` stops retries; `InstructorRetryException` exposes `n_attempts` and `failed_attempts`; no stated success rate. — [python.useinstructor.com retrying](https://python.useinstructor.com/concepts/retrying/) (undated)
- Practitioner failure catalog: JSON mode/schema does not prevent semantically wrong values; track per-field first-try pass rate. — [TianPan, 9 Apr 2026](https://tianpan.co/blog/2026-04-09-structured-output-failures-production-llm)

### Inferences
- A schema `{ reply: string, url: string | null, escalate: boolean }` with `url` carrying `format: "uri"` structurally guarantees "exactly one URL field" and lets the TypeScript layer render "reply + newline + url" so the URL is always last; the model never has to obey a formatting rule for that. "No markdown" can be partially expressed as a `pattern` (Anthropic's subset lacks lookahead, so a positive pattern like `^[^*_#\x60]*$` is expressible; test it), but sentence count and price/URL provenance are not schema-expressible on either API.
- Schema refusals and `max_tokens` are two failure classes the retry loop must treat differently (no violation to feed back; plain retry or escalate), matching the dev.to caveat.
- First-request grammar compilation and prompt-cache invalidation on schema change mean: keep one stable schema per reply type, don't vary it per turn, or problem 5 (cost) gets worse.

### Gaps
- Neither vendor publishes a schema-adherence percentage on the current docs pages (OpenAI's earlier "100%" marketing claim was not on the page fetched; none reported here).
- Anthropic grammar-compile latency is not quantified (none reported).

---

## Direct answer: is "deterministic validators plus one retry with the violation fed back" a known, effective pattern?

### Takeaway
Yes. It is the default behavior of at least four mainstream libraries (Guardrails AI REASK with `num_reasks=1`; PydanticAI `ModelRetry` with output retry budget 1; Instructor `max_retries`; LangChain retry/fixing parsers per practitioner sources) and the enforcement loop of the 2026 Policy Compiler (`@deny_message`/`@suggestion` → agent retries). The research base says the pattern works *because* the feedback is external and reliable (Huang 2023; Kamoi 2024; VeriHarness 2026), that the retry message should name the admissible alternatives (VeriHarness: 14/50 → 36/50), and that gains concentrate on the first retry with little after the second (Reflexion; vision agents 62 → 70 → 79; Prompt2Craft). What is *not* published is a measured first-retry fix rate for chat replies; expect to measure it yourself and to see a small "retry confusion" rate (one code study: 6%).

### Cited Findings
- Library defaults: Guardrails AI `num_reasks` = 1 — [API ref](https://www.guardrailsai.com/docs/api_reference_markdown/guards); PydanticAI output retries default 1 — [docs](https://pydantic.dev/docs/ai/core-concepts/output/); Instructor `max_retries=N` → N+1 calls — [docs](https://python.useinstructor.com/concepts/retrying/); OpenAI Agents SDK output guardrails halt with an exception, no retry — [docs](https://openai.github.io/openai-agents-python/guardrails/).
- Engine-authored correction hint then retry: PCAS `@deny_message`/`@suggestion`, τ²-bench compliance 48% → 93%. — [arXiv:2602.16708v2](https://arxiv.org/html/2602.16708v2)
- External feedback works, intrinsic does not: GPT-4 HotpotQA 49 → 59 with oracle feedback vs 49 → 43 intrinsic. — [arXiv:2310.01798](https://arxiv.org/html/2310.01798); "self-correction works well in tasks that can use reliable external feedback" — [arXiv:2406.01297](https://arxiv.org/abs/2406.01297)
- Name the admissible alternatives: 14/50 → 36/50 and 8/50 → 29/50; location+value alone ≈ baseline. — [arXiv:2607.14167](https://arxiv.org/abs/2607.14167)
- Present the error as external: 64.5% blind spot for self-attributed errors vs corrected when external. — [arXiv:2507.02778](https://arxiv.org/abs/2507.02778)
- First retry carries most of the gain: ≈62% → ≈70% → ≈79% by attempt 5 — [arXiv:2601.11637](https://arxiv.org/pdf/2601.11637); AlfWorld "immediate spike between the first two trials" — [arXiv:2303.11366](https://arxiv.org/html/2303.11366); >2 re-prompt rounds no significant gain — [arXiv:2512.04568](https://arxiv.org/pdf/2512.04568).
- Retry can confuse: 3/50 (6%) "retry confusion" on Sonnet, net still positive. — [arXiv:2609.28488](https://arxiv.org/pdf/2609.28488)
- Practitioner consensus, unmeasured: "one retry catches the vast majority of failures"; cap at 2–3; if >15% of requests retry, fix the prompt/schema. — [TianPan 2025](https://tianpan.co/blog/2025-11-10-structured-output-production-llms); [dev.to](https://dev.to/nhirschfeld/when-an-llm-response-fails-validation-feed-the-error-back-into-the-retry-2e1e)

### Inferences
- Recommended loop for our build: generate → run deterministic validators (each returns `{id, pass, violation, allowed?}`) → if any fail, append `{role: user, content: "A validator rejected the previous reply. Violations: [...]. Allowed URLs this turn: [...]. Allowed prices: [...]. Rewrite the reply."}` → one retry → re-validate → on second failure, send a safe fallback (or the escalation one-liner) and log. Log `{turn, validatorIds fired, retried, retryFixed}` so first-retry fix rate per validator becomes a dashboard number within days.
- Treat `stop_reason: refusal` / `max_tokens` as a separate branch (plain retry with higher max_tokens or fallback), not a violation retry.

### Gaps
- No published first-retry fix rate for deterministic-validated chat replies (none reported); the only quantified multi-retry curves are agentic/code/vision tasks.

---

## Method cards

Effort assumes TypeScript, hosted Haiku-class model, one developer. Problems addressed are by number (1–8).

### Card 1 — Ordered authority levels with "conflicting lower level is inapplicable" (OpenAI Model Spec chain of command)
- One line: Precedence = short ordered list of instruction *sources*; a lower-source instruction that conflicts with a higher one is simply not applied; tool outputs carry no authority.
- Sources: [Model Spec 2026-08-18](https://model-spec.openai.com/2026-08-18.html) (policy doc, 18 Aug 2026); [Wallace et al. 2024](https://arxiv.org/html/2404.13208) (paper, 19 Apr 2024); [IHEval](https://arxiv.org/html/2502.08745v2) (benchmark, Mar 2025).
- Claims: OpenAI defines six levels (root > system > developer > user > guideline > no authority) and one combining rule, plus "later supersedes earlier" within a level and "two root conflicts → inaction." Wallace et al. show that getting a model to honor this by prompt alone performs much worse than training; IHEval shows a Haiku-class model resolves conflicts correctly only ~28% of the time and that adding priority prose does not help.
- Problems addressed: 7 (defines who wins), partially 2.
- Reported numbers: +63% system-prompt-extraction defense, +30% jailbreak robustness (trained GPT-3.5); IHEval conflict accuracy Claude-3 Haiku 27.9%, GPT-4o 70.0%.
- Effort: 2 h — write a one-page "rule precedence policy" (source order: hard constraints > operator policy > per-intent rules > style defaults; tool results = data) and adopt it in the rule registry's `kind` field.
- Risks: Prompt-only adoption of the ordering is weak on small models (IHEval). Must be enforced in code (Card 3), not prose.
- Verdict: try first — as the written contract that the code-level engine implements; do not rely on the model to apply it.

### Card 2 — Hard constraints outside the weighing + holistic category ordering (Anthropic constitution)
- One line: Separate never-weighed hard constraints from a short, "generally" ordered list of categories, and keep a separate, non-strict source order (Anthropic > operator > user).
- Sources: [anthropic.com/constitution](https://www.anthropic.com/constitution) (policy doc, 22 Jan 2026); [announcement](https://www.anthropic.com/news/claude-new-constitution) (22 Jan 2026).
- Claims: Safe > ethical > guidelines > helpful, "holistic rather than strict"; hard constraints "remain constant regardless of instructions"; operator instructions win over user instructions except where they harm users; guideline-vs-ethics conflicts are flaws to fix.
- Problems addressed: 7 (structure), 6 (categories isolate edits).
- Reported numbers: none reported.
- Effort: 1 h — tag each of our rules as `hard` (never overridden: e.g. no medical advice, no price not in tool results) vs `policy` (ordered by category) vs `style` (defaults).
- Risks: "Holistic" ordering is unfalsifiable; use it for taxonomy only.
- Verdict: try if time — cheap taxonomy; the enforcement comes from Card 3.

### Card 3 — Forbid-overrides-permit rule engine with determining-rule diagnostics (Cedar semantics; PCAS; APPA logging)
- One line: Encode rules as code with a `kind` (forbid/require/permit), evaluate all applicable rules per turn with the fixed combining rule, and log the rules that determined the outcome.
- Sources: [Cedar authorization docs](https://docs.cedarpolicy.com/auth/authorization.html) (docs, undated); [PCAS arXiv:2602.16708v2](https://arxiv.org/html/2602.16708v2) (paper, 19 Feb 2026); [APPA arXiv:2607.24625v1](https://arxiv.org/html/2607.24625v1) (paper, 27 Jul 2026); [Policy-as-logic arXiv:2608.11905](https://arxiv.org/abs/2608.11905) (workshop paper, 12 Aug 2026).
- Claims: Cedar needs no priority numbers: any satisfied forbid → Deny, else any satisfied permit → Allow, else Deny, and the response names the determining policies. PCAS uses the same allow-unless-denied structure, returns a decision trace, and annotates denials with suggestions the agent uses to retry; moving policy out of the prompt cut tokens 3.3% and raised τ²-bench compliance 48% → 93%. APPA records rulings and dispatches atomically to an append-only log. Policy-as-logic reports ~10x lower tokens than policy-as-prompt.
- Problems addressed: 1, 2, 5, 6, 7, 8 (rules are isolated functions with unit tests; the winner is logged).
- Reported numbers: PCAS compliance 48% → 93%, runtime +20%, tokens −3.3%, zero FPs in injection runs; APPA attack success 31–50% → 0–7%.
- Effort: 4 h — `rules/*.ts` each exporting `{id, kind, appliesWhen(ctx), promptFragment?, validator?}`; `evaluate(ctx) → {activeRules, determining[]}`; only `promptFragment`s of active rules go into the prompt; emit one JSON log line per turn with `determining`. Unit tests: fixture contexts where two rules both apply, assert the winner.
- Risks: Over-engineering if rules are few; keep the registry flat. Datalog/ASP engines are overkill; TS predicates suffice.
- Verdict: try first — this is the one change that hits six of the eight problems.

### Card 4 — Instruction Hierarchy training (Wallace et al.)
- One line: Fine-tune the model on synthetic aligned/misaligned instruction pairs so it ignores lower-privilege conflicts.
- Sources: [arXiv:2404.13208](https://arxiv.org/html/2404.13208) (paper, 19 Apr 2024).
- Claims: SFT+RLHF on GPT-3.5 Turbo improved system-prompt-extraction defense 63% and held-out jailbreak robustness >30% with comparable capability scores; prompt-only baseline much worse.
- Problems addressed: 7 (model-side).
- Reported numbers: +63%, +30–34%; no exact over-refusal rate.
- Effort: n/a (fine-tuning excluded).
- Risks: n/a.
- Verdict: skip — requires fine-tuning; keep its aligned/misaligned taxonomy for test-case design.

### Card 5 — Guardrails AI (validator + REASK)
- One line: Python library: validators with on_fail = reask/fix/filter/refrain/noop/exception; reask prompt auto-includes failed criteria; default one reask.
- Sources: [error remediation docs](https://www.guardrailsai.com/docs/concepts/error_remediation); [API ref](https://www.guardrailsai.com/docs/api_reference_markdown/guards); [Liu 2026 measurements](https://zihaoliu.substack.com/p/quantifying-the-safety-tax-where) (blog, 14 Mar 2026); [No Free Lunch](https://arxiv.org/html/2504.00441v2) (paper, Apr 2025).
- Claims: The closest packaged version of our plan; `num_reasks=1` by default; `full_schema_reask` regenerates whole vs partial output; REASK does not support streaming. Independently measured FPR 2.5% (6/241 benign) and no significant latency overhead for its safety validators; weighted F1 0.60–0.92; ~0.35 s per call.
- Problems addressed: 2 (validator name in outcome), 8.
- Reported numbers: FPR 2.5%, latency 0.348–0.357 s, error rate 1.6%; no reask success rate (none reported).
- Effort: 3 h to re-implement the contract in TS (not to adopt the library: Python-only).
- Risks: Its measured FPR/latency are for LLM/classifier validators, not our string checks; no streaming with reask.
- Verdict: try if time — as the reference API shape; do not take the dependency.

### Card 6 — NeMo Guardrails (output rails)
- One line: Colang-configured input/dialog/retrieval/execution/output rails; output rails block or alter; LLM-based "self check output/facts/hallucination."
- Sources: [README](https://github.com/NVIDIA/NeMo-Guardrails) (v0.24.1, Apache-2.0); [Liu 2026](https://zihaoliu.substack.com/p/quantifying-the-safety-tax-where); [No Free Lunch](https://arxiv.org/html/2504.00441v2).
- Claims: Five rail types with tracing to your observability backend, but no retry/regenerate on output failure. Measured: +443 ms median (+6.8%), 3 API calls/request, +65% tokens, 0/241 benign blocked, indirect-injection success 28.9% → 10.5%.
- Problems addressed: 2 (rail tracing), weakly.
- Reported numbers: as above; latency 0.69–1.02 s per check with gpt-4o-mini.
- Effort: 6+ h (Python service + Colang); exceeds budget.
- Risks: Python, extra LLM calls per turn (problem 5 worse), no retry.
- Verdict: skip.

### Card 7 — LLM Guard / Rebuff (Protect AI)
- One line: Output scanners (Regex, BanSubstrings, URLReachability, MaliciousURLs, JSON, Relevance...) and an input-side injection detector with canary tokens.
- Sources: [llm-guard](https://github.com/protectai/llm-guard); [rebuff](https://github.com/protectai/rebuff) (archived 16 May 2025).
- Claims: 21 output scanners, no retry, no published numbers; both projects archived/unmaintained.
- Problems addressed: none beyond what a regex in TS does.
- Reported numbers: none reported.
- Effort: 0 (do not adopt).
- Risks: unmaintained.
- Verdict: skip — but the scanner list is a good checklist of deterministic output checks (ban-substrings, regex, URL reachability).

### Card 8 — Validator + retry-with-error libraries (Instructor, PydanticAI ModelRetry, LangChain retry parsers)
- One line: Validate the output in code; on failure send the error text (and optionally the bad output) back and ask for a corrected output; default budget one retry.
- Sources: [Instructor retrying](https://python.useinstructor.com/concepts/retrying/); [PydanticAI output](https://pydantic.dev/docs/ai/core-concepts/output/); [dev.to pattern](https://dev.to/nhirschfeld/when-an-llm-response-fails-validation-feed-the-error-back-into-the-retry-2e1e); [VeriHarness](https://arxiv.org/abs/2607.14167) (15 Jul 2026).
- Claims: PydanticAI's output retry budget defaults to 1; Instructor counts N+1 calls and can stop on a token budget; practitioners feed the error plus prior output so the model edits rather than regenerates; VeriHarness shows feedback that lists admissible alternatives more than doubles repair success.
- Problems addressed: 2 (validator id in log), 8 (each validator unit-testable), plus the correctness goal.
- Reported numbers: VeriHarness 14/50 → 36/50, 8/50 → 29/50; practitioner "one retry catches the vast majority" (unmeasured).
- Effort: 3 h — `validators/*.ts` (urlsFromToolResults, pricesFromToolResults, noMarkdown, urlLastLine, oneSentenceIfEscalation), `validate(reply, turnCtx) → Violation[]`, retry message builder that includes allowed sets, cap = 1, log outcomes.
- Risks: retry confusion (~6% in one study); wasted retry on truncated/refused outputs; must normalize price formats.
- Verdict: try first — this is the core of the rebuild.

### Card 9 — API-enforced structured output (Anthropic `output_config.format` / OpenAI strict)
- One line: Constrained decoding guarantees JSON shape, required keys, enums, and (Anthropic) a regex/format subset; nothing about truth.
- Sources: [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs); [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- Claims: Use `{reply, url|null, escalate}` so the URL is a field (render it last in code); Anthropic lacks min/max and length constraints, refusals/max_tokens bypass the schema, first use compiles a grammar, schema changes invalidate caches, and citations cannot be combined with it.
- Problems addressed: 8 (format rules become schema, testable in isolation), 6 (format decoupled from policy prose).
- Reported numbers: none reported (no adherence percentage on either page).
- Effort: 1.5 h.
- Risks: SMS needs plain text, so keep the JSON thin; watch enum casing; keep one stable schema.
- Verdict: try first — for shape; pair with Card 8 for content.

### Card 10 — Deterministic provenance check (URLs/prices ⊆ this turn's tool results)
- One line: Extract every URL and price from the reply and require exact membership in sets built from this turn's tool results.
- Sources: [Cited but Not Verified](https://arxiv.org/html/2605.06635v1) (7 May 2026); [Wu et al.](https://arxiv.org/abs/2402.02008); [HHEM paper](https://arxiv.org/abs/2512.22416v1); [LLM Guard scanners](https://github.com/protectai/llm-guard).
- Claims: Literature shows the model-side problem is real (claim support 39–77% even for frontier models; GPT-4+RAG ~30% unsupported statements) and that model/NLI checkers only reach ~82–88% accuracy with no published FPR, whereas link-level checks are near-perfect. Exact set membership is the strongest and cheapest check available when ground truth is already in hand.
- Problems addressed: 2 (which validator failed), 8.
- Reported numbers: link validity 94–100% vs fact support 24–77%; HHEM accuracy 82.2%; GPT-4 verifier vs MDs 88%.
- Effort: 2 h (part of Card 8) — URL regex, price normalizer (currency symbols, thousands separators, ranges), set build from tool JSON.
- Risks: Price-format normalization is the main FP source; ranges and computed totals ("two sessions = $3,000") need either a rule (no arithmetic) or allowed-derivation logic.
- Verdict: try first.

### Card 11 — Anthropic Citations API as provenance
- One line: Pass clinic/package data as `document`/`search_result` blocks with citations enabled; the API returns exact spans guaranteed to point into the provided content.
- Sources: [platform.claude.com citations](https://platform.claude.com/docs/en/build-with-claude/citations).
- Claims: `cited_text` with char/page/block indices, "guaranteed to contain valid pointers," free of output-token cost; incompatible with structured outputs; Anthropic reports better relevance than prompt-based citing but gives no number.
- Problems addressed: supports the provenance goal; none of 1–8 directly.
- Reported numbers: none reported.
- Effort: 3 h; conflicts with Card 9.
- Risks: Cannot coexist with structured outputs; does not check restated numbers in prose.
- Verdict: try if time — only if Card 9 is dropped.

### Card 12 — Chain-of-Verification / Reflexion-style multi-call self-verification
- One line: Spend extra LLM calls to plan verification questions, answer them independently, and revise (CoVe) or reflect across trials (Reflexion).
- Sources: [CoVe arXiv:2309.11495](https://arxiv.org/html/2309.11495) (Sep 2023); [Reflexion arXiv:2303.11366](https://arxiv.org/html/2303.11366) (2023).
- Claims: CoVe raises FactScore 55.9 → 71.4 and list precision 0.17 → 0.36 at the cost of several extra calls and fewer stated facts; Reflexion reaches 91% HumanEval with external test feedback over multiple trials.
- Problems addressed: none of 1–8; increases cost (5).
- Reported numbers: as above.
- Effort: 4 h; adds 3–10 calls per turn.
- Risks: Latency/cost on SMS; our facts are already known from tools.
- Verdict: skip — replaced by Card 10.

---

## Quantitative claims table

| # | Claim | Number | Source (date, type) |
|---|---|---|---|
| 1 | Instruction-hierarchy training: system-prompt-extraction defense improvement | +63% | [Wallace et al.](https://arxiv.org/html/2404.13208) (Apr 2024, paper) |
| 2 | Held-out jailbreak robustness improvement | >30% (up to 34%) | same |
| 3 | Baseline prompt priority levels | system 0, user 10, image/audio 20, tool 30 | same |
| 4 | Model Spec authority levels | 6 (root, system, developer, user, guideline, no authority) | [Model Spec](https://model-spec.openai.com/2026-08-18.html) (18 Aug 2026, policy) |
| 5 | IHEval size | 3,538 examples, 9 tasks | [IHEval](https://arxiv.org/html/2502.08745v2) (Mar 2025, paper) |
| 6 | IHEval GPT-4o aligned → conflict | 91.0 → 70.0 | same |
| 7 | IHEval Claude-3 Haiku aligned → conflict | 75.9 → 27.9 | same |
| 8 | IHEval Claude-3 Sonnet aligned → conflict | 85.1 → 30.7 | same |
| 9 | IHEval Llama-3.1 70B / 8B conflict | 14.0 / 11.3 | same |
| 10 | IHEval priority prompt effect, GPT-4o | 70.0 → 67.2 | same |
| 11 | Constitution property ordering | safe > ethical > guidelines > helpful ("holistic") | [Anthropic](https://www.anthropic.com/constitution) (22 Jan 2026, policy) |
| 12 | PCAS τ²-bench compliance | 48% → 93% | [PCAS](https://arxiv.org/html/2602.16708v2) (Feb 2026, paper) |
| 13 | PCAS runtime / token cost | +~20% / −~3.3% | same |
| 14 | PCAS prompt-injection success (GPT-4.1-mini) | 5/5 → 0/5; utility 5/5; runtime 5.3 s → 8.5–10.4 s | same |
| 15 | PCAS false positives in injection runs | 0 observed | same |
| 16 | APPA attack success | 31–50% → 0–7% | [APPA](https://arxiv.org/html/2607.24625v1) (Jul 2026, paper) |
| 17 | Policy-as-logic token usage vs policy-as-prompt | ~10x lower | [arXiv:2608.11905](https://arxiv.org/abs/2608.11905) (Aug 2026, workshop) |
| 18 | NeMo median latency overhead | +443 ms (+6.8%, p=0.13 n.s.) | [Liu](https://zihaoliu.substack.com/p/quantifying-the-safety-tax-where) (14 Mar 2026, blog) |
| 19 | NeMo overhead on benign queries | ~600–960 ms | same |
| 20 | NeMo API calls per request | 3 | same |
| 21 | NeMo tokens vs baseline | 1,084 vs 656 (+65%) | same |
| 22 | NeMo benign false positives | 0/241 (0%) | same |
| 23 | Guardrails AI benign false positives | 6/241 (2.5%) | same |
| 24 | Guardrails AI median latency vs native | −261 ms (n.s.) | same |
| 25 | Guardrails AI error rate / NeMo error rate | 1.6% / 0.0% | same |
| 26 | Indirect-injection success: native / Guardrails AI / NeMo | 28.9% / 31.0% / 10.5% | same |
| 27 | Direct-injection success: native / both libs | 1.8% / 0.0% | same |
| 28 | Guardrail latency: Guardrails AI | 0.357 s / 0.348 s | [No Free Lunch](https://arxiv.org/html/2504.00441v2) (Apr 2025, paper, vendor authors) |
| 29 | Guardrail latency: NeMo (gpt-4o-mini core) | 1.019 s / 0.690 s | same |
| 30 | Guardrail latency: Azure / OpenAI Moderation / Bedrock / Enkrypt | 0.068–0.070 / 0.259–0.283 / 0.197–0.203 / 0.048–0.053 s | same |
| 31 | Guardrails AI weighted F1 range | 0.60–0.92 | same |
| 32 | NeMo weighted F1 range | 0.64–0.99 | same |
| 33 | Guardrails AI `num_reasks` default | 1 | [API ref](https://www.guardrailsai.com/docs/api_reference_markdown/guards) (undated, docs) |
| 34 | PydanticAI output retry budget default | 1 | [PydanticAI](https://pydantic.dev/docs/ai/core-concepts/output/) (undated, docs) |
| 35 | Instructor `max_retries=N` | N+1 calls max | [Instructor](https://python.useinstructor.com/concepts/retrying/) (undated, docs) |
| 36 | DeBERTa 200M injection classifier | 89.01% acc, 54.1 ms median | [letsdatascience](https://letsdatascience.com/news/red-hat-benchmark-finds-lightweight-guardrails-can-rival-lar-1bb3c815) (secondary) |
| 37 | NVIDIA guardrail NIMs latency | "about half a second" | [getcoai](https://getcoai.com/news/nvidias-nemo-guardrails-aim-to-make-ai-agents-safe-and-secure) (secondary, unverified) |
| 38 | Rebuff archived | 16 May 2025 | [GitHub](https://github.com/protectai/rebuff) |
| 39 | LLM Guard output scanners | 21 | [GitHub](https://github.com/protectai/llm-guard) |
| 40 | Intrinsic self-correction GPT-4 GSM8K | 95.5 → 91.5 → 89.0 | [Huang et al.](https://arxiv.org/html/2310.01798) (ICLR 2024, paper) |
| 41 | Intrinsic self-correction GPT-3.5 CommonSenseQA | 75.8 → 38.1 → 41.8 | same |
| 42 | Intrinsic GPT-4 HotpotQA | 49.0 → 49.0 → 43.0 | same |
| 43 | Oracle-feedback GPT-4 HotpotQA / GSM8K / CSQA | 59.0 / 97.5 / 85.5 | same |
| 44 | Self-correction blind spot (14 models) | 64.5% | [Self-Correction Bench](https://arxiv.org/abs/2507.02778) (Jul 2025, COLM 2026) |
| 45 | "Wait" reduces blind spot | −89.3% | same |
| 46 | Llama-3.1-8B accuracy drop under self-correction | −20.4%; 58.8% correct answers overturned | [ACL 2025](https://aclanthology.org/2025.acl-long.1314.pdf) (snippet) |
| 47 | VeriHarness repair success Qwen2.5-Coder-14B | 14/50 → 36/50 | [arXiv:2607.14167](https://arxiv.org/abs/2607.14167) (Jul 2026, paper) |
| 48 | VeriHarness Llama-3.1-8B | 8/50 → 29/50 | same |
| 49 | Self-Debugging gains | up to +12% (unit tests); +2–3% Spider, +9% hardest | [arXiv:2304.05128](https://arxiv.org/abs/2304.05128) (2023, paper) |
| 50 | Reflexion HumanEval pass@1 | 91.0% vs 80.1% (GPT-4); Rust 68.0% vs 60.0% | [Reflexion](https://arxiv.org/html/2303.11366) (2023, paper) |
| 51 | Reflexion AlfWorld | 130/134 after 12 trials; +22% abs | same |
| 52 | Reflexion HotpotQA ReAct+GPT-4 | 0.39 → 0.51; +20% overall | same |
| 53 | Reflexion WebShop | stopped after 4 trials, no improvement | same |
| 54 | Vision agents cumulative success by attempt | ≈62% → ≈70% → ≈79% (attempt 5) | [arXiv:2601.11637](https://arxiv.org/pdf/2601.11637) (Jan 2026, snippet) |
| 55 | Re-prompt rounds beyond 2 | no significant gain | [arXiv:2512.04568](https://arxiv.org/pdf/2512.04568) (Dec 2025, snippet) |
| 56 | Retry confusion rate (Sonnet, IaC repair) | 3/50 (6%) | [arXiv:2609.28488](https://arxiv.org/pdf/2609.28488) (Sep 2026, snippet) |
| 57 | CoVe Wikidata precision | 0.17 → 0.36 | [CoVe](https://arxiv.org/html/2309.11495) (Sep 2023, paper) |
| 58 | CoVe Wiki-Category precision | 0.12 → 0.22 | same |
| 59 | CoVe MultiSpanQA F1 | 0.39 → 0.48 | same |
| 60 | CoVe FactScore | 55.9 → 71.4; facts/answer 16.6 → 12.3 | same |
| 61 | Deep-research link validity (frontier) | 94–100% | [arXiv:2605.06635v1](https://arxiv.org/html/2605.06635v1) (May 2026, paper) |
| 62 | Deep-research fact-check accuracy | 24.4% – 76.8% (abstract: 39–77% frontier) | same |
| 63 | Fact-check vs tool-call depth, GPT-5.4 / Claude Opus 4.6 | 78.6 → 16.7% / 80.0 → 57.9% | same |
| 64 | Medical: responses not fully supported (5 LLMs) | 50–90% | [Wu et al.](https://arxiv.org/abs/2402.02008) (Feb 2024, paper) |
| 65 | GPT-4+RAG unsupported statements | ~30%; nearly half of responses not fully supported | same |
| 66 | GPT-4 verifier agreement with MDs | 88% | same |
| 67 | GPT-4o+RAG URL validity / statement / response support | 100% / 75.7% / 38.4% | [Nature Comms](https://www.nature.com/articles/s41467-025-58551-6) (2025; from search snippet) |
| 68 | GhostCite hallucinated citations range | 14.23% – 94.93% (13 LLMs, 375,440 citations) | [arXiv:2602.06718v1](https://arxiv.org/html/2602.06718v1) (snippet) |
| 69 | CiteGuard accuracy on CiteME | up to 68.1% vs 69.2% human | [arXiv:2510.17853v4](https://arxiv.org/html/2510.17853v4) (snippet) |
| 70 | HHEM (+non-fabrication) accuracy / TPR | 82.2% / 78.9%; 8 h → 10 min | [arXiv:2512.22416](https://arxiv.org/abs/2512.22416v1) (Dec 2025, snippet) |
| 71 | Anthropic structured outputs: numeric/length constraints | unsupported (400) | [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (current) |
| 72 | Anthropic grammar cache | 24 h from last use | same |
| 73 | Anthropic strict-schema limits | 20 tools / 24 optional / 16 union params / 180 s compile | same |
| 74 | OpenAI schema limits | 5,000 props, depth 10, 1,000 enum values, 120k chars | [OpenAI docs](https://developers.openai.com/api/docs/guides/structured-outputs) (current) |
| 75 | Citations + structured outputs | incompatible (400) | [Anthropic citations](https://platform.claude.com/docs/en/build-with-claude/citations) (current) |
| 76 | Practitioner retry threshold | if >15% of requests retry, fix prompt/schema | [TianPan](https://tianpan.co/blog/2026-04-09-structured-output-failures-production-llm) (Apr 2026, blog) |
| 77 | Stacked-guard FPR illustration | 5 guards × 90% ≈ 41% system FPR | [premai](https://www.premai.io/blog/production-llm-guardrails-nemo-guardrails-ai-llama-guard-compared/) (vendor-adjacent arithmetic) |
