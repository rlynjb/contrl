# Anomaly detection system design

**Industry name(s):** Anomaly detection, outlier detection, IK Module 3
**Type:** Industry standard

> Flag instances that don't fit the normal pattern. Applies to LLM hallucination detection, ML drift monitoring, fraud, security. Imbalanced by definition (anomalies are rare).

**See also:** → [../17-drift-detection.md](../17-drift-detection.md) · → [../05-class-imbalance.md](../05-class-imbalance.md)

---

- **The prompt:** Design an anomaly detection system for [domain]. The system must flag unusual instances while keeping false-positive rate manageable.

- **Standard architecture:**

  ```
  input stream (events, predictions, transactions, ...)
        │
        ▼
  ┌──────────────────┐
  │ feature extraction│  ── domain features + statistical summaries
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ scorer           │  ── one of:
  │                  │     • isolation forest
  │                  │     • autoencoder reconstruction error
  │                  │     • statistical (Z-score, IQR)
  │                  │     • supervised binary classifier (if labels)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ thresholding     │  ── score > threshold → alert
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ alerting + log   │  ── send alert, log for human review
  └──────────────────┘
  ```

- **Data model:**
  - `events` — `{id, features, timestamp, source}`
  - `anomaly_scores` — `{event_id, score, threshold, action_taken}`
  - `feedback` — `{event_id, was_actually_anomaly}` (for supervised feedback)

- **Key components:**
  - *Feature extraction*: domain-specific signals (e.g., for ML drift: PSI vs training distribution; for fraud: transaction amount, location, time-since-last).
  - *Scorer*: depends on supervision availability. Unsupervised (isolation forest, autoencoder) when no labels; supervised binary classifier when labels exist.
  - *Threshold*: trades false-positive rate against false-negative rate. Tune on a labeled set if available; use percentile cutoff (e.g., top 1%) if not.
  - *Alerting*: route to human-review queue for high-precision domains; auto-block for high-recall domains.

- **Scale concerns:**
  - At ~1M events/day: per-event scoring fine; storage of scores becomes significant. Mitigation: keep scores only for alerts + sampled normals.
  - At ~100 alerts/day: human review manageable. Above ~500/day, need triage (urgency classifier) to prevent backlog.
  - At ~10K events/sec: scorer latency tight. Mitigation: feature pre-computation, simpler scorer for the hot path.

- **Eval framing:**
  - Offline: ROC-AUC, precision@k (top-k flagged), recall on known anomalies.
  - Online: false-positive rate (alerts marked "not anomaly"), false-negative rate (anomalies missed, found later).
  - "Recall of unknown unknowns" is the hard problem — you don't know what you missed if you never saw it.

- **Common failure modes:**
  - Concept drift (normal pattern shifts; old threshold floods false positives). Mitigation: retrain regularly; rolling-window thresholds.
  - Adversarial drift (the entity learns to evade detection). Mitigation: don't expose the threshold; iterate model.
  - Class imbalance during training (anomalies are rare). Mitigation: oversample, class weights, semi-supervised methods.
  - Alert fatigue (too many false positives → ignored alerts). Mitigation: tune threshold harder; precision over recall.

- **Applies to this codebase:** `partially`. contrl's planned drift detection on the form classifier ([../17-drift-detection.md](../17-drift-detection.md)) IS anomaly detection at the model-output level: PSI > 0.25 = "anomalous distribution shift". Different scale and mechanism (population-level vs event-level), same family.

- **How to make it apply:** The PSI-based drift detector in B3.13 is one instance. Per-rep anomaly detection (a rep so unusual the classifier shouldn't trust its prediction) would be a deeper application — train an unsupervised detector on "normal rep feature vectors", flag outliers for human review before they affect training data. Could be added to Phase 5 as an extension.
