# 04 — Machine Learning

Curriculum-loaded mode. contrl-mo's ML scope is **Phase 2C + Phase 3 ML + Phase 5 on-device** of the curriculum. **No ML surface ships today** beyond the pre-trained MediaPipe pose model — every file in this section is **Case B** (concept not yet implemented; `## In this codebase` says so and `## Project exercises` names the curriculum Build item that *would* implement it).

## Curriculum phase mapping

| Phase | What it covers | Files |
|---|---|---|
| **2C — Classical ML** | Form classifier + recommender end-to-end | 01–08, 11–13, 15 |
| **3 — Evals + observability** | Metrics, A/B, drift detection, training logs | 07, 09, 10, 16, 17 |
| **5 — Production ML** | Quantization, on-device serving, retraining | 14, 18, 19 |

## File index

### Supervised learning foundations
- **[01-supervised-pipeline](./01-supervised-pipeline.md)** — six stages, end-to-end
- **[02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md)** — 8-feature per-rep vector
- **[03-train-val-test-discipline](./03-train-val-test-discipline.md)** — session-level split
- **[04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md)** — baseline + strong model

### Data and model quality
- **[05-class-imbalance](./05-class-imbalance.md)** — class weights, macro F1
- **[06-domain-gap-and-transfer-learning](./06-domain-gap-and-transfer-learning.md)** — public + fine-tune

### Metrics
- **[07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md)** — read the matrix
- **[08-calibration](./08-calibration.md)** — Platt / isotonic
- **[09-bias-variance](./09-bias-variance.md)** — the framework

### Evaluation discipline
- **[10-ab-testing-single-user](./10-ab-testing-single-user.md)** — random arm assignment

### Recommender systems
- **[11-recommender-framing](./11-recommender-framing.md)** — content vs collaborative vs hybrid
- **[12-cold-start](./12-cold-start.md)** — threshold dispatch

### On-device inference
- **[13-on-device-inference](./13-on-device-inference.md)** — ONNX, latency budget
- **[14-quantization](./14-quantization.md)** — fp16, int8

### ML observability
- **[15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)** — every prediction logs
- **[16-training-run-logging](./16-training-run-logging.md)** — JSONL run records
- **[17-drift-detection](./17-drift-detection.md)** — PSI threshold

### Retraining
- **[18-retraining-pipelines](./18-retraining-pipelines.md)** — triggers + deploy gates

### Synthesis
- **[19-ml-system-design](./19-ml-system-design.md)** — three loops
- **[20-ml-features-in-this-app](./20-ml-features-in-this-app.md)** — what contrl-mo plans

## ML features table

See [20-ml-features-in-this-app.md](./20-ml-features-in-this-app.md) for the full inventory.

Quick view:

| Feature | Model type | Inference location |
|---|---|---|
| Rep counting | Deterministic FSM (no ML) | On-device JS |
| Pose estimation | MediaPipe (pre-trained CNN) | On-device GPU |
| Form classifier *(planned)* | LightGBM / tabular | On-device via ONNX |
| Progression recommender v1 *(planned)* | Rule-based | On-device JS |
| Progression recommender v2 *(planned)* | LightGBM / tabular | On-device via ONNX |

## Where to drill in

- **Building the classifier?** Start at **[01-supervised-pipeline](./01-supervised-pipeline.md)** then walk through 02–08.
- **Evaluating the classifier?** Read **[07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md)**, **[08-calibration](./08-calibration.md)**, **[09-bias-variance](./09-bias-variance.md)**.
- **Building the recommender?** **[11-recommender-framing](./11-recommender-framing.md)** and **[12-cold-start](./12-cold-start.md)**.
- **Production discipline?** **[15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)**, **[16-training-run-logging](./16-training-run-logging.md)**, **[17-drift-detection](./17-drift-detection.md)**, **[18-retraining-pipelines](./18-retraining-pipelines.md)**.
- **Synthesis?** **[19-ml-system-design](./19-ml-system-design.md)**.

→ See [`system-design-templates/`](./system-design-templates/) for IK-style interview reframes (recommender, anomaly detection, object detection / CV).
