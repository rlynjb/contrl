# ML features in this app

**Industry name(s):** Per-feature ML map, system summary, capability inventory
**Type:** Project-specific

> A summary of every ML surface contrl-mo plans to ship: what each is, what model type, where it runs, what data it produces. The reference card.

**See also:** Every file in this section.

---

## Why care

A study guide without a "where am I" page leaves the reader holding scattered pieces. This file is the one-page summary that anchors the section.

---

## ML features

### Currently shipped (no ML surface)

| Feature | Status | What it does |
|---|---|---|
| Rep counting | Shipped | Deterministic FSM, no ML — see [02-dsa/05-rep-counter-state-machine](../02-dsa/05-rep-counter-state-machine.md) |
| Pose estimation | Shipped | MediaPipe pre-trained model, on-device — see [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md) |

The current app uses *pre-trained* ML (MediaPipe) but does no *trained* ML of its own.

### Planned (Phase 2C — supervised pipeline)

| Feature | Model type | Where it runs | Inputs | Outputs | Curriculum |
|---|---|---|---|---|---|
| Form classifier | Tabular (LR baseline + LightGBM) | On-device via ONNX | 8 per-rep features | Per-rep label + confidence | B2C.1–B2C.12 |
| Progression recommender v1 | Rule-based | Local JS | Gate state, recent history | Recommended exercise | B2C.14 |
| Progression recommender v2 | LightGBM classifier | On-device via ONNX | Recent sessions, gate state, form history | Ranked exercise list | B2C.15 |

### Planned (Phase 3 — evaluation infrastructure)

| Capability | Implementation | Curriculum |
|---|---|---|
| Eval harness for classifier | Python on test set + held-out self-labeled | B3.8 |
| Eval for recommender (single-user A/B) | Random arm assignment + outcome logging | B3.9 |
| Training-run logging | JSONL `docs/ml-runs.jsonl` | B3.12 |
| Drift detection | PSI on rolling window | B3.13 |

### Planned (Phase 4 Path C — LLM coaching agent)

| Surface | Tools | Curriculum |
|---|---|---|
| End-of-session coaching agent | `get_classifier_output`, `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues` | B4C.1–B4C.5 |

### Planned (Phase 5 — production ML)

| Capability | Curriculum |
|---|---|
| On-device deployment via ONNX Runtime Mobile | B5.9–B5.11 |
| Quantization measurement | B5.9 |
| Retraining decision pipeline | B5.12 |
| On-device personalization (calibration-extended) | B5.13 |

---

## ML system summary

```
contrl-mo = on-device classification + recommender

Data flow:
   pose landmarks (existing MediaPipe)
        │
        ▼
   feature extraction (Phase 2C)
        │
        ▼
   form classifier (Phase 2C, LightGBM ONNX, on-device)
        │
        ├──► classifier_outputs (audit trail, Phase 2C)
        │
        └──► coaching agent (Phase 4 Path C)

Recommender:
   gate state + recent sessions
        │
        ▼
   rule-based v1  ┐
                  ├──► A/B arm assignment (Phase 3)
   learned v2     ┘
        │
        ▼
   diversity check
        │
        ▼
   today's recommended exercise
```

---

## Coverage of curriculum concepts

Every concept in this section traces back to a curriculum item. The mapping:

| Section file | Curriculum concept(s) | Build(s) |
|---|---|---|
| [01-supervised-pipeline](./01-supervised-pipeline.md) | C2C.1 | B2C.1–B2C.12 |
| [02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md) | C2C.2 | B2C.3 |
| [03-train-val-test-discipline](./03-train-val-test-discipline.md) | C2C.3 | B2C.9 |
| [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md) | C2C.4 | B2C.6, B2C.7 |
| [05-class-imbalance](./05-class-imbalance.md) | C2C.5, C3.5 | B2C.8 |
| [06-domain-gap-and-transfer-learning](./06-domain-gap-and-transfer-learning.md) | C2C.6, C2C.7 | B2C.1, B2C.10 |
| [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) | C2C.11, C3.4 | B2C.11 |
| [08-calibration](./08-calibration.md) | C2C.12 | B2C.11 |
| [09-bias-variance](./09-bias-variance.md) | C3.9 | (interpretive — B2C.7 produces the data) |
| [10-ab-testing-single-user](./10-ab-testing-single-user.md) | C3.6, C3.7 | B2C.18, B3.9 |
| [11-recommender-framing](./11-recommender-framing.md) | C2C.9, C5.11 | B2C.14, B2C.15, B2C.17 |
| [12-cold-start](./12-cold-start.md) | C2C.10 | B2C.14, B2C.16 |
| [13-on-device-inference](./13-on-device-inference.md) | C2C.8, C5.15 | B2C.12, B5.10, B5.11 |
| [14-quantization](./14-quantization.md) | C5.15 (subset) | B5.9 |
| [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md) | C2C.13 | B2C.4, B2C.13 |
| [16-training-run-logging](./16-training-run-logging.md) | C3.10, C3.11 | B3.12 |
| [17-drift-detection](./17-drift-detection.md) | C3.12 | B3.13 |
| [18-retraining-pipelines](./18-retraining-pipelines.md) | C5.16 | B5.12, B5.13 |
| [19-ml-system-design](./19-ml-system-design.md) | C5.9 | B5.14 |

---

## Summary

contrl-mo's ML scope spans Phase 2C (classifier + recommender), Phase 3 (eval + drift), Phase 4 Path C (LLM coaching agent on top of ML), and Phase 5 (on-device serving + retraining). Nothing ships today; the audit-trail (B2C.4) is the prerequisite for everything else because it provides the training data. The interview-defining payoff is the "three shapes" demonstration — CV (MediaPipe) + ML (classifier) + LLM (coaching agent) in one production path.
