# Bias-variance tradeoff

**Industry name(s):** Bias-variance decomposition, underfitting vs overfitting, regularization
**Type:** Industry standard · Language-agnostic

> Total error decomposes into bias (model too simple for the truth) + variance (model overfits to training noise) + irreducible noise. LR is high-bias / low-variance; GBT is low-bias / higher-variance. Picking the right model is picking the right tradeoff for your data size and pattern complexity.

**See also:** → [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md)

---

## Why care

Every ML model wrong-answer has a name: bias (the model can't fit the truth) or variance (the model fit the noise). Telling them apart is what lets you fix the problem instead of guessing. Bias-variance is IK ML Module 2's anchor.

The pattern is universal — every classification, regression, or generative model has the same decomposition. The shape changes; the framework doesn't.

---

## How it works

Picture target distribution as the truth + noise. The model tries to fit the truth. Different models fail in different ways.

### High bias (underfit)

LR fitting a non-linear truth. The model is too simple; it can't capture the pattern even with infinite data. Training error AND test error both high. Signature: error doesn't drop as you add data.

```
training error    ████████████ high
test error        ████████████ high      ← both bad
```

Fix: more flexible model (GBT, more features), or better features.

### High variance (overfit)

GBT with 1000 trees on 200 examples. The model memorizes training data including the noise. Training error very low; test error high. Signature: big gap between train and test error.

```
training error    █ low
test error        █████████ high      ← gap
```

Fix: regularization (fewer trees, deeper regularization), more data, simpler model.

### The sweet spot

Pick a model whose flexibility matches your data size and pattern complexity. Validate with a learning curve (train + val error vs training set size) — the curves should converge as data grows.

### The decomposition

```
expected error = bias² + variance + irreducible noise
```

- **Bias²:** the gap between your model's *average* prediction (across many random training sets) and the truth.
- **Variance:** how much your model's predictions wobble *across different training sets*.
- **Irreducible noise:** the part of the data that no model can predict (label noise, missing features).

### Move 2.5 — How it applies to LR vs GBT

LR: high bias (linear assumption), low variance (few parameters). Good when truth is roughly linear and data is limited.

GBT: low bias (can fit non-linear), higher variance (many parameters). Good when truth is complex and data is plentiful.

The "which performs better" answer depends on where you are in the bias-variance plane.

### Move 3 — The principle

You can't reduce both at once — they trade. The discipline is to identify which one is dominating your error and target the right fix.

---

## Bias-variance — diagram

```
   model flexibility →
   ──────────────────────────────────────────────────►
   simple                        complex
   (LR)                          (deep GBT)

   error
   ──────                              total
                    bias²            error
                  ████   ████
                   ████████   ████
                       ████████ ████      variance
                            ████████  ████████ ████
                                 ████████  ████████
   ──────────────────────────────────────────────────►

   sweet spot
   ──────────
   model flexibility where bias² ≈ variance
```

---

## In this codebase

**Not yet implemented.** Manifested implicitly in the LR vs GBT comparison ([04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md)) — picking which model is picking which bias-variance tradeoff.

---

## Elaborate

### Where this pattern comes from

The decomposition formula was made rigorous by Geman et al. (1992). Every ML textbook since has used it as the framework for model selection.

### The deeper principle

Error has structure. Diagnosing it tells you what to fix. A bigger model isn't always the answer; a smaller one isn't either. The right model depends on which error component dominates.

### Where this breaks down

When the model's predictions are also drawn from a stochastic distribution (Bayesian models), the bias-variance decomposition gets more complex. Not relevant for tabular classifiers.

### What to explore next

- [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md) → applying the framework
- [05-class-imbalance](./05-class-imbalance.md) → how imbalance interacts with bias

---

## Tradeoffs

There's no tradeoff *to take* with bias-variance — it's a framework, not a decision. The decision is which side to prioritize given your data.

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Diagnosis          │ Bias-dominated                   │ Variance-dominated               │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Train error        │ High                             │ Low                              │
│ Test error         │ High                             │ High                             │
│ Gap                │ Small                            │ Large                            │
│ Fix                │ More flexible model, more features│ More data, regularization, fewer params │
│ Adding data helps  │ Marginal                         │ Significant                       │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

---

## Tech reference (industry pairing)

### Learning curves (sklearn)

- **Codebase uses:** Not yet. Planned for diagnostic plots in `docs/ml-results.md`.
- **Why it's here:** the way to *see* whether bias or variance dominates.
- **Leading today:** sklearn `learning_curve` — `adoption-leading`, 2026.

---

## Project exercises

### [B2C.7] LR vs GBT comparison surfaces bias-variance

- **Exercise ID:** `[B2C.7]` (already named in [04-model-selection-lr-vs-gbt](./04-model-selection-lr-vs-gbt.md))
- **What to build:** Add a paragraph to `docs/ml-results.md` interpreting the LR vs GBT comparison through the bias-variance lens. "LR is high-bias / low-variance — its test F1 is lower than GBT's but its gap (train vs test) is smaller, indicating it underfits without overfitting. GBT is the opposite."
- **Why it earns its place:** turns the model-selection result into a diagnostic statement.
- **Files to touch:** `docs/ml-results.md`.
- **Done when:** the doc explains the comparison using the framework.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Total error decomposes into bias² + variance + noise. High bias means the model can't fit the truth; high variance means it fits the training noise. LR is high-bias / low-variance; GBT is low-bias / higher-variance. The right model depends on which side dominates your error. The framework guides model selection, regularization, and "should I get more data" decisions.

### Key points

- Two sources of error: bias and variance.
- They trade — can't reduce both at once.
- Learning curves reveal which dominates.
- More data helps variance, not bias.

---

## Interview defense

### Likely questions

**Q: What's bias-variance?  [mid]**
A: A decomposition of model error. Bias is "the model is too simple to fit the truth even with infinite data". Variance is "the model is so flexible it fits the training noise". You diagnose by training and test error: both high = bias; gap between them = variance. The right model balances.

**Q: How does this apply to LR vs GBT?  [senior]**
A: LR is high-bias / low-variance — it underfits non-linear truth but doesn't overfit. GBT is low-bias / higher-variance — it can fit complex truth but needs enough data not to memorize. With ~500 labels per class, GBT's variance risk is real; class weighting and early stopping (training stops on val plateau) are the regularization mechanisms.

**Q: At 10× more data, would the model choice change?  [arch]**
A: Probably toward the lower-bias side. With more data, variance shrinks, so the high-bias penalty (underfitting) becomes the binding constraint. At 50k+ labels per class, neural networks (much lower bias than GBT, similar variance with enough data) start outperforming.

### One-line anchors

- Bias = can't fit truth.
- Variance = fits noise.
- Learning curves reveal which dominates.
- More data fixes variance, not bias.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the bias / variance / total-error curves vs model flexibility.

### Level 2 — Explain it out loud
Diagnose a model with high train and high test error. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You add a feature and test error stays the same. Bias or variance?"

### Level 4 — Defend the decision you'd change
"Would more data help?" Depending on what.

### Quick check — code reference test
- Where will learning curves appear?
- What two components decompose error?
- Which model is high-bias?

Then verify.
