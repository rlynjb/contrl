# Agentic RAG

**Industry name(s):** Agentic RAG · Iterative retrieval · Retrieval-augmented reasoning loop
**Type:** Industry standard

> Static RAG retrieves once and generates. Agentic RAG runs a loop: decompose the query into sub-questions, retrieve for each, evaluate whether the retrieval is sufficient, re-retrieve or generate. The cost is 3-10× tokens and 2-5× latency over static RAG; the win is multi-step and cross-source queries that one-shot retrieval can't handle. **Case B for contrl** — the planned coaching agent uses tool calls over structured data, not embedding retrieval.

**See also:** → retrieval mechanics: [`.aipe/study-ai-engineering/03-retrieval-and-rag/11-rag.md`](../../study-ai-engineering/03-retrieval-and-rag/11-rag.md) · → [02-self-corrective-rag.md](./02-self-corrective-rag.md) · → [01-reasoning-patterns/02-react.md](../01-reasoning-patterns/02-react.md)

---

## Why care

**Move 1.** A user asks a complex question — "summarize the auth-flow changes across the last three releases and the related controller tests." Static RAG retrieves top-k chunks against the literal query and stuffs them into the prompt. The chunks miss half the answer because the query is genuinely multi-step: it needs to find releases, then find auth-flow changes per release, then find controller tests per change. One-shot retrieval can't do that.

**Move 2.** That "should I loop the retrieval" question is what agentic RAG answers. Not how embeddings work. Just: when does a retrieve-then-generate pipeline need to become a retrieve-evaluate-retrieve-generate loop.

**Why it matters: most production RAG systems eventually need an agentic loop because the questions users actually ask are multi-step. Static RAG works for FAQ-style queries and fails on synthesis questions.**

**Move 5.** Agentic RAG is to static RAG what ReAct is to a chain: the model decides when retrieval is enough, instead of the engineer pre-deciding.

---

## How it works

### Move 1 — The mental model

```
┌─ Static RAG (one shot) ──────────────────────────────────────────┐
│                                                                  │
│   query → retrieve(top_k) → stuff into prompt → generate         │
│                                                                  │
│   no evaluation. no second pass. the chunks are what they are.   │
└──────────────────────────────────────────────────────────────────┘


┌─ Agentic RAG (a loop) ───────────────────────────────────────────┐
│                                                                  │
│        ┌────────────────────────────────────────────────┐        │
│        │  decompose query into sub-questions            │        │
│        └────────────────────┬───────────────────────────┘        │
│                             ▼                                    │
│        ┌────────────────────────────────────────────────┐        │
│        │  retrieve for each sub-question                │        │
│        │  (route to the right source — see 03)          │        │
│        └────────────────────┬───────────────────────────┘        │
│                             ▼                                    │
│        ┌────────────────────────────────────────────────┐        │
│        │  evaluate: is this enough to answer the query? │        │
│        └──────────┬─────────────────────┬────────────────┘        │
│                   ▼ yes                 ▼ no                      │
│              generate answer       re-retrieve                    │
│                                    (refine, decompose more)       │
│                                          │                        │
│                                          └──── loop (cap K=3-5)   │
└──────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** retrieval is a tool the agent calls in a loop until it has enough to answer. The loop has the same control envelope as any other agent loop — iteration cap, token budget, halt conditions.

### Move 2 — The pattern in three layers

#### Layer 1 — decomposition

The agent breaks the user's complex query into sub-questions. "Summarize auth-flow changes across the last three releases and related tests" decomposes into: (a) which releases? (b) what auth-flow changes in each? (c) what tests cover them? Each sub-question becomes a separate retrieval call.

#### Layer 2 — evaluation

After retrieval, the agent grades whether the retrieved chunks are sufficient. The grader is itself an LLM call: "does this content answer the sub-question?" If no, the loop continues; if yes, generation begins.

#### Layer 3 — termination

The loop terminates on three conditions: (a) the agent decides it has enough, (b) the iteration cap fires, (c) the token budget hits the ceiling. Without these caps, agentic RAG can run forever on hard questions.

### Move 3 — The principle

Agentic RAG is *all agentic AI; not all agentic AI does retrieval.* The reframe to keep in mind: the loop is the same ReAct loop — reason, act, observe. The action happens to be retrieval. Treat agentic RAG as a special case of single-agent ReAct where the tool registry is the retrieval surface.

---

## Agentic RAG — diagram

```
USER QUERY
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ ReAct loop (retrieval-shaped tools)                              │
│                                                                  │
│   Reason  → "I need releases first"                              │
│   Act     → retrieve(query="recent releases", source="git")     │
│   Observe → [r1, r2, r3]                                         │
│                                                                  │
│   Reason  → "Now auth-flow changes per release"                  │
│   Act     → retrieve(query="auth changes in r3", source="docs") │
│   Observe → [chunk1, chunk2]                                     │
│                                                                  │
│   Reason  → "Sufficient? Yes — synthesize"                       │
│   Act     → emit final answer                                    │
│                                                                  │
│   capped: max 5 iterations, max ~10k retrieval-tokens            │
└──────────────────────────────────────────────────────────────────┘

Cost vs static RAG:
  - static: 1 retrieve + 1 generate
  - agentic: K retrieves + K evaluations + 1 generate, where K≈2-5
  - typical: 3-10× tokens, 2-5× latency
```

---

## In this codebase

**Case B — not used by contrl.**

The planned coaching agent retrieves over structured local data through five typed tool calls — `get_classifier_output`, `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues`. The data shape is structured (SQLite tables, ONNX classifier output), not unstructured text. Embedding retrieval would be the wrong tool: you don't embed a SQL table to query it.

When agentic RAG would land in contrl: if the agent's surface grew to include retrieval over unstructured content — coaching notes the user types, training-philosophy documents, or the user's own past workout reflections as freeform text. That content would warrant chunking, embedding, and retrieval. None of it is in scope today.

If/when it lands, planned path would be `src/services/rag/` with the retrieval tools added to the agent's tool registry. The shape is in the system design template at SECTION F.

---

## Elaborate

**Where this pattern comes from.** The agentic-RAG framing emerged in 2023-2024 as production RAG teams hit the wall on multi-step queries. The naming was crystallized by LangChain and LlamaIndex blog posts. Conceptually it's just ReAct applied to retrieval — the framework was the structural insight, not a new technique.

**The deeper principle.** Static RAG assumes the user's query and the answer's evidence are one hop apart. That's true for FAQ retrieval (Q: where is X documented? A: chunk that contains X). It's false for synthesis questions where the answer requires combining evidence the user didn't name. The loop is the answer; the loop's cost is the price.

**Where this breaks down.** When the data is structured. Embedding retrieval is for unstructured text; SQL queries are for structured data. A coaching system that "retrieves" from SQLite via embeddings would lose precision for no benefit. If the data is structured, use tool calls; if unstructured, use retrieval.

**What to explore next.** [02-self-corrective-rag.md](./02-self-corrective-rag.md) for the grading layer; [`.aipe/study-ai-engineering/03-retrieval-and-rag/11-rag.md`](../../study-ai-engineering/03-retrieval-and-rag/11-rag.md) for static RAG.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Agentic RAG                       │ Static RAG                       │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Cost per query     │ 3-10× tokens                      │ baseline                         │
│ Latency            │ 2-5× (serial retrieves)           │ baseline                         │
│ Multi-step queries │ handles                            │ fails or gives partial answer    │
│ Single-step queries│ overkill                          │ right tool                       │
│ Cap discipline     │ iteration + token budget required │ trivially bounded                │
│ Eval surface       │ trajectory + final answer          │ final answer only                │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what agentic RAG costs

Three to ten times the tokens of static RAG. The loop runs K retrievals, K grader calls, plus the final generation. At K=3 typical, that's 7× a static RAG call. For high-volume systems this is a budget problem; for low-volume systems with multi-step queries it's the right trade.

### Sub-block 2 — what static RAG misses

Multi-step questions. Anything that requires combining evidence from two or more retrieval rounds. Synthesis questions, comparative questions, cross-source questions — all fail or degrade on static RAG. If your eval set is dominated by these, agentic RAG is mandatory.

### Sub-block 3 — the breakpoint

Use static RAG for FAQ-style queries (one hop, one answer). Switch to agentic RAG when the eval set is dominated by multi-step queries. The breakpoint is the eval mix, not architectural preference.

### Sub-block 4 — what isn't a tradeoff

"Agentic RAG is always better than static." Not for single-hop queries where the cost-per-token-improved isn't worth it. Static RAG remains the right call for many production systems.

---

## Tech reference (industry pairing)

### LangGraph for retrieval orchestration

- **Codebase uses:** not used. contrl doesn't plan agentic RAG.
- **Why it's here:** the explicit-graph framework makes the retrieve-evaluate-retrieve-generate loop inspectable, with checkpointed state.
- **Leading today:** LangGraph — innovation-leading for graph-orchestrated RAG, 2026.

### LlamaIndex query engine

- **Codebase uses:** not used.
- **Why it's here:** Python-side ecosystem with built-in agentic-RAG primitives (query decomposition, sub-question engines).
- **Leading today:** LlamaIndex — adoption-leading for Python RAG with agent loops, 2026.

---

## Summary

### Concept recap

Agentic RAG is ReAct whose primary tool is retrieval — decompose, retrieve, evaluate, loop, generate. Costs 3-10× tokens and 2-5× latency over static RAG, with the iteration cap as a hard requirement. Earn its place when the eval is dominated by multi-step queries. contrl: Case B — uses tool calls over structured data, not embedding retrieval, so the pattern doesn't apply.

### Key points

- Agentic RAG = ReAct + retrieval-shaped tools.
- Cost is 3-10× static RAG; latency 2-5×. Pay only when multi-step queries dominate.
- Cap iterations (K=3-5) and token budget — non-negotiable for loops.
- Structured data wants tool calls; unstructured data wants retrieval.
- contrl: Case B. Tool calls suffice for the coaching agent.

---

## Interview defense

### Likely questions

**[mid] What's agentic RAG?**

ReAct whose primary tool is retrieval. Instead of retrieve-then-generate, the agent runs a loop: decompose the query, retrieve for each sub-question, evaluate sufficiency, re-retrieve or generate. The cost is 3-10× static RAG; the win is multi-step queries.

**[senior] Why doesn't contrl use it?**

The planned data shape is structured — SQLite tables and ONNX classifier output. Embedding retrieval is for unstructured text. Tool calls (`get_form_history`, `get_classifier_output`, etc.) over structured data are the right primitive. Agentic RAG would be a category error here.

**[arch] When would static RAG be enough?**

When the eval set is dominated by FAQ-style queries — one question, one hop, one answer. Anything multi-step or synthesis-shaped needs the loop. The eval mix is the deciding factor.

### One-line anchors

- "Agentic RAG is ReAct with retrieval-shaped tools."
- "Structured data wants tool calls; unstructured data wants retrieval."
- "Cap iterations or the loop runs forever on hard questions."

---

## Validate

**Level 1 — Reconstruct the diagram.** Static RAG vs agentic RAG, side by side.

**Level 2 — Explain in 60s.** When does agentic RAG earn its 3-10× cost?

**Level 3 — Apply.** A teammate proposes adding agentic RAG to contrl's coaching agent. What's the question you ask back?

**Level 4 — Defend.** Defend the choice of tool calls over agentic RAG for contrl's planned coaching surface.

**Quick check.**
- What's the cost multiplier? — 3-10× tokens, 2-5× latency vs static RAG.
- Why doesn't contrl use it? — Structured data shape; tool calls over SQLite/ONNX are the right primitive.
- What's the cap discipline? — Iteration cap (K=3-5) + token budget.
