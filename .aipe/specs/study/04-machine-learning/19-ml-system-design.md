# ML system design

**Industry name(s):** ML system design, ML vs general system design, ML platform design
**Type:** Industry standard

> An ML system design differs from a general system design in three ways: there's a data pipeline (not just a request pipeline), there's a training step (not just deployment), and there's a feedback loop (predictions become future training data). IK Module 6's framing.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [18-retraining-pipelines](./18-retraining-pipelines.md) · → [15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)

---

## Why care

Most candidates can do general system design. ML system design is the next layer. The questions are: where do training labels come from? How does data flow from collection to model to prediction back to training? When do you retrain? Naming these as first-class concerns is what distinguishes "I designed an ML system" from "I drew boxes for a service".

The pattern is **three loops** — request loop (the user's request → prediction), training loop (data → model), feedback loop (predictions → labels → next model).

---

## How it works

A general system design has one loop: request → service → response. An ML system has three.

### Loop 1 — Request (online)

```
   user request → inference service → prediction → response
```

Same as a regular service. Latency budgets, scaling, rate limits.

### Loop 2 — Training (offline)

```
   labeled data → preprocessing → train → eval → register
```

Separate from the request loop. Different latency budget (hours/days, not ms). Different infrastructure (batch compute, not serving).

### Loop 3 — Feedback (closes the cycle)

```
   prediction logs → label collection → next training data
```

The audit trail ([15-audit-trail-inference-logging](./15-audit-trail-inference-logging.md)) plus labeling pipeline ([01-supervised-pipeline](./01-supervised-pipeline.md) stage 1). What makes ML systems *live* — they evolve.

### For contrl-mo

```
   Request loop:
     pose landmarks → classifier.run() → label → coaching agent

   Training loop:
     labeled classifier_outputs → scripts/train_gbt.py → form_classifier.onnx → app bundle

   Feedback loop:
     classifier_outputs (rows with NULL label) → labeling tool → labeled rows → next train
```

Three loops, all visible in the codebase plan. The interview answer is naming each one and what code/data lives in it.

### Move 2.5 — What's NOT in a general system design

- A training pipeline.
- A model registry / artifact store.
- A label collection pipeline.
- Drift monitoring.
- Retraining triggers.
- An A/B framework for model versions.

If your "ML system design" interview answer doesn't mention these, it's a general system design with the word "ML" pasted on.

### Move 3 — The principle

Models age. Data shifts. Systems that don't account for this fail silently. The discipline of ML system design is naming the lifecycle and the feedback loops; the algorithms are downstream.

---

## Three loops — diagram

```
   ┌─ Request loop (online, ms) ─────────────────────────────────────┐
   │                                                                 │
   │  user → app → classifier.run() → label + confidence → coaching  │
   │                          ↓                                      │
   │                  log to classifier_outputs                      │
   │                                                                 │
   └────────────────────────┬────────────────────────────────────────┘
                            │
                            │  feedback over time
                            ▼
   ┌─ Feedback loop (continuous) ────────────────────────────────────┐
   │                                                                 │
   │  classifier_outputs (predictions)                               │
   │     ↓                                                           │
   │  user/engineer labels a subset                                  │
   │     ↓                                                           │
   │  classifier_outputs with label IS NOT NULL                      │
   │                                                                 │
   └────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
   ┌─ Training loop (offline, hours) ────────────────────────────────┐
   │                                                                 │
   │  labeled rows → preprocessing → train → eval → ml-runs.jsonl    │
   │     ↓                                                           │
   │  deploy decision → bundle in app release                        │
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
        │
        │  triggers
        ▼
     drift / schedule / manual
```

---

## In this codebase

**Not yet implemented.** Phase 5 `B5.14` is the "three system designs" integration deliverable; this concept feeds into it.

Each loop maps to specific files (planned):
- Request: `src/services/ml/classifier.ts`
- Training: `scripts/train_*.py` + `docs/ml-runs.jsonl`
- Feedback: `src/services/database.ts` (classifier_outputs table) + `bin/label-session.ts`

---

## Elaborate

### Where this pattern comes from

IK ML Module 6 names "ML system design vs general system design". Chip Huyen's *Designing Machine Learning Systems* book is the canonical reference. The three-loop framing emerged in MLOps writing ~2019.

### The deeper principle

ML systems are not stateless services. They have memory (the data they were trained on) and they evolve (the data they see in production). Designing without naming the lifecycle is designing for the v1 only.

### Where this breaks down

For frozen / one-shot models that never retrain — the feedback loop is absent. Acceptable for static problems; risky for any problem where data shifts.

### What to explore next

- [18-retraining-pipelines](./18-retraining-pipelines.md) → the operational implementation
- See [`system-design-templates/`](./system-design-templates/) → applied templates

---

## Tradeoffs

There's no tradeoff in the pattern itself — it's the lens for designing. The tradeoffs live in *how* you implement each loop.

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Three-loop design (recognized)   │ Service-only design (alt)        │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Initial complexity │ Higher                           │ Lower                            │
│ Long-term reliability│ Models stay current            │ Models silently age              │
│ Auditability       │ Lifecycle is visible             │ Mysterious "how did this happen" │
│ Interview signal   │ Senior+ shape                    │ Mid                              │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

---

## Tech reference (industry pairing)

### MLOps stacks

- **Codebase uses:** Hand-rolled per loop (SQLite for audit, JSONL for runs, app bundle for serving).
- **Why it's here:** smallest correct setup for personal-project scale.
- **Leading today:** AWS SageMaker / Vertex AI / Databricks — `adoption-leading` for enterprise; `innovation-leading` ergonomic alternatives like Modal.
- **Runner-up:** ZenML / Kubeflow — `innovation-leading` open-source pipeline orchestrators.

---

## Project exercises

### [B5.14] Three system designs 1-pager

- **Exercise ID:** `[B5.14]`
- **What to build:** A single document in `aieng-portfolio/three-system-designs.md` (cross-project) presenting contrl-mo as "on-device classification + recommender", loopd as "LLM application", aipe as "retrieval-augmented tooling". Reference IK Modules 1–6 where each applies.
- **Why it earns its place:** the interview synthesis artifact — the three-shapes story made explicit.
- **Files to touch:** `aieng-portfolio/three-system-designs.md` (cross-project, not in contrl-mo's repo).
- **Done when:** the doc has three sections, each with a system-design diagram + IK-module mapping + key tradeoffs.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

An ML system design has three loops: request (online inference), training (offline model production), feedback (predictions become next-cycle training data). General system design has only the request loop. For contrl-mo's planned classifier, the request loop is `classifier.run()`; the training loop is `scripts/train_*.py + ml-runs.jsonl`; the feedback loop is `classifier_outputs + labeling tool`. The constraint forcing this design is that models age and data shifts; the cost is more architectural surface than a stateless service.

### Key points

- Three loops, not one.
- Each loop has its own latency budget and infrastructure.
- The feedback loop is what makes the system live.
- Missing the lifecycle is the most common interview gap.

---

## Interview defense

### Likely questions

**Q: What's different about an ML system design vs a regular one?  [mid]**
A: Three loops instead of one. The request loop is the regular service. Plus a training loop (offline, hours-long, produces model artifacts) and a feedback loop (predictions get logged, labeled later, feed the next training).

**Q: How do you handle model versioning across the loops?  [senior]**
A: Every prediction logs the `model_version` it came from. Every training run logs the data version + script commit hash. The deploy decision references both. Auditing "which model produced this prediction" is a SQL query on the audit trail; "what produced that model" is a lookup in the runs log.

**Q: At enterprise scale, what changes?  [arch]**
A: Each loop gets its own infrastructure. Request loop on a serving platform (SageMaker endpoints, Vertex AI predictions). Training loop on a batch platform (Airflow + Spark, or managed). Feedback loop has a data lake + labeling team. Add: feature stores (shared between training and serving), shadow models (production candidate running silently), gradual rollouts (A/B at user level).

### One-line anchors

- Three loops: request, training, feedback.
- Models age; the feedback loop is what keeps them current.
- Missing the loops is the interview gap.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the three loops + their inputs/outputs.

### Level 2 — Explain it out loud
Why three loops vs one. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Design an ML system for spam detection in chat messages. What are the loops?"

### Level 4 — Defend the decision you'd change
"Skip the feedback loop." When?

### Quick check — code reference test
- How many loops?
- Which loop owns retraining?
- What file ties the loops to specific code?

Then verify.
