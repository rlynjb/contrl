# Train/val/test discipline

**Industry name(s):** Train/val/test split, hold-out validation, leak-free split, temporal split
**Type:** Industry standard

> Three disjoint sets: train (model learns), val (tune hyperparameters), test (final reported metric). Split by **session**, not by rep — reps from the same session are correlated and a random rep-level split leaks information into test.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md)

---

## Why care

The number you report on test data is the only number that matters in an interview or production decision. If your train and test sets share information, that number is a lie — the model "did well" because it had seen pieces of test before, not because it generalized. Most ML bugs in candidate take-homes are a leaky split.

The pattern is **session-level holdout** — split at the granularity that matches the correlation structure of your data. Same instinct as user-level holdout (for user-personalization models), time-window holdout (for time-series models), and tenant-level holdout (for multi-tenant models).

---

## How it works

Three disjoint sets, allocated by session ID, ratios typically 60/20/20.

```python
import numpy as np
np.random.seed(42)
session_ids = sorted(set(row['session_id'] for row in all_data))
np.random.shuffle(session_ids)
n = len(session_ids)
train_sessions = set(session_ids[:int(0.6 * n)])
val_sessions   = set(session_ids[int(0.6 * n):int(0.8 * n)])
test_sessions  = set(session_ids[int(0.8 * n):])

train = [r for r in all_data if r['session_id'] in train_sessions]
val   = [r for r in all_data if r['session_id'] in val_sessions]
test  = [r for r in all_data if r['session_id'] in test_sessions]
```

The seeded shuffle makes the split reproducible. The set-based filter ensures no row appears in two splits.

### Why session-level matters

Reps from session X share:
- The same body (same arm length, same starting posture).
- The same camera angle and lighting.
- The same form on that day (a tired user has bad form on every rep).
- The same labeling biases (you labeled all of session X's reps in one sitting).

A random rep-level split puts 80% of session X in train and 20% in test. The model can "ace" the test by memorizing session X's quirks. The test number looks great; deployment performance is awful.

Session-level keeps train and test disjoint at the *correlation* boundary.

### What the val set is for

Train → fit model. Val → tune hyperparameters (regularization strength, tree depth, learning rate). Test → final reported metric, **touched once**.

If you tune on test, test becomes contaminated — your model is now overfit to test's quirks. Every IK ML lesson hammers this; every candidate forgets it under deadline pressure.

### Move 2.5 — Temporal vs random split

For some problems (time-series, evolving distributions) you want temporal split: train on sessions before date X, test on sessions after. For contrl's classifier, the failure modes don't shift over time at this scale; random session-level is sufficient.

### Move 3 — The principle

The test set must represent *unseen data*. If anything about test data was available to the model during training (directly or via correlation), test no longer measures generalization. Discipline means asking "what could leak?" before splitting.

The full picture is below.

---

## Split — diagram

```
                  all labeled data (by session)
                            │
                            ▼
                ┌───────────────────────────┐
                │  shuffle session IDs       │
                │  (seeded for reproducibility)│
                └───────────┬───────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
           train         val           test
            60%          20%           20%

   Every rep of session X is in exactly one split.
   No session crosses splits.

   train ──► fit model
   val   ──► tune hyperparameters
   test  ──► final reported metric (touched once)


   What NOT to do:
   ────────────────────────────────────────────
   Random rep-level shuffle:
     session X's reps split across train/val/test
     model memorizes session X
     test number lies
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected: `scripts/split.py` (new) consuming the audit-trail data, producing three CSV / parquet files for train, val, test.

---

## Elaborate

### Where this pattern comes from

Hold-out validation has been standard since classical statistics. The "split by the right granularity" wisdom was codified in IK ML curricula and re-emphasized in every Kaggle write-up where a leaky split produced a misleading leaderboard score.

### The deeper principle

The split granularity must match the correlation structure of the data. For independent rows: random. For grouped rows (same user / session / time): group-level. The granularity question is the *first* question to ask, not an afterthought.

### Where this breaks down

When session count is small and you can't afford 20% in val + 20% in test. The fix is k-fold cross-validation: rotate the val set across k folds and average. We probably won't need this; ~30 sessions is enough for a 60/20/20 split.

### What to explore next

- [01-supervised-pipeline](./01-supervised-pipeline.md) → stage 3
- [05-class-imbalance](./05-class-imbalance.md) → why stratified splits help when classes are unbalanced

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Session-level split (taken)      │ Random rep-level (don't)         │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Train size         │ ~60% of reps                     │ ~60% of reps                     │
│ Test trust         │ Real generalization              │ Inflated by correlation leak     │
│ Setup              │ One-line filter                  │ Same                             │
│ Coverage           │ May miss rare-failure sessions   │ Covers every session             │
│ Honesty            │ Reports what deployment sees     │ Reports memorization             │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Some rare failure modes may not appear in test if all their occurrences happened in one session that landed in train. Mitigation: stratify by label *within* session-level splits.

### Sub-block 2 — what rep-level would cost

The reported test number would overstate real performance. In production the user would see worse-than-expected coaching. Then you'd come back, diagnose the leak, redo the split, retrain — wasted work.

### Sub-block 3 — the breakpoint

Fine for session counts > ~30. Below that, k-fold or repeated random holdouts.

### Sub-block 4 — what isn't a tradeoff

Cross-validation (k-fold) was not picked for v1 because it's more code and unnecessary at our session count. Worth revisiting if we discover val performance is unstable across reruns.

---

## Tech reference (industry pairing)

### scikit-learn `train_test_split` with groups

- **Codebase uses:** Not yet. Planned via `GroupShuffleSplit` or hand-rolled set filter.
- **Why it's here:** the canonical primitive for group-aware splits.
- **Leading today:** scikit-learn `GroupShuffleSplit` / `GroupKFold` — `adoption-leading`, 2026.
- **Why it leads:** handles the group constraint cleanly; widely understood.
- **Runner-up:** Manual session-set filter — fine when you understand what's happening.

---

## Project exercises

### [B2C.9] Temporal/session split discipline

- **Exercise ID:** `[B2C.9]`
- **What to build:** `scripts/split.py` that produces train/val/test files split by session_id. Verify no session appears in two files. Document why session-level matters in `docs/ml-data-split.md`.
- **Why it earns its place:** the split is the foundation of every reported metric; getting it right is the senior signal.
- **Files to touch:** `scripts/split.py` (new), `docs/ml-data-split.md` (new).
- **Done when:** running the script produces three files; an assertion verifies disjointness; the doc explains the choice.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Train (fit), val (tune), test (final metric). Split by session_id, not by rep, because reps within a session are correlated and a rep-level split leaks the same session's quirks across train/test. The constraint forcing this design is that our test number must measure *generalization to unseen sessions*, which is what deployment encounters. The cost is occasionally missing rare-failure coverage if a rare-failure session ends up entirely in train.

### Key points

- Split granularity must match the correlation structure of the data.
- Random rep-level split leaks information; session-level doesn't.
- Val tunes hyperparameters; test reports the final number.
- Touch test once.

---

## Interview defense

### Likely questions

**Q: How do you split?  [mid]**
A: Three sets, 60/20/20, by session_id. The shuffle is seeded for reproducibility. Every rep of session X is in exactly one set; no session crosses sets.

**Q: Why not random by rep?  [senior]**
A: Correlation. Reps from the same session share body, camera angle, lighting, that day's form, and labeling biases. A random rep-level split puts 80% of session X in train and 20% in test, so the model memorizes session X and aces test. The reported test number lies. Session-level keeps train and test disjoint at the correlation boundary.

**Q: How do you handle ~30 sessions of data?  [arch]**
A: Tight but workable for 60/20/20. If val is too small (~6 sessions) for stable hyperparameter selection, switch to 5-fold cross-validation on the train+val pool, keeping test held out. Past 100 sessions the standard split is comfortable.

### One-line anchors

- Split at the correlation boundary.
- Touch test once.
- Val tunes; test reports.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the three-way split + what leaks if rep-level.

### Level 2 — Explain it out loud
Why session-level. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a recommender. What's the right split granularity?"

### Level 4 — Defend the decision you'd change
"Would you ever use random rep-level splits?" When?

### Quick check — code reference test
- What's the planned split script?
- What ratio?
- What granularity?

Then verify.
