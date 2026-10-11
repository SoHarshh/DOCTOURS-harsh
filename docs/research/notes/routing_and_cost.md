# Routing an incoming message to the right rule subset, and the cost/quality case for doing it

Research date: 2026-10-11. Scope: keyword/regex routers, embedding routers (Aurelio semantic-router), small-LLM intent classifiers, model cascades (RouteLLM, FrugalGPT), production support-bot intent detection, evidence that long prompts hurt quality, and prompt-caching patterns. Judged against: a Haiku-class SMS "patient coordinator" with 14 tools, one ~800-line / ~25k-token system prompt, TypeScript, one developer, ~10 hours, a fixed suite of ~65 test messages with deterministic checks plus token cost and latency.

Convention used below: "problems 1–8" refer to the owners' list: (1) every turn loads every rule; (2) can't attribute a bad reply to a rule; (3) second product line means pasting another domain in; (4) subtasks have nowhere to go; (5) every message pays full prompt cost; (6) editing one policy changes unrelated replies; (7) conflicting rules with no record of which won; (8) can't test one behavior alone.

---

## Method cards (routing approaches and cost/quality evidence)

### Takeaway
Every routing approach is a known, documented pattern; the real choice is which stage runs first and what happens on low confidence. For a 65-message suite on a Haiku-class model, a regex-first router with a Haiku JSON classifier as fallback (hybrid) is the cheapest to build and matches the pattern reported in industry papers. The strongest single piece of evidence for decomposing the 25k-token monolith is IFScale (July 2025): claude-3.5-haiku's instruction-following accuracy fell from 98% at 10 instructions to 43% at 100, an "exponential decay" pattern specific to small models.

### Cited Findings

#### Card 1: Keyword / regex router
- **One-line:** A hand-written table of patterns (regex, keywords, entity hits) mapped to rule modules; first/multi-match; runs in-process in microseconds.
- **Sources:** [StableKernel, "LLMs versus rules in enterprise voice flows" (dated 7/01/26, vendor blog)](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows); [Rodrigues & Vas, "When Do LLMs Replace Fine-Tuned NLU?" arXiv 2608.20371 (19 Jun 2026, preprint)](https://arxiv.org/abs/2608.20371); [Šléher et al., "Guarded Query Routing", arXiv 2505.14524 (May–Oct 2025, preprint)](https://arxiv.org/abs/2505.14524); [Towards AI, "Rethinking intent routing from TF-IDF to fine-tuned transformers" (blog, undated)](https://pub.towardsai.net/rethinking-intent-routing-from-tf-idf-to-fine-tuned-transformers-257d906cbb7f).
- **Claims:** Lexical/bag-of-words routers are the fastest option and, on narrow in-domain data, surprisingly competitive: a TF-IDF + logistic regression baseline scored 95.2% on full ATIS and 80.9% on CLINC150 (150 intents incl. 1,000 out-of-scope items) in Rodrigues & Vas 2026, and fastText reached ~80% at under 1 ms in Guarded Query Routing. The weakness is paraphrase and out-of-scope: TF-IDF's OOS recall on CLINC150 was 36.4% vs 85.6% for Claude Haiku zero-shot, and its accuracy under noisy input fell to 80.0% vs 92.5% for Haiku. StableKernel recommends a 5–15 ms classifier/keyword pass first and says deterministic turns can be 40–60% of all turns in ordering flows.
- **Problems addressed:** 1, 3, 4, 5, 6, 8 (and enables 2 and 7 if the route decision and loaded module IDs are logged per turn).
- **Reported numbers:** TF-IDF+LR 95.2% ATIS, 80.9% CLINC150, OOS recall 36.4% ([Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)); fastText ~80% @ <1 ms; WideMLP ~88% @ <4 ms ([Šléher et al. 2025](https://arxiv.org/abs/2505.14524)); 5–15 ms per classifier pass, <10 ms in-memory rule check ([StableKernel 2026](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows)). Pure hand-written regex on paraphrases: none reported.
- **Effort in our setup:** ~1–2 h. Build: a `routes.ts` table of `{module, patterns: RegExp[]}` (pricing, clinics, packages, payment, photos, scheduling, handoff triggers), returning the set of matched modules; unit-test against the 65 messages.
- **Risks:** Silent misses on paraphrase ("what would it set me back" ≠ /price|cost/); multi-topic messages; no confidence signal, so you must define "no match" and "too many matches" explicitly.
- **Verdict:** Try first — it is the cheapest stage, and on a 65-message suite you can read every miss by hand.

#### Card 2: Embedding router (Aurelio Labs semantic-router style)
- **One-line:** Each route is a list of example utterances; the message is embedded and routed to the route with the highest aggregated cosine similarity above a per-route threshold, else `None`.
- **Sources:** [aurelio-labs/semantic-router README (GitHub, captured 2026; 0.x stable, 1.x rewrite in progress)](https://github.com/aurelio-labs/semantic-router); [Aurelio docs, threshold optimization (undated)](https://docs.aurelio.ai/semantic-router/user-guide/features/threshold-optimization); [semantic-router API docs, RouteLayer signature](https://semantic-router.readthedocs.io/en/latest/_autosummary/semantic_router.layer.RouteLayer.html); [Kumar & Saminathan, arXiv 2608.14641 (28 Jul 2026, preprint)](https://arxiv.org/abs/2608.14641); [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371); [Arora et al., "Intent Detection in the Age of LLMs", EMNLP 2024 Industry, arXiv 2410.01627 (2 Oct 2024)](https://arxiv.org/abs/2410.01627).
- **Claims:** The README positions it as a "superfast decision-making layer" that avoids LLM generation; it supports Cohere/OpenAI/HuggingFace/FastEmbed encoders and a `HybridRouteLayer` (sparse+dense), returns `None` when nothing matches, and offers threshold fitting against labeled examples. The project publishes no accuracy or latency benchmarks; defaults in docs are a 0.5 score threshold per route, `aggregation='sum'`, `top_k=5`. Independent evidence on embedding kNN routing is mixed: all-MiniLM-L6-v2 sentence-embedding kNN scored 75.1% on CLINC150 with full training data and only 64.2% with 5 examples per intent, below TF-IDF; Guarded Query Routing's PDF (per search excerpt) rated SemanticRouter's GQR-score "only moderate due to very limited OOD" handling. A July 2026 four-router study found the Aurelio router (used there for model-tier routing, not intent) produced near-constant assignments indistinguishable from an "Always-Mid" baseline.
- **Problems addressed:** 1, 3, 4, 5, 6, 8.
- **Reported numbers:** Project: none reported. Third-party: ST+kNN 75.1% (full data) / 64.2% (5-shot) on CLINC150 ([Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)); "~4 ms per decision" appears only on an aggregator page citing the project homepage ([everydev.ai](https://www.everydev.ai/tools/semantic-router/llms.txt)) and is unverified; "16–100 ms" and "92–96% precision" in a practitioner cascade post are secondary citations ([tianpan.co, 16 Apr 2026](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers)).
- **Effort in our setup:** ~2–4 h. Build: ~10 utterances per route, embed once with an embeddings API (Anthropic does not offer one; semantic-router itself is Python, so this would be a ~100-line TypeScript port: cosine over stored vectors, per-route threshold, `null` fallback).
- **Risks:** Adds a second vendor dependency for embeddings; 5–10 examples per route gave only 64% in the one controlled test found; threshold tuning needs labeled data you only partially have (65 messages); no published paraphrase benchmark from the project.
- **Verdict:** Try if time — only as a middle stage if regex misses too many paraphrases and a Haiku call per message is too slow; otherwise skip, since the Haiku classifier below needs no new dependency.

#### Card 3: Small-LLM intent classifier (Haiku zero-shot with JSON schema)
- **One-line:** One Haiku call with the route list (name + one-line description), a JSON/tool-use output schema, and an explicit `unknown`/`out_of_scope` label; may return multiple routes.
- **Sources:** [Rodrigues & Vas 2026 (claude-haiku-4-5 zero-shot)](https://arxiv.org/abs/2608.20371); [Šléher et al. 2025 (GPT-4o-mini, Llama 3.x)](https://arxiv.org/abs/2505.14524); [Arora et al. 2024](https://arxiv.org/abs/2410.01627); [Ganesh et al., 41 open-weight models, arXiv 2607.27421 (29 Jul 2026)](https://arxiv.org/abs/2607.27421); [Artificial Analysis, Claude 4.5 Haiku providers page (rolling 72-h medians)](https://artificialanalysis.ai/models/claude-4-5-haiku/providers).
- **Claims:** Zero-shot Claude Haiku 4.5 matched a fully fine-tuned RoBERTa on the broad 150-intent CLINC150 (88.5% vs 89.1%, p=0.24) with no training data, and beat every classical baseline on out-of-scope recall (85.6% vs 58.1% RoBERTa, 36.4% TF-IDF) and on noisy input (92.5% vs 80.0% at 0 dB). It lost on the narrow, skewed ATIS set (84.1% vs 95.9%). Latency was the cost: median 981 ms, p95 1,787 ms over 1,000 calls, "roughly 10^3× slower and costlier" than on-device classifiers, with the authors quoting $0.25 per 1K calls at Haiku list price. In Guarded Query Routing, LLM routers were most accurate (~91%) but slowest (669 ms for remote GPT-4o-mini). A schema-prompted LLM served two disjoint intent schemas at ~94% with zero retraining, the exact "add a second product line" case.
- **Problems addressed:** 1, 3 (new product line = new labels in the prompt), 4, 5, 6, 8; enables 2/7 via logged labels.
- **Reported numbers:** CLINC150 88.5% (OOS recall 85.6%), ATIS 84.1%, median 981 ms / p95 1,787 ms, $0.25/1K calls ([Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)); ~91% @ 669 ms GPT-4o-mini ([Šléher et al. 2025](https://arxiv.org/abs/2505.14524)); Haiku 4.5 non-reasoning TTFT 0.58–1.02 s depending on provider ([Artificial Analysis](https://artificialanalysis.ai/models/claude-4-5-haiku/providers)); at current list prices a ~600-token classification prompt + 20 output tokens costs ≈$0.00007 on Haiku 5.5 ($0.10/$0.50 per MTok) or ≈$0.0007 on Haiku 4.5 ($1/$5 per MTok) ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)).
- **Effort in our setup:** ~1–2 h. Build: `classify(message, history)` that calls Haiku with a forced tool-use schema `{routes: string[], confidence: "high"|"low", out_of_scope: boolean}`; cache the classifier prompt prefix.
- **Risks:** Adds ~0.6–1.8 s per message before the main call; LLM routers are "sensitive to class order and label descriptions" (per a preprint cited in search, unverified); still a second LLM call to attribute errors to.
- **Verdict:** Try first (as the fallback stage) — it is the only option with published numbers on paraphrase/noise and out-of-scope detection, and it needs no new dependency.

#### Card 4: Hybrid cascade (rules first, classifier fallback)
- **One-line:** Cheap deterministic stage first; low-confidence or no-match falls through to the LLM classifier; low-confidence from the LLM falls through to a "general + handoff" bundle or a human.
- **Sources:** [Arora et al. 2024, EMNLP Industry](https://arxiv.org/abs/2410.01627); [Zaera et al., "Efficient OOS Detection via Uncertainty-Driven LLM Routing", arXiv 2507.01541 (2 Jul 2025; ACL 2025 Industry per search listing)](https://arxiv.org/abs/2507.01541); [Decagon agent architecture page (undated)](https://decagon.ai/modules/agent-architecture); [Voiceflow, "Intent classification using LLMs (Hybrid)" (docs; URL now redirects)](https://docs.voiceflow.com/docs/llm-intent-classification-method); [Rasa forum, FallbackClassifier threshold](https://forum.rasa.com/t/handling-out-of-scope-with-threshold-values/38213); [StableKernel 2026](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows); [tianpan.co, 16 Apr 2026](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers); [Niveus Solutions, hybrid AI implementation (vendor blog)](https://niveussolutions.com/hybrid-ai-systems-technical-implementation/).
- **Claims:** This is a well-documented pattern under the names "uncertainty-based routing", "classification cascade", and "NLU-first with LLM fallback". Arora et al. report a hybrid that stays within 2% of native-LLM accuracy with 50% less latency; Zaera et al. route only high-uncertainty utterances from a deployed in-scope classifier (tens of thousands of interactions/day) to an LLM, with a tunable threshold trading cost for accuracy. Decagon describes intent extraction → select an Agent Operating Procedure → RAG fallback if none matches, repeated on every message. Voiceflow parses the LLM output to confirm it is a valid intent name and triggers "NLU fallback" otherwise; Rasa's FallbackClassifier uses a configurable threshold (example 0.6). Practitioner guidance converges on confidence bands (e.g., >0.8 auto-route, 0.5–0.8 route-and-flag, <0.5 escalate).
- **Problems addressed:** 1–8 (2 and 7 only if each stage's decision is logged).
- **Reported numbers:** within 2% of LLM accuracy at 50% less latency ([Arora et al. 2024](https://arxiv.org/abs/2410.01627)); deployment handling "tens of thousands of user interactions daily" ([Zaera et al. 2025](https://arxiv.org/abs/2507.01541)); thresholds 0.6 ([Rasa forum](https://forum.rasa.com/t/handling-out-of-scope-with-threshold-values/38213)), 0.85 ([Niveus](https://niveussolutions.com/hybrid-ai-systems-technical-implementation/)), 0.8/0.5 bands ([tianpan.co](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers)) — all examples, not validated defaults. Controlled benchmark of regex-first vs LLM-first: none reported.
- **Effort in our setup:** ~2–3 h on top of Cards 1 and 3. Build: `route(message) = regexRoutes(message) ?? haikuClassify(message)`, with "ambiguous" (0 or >2 regex hits) also sent to Haiku; log `{stage, routes, confidence, modulesLoaded}` per turn.
- **Risks:** Two stages to debug; regex hits can be wrong with full confidence (no fallback triggers), so keep a "conflict" rule: if regex and the LLM disagree on a sampled turn, prefer the LLM and log it.
- **Verdict:** Try first — it is the pattern industry papers and vendors describe, and the two stages are each under 2 hours.

#### Card 5: Model cascade (RouteLLM / FrugalGPT style)
- **One-line:** Send each query to a cheap model first (or predict which model it needs) and escalate to a stronger model only when needed.
- **Sources:** [Ong et al., RouteLLM, arXiv 2406.18665 (26 Jun 2024, v4 23 Feb 2025)](https://arxiv.org/abs/2406.18665); [LMSYS RouteLLM blog (1 Jul 2024)](https://lmsys.org/blog/2024-07-01-routellm/); [Chen, Zaharia, Zou, FrugalGPT, arXiv 2305.05176 (9 May 2023)](https://arxiv.org/abs/2305.05176); [Kumar & Saminathan 2026](https://arxiv.org/abs/2608.14641).
- **Claims:** RouteLLM's matrix-factorization router hit 95% of GPT-4 quality on MT Bench using 26% GPT-4 calls (48% cheaper than random), 14% GPT-4 calls with augmented data (75% cheaper), and "over 40% cheaper" than commercial routers at equal quality; on MMLU it needed 54% GPT-4 calls (14% cheaper). FrugalGPT reports up to 98% cost reduction matching GPT-4, or +4% accuracy at equal cost. Both assume the expensive model is the default and the router learns from preference data. A July 2026 evaluation of four open-source routers found three produced constant or near-constant tier assignments, so observed gains "track the composition of selected tiers" rather than content-aware routing.
- **Problems addressed:** 5 only (and not when Haiku is already the floor).
- **Reported numbers:** 95% of GPT-4 at 26% / 14% GPT-4 calls; >85% cost reduction on MT Bench, 45% MMLU, 35% GSM8K ([LMSYS blog](https://lmsys.org/blog/2024-07-01-routellm/)); "over 2×" cost reduction ([RouteLLM abstract](https://arxiv.org/abs/2406.18665)); up to 98% cost reduction, +4% accuracy ([FrugalGPT](https://arxiv.org/abs/2305.05176)).
- **Effort in our setup:** ~1–2 h for the inverted version only: on classifier `confidence: "low"` or a failed tool call, re-run the same turn on Sonnet before handing off to a human.
- **Risks:** RouteLLM-style routers need preference training data (not available, and training is out of scope); with Haiku 5.5 at $0.10/MTok the cost ceiling is already tiny, so a cascade buys quality, not savings; routing itself costs a call.
- **Verdict:** Skip RouteLLM/FrugalGPT as designed; try if time the inverted "Haiku → Sonnet on low confidence → human" cascade as a quality step.

#### Card 6: Evidence that long prompts hurt quality (not just cost)
- **One-line:** Position effects, length-only degradation, distractor effects, and instruction-count decay are each measured in separate studies; together they say a 25k-token, ~hundreds-of-rules prompt on a Haiku-class model is likely following well under all of its rules.
- **Sources:** [Liu et al., "Lost in the Middle", arXiv 2307.03172 (6 Jul 2023; TACL 2023)](https://arxiv.org/abs/2307.03172); [Levy, Jacoby, Goldberg, "Same Task, More Tokens", arXiv 2402.14848 (19 Feb 2024; ACL 2024)](https://arxiv.org/abs/2402.14848); [Hong, Troynikov, Huber, "Context Rot", Chroma (14 Jul 2025)](https://www.trychroma.com/research/context-rot); [Jaroslawicz et al., IFScale, arXiv 2507.11538 (15 Jul 2025; NeurIPS 2025 listing)](https://arxiv.org/abs/2507.11538); [Harada et al., ManyIFEval, arXiv 2509.21051 (25 Sep 2025; EMNLP 2025)](https://arxiv.org/abs/2509.21051); [SCALEDIF, arXiv 2510.14842 (Oct 2025)](https://arxiv.org/abs/2510.14842v1); [Commey, arXiv 2601.22025 (29 Jan 2026, rev. 9 Jun 2026)](https://arxiv.org/abs/2601.22025).
- **Claims:** Lost in the Middle: GPT-3.5-Turbo's 20-document QA accuracy drops by more than 20 points when the relevant document is mid-context and in the worst case falls below the closed-book baseline (56.1%; oracle 88.3%), a U-shaped curve seen across GPT-3.5-Turbo, Claude-1.3, LongChat-13B, and MPT-30B. Same Task, More Tokens: with the task held constant and only padding varied, accuracy fell from 0.92 at ~250 tokens to 0.68 at ~3,000 tokens across GPT-4, GPT-3.5, Gemini Pro, Mistral Medium and Mixtral 8x7B, degradation visible beyond 500 tokens, and chain-of-thought did not mitigate it in most models. Context Rot: across 18 models, LongMemEval "focused" prompts (~300 tokens) scored significantly higher than full prompts (~113k tokens), Claude models showing the largest gap driven by abstentions; even one distractor reduced accuracy and four compounded it. IFScale: claude-3.5-haiku scored 98.0/78.0/43.4/16.6/8.5% at 10/50/100/250/500 instructions ("exponential decay"), while gpt-4.1 went 98.0/98.8/95.4/74.0/48.9 ("linear decay") and gemini-2.5-pro 100/99.6/98.4/84.8/68.9 ("threshold decay"); models show primacy bias (later instructions violated more, peaking at 150–200 instructions) and mostly omission errors. ManyIFEval: performance "consistently degrades" across 10 LLMs as instructions rise from 1 to 10. SCALEDIF attributes much of the decline to conflicts between instructions as their number grows. Commey 2026: appending generic rules dropped Qwen 2.5's RAG score from 26/30 to 9/30.
- **Problems addressed:** Evidence for 1, 6, 7 (conflict growth), 8.
- **Reported numbers:** see Table at the end.
- **Effort in our setup:** ~1 h to reproduce on your own suite: run the 65 messages against the monolith and against the routed bundles and compare deterministic-check pass rate, tokens, latency.
- **Risks:** None of these studies used a Haiku 4.5/5.5-class model, an SMS support task, or policy-style rules; IFScale's instructions are keyword-inclusion constraints in a report, so absolute numbers do not transfer. The direction and the small-model sensitivity do.
- **Verdict:** Try first (the measurement) — the suite exists; the studies justify expecting a quality gain, not only a cost one.

#### Card 7: Prompt caching (Anthropic, OpenAI)
- **One-line:** Order the request as tools → stable system → variable block → conversation, put a `cache_control` breakpoint on the last stable block, keep everything before it byte-identical, and watch `cache_read_input_tokens`.
- **Sources:** [Anthropic prompt caching docs (current)](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching); [Anthropic pricing docs (current)](https://platform.claude.com/docs/en/about-claude/pricing); [Anthropic/Claude prompt caching launch post (page dated 14 Aug 2025; GA 17 Dec 2024)](https://claude.com/blog/prompt-caching); [OpenAI prompt caching guide (current)](https://developers.openai.com/api/docs/guides/prompt-caching); [DigitalOcean, "Prompt caching in practice: hit rate" (24 Jul 2026 per search; body not retrievable)](https://www.digitalocean.com/community/tutorials/prompt-caching-in-practice-hit-rate).
- **Claims:** Anthropic: cache writes cost 1.25× base input (5-min) or 2× (1-hour), reads 0.1× (0.05× on Opus/Sonnet 5.5; 0.025× on Fable/Mythos 5.1); "caching pays off after one cache read"; up to 4 explicit breakpoints; the prefix is checked at the breakpoint and then up to 20 blocks backward; minimum cacheable prompt is 512 tokens on Haiku 5.5 but 4,096 tokens on Haiku 4.5 (shorter prompts are silently not cached); cache prefix order is tools → system → messages, so any tool-definition change invalidates everything, as does `tool_choice`, adding/removing images, thinking/effort parameters, and non-deterministic JSON key order. Launch benchmarks: a 10-turn conversation with a long system prompt went from ~10 s to ~2.5 s TTFT (-75%) and -53% cost; a 10k-token many-shot prompt -31% latency / -86% cost. OpenAI: automatic prefix caching from 1,024 tokens; reads 0.1× on GPT-5.6+ (up to 95% discount), writes 1.25×; 30-min TTL on GPT-5.6+, 5–10 min (up to 1 h) in-memory earlier; breaks on model/tools/`parallel_tool_calls`/`text.format`/`reasoning.effort` changes, on rewriting instead of appending turns, and above ~15 requests/min per `prompt_cache_key` on older models. Field report (secondary): a security agent with a repeated 4,000-token prefix ran at 7% hit rate because one dynamic identifier sat mid-prompt; moving it to the end raised hits to 74% and cut the monthly bill 59%.
- **Problems addressed:** 5; indirectly 1 (makes a stable core + small dynamic suffix the cheap default).
- **Reported numbers:** see Table.
- **Effort in our setup:** ~1–2 h. Build: freeze the 14 tool definitions (same objects, same order, deterministic serialization) and the shared core as the cached prefix; append the route-specific rules after the breakpoint; log `cache_read_input_tokens` / `cache_creation_input_tokens` per call into the test-suite report.
- **Risks:** On Haiku 4.5 a trimmed per-route prompt under 4,096 tokens is not cached at all; SMS traffic is bursty so a 5-minute TTL will often lapse between patient replies (1-hour TTL costs 2× to write); per-route tool subsets create one cache entry per route; any timestamp or patient-specific text in the system block kills the hit.
- **Verdict:** Try first — it is a request-ordering change, and the suite can assert `cache_read_input_tokens > 0` on the second call.

### Inferences
- Absolute cost is not the lever on Haiku 5.5: a 25k-token prompt costs ≈$0.0025 uncached and ≈$0.00025 cached per message at $0.10 / $0.01 per MTok ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)); on Haiku 4.5 it is ≈$0.025 / ≈$0.0025. Over 65 test messages that is cents. The quality evidence (Card 6) and attribution/testability (problems 2, 6, 7, 8) are the reasons to decompose.
- Because the model is already Haiku-class, "cascade" should be read as quality escalation (Haiku → Sonnet → human on low confidence), not cost reduction; RouteLLM/FrugalGPT numbers do not apply as stated.
- The hybrid order found in the literature is "cheap classifier first, LLM for uncertain cases" (Arora 2024, Zaera 2025). "Regex first" is the same shape with an even cheaper first stage; it is described in vendor material and practitioner posts but no controlled comparison of regex-first vs LLM-first was found.
- IFScale's model split (small models decay exponentially, frontier models linearly or with a threshold) suggests the monolith hurts a Haiku-class deployment more than it would hurt Sonnet/Opus; a per-route bundle of ~10–30 rules is in the range where claude-3.5-haiku was still ≥78%.

### Gaps
- No source publishes accuracy for Aurelio semantic-router on any standard intent benchmark; the "~4 ms" latency figure is from an aggregator, not the project.
- No controlled study compares hand-written regex routers against LLM classifiers on paraphrased inputs.
- No study tested Claude Haiku 4.5 or 5.5 on IFScale-style instruction density; the Haiku data point is claude-3.5-haiku.
- The OpenAI launch post (which stated the original 50% discount and "up to 80% latency" claim) returned HTTP 403; only the current docs were used.
- The DigitalOcean 7%→74% hit-rate article body could not be fetched; the figures come from the search index and two secondary posts, one of which says 84%.

---

## Key question 1: Keyword/regex routers vs embedding routers vs small-LLM classifiers — accuracy on paraphrase/unseen phrasing, latency per route, cost per route

### Takeaway
On a broad intent space the Haiku zero-shot classifier matches a fine-tuned encoder (88.5% vs 89.1% on CLINC150) and dominates on out-of-scope and noisy phrasing (85.6% vs 36–58% OOS recall; 92.5% vs 80.0% at 0 dB), at ~1 s median latency and ≈$0.25/1K calls; lexical/embedding routers answer in <1–15 ms at zero marginal cost but lose 12–20+ points on anything off-distribution.

### Cited Findings
- Fine-tuned RoBERTa 89.1% vs Claude Haiku 4.5 zero-shot 88.5% on CLINC150 (5,500 test incl. 1,000 OOS), p=0.24, "statistically tied"; on ATIS RoBERTa 95.9 vs Claude 84.1 (+11.8, p=2×10^-4) — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- TF-IDF+LR 95.2% ATIS / 80.9% CLINC150; sentence-embedding kNN (all-MiniLM-L6-v2) 75.1% full-data / 64.2% 5-shot on CLINC150 — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- OOS recall on CLINC150: Claude 85.6 (F1 85.0), RoBERTa 58.1 (F1 73.0), TF-IDF 36.4 (F1 51.7) — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- Under ASR noise at 0 dB (mean WER 28.9%): TF-IDF 80.0% vs Claude 92.5%; clean 92.5 vs 98.3 — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- Latency over 1,000 calls: Claude Haiku median 981 ms, p95 1,787 ms, "above the 500 ms conversational bar"; on-device classifiers microseconds-to-milliseconds at zero marginal cost; "$0.25/1K" at Haiku list price — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- Schema-swap: RoBERTa fine-tuned on App A scores 96.8 on A and exactly 0% on App B; schema-prompted LLM serves both at ~94% with no retraining — [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371)
- Guarded Query Routing (law/finance/healthcare, 7 OOD datasets): WideMLP ~88% at <4 ms (best trade-off), fastText ~80% at <1 ms, LLMs ~91% at 62 ms (local Llama-3.1-8B) and 669 ms (remote GPT-4o-mini); "Our findings challenge the automatic reliance on LLMs for (guarded) query routing" — [Šléher et al. 2025](https://arxiv.org/abs/2505.14524)
- Search excerpt of the same paper's PDF: "SemanticRouter's GQR-Score was only moderate due to very limited OOD" — [arXiv PDF 2505.14524](https://arxiv.org/pdf/2505.14524) (abstract page does not list SemanticRouter)
- semantic-router README: no latency or accuracy numbers; returns `None` on no match; `HybridRouteLayer` for sparse+dense; 1.x rewrite in progress, 0.x "finishes at 0.2.0" — [GitHub README](https://github.com/aurelio-labs/semantic-router)
- Default route thresholds 0.5 before fitting; `aggregation='sum'`, `top_k=5` in `RouteLayer` — [Aurelio docs](https://docs.aurelio.ai/semantic-router/user-guide/features/threshold-optimization); [readthedocs](https://semantic-router.readthedocs.io/en/latest/_autosummary/semantic_router.layer.RouteLayer.html)
- "~4 ms per routing decision vs ~3.9 s LLM TTFT" attributed to the project homepage by an aggregator (unverified) — [everydev.ai](https://www.everydev.ai/tools/semantic-router/llms.txt)
- 41 open-weight models (135M–9B) zero-shot: instruction-tuned 3B models can beat several 7B base models; top models on MASSIVE statistically indistinguishable (McNemar); SNIPS saturated — [Ganesh et al. 2026](https://arxiv.org/abs/2607.27421)
- Hybrid uncertainty routing between SetFit and LLM: "within 2% of native LLM accuracy with 50% less latency"; LLM OOS detection "depends significantly on the scope of intent labels and the size of the label space" — [Arora et al. 2024](https://arxiv.org/abs/2410.01627)
- Practitioner cascade latencies: keyword sub-ms, embedding 16–100 ms, fine-tuned classifier 50–200 ms, LLM 1–5 s; embedding routing "under a penny per query, ~65× cheaper than LLM classification"; hybrid "within 2% of LLM-only accuracy at roughly half the latency" (secondary citations) — [tianpan.co, 16 Apr 2026](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers)
- Classifier/keyword pass 5–15 ms; in-memory rule check <10 ms; DB-backed rule 10–150 ms; LLM model stage 300–600 ms — [StableKernel 2026](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows)
- Claude Haiku 4.5 (non-reasoning) median TTFT: Google Vertex 0.58 s, Anthropic 0.83 s, Bedrock 0.96 s, Azure 1.19 s (one snapshot; another showed 0.66/1.00/1.02/1.22) — [Artificial Analysis](https://artificialanalysis.ai/models/claude-4-5-haiku/providers)
- Haiku 5.5: $0.10 input / $0.50 output per MTok (≤100k prompt); Haiku 4.5: $1 / $5; Sonnet 5: $2 / $10; Batch API 50% off — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Enterprise three-class routing: TF-IDF+LR 96.01% beat frozen MiniLM+MLP 94.78% (blog, undated) — [Towards AI](https://pub.towardsai.net/rethinking-intent-routing-from-tf-idf-to-fine-tuned-transformers-257d906cbb7f)

### Inferences
- Per-route cost for a Haiku classifier call in this project: ≈$0.00007 (Haiku 5.5) to ≈$0.0007 (Haiku 4.5) assuming ~600 prompt tokens + 20 output tokens, i.e., $0.07–$0.70 per 1,000 messages; regex/embedding: effectively $0.
- Per-route latency: regex ≈0 ms; embedding ≈ one embeddings API round trip (tens of ms, provider-dependent); Haiku ≈0.6–1.8 s added before the main generation.
- For a 7-ish route space (pricing, clinics, packages, payment, photos, scheduling, other/handoff) the Haiku classifier is operating far below the 150-label regime where it was tied with RoBERTa, so its accuracy should be at least as good; the risk is latency, not accuracy.

### Gaps
- No published paraphrase-specific benchmark for hand-written regex routers.
- No semantic-router accuracy numbers from the project; the one controlled embedding-kNN number (64–75%) used a generic MiniLM encoder, not Cohere/OpenAI embeddings.
- Rodrigues & Vas do not state whether the 981 ms median was measured through the Batches API or live Messages API (bulk evaluation used Batches).

---

## Key question 2: How are misroutes detected and recovered in practice?

### Takeaway
Production systems do not try to make the router perfect; they (a) attach a confidence/uncertainty score and route below-threshold turns to a second stage or a human, (b) re-classify on every message so a wrong route lasts one turn, and (c) log route + confidence + outcome signals (failed tool calls, rephrases, thumbs-down) for offline correction.

### Cited Findings
- Decagon: "First, the agent extracts the intent, referencing the full conversation history for context. Next, it selects the right AOP to run. If no AOP matches, a fallback mechanism uses retrieval-augmented generation"; "This process repeats with each new message"; a supervisor model monitors live conversations; "escalation intents for high-risk topics" — [Decagon agent architecture](https://decagon.ai/modules/agent-architecture)
- Intercom Fin: Phase 1 checks whether a Workflow or Custom Answer should trigger and runs safety filters; if output "doesn't meet the engine's certainty parameters, Fin asks the customer to clarify"; if safety parameters fail "Fin tells the customer it cannot answer and escalates to human support"; Phase 3 validates the answer against the query and knowledge sources before sending (page dated 14 May 2026) — [Intercom help: The Fin AI Engine](https://intercom.help/intercom/en/articles/9929230-the-fin-ai-engine)
- Two-stage OOS: uncertainty estimation on a deployed in-scope classifier, high-uncertainty cases go to a fine-tuned LLM; threshold "can be tuned to route a higher or lower ratio of utterances to the LLM"; deployed system "handling tens of thousands of user interactions daily" — [Zaera et al. 2025](https://arxiv.org/abs/2507.01541)
- Voiceflow hybrid: "the LLM response is parsed to confirm if it represents a valid intent name. Failure to identify a valid intent triggers the 'NLU fallback'" (search excerpt; page now redirects) — [Voiceflow docs](https://docs.voiceflow.com/docs/llm-intent-classification-method)
- Rasa: add `FallbackClassifier` with a threshold (example 0.6) so low-confidence messages take an out-of-scope path — [Rasa forum](https://forum.rasa.com/t/handling-out-of-scope-with-threshold-values/38213)
- Patent: pick the OOS threshold that maximizes accuracy + OOS recall on labeled data, "which results in better prediction of intent than an arbitrarily selected value like 0.5" — [USPTO 11544470](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11544470); skill bots hand back to a master bot when confidence falls below threshold — [USPTO 12223276](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12223276)
- Fanar-Sadiq multi-agent QA: if LLM classification fails on low confidence (<0.5), malformed JSON, or exception, "the system seamlessly falls back to an embedding-based classifier" — [arXiv 2603.08501](https://arxiv.org/pdf/2603.08501)
- Anubuddhi: keyword router as backup, "defaulting to CHAT mode when uncertainty exists to prevent accidental design destruction" — [arXiv 2512.15736](https://arxiv.org/pdf/2512.15736)
- Confidence bands: >0.8 auto-route, 0.5–0.8 route and flag for review, <0.5 escalate; log predicted intent, confidence, tools invoked, success/failure; "failed tool calls, user corrections, thumbs-downs, and rephrased follow-ups signal misclassification"; corrected labels feed few-shot pools (secondary synthesis) — [tianpan.co, 16 Apr 2026](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers)
- Two-threshold design: abstain below a lower cutoff, escalate to a human between cutoffs, answer above; size the escalation band from reviewer capacity; 8–15% escalation "sustainable for most consumer features"; ~30% escalation is a calibration/scope warning sign; metrics: escalation yield, recovery rate, decline-with-no-redirect rate (author's judgment, 27 Apr 2026) — [tianpan.co](https://tianpan.co/blog/2026/04/27/two-threshold-problem-confidence-gated-ai)
- StableKernel: ordering confidence <70% → ask a clarification question; repeated failures → escalate to a human or alternate channel — [StableKernel 2026](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows)
- Sierra: supervisors "enforce guardrails, policies, and quality checks" on higher-agency tasks; built-in and custom supervisors; illustrative claim that a second model checking the first could lift combined accuracy from 90% to 99% — [Sierra, "Meet the AI agent engineer"](https://sierra.ai/blog/meet-the-ai-agent-engineer); [Sierra, "Constellation of models" (3 Dec 2025)](https://sierra.ai/blog/constellation-of-models)

### Inferences
- For this project the cheapest "recovery" is structural: re-route on every message (so a misroute costs one reply), always load the shared handoff/safety module regardless of route, and make the classifier's `unknown` label load a general bundle whose only tool is "hand off to human".
- The 65-message suite can serve as the misroute detector: assert the expected module set per message, and log any turn where regex and Haiku disagree.

### Gaps
- No production data on misroute rates or recovery success rates was found for any named vendor.
- Threshold values in the sources (0.5, 0.6, 0.7, 0.85) are examples, not validated defaults.

---

## Key question 3: RouteLLM and FrugalGPT cascades — real numbers, and relevance when the main model is already Haiku-class

### Takeaway
Both report large savings only relative to a GPT-4-class default (RouteLLM: 95% of GPT-4 quality at 26% GPT-4 calls; FrugalGPT: up to 98% cost reduction), require preference/training data, and assume a strong-vs-weak choice; when Haiku is already the default, the only sensible cascade is upward (Haiku → Sonnet → human) for quality, and a 2026 study warns that off-the-shelf routers often route near-constantly.

### Cited Findings
- RouteLLM blog (1 Jul 2024): "cost reductions of over 85% on MT Bench, 45% on MMLU, and 35% on GSM8K" while "achieving 95% of GPT-4's performance"; matrix-factorization router reaches 95% of GPT-4 with 26% GPT-4 calls (48% cheaper than random), 14% with LLM-judge-augmented data (75% cheaper); MMLU needs 54% GPT-4 calls (14% cheaper) only after adding ~1,500 golden-label samples; "over 40% cheaper" than Martian and Unify at equal MT Bench performance; routers generalized to Claude 3 Opus / Llama 3 8B without retraining — [LMSYS](https://lmsys.org/blog/2024-07-01-routellm/)
- RouteLLM paper abstract: savings "over 2 times in certain cases" with no quality loss; routers trained on human preference data plus augmentation — [arXiv 2406.18665](https://arxiv.org/abs/2406.18665)
- FrugalGPT (9 May 2023): LLM API fees differ by "two orders of magnitude"; cascade matches GPT-4 with "up to 98% cost reduction" or improves accuracy by 4% at the same cost; three strategies: prompt adaptation, LLM approximation, LLM cascade — [arXiv 2305.05176](https://arxiv.org/abs/2305.05176)
- Four open-source routers on RouterBench, BFCL v4, tau2-bench, WebArena (290 tasks, 2,610 candidate outcomes): "Always-Mid matches Aurelio exactly on three benchmarks and is within 0.003 of it on the fourth"; three of four routers "output constant or nearly constant tier assignments"; gains "track the composition of selected tiers" — [Kumar & Saminathan 2026](https://arxiv.org/abs/2608.14641)
- Sierra runs "15+" models per agent, assigns models per task (retrieval, classification, tool use, policy, tone), fails over across providers on latency/error-rate degradation — [Sierra, 3 Dec 2025](https://sierra.ai/blog/constellation-of-models)
- Current Anthropic prices: Haiku 5.5 $0.10/$0.50, Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Sonnet 5.5 $2/$10 per MTok in/out — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Inferences
- A Haiku 5.5 → Sonnet 5 escalation is a 20× input-price step; if ≤10% of turns escalate, blended cost roughly triples from a near-zero base, which is still cents over the suite. The decision should rest on the deterministic-check pass rate on escalated turns, not on cost.
- RouteLLM's requirement for preference data and the 2026 "constant tier" finding both argue against installing a learned model router in a 10-hour build.

### Gaps
- No published cascade result uses a Haiku-class model as the cheap tier and Sonnet as the expensive tier.
- RouteLLM's generalization to Claude/Llama pairs is stated without figures.

---

## Key question 4: How production support bots (Intercom Fin, Sierra, Decagon, Ada, Zendesk) detect intent before answering

### Takeaway
All five publish only coarse architecture: Decagon runs intent extraction → procedure (AOP) selection → RAG fallback on every message; Intercom Fin runs a "refine query" phase that checks workflow/custom-answer triggers and safety before RAG and then a validation pass; Sierra splits classification into its own task with supervisors; Zendesk uses per-account intent models with admin tooling; Ada describes a unified "Reasoning Engine" with no method detail. None publishes intent-detection accuracy.

### Cited Findings
- Decagon: intent extracted from full conversation history → "selects the right AOP to run" → RAG fallback if no AOP matches → repeats each message; supervisor model for safety; AOPs are "natural language instructions backed by code" — [Decagon agent architecture](https://decagon.ai/modules/agent-architecture); AOPs framed as replacing brittle decision trees (Apr 2025) — [Decagon, "Why we built AOP"](https://decagon.ai/blog/why-we-built-aop)
- Intercom Fin (page dated 14 May 2026): Phase 1 "Refine query" rewrites the message, checks whether a Workflow or Custom Answer should trigger, runs safety checks; Phase 2 RAG (retrieval over articles, past conversations, PDFs, URLs, customer data, actions); Phase 3 "Validate accuracy" against query and sources; clarifies when certainty parameters unmet; escalates when safety parameters unmet; "industry-high resolutions" claimed without figures; no separate intent classifier named — [Intercom help](https://intercom.help/intercom/en/articles/9929230-the-fin-ai-engine)
- Intercom retrieval detail (Sep 2025): conversation summarized into a short query; vector retrieval; top K=40 reranked by a custom reranker; context budget filter — [fin.ai research, "Finetuning retrieval for Fin"](https://fin.ai/research/finetuning-retrieval-for-fin/)
- Intercom/OpenAI case study: GPT-4.1 handled Fin Tasks "on its own with high reliability and lower latency" vs the planned retrieval stack; "third major iteration" of the architecture; routes each request to the best model (vendor case study) — [OpenAI customer story](https://openai.com/nl-NL/index/intercom/)
- Sierra (3 Dec 2025): agents assembled from retrieval, classification, tool use, policy, tone tasks; classification tasks "need highly consistent outputs"; orchestration/routing "handled automatically under the hood"; "15+" models; no accuracy or latency figures — [Sierra](https://sierra.ai/blog/constellation-of-models)
- Zendesk intelligent triage: account-specific models for intent, language, sentiment (Sep 2022 launch, no accuracy metrics) — [BusinessWire](https://www.businesswire.com/news/home/20220913006115/en); AI-suggested intents (Jul 2025) and "intent quality recommendations" flagging overlapping/duplicate intents (rollout 22–23 Jan 2026) — [Zendesk support](https://support.zendesk.com/hc/en-us/articles/10198478867994-Announcing-intent-quality-recommendations-in-intelligent-triage)
- Ada (18 Feb 2026): "unified Reasoning Engine" as a single intelligence layer across channels; instruction written once applies to all channels; no technical detail on intent detection — [Ada press release](https://www.ada.cx/media-center/press-release/ada-launches-industrys-first-unified-reasoning-engine/)

### Inferences
- Every vendor that describes its pipeline puts a cheap decision ("which procedure/workflow applies, or none") before generation and re-runs it per message — the same shape as the hybrid in Card 4. Decagon's AOP-per-intent is the closest analogue to "load only the rule module this message needs".
- Zendesk's new "overlapping intents" tooling is indirect evidence that intent-space design (non-overlapping routes) is where production teams spend effort.

### Gaps
- No vendor publishes intent-classification accuracy, latency, or misroute rates.
- Ada's "Thinker/Talker" dual-model claim appears only on a review site and is unconfirmed.

---

## Key question 5: Evidence that long prompts hurt quality, not just cost — quantitative findings

### Takeaway
Four independent lines of evidence: position (Lost in the Middle: >20-point drop, worst case below closed-book), pure length (Levy 2024: 0.92→0.68 from ~250 to ~3,000 tokens, visible past 500), distractors/focus (Context Rot: ~300-token focused prompts beat ~113k-token full prompts on all 18 models; one distractor already hurts), and instruction count (IFScale: claude-3.5-haiku 98%→43% from 10 to 100 instructions; ManyIFEval: consistent decline to 10 instructions; SCALEDIF: conflicts grow with count).

### Cited Findings
- Lost in the Middle: GPT-3.5-Turbo closed-book 56.1%, oracle 88.3%; Claude-1.3 48.3% / 76.1%; multi-document QA "can drop by more than 20%" when the relevant document is mid-context, "in the worst case" below closed-book; U-shaped curve across GPT-3.5-Turbo (4K, 16K), Claude-1.3 (8K, 100K), LongChat-13B, MPT-30B; query-aware contextualization helps key-value retrieval but only "∼1.5% for GPT-3.5-Turbo and ∼1% for claude-1.3" on QA; evaluated at 10, 20, 30 documents — [Liu et al. 2023, PDF](https://arxiv.org/pdf/2307.03172); [abstract](https://arxiv.org/abs/2307.03172)
- Same Task, More Tokens: FLenQA; lengths ~250, 500, 1,000, 2,000, 3,000 tokens; "drop in accuracy from 0.92 to 0.68"; degradation "as length increase beyond 500 tokens"; models GPT-4, GPT-3.5, Gemini Pro, Mistral Medium, Mixtral 8x7B (all >0.89 at minimal length); CoT "does not mitigate the degradation" in most models; key paragraphs placed last often scores highest; next-word accuracy correlates negatively with reasoning accuracy — [Levy et al. 2024, PDF](https://arxiv.org/pdf/2402.14848); [abstract](https://arxiv.org/abs/2402.14848)
- Context Rot (14 Jul 2025): 18 models (5 Anthropic, 7 OpenAI, 3 Google, 3 Qwen3), 194,480 NIAH calls; lower needle-question similarity degrades faster with length; "even one distractor reduced performance, and four compounded the drop"; Claude models lowest hallucination, GPT highest; shuffled haystacks beat coherent ones on all 18 models; LongMemEval 306 prompts: full ≈113k tokens vs focused ≈300 tokens, "focused prompts scored significantly higher across all models", Claude's gap largest and "driven largely by abstentions"; repeated-words task degraded with length on all models — [Chroma](https://www.trychroma.com/research/context-rot)
- IFScale (15 Jul 2025): 20 models, 500 keyword-inclusion instructions in a report task; best models 68% at 500; accuracy at 10/50/100/250/500: o3 100/99.6/98.2/97.8/62.8; gpt-4.1 98.0/98.8/95.4/74.0/48.9; claude-3.7-sonnet 100/99.6/94.8/72.9/52.7; claude-sonnet-4 100/98.0/94.4/77.2/42.9; gemini-2.5-pro 100/99.6/98.4/84.8/68.9; gemini-2.5-flash 100/96.0/82.0/50.7/34.2; claude-3.5-haiku 98.0/78.0/43.4/16.6/8.5; llama-4-scout 100/54.4/27.2/9.3/6.7; three patterns (threshold decay: gemini-2.5-pro, o3; linear: gpt-4.1, claude-3.7-sonnet; exponential with 7–15% floors: claude-3.5-haiku, llama-4-scout); primacy bias peaks at 150–200 instructions; omission errors dominate; general-purpose model latency flat (claude-3.5-haiku 9.32–10.54 s) while reasoning models balloon (o4-mini 12.40 s → 436.19 s at 250) — [arXiv HTML](https://arxiv.org/html/2507.11538); [abstract](https://arxiv.org/abs/2507.11538)
- ManyIFEval (up to 10 instructions) / StyleMBPP (up to 6): 10 LLMs; performance "consistently degrades as the number of instructions increases"; logistic regression on instruction count predicts performance within ~10% error on unseen combinations (EMNLP 2025) — [Harada et al. 2025](https://arxiv.org/abs/2509.21051)
- SCALEDIF (Oct 2025): attributes much of the decline to "tension and conflict that arise between instructions as their number grows"; proposes a conflict-scoring tool — [arXiv 2510.14842](https://arxiv.org/abs/2510.14842v1)
- Commey 2026: five prompt conditions × 30-case suites on Llama 3 8B and Qwen 2.5 7B; "generic prompt additions do not produce monotonic improvements"; appending generic rules dropped Qwen RAG from 26/30 to 9/30 — [arXiv 2601.22025](https://arxiv.org/abs/2601.22025)
- Practitioner post (2 May 2026): anecdote of a 4,000-token prompt cut to 200 tokens scoring four eval points higher; claims "reasoning degradation starting around 3,000 tokens" without naming a study — [tianpan.co](https://tianpan.co/blog/2026/05/02/200-token-system-prompt-beats-4000-token-one) (opinion; numbers unverified)

### Inferences
- A 25k-token prompt is ~8× past the length where Levy et al. saw degradation begin and well into the IFScale density where claude-3.5-haiku was below 50% — the monolith plausibly costs more in missed rules than in dollars.
- Context Rot's distractor result maps directly to problem 3: rules for a second product line are distractors for the first.
- IFScale's primacy bias suggests the rules at the end of an 800-line prompt are the most likely to be ignored; ordering within a module still matters after decomposition.

### Gaps
- None of the studies used a current Haiku (4.5/5.5) or a chat/SMS policy-following task; the ~3,000-token "degradation threshold" quoted in blogs has no primary source beyond Levy's FLenQA range.
- No 2026 benchmark isolates system-prompt length as the only variable.

---

## Key question 6: Prompt caching — stable prefix / dynamic suffix, hit rates, savings, what silently breaks it

### Takeaway
Both providers cache by exact prefix match in the order tools → system → messages, so the pattern is: freeze tool definitions and shared rules, put the breakpoint on the last stable block, append route-specific rules and conversation after it; reads cost 0.1× (pays off after one read), but Haiku 4.5 silently skips prompts under 4,096 tokens, 5-minute TTLs lapse between SMS replies, and any timestamp, tool edit, key-order change, or image toggle resets the cache.

### Cited Findings
- Anthropic pricing multipliers: 5-min write 1.25×, 1-hour write 2×, read 0.1× (0.05× on Opus/Sonnet 5.5; 0.025× on Fable/Mythos 5.1); "caching pays off after one cache read"; Haiku 5.5 $0.10 base / $0.125 write / $0.20 1h-write / $0.01 read; Haiku 4.5 $1 / $1.25 / $2 / $0.10 — [Anthropic prompt caching docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching); [pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Minimum cacheable prompt: 512 tokens (Haiku 5.5, Sonnet 5.5, Opus 5/5.5, Fable/Mythos); 1,024 (Sonnet 5, 4.6, 4.5, Opus 4/4.1/4.8); 2,048 (Haiku 3.5, Opus 4.7); 4,096 (Haiku 4.5, Opus 4.5/4.6); "shorter prompts are processed without caching and no error is returned" — [Anthropic docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
- Up to 4 breakpoints, free; prefix hash checked at the breakpoint then backward up to 20 blocks; default 5-min TTL refreshed on each use, clock starts at request start; 1-hour TTL via `ttl: "1h"`; prefix order tools → system → messages; "place the breakpoint on the last block that is identical across requests… not on a block that changes every request, such as a timestamp or the incoming user message" — [Anthropic docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
- Invalidation: any tool-definition change (names, descriptions, parameters) invalidates tools+system+messages; `tool_choice` and adding/removing images invalidate tools and system; web-search/citations toggles and speed setting invalidate tools; thinking parameters and `output_config.effort` are model-specific; "Keys in `tool_use` input blocks should have stable ordering. Some languages randomize key order during JSON conversion, which breaks caches." — [Anthropic docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
- Usage fields: `cache_read_input_tokens`, `cache_creation_input_tokens`; `input_tokens` counts only tokens after the last breakpoint; both cache fields at 0 means not cached, "most likely because it was below the minimum length"; batch requests get cache hits "on a best-effort basis" — [Anthropic docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
- Recommended four-breakpoint layout: tools / reusable instructions / RAG context / conversation history; "in most cases, a single cache breakpoint at the end of your static content is sufficient" — [Anthropic docs FAQ](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
- Launch benchmarks: "up to 90%" cost and "up to 85%" latency reduction; 100k-token book chat 11.5 s → 2.4 s (-79%), -90% cost; 10k-token many-shot 1.6 s → 1.1 s (-31%), -86% cost; 10-turn conversation with long system prompt ~10 s → ~2.5 s (-75%), -53% cost; GA 17 Dec 2024 — [claude.com blog](https://claude.com/blog/prompt-caching)
- OpenAI: automatic longest-prefix matching; GPT-5.6+ minimum 1,024 visible input tokens, reads 0.1× (0.05× GPT-6.1 Sol), writes 1.25×, "up to 95%" discount, 30-min TTL (`prompt_cache_options.ttl: "30m"`), explicit `prompt_cache_breakpoint` and `prewarm`; earlier models: in-memory 5–10 min (up to 1 h), `24h` retention option, `cached_tokens` rounded to 128, stable `prompt_cache_key` with ~15 requests/min per key before overflow routing — [OpenAI docs](https://developers.openai.com/api/docs/guides/prompt-caching)
- OpenAI breakers: changing `model`, `tools`, `parallel_tool_calls`, `text.format`, `reasoning.effort`, `text.verbosity`, `context_management`; summarization/compaction/truncation that rewrites the prefix; extending an existing message instead of appending; dynamic content before static; cached tokens still count toward TPM limits; no manual cache clearing — [OpenAI docs](https://developers.openai.com/api/docs/guides/prompt-caching)
- Field case (secondary): security-intelligence agent at 7% hit rate despite a repeated 4,000-token prefix; moving one dynamic identifier from mid-prompt to the end raised hits to 74% and cut monthly inference cost 59% (DigitalOcean tutorial, 24 Jul 2026 per index; body not retrievable) — [DigitalOcean](https://www.digitalocean.com/community/tutorials/prompt-caching-in-practice-hit-rate); same 7%→74% repeated by [agentmarketcap (16 Apr 2026)](https://agentmarketcap.ai/blog/2026/04/16/prompt-cache-hit-rate-engineering-agent-cost-reduction); a third post says 84% — [undercodetesting](https://undercodetesting.com/how-a-7-cache-hit-rate-nearly-bankrupted-our-llm-the-59-cost-cut-fix-you-need-video/) (conflict)
- Vendor/blog claims of "80–95%" typical hit rates and "76% total API cost reduction at a 95% hit rate" (unaudited) — [gmicloud blog](https://www.gmicloud.ai/en/blog/prompt-caching-in-production-how-to-cut-inference-costs-by-60-to-90-percent-for-repeated-contexts); [introl blog](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025)

### Inferences
- For this project the cache prefix must be identical across routes to get one shared entry: keep all 14 tool definitions in every request in the same order (use OpenAI-style `tool_choice`/allowed lists or just prompt text to restrict), put shared persona + handoff + safety rules next, then a breakpoint, then the route-specific module and the conversation. Per-route tool subsets mean per-route cache entries, each needing its own first write and its own ≥512/4,096-token minimum.
- Low-volume SMS makes the 5-minute TTL the main hit-rate limiter; the 65-message suite run back-to-back will overstate real-world hit rate. Report both "suite hit rate" and "expected hit rate at the real inter-message gap".
- If the team stays on Haiku 4.5, a per-route bundle must stay ≥4,096 tokens to cache at all, which conflicts with trimming; on Haiku 5.5 (512-token minimum) trimmed bundles cache fine.
- Silent breakers most likely in a TypeScript build: a `new Date()` in the system prompt, `JSON.stringify` of tool schemas built from object spreads in varying order, conditionally included tools, and conversation summarization that rewrites earlier turns.

### Gaps
- No primary (vendor-published) hit-rate distribution for support bots; all hit-rate numbers are blog or secondary.
- The OpenAI launch post (HTTP 403) was not read; current docs were used instead.
- Anthropic docs state no latency figure beyond the launch benchmarks.

---

## Direct answers to the key questions

1. **Regex vs embedding vs small-LLM.** Regex: ~0 ms, $0, no published paraphrase accuracy; lexical baselines score 80.9% on CLINC150 but only 36% OOS recall. Embedding (semantic-router): project publishes no accuracy/latency; independent MiniLM-kNN got 64–75% on CLINC150; OOD handling rated "only moderate". Haiku zero-shot: 88.5% CLINC150 (tied with fine-tuned RoBERTa), 85.6% OOS recall, 92.5% under heavy noise, median 981 ms / p95 1.8 s, ≈$0.25/1K calls at Haiku 4.5 list price (≈$0.07/1K on Haiku 5.5 for a short route prompt). Sources: [Rodrigues & Vas 2026](https://arxiv.org/abs/2608.20371), [Šléher et al. 2025](https://arxiv.org/abs/2505.14524).
2. **Misroute detection/recovery.** Confidence/uncertainty thresholds with a fallback stage (LLM, RAG, or human); re-classification on every message; validation of the LLM's label against the allowed set; logging route + confidence + failed tool calls / rephrases for offline correction; two thresholds (abstain vs escalate) sized from human capacity. Sources: [Zaera et al. 2025](https://arxiv.org/abs/2507.01541), [Decagon](https://decagon.ai/modules/agent-architecture), [Intercom](https://intercom.help/intercom/en/articles/9929230-the-fin-ai-engine), [Voiceflow](https://docs.voiceflow.com/docs/llm-intent-classification-method).
3. **RouteLLM/FrugalGPT.** 95% of GPT-4 quality at 26% (or 14%) GPT-4 calls; up to 98% cost reduction — all relative to a GPT-4 default and needing preference data. Not relevant as cost savers when Haiku is the default; relevant only inverted as a quality escalation (Haiku → Sonnet → human). A 2026 audit found three of four open-source routers route near-constantly. Sources: [LMSYS](https://lmsys.org/blog/2024-07-01-routellm/), [FrugalGPT](https://arxiv.org/abs/2305.05176), [Kumar & Saminathan 2026](https://arxiv.org/abs/2608.14641).
4. **Production bots.** Decagon: intent → AOP → RAG fallback, per message. Intercom Fin: refine-query phase (workflow/custom-answer triggers + safety) → RAG → validation; clarify on low certainty, escalate on safety failure. Sierra: classification as a separate task with supervisors, 15+ models. Zendesk: per-account intent models plus overlap-detection tooling (Jan 2026). Ada: "Reasoning Engine" with no method detail. No accuracy numbers from any of them.
5. **Long prompts hurt quality.** Lost in the Middle: >20-point drop, worst case below 56.1% closed-book. Levy 2024: 0.92→0.68 from ~250→3,000 tokens, degrading past 500. Context Rot: ~300-token focused prompts beat ~113k-token prompts on all 18 models; one distractor already hurts. IFScale: claude-3.5-haiku 98%→78%→43% at 10→50→100 instructions; gpt-4.1 still 95% at 100. ManyIFEval: consistent decline to 10 instructions. SCALEDIF: conflicts drive it.
6. **Prompt caching.** Anthropic: 1.25× write, 0.1× read, pays off after one read, 4 breakpoints, 20-block lookback, 5-min/1-h TTL, min 512 tokens on Haiku 5.5 but 4,096 on Haiku 4.5; breaks on tool edits, `tool_choice`, images, thinking params, JSON key order, timestamps. OpenAI: 1,024-token minimum, 0.1× reads on GPT-5.6+, 30-min TTL, `prompt_cache_key`, breaks on tools/model/format/effort changes and on rewriting earlier turns. Launch numbers: -53% cost / -75% TTFT for a 10-turn long-system-prompt chat. Field: 7%→74% hit rate by moving one dynamic ID to the end (secondary).
7. **Is "rules first, classifier fallback" a known pattern?** Yes. It appears as uncertainty-based routing ([Arora et al., EMNLP 2024](https://arxiv.org/abs/2410.01627): within 2% of LLM accuracy at 50% less latency; [Zaera et al., 2025](https://arxiv.org/abs/2507.01541): deployed at tens of thousands of interactions/day), as NLU-first/LLM-fallback in Voiceflow and Rasa, as keyword/embedding backups in multi-agent systems ([Fanar-Sadiq](https://arxiv.org/pdf/2603.08501), [Anubuddhi](https://arxiv.org/pdf/2512.15736)), and as "rules for structurally knowable turns, LLM for the rest" in vendor guidance ([StableKernel](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows)). The specific ordering "regex first, then LLM" has no controlled benchmark; the literature's measured version puts a cheap classifier first.

---

## Table of every quantitative claim

### Takeaway
Every number cited above, with its source and date, for the report writer's reference.

### Cited Findings

| # | Claim | Number | Source (date, type) |
|---|---|---|---|
| 1 | RoBERTa vs Claude Haiku 4.5 zero-shot, CLINC150 accuracy | 89.1 vs 88.5 (p=0.24) | [Rodrigues & Vas, arXiv 2608.20371](https://arxiv.org/abs/2608.20371) (19 Jun 2026, preprint) |
| 2 | RoBERTa vs Claude, ATIS accuracy | 95.9 vs 84.1 (+11.8, p=2×10^-4) | same |
| 3 | TF-IDF+LR accuracy, ATIS / CLINC150 | 95.2 / 80.9 | same |
| 4 | Sentence-embedding kNN (MiniLM), CLINC150 full / 5-shot | 75.1 / 64.2 | same |
| 5 | OOS recall, CLINC150: Claude / RoBERTa / TF-IDF | 85.6 / 58.1 / 36.4 | same |
| 6 | Accuracy at 0 dB SNR (WER 28.9%): TF-IDF / Claude | 80.0 / 92.5 | same |
| 7 | Claude Haiku classification latency (1,000 calls) | median 981 ms, p95 1,787 ms | same |
| 8 | Claude Haiku classification cost | $0.25 per 1K calls (list price) | same |
| 9 | Schema-swap: RoBERTa on unseen app / LLM on both apps | 0% / ~94% | same |
| 10 | Guarded Query Routing: WideMLP accuracy / latency | ~88% / <4 ms | [Šléher et al., arXiv 2505.14524](https://arxiv.org/abs/2505.14524) (May 2025, rev. Oct 2025, preprint) |
| 11 | fastText accuracy / latency | ~80% / <1 ms | same |
| 12 | LLM router accuracy; latency local Llama-3.1-8B / remote GPT-4o-mini | ~91%; 62 ms / 669 ms | same |
| 13 | Hybrid SetFit+LLM uncertainty routing | within 2% of LLM accuracy, 50% less latency | [Arora et al., arXiv 2410.01627](https://arxiv.org/abs/2410.01627) (2 Oct 2024, EMNLP Industry) |
| 14 | Mistral-7B OOS gain from two-step method | >5% accuracy and F1 | same |
| 15 | Deployed in-scope classifier scale | tens of thousands of interactions/day | [Zaera et al., arXiv 2507.01541](https://arxiv.org/abs/2507.01541) (2 Jul 2025) |
| 16 | semantic-router default threshold / aggregation / top_k | 0.5 / sum / 5 | [Aurelio docs](https://docs.aurelio.ai/semantic-router/user-guide/features/threshold-optimization); [readthedocs](https://semantic-router.readthedocs.io/en/latest/_autosummary/semantic_router.layer.RouteLayer.html) (undated, docs) |
| 17 | semantic-router per-decision latency (unverified aggregator) | ~4 ms vs ~3.9 s LLM TTFT | [everydev.ai](https://www.everydev.ai/tools/semantic-router/llms.txt) (2026, aggregator) |
| 18 | Open-weight zero-shot intent study scale | 41 models, 15 families, 135M–9B, 9 datasets | [Ganesh et al., arXiv 2607.27421](https://arxiv.org/abs/2607.27421) (29 Jul 2026) |
| 19 | Aurelio router vs Always-Mid baseline | exact match on 3/4 benchmarks, within 0.003 on 4th | [Kumar & Saminathan, arXiv 2608.14641](https://arxiv.org/abs/2608.14641) (28 Jul 2026) |
| 20 | Classifier/keyword pass; in-memory rule; DB rule; LLM stage latency | 5–15 ms; <10 ms; 10–150 ms; 300–600 ms | [StableKernel](https://stablekernel.com/blogs/llms-versus-rules-enterprise-voice-flows) (7/01/26, vendor blog) |
| 21 | Deterministic turns share in QSR flows | 40–60% | same |
| 22 | Cascade stage latencies (secondary) | keyword sub-ms; embedding 16–100 ms; classifier 50–200 ms; LLM 1–5 s | [tianpan.co](https://tianpan.co/blog/2026/04/16/intent-classification-agent-routers) (16 Apr 2026, blog) |
| 23 | Confidence bands (practitioner) | >0.8 auto; 0.5–0.8 flag; <0.5 escalate | same |
| 24 | Sustainable escalation rate; warning level | 8–15%; ~30% | [tianpan.co](https://tianpan.co/blog/2026/04/27/two-threshold-problem-confidence-gated-ai) (27 Apr 2026, opinion) |
| 25 | Haiku 4.5 non-reasoning TTFT by provider | 0.58–1.19 s (medians) | [Artificial Analysis](https://artificialanalysis.ai/models/claude-4-5-haiku/providers) (rolling) |
| 26 | Haiku 5.5 price in/out; cache write/read | $0.10/$0.50; $0.125/$0.01 per MTok | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) (current) |
| 27 | Haiku 4.5 price in/out; cache write/read | $1/$5; $1.25/$0.10 per MTok | same |
| 28 | Sonnet 5 / 5.5 price in/out | $2/$10 | same |
| 29 | Batch API discount | 50% | same |
| 30 | RouteLLM MT Bench: 95% of GPT-4 with X% GPT-4 calls | 26% (Arena data); 14% (augmented) | [LMSYS blog](https://lmsys.org/blog/2024-07-01-routellm/) (1 Jul 2024) |
| 31 | RouteLLM cost reductions MT Bench / MMLU / GSM8K | >85% / 45% / 35% | same |
| 32 | RouteLLM vs Martian/Unify | same quality, >40% cheaper | same |
| 33 | RouteLLM MMLU GPT-4 calls needed | 54% (after ~1,500 golden labels) | same |
| 34 | RouteLLM paper headline | "over 2×" cost reduction | [arXiv 2406.18665](https://arxiv.org/abs/2406.18665) (Jun 2024, rev. Feb 2025) |
| 35 | FrugalGPT cost reduction / accuracy gain | up to 98% / +4% | [arXiv 2305.05176](https://arxiv.org/abs/2305.05176) (9 May 2023) |
| 36 | Sierra models per agent | 15+ | [Sierra blog](https://sierra.ai/blog/constellation-of-models) (3 Dec 2025) |
| 37 | Sierra illustrative supervisor gain | 90% → 99% | [Sierra blog](https://sierra.ai/blog/meet-the-ai-agent-engineer) (undated) |
| 38 | Intercom Fin reranker candidates | top K=40 | [fin.ai research](https://fin.ai/research/finetuning-retrieval-for-fin/) (Sep 2025) |
| 39 | Lost in the Middle: GPT-3.5-Turbo closed-book / oracle | 56.1% / 88.3% | [Liu et al., arXiv 2307.03172](https://arxiv.org/pdf/2307.03172) (Jul 2023, TACL) |
| 40 | Lost in the Middle: mid-context drop | >20 points; worst case below closed-book | same |
| 41 | Query-aware contextualization gain on QA | ~1.5% GPT-3.5-Turbo, ~1% Claude-1.3 | same |
| 42 | Same Task, More Tokens: accuracy drop | 0.92 → 0.68 (~250 → ~3,000 tokens) | [Levy et al., arXiv 2402.14848](https://arxiv.org/pdf/2402.14848) (Feb 2024, ACL 2024) |
| 43 | Degradation onset | beyond 500 tokens | same |
| 44 | Context Rot: models / NIAH calls | 18 / 194,480 | [Chroma](https://www.trychroma.com/research/context-rot) (14 Jul 2025, tech report) |
| 45 | LongMemEval focused vs full prompt length | ~300 vs ~113k tokens; focused "significantly higher" on all models | same |
| 46 | Distractors | 1 reduces; 4 compound | same |
| 47 | IFScale: models / max instructions / best at max | 20 / 500 / 68% | [Jaroslawicz et al., arXiv 2507.11538](https://arxiv.org/abs/2507.11538) (15 Jul 2025) |
| 48 | IFScale claude-3.5-haiku at 10/50/100/250/500 | 98.0/78.0/43.4/16.6/8.5% | [arXiv HTML](https://arxiv.org/html/2507.11538) |
| 49 | IFScale gpt-4.1 | 98.0/98.8/95.4/74.0/48.9% | same |
| 50 | IFScale claude-sonnet-4 | 100/98.0/94.4/77.2/42.9% | same |
| 51 | IFScale gemini-2.5-pro / o3 | 100/99.6/98.4/84.8/68.9 ; 100/99.6/98.2/97.8/62.8 | same |
| 52 | IFScale gemini-2.5-flash / llama-4-scout | 100/96.0/82.0/50.7/34.2 ; 100/54.4/27.2/9.3/6.7 | same |
| 53 | IFScale latency: claude-3.5-haiku; o4-mini | 9.32–10.54 s flat; 12.40 s → 436.19 s at 250 | same |
| 54 | IFScale primacy bias peak | 150–200 instructions | same |
| 55 | ManyIFEval / StyleMBPP scale; estimator error | 10 LLMs; ≤10 / ≤6 instructions; ~10% | [Harada et al., arXiv 2509.21051](https://arxiv.org/abs/2509.21051) (25 Sep 2025, EMNLP 2025) |
| 56 | Generic rules appended, Qwen 2.5 RAG | 26/30 → 9/30 | [Commey, arXiv 2601.22025](https://arxiv.org/abs/2601.22025) (Jan 2026, rev. Jun 2026) |
| 57 | Anthropic cache multipliers | write 1.25× (5m) / 2× (1h); read 0.1× | [Anthropic docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) (current) |
| 58 | Anthropic min cacheable tokens: Haiku 5.5 / Haiku 4.5 / Haiku 3.5 | 512 / 4,096 / 2,048 | same |
| 59 | Breakpoints; lookback | 4; 20 blocks | same |
| 60 | TTL | 5 min default; 1 h option | same |
| 61 | Launch benchmark: 10-turn long-system-prompt chat | ~10 s → ~2.5 s (-75%); -53% cost | [claude.com blog](https://claude.com/blog/prompt-caching) (page 14 Aug 2025; GA 17 Dec 2024) |
| 62 | Launch benchmark: 100k book chat; 10k many-shot | 11.5→2.4 s, -90% cost; 1.6→1.1 s, -86% cost | same |
| 63 | Launch headline | up to 90% cost, up to 85% latency | same |
| 64 | OpenAI min tokens; read/write multipliers (GPT-5.6+) | 1,024; 0.1× / 1.25× | [OpenAI docs](https://developers.openai.com/api/docs/guides/prompt-caching) (current) |
| 65 | OpenAI TTL | 30 min (GPT-5.6+); 5–10 min up to 1 h / 24 h option (earlier) | same |
| 66 | OpenAI requests per `prompt_cache_key` before overflow | ~15/min | same |
| 67 | Field hit-rate case | 7% → 74%; -59% monthly cost (secondary; one source says 84%) | [DigitalOcean](https://www.digitalocean.com/community/tutorials/prompt-caching-in-practice-hit-rate) (24 Jul 2026, body unavailable); [agentmarketcap](https://agentmarketcap.ai/blog/2026/04/16/prompt-cache-hit-rate-engineering-agent-cost-reduction) |
| 68 | Vendor-blog hit-rate claims (unaudited) | 80–95% typical; 76% cost cut at 95% hits | [gmicloud](https://www.gmicloud.ai/en/blog/prompt-caching-in-production-how-to-cut-inference-costs-by-60-to-90-percent-for-repeated-contexts); [introl](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025) |
| 69 | Derived: 25k-token prompt per message, Haiku 5.5 uncached / cached | ≈$0.0025 / ≈$0.00025 | computed from [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| 70 | Derived: same on Haiku 4.5 | ≈$0.025 / ≈$0.0025 | computed from pricing |
| 71 | Derived: Haiku route-classifier call (~600 in, 20 out) | ≈$0.00007 (5.5) / ≈$0.0007 (4.5) | computed from pricing |

### Inferences
- Rows 69–71 are arithmetic from list prices, not measurements; they should be re-derived if the team's actual prompt sizes differ.

### Gaps
- No primary number for semantic-router accuracy or latency, regex-router paraphrase accuracy, vendor intent-detection accuracy, or audited cache hit rates.
