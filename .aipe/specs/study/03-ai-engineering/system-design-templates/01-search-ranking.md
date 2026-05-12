# Search ranking system design

**Industry name(s):** Search ranking, learned-to-rank, IK Module 1: Search ranking
**Type:** Industry standard

> Given a user query, return the top-k most relevant items from a corpus. The interview template that asks you to design retrieval + ranking + serving + eval.

**See also:** → [../04-tool-routing.md](../04-tool-routing.md) · → [../../04-machine-learning/19-ml-system-design.md](../../04-machine-learning/19-ml-system-design.md)

---

- **The prompt:** Design a search ranking system that takes a user query and returns the top-k most relevant items from a corpus.

- **Standard architecture:**

  ```
  user query
       │
       ▼
  ┌─────────────────┐    ┌─────────────────┐
  │ query rewrite   │ ─► │ retrieval (BM25 │
  │ (optional LLM)  │    │  + vector + RRF)│ ── top 1000 candidates ──┐
  └─────────────────┘    └─────────────────┘                          │
                                                                       ▼
                                                            ┌──────────────────┐
                                                            │ ranker (LightGBM │
                                                            │ or cross-encoder)│
                                                            └────────┬─────────┘
                                                                     │  top k
                                                                     ▼
                                                            ┌──────────────────┐
                                                            │ serving layer    │
                                                            │ (cache + logging)│
                                                            └────────┬─────────┘
                                                                     │
                                                                     ▼
                                                              top-k results
  ```

- **Data model:**
  - `items` — `{id, title, text, tags, embedding, popularity_score, freshness_score}`
  - `interactions` — `{user_id, item_id, action, dwell_ms, timestamp}` (clicks + dwell for training signals)
  - `query_log` — `{query_id, query_text, returned_items[], clicked_items[]}`
  - `ranker_features` — denormalized features per (query, item) for training

- **Key components:**
  - *Retrieval*: hybrid BM25 + dense vector with Reciprocal Rank Fusion (RRF). BM25 catches keyword matches; dense vectors catch semantic matches; RRF combines without needing score calibration.
  - *Ranker*: LightGBM trained on `(query, item, label)` where label = "did the user click + dwell". Per-class is irrelevant — this is ranking.
  - *Cross-encoder reranker (optional)*: on top-100 from ranker, score with a neural cross-encoder for the final top-10. Expensive; only on hot queries.
  - *Serving*: caches popular queries; logs every (query, returned_items, clicked_item) for training.
  - *Eval*: hit@k, MRR, NDCG on a held-out query set; A/B on online CTR.

- **Scale concerns:**
  - At ~10M docs: retrieval needs index sharding (vector index + BM25 index per shard, fan-out per query). Mitigation: invert by topic, route queries to relevant shards.
  - At ~10K QPS: ranker latency budget tight; pre-compute features for popular (query, item) pairs and cache. Mitigation: feature store with TTL.
  - At ~1M new docs/day: index updates must be incremental (not full rebuild). Mitigation: dual-write to live + shadow index, swap atomically.

- **Eval framing:**
  - Offline: hit@k, MRR, NDCG on a labeled query-judgment set.
  - Online: CTR, dwell, session length, query reformulation rate.
  - "No-click is not a negative label" — a user who didn't click might have got their answer from the snippet alone. Use adversarial test sets with known no-click positives.

- **Common failure modes:**
  - Stale embeddings (docs updated but embedding wasn't). Mitigation: mark `embedding_stale_at`, re-embed on idle pass.
  - Position bias (top results get clicks regardless of relevance). Mitigation: randomize top-3 occasionally for unbiased training data.
  - Popularity bias (the rich get richer). Mitigation: explicit diversity boost in ranker.
  - Query intent mismatch (same query means different things to different users). Mitigation: query expansion or personalization.

- **Applies to this codebase:** `no`. contrl-mo has no search surface. The closest thing is "find the next exercise to do", which is a recommender (see [`../../04-machine-learning/system-design-templates/01-recommender-system.md`](../../04-machine-learning/system-design-templates/01-recommender-system.md)), not a search. This template is included because the IK curriculum names it as a foundational ML system-design framing every candidate should be able to defend.

- **How to make it apply:** Adding a workout-search feature ("find me exercises that target glutes I haven't done in 6 weeks") would turn this into a real system-design exercise in contrl-mo. Today it's a thought experiment. The Phase 2C work on the recommender uses some of the same eval concepts (precision@k, MRR), so reading this template makes the recommender template easier.
