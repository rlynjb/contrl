# Training run logging

**Industry name(s):** Training-run logging, experiment tracking, MLflow, W&B
**Type:** Industry standard

> Every training run records: data version, feature config, hyperparameters, metrics, model artifact. Without this, you can't reproduce a model, compare experiments, or trace which model is in production.

**See also:** → [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md) · → [19-retraining-pipelines](./19-retraining-pipelines.md)

---

## Why care

You train 10 model versions tuning hyperparameters. Three weeks later you can't remember which one had the best macro F1. Without a log, you've lost the experiment. Training-run logging is the ML equivalent of git — versioning the experiment, not the code.

The pattern is **experiment tracking** — record every run with enough metadata to reproduce or compare. Same family as MLflow, W&B, Comet. For a small project, a minimal JSON log is enough.

---

## How it works

Each training run writes a record with the run metadata + final metrics + model artifact location.

### Minimal schema

```json
{
  "run_id": "2026-05-11-train-gbt-v3",
  "timestamp": "2026-05-11T14:00:00Z",
  "data_version": "self-labeled-v2 + public-fitlabel-v1",
  "split_seed": 42,
  "feature_config": "8-feature-v1",
  "model_type": "lightgbm",
  "hyperparams": {
    "n_estimators": 200,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "class_weight": "balanced"
  },
  "metrics": {
    "test_macro_f1": 0.74,
    "test_per_class_f1": {"good": 0.89, "elbow_flare": 0.71, ...},
    "test_ece": 0.07
  },
  "model_artifact": "models/form_classifier_v3.onnx"
}
```

One JSONL file (`docs/ml-runs.jsonl`) appended per run. Each line is a self-contained record.

### Loading

```python
import json
runs = [json.loads(line) for line in open('docs/ml-runs.jsonl')]
print(max(runs, key=lambda r: r['metrics']['test_macro_f1']))
```

Filter, sort, compare. The minimal-tool approach.

### Why not MLflow / W&B?

For a personal project, the overhead of running an MLflow server or paying for W&B isn't worth it. A JSONL file does 80% of what they do — search, compare, audit. When the team grows or experiments scale, switch.

### Move 2.5 — What links runs to deployed model

The `model_artifact` field. The currently-deployed model has a known artifact path; the run record points to the same path. The chain is: production model → artifact → run record → reproducibility.

### Move 3 — The principle

A model without a run record is unreproducible. If you can't reproduce, you can't debug. Every retraining attempt becomes a leap of faith. The minimal log is the smallest investment that prevents this.

---

## Run logging — diagram

```
   Training script runs
   ───────────────────
       │
       ▼
   build run record:
     run_id, timestamp
     data_version, split_seed
     feature_config
     model_type, hyperparams
       │
       │  train + eval
       ▼
   metrics computed
       │
       ▼
   save model artifact
       │
       ▼
   append to docs/ml-runs.jsonl
       │
       ▼
   commit to git (data_version + script + run record all reproducible)
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B3.12`. Expected:
- `docs/ml-runs.jsonl` (new, append-only)
- `scripts/train_*.py` writes a record on each run
- `scripts/list_runs.py` prints summary table

---

## Elaborate

### Where this pattern comes from

Experiment tracking emerged ~2018 with MLflow (Databricks) and W&B (independent). Before that, ML practitioners hand-rolled their own logs (spreadsheets, text files). The pattern won because every team that didn't have it eventually wished they did.

### The deeper principle

Reproducibility is the foundation of every other ML practice. Without it, you can't debug, can't audit, can't safely deploy.

### Where this breaks down

When `data_version` is ambiguous. "self-labeled-v2" is a string; if the actual labeling files changed without bumping the version, the record lies. Mitigation: hash the data + commit hash of the labeling tool.

### What to explore next

- [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md) → the inference-side log
- [19-retraining-pipelines](./19-retraining-pipelines.md) → uses run logs to decide retraining

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Minimal JSONL log (planned)      │ MLflow / W&B (alt)               │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Setup              │ Zero                             │ Server / account                 │
│ Searchability      │ grep                             │ Built-in UI                      │
│ Visualization      │ Manual (matplotlib)              │ Built-in plots                   │
│ Collaboration      │ Just files                       │ Built-in sharing                 │
│ Cost               │ Zero                             │ Subscription or self-host        │
│ Migration cost     │ N/A                              │ Vendor lock-in                   │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

UI, dashboards, fancy comparisons. Tradeable for zero setup cost.

### Sub-block 2 — what MLflow would cost

A server (self-host) or a subscription. Useful past ~50 runs; overkill for a personal project's first ~10–20 runs.

### Sub-block 3 — the breakpoint

Fine until run count exceeds ~50 or multiple people need to compare. Switch to MLflow when either condition triggers.

### Sub-block 4 — what isn't a tradeoff

Skipping the log entirely is not an option for any ML project past v1 — unreproducible from the start.

---

## Tech reference (industry pairing)

### JSONL file as experiment log

- **Codebase uses:** Not yet. Planned for v1.
- **Why it's here:** simplest correct experiment tracker.
- **Leading today:** Lightweight JSONL — `adoption-leading` for small projects, 2026.
- **Why it leads:** zero setup, version-controllable, scriptable.
- **Runner-up:** MLflow self-hosted — `adoption-leading` for team projects.

---

## Project exercises

### [B3.12] Training-run logging

- **Exercise ID:** `[B3.12]`
- **What to build:** Append a JSON record to `docs/ml-runs.jsonl` after every training script run; include all the schema fields above.
- **Why it earns its place:** experiment reproducibility is non-negotiable; the cheapest version of it is one JSONL file.
- **Files to touch:** `scripts/train_*.py` (each appends), `docs/ml-runs.jsonl`.
- **Done when:** the file has at least 3 records (e.g., LR baseline, GBT baseline, GBT with class weights).
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Every training run writes a JSON record with run_id, data_version, hyperparams, metrics, and model artifact location. The records go in `docs/ml-runs.jsonl`, append-only. Reproducibility, comparison, and audit are all `grep`-able. The constraint forcing this design is that without records, ML projects rapidly become unreproducible. The cost is a few lines of logging code per training script.

### Key points

- One JSONL line per run.
- Records: data_version + hyperparams + metrics + artifact.
- Minimal tool, full reproducibility.
- Switch to MLflow when team or run count grows.

---

## Interview defense

### Likely questions

**Q: How do you track experiments?  [mid]**
A: One JSONL file (`docs/ml-runs.jsonl`), append-only. Each training run writes a record with the data version, hyperparams, final metrics on test, and the path to the saved model artifact. To find the best model: `grep`, sort, compare.

**Q: MLflow vs JSONL?  [senior]**
A: MLflow has UI and search. JSONL has zero setup. For a personal project at ~10–20 runs, JSONL is the right size. At ~50+ runs or a team of 2+, MLflow's UI starts paying for the setup cost.

**Q: How do you guarantee reproducibility from a run record?  [arch]**
A: data_version + commit hash of the training script + the artifact file. Run the same script at the same commit on the same data version and you get the same model (modulo non-determinism in the training algorithm itself — pin seeds where possible).

### One-line anchors

- One record per run.
- Reproducibility is non-negotiable.
- JSONL is the smallest viable tracker.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the run-record schema.

### Level 2 — Explain it out loud
Why log every run. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Switch from JSONL to MLflow when?"

### Level 4 — Defend the decision you'd change
"Skip the run log." When?

### Quick check — code reference test
- What's the planned file?
- What's the schema?
- What's the curriculum exercise ID?

Then verify.
