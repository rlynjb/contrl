# Retraining pipelines

**Industry name(s):** Retraining pipelines, model lifecycle, continuous training, scheduled retraining
**Type:** Industry standard

> When does the classifier get retrained? Three triggers: drift detected, scheduled (e.g., monthly), or manual. Each fires the same pipeline: pull labeled data, train, eval, decide-to-deploy.

**See also:** → [17-drift-detection](./17-drift-detection.md) · → [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md) · → [16-training-run-logging](./16-training-run-logging.md)

---

## Why care

A trained model is a snapshot. To stay current, it must be re-trained periodically. The discipline of *when* and *how* to retrain — and how to decide whether the new model is actually better — is the production-ML capability that most candidates haven't built.

The pattern is **retraining as a managed pipeline** — explicit triggers, explicit eval gates, explicit deploy decisions. Same shape as CI/CD for code.

---

## How it works

Three triggers feed the same pipeline.

### Trigger 1 — Drift alert

PSI exceeds 0.25 ([17-drift-detection](./17-drift-detection.md)). Schedule a retraining run.

### Trigger 2 — Scheduled

Every month (or every N new labeled rows), kick off retraining regardless of drift. Catches gradual shifts that don't trigger PSI alerts.

### Trigger 3 — Manual

Engineer pushes a button after a major data change (e.g., new labeling pass added 200 rows).

### The pipeline

```
1. Pull labeled data
   SELECT features, label FROM classifier_outputs WHERE label IS NOT NULL

2. Train
   scripts/train_gbt.py  (with class_weight, on the latest labels)

3. Evaluate vs current production model
   On a held-out test set, compare:
     macro F1
     per-class F1
     calibration (ECE)

4. Decide to deploy
   Deploy only if:
     new_macro_F1 > current_macro_F1 + 0.01   (meaningful gain)
     no class regresses by > 0.05 F1           (no degradation)
     ECE not worse                              (calibration ok)

5. Log run record
   Append to docs/ml-runs.jsonl with the decision

6. If deploying:
   Bundle new model in app release
   (cannot hot-swap; tied to release cadence)
```

### Move 2.5 — Why automatic deploy is risky

If retraining and deploy are automatic, a regression in the new model auto-ships. For high-stakes systems, the deploy decision is *manual* even when training is automatic.

For contrl-mo, model updates are tied to app releases anyway (on-device bundle), so the human-in-the-loop is automatic.

### Move 3 — The principle

Model lifecycle is operational, not algorithmic. The hard parts aren't the math; they're the engineering of triggers, evals, and deploy gates.

---

## Pipeline — diagram

```
   Triggers
   ────────
   drift alert ────┐
   schedule    ────┼──►  retraining run
   manual      ────┘            │
                                │
                                ▼
                       1. pull labeled data
                                │
                                ▼
                       2. train (scripts/train_*.py)
                                │
                                ▼
                       3. eval vs current prod
                                │
                                ▼
                       4. decide to deploy?
                          │           │
                       yes│           │no
                          ▼           ▼
                  bundle in next     log + done
                   app release
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B5.12`. Expected:
- `scripts/retrain.py` (new) — orchestrates the pipeline
- `docs/retraining-decision.md` — the deploy criteria
- Triggers via cron (host-side) or manual

---

## Elaborate

### Where this pattern comes from

MLOps movement (~2018+) formalized the lifecycle. Before that, retraining was ad hoc. Tools like Kubeflow, MLflow, Vertex AI codify the pipeline shape.

### The deeper principle

Code has CI; models need it too. The discipline isn't optional once a model is in production.

### Where this breaks down

When triggers aren't tuned. Too-aggressive drift alerts fire constantly; too-lax don't fire when needed. The threshold is a knob, not a fixed value.

### What to explore next

- [17-drift-detection](./17-drift-detection.md) → one of the triggers
- [16-training-run-logging](./16-training-run-logging.md) → how decisions are recorded
- [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md) → where the model gets deployed

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Managed pipeline (planned)       │ Ad hoc retraining (alt)          │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Setup              │ Scripts + decision criteria      │ Just run the train script        │
│ Reliability        │ Deploy gates prevent regressions │ Possible regressions             │
│ Reproducibility    │ Via run log + decision criteria  │ Engineer's memory                │
│ Latency on drift   │ Fast (auto-trigger)              │ Manual delay                     │
│ Auditability       │ Every deploy has a record        │ Where did this model come from?  │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

A bit of setup time. Smaller than the cost of one bad deploy.

### Sub-block 2 — what ad hoc would cost

Regressions ship silently. Engineers can't reproduce decisions. The model graveyard fills with mystery artifacts.

### Sub-block 3 — the breakpoint

Required from v1 for any production ML.

### Sub-block 4 — what isn't a tradeoff

Auto-deploy without gates was not picked because the cost of a regression is too high.

---

## Tech reference (industry pairing)

### Cron + scripts

- **Codebase uses:** Not yet. Planned for v1.
- **Why it's here:** the simplest scheduled trigger.
- **Leading today:** Cron + bash — `adoption-leading` for small projects.
- **Runner-up:** Airflow, Prefect, Kubeflow — `adoption-leading` for multi-step ML pipelines at scale.

---

## Project exercises

### [B5.12] Retraining decision doc + pipeline

- **Exercise ID:** `[B5.12]`
- **What to build:** `docs/retraining-decision.md` enumerating triggers + deploy criteria. `scripts/retrain.py` orchestrating the pipeline.
- **Why it earns its place:** the operational discipline that distinguishes a one-shot model from a production system.
- **Files to touch:** `scripts/retrain.py`, `docs/retraining-decision.md`.
- **Done when:** the script runs end-to-end (manual trigger), produces a run record, decides whether to deploy, and the decision doc is committed.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Retraining fires on drift detection, schedule, or manual trigger. The pipeline pulls labeled data, trains, evaluates against the current production model with explicit deploy criteria, and decides to ship. Every run logs to `docs/ml-runs.jsonl`; every deploy is auditable. The constraint forcing this design is the production-ML need to evolve models safely. The cost is some operational setup.

### Key points

- Three triggers, one pipeline.
- Deploy gates prevent regressions.
- Run log + decision doc = auditable history.
- Manual deploy decision for high-stakes models.

---

## Interview defense

### Likely questions

**Q: When do you retrain?  [mid]**
A: Three triggers. Drift alert (PSI > 0.25). Schedule (monthly or every N new labels). Manual (after a labeling pass or known data change). The same pipeline runs in all three cases.

**Q: How do you decide whether to deploy the new model?  [senior]**
A: Explicit deploy criteria. Macro F1 must improve by at least 0.01; no class can regress by more than 0.05 F1; calibration ECE must not worsen. If all three hold, deploy; otherwise log and discard. The criteria are in `docs/retraining-decision.md` — review them as the model matures.

**Q: At a multi-user scale, how does this change?  [arch]**
A: Multi-user adds per-user-cohort retraining and A/B-rolled deploys. Train one global model per cycle; A/B deploy to 10% of users; monitor for a week; roll to 100% if metrics hold. Hot-swap models server-side instead of bundling in releases.

### One-line anchors

- Three triggers, one pipeline.
- Deploy gates are non-negotiable.
- Every deploy has a run record.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the trigger → pipeline → deploy gate flow.

### Level 2 — Explain it out loud
Why explicit deploy criteria. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Retraining for the recommender. Same pipeline?"

### Level 4 — Defend the decision you'd change
"Auto-deploy on training completion." When?

### Quick check — code reference test
- What's the planned script?
- What are the three triggers?
- Where do deploy criteria live?

Then verify.
