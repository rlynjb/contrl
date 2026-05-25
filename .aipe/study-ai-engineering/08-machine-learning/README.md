# 08 — Machine learning

**The richest sub-section — 19 contrl-anchored Case A files.** Covers the supervised pipeline contrl is being built toward (Phase 2C form classifier + recommender) plus the operational disciplines (eval, drift, retraining) that protect ML in production. Every file references real contrl curriculum builds.

## Files

1. **[01-supervised-pipeline](./01-supervised-pipeline.md)** — the end-to-end shape: data → features → train/eval → deploy.
2. **[02-feature-engineering-from-pose](./02-feature-engineering-from-pose.md)** — the 8 per-rep features contrl will extract from pose landmarks.
3. **[03-train-val-test-discipline](./03-train-val-test-discipline.md)** — three-split discipline; held-out test sets.
4. **[04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md)** — logistic regression baseline then LightGBM; never skip the baseline.
5. **[05-class-imbalance](./05-class-imbalance.md)** — handling skewed label distributions.
6. **[06-domain-gap-and-transfer-learning](./06-domain-gap-and-transfer-learning.md)** — training data ≠ production distribution.
7. **[07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md)** — F1 per class is what matters, not aggregate accuracy.
8. **[08-calibration](./08-calibration.md)** — confidence scores that match reality.
9. **[09-bias-variance](./09-bias-variance.md)** — underfitting vs overfitting trade.
10. **[10-ab-testing-single-user](./10-ab-testing-single-user.md)** — A/B testing the recommender with n=1.
11. **[11-recommender-framing](./11-recommender-framing.md)** — rule-based v1, learned v2.
12. **[12-cold-start](./12-cold-start.md)** — what to do before you have any user data.
13. **[13-on-device-inference](./13-on-device-inference.md)** — ONNX Runtime Mobile; the serving constraint that shapes every model choice.
14. **[14-quantization](./14-quantization.md)** — reducing model size for mobile deployment.
15. **[15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)** — the `classifier_outputs` table; prereq for everything downstream.
16. **[16-training-run-logging](./16-training-run-logging.md)** — JSONL `docs/ml-runs.jsonl`; reproducibility.
17. **[17-drift-detection](./17-drift-detection.md)** — PSI on rolling windows; when to retrain.
18. **[18-retraining-pipelines](./18-retraining-pipelines.md)** — labeled new data; eval gate; deploy.
19. **[19-ml-system-design](./19-ml-system-design.md)** — the system-design framing of contrl's ML.

## Reading order

Read **01 (supervised pipeline)** first as the framing. Then **15 (audit trail)** because every other concept depends on it. Then **02-04** for the build sequence. **07-08** are the eval discipline. **11-13** are the deployment angle. **16-18** are the operational discipline. **19** is the synthesis.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../09-ml-system-design-templates/README.md](../09-ml-system-design-templates/README.md)
