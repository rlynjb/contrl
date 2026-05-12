# Recommender systems framing

**Industry name(s):** Recommender systems, content-based filtering, collaborative filtering, hybrid, diversity / freshness / fairness
**Type:** Industry standard

> Three classic shapes: content-based (recommend items similar to what the user liked), collaborative filtering (recommend what similar users liked), hybrid (combine both). For a single-user fitness app, content-based dominates because there are no "similar users".

**See also:** → [12-cold-start](./12-cold-start.md) · → [10-ab-testing-single-user](./10-ab-testing-single-user.md)

---

## Why care

Recommender systems are IK ML Module 2's anchor and one of the most production-deployed ML shapes. Netflix recommends movies, Spotify recommends songs, your fitness app recommends what exercise to do today. Understanding the three classic strategies — and which fits which problem — is foundational.

The pattern is **content + collaborative + diversity** — three independent design axes that you mix to fit the problem. For contrl-mo, the mix tilts heavily toward content because the user base is one person.

---

## How it works

Three strategies, each appropriate for different problem shapes.

### Strategy 1 — Content-based filtering

Recommend items similar to what the user has engaged with before. "Similar" defined by item features: an exercise's category, level, target reps, tempo.

```
User did:    L2 push exercises, prefers tempo=Steady
Recommend:   another L2 push exercise with tempo=Steady
```

Pros: no need for other users; works on day 1 once the user has logged anything. Cons: only recommends similar items — narrows the user's exposure.

### Strategy 2 — Collaborative filtering

Recommend items that *similar users* liked. "Similar" defined by user behavior — who else did similar workouts and what came next.

```
Users like you also did:  novice-trx-scapula-pullups next
```

Pros: discovers items the user wouldn't think to try; serendipity. Cons: needs many users; cold-start is brutal (no recommendations until you have user data).

### Strategy 3 — Hybrid

Combine: take content-based candidate set, re-rank with collaborative signals; or vice versa.

### Strategy 4 — Diversity, freshness, fairness

Even an "optimal" recommender produces bad outputs without constraints:
- **Diversity:** don't recommend the same exercise 3 sessions in a row.
- **Freshness:** include some new-to-the-user exercises.
- **Fairness:** if the model has biases, surface less-favored options sometimes.

Curriculum item B2C.17 names diversity as a freshness check: "never recommend the same exercise 3 sessions in a row, even if the model says it's optimal".

### Move 2.5 — What contrl-mo actually needs

A single-user app:
- Content-based is the dominant strategy.
- Collaborative is impossible (one user).
- Diversity / freshness apply.

The v1 recommender is rule-based ([12-cold-start](./12-cold-start.md)): given gate state and recent history, pick an exercise. The v2 is a learned classifier predicting "which exercise maximizes clean-session probability?" trained on the user's own session history (B2C.15).

### Move 3 — The principle

Recommender systems are a fit-the-problem space. Naively reaching for "collaborative filtering" because Netflix uses it would be wrong here. Start with the simplest strategy that fits the user model.

---

## Three strategies — diagram

```
   Content-based                Collaborative                Hybrid
   ──────────────────────       ────────────────────────     ─────────────────────
   "you liked X,                "users like you also          "you liked X — start
    here's items like X"         did Y next"                   with similar; then
                                                              promote what user-
   needs: item features         needs: many users +           cohort suggests"
                                 their behavior

   contrl-mo fit                contrl-mo fit                 contrl-mo fit
   ─────────────                ─────────────                 ─────────────
   ✓ works with 1 user          ✗ no other users              ✓ degenerates to
   ✓ explainable                ✗ cold-start                    content-based
   ✗ narrow exposure                                          ✓ ready for multi-user
                                                                later
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected:
- Rule-based v1: `src/services/ml/recommend-rules.ts` (B2C.14)
- Learned v2: `src/services/ml/recommend-learned.ts` (B2C.15)
- Diversity check: `src/services/ml/recommend-diversity.ts` (B2C.17)

---

## Elaborate

### Where this pattern comes from

Content-based and collaborative filtering were formalized in the 1990s (GroupLens, Amazon). The hybrid approach was the response to "neither is enough" — Netflix Prize made hybrid models famous.

### The deeper principle

A recommender is a search over the item space, ranked by predicted user preference. The strategies differ in *how* preference is estimated: from item features (content), from user-cohort behavior (collaborative), or both (hybrid). Pick the estimation strategy based on the data you have.

### Where this breaks down

When the user base is too small for collaborative, the item space is too small for content-based to be useful (everything looks similar), or both. For contrl-mo, ~30 exercises across 3 categories × 5 levels is small but workable.

### What to explore next

- [12-cold-start](./12-cold-start.md) → what to do day 1
- [10-ab-testing-single-user](./10-ab-testing-single-user.md) → how to validate

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Content-based (planned)          │ Collaborative (alt)              │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Cold-start         │ Works after first session        │ Needs many user-sessions          │
│ Item features      │ Required (have them)             │ Not needed                        │
│ Other users        │ Not needed                       │ Required                          │
│ Serendipity        │ Low                              │ High                              │
│ Explainability     │ High ("similar tempo")           │ Medium ("others did")             │
│ Maintenance        │ Small                            │ Big (matrix factorization etc.)   │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Serendipity. A pure content-based recommender keeps recommending items similar to what was liked, limiting exposure. The fix is the diversity check (B2C.17).

### Sub-block 2 — what collaborative would cost

A different app with users. Not relevant for contrl-mo today.

### Sub-block 3 — the breakpoint

Fine until multi-user becomes a feature. At that point we add collaborative signals.

### Sub-block 4 — what isn't a tradeoff

Random recommendation (no strategy) was not picked because it ignores all signal.

---

## Tech reference (industry pairing)

### Rule-based recommender

- **Codebase uses:** Not yet. Planned for v1.
- **Why it's here:** the simplest correct content-based recommender.
- **Leading today:** Hand-coded rules — `adoption-leading` for v1 in new apps, 2026.

### Trained recommender (next exercise prediction)

- **Codebase uses:** Not yet. Planned for v2.
- **Why it's here:** LightGBM classifier predicting which exercise maximizes clean-session probability.
- **Leading today:** LightGBM — `adoption-leading` for tabular ranking, 2026.

---

## Project exercises

### [B2C.14] Rule-based recommender v1

- **Exercise ID:** `[B2C.14]`
- **What to build:** Deterministic progression advice: if gate's `consecutivePasses == 2` and last session clean, recommend completing the gate. If recurring form failure on exercise X, recommend a regression exercise. Pure rules over the existing data model.
- **Why it earns its place:** v1 ships fast and gives the A/B baseline.
- **Files to touch:** `src/services/ml/recommend-rules.ts` (new), surfaced in the home screen.
- **Done when:** the home screen surfaces today's recommended exercise based on rules.
- **Estimated effort:** 1–2 days

### [B2C.15] Learned recommender v2

- **Exercise ID:** `[B2C.15]`
- **What to build:** LightGBM classifier predicting "which exercise should the user pick next to maximize clean-session probability?". Features: recent sessions, gate state, form history. Trained on the user's own session history.
- **Why it earns its place:** the content-based learned model that demonstrates the recommender pipeline.
- **Files to touch:** `scripts/train_recommender.py`, `src/services/ml/recommend-learned.ts`.
- **Done when:** the learned model is integrated into the recommender dispatch (arm: experiment).
- **Estimated effort:** 1–2 days

### [B2C.17] Diversity / freshness check

- **Exercise ID:** `[B2C.17]`
- **What to build:** Wrap the recommender so it never returns the same exercise 3 sessions in a row, even if the underlying model says it's optimal.
- **Why it earns its place:** the classical recommender-system patch that converts "optimal-by-the-model" to "good-for-the-user".
- **Files to touch:** `src/services/ml/recommend-diversity.ts` (new), wraps both arms.
- **Done when:** integration test feeds a sequence triggering the diversity check; output differs from the underlying recommender.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Recommender systems decompose into content-based (item-similarity), collaborative (user-cohort similarity), and hybrid. contrl-mo's recommender is content-based because there's one user. v1 is rule-based (gate state + recent history); v2 is a learned classifier predicting clean-session probability. A diversity check prevents same-exercise-repeatedly. The constraint forcing this design is the single-user data model — collaborative isn't available. The cost paid is serendipity, which the diversity check partially restores.

### Key points

- Content-based works on day 1 with item features.
- Collaborative needs many users; not viable for contrl-mo.
- Diversity / freshness / fairness are post-strategy patches.
- Single-user A/B validates v2 vs v1.

---

## Interview defense

### Likely questions

**Q: Which recommender strategy do you use?  [mid]**
A: Content-based. Single user, so no collaborative signal. Item features (exercise category, level, tempo, target reps) feed both v1 rules and v2 learned model. Diversity check prevents same-exercise-three-times-in-a-row regardless of underlying recommendation.

**Q: Why train a learned recommender if rules work?  [senior]**
A: Rules capture *known* patterns; the learned model captures patterns I haven't articulated. As session history accumulates, the model may find that "after 2 clean Push L3 sessions, the user does better when the next session is L3 not L4 yet" — a nuanced rule I wouldn't write by hand. The single-user A/B validates whether the learned model actually adds value.

**Q: At 100k users, what changes?  [arch]**
A: Collaborative becomes viable. Hybrid (content + collaborative) likely outperforms pure content. New concerns: position bias, popularity bias, cold-start for new users. The schema stays similar; the model gets bigger.

### One-line anchors

- Content-based for single-user.
- Collaborative needs the cohort.
- Diversity is the safety net.
- Rules first; learn the residual.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the three strategies + when each fits.

### Level 2 — Explain it out loud
Why no collaborative? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"A multi-user version of contrl-mo with shared workouts. Strategy?"

### Level 4 — Defend the decision you'd change
"Skip the learned v2." When?

### Quick check — code reference test
- What's v1's strategy?
- What's the diversity rule?
- What curriculum exercises?

Then verify.
