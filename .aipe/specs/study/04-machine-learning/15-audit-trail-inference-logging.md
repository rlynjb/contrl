# Audit trail and inference logging

**Industry name(s):** Audit trail, inference logging, ML observability, prediction logging
**Type:** Industry standard

> Every model prediction is logged with its inputs, output, confidence, and context. Two purposes: training data for the next model version (your labels become better as you accumulate data) and offline review (debugging predictions in production).

**See also:** → [16-training-run-logging](./16-training-run-logging.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

A model running in production is only as good as the data you can use to *improve* it. Without an audit trail, you can't retrain on what users actually encounter; you can't debug a single bad prediction; you can't measure drift. The audit trail is the bedrock of every production ML system.

The pattern is **inference logging** — record every prediction with enough context to (a) re-train, (b) debug, (c) detect drift. Universal across production ML.

---

## How it works

Every inference call writes a row. Schema is the same shape as the training data — features, prediction, confidence, label (filled in later if/when a human labels).

### Schema

```sql
CREATE TABLE classifier_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  rep_index INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  features TEXT NOT NULL,        -- JSON of 8-feature vector
  predicted_label TEXT NOT NULL,
  confidence REAL NOT NULL,
  model_version TEXT NOT NULL,
  inferred_at TEXT NOT NULL,
  label TEXT                     -- nullable; set by labeling tool
);
```

`features` is the same 8-element vector the model was trained on. `model_version` ensures you can correlate predictions with model artifacts. `label` is nullable so the row exists at inference time; the human labeler fills it in later for the subset of reps used in retraining.

### Write at inference time

```typescript
async function classify(rep: RepData): Promise<{ label: string; confidence: number }> {
  const features = extractFeatures(rep);
  const { predicted_label, confidence } = await session.run({ input: features });

  await db.recordInference({
    session_id: rep.session_id,
    rep_index: rep.index,
    exercise_id: rep.exercise_id,
    features: JSON.stringify(features),
    predicted_label,
    confidence,
    model_version: MODEL_VERSION,
    inferred_at: new Date().toISOString(),
  });

  return { predicted_label, confidence };
}
```

The write happens *after* the inference, asynchronously — must not block the rep counter.

### Read for retraining

```python
# Python side, when retraining:
rows = sqlite.query("SELECT features, label, predicted_label FROM classifier_outputs WHERE label IS NOT NULL")
# label IS NOT NULL = humans labeled this row
X = [json.loads(r['features']) for r in rows]
y = [r['label'] for r in rows]
```

The audit trail is the dataset source for v2, v3, ... of the model.

### Read for debugging

When the user reports "my pushup said elbow_flare but it was clean", you can pull that session's classifier_outputs rows and inspect: what features did the model see? What confidence? Compare to known-correct sessions.

### Move 2.5 — Privacy considerations

The audit trail is *local* (stays in SQLite). No upload to a server. For contrl this matches the local-first principle. For server-side ML, audit trails go into a secured data lake with PII redaction.

### Move 3 — The principle

Every model has a successor. The successor is trained on what the predecessor saw. Without recording what the predecessor saw, the successor is no better than starting from scratch.

---

## Audit trail — diagram

```
   Per-rep inference                       SQLite (classifier_outputs)
   ──────────────────                      ─────────────────────────────
                                                │
   pose landmarks ──► features                  │
                          │                     │
                          ▼                     │
                    model.run(features) ────►   │
                          │                     │
                          ▼                     │
                  { label, confidence }         │
                          │                     │
                          ▼                     │
                  record_inference(...)  ─────► one row appended
                          │
                          ▼
                  return to caller

   Later: human labels a subset
   ────────────────────────────
   labeling tool reads rows with label IS NULL
   user reviews video, sets label
   row updated to (features, predicted, label, confidence)

   Retraining
   ──────────
   SELECT * FROM classifier_outputs WHERE label IS NOT NULL
   ──► new training set
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B2C.4` — the audit trail spec is the prerequisite for the entire classifier pipeline because the training data has to come from somewhere.

Expected paths:
- New table `classifier_outputs` in `database.ts` migrations
- `recordInference` accessor in `database.ts`
- Read accessor for labeling tool (`getUnlabeledRows`)

---

## Elaborate

### Where this pattern comes from

Inference logging predates "ML observability" as a buzzword — every production fraud-detection system logs its predictions because chargebacks come back days later. The MLOps movement (~2018+) made it standard practice.

### The deeper principle

The model and its data are coupled. The model is only good if you have data; you only have data if you log. Treating logging as optional is the most common reason "production ML" stalls at v1.

### Where this breaks down

When the audit trail isn't trustworthy — wrong model_version recorded, features mis-extracted before logging. The fix is integration tests verifying the logged features exactly match what the model received.

### What to explore next

- [16-training-run-logging](./16-training-run-logging.md) → the training-side analog
- [18-drift-detection](./18-drift-detection.md) → consumer of the audit trail
- [19-retraining-pipelines](./19-retraining-pipelines.md) → how the trail feeds the next model

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Per-rep logging (planned)        │ No logging (alt)                  │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Retraining cost    │ Free — data is already there     │ Have to collect from scratch     │
│ Debug capability   │ Trace any prediction             │ Black box                         │
│ Storage            │ One row per rep (~few KB)        │ Zero                              │
│ Write latency      │ <1ms async                        │ Zero                              │
│ Drift detection    │ Native                            │ Not possible                      │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

A small amount of storage. At 100k reps × 1 KB = 100 MB local — tight on phones but workable. Mitigation: prune rows older than 6 months or rows successfully labeled and used for retraining.

### Sub-block 2 — what no logging would cost

Inability to retrain on user data. v2 of the model would be no different from v1. Inability to debug user complaints. Inability to detect drift.

### Sub-block 3 — the breakpoint

Fine until storage becomes the binding constraint (~10M rows = ~10GB). At that point, prune or aggregate.

### Sub-block 4 — what isn't a tradeoff

Logging only failed predictions was not picked because we don't know which were "failed" without labels — and labels come later.

---

## Tech reference (industry pairing)

### SQLite for inference logs

- **Codebase uses:** Existing SQLite layer; new table.
- **Why it's here:** transactional, queryable, fits the local-first model.
- **Leading today:** SQLite for mobile inference logs — `adoption-leading`, 2026.

---

## Project exercises

### [B2C.4] Audit trail / inference logging

- **Exercise ID:** `[B2C.4]`
- **What to build:** New `classifier_outputs` table; `recordInference` accessor; integration with the per-rep inference call so every rep writes a row.
- **Why it earns its place:** the *prerequisite* for every other ML exercise. Without this, no training data, no drift detection, no v2.
- **Files to touch:** `src/services/database.ts` (new migration), `src/services/ml/classifier.ts` (wrap inference with logging).
- **Done when:** running a workout produces classifier_outputs rows visible in the local DB.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Every model prediction writes a row to `classifier_outputs`: features, predicted label, confidence, model_version, timestamp, nullable label. The schema matches the training data shape so retraining is a straightforward query. The audit trail enables retraining, debugging, and drift detection. The constraint forcing this design is the local-first principle plus the need for self-labeled fine-tuning data. The cost is some storage and the discipline of writing per-inference.

### Key points

- Every prediction logs a row.
- Schema matches training data.
- Labels are nullable; humans fill them in for retraining subsets.
- The audit trail is the prerequisite for every other ML capability.

---

## Interview defense

### Likely questions

**Q: Why log every prediction?  [mid]**
A: Three reasons. Retraining — v2's training data is v1's predictions (subset humans label). Debug — when a user complains about a bad prediction, the audit trail tells you what the model saw. Drift detection — comparing prediction distribution over time tells you when to retrain.

**Q: What if storage becomes a problem?  [senior]**
A: Prune. Strategy: keep all recent rows (last 30 days); aggregate older rows (drop features, keep summary stats); discard rows older than a retraining cycle if not labeled. The pruning policy is product policy; the schema supports any of these.

**Q: At 10M predictions per user, where does this break?  [arch]**
A: Storage. 10M × 1KB = 10GB local — way past phone budget. Solution: aggregate older rows (e.g., daily summary stats only) and keep only the labeled subset + a recent rolling window. For multi-user deployments, ship audit trails to a cloud data lake with PII redaction.

### One-line anchors

- Every prediction logs.
- Labels nullable; filled in later.
- Retraining is a SQL query.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the inference → log → labeling → retraining flow.

### Level 2 — Explain it out loud
Why log every prediction. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a recommender audit trail. What rows?"

### Level 4 — Defend the decision you'd change
"Log only failed predictions." When?

### Quick check — code reference test
- What's the planned table?
- What's the nullable column?
- What's the curriculum exercise ID?

Then verify.
