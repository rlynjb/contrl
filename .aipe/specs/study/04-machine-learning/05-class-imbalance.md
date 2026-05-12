# Class imbalance

**Industry name(s):** Class imbalance, skewed class distribution, minority-class problem
**Type:** Industry standard

> Most reps are "good form"; failure modes are rare. A naive accuracy metric would say "predict good every time, 85% accuracy". That's why we report per-class precision/recall/F1 and use class weights or oversampling.

**See also:** → [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) · → [01-supervised-pipeline](./01-supervised-pipeline.md)

---

## Why care

When 80% of your data is one class, the "trivial classifier" (always predict the majority) is 80% accurate. A real model that gets 81% accuracy looks like it learned nothing. Aggregate accuracy lies on imbalanced data; per-class metrics tell the truth. Class imbalance is the IK ML Module 3 anchor concept for a reason.

The pattern is **handle the imbalance explicitly** — at training time (class weights, resampling) and at evaluation time (macro F1, per-class metrics). Without both, you ship a model that "succeeds" by ignoring the failure modes you actually care about.

---

## How it works

Three levers, applied in order: pick metrics that surface imbalance, adjust training to compensate, validate that adjustment worked.

### Lever 1 — Don't use accuracy alone

```
True distribution:
  good             8000 reps  ─── 80%
  elbow_flare       800 reps  ───  8%
  incomplete_depth  600 reps  ───  6%
  back_arch         400 reps  ───  4%
  hip_sag           200 reps  ───  2%
```

A model that always predicts `good`:
- Accuracy: 80% (looks great)
- Per-class F1 (`hip_sag`): 0.0 (catastrophic)
- Macro F1: 0.18 (terrible, averaged over 5 classes)

Macro F1 — average of per-class F1, weighting each class equally — exposes the failure that accuracy hides. Always report it for imbalanced problems.

### Lever 2 — Class weights during training

```python
LogisticRegression(class_weight='balanced')
LGBMClassifier(class_weight='balanced')
```

scikit-learn's `'balanced'` weights each class inversely proportional to its frequency. A rep of `hip_sag` (2%) gets weight ~50× a rep of `good` (80%). The loss function pays attention to minority classes.

### Lever 3 — Oversampling (SMOTE) or undersampling

Alternative to class weights. SMOTE synthesizes new minority-class examples via interpolation between existing ones. Undersampling drops majority examples until classes are balanced. Both work; class weights are usually simpler.

### Lever 4 — Compare with and without

```
Without weighting           With class_weight='balanced'
─────────────────────       ─────────────────────────────
hip_sag F1: 0.32             hip_sag F1: 0.58
good F1:    0.94             good F1:    0.89
macro F1:   0.61             macro F1:   0.74
```

The balanced model trades some accuracy on the dominant class for much better recall on minority classes. Whether that's the right trade depends on the cost of false negatives vs false positives — for fitness coaching, missing a failure mode is worse than false-flagging a good rep, so we accept some precision loss on `good`.

### Move 2.5 — Per-class thresholds

A separate technique: train one model, then per class adjust the prediction threshold. If the default 0.5 threshold gives bad recall on `hip_sag`, lower it to 0.3 for that class only. Independent of imbalance handling at train time; can stack with it.

### Move 3 — The principle

Class imbalance is data, not a model bug. The fix is to acknowledge the imbalance everywhere: in training (weight rare classes), in evaluation (per-class metrics), and in deployment thresholds (recall-tuned for minority classes when their cost is high). Pretending the imbalance away with naive accuracy is the trap.

---

## Imbalance — diagram

```
   Class distribution                  Naive accuracy
   ──────────────────                  ──────────────
   good             ████████████ 80%   "predict good" → 80%
   elbow_flare      ██            8%   per-class F1 hip_sag = 0  ←─ disaster
   incomplete       █             6%
   back_arch        ▌             4%
   hip_sag          ▎             2%

   Three levers to fix:
   1. metrics       → macro F1, per-class F1, confusion matrix
   2. training      → class_weight='balanced' or SMOTE
   3. thresholds    → tune per-class for recall

   With balanced training:
   ─────────────────────────
   trade some accuracy on good for much better recall on rare classes
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected `train_*.py` scripts include `class_weight='balanced'` by default; results doc reports both with and without.

---

## Elaborate

### Where this pattern comes from

Class imbalance has been a known problem in ML since the 1990s (think: fraud detection). The metric-discipline side was popularized in evaluation literature; SMOTE was introduced by Chawla et al. 2002. IK ML Module 3 packages it as a coherent set.

### The deeper principle

Optimizing the right objective matters more than picking the right model. With imbalanced data and accuracy-as-objective, every model converges toward "predict the majority". Switching the objective to balanced accuracy or macro F1 changes what the model optimizes for, which changes what it learns.

### Where this breaks down

When the imbalance is extreme (1:10,000+), even class weighting struggles — there isn't enough minority signal to learn from. Solutions: explicit anomaly detection (semi-supervised), generative augmentation, or business-side: collect more minority data.

### What to explore next

- [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) → how to evaluate
- [08-calibration](./08-calibration.md) → how class weights affect probability calibration

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Class weights (planned)          │ Ignore imbalance (alt)           │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Code complexity    │ One parameter                    │ Zero                             │
│ Majority accuracy  │ Slightly worse                   │ Maximum                          │
│ Minority recall    │ Much better                      │ Near-zero                        │
│ Calibration        │ Affected, may need recalibration │ Native (but on imbalanced dist)  │
│ Honesty            │ Reports per-class numbers        │ Hides minority failure           │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Slight drop in majority-class accuracy. For fitness coaching this is acceptable — false-flagging a few good reps annoys the user less than missing real failures.

### Sub-block 2 — what ignoring it would cost

A model that predicts `good` ~95% of the time. Users never get coaching on rare failure modes (hip_sag, back_arch). The product feels broken. Reported test accuracy looks high; deployment performance is poor.

### Sub-block 3 — the breakpoint

Fine until imbalance exceeds ~1:100. Past that, weights alone aren't enough; need oversampling or specialized anomaly detection.

### Sub-block 4 — what isn't a tradeoff

Discarding the rare classes was not a real option — they're exactly the classes coaching needs to detect.

---

## Tech reference (industry pairing)

### `class_weight='balanced'` in scikit-learn / LightGBM

- **Codebase uses:** Not yet. Planned default for both training scripts.
- **Why it's here:** the simplest correct adjustment for imbalance.
- **Leading today:** `class_weight` — `adoption-leading`, 2026.
- **Why it leads:** one parameter, well-understood semantics.
- **Runner-up:** `imbalanced-learn`'s SMOTE — `adoption-leading` for severe imbalance; more setup, sometimes better.

---

## Project exercises

### [B2C.8] Class imbalance handling

- **Exercise ID:** `[B2C.8]`
- **What to build:** Train each model twice — once without `class_weight`, once with `'balanced'`. Report per-class F1 and macro F1 for both, plus the trade visible in the confusion matrix.
- **Why it earns its place:** the IK Module 3 anchor concept made concrete with your numbers.
- **Files to touch:** `scripts/train_lr.py`, `scripts/train_gbt.py`, `docs/ml-results.md`.
- **Done when:** the results doc shows the with/without comparison and explains why we ship the balanced version.
- **Estimated effort:** <1hr beyond [B2C.6/B2C.7]

---

## Summary

### Concept recap

Class imbalance breaks accuracy as a metric and pushes models toward majority-class predictions. The fix has three parts: report per-class metrics (especially macro F1) instead of accuracy alone, use class weighting during training, and validate that the rare-class recall actually improved. For contrl-mo's planned classifier, `good` will be the dominant class; rare-failure recall is exactly what coaching needs, so the trade favors balanced training. The cost is some majority-class accuracy.

### Key points

- Aggregate accuracy lies on imbalanced data.
- Macro F1 averages over classes equally — exposes minority failure.
- `class_weight='balanced'` is the simplest correct fix.
- Always report with and without; defend the chosen trade.

---

## Interview defense

### Likely questions

**Q: Why doesn't accuracy work here?  [mid]**
A: Because ~80% of reps are `good`. A model that always predicts `good` is 80% accurate but useless — it catches zero failure modes. Macro F1 averages per-class F1 and exposes the failure: the all-good model gets macro F1 ~0.18, not 0.80. Accuracy is the wrong metric for imbalanced data.

**Q: SMOTE vs class weights — which?  [senior]**
A: Start with class weights — one parameter, no extra preprocessing, no synthetic data. SMOTE is the next step if class weights don't move the needle enough. The risk with SMOTE is that synthetic examples can be unrealistic for your feature space, especially with engineered features that have constrained relationships (e.g., ROM ≥ 0 always).

**Q: At 1:10,000 imbalance, what do you do?  [arch]**
A: Weights alone aren't enough — the minority class doesn't have enough signal. Options: anomaly detection (treat minority as "not in distribution"), data augmentation (generative or domain-specific), or business: collect more minority examples by sampling production traffic. Each has tradeoffs; the right choice depends on whether minority class is intrinsically rare (anomaly) or just under-sampled (collect more).

### One-line anchors

- Aggregate accuracy lies.
- Macro F1 is the honest metric.
- Weights first; SMOTE if forced.
- Always compare with and without.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the distribution + three levers.

### Level 2 — Explain it out loud
Why macro F1. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"95% of recommender candidates are 'not picked'. Same fix?"

### Level 4 — Defend the decision you'd change
"Would you ever ignore imbalance?" When?

### Quick check — code reference test
- What's the simplest class-balancing parameter?
- What metric exposes imbalance failure?
- Where would the balanced/unbalanced comparison live?

Then verify.
