# Hybrid retrieval with RRF

**Industry name(s):** Hybrid retrieval, Reciprocal Rank Fusion, dense + sparse merging
**Type:** Industry standard

> Reciprocal Rank Fusion (RRF) merges results from multiple retrieval pipelines (typically dense + sparse) into a single ranked list. Each document's RRF score = sum over pipelines of 1/(rank_in_pipeline + k). Tunable per pipeline with weights. Simple, parameter-light, robust to score-scale differences across pipelines.

**See also:** → [05-dense-vs-sparse](./05-dense-vs-sparse.md) · → [07-reranking](./07-reranking.md) · → [11-rag](./11-rag.md)

---

## Why care

**Move 1.** You run dense and sparse retrieval. Dense returns docs with cosine scores like 0.85, 0.82, 0.79. Sparse returns docs with BM25 scores like 12.3, 9.7, 7.1. The score ranges are incompatible — how do you merge them into a single ranked list? Naive averaging or weighting requires score normalization, which is fragile. RRF sidesteps the problem.

**Move 2.** That "how to merge ranked lists from different scoring systems" question is RRF. Rank-based merging avoids score-scale issues; each pipeline contributes based on rank position, not absolute score.

**Why you need to answer that question at all:** Hybrid retrieval needs a merge step. Naive approaches fail because dense and sparse scores live in incompatible scales. RRF is the production-standard answer.

**Move 5.** RRF is what Borda counting is for ranked-choice voting — combine multiple ranked lists into a consensus ranking without needing the lists to share a scale.

---

## How it works

### Move 1 — The mental model

Each document gets a score from each pipeline based on its rank in that pipeline's results: 1/(rank + k). Top-ranked doc in dense gets 1/(1+60) ≈ 0.0164; second gets 1/(2+60) ≈ 0.0161; etc. Same formula in sparse. Sum the per-pipeline scores; rank by the sum.

```
  RRF score computation
  
  rrf_score(doc) = Σ_pipeline 1 / (rank_in_pipeline + k)
  
  k = constant (typically 60)
  
  Document appearing high in both pipelines gets high combined score.
  Document appearing only in one gets moderate combined score.
  Document not in either gets zero.
```

Strategy in plain English: **rank-based merging; the doc's combined score depends on its rank in each pipeline, not the absolute scores.**

---

### Move 2 — The layered walkthrough

#### The RRF formula

```
  For each document d found by any pipeline:
    rrf_score(d) = Σ over pipelines P:
                     if d in P.results:
                       1 / (P.rank(d) + k)
                     else:
                       0
  
  k typically = 60 (a constant from the original RRF paper)
  
  Sort documents by rrf_score descending → final top-K
```

The constant k controls how steeply early ranks are weighted vs later ranks. Lower k = early ranks dominate; higher k = flatter contribution across ranks. 60 is the conventional choice.

---

#### Worked example

```
  Query results from two pipelines
  
  Dense top-5:    [docA, docB, docC, docD, docE]
  Sparse top-5:   [docC, docF, docA, docG, docB]
  
  RRF scores (k=60):
  
  docA: 1/(1+60) + 1/(3+60) = 0.0164 + 0.0159 = 0.0323
  docB: 1/(2+60) + 1/(5+60) = 0.0161 + 0.0154 = 0.0315
  docC: 1/(3+60) + 1/(1+60) = 0.0159 + 0.0164 = 0.0323
  docD: 1/(4+60) + 0         = 0.0156         = 0.0156
  docE: 1/(5+60) + 0         = 0.0154         = 0.0154
  docF: 0       + 1/(2+60)  = 0.0161         = 0.0161
  docG: 0       + 1/(4+60)  = 0.0156         = 0.0156
  
  Final ranking: docA = docC > docB > docF > docD = docG > docE
```

Documents appearing in BOTH pipelines (docA, docB, docC) rank highest. Documents only in one rank lower.

---

#### Per-pipeline weighting

Sometimes you want to favor one pipeline. Add a weight per pipeline:

```
  rrf_score(d) = Σ over pipelines P:
                   weight_P × (1 / (P.rank(d) + k))
  
  Example weights:
    dense:  weight = 1.0
    sparse: weight = 0.7  (favor dense slightly)
  
  Or vice versa for code-search heavy domains.
```

Tune weights with the eval set — try a few combinations, pick the best.

---

#### Why RRF is robust

1. **No score normalization needed.** Different pipelines produce scores on different scales; RRF only needs the rank.
2. **Parameter-light.** One constant (k); usually doesn't need tuning.
3. **Empirically strong.** Across many retrieval benchmarks, RRF or close variants beat hand-tuned weighted-fusion approaches.

The simplicity is the point — sophisticated fusion methods (learned, score-normalized) often perform worse on out-of-distribution queries.

---

#### When NOT to use RRF

- **Single retrieval pipeline.** RRF degenerates to a re-scoring of one list; no benefit.
- **Pipelines that don't return ranked lists.** Some retrieval systems return unranked sets or scored candidates without sortable order.
- **When you already have a learned-to-rank model.** A trained model can outperform RRF if you have the data and infrastructure to train it. Most teams don't.

---

### Move 3 — The principle

Rank-based fusion sidesteps score-scale incompatibility. RRF is the simple, robust merge for hybrid retrieval. Two pipelines (dense + sparse) typically; can extend to more (multiple embedding models, multiple BM25 indexes per field).

---

## Hybrid retrieval with RRF — diagram

```
┌─ Query ──────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   query string                                                               │
│                                                                              │
└───────────────────┬──────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌─ Dense pipeline ──┐    ┌─ Sparse pipeline ──┐
│                   │    │                    │
│ embed(query)      │    │ tokenize(query)    │
│ cosine search     │    │ BM25 search        │
│ top-50 by sim     │    │ top-50 by BM25     │
│ ranked list       │    │ ranked list        │
│                   │    │                    │
└─────────┬─────────┘    └─────────┬──────────┘
          │                        │
          └──────────┬─────────────┘
                     ▼
            ┌────────────────────┐
            │ RRF merge          │
            │   sum 1/(rank+60)  │
            │   over pipelines   │
            └─────────┬──────────┘
                      ▼
                 Top-K final
```

---

## In this codebase

**Case B — contrl has no retrieval.**

---

## Elaborate

**Where this pattern comes from.** Reciprocal Rank Fusion was introduced in Cormack et al. (2009) "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods." Production adoption for hybrid LLM retrieval picked up 2023+.

**The principle.** Simple methods that don't require careful tuning often win when input distributions are noisy. RRF is empirical demonstration of this.

**Where it breaks down.** When you have enough data and infrastructure to train a learning-to-rank model, that can outperform. But for most teams, RRF is the right default.

---

## Tradeoffs

| Cost dimension | RRF | Score-normalized fusion |
|---|---|---|
| Implementation | Trivial (~20 lines) | Complex (normalization per pipeline) |
| Robustness across queries | High | Lower (normalization can drift) |
| Tunability | k constant, optional per-pipeline weights | More knobs |
| Production fit | Strong default | Better when score scales are stable |

---

## Tech reference

### Most vector DBs support hybrid + RRF natively

- **Weaviate, Qdrant, Elasticsearch** — built-in hybrid search with RRF fusion.
- **pgvector + Postgres FTS** — DIY but straightforward; RRF in application code.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

RRF merges ranked lists by summing 1/(rank + k) per pipeline. Sidesteps score-scale issues. Simple, robust, the production-standard merge for hybrid (dense + sparse) retrieval. For contrl: study material; no retrieval surface today.

**Key points:**

- **rrf_score(d) = Σ 1/(rank(d) + k)** across pipelines.
- **k = 60 conventional.**
- **No score normalization needed.**
- **Robust across query distributions.**
- **For contrl: not applicable.**

---

## Interview defense

**[mid] What's RRF?**

A rank-based merge for results from multiple retrieval pipelines. Each doc's score = sum of 1/(rank + 60) across pipelines. Sidesteps the score-scale problem.

**[senior] Why RRF over weighted score averaging?**

Score scales differ across pipelines (cosine 0-1 vs BM25 unbounded). Naive averaging requires per-pipeline normalization, which drifts as data distributions change. RRF uses rank, which is unitless and stable.

---

## Validate

**Level 1:** Walk through an RRF example with two pipelines.
**Level 2:** "Why use RRF?" Under 30 seconds.
**Level 3:** A teammate's hybrid retrieval has unstable scores. Diagnose. (Likely score-normalized fusion; recommend RRF.)
**Level 4:** Defend RRF over a learned-to-rank model.

**Quick check:**
- Conventional k value? (60)
- What does RRF need from each pipeline? (A ranked list.)
- Does contrl use RRF? (No.)
