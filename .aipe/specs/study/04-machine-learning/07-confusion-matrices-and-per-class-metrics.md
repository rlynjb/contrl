# Confusion matrices and per-class metrics

**Industry name(s):** Confusion matrix, per-class precision/recall/F1, macro / micro / weighted averages
**Type:** Industry standard

> A confusion matrix is the K×K grid of "predicted vs actual" counts. From it, per-class precision, recall, and F1 are derived. Macro F1 averages F1 across classes equally; the right metric for imbalanced problems where every failure mode matters.

**See also:** → [05-class-imbalance](./05-class-imbalance.md) · → [08-calibration](./08-calibration.md)

---

## Why care

Accuracy is a single number that hides everything that went wrong. A confusion matrix shows you exactly which classes get confused with which others — the structure of the model's mistakes. Reading a confusion matrix is the senior skill that turns "the model is bad" into "the model confuses `elbow_flare` with `back_arch`, here's why".

The pattern is **per-class evaluation** — never look only at aggregates. Same shape across every classification problem, every domain.

---

## How it works

The matrix, the four counts per class, and the three derived metrics.

### The matrix

```
                Predicted
              ──────────────────────────────────
             | good | flare | depth | arch | hip |
─────────────┼──────┼───────┼───────┼──────┼─────┤
A good       | 380  |   8   |  12   |   0  |  0  |   true positives for "good": 380
C flare      |   5  |  72   |   3   |   0  |  0  |
T depth      |  10  |   2   |  58   |   0  |  0  |
U arch       |   2  |   0   |   1   |  37  |  0  |
A hip        |   0  |   0   |   0   |   1  | 19  |
L ─────────────────────────────────────────────────
```

Rows = actual class; columns = predicted class. The diagonal is correct predictions. Off-diagonal cells are confusions.

### Reading the matrix

Row sum = how many examples of that true class were in the test set. Column sum = how many times the model predicted that class.

```
Row sum (good)    = 380 + 8 + 12 + 0 + 0 = 400      total actual goods
Column sum (good) = 380 + 5 + 10 + 2 + 0 = 397      total predictions of good

True positives for good: 380 (diagonal)
False positives for good: 5 + 10 + 2 + 0 = 17 (other rows in good column)
False negatives for good: 8 + 12 + 0 + 0 = 20 (other columns in good row)
```

### The three per-class metrics

```
precision = TP / (TP + FP)    of predictions of class X, what fraction were right?
recall    = TP / (TP + FN)    of actual class X, what fraction did we catch?
F1        = 2·P·R / (P+R)     harmonic mean — balanced summary
```

For the `good` class:
- Precision = 380 / 397 = 0.957
- Recall = 380 / 400 = 0.950
- F1 = 0.953

For the rare `hip` class:
- Precision = 19 / 19 = 1.0 (no false positives — we never predicted hip wrongly)
- Recall = 19 / 20 = 0.95
- F1 = 0.974 (looks great because n=20 is tiny)

### Aggregates

| Average | What it does | When to use |
|---|---|---|
| **Macro** | Average per-class F1 equally | Imbalanced — every class matters equally |
| **Micro** | Pool all TP/FP/FN, then compute | Aggregate behavior matters most |
| **Weighted** | Weighted by class support | Imbalanced — weighting by frequency |

For contrl's classifier, **macro F1** is the primary metric. Every failure mode matters; we don't want the metric dominated by the abundant `good` class.

### Move 2.5 — What confusion matrix reveals about *why* mistakes happen

If `back_arch` is consistently predicted as `hip_sag`, the features may not distinguish them. Solutions: add a feature that does (e.g., shoulder-hip angle vs hip-ankle angle), or accept the confusion and merge the classes if they aren't independently actionable.

The confusion matrix is the *diagnostic* — it tells you *where* the model is wrong, which guides *what* to fix.

### Move 3 — The principle

Single-number metrics are how you report. Confusion matrices are how you debug. Always have both; report the number, but understand the matrix.

---

## Confusion matrix — diagram

```
                       Predicted
              ┌──────┬───────┬───────┬──────┬─────┐
              │ good │ flare │ depth │ arch │ hip │
   ┌──────────┼──────┼───────┼───────┼──────┼─────┤
   │ good     │ 380  │   8   │  12   │   0  │  0  │   ← row sum 400 = actual goods
   ├──────────┼──────┼───────┼───────┼──────┼─────┤
A  │ flare    │   5  │  72   │   3   │   0  │  0  │
c  ├──────────┼──────┼───────┼───────┼──────┼─────┤
t  │ depth    │  10  │   2   │  58   │   0  │  0  │
u  ├──────────┼──────┼───────┼───────┼──────┼─────┤
a  │ arch     │   2  │   0   │   1   │  37  │  0  │
l  ├──────────┼──────┼───────┼───────┼──────┼─────┤
   │ hip      │   0  │   0   │   0   │   1  │ 19  │
   └──────────┴──────┴───────┴───────┴──────┴─────┘
                                                    │
                                                  diagonal = correct
                                                  off-diagonal = confusions
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected: `scripts/eval.py` produces a confusion matrix + per-class metrics, written to `docs/ml-results.md` as a markdown table.

---

## Elaborate

### Where this pattern comes from

The confusion matrix dates to early statistics; its formalization in ML is decades old. The "macro/micro/weighted" averaging conventions were codified by sklearn and are now standard everywhere.

### The deeper principle

A single number is a compression. The compression loses information. The confusion matrix preserves it. Always report both — the number for headlines, the matrix for debugging.

### Where this breaks down

With very many classes (100+), the matrix becomes unreadable. Solution: cluster confusable classes into groups, report group-level metrics, and inspect the matrix only within problematic groups.

### What to explore next

- [05-class-imbalance](./05-class-imbalance.md) → why macro over weighted
- [08-calibration](./08-calibration.md) → next layer of evaluation
- [09-bias-variance](./09-bias-variance.md) → what causes the confusions

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Full confusion matrix (planned)  │ Single accuracy (alt)            │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Information        │ Per-class detail                 │ One number                       │
│ Reporting cost     │ Markdown table, ~50 lines        │ One line                         │
│ Debug power        │ See exactly what gets confused   │ Nothing actionable               │
│ Imbalance honesty  │ Visible                          │ Hidden                           │
│ Interview signal   │ "I read confusion matrices"      │ "Here's accuracy"                │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Nothing meaningful. The confusion matrix is a free addition to the eval pipeline.

### Sub-block 2 — what single-accuracy would cost

The ability to debug. When the model is bad, accuracy says "it's bad" but the matrix says "it confuses these two specific classes". The matrix is what enables iteration.

### Sub-block 3 — the breakpoint

Fine for K up to ~25. Beyond that, group-level matrices.

### Sub-block 4 — what isn't a tradeoff

Custom error metrics were not picked because standard precision/recall/F1 cover the interview vocabulary and the production needs.

---

## Tech reference (industry pairing)

### sklearn `confusion_matrix` + `classification_report`

- **Codebase uses:** Not yet. Planned via `sklearn.metrics`.
- **Why it's here:** standard tooling for the standard pattern.
- **Leading today:** sklearn metrics — `adoption-leading`, 2026.
- **Why it leads:** every ML tutorial uses them.
- **Runner-up:** `seaborn.heatmap` for visualizing — same data, prettier output.

---

## Project exercises

### [B2C.11] Reports + confusion matrix

- **Exercise ID:** `[B2C.11]`
- **What to build:** `scripts/eval.py` that consumes a trained model + test split, produces confusion matrix + per-class precision/recall/F1 + macro F1 + calibration plot. Writes results to `docs/ml-results.md`.
- **Why it earns its place:** the interview artifact — "here are my real numbers on a real held-out set".
- **Files to touch:** `scripts/eval.py`, `docs/ml-results.md`.
- **Done when:** the results doc has the matrix + numbers for both LR and GBT.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

A confusion matrix shows actual vs predicted class counts in a K×K grid. Per-class precision/recall/F1 are derived from the cells. Macro F1 averages F1 over classes equally — the right summary for imbalanced problems. For contrl, the matrix is the diagnostic tool that tells you which failure modes the classifier confuses, guiding feature engineering and label-set decisions. The constraint forcing this design is the need to evaluate at per-class granularity rather than aggregate. The cost is minimal — just a richer reporting format.

### Key points

- Diagonal = correct; off-diagonal = confusions.
- Precision = of predictions, what fraction were right.
- Recall = of actuals, what fraction did we catch.
- Macro F1 for imbalanced.
- Matrix reveals *which* mistakes happen.

---

## Interview defense

### Likely questions

**Q: Walk me through reading a confusion matrix.  [mid]**
A: Rows are actual class, columns are predicted. Diagonal cells are correct predictions; off-diagonal are confusions. Row sum is the count of that actual class in the test set; column sum is how many times we predicted that class. Per-class precision is the diagonal cell divided by the column sum; per-class recall is the diagonal cell divided by the row sum; F1 is the harmonic mean.

**Q: Macro vs weighted F1 — when which?  [senior]**
A: Macro averages F1 across classes equally — every class gets the same weight regardless of size. Use it when every failure mode is equally important (contrl's case — `hip_sag` matters as much as `elbow_flare`). Weighted averages by class support — a rare class influences the result less than a common one. Use it when you care about overall performance proportional to real-world frequency.

**Q: At 50 classes, the matrix is unreadable. What now?  [arch]**
A: Group classes by category (e.g., "depth issues", "alignment issues", "tempo issues") and report group-level macro F1 plus the within-group matrix only for groups where the metric is bad. Inspecting a 50×50 grid is wasted effort; inspecting two 5×5 grids of the problem groups is actionable.

### One-line anchors

- Rows actual; columns predicted.
- Precision says "of predictions"; recall says "of actuals".
- Macro F1 for imbalance.
- Matrix is for debug; F1 is for report.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a confusion matrix; mark TP, FP, FN for one class.

### Level 2 — Explain it out loud
Macro vs weighted. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You ship the model; users complain about confusing one specific failure mode. What do you read?"

### Level 4 — Defend the decision you'd change
"Would you ever use accuracy instead?" When?

### Quick check — code reference test
- What's the planned eval script?
- What sklearn function produces the matrix?
- What does macro F1 average?

Then verify.
