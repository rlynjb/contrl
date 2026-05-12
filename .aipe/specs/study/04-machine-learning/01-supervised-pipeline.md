# Supervised learning pipeline

**Industry name(s):** Supervised learning, end-to-end ML pipeline, data → features → model → eval → deploy
**Type:** Industry standard

> Six stages: collect labeled data, engineer features, split train/val/test, train a model, evaluate, deploy. The pipeline shape is universal across every supervised ML problem; what changes is the specifics of each stage.

**See also:** → [02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md) · → [03-train-val-test-discipline](./03-train-val-test-discipline.md) · → [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md)

---

## Why care

Most AI engineers can integrate a pre-trained LLM. Far fewer have *trained a model* end-to-end with their own data. The skill matters because the failure modes — class imbalance, domain gap, train-test leakage, calibration — are invisible until you do it. The interview signal of "I've trained a classifier with real numbers on a held-out set" is large because most candidates haven't.

The pattern is **the supervised pipeline** — the textbook six-stage flow from raw data to deployed model. Same shape everywhere supervised ML appears: spam classification, fraud detection, image labeling, recommender systems. The shape is universal; the per-stage details are the work.

---

## How it works

Six stages, each with its own concerns. The output of each stage is the input of the next. Errors compound: a bad split poisons every subsequent stage.

### Stage 1 — Collect labeled data

For the form classifier, this means: video sequences of users doing exercises, with per-rep labels (`good`, `elbow_flare`, `incomplete_depth`, `back_arch`, `hip_sag` for pushups). Sources are mixed: public datasets (MM-Fit, Fit3D — see B2C.1) for breadth, self-labeled sessions on your own phone for distribution match. Labels are the bottleneck.

### Stage 2 — Engineer features

Raw pose landmarks (33 × {x, y, z, visibility}) → fixed-length feature vectors. For a per-rep classifier: peak/trough joint angles, angular velocities, ROM, time-to-bottom, left/right asymmetry. See [02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md). The model never sees raw landmarks — it sees features.

### Stage 3 — Split train/val/test

Three disjoint sets: train (model learns), val (tune hyperparameters, pick model), test (final reported metric). The split must be by **session**, not by **rep** — reps from the same session are highly correlated, and a random rep-level split leaks information. See [03-train-val-test-discipline](./03-train-val-test-discipline.md).

### Stage 4 — Train

Pick a model (start with logistic regression baseline; compare with gradient-boosted trees), fit on training data, tune hyperparameters using val set. See [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md).

### Stage 5 — Evaluate

Per-class precision, recall, F1; confusion matrix; calibration plot. NOT just accuracy — class imbalance makes accuracy a lying metric. See [05-class-imbalance](./05-class-imbalance.md) and [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md).

### Stage 6 — Deploy

Export the model (ONNX or TF Lite), bundle with the app, run inference on-device. See [13-on-device-inference](./13-on-device-inference.md). Log every prediction for offline review (audit trail).

### Move 2.5 — Phase A vs Phase B for contrl-mo

**Phase A (current):** No supervised pipeline exists. Rep counting uses an FSM ([02-dsa/05-rep-counter-state-machine](../02-dsa/05-rep-counter-state-machine.md)); no labeled-data pipeline.

**Phase B (planned, Phase 2C of curriculum):** Full pipeline for form classifier. Phase 2C is the largest single chunk of work in the curriculum because it spans all six stages.

### Move 3 — The principle

A supervised model is a function approximator, but the function it approximates is the function your labels describe. Bad labels = bad model, regardless of how clever the algorithm is. The pipeline's value is forcing you to look at each stage independently — labels, features, split, model, eval, deploy — and not let one stage's bugs hide in another.

The full picture is below.

---

## Pipeline — diagram

```
┌─ Stage 1: Collect labeled data ─────────────────────────────────────────────┐
│                                                                             │
│   public datasets (MM-Fit, Fit3D)  +  self-labeled sessions                 │
│   per-rep: { features, label, session_id, ... }                             │
│                                                                             │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Stage 2: Feature engineering ──────────────────────────────────────────────┐
│   landmarks → joint angles, ROM, velocity, asymmetry                        │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Stage 3: Train/val/test split ─────────────────────────────────────────────┐
│   session-level split:                                                      │
│      train  60%                                                             │
│      val    20%                                                             │
│      test   20%                                                             │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Stage 4: Train ────────────────────────────────────────────────────────────┐
│   LR baseline → fit                                                         │
│   GBT (LightGBM) → fit                                                      │
│   tune on val                                                               │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Stage 5: Evaluate ─────────────────────────────────────────────────────────┐
│   per-class precision, recall, F1                                           │
│   confusion matrix                                                          │
│   calibration plot                                                          │
│   ↑ on the TEST set, never seen during train/tune                          │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ Stage 6: Deploy ───────────────────────────────────────────────────────────┐
│   export → ONNX or TF Lite                                                  │
│   bundle with app                                                           │
│   on-device inference, log to classifier_outputs                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** Phase 2C of curriculum. Expected paths:

- Labeled data: `data/labeled-sessions.jsonl` (self-labeled), public datasets fetched separately
- Feature pipeline: `src/services/ml/features.ts` (new)
- Training: `scripts/train.py` (new, off-device, Python) — exports to ONNX
- Inference: `src/services/ml/classifier.ts` (new) — loads ONNX, runs per-rep
- Outputs: `classifier_outputs` table (new) — see [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)

---

## Elaborate

### Where this pattern comes from

The supervised pipeline shape is standardized in IK ML Module 1, Hands-On ML (Géron), and every undergraduate ML curriculum. It's the same shape Fei-Fei Li used to assemble ImageNet labels and what Stripe uses for fraud detection — the granularity and tools differ, the stages don't.

### The deeper principle

Every stage can fail independently. The pipeline is a discipline of *isolating* each failure: bad labels → revisit collection; bad features → revisit engineering; train-test leakage → revisit split; under/overfit → revisit model; mis-calibrated → revisit eval; latency too high → revisit deploy. Without the staging, all failures look like "the model is bad" and you flail.

### Where this breaks down

Online learning (model updates from each new sample) doesn't fit the six-stage flow cleanly — the boundaries between "train" and "deploy" blur. For contrl-mo's planned classifier this isn't a concern; we retrain offline, deploy periodically.

### What to explore next

Every other ML file in this section drills into one stage. Read each in order:
- [02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md) → stage 2
- [03-train-val-test-discipline](./03-train-val-test-discipline.md) → stage 3
- [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md) → stage 4
- [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) → stage 5
- [13-on-device-inference](./13-on-device-inference.md) → stage 6

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Full pipeline (planned)          │ Pre-trained model only (alt)     │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Engineering effort │ Weeks (data + features + train)  │ Hours (call an API)              │
│ Customization      │ Tailored to your label space     │ Stuck with the API's labels      │
│ Per-call cost      │ Free (on-device inference)       │ Pay per call                     │
│ Privacy            │ Data stays local                 │ Data goes to provider            │
│ Latency            │ ~10ms on-device                  │ ~200ms round-trip                │
│ Interview signal   │ "I trained a classifier"         │ "I called an API"                │
│ Maintenance        │ Retrain as data evolves          │ Vendor maintains                 │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Weeks of engineering. Data labeling is the worst — every session has to be watched, every rep tagged. The CLI labeling tool (B2C.5) reduces this but doesn't eliminate it. For ~500 labeled reps you're spending ~10–20 hours, plus the upstream work to build the labeling tool.

### Sub-block 2 — what pre-trained-only would cost

There's no pre-trained model for "is this elbow flare?" — you'd be limited to general activity classifiers (e.g., "is this a pushup?") which don't help. The only path to per-failure-mode coaching is training your own.

### Sub-block 3 — the breakpoint

Fine for the form classifier (narrow domain, distinct labels, ~few thousand examples enough). Past ~50k labels per class the gains from larger models slow; past 1M you'd want neural networks. Not relevant here.

### Sub-block 4 — what isn't a tradeoff

Skipping the supervised pipeline entirely (use only rules) was considered for v1 — and is actually the recommender's v1 path. For the classifier, rules can't generalize over the failure modes; a trained model is the only viable path.

---

## Tech reference (industry pairing)

### Python + scikit-learn + LightGBM

- **Codebase uses:** Not yet. Planned for training scripts under `scripts/`.
- **Why it's here:** the canonical tabular-ML stack. scikit-learn for LR baseline; LightGBM for GBT comparison.
- **Leading today:** scikit-learn + LightGBM — `adoption-leading` for tabular ML, 2026.
- **Why it leads:** complete ML toolkit, mature, well-documented, used by 80%+ of tabular ML.
- **Runner-up:** XGBoost — `adoption-leading` alternative; similar speed, slightly different feature support.

### ONNX Runtime Mobile

- **Codebase uses:** Not yet. Planned for on-device inference.
- **Why it's here:** the cross-platform model export format.
- **Leading today:** ONNX Runtime — `adoption-leading` for cross-platform inference, 2026.
- **Why it leads:** supported by every major mobile ML stack, models exportable from scikit-learn/LightGBM/PyTorch.
- **Runner-up:** TensorFlow Lite — `adoption-leading` for Google-stack apps.

---

## Project exercises

### [B2C.1] + [B2C.2] Survey + label schema

- **Exercise ID:** `[B2C.1]` and `[B2C.2]` jointly
- **What to build:** A `data/datasets-surveyed.md` doc listing MM-Fit, Fit3D, MMA-Pose with class overlap to your label schema. Then `data/label-schema.json` enumerating per-exercise failure modes (~20 classes total).
- **Why it earns its place:** the data + label decisions determine everything downstream; getting them right is the senior signal.
- **Files to touch:** `data/datasets-surveyed.md` (new), `data/label-schema.json` (new).
- **Done when:** the schema is committed and a sample of 10 labeled reps validates against it.
- **Estimated effort:** 1–2 days

### [B2C.4] Audit trail (the data pipeline)

- **Exercise ID:** `[B2C.4]`
- **What to build:** SQLite table to record landmark series + phase transitions per rep during a workout. This is the training-data pipeline before the classifier exists.
- **Why it earns its place:** without this you have no labeled data; without labeled data no classifier.
- **Files to touch:** `src/services/database.ts` (new migration + accessors), surfacing in `PoseCamera.tsx`.
- **Done when:** every rep counted by the rep counter writes a row with the full landmark series and rep duration.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

The supervised pipeline has six stages: collect labeled data, engineer features, split train/val/test, train, evaluate, deploy. Each stage has its own failure modes, which is why the discipline of staging matters. For contrl-mo's planned form classifier (Phase 2C), the pipeline starts with self-labeled session data, runs through engineered features (joint angles, ROM, asymmetry), splits at the session level, compares LR vs GBT models, evaluates on a held-out test set with per-class metrics, and deploys to-on-device via ONNX. The constraint forcing this design is the need for a *trained* classifier that recognizes failure modes — no pre-trained alternative exists. The cost paid is weeks of engineering plus ongoing label maintenance.

### Key points

- Six stages, each with isolated failure modes.
- The output of each stage is the input of the next.
- Bad labels = bad model, regardless of how clever the algorithm is.
- Session-level split is non-negotiable — rep-level splits leak.
- The audit-trail data pipeline is the prerequisite to everything else.

---

## Interview defense

### Likely questions

**Q: Walk me through the supervised pipeline.  [mid]**
A: Six stages. Collect labeled data — pose landmark sequences with per-rep failure-mode labels. Engineer features — joint angles, ROM, velocity, asymmetry, fixed-length per rep. Split train/val/test by session, not by rep, to prevent leakage. Train an LR baseline and a GBT model, tune hyperparameters on the val set. Evaluate on the test set with per-class precision/recall/F1 and a calibration plot. Deploy by exporting to ONNX, bundling with the app, running on-device.

**Q: Why session-level split?  [senior]**
A: Reps from the same session are highly correlated — same body, same camera angle, same form on that day. A random rep-level split would put 80% of session X's reps in train and 20% in test, and the model would "ace" the test by recognizing session X's quirks rather than generalizable patterns. Session-level keeps train and test fully separate at the right granularity. The IK ML curriculum's Module 1 hammers this.

**Q: How do you scale this from 500 to 50k labels?  [arch]**
A: At 500 labels you're worried about overfitting; LR is fine, GBT might overfit. At 50k LR underfits and GBT shines. Past 1M you'd want neural networks (CNNs over the pose sequence). The cost: label cost scales linearly until you can bootstrap with semi-supervised methods (use the trained model to pre-label new sessions; human reviews the uncertain ones).

### One-line anchors

- Six stages, each isolated.
- Bad labels = bad model.
- Session-level split is non-negotiable.
- The data pipeline is the prerequisite.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the six stages.

### Level 2 — Explain it out loud
Why each stage matters separately. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Add a 'fatigue detector' that classifies sets as fatigued/non-fatigued from EMG-like inputs. Same pipeline?"

### Level 4 — Defend the decision you'd change
"Would you ever skip training and use a heuristic for form classification?" When?

### Quick check — code reference test
- How many stages?
- What's the prerequisite stage for everything else?
- What's the planned label-schema file?

Then verify against the curriculum.
