# Traceability/observability for LLM agents and sub-agent patterns for a reply-drafting bot

Scope note: this covers (a) per-reply tracing and attributing an output to the prompt section/rule that produced it, and (b) when sub-agents help or hurt a single-reply SMS bot. Of the owners' numbered problems, only (2) "trace cannot show which part of the prompt produced a wrong reply" and (4) "a subtask such as inspecting call logs cannot be handed to a sub-agent" were described to me; cards are tagged with those two numbers and I do not guess at 1, 3, 5-8. All pages were accessed 2026-10-11; "undated" means the page shows no publication date.

## KQ1. OpenTelemetry GenAI semantic conventions: standard spans/attributes, and is there a convention for "instructions loaded" or prompt-section attribution?

### Takeaway
OTel GenAI conventions (still "Development" status, not stable) define three span types relevant here: inference spans (`chat {model}`), tool spans (`execute_tool {tool}`), and agent spans (`invoke_agent {agent}`), with system instructions and messages as Opt-In content attributes. There is no standard attribute for "which prompt sections/rules were loaded" or for prompt version; the only standardized notion of prompt provenance is OpenInference's `llm.prompt_template.version` and its `PROMPT` span kind, so section-level attribution must be custom attributes.

### Cited Findings
- The opentelemetry.io GenAI pages (`/docs/specs/semconv/gen-ai/gen-ai-spans/`, `/gen-ai-agent-spans/`) now only say the GenAI conventions "have moved to the OpenTelemetry GenAI semantic conventions repository" and are "no longer maintained in this repository"; the new repo's docs path I tried returned 404, so the findings below come from the tagged v1.36.0/v1.37.0 snapshots of the old repo. — [opentelemetry.io gen-ai-spans (redirect notice)](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/); [new repo](https://github.com/open-telemetry/semantic-conventions-genai) (accessed 2026-10-11)
- Operation names (`gen_ai.operation.name`): `chat`, `create_agent`, `embeddings`, `execute_tool`, `generate_content`, `invoke_agent`, `text_completion`; custom values allowed. Whole document is marked Development; only `error.type`, `server.address`, `server.port` are Stable. — [semconv v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (2025 tag, spec)
- Span naming: inference span = `{gen_ai.operation.name} {gen_ai.request.model}`; tool span = `execute_tool {gen_ai.tool.name}` (kind INTERNAL); agent spans = `invoke_agent {gen_ai.agent.name}` / `create_agent {gen_ai.agent.name}` (kind CLIENT). — [v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md); [v1.36.0 gen-ai-agent-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.36.0/docs/gen-ai/gen-ai-agent-spans.md) (2025 tags, spec)
- Inference span attributes (v1.37.0): Required `gen_ai.operation.name`, `gen_ai.provider.name` (v1.36.0 used `gen_ai.system` instead); Conditionally Required `error.type`, `gen_ai.conversation.id` (when available), `gen_ai.output.type`, `gen_ai.request.choice.count`, `gen_ai.request.model`, `gen_ai.request.seed`, `server.port`; Recommended `gen_ai.response.finish_reasons`, `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.temperature`, `gen_ai.request.max_tokens`, etc.; Opt-In `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`. — [v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (spec)
- v1.36.0 did not define `gen_ai.system_instructions` / `gen_ai.input.messages` / `gen_ai.output.messages`; it recorded inputs/outputs as events on the span instead. So the whole-system-prompt attribute is a 2025 addition. — [v1.36.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.36.0/docs/gen-ai/gen-ai-spans.md) (spec)
- Execute-tool span attributes: `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.description` (all Recommended), `gen_ai.tool.type` (v1.37.0 only), `error.type`. — [v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (spec)
- Agent span attributes: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description` (Conditionally Required when the app provides them), `gen_ai.conversation.id` ("Unique identifier for a conversation (session or thread)"), `gen_ai.data_source.id` ("Identifier of the data source used for grounding"), plus the usual request/usage attributes on `invoke_agent`. — [v1.36.0 gen-ai-agent-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.36.0/docs/gen-ai/gen-ai-agent-spans.md) (spec)
- Content capture guidance: messages are "likely to contain sensitive information including user/PII data"; instrumentations "should not capture them by default but should offer an opt-in"; apps "can also store content externally and record references on spans." — [v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (spec)
- No attribute for prompt version, prompt section, rule id, or "instructions loaded" exists in the OTel GenAI spans or agent spans at v1.36.0/v1.37.0; `gen_ai.system_instructions` is a single opaque blob. — [v1.37.0 gen-ai-spans.md](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (spec, absence confirmed by reading the attribute tables)
- OpenInference (Arize's OTel-based convention, used by Phoenix) defines `llm.prompt_template.template` ("String template used to generate prompts"), `llm.prompt_template.variables` (JSON string), `llm.prompt_template.version` ("Version of the prompt template"), plus `llm.input_messages.<i>.message.role/content`, `llm.output_messages`, `llm.tools.<i>.tool.name/description/json_schema`, `tool_call.function.name/arguments`, `tool_call.id`, `session.id`, `user.id`, `metadata` (JSON string), `tag.tags`. — [OpenInference semantic_conventions.md](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (main branch, accessed 2026-10-11, spec)
- OpenInference span kinds (`openinference.span.kind`): `LLM`, `TOOL`, `AGENT` ("A reasoning block that encompasses LLM and tool calls"), `CHAIN`, `RETRIEVER`, `EMBEDDING`, `RERANKER`, `GUARDRAIL` ("A check that protects against unwanted content, modifying or rejecting responses as needed"), `EVALUATOR`, `PROMPT` ("The rendering of a prompt template, such as a template with variables filled in"). — [OpenInference semantic_conventions.md](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (spec)

### Inferences
- The closest standard hooks for "which rule sections were loaded" are (a) OpenInference's `PROMPT` span kind + `llm.prompt_template.version` emitted once per assembled prompt, and (b) OTel `gen_ai.system_instructions` as a reference/hash rather than content. Neither gives section granularity; a custom attribute array (e.g. `coordinator.rules.loaded = [{id, version, sha256}]`) on the `invoke_agent` span is needed and is compatible with both conventions (unknown attributes are preserved by backends; Langfuse lands unprefixed attributes under `metadata.attributes`, see KQ2).
- Because the conventions are Development-status and attribute names already changed between v1.36.0 and v1.37.0 (`gen_ai.system` -> `gen_ai.provider.name`; messages moved from events to attributes), pin a version string in your own trace schema and do not couple business logic to attribute names.
- `GUARDRAIL` (OpenInference) is the natural span kind for "which validators failed"; OTel GenAI has no validator span, so use a child span with custom attributes.

### Gaps
- Could not fetch the new `semantic-conventions-genai` repo's docs (path 404) to confirm whether anything newer than v1.37.0 (e.g. `gen_ai.tool.definitions`) exists; the README showed no attribute names and "Schema URL: TODO".
- Exact release dates of semconv v1.36.0/v1.37.0 were not retrieved; both are 2025 tags.

## KQ2. Langfuse, LangSmith, Braintrust, Arize Phoenix: what a per-reply trace contains, and support for linking an output to a prompt version or section

### Takeaway
All four can tie a generation to a whole prompt version (Langfuse: `prompt` arg or `langfuse.observation.prompt.name/version` OTel attributes with per-version metrics; Braintrust: `loadPrompt().build()` auto-attaches prompt identity, or manual `prompt_slug`/`prompt_version` metadata; LangSmith: commit hashes exist but no automatic link to traces was found; Phoenix: `llm.prompt_template.version`). None link an output to a prompt *section*; one prompt object per generation is the granularity, so section-level provenance is a custom metadata problem in every tool.

### Cited Findings
- Langfuse: "Linking prompts to traces enables tracking of metrics and evaluations per prompt version"; "navigating to a generation span in Langfuse will highlight the prompt that was used to generate the response." JS/TS: `updateActiveObservation({ prompt }, { asType: "generation" })`, `startObservation("llm", { prompt }, { asType: "generation" })`; Vercel AI SDK: `experimental_telemetry.metadata.langfusePrompt = fetchedPrompt.toJSON()`. Fallback prompts create no link. — [Langfuse: Link prompts to traces](https://langfuse.com/docs/prompt-management/features/link-to-traces) (undated docs); [Langfuse FAQ](https://langfuse.com/faq/all/link-prompt-management-with-tracing) (undated)
- Langfuse per-prompt-version metrics tab: median generation latency, input/output tokens, cost, generation count, median score value, first/last generation timestamp. — [Langfuse: Link prompts to traces](https://langfuse.com/docs/prompt-management/features/link-to-traces) (undated docs)
- Langfuse OTel ingestion attribute mapping: prompt name = `langfuse.observation.prompt.name` or `langfuse.prompt.name` (string); prompt version = `langfuse.observation.prompt.version` or `langfuse.prompt.version` (integer); observation type = `langfuse.observation.type`; session = `langfuse.session.id` or `session.id`; user = `langfuse.user.id` or `user.id`; tags = `langfuse.trace.tags`; metadata = `langfuse.trace.metadata.*` / `langfuse.observation.metadata.*`; input accepted from `langfuse.observation.input`, `gen_ai.prompt`, `input.value`, `gen_ai.tool.call.arguments`; output from `langfuse.observation.output`, `gen_ai.completion`, `output.value`, `gen_ai.tool.call.result`; model from `gen_ai.request.model` / `gen_ai.response.model` / `llm.model_name`; usage from `gen_ai.usage.*` / `llm.token_count.*`. "Only top-level metadata keys are filterable"; unprefixed OTel attributes land under `metadata.attributes`. Recommends setting session/user/tags/metadata on every span, not only the root. — [Langfuse OpenTelemetry get-started](https://langfuse.com/docs/opentelemetry/get-started) (undated docs)
- LangSmith: "Every saved update to a prompt creates a new commit with a unique commit hash"; pull pinned as `client.pull_prompt("joke-generator:12344e88")`; tags like `production` are movable so the hash is the stable reference; trace metadata is arbitrary key-value and can be set on the current run or via `tracing_context`. No documentation found that the pulled commit hash is automatically written to trace metadata. — [LangSmith: Manage prompts](https://docs.langchain.com/langsmith/manage-prompts); [Add metadata and tags to traces](https://docs.langchain.com/langsmith/add-metadata-tags) (undated docs)
- Braintrust: prompts loaded via `loadPrompt()` and passed through `build()` to a wrapped client "add the prompt metadata to the LLM span"; hard-coded prompts "produce spans with no prompt metadata"; for external prompts, write `prompt_slug` and `prompt_version` as structured metadata on the root span; index `metadata.prompt_version` for fast filtering; log alerts can filter on prompt version; trace retention 14 days (Starter) / 30 days (Pro). — [Braintrust: How to monitor prompt performance in production](https://www.braintrust.dev/articles/how-to-monitor-prompt-performance-in-production) (undated article); [Braintrust: Use prompts in code](https://www.braintrust.dev/docs/core/functions/prompts) (undated docs)
- Braintrust span types map LangSmith run types to "LLM, tool, or task span types"; `traceable`-wrapped calls become spans with inputs and outputs. — [Braintrust LangSmith integration](https://www.braintrust.dev/docs/integrations/sdk-integrations/langsmith) (undated docs)
- Phoenix/OpenInference: `llm.prompt_template.version` attribute and a `PROMPT` span kind for "the rendering of a prompt template." — [OpenInference spec](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (accessed 2026-10-11)

### Inferences
- In practice a per-reply trace in these tools is: root trace (session id = conversation, user id, tags, metadata) -> generation observation(s) with model, input/output, usage, cost, latency, linked prompt name+version -> tool/span children with inputs/outputs -> scores attached by evaluators. The "which section" question is answered today only if you put section ids into metadata yourself and keep them top-level so they are filterable (Langfuse) or indexed (Braintrust).
- For a one-developer TypeScript build, Langfuse's OTel attribute names give the cheapest path: emit OTel spans with `langfuse.observation.prompt.name/version` for the composed prompt and `langfuse.trace.metadata.rules_loaded` (top-level key) for the section list, and you get per-version metrics and per-section filtering without writing a UI.

### Gaps
- LangSmith: no primary doc found confirming or denying automatic prompt-commit-to-trace linking; treat as "none reported, add manually."
- Braintrust: did not find an authoritative code snippet showing the exact auto-attached prompt fields' names on the span.
- No vendor documents section- or rule-level attribution; none claims it.

## KQ3. Research/tooling on attributing an output sentence to a specific prompt instruction or retrieved chunk; anything practical beyond logging which sections were present?

### Takeaway
The rigorous methods are context-ablation attribution: ContextCite (NeurIPS 2024) fits a linear surrogate over random leave-out ablations of context sources (sentences) at ~32x the cost of generating the response; AttriBoT (ICLR 2025) approximates leave-one-out >300x faster using cached activations, hierarchical attribution and proxy models; TracLLM (USENIX Security 2025) targets long-context forensic traceback. None are instruction-specific and the fast ones need model internals you do not have on a hosted API. I found no paper that attributes an output to a specific system-prompt instruction; the practical options are black-box section ablation (re-run with one section removed) and rule-level validators that report "which rules failed and why."

### Cited Findings
- ContextCite "learns a surrogate model that approximates how a language model's response is affected by including or excluding each part of the context"; the surrogate is linear so its weights are attribution scores; sources are sentences removed by ablation; it focuses on "contributive attribution" (sources that actively influence generation) rather than corroborative; "attributing responses using CONTEXTCITE is 32x more expensive than generating the original response"; weakness: deleting one sentence can break cross-sentence dependencies. — [ContextCite, arXiv 2409.00729](https://arxiv.org/abs/2409.00729) (Sept 2024, NeurIPS 2024, paper)
- AttriBoT (Liu, Kandpal, Raffel) reports ">300x speedup" over exact leave-one-out, "about 30 times faster than generating the response," via cached activations, hierarchical attribution and smaller proxy models; components tunable for faithfulness vs speed. — [AttriBoT, arXiv 2411.15102](https://arxiv.org/abs/2411.15102) (v3 Mar 2025, ICLR 2025, paper)
- TracLLM is "a context traceback framework for long-context LLMs" aimed at debugging and forensic analysis after prompt-injection/knowledge-corruption; uses an informed search-based algorithm plus contribution-score ensemble and denoising. — [TracLLM, arXiv 2506.04202](https://arxiv.org/abs/2506.04202) (June 2025, USENIX Security 2025, paper)
- Searching for system-prompt instruction attribution surfaced only adjacent work: "A Closer Look at System Prompt Robustness" (adherence under conflicting user input) — [arXiv 2502.12197](https://arxiv.org/abs/2502.12197) (Feb 2025); MetaSPO measures attention ratio system-vs-user prompt — [arXiv 2505.09666](https://arxiv.org/html/2505.09666v1) (May 2025); "A Taxonomy of Prompt Defects in LLM Systems" — [arXiv 2509.14404](https://arxiv.org/pdf/2509.14404) (Sept 2025). None attributes an output sentence to an instruction.
- Anthropic on feedback design: "The best form of feedback is providing clearly defined rules for an output, then explaining which rules failed and why"; LLM-as-judge "is generally not a very robust method, and can have heavy latency tradeoffs." — [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29, engineering blog)
- MAST (NeurIPS 2025) built an LLM-as-judge annotator for its 14 failure modes, validated against human annotators (kappa = 0.88 on 150 traces), and open-sourced the dataset and annotator. — [Why Do Multi-Agent LLM Systems Fail?, arXiv 2503.13657](https://arxiv.org/abs/2503.13657) (v1 Mar 2025, v3 Oct 2025, paper)
- Anthropic's research system records full production traces but monitors "decision patterns and interaction structures without reading individual conversation contents, to protect privacy." — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13, engineering blog)
- Foundational caveat for model self-reports (not re-fetched this session): Turpin et al. show chain-of-thought explanations can be unfaithful to the factors actually driving the answer. — [Language Models Don't Always Say What They Think, arXiv 2305.04388](https://arxiv.org/abs/2305.04388) (May 2023, NeurIPS 2023, paper)

### Inferences
- ContextCite-style attribution over *prompt sections* instead of retrieved sentences is methodologically identical (sections are the "sources"); the blocker on a hosted Haiku API is cost (32x per attributed reply) and lack of logprobs, so it only makes sense as an offline debug tool: for one bad reply, re-run with each of K sections removed and diff the output, K calls total (for K ~ 10-20 sections, well under ContextCite's random-ablation budget). Label: inference; no paper evaluates this black-box variant.
- Asking the model to emit `applied_rule_ids` alongside the reply gives cheap, filterable section attribution, but it is a self-report and should be treated as a hint, not ground truth (Turpin et al.). Pair it with deterministic validators per rule so at least the *violations* are attributed by code, not by the model.
- Rule-level validators (one small check per rule, each named) are the only approach found that gives exact attribution of a failure to a rule at zero marginal LLM cost; this matches Anthropic's "which rules failed and why" guidance and OpenInference's `GUARDRAIL` span kind.

### Gaps
- No published method or tool for instruction-level provenance of generated text; no numbers exist for how often an LLM's self-reported "I applied rule X" is correct.
- AttriBoT/TracLLM need activations or many forward passes; not applicable to a hosted API without a proxy model, so no effort estimate beyond "skip."

## KQ4. Anthropic "Building Effective Agents" (Dec 2024) and "How we built our multi-agent research system" (2025): stated conditions where sub-agents help/hurt; token and quality numbers

### Takeaway
Anthropic's stated conditions: multi-agent helps for heavy parallelization, information exceeding one context window, and many complex tools; it hurts when all agents must share the same context or have many inter-dependencies, and "the task's value must justify the higher token cost" (agents ~4x chat tokens; multi-agent ~15x). The Dec 2024 post says to use the simplest pattern that works and that agentic systems "trade latency and cost for better task performance."

### Cited Findings
- "we recommend finding the simplest solution possible, and only increasing complexity when needed"; workflows suit well-defined tasks, agents suit flexibility and model-driven decisions at scale; "Agentic systems often trade latency and cost for better task performance." — [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19, engineering blog)
- Pattern "when to use": prompt chaining when a task splits cleanly into fixed subtasks ("trading latency for accuracy"); routing when distinct categories are better handled separately and can be classified accurately; parallelization (sectioning/voting) for speed or confidence; orchestrator-workers "for complex tasks where the subtasks can't be predicted in advance"; evaluator-optimizer when clear evaluation criteria exist and iteration adds measurable value. Customer support is called "a natural fit for open-ended agents" because it combines conversation flow with external data/actions and success is measurable via user-defined resolutions. — [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19)
- Multi-agent "excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows" and tasks with many complex tools; domains "that require all agents to share the same context" or with many dependencies between agents "are not a good fit today"; most coding tasks have fewer parallelizable subtasks than research. — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Tokens: "agents typically use about 4x more tokens than chat interactions, and multi-agent systems use about 15x more tokens than chats"; on BrowseComp, three factors explained 95% of performance variance and token usage alone explained 80% (others: number of tool calls, model choice). — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Quality: Opus 4 lead + Sonnet 4 subagents "outperformed single-agent Claude Opus 4 by 90.2%" on an internal research eval (example: listing all board members of IT S&P 500 companies, where the single agent failed on slow sequential search); parallelization "cut research time by up to 90% for complex queries"; a rewritten tool description produced "a 40% decrease in task completion time"; initial eval set ~20 queries. — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Effort-scaling rules embedded in prompts: simple fact-finding = 1 agent, 3-10 tool calls; direct comparisons = 2-4 subagents, 10-15 calls each; complex research = 10+ subagents. "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries"; without this, subagents duplicated work or left gaps. — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Production: "full production tracing" to diagnose failures (poor queries, bad sources, tool errors); evals judge outcomes plus "reasonable process"; LLM judge rubric = factual accuracy, citation accuracy, completeness, source quality, tool efficiency; synchronous subagent execution "simplifies coordination but blocks progress while any subagent is still running"; resume-from-failure checkpoints; rainbow deployments. — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13)
- Agent SDK post: subagents "enable parallelization" and "use their own isolated context windows, and only send relevant information back to the orchestrator"; "ideal for tasks that require sifting through large amounts of information where most of it won't be useful." — [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29)
- Agent SDK docs: each subagent runs in its own conversation; "intermediate tool calls and results stay inside the subagent; only its final message returns to the parent"; per-subagent `effort` can be set to reduce cost/latency; a fork "reuses the parent's prompt cache" because its system prompt and tool definitions are identical. — [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) (undated docs)

### Inferences
- The 90.2% and 15x figures come from open-ended research with heavy parallel search; nothing in either post claims a quality gain for a single-turn reply task. For an SMS reply, the only Anthropic-endorsed reason to spawn a sub-agent is context isolation over a large, mostly-irrelevant corpus (call logs), not quality.
- Anthropic's own evaluation approach (small eval set, LLM judge with named rubric criteria, humans for edge cases) is scaled to one developer: ~20 queries is their stated starting point.

### Gaps
- Neither post gives latency numbers for a single subagent call, nor any support-bot-specific measurement.

## KQ5. Orchestrator-worker patterns in customer-support bots: who uses a sub-agent for side tasks, and what they report on latency and cost

### Takeaway
Intercom Fin, Sierra and Decagon all run multi-model pipelines around a single main responder: Fin has a 6-7 phase engine with dedicated retrieval/reranker models, a 14B "Issue Summarizer" and small models for escalation routing; Sierra assembles agents from 15+ models with input/response "supervisors" and a deterministic output guard; Decagon runs a real-time supervisor model and a bad-actor model. The side models are specialized checkers/summarizers invoked inline, not autonomous sub-agents. None of the three publishes latency or cost numbers for these side models.

### Cited Findings
- Fin AI Engine: "a patented, multi-phase architecture" with six phases: query refinement, retrieval, reranking, guided response generation, accuracy validation, ongoing optimization; another Fin page says 7 phases. — [fin.ai: AI agent NLP/RAG architecture](https://fin.ai/learn/ai-agent-nlp-rag-architecture-customer-service); [fin.ai: Fin AI Engine glossary](https://fin.ai/glossary/fin-ai-engine) (undated vendor pages)
- Fin models: `fin-cx-retrieval` (semantic search), `fin-cx-reranker` (scores each result), Fin Apex 1.0 generates the final answer and "escalating to a human when it can't answer confidently"; also "fine-tuned smaller models like the 14B Issue Summarizer and transformer architectures like ModernBERT for feedback parsing and escalation routing." Vendor claims: 76% average resolution rate; Apex 1.0 "65% fewer hallucinations than Sonnet 4.6." — [fin.ai/cx-models](https://fin.ai/cx-models) (undated vendor page)
- Fin reranker: self-reported A/B test over 1.5 million conversations with reranking costs cut by 80%. — [fin.ai research: Finetuning retrieval for Fin](https://fin.ai/research/finetuning-retrieval-for-fin/) (undated vendor research post)
- Fin pre-generation checks: engine "performs checks to see whether a Workflows automation or Custom Answer should be triggered, as well as safety checks"; if not confident it asks a clarifying question. — [Intercom help: The Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine) (undated vendor help page)
- Fin glossary describes "intent classification agents," "knowledge retrieval" and "action execution" sub-agents. — [fin.ai glossary](https://fin.ai/glossary/fin-ai-engine) (undated)
- Sierra: agents "are assembled using 15+ frontier, open-weight, and proprietary models, depending on the job to be done"; Curie model runs the core conversation loop (path, tools, replies); higher-agency tasks rely on "employing supervisors to enforce guardrails, policies, and quality checks"; they monitor "latency, error rates, and timeouts" per provider; no latency/cost/accuracy numbers given. — [Sierra: Constellation of models](https://sierra.ai/blog/constellation-of-models) (2025-12-03, vendor blog)
- Sierra turn flow: "A supervisor agent screens the input. The agent draws on the relevant content and applies the relevant policies. Another supervisor reviews the proposed response. A deterministic guard scans the output for sensitive data. Only then does the customer see a reply." "Each supervisor's role is well defined... Each supervisor can be evaluated and improved independently." — [Sierra: Trust and reliability](https://sierra.ai/product/trust-and-reliability) (undated vendor page)
- Sierra multi-model router "enforces the ordered list of models defined for each task and manages controlled fallback when the primary model is unavailable." — [Sierra: Preserving agent behavior while serving LLMs reliably](https://sierra.ai/blog/model-failover) (undated vendor blog)
- Decagon: Agent Operating Procedures are "natural-language instructions that compile into structured logic"; "a supervisor model checks responses in real time and a bad-actor model screens manipulation attempts"; agent logic and tools are Git-backed with staging/production workspaces; tools in Python with MCP. — [Decagon: From SOPs to AOPs](https://decagon.ai/blog/from-sops-to-agent-operating-procedures); [Decagon vs Sierra](https://decagon.ai/vs/sierra) (undated vendor pages)
- Decagon guide: human fallback triggered below a confidence score of 0.5. — [Decagon: AI agent assistance guide](https://decagon.ai/blog/ai-agent-assistance) (undated vendor page)
- Latency/cost of side models at Fin, Sierra, Decagon: none reported (all three sets of pages checked).

### Inferences
- The industry pattern for a support turn is "main responder + inline specialized side models" (classifier, retriever, reranker, supervisor/validator, summarizer), each independently evaluable, run synchronously before the reply is sent. Nobody describes handing a side task to an autonomous sub-agent loop; the closest analog to "summarize call logs" is Fin's dedicated 14B Issue Summarizer, i.e. a single small-model call.
- Sierra's "each supervisor can be evaluated independently" is the same property the owners want from decomposition: a named component per concern so a failure is attributable.

### Gaps
- No vendor publishes latency or cost for supervisors/summarizers; no independent evaluation of any of the three architectures was found.
- Fin's "15-20 subcomponents" figure appeared only in a third-party summary of an AWS case study; I did not fetch the primary and do not rely on it.

## KQ6. For a single-reply SMS bot, is a sub-agent for side tasks worth the extra latency, or is a second small model call inline the standard answer?

### Takeaway
Evidence favors an inline second call: Google's 180-configuration study found every multi-agent variant degraded sequential-reasoning tasks by 39-70% while centralized coordination helped only parallelizable tasks (+80.9%), with coordination cost rising disproportionately as tool count grows; MAST attributes most multi-agent failures to specification and inter-agent misalignment; Anthropic's conditions for sub-agents (parallel breadth, context overflow) do not describe a single SMS reply, except that call-log summarization is a legitimate "sift a lot of mostly irrelevant text" context-isolation case. The standard answer is a bounded summarizer call (one Haiku call with its own prompt, treated as a tool/worker) rather than an autonomous sub-agent loop. No published numbers compare the two for support bots.

### Cited Findings
- Google Research (Kim & Liu): 180 agent configurations across four benchmarks; single agent vs independent, centralized, decentralized, hybrid multi-agent; "centralized coordination improved performance by 80.9% over a single agent on financial reasoning"; on PlanCraft "every multi-agent variant we tested degraded performance by 39-70%"; independent systems amplified errors 17.2x vs 4.4x for centralized; predictive model identifies the optimal strategy for 87% of unseen task configurations (R^2 0.513); "tool-coordination trade-off": as tasks require more tools, coordination cost "rises disproportionately" (example: coding agent with 16+ tools); multi-agent "not a universal solution." No token/cost figures. — [Google Research blog: Towards a science of scaling agent systems](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) (2026-01-28, blog); paper [arXiv 2512.08296](https://arxiv.org/html/2512.08296v2) (Dec 2025)
- Secondhand only: a Hugging Face summary of the same paper adds "diminishing or negative returns once single-agent baselines exceed ~45%"; the Google blog does not state this threshold, and an earlier abstract mirror describes 260 configurations / six benchmarks vs the blog's 180 / four, so numbers are version-dependent. — [HF papers 2512.08296](https://huggingface.co/papers/2512.08296); [hyper.ai mirror](https://hyper.ai/en/papers/2512.08296)
- MAST: taxonomy of 14 failure modes in 3 categories (specification/system design, inter-agent misalignment, task verification/termination); derived from 150 traces with inter-annotator kappa 0.88; dataset of 1000+ (NeurIPS listing) or 1600+ (arXiv v3) annotated traces across 7 frameworks; failures "primarily stem from system design issues and inter-agent misalignment"; tested interventions (better role specification, orchestration) "often do not provide sufficient solutions." — [arXiv 2503.13657](https://arxiv.org/abs/2503.13657) (Mar 2025, v3 Oct 2025; NeurIPS 2025 [poster](https://neurips.cc/virtual/2025/122442))
- Anthropic: multi-agent ~15x chat tokens; synchronous subagents block the parent while running; sub-agents suit "sifting through large amounts of information where most of it won't be useful"; prompt chaining trades latency for accuracy. — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13); [Agent SDK post](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29); [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19)
- Industry practice (KQ5): Fin's Issue Summarizer is a separate small model, Sierra/Decagon supervisors are separate inline model calls; none run autonomous sub-agent loops per reply, none report latency. — [fin.ai/cx-models](https://fin.ai/cx-models); [Sierra trust and reliability](https://sierra.ai/product/trust-and-reliability); [Decagon vs Sierra](https://decagon.ai/vs/sierra) (undated vendor pages)
- Agent SDK: per-subagent `effort` to cut cost/latency; forks reuse the parent prompt cache. — [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) (undated docs)

### Inferences
- A single SMS reply is sequential (read thread -> fetch records -> draft -> validate) with 14 tools: both of Google's "hurts" conditions (sequential reasoning, tool-heavy) apply to splitting the *reply itself* across agents. The call-log summary is different: it is an independent, bounded, context-heavy sub-task whose raw input should not enter the reply prompt. That matches Anthropic's context-isolation case and Fin's dedicated summarizer, so implement it as one worker call with its own small prompt, fixed output schema, and no tools beyond reading logs, returning a short summary the main prompt consumes.
- Latency arithmetic (inference, no published numbers): one extra Haiku-class call adds roughly one model round-trip; an autonomous sub-agent loop adds N round-trips plus coordination. Run the summarizer in parallel with record lookups (Promise.all) or precompute it when a call log lands, so reply-time latency is at most one call. SMS tolerates seconds, so one extra call is acceptable; an open-ended loop is not.
- Even the single worker call needs what Anthropic lists: objective, output format, tool/source guidance, boundaries; otherwise the MAST "specification" failures (duplicated work, ignored constraints) show up.

### Gaps
- No study measures sub-agent vs inline-call latency/cost for support or SMS bots; "none reported."
- The ~45% baseline threshold could not be verified against the primary.

## Method cards

Effort hours are my estimates for one TypeScript developer against the hosted Claude API; "problems" refers to owners' problems (2) and (4) only.

### Card T1. OTel-shaped per-reply span tree
- One line: emit one `invoke_agent` root per inbound SMS with `chat`, `execute_tool`, validator and escalation child spans using OTel GenAI names where they exist.
- Sources: [OTel GenAI spans v1.37.0](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (2025, spec); [OTel agent spans v1.36.0](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.36.0/docs/gen-ai/gen-ai-agent-spans.md) (2025, spec); [OpenInference spec](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (2026, spec); [Langfuse OTel mapping](https://langfuse.com/docs/opentelemetry/get-started) (docs).
- Claims: The standard gives you conversation id, model, usage, finish reasons, tool name/call id, agent name, and opt-in system instructions/messages. It has no slot for rule sections, validators or escalation sources, so these are custom attributes. Langfuse ingests OTel directly and maps `gen_ai.*`, `session.id`, `user.id`, and `langfuse.*` keys, so one exporter gives a UI for free. OpenInference adds `GUARDRAIL` and `PROMPT` span kinds that fit validators and prompt assembly.
- Problems: (2); gives the skeleton (4) needs to show a sub-agent as a nested `invoke_agent`.
- Numbers: none reported for the convention itself.
- Effort: ~2 h. Build: a `trace.ts` that wraps the reply pipeline in spans via `@opentelemetry/api` + OTLP HTTP exporter to Langfuse (or a JSON-lines file), with the concrete schema below.
- Risks: conventions are Development status and names changed between v1.36.0 and v1.37.0; PHI in message content means content attributes must stay opt-in or be stored as references.
- Verdict: try first; it is the cheapest way to get a filterable trace per reply and is the base every other card hangs on.

Concrete schema (attribute names in backticks are standard; `coordinator.*` are custom):
```
trace: reply_id (uuid), `gen_ai.conversation.id` = thread/phone hash, `user.id` = patient id hash,
       `langfuse.trace.tags` = ["sms", "hair-transplant"], `langfuse.trace.metadata.prompt_version` = "v12"
span invoke_agent patient-coordinator (`gen_ai.operation.name`="invoke_agent", `gen_ai.agent.name`="patient-coordinator")
  attrs: coordinator.rules.loaded = [{id:"R03-pricing", version:3, sha256:"...", reason:"intent=pricing"}, ...]
         coordinator.rules.skipped = [{id:"R09-aftercare", reason:"intent mismatch"}]
         coordinator.router.intent = "pricing", coordinator.router.confidence = 0.82
  span chat claude-haiku-* (`gen_ai.provider.name`="anthropic", `gen_ai.request.model`, `gen_ai.usage.input_tokens`,
         `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`, `gen_ai.response.id`,
         `langfuse.observation.prompt.name`="coordinator-main", `langfuse.observation.prompt.version`=12,
         `gen_ai.system_instructions` = OPT-IN only; default: coordinator.prompt.sha256 and section id list)
    attrs: coordinator.output.applied_rule_ids = ["R03-pricing","R01-tone"]   # model self-report, hint only
  span execute_tool get_patient_record (`gen_ai.tool.name`, `gen_ai.tool.call.id`, error.type if failed) x N
  span invoke_agent call-log-summarizer (nested worker; same shape, own prompt name/version, own usage)
  span validate R03-pricing (openinference.span.kind="GUARDRAIL") attrs: coordinator.validator.rule_id, .passed, .message
  span validate no-medical-advice ... x M
  attrs on root: coordinator.escalation.fired = true/false, coordinator.escalation.source = "validator:R05" | "router:low-confidence" | "tool:error" | "model:asked"
  attrs on root: coordinator.final.sent = bool, coordinator.final.reply_sha256
```

### Card T2. Rule-section manifest + prompt version link
- One line: treat each decomposed section as a versioned prompt object; record the list of section ids/versions/hashes actually assembled on every reply and link the composed prompt to its version in the tracing tool.
- Sources: [Langfuse link prompts to traces](https://langfuse.com/docs/prompt-management/features/link-to-traces) (docs); [Langfuse OTel mapping](https://langfuse.com/docs/opentelemetry/get-started) (docs); [Braintrust monitor prompt performance](https://www.braintrust.dev/articles/how-to-monitor-prompt-performance-in-production) (article); [LangSmith manage prompts](https://docs.langchain.com/langsmith/manage-prompts) (docs); [OpenInference `llm.prompt_template.version`](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (spec).
- Claims: Every vendor supports linking a generation to one prompt name+version and aggregating latency/tokens/cost/scores per version (Langfuse lists exactly those metrics). None supports section granularity, so the section list must be a top-level metadata key to be filterable (Langfuse) or indexed (Braintrust `metadata.prompt_version`). LangSmith offers commit hashes but no automatic trace link was found. With a manifest, "which part of the prompt produced it" narrows from an 800-line block to the handful of sections that were loaded for that intent.
- Problems: (2).
- Numbers: none reported.
- Effort: ~2 h. Build: `sections/*.md` with frontmatter `{id, version}`, a `composePrompt(intent)` that returns `{text, manifest}`, and write the manifest + composed-prompt hash to the root span.
- Risks: a manifest says what was present, not what drove the output; sections that are always loaded (tone, safety) will show in every trace and add no signal.
- Verdict: try first; it is a prerequisite for every attribution technique below and costs almost nothing.

### Card T3. Named per-rule validators as failure attribution
- One line: for each rule that can be checked by code (price ranges, forbidden claims, required disclaimers, length, language), run a named validator after drafting and record pass/fail per rule id.
- Sources: [Anthropic Agent SDK post: "explaining which rules failed and why"](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29, blog); [Sierra trust and reliability: supervisors "evaluated and improved independently"](https://sierra.ai/product/trust-and-reliability) (vendor); [Decagon supervisor model](https://decagon.ai/vs/sierra) (vendor); [OpenInference `GUARDRAIL` kind](https://raw.githubusercontent.com/Arize-ai/openinference/main/spec/semantic_conventions.md) (spec).
- Claims: Anthropic states rule-based feedback naming the failed rule is the best feedback form and that LLM-as-judge is less robust with heavy latency. Sierra and Decagon both run a response supervisor plus a deterministic guard before sending, and Sierra stresses independent evaluability per supervisor. A failed validator is an exact, code-level attribution of a bad reply to a rule, which is what problem (2) asks for in the cases that matter most (policy violations).
- Problems: (2); also provides the "which validators failed" field of the planned trace and a deterministic escalation source.
- Numbers: none reported (Decagon's 0.5 confidence threshold is for human fallback, not validators).
- Effort: ~2-3 h for 5-8 deterministic validators plus one optional Haiku rubric check for rules that need judgment, each emitting a `validate {rule_id}` span.
- Risks: deterministic checks cover only part of the rule set; an LLM rubric check adds one more call and its own false positives.
- Verdict: try first; it is the only method found that attributes failures to rules exactly and at near-zero cost.

### Card T4. Model self-report of applied rule ids (structured output)
- One line: have the drafter return `{reply, applied_rule_ids[], escalate_reason?}` so each reply carries the sections the model says it used.
- Sources: no paper evaluates this; faithfulness caveat from [Turpin et al. 2023](https://arxiv.org/abs/2305.04388) (foundational, not re-verified this session); Anthropic's judge rubric uses named criteria — [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13).
- Claims: Cheap (zero extra calls), filterable, and lets you count how often each section is "used" vs loaded. But it is an explanation the model generates, and explanations can be unfaithful to the actual cause; treat as a hint that narrows debugging, verified by T3 and T5 when it matters.
- Problems: (2).
- Numbers: none reported.
- Effort: ~1 h. Build: add the field to the output schema, log to `coordinator.output.applied_rule_ids`.
- Risks: false confidence; small models may cite rules they did not follow.
- Verdict: try if time; one hour, useful as a filter, never as proof.

### Card T5. Black-box prompt-section ablation (offline debug tool)
- One line: for one bad reply, replay the exact trace with each loaded section removed in turn and diff the outputs to find the section whose removal changes the bad behavior.
- Sources: method basis [ContextCite, arXiv 2409.00729](https://arxiv.org/abs/2409.00729) (2024, NeurIPS; paper); speedups [AttriBoT, arXiv 2411.15102](https://arxiv.org/abs/2411.15102) (ICLR 2025; paper); [TracLLM, arXiv 2506.04202](https://arxiv.org/abs/2506.04202) (USENIX Sec 2025; paper).
- Claims: Context-ablation attribution is the rigorous way to find which context piece causes a statement; ContextCite does it with random ablations plus a linear surrogate at ~32x the cost of one generation, AttriBoT cuts that >300x but needs activations/proxy models. On a hosted API with ~10-20 sections, exhaustive leave-one-out is K calls and needs no internals; it is contributive (what caused it), unlike the manifest (what was present). It is for debugging a specific reply, not for every reply.
- Problems: (2).
- Numbers: ContextCite 32x generation cost; AttriBoT >300x faster than exact LOO and ~30x faster than generation (both on open models, not applicable directly).
- Effort: ~2 h. Build: a `replay.ts` CLI that loads a trace id, rebuilds the prompt from the manifest, runs K ablated variants with temperature 0, and prints a diff table (output changed? bad span disappeared?).
- Risks: nondeterminism at temperature>0 confounds diffs; removing a section can break references between sections (ContextCite notes this); only runs on traces whose manifest and inputs were stored.
- Verdict: try if time; the first two cards must exist first, then this turns "reread 800 lines" into "run one command."

### Card T6. Privacy-preserving content capture
- One line: store message content and system instructions out-of-band (or hashed) and put only references, ids and structural attributes on spans.
- Sources: [OTel GenAI spans v1.37.0: content Opt-In, "store content externally and record references on spans"](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/v1.37.0/docs/gen-ai/gen-ai-spans.md) (spec); [Anthropic: monitor "decision patterns and interaction structures without reading individual conversation contents"](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13).
- Claims: The standard explicitly makes content opt-in because it is PII-laden; Anthropic debugged a production agent from structural traces without reading contents. For patient SMS (health data), the trace should be debuggable from rule ids, tool names, validator results and escalation source alone, with content fetchable by id under access control.
- Problems: (2) indirectly (keeps the trace shareable with the owners without exposing PHI).
- Numbers: none reported.
- Effort: ~1 h. Build: content store keyed by `reply_id`, spans carry `coordinator.prompt.sha256` and `coordinator.final.reply_sha256`.
- Risks: harder to debug when content is needed; mitigated by a one-command fetch.
- Verdict: try first; low cost and necessary for a medical product.

### Card S1. Inline worker call for call-log summarization (prompt chaining / routing)
- One line: a single bounded Haiku call with its own small prompt and fixed output schema that reads the call logs and returns a short structured summary consumed by the main drafter; invoked like a tool, in parallel with record lookups.
- Sources: [Building Effective Agents: prompt chaining, routing, "simplest solution"](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19); [Agent SDK post: isolation for "sifting through large amounts of information where most of it won't be useful"](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29); [Fin's 14B Issue Summarizer](https://fin.ai/cx-models) (vendor); [Google scaling study: sequential tasks degrade 39-70% under multi-agent](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) (2026-01-28).
- Claims: This is the industry-standard shape for a side task in a support turn: a specialized model call, not an autonomous loop. It gets the context-isolation benefit Anthropic cites (raw logs never enter the main prompt) without the coordination overhead Google measured on sequential, tool-heavy tasks. Each worker call needs objective, output format, sources, boundaries (Anthropic), which is also what makes it traceable as its own `invoke_agent` span with its own prompt version.
- Problems: (4) directly; helps (2) because the summarizer's prompt is separately versioned and traced.
- Numbers: none reported for latency; Anthropic multi-agent 15x tokens is the cost ceiling to avoid.
- Effort: ~2-3 h. Build: `summarizeCallLogs(patientId)` worker with its own prompt file, zod output schema, span, and a cache keyed by (patientId, latest_log_id) so repeat replies pay nothing.
- Risks: one extra round-trip at reply time if not precomputed; summary quality unverified without a small eval set (Anthropic started with ~20 queries).
- Verdict: try first; it is what Fin/Sierra/Decagon-style pipelines do and matches every "when it helps" condition without the "when it hurts" ones.

### Card S2. Precompute side-task results at ingest time
- One line: run the summarizer when a call log arrives (webhook/cron), store the summary, and have the reply path read it, so reply latency is unchanged.
- Sources: inference from S1 sources; Anthropic's SDK compaction is the loosely analogous "summarize before you need it" mechanism — [Agent SDK post](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29).
- Claims: Moves the only latency cost of S1 off the SMS critical path; summaries are versioned artifacts with their own prompt version, so a wrong summary is attributable to the summarizer version, not the drafter.
- Problems: (4).
- Numbers: none reported.
- Effort: ~1-2 h on top of S1.
- Risks: stale summaries if logs update mid-conversation; needs an invalidation key.
- Verdict: try if time; cheap once S1 exists.

### Card S3. Autonomous sub-agent loop (orchestrator-workers with tool-using workers)
- One line: a sub-agent with its own tools and loop that the orchestrator delegates open-ended subtasks to.
- Sources: [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13); [Google scaling study](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) (2026-01-28); [MAST](https://arxiv.org/abs/2503.13657) (2025); [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) (docs).
- Claims: Pays off for breadth-first, parallel, context-overflowing research (90.2% gain, up to 90% time cut) at ~15x chat tokens; hurts on sequential reasoning (39-70% degradation) and coordination cost grows with tool count; MAST finds failures come mainly from specification and inter-agent misalignment. A single SMS reply with 14 tools is sequential and tool-heavy.
- Problems: (4) nominally, but over-serves it.
- Numbers: 15x tokens; +90.2% (research); -39 to -70% (sequential); 17.2x vs 4.4x error amplification.
- Effort: ~4-6 h, plus eval; exceeds the budget relative to S1.
- Risks: latency, token cost, new failure modes, harder tracing.
- Verdict: skip for the reply path; revisit only for offline jobs (e.g. nightly audit of all call logs) where parallelism matters.

### Card S4. Response supervisor model (second-model review before send)
- One line: a separate small-model call that reviews the drafted reply against the loaded rules and returns pass/fail with the rule id.
- Sources: [Sierra trust and reliability](https://sierra.ai/product/trust-and-reliability) (vendor); [Decagon supervisor model](https://decagon.ai/vs/sierra) (vendor); [Anthropic on LLM-as-judge latency](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29); [Building Effective Agents: evaluator-optimizer](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19).
- Claims: Sierra and Decagon both ship this pattern inline; Anthropic warns LLM judges are less robust and add latency but can be worth it where any performance boost justifies cost. For rules that code cannot check (tone, scope creep into medical advice), it is the only option and its verdict is a rule-attributed signal.
- Problems: (2) for judgment rules; feeds the escalation source.
- Numbers: none reported for latency/cost by vendors.
- Effort: ~1-2 h. Build: `reviewReply(reply, manifest)` Haiku call with the loaded sections and a fixed `{pass, failed_rule_ids[], reason}` schema, traced as a GUARDRAIL span.
- Risks: adds a call per reply; judge false positives cause over-escalation; keep it for the subset of rules T3 cannot cover.
- Verdict: try if time, after T3.

## Direct answers to each key question

1. OTel GenAI conventions (2024-2026): standard spans are inference (`chat {model}`), tool (`execute_tool {tool}`), and agent (`invoke_agent {agent}` / `create_agent`), all Development status, with attributes for operation, provider, model, conversation id, agent id/name/description, tool name/call id/description/type, token usage, finish reasons, and opt-in `gen_ai.system_instructions` / `gen_ai.input.messages` / `gen_ai.output.messages` (added by v1.37.0; v1.36.0 used events). There is no convention for "instructions loaded" or prompt-section attribution; the nearest standard is OpenInference's `llm.prompt_template.version` and `PROMPT`/`GUARDRAIL` span kinds. Sources in KQ1.
2. Langfuse/LangSmith/Braintrust/Phoenix: a per-reply trace is session/user/tags/metadata on the trace, generation observations with model, input/output, usage, cost, latency and a linked prompt name+version, tool spans, and evaluator scores. Langfuse (SDK `prompt` arg or `langfuse.observation.prompt.name/version` OTel attrs, per-version metrics), Braintrust (`loadPrompt().build()` auto-attach or `prompt_version` metadata), Phoenix (`llm.prompt_template.version`) link to a whole prompt version; LangSmith has commit hashes but no automatic trace link found. None supports section-level linking.
3. Attribution research: ContextCite (ablation + linear surrogate, 32x cost), AttriBoT (>300x faster LOO, needs internals), TracLLM (long-context forensics). No paper attributes output to a specific system-prompt instruction. Practical beyond "sections present": (a) named deterministic validators that report the failed rule (Anthropic's recommended feedback form), (b) black-box leave-one-section-out replay for a specific bad reply (K calls), (c) model self-reported rule ids as a hint only.
4. Anthropic: sub-agents help with heavy parallelization, context overflow, many complex tools; hurt when agents must share context or have many dependencies; "value must justify the higher token cost." Numbers: agents ~4x chat tokens, multi-agent ~15x; token use explains 80% of BrowseComp variance (95% with tool-call count and model); 90.2% better than single Opus 4 on an internal research eval; parallelization up to 90% faster; tool-description rewrite -40% completion time. Dec 2024 post: use the simplest solution; agentic systems trade latency and cost for performance.
5. Support bots: Intercom Fin (6-7 phase engine, retrieval/reranker models, Apex 1.0 generator, 14B Issue Summarizer, ModernBERT escalation routing; 76% resolution claim, reranker A/B over 1.5M conversations with 80% reranking cost cut), Sierra (15+ models, input/response supervisors, deterministic guard, independently evaluable), Decagon (AOPs, real-time supervisor model, bad-actor model, confidence <0.5 -> human). All use inline specialized model calls for side tasks; latency/cost of those calls: none reported by any of them.
6. SMS bot: an inline second small-model call (worker with its own prompt, schema and span, run in parallel or precomputed) is the standard answer; an autonomous sub-agent loop is not justified for a sequential, tool-heavy single reply (Google: 39-70% degradation on sequential tasks, coordination cost rising with tools; Anthropic: 15x tokens, synchronous subagents block). Call-log summarization is a legitimate context-isolation case and should be a worker call, not a loop. No published head-to-head latency numbers exist for support bots.

## Quantitative claims table

| Claim | Value | Source (date, type) |
|---|---|---|
| Agents vs chat token use | ~4x | [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13, eng blog) |
| Multi-agent vs chat token use | ~15x | same |
| BrowseComp variance explained by token usage alone | 80% | same |
| Variance explained by tokens + tool calls + model choice | 95% | same |
| Multi-agent (Opus 4 lead + Sonnet 4 subagents) vs single Opus 4, internal research eval | +90.2% | same |
| Parallelization research-time reduction on complex queries | up to 90% | same |
| Task-completion-time reduction from rewriting a tool description | 40% | same |
| Initial eval set size | ~20 queries | same |
| Effort scaling: simple fact-finding | 1 agent, 3-10 tool calls | same |
| Effort scaling: direct comparison | 2-4 subagents, 10-15 calls each | same |
| Effort scaling: complex research | >10 subagents | same |
| Centralized multi-agent gain on parallelizable (financial reasoning) task | +80.9% | [Google Research blog](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) (2026-01-28, blog; paper arXiv 2512.08296 Dec 2025) |
| Multi-agent degradation on sequential task (PlanCraft), all variants | -39% to -70% | same |
| Error amplification, independent vs centralized | 17.2x vs 4.4x | same |
| Predictive model: optimal strategy on unseen configs | 87% (R^2 0.513) | same |
| Study scale | 180 configurations, 4 benchmarks (earlier abstract mirror: 260 / 6) | same; [hyper.ai mirror](https://hyper.ai/en/papers/2512.08296) |
| Single-agent baseline above which coordination gives diminishing/negative returns | ~45% (secondhand only) | [HF summary](https://huggingface.co/papers/2512.08296); not on Google blog |
| MAST failure taxonomy | 14 modes, 3 categories | [arXiv 2503.13657](https://arxiv.org/abs/2503.13657) (2025, NeurIPS 2025 paper) |
| MAST taxonomy derivation / agreement | 150 traces, kappa 0.88 | same |
| MAST annotated trace dataset | 1000+ (NeurIPS listing) or 1600+ (arXiv v3), 7 frameworks | same; [NeurIPS poster](https://neurips.cc/virtual/2025/122442) |
| ContextCite attribution cost vs generation | 32x | [arXiv 2409.00729](https://arxiv.org/abs/2409.00729) (2024, NeurIPS 2024 paper) |
| AttriBoT speedup over exact leave-one-out | >300x (~30x faster than generation) | [arXiv 2411.15102](https://arxiv.org/abs/2411.15102) (ICLR 2025 paper) |
| Langfuse per-prompt-version metrics | median latency, input/output tokens, cost, count, median score | [Langfuse docs](https://langfuse.com/docs/prompt-management/features/link-to-traces) (undated docs) |
| Braintrust trace retention | 14 days Starter / 30 days Pro | [Braintrust article](https://www.braintrust.dev/articles/how-to-monitor-prompt-performance-in-production) (undated) |
| Sierra model count per agent | 15+ models | [Sierra constellation post](https://sierra.ai/blog/constellation-of-models) (2025-12-03, vendor blog) |
| Fin average resolution rate (vendor claim) | 76% | [fin.ai/cx-models](https://fin.ai/cx-models) (undated vendor) |
| Fin Apex 1.0 hallucinations vs Sonnet 4.6 (vendor claim) | 65% fewer | same |
| Fin reranker A/B test size / cost cut (vendor claim) | 1.5M conversations / 80% reranking cost reduction | [fin.ai research](https://fin.ai/research/finetuning-retrieval-for-fin/) (undated vendor) |
| Fin Issue Summarizer size | 14B parameters | [fin.ai/cx-models](https://fin.ai/cx-models) (undated vendor) |
| Fin engine phases | 6 (one page) / 7 (another) | [fin.ai architecture guide](https://fin.ai/learn/ai-agent-nlp-rag-architecture-customer-service); [fin.ai glossary](https://fin.ai/glossary/fin-ai-engine) |
| Decagon human-fallback confidence threshold | < 0.5 | [Decagon guide](https://decagon.ai/blog/ai-agent-assistance) (undated vendor) |
| Latency/cost of side models at Fin, Sierra, Decagon | none reported | pages above |
| Sub-agent vs inline call latency for support/SMS bots | none reported | no source found |
