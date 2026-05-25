# Calibration

**Industry name(s):** Probability calibration, reliability diagrams, Platt scaling, isotonic regression
**Type:** Industry standard

> A model predicts `0.8 confidence elbow_flare`. Calibration asks: when the model says 0.8, are 80% of those predictions actually right? Often no. Calibration is the post-training adjustment that aligns predicted probabilities with actual frequencies.

**See also:** → [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) · → [03-ai-engineering/08-ml-in-the-loop-agents](../03-ai-engineering/08-ml-in-the-loop-agents.md)

---

## Why care

The LLM agent will reason over classifier confidence ("3 reps labeled `elbow_flare` with confidence > 0.8 — coach"). If the classifier's 0.8 is *actually* 50% reliable, the agent's reasoning is built on a lie. Calibration is the bridge between "the model output a number" and "the number means what you think it means".

The pattern is **reliability diagrams + post-hoc calibration** — fit a calibration function on a held-out set so confidence scores align with empirical frequencies. Universal in production ML where downstream decisions use the score.

---

## How it works

Three steps: measure miscalibration with a reliability diagram, fit a calibration function on val data, apply at inference time.

### Step 1 — Reliability diagram

Bin predictions by confidence (e.g., 10 bins: 0.0–0.1, 0.1–0.2, ..., 0.9–1.0). In each bin, plot mean predicted confidence vs actual accuracy.

```
         actual accuracy
         ─────────────────
   1.0 │             *  ← perfectly calibrated (y = x)
       │           *
       │         *
       │       *
   0.5 │     +     ← model says 0.5 conf, actually 0.3 accurate
       │   +
       │ +
   0.0 ┼─────────────────────────►
       0.0  0.5  1.0
         mean predicted confidence
```

If the model's points sit on `y = x`, it's calibrated. If they sit *below* (model overconfident), the model says 0.8 but is actually 0.6 accurate at that bin. If above (underconfident), the model says 0.4 but is actually 0.6 accurate.

Quantified as **Expected Calibration Error (ECE)** — weighted average of `|accuracy - confidence|` across bins.

### Step 2 — Fit a calibration function

Two main techniques:

- **Platt scaling.** Fit a logistic regression on (predicted_logit, actual_label). Output: a sigmoid that maps raw logits to calibrated probabilities. Works well when the model's miscalibration is roughly sigmoidal.
- **Isotonic regression.** Fit a monotonic step function on (predicted_prob, actual_label). More flexible than Platt; risks overfitting on small val sets.

```python
from sklearn.calibration import CalibratedClassifierCV
calibrated = CalibratedClassifierCV(base_model, method='isotonic', cv='prefit')
calibrated.fit(X_val, y_val)
```

Use the val set, not train (train data fits the model perfectly; calibrating on it is meaningless). Use a held-out portion of val (or a separate calibration set if data allows).

### Step 3 — Apply at inference

After fitting, `calibrated.predict_proba(X)` returns calibrated probabilities. Replace the original `predict_proba` with this version in the inference pipeline.

### Move 2.5 — Why class weights affect calibration

Class weighting during training boosts loss on minority classes — this often *miscalibrates* the model (predicted probabilities are too high for the rare class). Calibration after balanced training corrects this. The flow:

```
balanced train → uncalibrated model (good recall, bad probs)
              → fit calibration on val
              → calibrated model (good recall, good probs)
```

### Move 3 — The principle

A score is a contract. Without calibration, "0.8 confidence" means whatever the model's training quirks made it mean. With calibration, "0.8 confidence" means 80% of those predictions are right. Calibration is the discipline that makes scores meaningful.

---

## Calibration — diagram

```
   raw model output                       calibrated output
   ────────────────                       ─────────────────
       │                                       │
       ▼                                       ▼
   reliability diagram                  reliability diagram
   shows points off y=x line             shows points on y=x line


   "0.8 confidence" before        "0.8 confidence" after
   ──────────────────────        ────────────────────────
   actually ~60% accurate        actually ~80% accurate
   downstream decisions wrong     downstream decisions right


   Fitting:
   ────────
   val set predictions  ──► CalibratedClassifierCV
                           (Platt or isotonic)
                                │
                                ▼
                       calibration function
                                │
                                ▼
                       inference: raw → calibrated
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected: `scripts/calibrate.py` consumes the trained model + val split, fits `CalibratedClassifierCV`, exports a calibrated version. Reliability diagrams in `docs/ml-results.md`.

---

## Elaborate

### Where this pattern comes from

Platt scaling came from Platt (1999) for SVMs; isotonic regression for calibration from Zadrozny & Elkan (2001). Modern frameworks (sklearn, PyTorch via packages) make it one-line. The need has grown as more systems use ML scores as inputs to downstream decisions.

### The deeper principle

Information has to be interpretable. A confidence score that doesn't mean what it says is worse than no score at all — it's a confident lie. Calibration is the discipline of aligning what the model claims with what is true.

### Where this breaks down

When the calibration set is small or doesn't represent deployment distribution. Calibration on val that doesn't match deployment produces calibrated-for-the-wrong-thing.

### What to explore next

- [03-ai-engineering/08-ml-in-the-loop-agents](../03-ai-engineering/08-ml-in-the-loop-agents.md) → where calibrated scores matter most
- [09-bias-variance](./09-bias-variance.md) → bias of overconfidence

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Calibrate (planned)              │ Use raw scores (alt)             │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Setup              │ One sklearn call                 │ Zero                             │
│ Score reliability  │ Aligned with actual frequency    │ Whatever the training produced   │
│ Downstream trust   │ Decisions on real probability    │ Decisions on opaque numbers      │
│ Inference cost     │ +negligible                      │ Baseline                         │
│ Val set portion    │ Some reserved for calibration    │ Full val for hyperparam tuning   │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

A bit of val set space for calibration data. Inference cost is negligibly higher.

### Sub-block 2 — what raw-scores would cost

The LLM agent's reasoning would be on garbage numbers. "Confidence > 0.8" becomes a heuristic on a meaningless quantity. The agent might trigger coaching when the model was actually 50% sure and miss when the model was 90% sure.

### Sub-block 3 — the breakpoint

Fine until the val set is too small (< 200) for isotonic regression. At that point use Platt or skip calibration.

### Sub-block 4 — what isn't a tradeoff

Skipping calibration entirely is acceptable if downstream decisions don't use the score. For the planned LLM agent, the score *is* part of the reasoning — calibration earns its place.

---

## Tech reference (industry pairing)

### sklearn `CalibratedClassifierCV`

- **Codebase uses:** Not yet. Planned for calibration step.
- **Why it's here:** standard one-line wrapper for Platt + isotonic.
- **Leading today:** sklearn — `adoption-leading`, 2026.
- **Why it leads:** native to the rest of the sklearn workflow.
- **Runner-up:** Custom calibration with `betacal` — `innovation-leading` for finer control.

---

## Project exercises

### [B2C.11] Calibration check

- **Exercise ID:** `[B2C.11]`
- **What to build:** Reliability diagram on val (uncalibrated). If ECE > 0.05, fit Platt or isotonic and re-plot. Save plots in `docs/ml-results.md`.
- **Why it earns its place:** the chart that turns "the model is 80% confident" into a meaningful statement.
- **Files to touch:** `scripts/calibrate.py`, `docs/ml-results.md`.
- **Done when:** the results doc shows before/after reliability diagrams and the ECE numbers.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

A reliability diagram bins predictions by confidence and plots predicted-vs-actual accuracy. If the model is calibrated, the diagram lies on `y = x`; otherwise the offset measures miscalibration (quantified as Expected Calibration Error). The fix is fitting a post-hoc calibration function (Platt scaling or isotonic regression) on the val set and applying it at inference. The constraint forcing this design is that the LLM agent will reason over the classifier's confidence — uncalibrated scores would make the agent's decisions unreliable. The cost is a small slice of val data and one extra inference step.

### Key points

- Reliability diagrams visualize miscalibration; ECE quantifies it.
- Platt scaling is sigmoidal; isotonic is more flexible.
- Calibrate on val, not train.
- Class weights during training often miscalibrate; correct after.

---

## Interview defense

### Likely questions

**Q: What is calibration?  [mid]**
A: It's the alignment between predicted confidence and actual frequency. When the model says "0.8 confidence", a calibrated model is actually right 80% of the time at that confidence level. Miscalibration means the score doesn't carry the meaning we think it does. The standard fix is Platt scaling or isotonic regression on the val set.

**Q: Platt vs isotonic — when each?  [senior]**
A: Platt is parametric (sigmoid fit, two params) — robust on small val sets, works when miscalibration is roughly S-shaped. Isotonic is non-parametric (monotonic step function) — more flexible, can capture complex miscalibration shapes, but needs more data and risks overfitting at small sizes. Default Platt at <500 val points; isotonic above.

**Q: Why does this matter for downstream agents?  [arch]**
A: If the LLM agent treats "confidence > 0.8" as "high confidence" and the actual frequency at that bin is 60%, the agent's policy is built on a lie. Coaching triggers wrongly; the user sees inconsistent advice. Calibration is the contract that lets the agent's confidence-based rules actually mean what they say.

### One-line anchors

- 0.8 should mean "80% right at this confidence".
- Reliability diagrams show the gap.
- Calibrate on val.
- Class weights miscalibrate; fix after.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch a reliability diagram + the diagonal.

### Level 2 — Explain it out loud
Why calibration matters for the planned LLM agent. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a recommender. Does it need calibration?"

### Level 4 — Defend the decision you'd change
"Skip calibration if accuracy is the only metric." When?

### Quick check — code reference test
- What sklearn class wraps calibration?
- What's the planned script?
- What's the metric for miscalibration?

Then verify.
