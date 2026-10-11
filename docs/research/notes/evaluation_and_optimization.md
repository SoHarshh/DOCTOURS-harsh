# Evaluation methodology and automatic prompt optimization for the patient-coordinator SMS bot

Scope: eval approaches (deterministic behavioral tests, LLM-as-judge, reliability across repeated runs, deriving cases from policy documents and from the prompt's BAD/GOOD pairs) and automatic prompt optimization against a metric (DSPy, MIPROv2, GEPA, simple hill-climbing). Problem context assumed throughout: ~65-message suite, mostly deterministic checks (required facts, escalation flag, URL on last line, no markdown, no invented prices/URLs), one developer, ~10 hours, TypeScript, hosted Haiku-class API, no fine-tuning.

Conventions: every numbered claim carries an inline source link; "(secondary)" marks a number I could only confirm via a summary rather than the primary paper. Effort estimates (hours) are my own inferences, not sourced.

---

## KQ1. LLM-as-judge (MT-Bench, G-Eval, Prometheus): biases, fixes, human agreement

### Takeaway
Strong judges reach ~85% agreement with human experts on pairwise chatbot comparisons (about the human-human level), but weaker Haiku/GPT-3.5-class judges show severe position and verbosity bias (consistency 24–46% under answer-order swap; >90% fooled by padded answers). The standard fixes are: binary pass/fail (not Likert), one narrow criterion per judge, swap-and-require-agreement for pairwise, reference-grounded judging where a reference exists, a stronger model than the system under test, and validating the judge against 30–50 human Pass and 30–50 Fail labels before trusting it.

### Cited Findings

#### Method card: Pairwise/single-answer LLM judge (MT-Bench lineage)
- Name/description: Prompt a strong LLM to grade a response (single-answer 1–10) or pick the better of two (pairwise), optionally with a reference answer.
- Sources: Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", arXiv 2306.05685, submitted 9 Jun 2023, v4 24 Dec 2023, NeurIPS 2023 paper — [arXiv](https://arxiv.org/abs/2306.05685), [HTML full text](https://arxiv.org/html/2306.05685).
- Claims: GPT-4 as pairwise judge agrees with human experts 85% of the time on MT-bench when ties are excluded, versus 81% human-human agreement; with ties included agreement is 66% — [MT-Bench HTML](https://arxiv.org/html/2306.05685). On Chatbot Arena the numbers are 64% (with ties) / 87% (without) for GPT-4 pairwise and 53% / 84% for Claude — [MT-Bench HTML](https://arxiv.org/html/2306.05685). When humans disagreed with GPT-4 they still judged GPT-4's verdict "reasonable" in 75% of cases and changed their own choice 34% of the time — [MT-Bench HTML](https://arxiv.org/html/2306.05685).
- Reported biases (numbers): Position bias — when the two answers are swapped, consistency was 65.0% for GPT-4, 46.2% for GPT-3.5 and 23.8% for Claude-v1 (default prompt); Claude-v1 picked the first answer 75.0% of the time — [MT-Bench HTML](https://arxiv.org/html/2306.05685). Verbosity attack (padding an answer with a repetitive list) fooled Claude-v1 and GPT-3.5 91.3% of the time, GPT-4 8.7% — [MT-Bench HTML](https://arxiv.org/html/2306.05685). Self-enhancement: GPT-4 favored its own outputs with a ~10% higher win rate and Claude-v1 ~25%, but the authors state the data cannot determine whether self-enhancement bias truly exists — [MT-Bench HTML](https://arxiv.org/html/2306.05685). Limited reasoning: on 10 math questions the default judge failed 70% (14/20) of judgments; chain-of-thought judging cut this to 30%; reference-guided judging to 15% — [MT-Bench HTML](https://arxiv.org/html/2306.05685).
- Fixes with numbers: (1) Swap positions and call the judge twice; declare a win only if both orders agree, otherwise tie — [MT-Bench HTML](https://arxiv.org/html/2306.05685). (2) Few-shot judge raised GPT-4 consistency from 65.0% to 77.5% but made calls ~4x more expensive and did not improve human agreement — [MT-Bench HTML](https://arxiv.org/html/2306.05685). (3) Reference-guided judging (70% -> 15% failure on math) — [MT-Bench HTML](https://arxiv.org/html/2306.05685). (4) Fine-tuned Vicuna-13B judge reached 85.5% agreement excluding ties (GPT-4: 87%) — [MT-Bench HTML](https://arxiv.org/html/2306.05685) (not applicable to us: no fine-tuning).
- Effort in our setup: ~1.5 h to add a pairwise "tone" judge in TypeScript (one Sonnet-class call per pair, both orders, agree-or-tie), plus ~1.5 h to label 60–100 replies for validation.
- Risks: a Haiku-class judge will have the ~25–46% consistency and >90% verbosity-attack failure profile above; judge verdicts are non-deterministic, so they add noise to a 65-case suite.
- Verdict: try if time, as a non-gating diagnostic only — the deterministic checks already cover the flagged failure types that matter most, and an unvalidated judge "creates false confidence" (see KQ4).

#### Method card: G-Eval (criteria -> auto-generated evaluation steps -> score with token-probability weighting)
- Sources: Liu et al., "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment", arXiv 2303.16634, Mar 2023, EMNLP 2023 — [ACL Anthology](https://aclanthology.org/2023.emnlp-main.153), [arXiv](https://arxiv.org/abs/2303.16634v3); DeepEval's implementation docs (accessed Oct 2026) — [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals).
- Claims: With GPT-4 as backbone G-Eval reached Spearman 0.514 with humans on SummEval summarization, ahead of prior automatic metrics — [ACL Anthology](https://aclanthology.org/2023.emnlp-main.153). The paper flags a "potential issue of LLM-based evaluators having a bias towards the LLM-generated texts" — [ACL Anthology](https://aclanthology.org/2023.emnlp-main.153). Scores were averaged over 20 samples per item (secondary, via Eugene Yan) — [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/). DeepEval's G-Eval auto-generates `evaluation_steps` from a short `criteria`, asks for a 1–5 score weighted by output-token probabilities, has a default pass threshold of 0.5, a `strict_mode` that forces binary 0/1, an optional `rubric`, is documented as "NOT deterministic", and has a TypeScript version with the same `new GEval({...})` API — [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals).
- Reported numbers for tone specifically: none reported.
- Effort: ~1 h via DeepEval TS or promptfoo's `g-eval` assertion.
- Risks: Likert output and probability weighting need logprobs (not available on the Claude API per DeepEval's note on custom models falling back to raw integer scores) — [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals); correlation 0.5 on summarization is "moderate" at best.
- Verdict: skip — binary pairwise or binary pass/fail judges are simpler and better supported by practitioner guidance (KQ4).

#### Method card: Prometheus / Prometheus 2 (open-weight fine-tuned evaluator LMs)
- Sources: Kim et al., "Prometheus", arXiv 2310.08491, Oct 2023, ICLR 2024 — [arXiv](https://arxiv.org/abs/2310.08491v2); Kim et al., "Prometheus 2", arXiv 2405.01535, May 2024, EMNLP 2024 — [arXiv](https://arxiv.org/abs/2405.01535v2).
- Claims and numbers: Prometheus-13B reached Pearson 0.897 with human evaluators on 45 hand-crafted rubrics, on par with GPT-4-0613 (0.882) and far above ChatGPT (0.392) — [Prometheus arXiv](https://arxiv.org/abs/2310.08491v2). On FLASK, human-vs-GPT-4 correlation is 0.679; Prometheus-2-8x7B reached 0.555 with humans vs 0.449 for Prometheus-13B — [Prometheus 2 arXiv](https://arxiv.org/abs/2405.01535v2). Prometheus 2, GPT-4-1106, Claude-3-Opus and humans all correlate with each other above 0.5 — [Prometheus 2 arXiv](https://arxiv.org/abs/2405.01535v2).
- Effort: n/a (requires self-hosting a 7B/8x7B model).
- Verdict: skip — needs model hosting; a hosted Sonnet-class judge is the equivalent for us.

#### Supporting findings on bias (beyond MT-Bench)
- "Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge" (Ye et al., arXiv 2410.02736, Oct 2024, ICLR 2025) defines 12 biases (position, verbosity, compassion-fade, bandwagon, distraction, fallacy-oversight, authority, sentiment, diversity, chain-of-thought, self-enhancement, refinement-aware) and a Robustness Rate (RR = fraction of verdicts unchanged after a bias perturbation). Claude-3.5 RR: position 0.832, verbosity 0.952, bandwagon 0.627, authority 0.856; GPT-4o: 0.776 / 0.977 / 0.800 / 0.800; ChatGPT: 0.566 / 0.900 / 0.699 / 0.628. Bias effects were "more pronounced in the alignment dataset compared to the fact-related dataset" (i.e., worse on subjective judgments) — [arXiv HTML](https://arxiv.org/html/2410.02736v1).
- "Judging the Judges" (Thakur et al. 2024, secondary via Eugene Yan): GPT-4 Cohen's kappa 0.84 and llama-3-70b 0.79 versus human-human 0.97; llama-3-8b showed 80% raw agreement but kappa only 0.62, illustrating why kappa beats raw agreement — [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/).
- Blind spots (Doddapaneni et al., secondary via Eugene Yan): GPT-4-turbo failed to lower scores for perturbed answers more than 50% of the time on long-form coherence/factuality/instruction-following — [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/).
- Pairwise vs direct scoring: pairwise is "typically used, and more reliable, for subjective evals such as persuasiveness, tone, and coherence" and gives "more stable results and smaller differences between LLM judgments and human annotations"; direct scoring is for objective criteria (faithfulness, policy violations) — [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/).
- Anthropic's agent-eval guidance (9 Jan 2026): "Vague rubrics produce inconsistent judgments"; grade each dimension with its own isolated LLM judge; give the judge an "Unknown" option to reduce hallucinated verdicts; choose "deterministic graders where possible" — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).
- Judge validation practice (Hamel Husain, "Creating a LLM-as-a-Judge That Drives Business Results", 29 Oct 2024): binary pass/fail with written critiques; ~100 labeled examples per failure mode, below 60 "confidence intervals are often too wide"; split 10–20% train (few-shot), 40–45% dev, 40–45% test with 30–50 examples of each label; report TPR and TNR separately because a judge that always says Pass shows 95% agreement when 5% of cases fail; the Honeycomb example reached >90% judge-expert agreement in three iterations — [hamel.dev](https://hamel.dev/blog/posts/llm-judge/). The companion `evals-skills` "validate-evaluator" skill sets the bar at TPR and TNR > 90% on the dev set and recommends the Rogan-Gladen correction for aggregate pass rates (secondary mirror) — [skills.sh mirror](https://skills.sh/hamelsmu/evals-skills/validate-evaluator).

### Inferences
- For a Haiku-class bot, run any judge on a stronger model (Sonnet-class): MT-Bench's weak-judge profile (24–46% swap consistency, 91% verbosity failure) is close to what a Haiku-class judge would show, and the Nubank data below show mini models collapsing to a single class (kappa 0.000) under a weak judge prompt.
- The tone judge should be pairwise (old-prompt reply vs new-system reply for the same message), binary, both orders, "tie" if the orders disagree, with the ~60 GOOD examples as the rubric anchor. That addresses position bias, verbosity bias (add a hard length cap as a deterministic check too), and the subjective-task weakness.
- "Label deference" (a judge agreeing with a provided label or reference even when it is wrong): no paper in my results quantifies this under that name; the closest evidence is the authority-bias RR (0.63–0.86) and MT-Bench's reference-guided result. Mitigation by construction: never show the judge the expected label; show it tool results only.

### Gaps
- No source reports judge-human agreement rates for "tone" of SMS customer-support replies specifically; the closest is a 2026 vendor write-up (Koji) reporting 0.74 agreement on binary criteria and 0.41 on a 1–5 usefulness scale, not verified and not support-specific — [koji.so](https://www.koji.so/docs/llm-as-a-judge-vs-human-evaluation).
- No quantified "label deference" bias found.

---

## KQ2. Deterministic behavioral tests, tooling, golden sets from flagged replies, deriving cases from policy documents

### Takeaway
The CheckList lineage (MFT/INV/DIR tests) plus modern assertion runners (promptfoo, Braintrust, DeepEval, Inspect) covers exactly the checks the team listed; every practitioner source (Hamel/Shreya, Anthropic, Nubank) says to prefer deterministic assertions, build the CI set from real production failures (20–50 to start, growing to 100+), and keep the judge for the residual subjective slice. Policy-derived cases follow the tau-bench recipe: one policy document, a hidden user scenario, and exactly one valid outcome under the policy.

### Cited Findings

#### Method card: CheckList-style behavioral test matrix (MFT / INV / DIR)
- Sources: Ribeiro, Wu, Guestrin, Singh, "Beyond Accuracy: Behavioral Testing of NLP Models with CheckList", arXiv 2005.04118, May 2020, ACL 2020 best paper — [arXiv PDF](https://arxiv.org/pdf/2005.04118), [UW IDL page](https://idl.uw.edu/papers/check-list).
- Claims: Three test types — Minimum Functionality Tests (small labeled sets for one behavior), Invariance tests (label-preserving perturbations such as typos or swapped names must not change the output) and Directional Expectation tests (a change must move the output in a known direction); INV and DIR need no ground-truth labels — [arXiv PDF](https://arxiv.org/pdf/2005.04118).
- Reported numbers: in a user study, practitioners using CheckList "created twice as many tests and found almost three times as many bugs" as those without it — [UW IDL page](https://idl.uw.edu/papers/check-list).
- Effort in our setup: ~2 h. MFT = the 65 cases; INV = re-send each message with typos, lowercase, different patient name, different clinic/package; DIR = adding "I can't afford this" or "I'm in pain" must flip the escalation flag or add a required fact.
- Risks: INV perturbations multiply run count (keep to 1–2 perturbations per case).
- Verdict: try first — it directly generates the invariance cases the team lacks (same fact set across phrasing variants) at near-zero cost.

#### Method card: Golden regression set from flagged replies (BAD/GOOD pairs -> cases + assertions)
- Sources: Hamel Husain & Shreya Shankar, "AI Evals FAQ" (published 18 Sep 2026, modified 21 Sep 2026) — [hamel.dev](https://hamel.dev/blog/posts/evals-faq/); Hamel Husain, "Your AI Product Needs Evals" (29 Mar 2024) — [hamel.dev](https://hamel.dev/blog/posts/evals/); Anthropic, "Demystifying evals for AI agents" (9 Jan 2026) — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents); Shankar et al., "SPADE: Synthesizing Data Quality Assertions for LLM Pipelines", arXiv 2401.03038, Jan 2024 — [arXiv](https://arxiv.org/abs/2401.03038).
- Claims: "CI evals protect against known regressions before deployment"; CI datasets are "small (in many cases 100+ examples) and purpose-built"; "Favor assertions or other deterministic checks over LLM-as-judge evaluators"; new production failure patterns should be added to the CI dataset — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/). Anthropic: start with "roughly 20–50 simple tasks drawn from real failures" rather than waiting for hundreds; every task should have a reference solution that passes all graders, proving the task is solvable and graders are wired correctly — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents). Hamel 2024: break the product into features and scenarios and write assertions per scenario (e.g., exactly 1 / >1 / 0 results), add generic cross-feature assertions (a regex that no UUIDs appear), run Level-1 assertion tests "on every code change"; Rechat accumulated "hundreds of these unit tests" — [hamel.dev 2024](https://hamel.dev/blog/posts/evals/). SPADE mines the prompt's revision history (instructions developers added to fix problems) to synthesize assertion functions, cutting assertion count by 14% and false failures by 21% versus baselines across nine pipelines; deployed to 2,000+ LangSmith pipelines — [SPADE arXiv](https://arxiv.org/abs/2401.03038).
- Reported numbers specific to support bots: Nubank's KDD'26 paper labels came from three operations analysts with majority vote and written rationales; datasets per evaluator were 888 / 90 / 816 / 246 / 90 samples; "only a few hundred high quality binary labels are enough to build an effective eval" — [arXiv HTML](https://arxiv.org/html/2606.08867v2).
- Effort: ~2–3 h to convert the ~60 BAD/GOOD pairs into cases (message + tool fixture + expected facts + escalation flag + the specific assertion the BAD example violated).
- Risks: pairs were written as prompt instructions, so some encode style preferences rather than checkable facts; those become judge criteria, not assertions. The optimizer must never see the held-out half (see KQ5).
- Verdict: try first — it is the SPADE idea done by hand: each BAD/GOOD pair is a prompt delta that already names the failure.

#### Method card: Policy-document-derived cases (tau-bench recipe; MANTRA)
- Sources: Yao et al., "tau-bench", arXiv 2406.12045, 17 Jun 2024 — [arXiv HTML](https://arxiv.org/html/2406.12045); Anand et al., "MANTRA: Synthesizing SMT-Validated Compliance Benchmarks for Tool-Using LLM Agents", arXiv 2605.06334, 7 May 2026 — [arXiv](https://arxiv.org/abs/2605.06334).
- Claims: Each tau-bench domain has "a policy document containing rules it must adhere to"; each task is a hidden user instruction plus a ground-truth annotation, written so the instruction "guarantees only one possible outcome under the domain policy"; annotations are built by copying and editing agent actions and refined through agent runs; tau-retail has 115 tasks, tau-airline 50 — [tau-bench HTML](https://arxiv.org/html/2406.12045). Removing the policy from the prompt dropped gpt-4o from 61.2 to 56.8 (retail) and 33.2 to 10.8 (airline) — [tau-bench HTML](https://arxiv.org/html/2406.12045). Of 36 gpt-4o retail agent failures, 25% were incorrect decision-making / rule violation and 19% partial resolution of compound requests — [tau-bench HTML](https://arxiv.org/html/2406.12045). MANTRA takes procedural manuals plus tool schemas, builds a symbolic world model and trace-level compliance checks, verifies them with SMT solving, and produced 285 tasks across 6 domains from manuals up to 50+ pages — [MANTRA arXiv](https://arxiv.org/abs/2605.06334).
- Effort: ~2 h to walk the clinic policy (deposit rules, escalation triggers, package definitions) and write one case per rule with the single valid outcome; ~0 h to adopt MANTRA (research code, SMT tooling — out of scope).
- Risks: policy rules with ambiguous outcomes produce untestable cases; tau-bench's authors needed iterative agent runs to debug annotations.
- Verdict: try if time — one case per policy rule is the cheapest way to cover rules the 65 messages never exercise.

#### Method card: Assertion runner tooling
- promptfoo (TypeScript, CLI + Node API; docs accessed Oct 2026): deterministic assertion types include `equals, contains, icontains, regex, starts-with, contains-any/all, is-json, contains-json, javascript, python, webhook, latency, cost, levenshtein, is-valid-function-call, trajectory:tool-used, trajectory:tool-args-match` and all can be negated with `not-`; model-graded types include `llm-rubric, g-eval, factuality, model-graded-closedqa, select-best`; per-assertion `weight`, per-test `threshold`, `assert-set` groups with their own threshold, and `defaultTest` for suite-wide assertions — [promptfoo assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/). `--repeat <n>` runs each test n times (`--filter-range 0:5 --repeat 3` runs 15 evaluations); `--filter-failing` reruns previous failures; `-j` sets concurrency — [promptfoo CLI](https://www.promptfoo.dev/docs/usage/command-line/).
- Braintrust (TypeScript `Eval()`): `trialCount` runs "each input multiple times to measure variance and get more robust scores", groups results by identical input, can be set per row (examples use 10 globally, 5 for a hard input, 1 for a stable one); "hill climbing" uses a previous experiment's `output` as the `expected` for the current run with comparative scorers (`Battle`, `Summary`), where >50% means the new run beats the base — [Braintrust advanced evals](https://braintrust.dev/docs/evaluate/advanced-evaluations). Custom scorers receive `{ output, expected, input, metadata }` and return a score; autoevals scorers are "deterministic (where possible)" — [Braintrust scorers](https://braintrust.dev/docs/core/functions/scorers).
- DeepEval: G-Eval and `DAGMetric` (deterministic decision-tree metric) with a TypeScript SDK — [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals).
- Inspect AI (UK AISI, Python): `epochs=N` or `Epochs(N, reducer)`; built-in reducers `mean` (default), `median`, `mode`, `majority`, `max`, `pass_at_{k}`, `pass_k_{k}` ("probability that all k epoch attempts succeed"), `at_least_{k}`, `collect`; `stderr()` metric with `cluster=` for clustered standard errors — [Inspect metrics](https://inspect.aisi.org.uk/metrics.html).
- Effort: promptfoo ~1 h to wire (YAML + a `javascript` assertion that checks every price/URL against the tool fixture); hand-rolled TS harness ~2 h; Braintrust ~1.5 h (hosted); Inspect not TS.
- Verdict: promptfoo or a ~200-line TS harness: try first. Braintrust: try if time (its `trialCount` and hill-climbing are convenient, but the team's checks are custom code anyway). Inspect/DeepEval: skip (Python-first; nothing we need that promptfoo lacks).

### Inferences
- The "no invented price/URL" check should be implemented as a closed-world extractor: regex every currency amount and URL in the reply and require set-membership in the tool-fixture values; that is a `javascript` assertion in promptfoo or a scorer in Braintrust, and it is the single most valuable deterministic check because it is the one a judge is worst at (factuality blind spots >50%, KQ1).
- Build the fixture-based harness so that each case pins the 14 tool results (recorded JSON); otherwise run-to-run variance in tool outputs confounds the prompt comparison.

### Gaps
- No published study reports how often policy-derived synthetic cases catch real production violations (MANTRA and tau-bench report agent pass rates, not catch rates).
- promptfoo Node API usage (`evaluate()` from TypeScript) is referenced in the docs index but I did not fetch that page.

---

## KQ3. Reliability: pass^k, how many repetitions, confidence intervals for 50–100-case suites

### Takeaway
pass^k (tau-bench) is the standard "consistency" metric and is built into Inspect (`pass_k_{k}`) and recommended by Anthropic "for agents where consistency is essential"; practitioners run 3–10 trials per case (tau-bench >=3, Nubank 5 repeats, MIPRO paper 5 runs, Braintrust examples 10). For a 65-case suite the Bernoulli standard error at 80% pass is ~5 points per run, so a single run cannot distinguish differences under ~10–14 points; paired per-case differences and 3–5 repetitions each cut that materially, and Miller's formulas tell you exactly how much.

### Cited Findings

#### Method card: pass^k over repeated trials
- Sources: tau-bench, arXiv 2406.12045, 17 Jun 2024 — [arXiv HTML](https://arxiv.org/html/2406.12045); Anthropic, "Demystifying evals for AI agents", 9 Jan 2026 — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents); Inspect reducers — [Inspect metrics](https://inspect.aisi.org.uk/metrics.html).
- Claims: pass^k = E_task[ C(c,k) / C(n,k) ] with n trials and c successes (pass@k = 1 − E_task[ C(n−c,k)/C(n,k) ]); proposed "for real-world agent tasks requiring reliability and consistency like customer service"; main results used "at least 3 trials per task" — [tau-bench HTML](https://arxiv.org/html/2406.12045). gpt-4o pass^1 = 61.2 (retail) / 35.2 (airline); pass^8 < 25% in retail — [tau-bench HTML](https://arxiv.org/html/2406.12045), [tau-bench abstract](https://arxiv.org/abs/2406.12045). Other pass^1 (retail/airline): gpt-4-turbo 57.7/32.4, claude-3-opus 44.2/34.7, claude-3-sonnet 26.3/27.6, claude-3-haiku 19.0/14.4 — [tau-bench HTML](https://arxiv.org/html/2406.12045). Anthropic: "pass@k for tools where one success matters, pass^k for agents where consistency is essential"; a 75% per-trial success rate gives pass^3 of about 42%; "we run multiple trials to produce more consistent results" (no count given); early in development large effects mean small samples suffice — [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).
- Effort: ~0.5 h (a loop and a reducer).
- Verdict: try first.

#### Method card: Standard errors, paired differences, resampling, power (Miller 2024)
- Sources: Evan Miller, "Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations", arXiv 2411.00640, 1 Nov 2024 — [arXiv HTML](https://arxiv.org/html/2411.00640v1); Anthropic research summary, 19 Nov 2024 — [anthropic.com](https://www.anthropic.com/research/statistical-approach-to-model-evals); `errorbars` PyPI package implementing it — [PyPI](https://pypi.org/project/errorbars/).
- Claims: Report SE = sqrt(s̄(1−s̄)/n) for binary scores and a 95% CI of ±1.96·SE; bootstrapping is unnecessary when the CLT applies — [Miller HTML](https://arxiv.org/html/2411.00640v1). Example: HumanEval with 164 questions at 83.6% has SE 3.2 points — [Miller HTML](https://arxiv.org/html/2411.00640v1). Comparing two systems on the same questions: use the paired SE, SE_{A−B} = sqrt(SE_A² + SE_B² − 2·SE_A·SE_B·Corr); with correlation 0.5 pairing cuts the estimator variance by one third; "we therefore recommend using the paired version of the standard error estimate wherever practicable" — [Miller HTML](https://arxiv.org/html/2411.00640v1). Resampling each question K times reduces only the within-question variance term: in the uniform-difficulty example K=2 cuts variance by 1/3, K=4 by 1/2, K=6 by 5/9, with an upper limit of 2/3; do not pool K×N answers as independent — [Miller HTML](https://arxiv.org/html/2411.00640v1). "In neither case should the sampling temperature be adjusted for the sake of reducing variance in the scores" — [Miller HTML](https://arxiv.org/html/2411.00640v1). Power: n = (z_{α/2}+z_β)²·(ω² + σ_A²/K_A + σ_B²/K_B)/δ²; detecting a 3-point difference at 80% power needs ~969 questions; with n=198 raising K from 1 to 10 cut the minimum detectable effect from 13.2 to 7.5 points — [Miller HTML](https://arxiv.org/html/2411.00640v1). Clustered SEs can be over 3x the naive SE when questions share a source (DROP: 1.34 vs 0.44) — [Miller HTML](https://arxiv.org/html/2411.00640v1).
- Effort: ~0.5 h (three formulas in TS).
- Verdict: try first.

#### How practitioners report repetitions
- Nubank (KDD'26): "Each experiment was repeated five times, and results are reported as mean with 95% CI" — [arXiv HTML](https://arxiv.org/html/2606.08867v2).
- MIPRO paper: test results "averaged over 5 runs", five runs per method per task — [arXiv HTML](https://arxiv.org/html/2406.11695v2).
- GEPA paper: AIME-2025 test set "with each question repeated 5 times" — [arXiv HTML](https://arxiv.org/html/2507.19457v2).
- Braintrust `trialCount` examples: 10 globally, 5 for a hard input, 1 for a stable input — [Braintrust](https://braintrust.dev/docs/evaluate/advanced-evaluations). promptfoo `--repeat` — [promptfoo CLI](https://www.promptfoo.dev/docs/usage/command-line/). LangSmith `num_repetitions` — [LangSmith docs](https://docs.langchain.com/langsmith/repetition).
- Hamel/Shreya FAQ: "track confidence intervals for production metrics"; if the lower bound crosses your threshold, investigate — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).

### Inferences (my arithmetic using Miller's formulas; assumptions stated)
- Single run, 65 cases: at 80% pass, SE = sqrt(0.8·0.2/65) ≈ 5.0 points (95% CI ±9.7); at 90% pass, SE ≈ 3.7 (±7.3).
- Two systems, one run each, unpaired: SE of the difference ≈ 7 points at 80% pass, so only differences of ~14+ points are 2-SE significant. Paired by case with per-case correlation ~0.5: SE_diff ≈ 5 points, so ~10 points becomes detectable.
- Repetitions: using Miller's uniform-difficulty example, K=3 cuts total variance by roughly 44% and K=5 by ~53% (formula (1+2/K)/3), i.e., SE_diff falls from ~5 to ~3.5–3.7 points paired. Beyond K≈5 the returns flatten (limit 2/3 variance reduction). Hence: 3 reps minimum, 5 if budget allows; 65 cases × 3 reps × 2 conditions = 390 bot calls, trivial at Haiku speeds.
- Report per condition: pass rate ± SE, pass^3 (fraction of cases passing all 3 reps), and the paired per-case difference ± paired SE; a standard paired binary test (McNemar on case-level pass/fail) is the natural significance test (my suggestion, not sourced).
- Adding the ~60 BAD/GOOD cases to reach ~125 cases shrinks SE by ~1/sqrt(2) (≈3.6 points at 80%), which matters more than adding reps beyond 3.
- Expect the 65 cases to cluster (same package, same tool fixture): report the clustered SE with cluster = scenario/package, per Miller's >3x warning.

### Gaps
- No source states a canonical "N reps" for support-bot suites; the 3–10 range above is practice, not theory.
- No source quantifies the per-case variance of Haiku-class models at default temperature on tool-using SMS tasks; the K-rep benefit depends on it (if the bot is near-deterministic for a fixture, reps add little).

---

## KQ4. Hamel Husain, Shreya Shankar, Eugene Yan: concrete recommendations

### Takeaway
All three converge: do error analysis on ~100 real traces first (open coding -> axial coding into a failure taxonomy), use binary pass/fail with critiques rather than scores, let one domain expert be the "benevolent dictator", prefer code assertions and reserve the judge for subjective residue, validate the judge with TPR/TNR on a held-out labeled set, and treat generic off-the-shelf metrics as exploration signals only. Their explicit stance on automated prompt tuning: inspect disagreements manually first; tuning "can sometimes require hundreds or thousands of evaluations".

### Cited Findings
- Error analysis is "the most important activity in evals"; review "at least 100 traces", annotating the first 30 yourself; open coding then axial coding (grouping notes into a failure taxonomy — "the most important step"); iterate to "theoretical saturation"; re-run with ~100 fresh traces per review cycle — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- "Binary evaluations force clearer thinking and more consistent labeling"; to track gradual progress use separate binary sub-checks instead of a scale — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- "appointing a single domain expert as a 'benevolent dictator' is the most effective approach"; with multiple annotators measure Cohen's kappa and resolve disagreements by rubric revision — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Judge validation: label "100 to 200 examples for each failure mode"; split 10–20% train / 40–45% dev / 40–45% test; "30 to 50 Pass examples and 30 to 50 Fail examples in both the dev and test sets"; track TPR and TNR, choosing targets by the cost of missed failures vs false alarms — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Generic metrics: "No. Generic evaluations waste time and create false confidence when you use them as quality measures"; BERTScore/ROUGE "are not useful for evaluating LLM outputs in most AI applications" — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Synthetic test inputs: define dimensions, hand-write ~20 tuples, generate more tuples, then convert each tuple to a natural-language query in a separate step; synthetic data "cannot tell you how common a failure is in production" — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Agents: evaluate end-to-end task success first, then step-level diagnostics; test tool name, arguments, result and resulting state as separate checks; reproduce failures with the simplest failing case; use multi-turn tests only when the failure depends on context; "N-1 testing" (real conversation prefixes) "often works better but is less flexible" than simulated users — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Automated tuning: "Inspect a few disagreements manually before trying automated prompt tuning"; tuning "can sometimes require hundreds or thousands of evaluations" — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Retire evals that always pass ("giving you no new information"); cheap checks on every change, expensive judges nightly or per release — [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
- Hamel 2024 three levels: Level 1 unit tests/assertions ("I often run Level 1 evals on every code change"), Level 2 human and model eval over logged traces, Level 3 A/B tests; validate a model judge by tracking agreement with human labels and re-checking periodically; use raw agreement only when classes are balanced (~50% failures), otherwise precision/recall — [hamel.dev 2024](https://hamel.dev/blog/posts/evals/).
- Hamel's Critique Shadowing (7 steps): find the principal domain expert; build a diverse dataset; expert gives pass/fail with critiques; fix obvious errors; build the judge iteratively against expert labels; error-analyze unseen data; create specialized judges only where needed; start with ~30 examples to discover failure modes and continue until no new modes appear — [hamel.dev judge post](https://hamel.dev/blog/posts/llm-judge/).
- Shreya Shankar et al. (UIST 2024): "it is impossible to completely determine evaluation criteria prior to human judging of LLM outputs" (criteria drift); users who graded 5–10 outputs before writing criteria found it useful and those who skipped it regretted it; EvalGen selects assertion implementations whose results best match human grades, scoring alignment as the harmonic mean of coverage and false-failure rate, with a 20% false-failure threshold in the study; offline, EvalGen chose 4 assertions vs SPADE's 9 on the product pipeline with coverage 0.73 vs 0.49 — [arXiv HTML](https://arxiv.org/html/2404.12272).
- Eugene Yan (Aug 2024): objective criteria -> direct scoring; subjective (tone) -> pairwise; simplify to binary; use recall/precision or Cohen's kappa rather than correlation; during development use an API model with chain-of-thought and n-shot examples for "a few hundred samples"; in production guardrails fine-tune a classifier (not applicable here) — [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/).

### Inferences
- Applied to this project: the ~60 flagged BAD replies are the "100 traces" — open-code them into a taxonomy before writing any judge; most codes will map to the existing deterministic checks, and only the leftover codes (tone, warmth, over-apologizing) justify a judge.
- The FAQ's 30–50 Pass + 30–50 Fail per split for judge validation is more labeled data than a 10-hour budget allows alongside the build; a realistic cut is 30 Pass + 30 Fail total, accepting the FAQ's own warning that CIs below 60 examples are wide — treat the judge as advisory.

### Gaps
- The FAQ page is ~150k characters; sections on nondeterminism/run counts, if present, were not in the fetched portions.

---

## KQ5. DSPy, MIPROv2, GEPA, simple hill-climbing: feasibility in a few hours, metric-call budgets, TypeScript options

### Takeaway
Compute is not the constraint: a DSPy GEPA or MIPROv2 "light" run against a ~30–65-example set is roughly 300–650 metric calls (my computation from the DSPy source formulas; Nubank reports "about 500 iterations" for `auto=light`), i.e., minutes of Haiku calls. The constraints are (a) Python-only tooling for DSPy/GEPA (the TypeScript port Ax has a native-TS GEPA; its MiPRO needs a Python service), (b) overfitting on tiny train sets (Willison: +5 train, −10 held-out with 20/10 examples), and (c) the eval must be trustworthy first ("eval quality dominates optimizer quality"). GEPA beats MIPROv2 by roughly 2x in aggregate gain and is the only one that consumes textual feedback from a checker, which the deterministic suite produces for free.

### Cited Findings

#### Method card: GEPA (Reflective prompt evolution with Pareto selection)
- Sources: Agrawal et al., "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning", arXiv 2507.19457, Jul 2025, v2 (ICLR 2026 oral per summaries) — [arXiv HTML v2](https://arxiv.org/html/2507.19457v2); DSPy GEPA docs — [dspy.ai](https://dspy.ai/current/api/optimizers/GEPA/overview/); DSPy GEPA source — [gepa.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/gepa/gepa.py); standalone library — [gepa-ai/gepa](https://github.com/gepa-ai/gepa).
- Claims: The metric is extended to return a score plus `feedback_text` extracted from traces; the paper argues language "provides a much richer learning medium for LLMs, compared to policy gradients derived from sparse, scalar rewards"; candidates are kept on a per-instance Pareto frontier and sampled by how many instances they lead — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Without feedback DSPy substitutes the string "This trajectory got a score of {score}" — [dspy.ai](https://dspy.ai/current/api/optimizers/GEPA/overview/). Docs: "GEPA benefits from a strong reflection model" (suggests `gpt-5`, temperature 1.0); `reflection_minibatch_size` default 3; "Provide the smallest valset that is just large enough to match the downstream task distribution"; using the trainset as valset makes GEPA "overfit prompts to the provided trainset" — [dspy.ai](https://dspy.ai/current/api/optimizers/GEPA/overview/).
- Reported numbers: GPT-4.1 mini aggregate 53.03 baseline -> 58.67 MIPROv2 -> 65.22 GEPA -> 66.36 GEPA+Merge across HotpotQA/IFBench/HoVer/PUPA/AIME-2025/LiveBench-Math; IFBench (instruction following with 58 unseen output constraints) 47.79 -> 49.15 (MIPROv2) -> 52.72 (GEPA) -> 55.95 (GEPA+Merge); PUPA 78.57 -> 94.47 — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Qwen3-8B aggregate 45.23 -> 47.84 (MIPROv2) -> 48.91 (GRPO) -> 54.85 (GEPA) — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Ablation (Qwen3-8B aggregate gain): SelectBestCandidate +6.05, BeamSearch +5.11, GEPA Pareto +12.44 — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Budgets: GRPO 24,000 rollouts per task; GEPA totals 6,871 / 3,593 / 7,051 / 2,426 / 1,839 / 1,839 (aggregate 3,936); GEPA "matches GRPO's best validation after only 243, 402, 330, 1143, 1179, and 306 rollouts"; MIPROv2 used `auto=heavy` (18 instruction candidates) with 2,270–6,926 rollouts — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Train/val sizes used: 150/300 (HotpotQA, IFBench, HoVer), 111/111 (PUPA), 45/45 (AIME) — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Cost: all Table-2 GPT-4.1-mini experiments "under $500"; GEPA $86, GEPA-Merge $67, MIPROv2 $76 — [GEPA HTML](https://arxiv.org/html/2507.19457v2). GEPA prompts are ~33% shorter than MIPROv2's (most GEPA tokens are instructions, most MIPROv2 tokens are few-shot demos) — [GEPA HTML](https://arxiv.org/html/2507.19457v2). Standalone library: `optimize_anything(seed_candidate, evaluator, objective, config=GEPAConfig(engine=EngineConfig(max_metric_calls=100)))` where the evaluator returns a float and can `oa.log()` diagnostic text ("Actionable Side Information"); headline "GPT-4.1 Mini goes from 46.6% -> 56.6% on AIME 2025" — [gepa-ai/gepa](https://github.com/gepa-ai/gepa). Wall-clock time: none reported.
- Budget arithmetic (from the DSPy source): `AUTO_RUN_SETTINGS = light n=6, medium n=12, heavy n=18`; `num_trials = int(max(2·(num_preds·2)·log2(n), 1.5·n))`; `total = V + 5·n + N·M + (periodic_fulls + extra_final)·V` with V = valset size, M = minibatch 35, full evals every 5 steps — [gepa.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/gepa/gepa.py).
- Effort in our setup: ~3–4 h via Python `gepa.optimize_anything` wrapping the TS harness over HTTP/CLI (the evaluator returns score + the checker's failure strings); ~3 h via Ax `AxGEPA` if the bot is re-expressed as an Ax program (unlikely in 10 h given the routed architecture); plus ~1 h to split train/held-out.
- Risks: small-trainset overfitting (Willison); GEPA may learn to satisfy the checker literally (e.g., always append a URL line) rather than improve judgment; reflection model cost/time per step; Python dependency.
- Verdict: try if time — only after the deterministic suite is debugged against transcripts and a held-out split exists; run `light` (≈500 metric calls) once, compare on held-out with 3 reps.

#### Method card: MIPROv2 (Bayesian search over instruction + demo candidates)
- Sources: Opsahl-Ong et al., "Optimizing Instructions and Demonstrations for Multi-Stage Language Model Programs", arXiv 2406.11695, 17 Jun 2024, v2 6 Oct 2024, EMNLP 2024 — [arXiv HTML](https://arxiv.org/html/2406.11695v2); DSPy MIPROv2 docs — [dspy.ai](https://dspy.ai/current/api/optimizers/MIPROv2/); source — [mipro_optimizer_v2.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/mipro_optimizer_v2.py).
- Claims: Three steps — bootstrap few-shot demos, propose grounded instruction candidates, Bayesian-optimize the combination over `num_trials` on minibatches — [dspy.ai](https://dspy.ai/current/api/optimizers/MIPROv2/). Outperforms baselines on five of seven programs by up to 13% accuracy (Llama-3-8B) — [arXiv](https://arxiv.org/abs/2406.11695). Lessons: "Optimizing bootstrapped demonstrations as few-shot examples is key"; "Instruction optimization is most important for tasks with conditional rules" the LM can't infer from examples; grounding helps on average but varies by task — [arXiv HTML](https://arxiv.org/html/2406.11695v2). Experiments used 500 train / 500 dev, 20–50 full-eval trials, 5 runs per method — [arXiv HTML](https://arxiv.org/html/2406.11695v2).
- Reported numbers (test, 5-run average): ScoNe 56.2 unoptimized -> 79.4 MIPRO; HotPotQA 45.8 (Bootstrap RS) -> 46.4; HoVer 37.2 -> 39.0; 0-shot MIPRO ScoNe 71.5, HotPotQA 36.8 — [arXiv HTML](https://arxiv.org/html/2406.11695v2).
- Budget arithmetic: `light n=6 (val 100), medium n=12 (val 300), heavy n=18 (val 1000)`; `num_trials = int(max(2·M·log2(n), 1.5·n))` with M doubled when demos are used; `minibatch_size` default 35 and minibatching only when valset > 50; estimated task-LM calls = minibatch_size·num_trials + len(valset)·full_eval_steps; prompt-model calls = 10 summarizer + candidates×predictors + program-aware proposer — [mipro_optimizer_v2.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/mipro_optimizer_v2.py).
- Effort: ~3–4 h (Python) — same wrapper as GEPA; in Ax, `AxMiPRO` "requires a Python optimizer service" via `optimizerEndpoint` (secondary, Feb 2026 write-up) — [instagit Ax guide](https://instagit.com/ax-llm/ax/ax-optimizer-options-mipro-ace-gepa-usage.md).
- Risks: gains come mostly from few-shot demos, which conflict with an SMS bot's length/format constraints and with the routed decomposition; scalar metric only (no feedback text).
- Verdict: skip — GEPA roughly doubles its aggregate gains on the same tasks with a scalar-plus-text metric and shorter prompts.

#### Method card: Simple hill-climb / OPRO / ProTeGi-lite (hand-rolled in TypeScript)
- Sources: Pryzant et al., "Automatic Prompt Optimization with 'Gradient Descent' and Beam Search", arXiv 2305.03495, May 2023, EMNLP 2023 — [arXiv](https://arxiv.org/abs/2305.03495); Yang et al., "Large Language Models as Optimizers" (OPRO), arXiv 2309.03409, Sep 2023 — [arXiv](https://arxiv.org/abs/2309.03409); Braintrust hill-climbing — [Braintrust](https://braintrust.dev/docs/evaluate/advanced-evaluations).
- Claims: APO/ProTeGi forms natural-language "gradients" from minibatch errors, edits the prompt in the opposite direction, and keeps a beam of candidates; improves initial prompts by "up to 31%" on three NLP tasks plus jailbreak detection — [arXiv](https://arxiv.org/abs/2305.03495). OPRO feeds the trajectory of (prompt, score) pairs to an LLM which proposes new prompts; up to 8% on GSM8K and up to 50% on Big-Bench Hard over human prompts — [arXiv](https://arxiv.org/abs/2309.03409). Braintrust's "hill climbing" compares each run to a base experiment's outputs with comparative scorers — [Braintrust](https://braintrust.dev/docs/evaluate/advanced-evaluations). Number of metric calls: none reported in the abstracts fetched.
- Effort: ~2 h: loop { run train split -> collect failing cases + checker messages -> ask a Sonnet-class model for 3–5 candidate edits to the failing section -> evaluate each candidate on the train split with 2 reps -> keep the best } for ~5–8 iterations ≈ 5 candidates × 8 iterations × 30 cases × 2 reps ≈ 2,400 bot calls (my arithmetic).
- Risks: no Pareto bookkeeping, so fixes for one case regress another (exactly the Willison failure); weaker than GEPA by construction (GEPA's ablation: best-candidate selection +6.05 vs Pareto +12.44).
- Verdict: try if time — it is the only option that stays in TypeScript with zero new dependencies; use the held-out split and 3 reps for the final comparison.

#### TypeScript landscape
- Ax (`@ax-llm/ax`, "inspired by the DSPy paper", 3.0k stars, 2,123 commits): offers `AxGEPA` and `AxBootstrapFewShot` with `compile()`; supports switching provider to `"anthropic"`; metric is an async callback over `{ prediction, example }` returning named numeric scores; no before/after numbers published on the README — [GitHub ax-llm/ax](https://github.com/ax-llm/ax). A third-party guide (25 Feb 2026) states "Both ACE and GEPA run entirely within the TypeScript/JavaScript runtime" while `AxMiPRO` needs a Python service; GEPA presets light 10 trials/15 minibatch, medium 20/25, heavy 35/35 — [instagit Ax guide](https://instagit.com/ax-llm/ax/ax-optimizer-options-mipro-ace-gepa-usage.md).
- DSPy / gepa are Python; `optimize_anything` accepts any `evaluate(candidate: str) -> float` so the TS harness can be called as a subprocess or HTTP endpoint — [gepa-ai/gepa](https://github.com/gepa-ai/gepa).

### Inferences (budget arithmetic for our setup, from the DSPy formulas above)
- DSPy GEPA `auto=light`, one predictor, valset 30: num_trials = 10; total ≈ 30 + 30 + 10×35 + 3×30 = 500 metric calls. With valset 65: ≈ 640. `medium` (n=12): ≈ 840 (V=30) to ~1,015 (V=65). This matches Nubank's "auto=light (about 500 iterations)".
- MIPROv2 `light`, zero-shot, valset 30 (no minibatching below 50): 9 trials × 30 = 270 task calls plus ~18 prompt-model calls; valset 65: 35×9 + 65×2 ≈ 445.
- Each metric call = one bot turn with the 800-line prompt + tool fixtures + the deterministic checker; at modest concurrency a 500-call run finishes in well under an hour on a hosted Haiku-class API. The reflection LM adds ~10 (light) strong-model calls with long contexts. So "a few hours of compute" is comfortably enough; the budget risk is engineering and labeling time.
- With ~125 total cases (65 + ~60 pair-derived) a 40/60 train/held-out split leaves ~50 for optimization and ~75 held-out, which is at the small end of GEPA's published 45–150 train sizes and far above Willison's 20/10.
- The routed decomposition makes this a multi-module program; GEPA/MIPROv2 natively optimize per-module instructions, a hand-rolled hill-climb must target one module at a time.

### Gaps
- No wall-clock times reported for GEPA/MIPROv2 runs in the paper or docs; the Ax README contains no accuracy numbers; I could not fetch Ax's official OPTIMIZE.md (404/503), so the "GEPA native TS / MiPRO needs Python" statement rests on a third-party guide.
- No source reports optimizer results on a Haiku-class task model with a deterministic pass/fail checker; published gains use GPT-4.1-mini or Qwen3-8B with F1/accuracy-style metrics.

---

## KQ6. Case studies: optimizing a customer-support prompt against an eval, with before/after numbers

### Takeaway
Two relevant 2026 case studies exist. Nubank (KDD'26) optimized LLM-judge prompts for support conversations with GEPA and raised held-out evaluator accuracy by 3–20 points while lifting cross-model kappa from ~0 to >0.7; Simon Willison's Datasette Agent run shows the failure mode for tiny sets (+5 train, −10 held-out). No published case optimizes a support reply prompt against a deterministic checker like ours.

### Cited Findings
- Nubank, "Building Customer Support AI Agents at 100M-User Scale: An Evaluation-Driven Framework", arXiv 2606.08867v2, 13 Jun 2026, KDD'26 — [arXiv HTML](https://arxiv.org/html/2606.08867v2): evaluators are binary LLM judges; GEPA in DSPy with GPT-4.1-mini as base and GPT-5.1 as reflection model, `auto=light` ("about 500 iterations"), reflection minibatch 3, 40/30/30 train/val/test, five repeats with 95% CI. Held-out evaluator accuracy (baseline majority class / starter prompt / GEPA-optimized): E1 51.11 / 77.78 ± 0.49 / 82.00 ± 0.09; E2 77.78 / 68.88 ± 3.41 / 88.89 ± 0.00; E3 56.62 / 58.07 ± 0.26 / 73.01 ± 0.76; E4 51.11 / 74.00 ± 0.95 / 76.89 ± 0.79. Inter-model Cohen's kappa on E1: starter prompt GPT-4.1 vs GPT-5 0.109, GPT-4.1 vs GPT-4.1-mini 0.000 (mini predicted a single class); optimized prompt 0.745 / 0.895 (vs GPT-4o) / 0.950 (GPT-5 vs o3); "from near-zero to κ>0.7 for most model pairs". The optimized E2 prompt grew from ~12 lines to ~80 lines organized as a four-step decision tree that "reduced both false positives ... and false negatives" (no numbers). Online: +37 p.p. AI tNPS and +29 p.p. self-service rate on card delivery.
- Simon Willison, "DSPy evaluates and refines Datasette Agent prompts", 2 Jul 2026 — [simonwillison.net](https://simonwillison.net/2026/Jul/2/dspy-datasette-agent-prompts/), full report — [GitHub README](https://raw.githubusercontent.com/simonw/research/main/dspy-datasette-agent-prompts/README.md): 20 train / 10 held-out SQL questions, `dspy.GEPA(auto="light")`, task model gpt-4.1-nano, reflection gpt-5-mini; baseline 90.0 train / 95.0 held-out, GEPA 95.0 train / 85.0 held-out; prompt grew from ~2,400 to ~8,800 characters; GEPA accepted one mutation then plateaued because nearly every minibatch already scored 100%; two of three apparent baseline failures were metric bugs (a semantic zero and a tie), and fixing them raised baseline held-out from 81.7 to 95.0; conclusion: "at this scale, eval quality dominates optimizer quality".
- Related, not support-specific: GEPA's own PUPA (privacy-conscious delegation, a task with rule-following) 78.57 -> 94.47 with GPT-4.1 mini — [GEPA HTML](https://arxiv.org/html/2507.19457v2); tau-bench shows rule-following is the failure category (25% of gpt-4o retail failures) and that the policy text in the prompt is worth 4–22 points — [tau-bench HTML](https://arxiv.org/html/2406.12045).

### Inferences
- Nubank's result is really "GEPA fixes judge prompts", which is the strongest evidence that if the team does add a tone judge, optimizing the judge prompt against the 60 human-labeled pairs is a better use of GEPA than optimizing the bot prompt.
- Willison's regression mechanism (an added rule colliding with an existing display-mode rule) is precisely the risk for an 800-line prompt with 60 contrastive pairs; the decomposition into routed modules reduces the collision surface, which argues for optimizing after decomposition, per module.

### Gaps
- No case study with before/after numbers for optimizing a customer-facing reply prompt against deterministic checks (prices/URLs/escalation); all reported gains are on judge prompts, QA, or benchmark tasks.

---

## Direct answers to the key questions

1. Smallest credible eval for ~65 cases: 65 cases + the ~60 BAD/GOOD-derived cases (~125 total), each with a frozen tool fixture and deterministic assertions; split ~50 dev / ~75 held-out before any optimization; run each condition 3 times (5 if cheap); report pass rate ± Bernoulli SE, pass^3 per case, and the paired per-case difference ± paired SE (Miller 2024). With 65 cases alone, one run has SE ≈ 5 points at 80% pass, so only ~14-point unpaired (or ~10-point paired) differences are credible; 3 reps and pairing bring that to roughly 7 points. Sources: [Miller HTML](https://arxiv.org/html/2411.00640v1), [tau-bench HTML](https://arxiv.org/html/2406.12045), [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents), [evals FAQ](https://hamel.dev/blog/posts/evals-faq/).
2. Mixing deterministic checks with a judge: deterministic checks are hard gates (a case fails if any fails); the judge is a separate, non-gating binary pairwise "tone" verdict run on a Sonnet-class model in both orders (tie if they disagree), validated against ≥30 Pass + ≥30 Fail human labels with TPR/TNR reported; promptfoo's `assert-set`/`weight` or a two-column report keeps them separate. Only add it if open-coding the 60 flagged replies shows tone failures that no assertion captures. Sources: [MT-Bench HTML](https://arxiv.org/html/2306.05685), [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/), [hamel.dev judge post](https://hamel.dev/blog/posts/llm-judge/), [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).
3. How many reps: 3 minimum, 5 preferred; beyond ~5 the variance reduction from resampling flattens (limit 2/3 of variance in Miller's example); do not lower temperature to fake stability. Practitioner precedent: tau-bench ≥3, Nubank 5, MIPRO/GEPA papers 5, Braintrust examples 5–10. Sources: [Miller HTML](https://arxiv.org/html/2411.00640v1), [tau-bench HTML](https://arxiv.org/html/2406.12045), [Nubank HTML](https://arxiv.org/html/2606.08867v2), [Braintrust](https://braintrust.dev/docs/evaluate/advanced-evaluations).
4. Does DSPy/GEPA fit a 10-hour budget: compute yes (a `light` run ≈ 500 metric calls, i.e., minutes to tens of minutes of Haiku calls; the GEPA paper's whole GPT-4.1-mini suite cost $86 for GEPA); engineering only if the eval harness is finished and trustworthy first — budget ~3–4 h for a Python `gepa.optimize_anything` wrapper around the TS checker (or Ax `AxGEPA` in TS), ~2 h for a hand-rolled hill-climb. Expect single-digit-to-low-double-digit point gains at best on instruction-following-style metrics (IFBench +5 to +8 points) and a real risk of held-out regression with <50 training cases. Sources: [GEPA HTML](https://arxiv.org/html/2507.19457v2), [gepa.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/gepa/gepa.py), [Nubank HTML](https://arxiv.org/html/2606.08867v2), [Willison README](https://raw.githubusercontent.com/simonw/research/main/dspy-datasette-agent-prompts/README.md).
5. Priority order for the 10 hours (inference): (a) harness + fixtures + deterministic checks + SE/pass^k reporting (~3 h); (b) convert BAD/GOOD pairs and policy rules into cases, with INV variants (~3 h); (c) run old prompt vs new routed system, 3 reps, paired report (~1 h); (d) remaining ~3 h: either the tone judge with validation labels, or one GEPA/hill-climb run on the dev split evaluated on held-out — not both.

---

## Quantitative claims table

| # | Claim | Number | Source (date, type) |
|---|---|---|---|
| 1 | GPT-4 pairwise judge vs human experts, MT-bench, excluding ties | 85% | [MT-Bench HTML](https://arxiv.org/html/2306.05685) (Jun 2023, arXiv/NeurIPS) |
| 2 | Human-human agreement, MT-bench, excluding ties | 81% | same |
| 3 | GPT-4 vs humans with ties, MT-bench | 66% | same |
| 4 | Chatbot Arena GPT-4 pairwise vs human (with / without ties) | 64% / 87% | same |
| 5 | Chatbot Arena Claude vs human (with / without ties) | 53% / 84% | same |
| 6 | Position-swap consistency, default prompt: GPT-4 / GPT-3.5 / Claude-v1 | 65.0% / 46.2% / 23.8% | same |
| 7 | Claude-v1 biased toward first position | 75.0% | same |
| 8 | Few-shot judge consistency GPT-4 (cost ~4x) | 77.5% | same |
| 9 | Verbosity (repetitive-list) attack failure: Claude-v1 / GPT-3.5 / GPT-4 | 91.3% / 91.3% / 8.7% | same |
| 10 | Self-enhancement win-rate inflation GPT-4 / Claude-v1 (inconclusive) | ~10% / ~25% | same |
| 11 | Math judging failure: default / CoT / reference-guided | 70% / 30% / 15% | same |
| 12 | Humans found GPT-4 verdict reasonable when disagreeing / changed own choice | 75% / 34% | same |
| 13 | G-Eval (GPT-4) Spearman with humans, SummEval | 0.514 | [ACL 2023](https://aclanthology.org/2023.emnlp-main.153) (Mar 2023, paper) |
| 14 | G-Eval samples averaged per item (secondary) | 20 | [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/) (Aug 2024, blog) |
| 15 | Prometheus-13B / GPT-4-0613 / ChatGPT Pearson with humans, 45 rubrics | 0.897 / 0.882 / 0.392 | [arXiv 2310.08491](https://arxiv.org/abs/2310.08491v2) (Oct 2023, paper) |
| 16 | Prometheus-2-8x7B vs humans / GPT-4 vs humans / Prometheus-13B, FLASK | 0.555 / 0.679 / 0.449 | [arXiv 2405.01535](https://arxiv.org/abs/2405.01535v2) (May 2024, paper) |
| 17 | Claude-3.5 robustness rate: position / verbosity / bandwagon / authority | 0.832 / 0.952 / 0.627 / 0.856 | [arXiv 2410.02736](https://arxiv.org/html/2410.02736v1) (Oct 2024, paper) |
| 18 | GPT-4o robustness rate: position / verbosity / bandwagon / authority | 0.776 / 0.977 / 0.800 / 0.800 | same |
| 19 | ChatGPT robustness rate: position / verbosity / bandwagon / authority | 0.566 / 0.900 / 0.699 / 0.628 | same |
| 20 | Judging the Judges: GPT-4 kappa / llama-3-70b / human-human; llama-3-8b agreement vs kappa (secondary) | 0.84 / 0.79 / 0.97; 80% vs 0.62 | [eugeneyan.com](https://eugeneyan.com/writing/llm-evaluators/) (Aug 2024, blog) |
| 21 | GPT-4-turbo failed to lower scores on perturbed long-form answers (secondary) | >50% | same |
| 22 | Pairwise vs direct scoring, gpt-3.5 factual consistency (Liu 2024, secondary) | 0.45 vs 0.49 | same |
| 23 | Judge labels per failure mode; Pass/Fail per split; min before CIs too wide | 100–200; 30–50 each; 60 | [evals FAQ](https://hamel.dev/blog/posts/evals-faq/) (Sep 2026), [judge post](https://hamel.dev/blog/posts/llm-judge/) (Oct 2024) |
| 24 | Judge train/dev/test split | 10–20% / 40–45% / 40–45% | same |
| 25 | Honeycomb judge-expert agreement after 3 iterations | >90% | [judge post](https://hamel.dev/blog/posts/llm-judge/) (Oct 2024, blog) |
| 26 | Judge acceptance bar in evals-skills (secondary mirror) | TPR and TNR > 90% | [skills.sh mirror](https://skills.sh/hamelsmu/evals-skills/validate-evaluator) (2026, repo mirror) |
| 27 | Traces to review for error analysis; annotate yourself first | ≥100; 30 | [evals FAQ](https://hamel.dev/blog/posts/evals-faq/) (Sep 2026, blog) |
| 28 | CI dataset size | "100+ examples" | same |
| 29 | Anthropic: tasks to start an agent eval | 20–50 | [Anthropic Engineering](https://anthropic.com/engineering/demystifying-evals-for-ai-agents) (Jan 2026, blog) |
| 30 | pass^3 at 75% per-trial success | ~42% | same |
| 31 | CheckList users: tests created / bugs found vs control | 2x / ~3x | [UW IDL](https://idl.uw.edu/papers/check-list) (2020, paper page) |
| 32 | SPADE: assertion-count reduction / false-failure reduction / pipelines / deployments | 14% / 21% / 9 / 2,000+ | [arXiv 2401.03038](https://arxiv.org/abs/2401.03038) (Jan 2024, paper) |
| 33 | EvalGen: participants; grades before criteria; FFR threshold; coverage vs SPADE | 9; 5–10; 20%; 0.73 vs 0.49 | [arXiv 2404.12272](https://arxiv.org/html/2404.12272) (Apr 2024, paper) |
| 34 | tau-bench trials per task | ≥3 | [tau-bench HTML](https://arxiv.org/html/2406.12045) (Jun 2024, paper) |
| 35 | gpt-4o pass^1 retail / airline; pass^8 retail | 61.2 / 35.2; <25% | same |
| 36 | claude-3-haiku pass^1 retail / airline | 19.0 / 14.4 | same |
| 37 | Removing policy from prompt, gpt-4o retail / airline | 61.2->56.8 / 33.2->10.8 | same |
| 38 | gpt-4o retail failure categories: rule violation / partial resolution | 25% / 19% | same |
| 39 | tau-retail / tau-airline tasks | 115 / 50 | same |
| 40 | MANTRA tasks / domains / manual length | 285 / 6 / 50+ pages | [arXiv 2605.06334](https://arxiv.org/abs/2605.06334) (May 2026, paper) |
| 41 | HumanEval 164 questions at 83.6%: SE | 3.2 points | [Miller HTML](https://arxiv.org/html/2411.00640v1) (Nov 2024, paper) |
| 42 | Pairing with correlation 0.5: variance reduction | 1/3 | same |
| 43 | Resampling K=2 / 4 / 6: variance reduction; limit | 1/3 / 1/2 / 5/9; 2/3 | same |
| 44 | Questions to detect 3-point difference at 80% power | ~969 | same |
| 45 | n=198, K 1->10: minimum detectable effect | 13.2 -> 7.5 points | same |
| 46 | Clustered vs naive SE, DROP | 1.34 vs 0.44 (3.05x) | same |
| 47 | Nubank: GEPA light iterations; repeats; split | ~500; 5; 40/30/30 | [Nubank HTML](https://arxiv.org/html/2606.08867v2) (Jun 2026, paper) |
| 48 | Nubank evaluator accuracy starter -> optimized, E1/E2/E3/E4 | 77.78->82.00 / 68.88->88.89 / 58.07->73.01 / 74.00->76.89 | same |
| 49 | Nubank inter-model kappa starter -> optimized (GPT-4.1 vs 4.1-mini) | 0.000 -> 0.745 | same |
| 50 | Nubank online: AI tNPS / self-service rate | +37 p.p. / +29 p.p. | same |
| 51 | Nubank label set sizes E1–E5 | 888 / 90 / 816 / 246 / 90 | same |
| 52 | Willison: train / held-out, baseline -> GEPA | 20/10; 90->95 train, 95->85 held-out | [Willison README](https://raw.githubusercontent.com/simonw/research/main/dspy-datasette-agent-prompts/README.md) (Jul 2026, report) |
| 53 | Willison: prompt length; metric-bug fix effect on baseline held-out | 2,400 -> 8,800 chars; 81.7 -> 95.0 | same |
| 54 | GEPA vs GRPO rollouts | up to 35x fewer; GRPO 24,000 | [GEPA HTML](https://arxiv.org/html/2507.19457v2) (Jul 2025, paper) |
| 55 | GEPA total rollouts per task (HotpotQA/IFBench/HoVer/PUPA/AIME/LiveBench) | 6,871 / 3,593 / 7,051 / 2,426 / 1,839 / 1,839 | same |
| 56 | GEPA matches GRPO best validation after | 243–1,179 rollouts | same |
| 57 | GPT-4.1-mini aggregate: baseline / MIPROv2 / GEPA / GEPA+Merge | 53.03 / 58.67 / 65.22 / 66.36 | same |
| 58 | GPT-4.1-mini IFBench: baseline / MIPROv2 / GEPA / GEPA+Merge | 47.79 / 49.15 / 52.72 / 55.95 | same |
| 59 | GPT-4.1-mini PUPA baseline -> GEPA | 78.57 -> 94.47 | same |
| 60 | Qwen3-8B aggregate: baseline / MIPROv2 / GRPO / GEPA | 45.23 / 47.84 / 48.91 / 54.85 | same |
| 61 | Ablation aggregate gain: best-candidate / beam / Pareto | +6.05 / +5.11 / +12.44 | same |
| 62 | Cost of all GPT-4.1-mini experiments; GEPA / GEPA-Merge / MIPROv2 | <$500; $86 / $67 / $76 | same |
| 63 | MIPROv2 setting / rollouts in GEPA paper | auto=heavy (18 cands); 2,270–6,926 | same |
| 64 | GEPA prompts vs MIPROv2 prompts length | ~33% shorter | same |
| 65 | GEPA train/val sizes used | 150/300, 111/111, 45/45 | same |
| 66 | gepa optimize_anything headline, AIME 2025 GPT-4.1-mini | 46.6% -> 56.6% | [gepa-ai/gepa](https://github.com/gepa-ai/gepa) (2025–26, README) |
| 67 | DSPy GEPA auto n: light / medium / heavy; minibatch 35; full eval every 5 | 6 / 12 / 18 | [gepa.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/gepa/gepa.py) (2026, source) |
| 68 | DSPy MIPROv2 auto n (val size): light / medium / heavy | 6 (100) / 12 (300) / 18 (1000) | [mipro_optimizer_v2.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/mipro_optimizer_v2.py) (2026, source) |
| 69 | MIPRO: wins on tasks; max gain | 5 of 7; up to 13% | [arXiv 2406.11695](https://arxiv.org/abs/2406.11695) (Jun 2024, paper) |
| 70 | MIPRO ScoNe unoptimized -> MIPRO; runs averaged | 56.2 -> 79.4; 5 | [MIPRO HTML](https://arxiv.org/html/2406.11695v2) |
| 71 | MIPRO experiments: train/dev; full-eval trials | 500/500; 20–50 | same |
| 72 | APO/ProTeGi improvement over initial prompt | up to 31% | [arXiv 2305.03495](https://arxiv.org/abs/2305.03495) (May 2023, paper) |
| 73 | OPRO over human prompts: GSM8K / BBH | up to 8% / up to 50% | [arXiv 2309.03409](https://arxiv.org/abs/2309.03409) (Sep 2023, paper) |
| 74 | Ax GEPA presets trials/minibatch light / medium / heavy (secondary) | 10/15, 20/25, 35/35 | [instagit Ax guide](https://instagit.com/ax-llm/ax/ax-optimizer-options-mipro-ace-gepa-usage.md) (Feb 2026, third-party) |
| 75 | Ax repo stars / commits | 3.0k / 2,123 | [GitHub ax-llm/ax](https://github.com/ax-llm/ax) (Oct 2026, repo) |
| 76 | Braintrust trialCount examples | 10; 5 (hard) / 1 (stable) | [Braintrust](https://braintrust.dev/docs/evaluate/advanced-evaluations) (2026, docs) |
| 77 | promptfoo `--filter-range 0:5 --repeat 3` | 15 evaluations | [promptfoo CLI](https://www.promptfoo.dev/docs/usage/command-line/) (2026, docs) |
| 78 | DeepEval G-Eval default threshold | 0.5 | [DeepEval](https://deepeval.com/docs/metrics-llm-evals) (2026, docs) |
| 79 | Koji write-up: judge-human agreement binary / 1–5 scale (unverified vendor) | 0.74 / 0.41 | [koji.so](https://www.koji.so/docs/llm-as-a-judge-vs-human-evaluation) (2026, vendor) |
| 80 | My arithmetic: 65 cases at 80% pass, one run: SE / 95% CI | ~5.0 / ±9.7 points | inference from [Miller HTML](https://arxiv.org/html/2411.00640v1) |
| 81 | My arithmetic: DSPy GEPA light metric calls, V=30 / V=65 | ~500 / ~640 | inference from [gepa.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/gepa/gepa.py) |
| 82 | My arithmetic: MIPROv2 light zero-shot task calls, V=30 / V=65 | ~270 / ~445 | inference from [mipro_optimizer_v2.py](https://raw.githubusercontent.com/stanfordnlp/dspy/main/dspy/teleprompt/mipro_optimizer_v2.py) |
