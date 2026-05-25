# Drift detection

**Industry name(s):** Drift detection, distribution shift detection, prediction drift, data drift, PSI (Population Stability Index)
**Type:** Industry standard

> The model was trained on yesterday's data; today's data may have shifted. Drift detection compares current prediction distribution against the training distribution. When the gap exceeds a threshold, alert (and retrain).

**See also:** → [06-domain-gap-and-transfer-learning](./06-domain-gap-and-transfer-learning.md) · → [19-retraining-pipelines](./19-retraining-pipelines.md)

---

## Why care

A model is a snapshot of "what was true at training time". The world moves. Without drift detection, you ship the same model forever and silently watch performance degrade. The skill is naming when "the world has moved enough that we need to retrain".

The pattern is **distribution-shift monitoring** — compare a recent window of predictions (or features) against the training-time distribution. Universal in production ML.

---

## How it works

Two flavors: prediction drift (output distribution shifts) and data drift (input distribution shifts). Both are computed by binning and comparing distributions.

### Prediction drift

Compare current vs training prediction distribution.

```
Training distribution                   Last 100 sessions
─────────────────────                   ────────────────────
good             80%                    good             68%
elbow_flare       8%                    elbow_flare      14%
incomplete       6%                     incomplete       11%
back_arch         4%                    back_arch         5%
hip_sag           2%                    hip_sag           2%
```

The user's `elbow_flare` rate has shifted up. Either: (a) the user's form is actually worse, (b) the model's behavior has changed, or (c) something about the data collection drifted (camera angle, etc.).

### Quantifying — Population Stability Index (PSI)

```
PSI = sum over bins:  (current_freq - training_freq) × ln(current_freq / training_freq)
```

Convention:
- PSI < 0.1 → no significant drift
- 0.1 ≤ PSI < 0.25 → moderate drift, monitor
- PSI ≥ 0.25 → significant drift, action needed

### Move 2.5 — When to fire

Compute PSI on a rolling window (e.g., last 100 sessions). When it crosses the threshold, log to `docs/ml-runs.jsonl` and (eventually) trigger a retraining decision per [19-retraining-pipelines](./19-retraining-pipelines.md).

### Move 3 — The principle

Drift is data, not a model bug. The model is doing what it was trained to do; the world moved. Detecting the move early is what lets you respond before users feel the degradation.

---

## Drift — diagram

```
   Training distribution                    Current window (e.g., last 100 sessions)
   ─────────────────────                    ────────────────────────────────────────
   labels: { good: 80%,                     labels: { good: 68%,
             flare: 8%,                              flare: 14%,
             depth: 6%,                              depth: 11%,
             arch: 4%,                              arch: 5%,
             hip: 2% }                              hip: 2% }
                  │                                       │
                  └──────────┬────────────────────────────┘
                             ▼
                    PSI = Σ (c − t) · ln(c / t)
                             │
                  ┌──────────┴──────────┐
                  │                     │
              < 0.1                ≥ 0.25
                  │                     │
                  ▼                     ▼
            no action            log + flag retraining
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B3.13`. Expected:
- `scripts/check_drift.py` — reads classifier_outputs, computes PSI, writes alert to ml-runs.jsonl
- Run periodically (cron or manually)

---

## Elaborate

### Where this pattern comes from

PSI originated in credit-risk modeling (1990s); the wider "drift detection" concept emerged with production ML. Modern frameworks (Evidently, Arize) automate the math.

### The deeper principle

Models are time-stamped. The longer you wait between retrains, the more the world has moved. Drift detection is the explicit measurement of that movement.

### Where this breaks down

PSI on a tiny window (< 100 examples) is noisy. PSI on a huge window misses recent shifts. Window-size tuning matters.

### What to explore next

- [19-retraining-pipelines](./19-retraining-pipelines.md) → what drift alerts trigger

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Drift detection (planned)        │ Time-based retrain (alt)         │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Trigger            │ Distribution-driven              │ Fixed schedule                   │
│ Compute            │ Periodic PSI calculation         │ None                             │
│ Sensitivity        │ Catches sudden shifts            │ Misses sudden shifts             │
│ False alarms       │ Possible with small window       │ Zero                             │
│ Latency to retrain │ Fast on real shift               │ Up to schedule period            │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Some compute cost to run drift checks. Negligible at single-user scale.

### Sub-block 2 — what time-based-only would cost

Misses sudden shifts. If your model degrades the day after you train it (e.g., user's camera setup changed), you wait weeks to find out.

### Sub-block 3 — the breakpoint

Fine for any scale; small windows = noisy. Larger user bases = better drift detection.

### Sub-block 4 — what isn't a tradeoff

Real-time drift detection (per-prediction) was not picked — PSI on a rolling window is the more stable signal.

---

## Tech reference (industry pairing)

### PSI hand-rolled

- **Codebase uses:** Not yet. Planned for `scripts/check_drift.py`.
- **Why it's here:** the canonical drift metric; simple to implement.
- **Leading today:** PSI — `adoption-leading` for tabular drift, 2026.
- **Runner-up:** KL divergence — same shape, slightly different interpretation.

---

## Project exercises

### [B3.13] Drift detection on classifier

- **Exercise ID:** `[B3.13]`
- **What to build:** `scripts/check_drift.py` reads classifier_outputs, computes PSI against training distribution, alerts if > 0.25. Logs to `docs/ml-runs.jsonl`.
- **Why it earns its place:** the ML-ops capability that turns "ship and forget" into "ship and monitor".
- **Files to touch:** `scripts/check_drift.py`, `docs/ml-runs.jsonl`.
- **Done when:** running the script on accumulated outputs produces a PSI number and alert (if applicable).
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

PSI compares current prediction distribution against training distribution. Above 0.25, drift is significant and retraining is warranted. For contrl's planned classifier, drift detection runs on a rolling window (e.g., last 100 sessions) and writes alerts to the ml-runs log. The constraint forcing this design is that the world moves between training cycles. The cost is periodic compute.

### Key points

- Drift is data, not a model bug.
- PSI < 0.1 = stable; ≥ 0.25 = retrain.
- Rolling window over recent predictions.
- The signal that triggers retraining decisions.

---

## Interview defense

### Likely questions

**Q: How do you detect drift?  [mid]**
A: Compute PSI between the training distribution of predictions and a rolling window of current predictions. PSI under 0.1 means no significant drift; above 0.25 means significant. Run the check periodically and log alerts.

**Q: Prediction drift vs data drift?  [senior]**
A: Prediction drift compares model outputs. Data drift compares model inputs (features). They often correlate but not always — if input features drift in a way that doesn't change predictions, the model is robust; if predictions drift without input drift, something internal changed (e.g., wrong model deployed). Both worth monitoring; PSI works for either.

**Q: At 1M predictions per day, where does this break?  [arch]**
A: The compute is fine (PSI is O(bins)). The challenge is windowing — choosing the right window size to balance noise (small window) against stale detection (huge window). Production systems often use multiple windows simultaneously: 1-hour for fast detection, 7-day for stable trends.

### One-line anchors

- PSI quantifies drift.
- < 0.1 stable; ≥ 0.25 retrain.
- Drift is data; model is doing its job.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the PSI calculation.

### Level 2 — Explain it out loud
Why drift detection vs time-based retrain. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add drift detection on the recommender's followed-rate."

### Level 4 — Defend the decision you'd change
"Skip drift detection." When?

### Quick check — code reference test
- What's the planned script?
- What threshold triggers action?
- What metric is computed?

Then verify.
