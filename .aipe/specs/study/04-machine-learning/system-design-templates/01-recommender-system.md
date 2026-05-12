# Recommender system design

**Industry name(s):** Recommender system, learned ranker, IK Module 2: Recommender systems
**Type:** Industry standard

> Predict what a user will engage with next from a catalog. Content-based, collaborative, or hybrid. Eval with offline (precision@k, MRR, NDCG) and online (CTR, conversion).

**See also:** → [../11-recommender-framing.md](../11-recommender-framing.md) · → [../12-cold-start.md](../12-cold-start.md)

---

- **The prompt:** Design a recommender system that suggests the next item for a user from a catalog, balancing relevance, diversity, and freshness.

- **Standard architecture:**

  ```
  user state (history, preferences, context)
        │
        ▼
  ┌──────────────────┐
  │ candidate gen    │  ── retrieval: filter catalog to ~1000 candidates
  │ (content + collab│       (rules: not-recently-shown, in-catalog, ...)
  │  signals)        │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ ranker (LightGBM │  ── score each candidate
  │ predicts P(engage│       (features: user × item interactions)
  │ |user,item))     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ post-process     │  ── diversity, freshness, fairness
  │ (re-rank)        │       (no same item twice in 3 sessions)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ serving + log    │  ── return top-k, log (user, candidates, picked)
  └──────────────────┘
  ```

- **Data model:**
  - `users` — `{id, signup_date, attributes}`
  - `items` — `{id, content_features, popularity_score, freshness_score, created_at}`
  - `interactions` — `{user_id, item_id, action, timestamp}` (clicks, completions, dwell)
  - `recommendation_log` — `{request_id, user_id, candidate_set, ranked_top_k, picked_id, ts}`

- **Key components:**
  - *Candidate generation*: content-based filter (similar to recent history) + collaborative filter (users like you also did) + rules (in-catalog, eligibility). For contrl-mo, content-only because one user.
  - *Ranker*: LightGBM predicting P(engage|user, item). Features cover user-item interaction history + item attributes + recency.
  - *Post-processor*: diversity (no same item 3× in a row), freshness (boost new-to-user), fairness (don't over-promote popular items).
  - *Eval*: offline precision@k, MRR, NDCG on a held-out set; online CTR, completion rate, A/B vs control arm.

- **Scale concerns:**
  - At ~1M users × 100K items: ranker can't score all items per request. Candidate gen must reduce to ~1000 per request. Mitigation: two-stage architecture (recall then rank).
  - At ~10K requests/sec: ranker latency budget tight. Mitigation: feature store with pre-computed user features; small enough ranker for sub-50ms.
  - At ~100M interactions/day: training set explodes. Mitigation: sample (recent + diverse), use approximate methods (HogWild!, async SGD).

- **Eval framing:**
  - Offline: precision@k, recall@k, MRR, NDCG on a labeled (or click-derived) ground truth set.
  - Online: CTR (clicked / recommended), conversion (completed / clicked), session length, retention.
  - "No-click is not a negative label" — user may have seen the recommendation and chosen later, or just been busy. Always pair with explicit dwell or completion signals.

- **Common failure modes:**
  - Position bias (top recommendations get clicks regardless). Mitigation: randomize occasionally for unbiased training data.
  - Popularity bias (already-popular items dominate). Mitigation: explicit popularity penalty in ranker.
  - Cold-start (new users / new items). Mitigation: fallback to rules / popular items; threshold for learned model.
  - Echo chamber (model recommends similar to past clicks indefinitely). Mitigation: diversity injection in post-processing.

- **Applies to this codebase:** `partially`. contrl-mo's planned progression recommender (Phase 2C) IS this template at single-user scale. Content-based only (no collaborative signal); rule-based v1 + learned v2; diversity check. The architecture matches; the scale doesn't (1 user vs ~1M).

- **How to make it apply:** This template *is* contrl-mo's recommender plan. Phase 2C exercises B2C.14 (rules), B2C.15 (learned), B2C.16 (cold-start), B2C.17 (diversity), B2C.18 (single-user A/B) build it. After Phase 2C completes, this template is implemented at one-user scale; defending the template = defending Phase 2C.
