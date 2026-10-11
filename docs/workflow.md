# Workflow: original vs new

Both diagrams show what happens for one patient message.

## Original: one prompt does everything

```mermaid
flowchart TD
    M[Patient message] --> P["Fill one 800-line system prompt<br/>(every policy, every stage, every example)"]
    P --> L["Model call with 14 tools<br/>(reads all ~25k tokens of rules)"]
    L --> R[Reply sent as written]

    classDef old fill:#f6f8fa,stroke:#8c959f,color:#1f2328;
    class M,P,L,R old;
```

What is missing: no way to hand off to a person, no check on the reply before it is sent, no record of which rules were involved, and every message pays for every rule.

## New: code decides, the model drafts

```mermaid
flowchart TD
    M[Patient message] --> G{"Pre-gate (code)<br/>asks for a person?<br/>card details or charge?"}
    G -- yes --> H1["Handoff sentence written by code<br/>escalate: true · no model call"]
    G -- no --> RT["Router (code)<br/>stage + keywords → stage module + up to 3 policy modules<br/>conflicts settled here (suppresses)"]
    RT --> AS["Assemble (code)<br/>cached core prompt + chosen modules + patient context<br/>+ stored call summary if asked about a call"]
    AS --> LLM["Model call with the same 14 tools<br/>(reads only what this message needs)"]
    LLM --> V{"Validators (code)<br/>links and prices from tools? plain text?<br/>URL last? no card digits? no false claims?"}
    V -- formatting only --> FX[Fix in code] --> OUT
    V -- clean --> E{"Model set escalate?"}
    V -- violation --> RY["One retry<br/>'A validator rejected the reply'<br/>+ allowed URLs and prices"]
    RY --> V2{"Validators again"}
    V2 -- clean --> E
    V2 -- still failing --> H2["Handoff sentence written by code<br/>reason: validator:&lt;name&gt;"]
    E -- yes --> H3["Handoff sentence written by code<br/>model's reason kept"]
    E -- no --> OUT[Reply sent]
    H1 & H2 & H3 & OUT --> T["Trace saved with every reply<br/>modules loaded · why · tools · checks · escalation source · tokens · latency"]

    classDef new fill:#dafbe1,stroke:#1a7f37,color:#1f2328;
    classDef model fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef human fill:#fff8c5,stroke:#9a6700,color:#1f2328;
    class G,RT,AS,V,V2,FX,RY,E,T new;
    class LLM model;
    class H1,H2,H3 human;
```

Green is new code. Blue is the one model call, the same model and tools as before. Yellow is a handoff to a person.

## What each new piece does

| Piece | What it does | Which packet problem it answers |
|---|---|---|
| Pre-gate | Catches clear handoff requests and card details before any model call | Escalation; 5 (no cost for these) |
| Router | Loads only the modules this message needs; settles rule conflicts in code | 1, 5, 6, 7 |
| Policy modules | The original policy text, cut into one file per policy, each with its own tests | 3, 6, 8 |
| Cached core prompt | The short part every message needs; identical bytes every time so the API caches it | 5 |
| Validators and one retry | Check the reply against what the tools returned; retry once with the allowed values | Output quality |
| Code-owned handoff | Code writes the handoff sentence, so it never answers the question or pretends work was done | Escalation |
| Call summary | Prepared once per call ahead of time; added only when the patient asks about a call | 4 |
| Trace | Records what code decided and why for every reply | 2 |

## Done ahead of time, not per message

Cutting the prompt into modules, writing tests, running evals, and summarizing call transcripts all happen before any patient texts. Per message there is code, one model call (two only when a check fails), and code.
