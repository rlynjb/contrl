# Retrieval-augmented generation (RAG)

**Industry name(s):** RAG, retrieval-augmented generation, grounded generation, context-augmented LLM
**Type:** Industry standard

> Before the LLM generates, retrieve relevant content from a corpus and inject it into the prompt. The LLM responds grounded in the retrieved content rather than its training distribution. Solves the "model doesn't know your data" problem and the "model hallucinates" problem in one stack. Production RAG combines every concept in this sub-section: chunking + embedding + hybrid retrieval + reranking + grounded prompt assembly.

**See also:** → [01-embeddings](./01-embeddings.md) · → [03-chunking-strategies](./03-chunking-strategies.md) · → [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md) · → [07-reranking](./07-reranking.md) · → [08-query-rewriting](./08-query-rewriting.md) · → [12-graphrag](./12-graphrag.md)

---

## Why care

**Move 1.** You build a chatbot for your customer support. The base LLM doesn't know your product, your prices, your return policy. Fine-tuning is expensive and slow to update. Prompt-stuffing the entire manual blows the context window. RAG threads the needle: retrieve the relevant passage from your docs, inject it into the prompt, the LLM responds grounded in the actual content.

**Move 2.** That "ground the LLM in my specific content without fine-tuning" question is what RAG answers. Not how to talk to the LLM; just how to get *your* content in front of it relevant to the query.

**Why you need to answer that question at all:** Three failures hide in non-grounded LLM use. First, **hallucinations** — the LLM makes up plausible-sounding answers when it doesn't know. Second, **stale information** — base models don't know recent events. Third, **proprietary data gap** — base models don't know your customer's order history or internal docs.

**Move 5.** RAG is what providing the relevant page of a textbook to a student before asking the question — instead of trusting them to remember, give them the source material.

---

## How it works

### Move 1 — The mental model

The full pipeline composes everything from this sub-section:

```
  User query
    │
    ▼
  Query rewriting (optional, HyDE / expansion)
    │
    ▼
  Retrieval (hybrid: dense + sparse, RRF-merged)
    │
    ▼
  Reranking (cross-encoder, top-50 → top-10)
    │
    ▼
  Context assembly (top-K chunks + citations + the query)
    │
    ▼
  LLM call with the assembled context
    │
    ▼
  Answer with citations
```

Strategy in plain English: **retrieve relevant content first; let the LLM answer using that content; cite sources.**

---

### Move 2 — The layered walkthrough

#### The grounded-prompt structure

```
  RAG prompt anatomy
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ system: "You are a customer support assistant. Answer using ONLY  │
  │  the provided context. If the context doesn't contain the answer, │
  │  say so. Cite source documents by their [doc_id]."                │
  │                                                                    │
  │ context:                                                          │
  │   [doc_47] "Our return policy allows returns within 30 days..."   │
  │   [doc_12] "Refunds are processed in 5-7 business days..."        │
  │   [doc_89] "Items must be unopened for full refund..."            │
  │                                                                    │
  │ user: "Can I return this item after a month?"                     │
  └──────────────────────────────────────────────────────────────────┘
  
  Expected LLM output:
    "According to our return policy [doc_47], returns are allowed
     within 30 days. After a month (30+ days), returns are not 
     accepted under standard policy."
```

Three things matter:

1. **System prompt scopes the LLM**: "answer using only the context."
2. **Context provides ground truth.** Retrieved chunks with citations.
3. **LLM responds with citations.** Lets users verify.

---

#### Citations and grounding

Each retrieved chunk has a doc_id; the LLM is instructed to cite them. Two patterns:

**Inline citations** in prose: "According to [doc_47]..." or "...the return policy [doc_47]..."

**Footnote-style** at the end: "Returns are allowed within 30 days.\n\nSources: [doc_47], [doc_12]"

Either works. The discipline is making the citation traceable — the user (or a downstream validator) can verify the LLM didn't make something up.

---

#### The "I don't know" instruction

RAG's biggest failure mode: the LLM tries to answer even when the context doesn't contain the answer. Instruct it explicitly:

```
  System prompt addendum
  
  "If the provided context does not contain the answer, respond with 
   'I don't have that information.' Do not make up an answer."
```

In practice this doesn't fully solve the problem — LLMs sometimes confabulate anyway. Combined with citation discipline and evaluation, it raises the bar substantially.

---

#### Failure modes

```
  RAG failure modes (with corresponding fixes from sub-section concepts)
  
  ┌──────────────────────────────────────┬──────────────────────────────┐
  │ Failure                              │ Where to look                  │
  ├──────────────────────────────────────┼──────────────────────────────┤
  │ Wrong docs retrieved                 │ Chunking, embedding model,     │
  │                                       │ retrieval strategy             │
  │ Right docs missed (in top-50)        │ Reranking + query rewriting    │
  │ Right docs found, wrong order        │ Reranking                      │
  │ Stale information in answers         │ Stale embeddings; re-index     │
  │ LLM confabulates despite context     │ Stronger grounding prompt;     │
  │                                       │ smaller context (less noise)   │
  │ Slow retrieval at scale              │ Vector DB choice; ANN tuning   │
  │ Edge cases miss (exact-keyword query)│ Add sparse / hybrid             │
  └──────────────────────────────────────┴──────────────────────────────┘
```

Each failure traces to a sub-section. The discipline of debugging RAG: identify failure mode, address the corresponding concept.

---

#### Evaluating RAG

RAG has two quality dimensions:

- **Retrieval quality.** Did we get the right chunks? Metric: recall@K, precision@K.
- **Generation quality.** Did the LLM use them correctly? Metric: faithfulness (does the answer match the context), answer relevance.

Frameworks like RAGAS provide standard metrics. Hand-rolled evals work too: golden set of (query, expected-chunks, expected-answer) triples; run RAG; score retrieval + generation separately.

---

#### Context window budgeting

Retrieved chunks compete with system prompt, few-shot, conversation history for context-window space. Practical limits:

- 10-20 chunks at 500 tokens each = 5-10K context tokens.
- Plus system prompt + history = comfortably under 32K window.

Larger context windows (200K+) allow more chunks, but lost-in-the-middle effects mean you can't usefully cram 100 chunks into the context.

---

### Move 3 — The principle

RAG composes all the retrieval primitives + grounding discipline. The pipeline: chunk corpus → embed → retrieve at query time → rerank → grounded prompt → cite sources. Each stage has its own concepts (covered in 01-10 of this sub-section). RAG is the production-shape integration.

---

## RAG — diagram

```
┌─ Offline (one-time + ongoing) ───────────────────────────────────────────────┐
│                                                                              │
│   Documents → chunking → embedding → vector DB                               │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Online (per query) ─────────────────────────────────────────────────────────┐
│                                                                              │
│   user query                                                                 │
│         │                                                                    │
│         ▼ optional: query rewriting (HyDE / expansion)                       │
│   transformed query                                                          │
│         │                                                                    │
│         ▼                                                                    │
│   Hybrid retrieval (dense + sparse + RRF) → top-50                           │
│         │                                                                    │
│         ▼                                                                    │
│   Reranking (cross-encoder) → top-10                                         │
│         │                                                                    │
│         ▼                                                                    │
│   Context assembly: top-K chunks + citations + grounding system prompt      │
│         │                                                                    │
│         ▼                                                                    │
│   LLM call                                                                   │
│         │                                                                    │
│         ▼                                                                    │
│   Answer with citations                                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no RAG.**

contrl's coaching agent uses tool calls against local SQLite (not retrieval against a corpus). The agent reads specific structured records; doesn't retrieve passages from documents.

The closest concept: the agent's `get_exercise_cues` tool returns coaching-tip strings from a fixed catalog. If that catalog grew to thousands of cues, RAG over the catalog could replace the lookup tool. Not currently planned.

---

## Elaborate

**Where this pattern comes from.** RAG was named in Lewis et al. (2020) "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks." Production adoption exploded 2022-2024 as embedding models and vector DBs matured. By 2026, RAG is the default for grounding LLMs in proprietary or current data.

**The principle.** Retrieve before you generate. The principle generalizes — anywhere a model risks hallucination, providing source material reduces the risk. RAG is the LLM-specific instantiation.

**Where it breaks down.** Three places.

1. **Reasoning across many docs.** If the answer requires synthesizing 20 documents, retrieving 5 chunks may miss the key ones. Hierarchical retrieval or longer-context models help.
2. **Multi-hop questions.** "What's the relationship between X and Y?" requires linking docs. Standard RAG retrieves on the surface query; multi-hop RAG iterates.
3. **Genuinely creative tasks.** RAG grounds outputs in retrieved content; for creative tasks where grounding is unwanted, it gets in the way.

**What to explore next.**
- All of `03-retrieval-and-rag/` — each piece of the RAG stack.
- [12-graphrag](./12-graphrag.md) — RAG over knowledge graphs.
- [05-evals-and-observability/02-eval-methods](../05-evals-and-observability/02-eval-methods.md) — RAG eval methodology.

---

## Tradeoffs

| Cost dimension | RAG | Fine-tuning | Pure base LLM |
|---|---|---|---|
| Setup cost | High (pipeline) | Highest (training) | Lowest |
| Per-query cost | Moderate (retrieval + LLM) | Low (just LLM) | Low |
| Freshness | High (corpus updates immediately) | Low (re-train to update) | None |
| Customization | High (proprietary content) | Highest (custom behavior) | None |
| Grounding | Yes (citations) | Sometimes | No |

### Sub-block 1 — what we gave up

Pipeline complexity. Vector DB, chunking, embedding, retrieval, reranking, prompt assembly. Real engineering investment for any production RAG.

### Sub-block 2 — what fine-tuning would have cost

Documented: fine-tuning requires labeled training data, training infrastructure, evaluation, model versioning, deployment pipeline. For most "ground in my docs" use cases, RAG is dramatically cheaper and faster.

### Sub-block 3 — the breakpoint

RAG is the right call until: (a) corpus is small enough to fit in the prompt directly (skip the pipeline); (b) the task is purely generative (no grounding needed); (c) the answer requires deeper customization than ground-in-context can provide (fine-tuning territory).

---

## Tech reference

### LangChain / LlamaIndex / Haystack

- **Leading today:** `adoption-leading` for RAG orchestration frameworks, 2026.
- **Why they lead:** integrate the pipeline pieces; ecosystem support.

### RAGAS (eval framework)

- **Leading today:** `adoption-leading` for RAG-specific evaluation, 2026.
- **Why it leads:** dedicated metrics (faithfulness, answer relevance, context precision).

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

RAG retrieves relevant content from a corpus before LLM generation, grounding the answer in source material. The pipeline composes chunking, embedding, hybrid retrieval, reranking, query rewriting, grounded prompt assembly. Each piece is its own concept (covered in 01-10 of this sub-section). RAG is the production integration. For contrl: not applicable.

**Key points:**

- **Grounded generation.** LLM uses retrieved content, not just training distribution.
- **Pipeline composes every concept in this sub-section.**
- **Citations required.** Make the LLM's grounding traceable.
- **"I don't know" prompt addendum** reduces but doesn't eliminate confabulation.
- **For contrl: Case B.** No corpus to retrieve over.

---

## Interview defense

**[mid] What is RAG?**

Retrieve relevant content from a corpus before LLM generation; inject into the prompt; LLM answers grounded in the retrieved content. Solves hallucination + stale-info + proprietary-data problems without fine-tuning.

**[senior] Walk me through a production RAG pipeline.**

Chunk + embed + index docs offline. Online: query → (optional) HyDE rewrite → hybrid retrieval (dense + sparse, RRF-merged) → rerank (cross-encoder) → context assembly (top-K chunks with citations + grounding system prompt) → LLM call → answer with inline citations.

**[arch] How do you evaluate RAG?**

Two dimensions: retrieval (recall@K, precision@K — got the right chunks?) and generation (faithfulness, answer relevance — used them correctly?). Frameworks like RAGAS standardize these.

---

## One-line anchors

- "Retrieve before generate. Ground in source material."
- "Citations are required for traceability."
- "Pipeline composes chunking + embedding + hybrid retrieval + reranking + grounded prompt."
- "Two eval dimensions: retrieval quality and generation faithfulness."
- "For contrl: not applicable. Agent uses tool calls, not retrieval."

---

## Validate

**Level 1:** Draw the full RAG pipeline.
**Level 2:** "What's RAG?" Under 30 seconds.
**Level 3:** A teammate's chatbot hallucinates product information. Recommend RAG. (Embed product docs; retrieve at query time; ground the answer.)
**Level 4:** Defend RAG over fine-tuning for a "ground in my docs" use case.

**Quick check:**
- Three problems RAG solves? (Hallucination, stale info, proprietary data.)
- The "I don't know" prompt addendum prevents what? (Confabulation when context is insufficient.)
- Does contrl use RAG? (No — agent uses tool calls.)
