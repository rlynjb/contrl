# Reranking

**Industry name(s):** Reranking, cross-encoder reranking, second-stage ranking
**Type:** Industry standard

> After initial retrieval returns a coarse top-K (say 50 candidates), a reranker re-scores them with a more expensive but more accurate model. Two-stage retrieval: cheap recall first (embedding-based), expensive precision second (cross-encoder). Improves top-10 quality substantially. Cohere Rerank-3 and bge-reranker-large are the production references.

**See also:** → [01-embeddings](./01-embeddings.md) · → [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md) · → [11-rag](./11-rag.md)

---

## Why care

**Move 1.** Your dense retrieval returns top-50 docs with cosine scores 0.85-0.90. Hand-review shows the top-5 isn't well-ordered — the genuinely most-relevant doc is at position 7. The embedding model captured similarity well enough to put it in top-50 but not well enough to put it at the top.

**Move 2.** That "improve ordering of top-K after initial retrieval" question is what reranking answers. A more expensive model (cross-encoder) re-scores the candidates by reading query + doc together. Accuracy improves; only worth the cost on top-K where K is small (50-100).

**Why you need to answer that question at all:** Embedding similarity is a coarse signal — good at finding "in the ballpark" but poor at fine ordering. The LLM at the top of a RAG chain only sees top-K; bad ordering means the LLM doesn't see the best document. Reranking is the precision step.

**Move 5.** Reranking is what `ORDER BY` is after `WHERE` for SQL — first filter to candidates, then sort precisely. Two stages, each doing what it's good at.

---

## How it works

### Move 1 — The mental model

Bi-encoder vs cross-encoder:

```
  Bi-encoder (used in initial retrieval)
  ────────────────────────────────────
  embed(query) → query_vector
  embed(doc) → doc_vector  (pre-computed at indexing)
  similarity = cosine(query_vector, doc_vector)
  
  Fast: pre-computed doc vectors; O(1) per pair at query time.
  Coarse: query and doc embed separately; no cross-interaction.
  
  
  Cross-encoder (used in reranking)
  ────────────────────────────────────
  encoder([query, doc]) → relevance score
  
  Slow: must encode every (query, doc) pair at query time.
  Precise: query and doc attend to each other; captures fine interaction.
```

Strategy in plain English: **bi-encoder retrieves top-50 fast; cross-encoder reranks top-50 to top-10 with precision.**

---

### Move 2 — The layered walkthrough

#### Two-stage retrieval

```
  Pipeline
  
  Query
    │
    ▼
  Stage 1: bi-encoder retrieval (embedding + ANN)
    Returns top-50 candidates
    Time: 10-50ms across 1M docs
    │
    ▼
  Stage 2: cross-encoder reranking
    For each (query, candidate) pair: compute relevance score
    Sort by score
    Returns top-10
    Time: 100-500ms for 50 pairs
    │
    ▼
  Top-10 to downstream LLM
```

Cross-encoders are too slow to apply to the whole corpus (would be O(N) per query). They're cost-effective on a small candidate set.

---

#### Performance gain

Reranking typically improves top-K precision substantially:

```
  Typical reranking impact (rough; varies by task)
  
  ┌──────────────────────────────┬───────────────────────────────┐
  │ Metric                       │ Bi-encoder only / + reranker  │
  ├──────────────────────────────┼───────────────────────────────┤
  │ Recall@50 (in top-50)        │ 90% / 90% (same; rerank      │
  │                              │   doesn't change what's IN)   │
  │ Precision@10 (top-10 correct) │ 60% / 80% (rerank improves   │
  │                              │   ORDER of top-50)             │
  │ MRR (mean reciprocal rank)   │ 0.62 / 0.81                    │
  └──────────────────────────────┴───────────────────────────────┘
```

Reranking improves the *order* of top-K, not the *contents* of top-K. The relevant doc has to be in the initial retrieval set for reranking to help.

---

#### Cost

Cross-encoder calls cost more than embedding calls. Per query at top-50: 50 cross-encoder evaluations. Cohere Rerank-3 prices around $1/1000 reranks-of-100 — so $0.001 per query at top-50. Modest but not free; bundle with cost budgets.

For self-hosted (`bge-reranker-large`): compute cost on your infra. Typical: GPU instance, ~100ms per query at top-50.

---

#### When NOT to rerank

- **Already getting good top-10 from bi-encoder alone.** Eval-set says precision@10 is acceptable; no need.
- **Latency-critical paths** where 100-500ms of additional latency is unacceptable.
- **Tiny corpora** where bi-encoder alone returns the right top-K reliably.

Always measure precision@K with and without reranking. Add the rerank step only if precision improves enough to justify the cost + latency.

---

### Move 3 — The principle

Two-stage retrieval: bi-encoder for fast coarse recall, cross-encoder for precise reordering. The bi-encoder finds the right candidates; the cross-encoder orders them well. Combined, they outperform either alone — and dramatically more than just running one stage harder.

---

## Reranking — diagram

```
┌─ Two-stage retrieval ────────────────────────────────────────────────────────┐
│                                                                              │
│   Query                                                                      │
│     │                                                                        │
│     ▼ embed(query)                                                            │
│   Stage 1: bi-encoder ANN search                                             │
│     Returns top-50 by cosine                                                 │
│     ~10-50ms                                                                 │
│     │                                                                        │
│     ▼                                                                        │
│   Stage 2: cross-encoder reranker                                            │
│     For each (query, candidate) pair:                                        │
│       score = cross_encoder(query, candidate)                                │
│     Sort by score                                                            │
│     Returns top-10                                                           │
│     ~100-500ms                                                               │
│     │                                                                        │
│     ▼                                                                        │
│   Top-10 → downstream LLM                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no retrieval.**

---

## Elaborate

**Where this pattern comes from.** Cross-encoders predate LLMs; two-stage retrieval was popularized for LLM RAG by Cohere and the BGE family 2023-2024.

**The principle.** Two-stage retrieval mirrors database query planning: cheap index scan first, expensive precise filter second.

**Where it breaks down.** Adversarial queries (jailbreak attempts, prompt injection embedded in content) — rerankers may rank misleading content highly because it superficially matches.

---

## Tradeoffs

| Cost dimension | With reranker | Bi-encoder only |
|---|---|---|
| Per-query latency | +100-500ms | Baseline |
| Per-query cost | ~$0.001 (Cohere) | Free (embedding pre-computed) |
| Precision@10 | Substantially higher | Baseline |
| Implementation | Extra integration step | None |

---

## Tech reference

### Cohere Rerank-3

- **Leading today:** `adoption-leading` for managed reranking, 2026.
- **Why it leads:** strong accuracy, simple API, multilingual.

### bge-reranker-large (open-source)

- **Leading today:** `innovation-leading` for self-hosted reranking, 2026.
- **Why it leads:** quality close to Cohere; runs on commodity GPUs.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Reranking is the second stage of retrieval — a cross-encoder re-scores the top-50 candidates from bi-encoder retrieval for better ordering. Improves precision@K substantially. Cost: 100-500ms latency + small per-query API cost. Worth it when the downstream LLM only sees top-K and order matters.

**Key points:**

- **Two stages: bi-encoder recall, cross-encoder precision.**
- **Improves order of top-K**, not the contents.
- **Cohere Rerank-3** is the managed default; **bge-reranker-large** is the self-hosted choice.
- **Measure precision@K** before committing to add the step.
- **For contrl: not applicable.**

---

## Interview defense

**[mid] Why rerank after retrieval?**

The bi-encoder is fast but coarse — good at finding "in the ballpark" docs, not great at ordering them. A cross-encoder reads query + doc together; finer ordering. Cost: extra latency and small per-query fee.

**[senior] When is reranking worth it?**

When precision@K on the downstream LLM matters and bi-encoder alone gives mediocre top-10 ordering. Measure with and without on your eval set; add if improvement justifies cost.

---

## Validate

**Level 1:** Draw two-stage retrieval.
**Level 2:** "Why rerank?" Under 30 seconds.
**Level 3:** A teammate's RAG has correct documents in top-50 but wrong ones in top-3. Diagnose. (Recommend reranker.)
**Level 4:** Defend skipping rerank for latency-critical chains.

**Quick check:**
- Bi-encoder vs cross-encoder difference? (Bi: separate embed; cross: joint encode.)
- Typical top-K to rerank? (50-100)
- Does contrl rerank? (No.)
