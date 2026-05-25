# Feature engineering from pose

**Industry name(s):** Feature engineering, hand-crafted features, time-series feature extraction
**Type:** Industry standard

> Raw pose landmarks are 33 × 4 floats per frame, ~60 frames per rep — thousands of numbers. The model needs a fixed-length feature vector per rep. Hand-crafted features summarize each rep: peak joint angles, ROM, angular velocity, time-to-bottom, left/right asymmetry.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

You can't feed a variable-length stream of floats to a tabular classifier. You have to *summarize* — pick a few numbers per rep that capture what matters. The skill is knowing which numbers to pick. Picking too few loses signal; picking too many introduces noise and overfit risk. Good features beat clever models almost every time.

The pattern is **hand-crafted feature engineering** — the part of ML that's been mostly automated by deep learning at large scale but is still load-bearing at small scale. For tabular models on tabular features (LR, GBT), feature engineering is most of the work.

---

## How it works

For each rep, extract a fixed-length vector. The vector is per-exercise (different exercises have different joints, different motion ranges) but follows the same shape: angles + derivatives + ratios + temporal summaries.

### Features for the pushup classifier

Per rep:
- **Angle peaks/troughs.** Elbow angle at top, elbow angle at bottom (the descent depth indicator).
- **ROM (range of motion).** `top_angle - bottom_angle`. A shallow rep has small ROM.
- **Time-to-bottom (ms).** Tempo indicator. Fast = explosive; slow = controlled.
- **Time-at-bottom.** Pause duration. Cued reps pause; sloppy ones don't.
- **Angular velocity at descent midpoint.** How fast through the eccentric.
- **Left/right asymmetry.** `abs(left_elbow_angle - right_elbow_angle)` averaged across the rep. Big asymmetry indicates uneven loading.
- **Spine alignment deviation.** `abs(180 - shoulder_hip_ankle_angle)` averaged across the rep. Big deviation indicates hip sag or back arch.
- **Confidence aggregate.** Mean visibility across all measured joints across all frames. Low confidence = unreliable rep, may want to flag separately.

That's 8 features per rep. For 5 exercises × ~5 failure modes = ~25 classes total, 8 features is in the right ballpark — enough to discriminate, not so many to overfit on small labeled sets.

### Per-exercise variations

Same feature schema, different joint indices:

| Exercise | Primary joint angle | Asymmetry source |
|---|---|---|
| Pushup | Shoulder-elbow-wrist | left vs right elbow |
| Squat | Hip-knee-ankle | left vs right knee |
| Plank | Shoulder-hip-ankle | deviation from 180° |
| Pull (bar/TRX) | Elbow + shoulder | shoulder asymmetry |

### What we don't include

- **Absolute positions.** Camera angle and user position affect them; not useful.
- **Raw landmark sequences.** Variable-length, not directly usable by tabular models.
- **Body-size measurements.** Confounding with form quality; one user's arm length doesn't predict form.

The classifier needs *form quality signals*, not *user identity signals*.

### Move 2.5 — The two-pass shape

```typescript
// During the rep (per-frame):
//   accumulate min/max elbow angle, sum of asymmetry, timestamps of phase transitions

// On rep completion:
//   compute final features from accumulated state
//   write feature vector + label (if labeled) to the audit trail
```

The features come out of the same FSM transitions that count the rep. No second pass over the landmark stream is needed — features are accumulated as the rep plays out.

### Move 3 — The principle

Features encode hypotheses. "Elbow asymmetry > 15° matters for elbow flare" is a hypothesis; including the feature lets the model test it. Good engineers think about what *should* be predictive before throwing features at the model. Bad engineers dump every imaginable measurement in and hope the model figures out what matters.

The full picture is below.

---

## Feature vector — diagram

```
   Raw landmark stream per rep (60 frames × 33 × 4 floats = ~8000 numbers)
        │
        │  accumulate during rep, summarize at end
        ▼
   Feature vector (8 numbers — pushup example):

   ┌───────────────────────────────────────────────────────────────┐
   │ peak_elbow_top        160°    (top-of-rep angle)              │
   │ peak_elbow_bottom      85°    (bottom-of-rep angle)            │
   │ rom                    75°    (160 - 85)                       │
   │ time_to_bottom_ms     1400    (eccentric duration)             │
   │ time_at_bottom_ms      200    (pause)                          │
   │ descent_velocity      −0.054  (deg/ms midway down)             │
   │ avg_lr_asymmetry        8.2°  (left-right elbow average)       │
   │ spine_deviation         9.1°  (avg deviation from 180°)        │
   └───────────────────────────────────────────────────────────────┘
        │
        ▼
   Classifier sees fixed-shape input, predicts label + confidence
```

---

## In this codebase

**Not yet implemented.** Phase 2C of curriculum. Expected path: `src/services/ml/features.ts` (new), with accumulators inside the existing rep-counter or per-exercise processor.

The accumulator hooks would attach to the FSM transitions in `src/lib/pose/rep-counter.ts`. Each transition logs the timestamp + landmark snapshot; on rep complete, features are computed and written to the audit trail.

---

## Elaborate

### Where this pattern comes from

Hand-crafted features dominated ML from the 1960s through ~2012 (the deep learning shift). For tabular and small-data problems they still dominate. The "domain expert + ML engineer" collaboration on feature design is the heart of every successful applied-ML project.

### The deeper principle

Features are how you bring domain knowledge into the model. The model doesn't know what "form quality" means; you do. Features are your translator. Bad features mean the model can't learn even from infinite data; good features mean a tiny model on a tiny dataset can do useful work.

### Where this breaks down

When the relevant signal isn't in any obvious summary. Deep learning's win at scale was discovering features humans hadn't thought of. For pose-based form classification, the obvious summaries (angles, ROM, asymmetry) cover most of the signal; a CNN over the landmark sequence could discover more but at much higher data + compute cost.

### What to explore next

- [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md) → the model that consumes the features
- [01-supervised-pipeline](./01-supervised-pipeline.md) → the broader pipeline

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Hand-crafted features (planned)  │ Raw sequence + deep model (alt)  │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Engineering effort │ Days (per-exercise tuning)       │ Weeks (model arch + tuning)      │
│ Data needed        │ Hundreds of labels suffice       │ Tens of thousands needed         │
│ Inference cost     │ <1ms                             │ 50–500ms per rep                 │
│ Interpretability   │ Each feature has a meaning       │ Black-box                        │
│ Domain transfer    │ Translates to new exercises      │ Model-specific                   │
│ Failure modes      │ Wrong feature → known gap        │ Mysterious                       │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Some signal. If "elbow drift speed in the second half of descent" is predictive and we don't include it, the model can't learn it. Mitigation: iterate. Train, look at confusion matrix, hypothesize what's missing, add features, retrain.

### Sub-block 2 — what raw + deep would cost

A CNN over the pose sequence needs thousands of labeled reps to train (we'd have ~500 self-labeled + ~few thousand from public datasets, marginal). Inference cost is much higher. Interpretability disappears — when the model is wrong, you can't trace it to a feature.

### Sub-block 3 — the breakpoint

Fine until labeled data climbs past ~10k per class. At that point a small CNN starts beating LR/GBT on engineered features. We're not there.

### Sub-block 4 — what isn't a tradeoff

Using *only* one feature ("ROM is bad if < 70°") was tried in spirit by the existing FSM's `bottomAngle` check. It's the "rule, not model" alternative — covered in [03-ai-engineering/06-when-not-to-use-an-agent](../03-ai-engineering/06-when-not-to-use-an-agent.md). Rules can't capture multi-feature patterns like "ROM OK but asymmetry high AND fast descent" — that's what the model is for.

---

## Tech reference (industry pairing)

### NumPy + Pandas (training side)

- **Codebase uses:** Not yet. Planned in training scripts.
- **Why it's here:** the data shape (rows of feature vectors with labels) is the canonical pandas/NumPy use case.
- **Leading today:** NumPy + Pandas — `adoption-leading`, 2026.
- **Why it leads:** universal, well-documented, every ML book uses them.
- **Runner-up:** Polars — `innovation-leading`; faster, lazier; the right choice for >1M-row datasets.

---

## Project exercises

### [B2C.3] Feature extraction pipeline

- **Exercise ID:** `[B2C.3]`
- **What to build:** Per-rep feature extractor: accumulates landmark + phase data during the rep, emits a fixed-length feature vector on rep completion. JS side for live inference, Python side (matching code) for training.
- **Why it earns its place:** the feature pipeline IS the model's input — if it's wrong, every downstream metric is wrong.
- **Files to touch:** `src/services/ml/features.ts` (new), `scripts/features.py` (new — must match the JS impl exactly).
- **Done when:** unit tests verify both implementations produce identical features on a fixed input.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Features summarize each rep into a fixed-length vector that a tabular classifier can consume. For pushups: 8 features covering angles, ROM, tempo, asymmetry, and spine alignment. The features are accumulated during the rep (no second pass needed) and written to the audit-trail data pipeline. The constraint forcing this design was the variable length and high dimensionality of raw pose data — tabular models need fixed-shape inputs. The cost paid is engineering time to design features and the risk that we miss predictive signals not in our summary set.

### Key points

- ~8 features per rep is the right magnitude for ~25 classes and a few hundred labels.
- Features must be exercise-aware (different joints for different exercises).
- Absolute positions are excluded — they confound user identity with form.
- Features are hypotheses about what predicts the labels.

---

## Interview defense

### Likely questions

**Q: Why hand-crafted features instead of feeding raw pose data to a deep model?  [mid]**
A: Data scale. We have hundreds to low-thousands of labeled reps, not tens of thousands. At this scale, hand-crafted features outperform deep models because the features encode the prior "form quality is a function of angles, ROM, velocity, asymmetry". Deep models would need much more data to discover the same features themselves. Plus on-device inference cost is much lower with tabular features.

**Q: How did you pick the features?  [senior]**
A: Domain knowledge — biomechanics of each exercise tells you what to measure. For pushups, "depth" maps to bottom-of-rep elbow angle; "elbow flare" maps to left-right asymmetry; "back arch" maps to spine deviation from 180°. The features are explicit hypotheses about what predicts each failure mode. After training, you iterate — look at the confusion matrix, see which failure modes are confused, hypothesize what feature would separate them, add it, retrain.

**Q: At 10× the data (50k labels), would you keep hand-crafted features?  [arch]**
A: Probably no. At 50k labels per class, a small CNN over the landmark sequence likely outperforms because it discovers features hand engineers miss. The migration is non-trivial — model shape changes, inference cost grows ~50×, interpretability shrinks. Until labels reach that scale, hand-crafted is the right call.

### One-line anchors

- 8 features capture pushup form.
- Features are hypotheses.
- Absolute positions are a distraction.
- Deep models need data we don't have.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the per-rep feature vector with all 8 fields.

### Level 2 — Explain it out loud
Why not use raw landmarks? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a pull-up classifier. What features do you change?"

### Level 4 — Defend the decision you'd change
"Would you ever switch to a CNN over landmark sequences?" When?

### Quick check — code reference test
- How many features per rep?
- Where would the feature extractor live?
- What's the asymmetry feature for pushups?

Then verify.
