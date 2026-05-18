# Model selection — LR vs GBT

**Industry name(s):** Logistic regression vs gradient-boosted trees, baseline vs strong tabular model, IK Module 1's "which performs better?"
**Type:** Industry standard

> Train a logistic regression baseline first. Train a gradient-boosted tree second. Report both. The question "which performs better and why" is IK ML Module 1's headline; for engineered features on tabular data, GBT usually wins on accuracy and LR wins on interpretability.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [09-bias-variance](./09-bias-variance.md)

---

## Why care

Two models, both reasonable for tabular data, very different shapes. LR fits a line through feature space; GBT fits hundreds of decision rules. Both have well-understood failure modes. Reporting "I trained LR and GBT and here's how they compared" is a much stronger interview answer than "I picked XGBoost because everyone uses it".

The pattern is **baseline + strong model comparison**. Same instinct as "always benchmark vs random" in ML — establishing what a simple model can do before reaching for complexity.

---

## How it works

Train both on the same train set, tune both on the same val set, compare on the same test set.

### Logistic regression baseline

```python
from sklearn.linear_model import LogisticRegression
lr = LogisticRegression(class_weight='balanced', max_iter=1000)
lr.fit(X_train, y_train)
y_pred_lr = lr.predict(X_test)
```

LR fits coefficients `w` such that `P(class_k | x) = softmax(w_k · x)`. It assumes the log-odds are linear in features. If "elbow asymmetry" linearly predicts "elbow flare", LR catches it. If the relationship is non-linear (e.g., "asymmetry only matters when ROM is also low"), LR misses it.

Strengths: fast, deterministic, interpretable (coefficients tell you which features matter). Weaknesses: linear assumption.

### Gradient-boosted trees

```python
import lightgbm as lgb
gbt = lgb.LGBMClassifier(
  n_estimators=200, learning_rate=0.05, num_leaves=31,
  class_weight='balanced'
)
gbt.fit(X_train, y_train, eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(20)])
y_pred_gbt = gbt.predict(X_test)
```

GBT builds an ensemble of shallow decision trees, each one correcting the previous one's errors. Captures non-linear interactions automatically — "asymmetry only matters when ROM is low" becomes a path through a tree.

Strengths: handles non-linearities and feature interactions, robust to feature scaling, usually beats LR on tabular. Weaknesses: less interpretable, more hyperparameters to tune.

### Compare on the same metrics

| Metric | LR | GBT |
|---|---|---|
| Accuracy | 0.78 | 0.85 |
| Macro F1 | 0.65 | 0.74 |
| Per-class F1 (rarest) | 0.32 | 0.51 |
| Calibration ECE | 0.04 | 0.09 |
| Inference latency | <1ms | ~5ms |
| Model size | ~KB | ~MB |

The pattern across many tabular problems: GBT wins on accuracy and per-class F1; LR wins on calibration and interpretability. The trade is real and the right choice depends on what you care about.

### Move 2.5 — When LR earns its place

Despite GBT often winning, LR is the right pick when:
- You need to *explain* predictions (regulatory reasons).
- Calibration matters more than raw accuracy.
- Inference latency must be sub-millisecond on weak hardware.
- The dataset is tiny (LR has fewer parameters to overfit).

### Move 3 — The principle

Bias-variance ([09-bias-variance](./09-bias-variance.md)) is the lens. LR is high-bias, low-variance — assumes a simple form, generalizes from few examples but can't fit complex truth. GBT is low-bias, higher-variance — fits complex truth but needs more data and tuning. The right model is the one whose bias-variance tradeoff matches your data size and pattern complexity.

The full picture is below.

---

## LR vs GBT — diagram

```
                     8 engineered features per rep
                                  │
                                  │  same train set
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
        ┌─────────────────────┐         ┌─────────────────────┐
        │ Logistic regression │         │ LightGBM (GBT)      │
        │  one set of weights │         │  ensemble of trees  │
        │  P = softmax(w·x)   │         │  hundreds of rules  │
        └──────────┬──────────┘         └──────────┬──────────┘
                   │                               │
                   ▼                               ▼
              metrics on val/test               metrics on val/test
                   │                               │
                   └──────────┬────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │ Compare:                │
                │   accuracy              │
                │   macro F1              │
                │   per-class F1 (rare!)  │
                │   calibration           │
                │   inference latency     │
                └─────────────────────────┘

   Picking the winner is the senior decision.
   "GBT won" without naming the cost is not an answer.
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected: `scripts/train_lr.py`, `scripts/train_gbt.py` (both consume the same split files); both export ONNX-compatible models.

---

## Elaborate

### Where this pattern comes from

The LR vs GBT comparison is IK ML Module 1's anchor question. Real-world: every tabular ML project benchmarks at least one simple model against one strong model. Skipping the baseline is a beginner mistake — it leaves you no way to know if your strong model is actually adding value.

### The deeper principle

Always benchmark vs the simplest baseline. If your strong model only beats the baseline by 1% but is 100× the inference cost, the baseline wins on deployment grounds. The comparison is what makes the decision data-driven instead of fashion-driven.

### Where this breaks down

With very high-dimensional features (text, images, dense embeddings) — LR struggles to scale and GBT is suboptimal. Switch to neural networks. With very large datasets (10M+ rows) — GBT becomes slow to tune; neural nets or distributed GBT are alternatives.

### What to explore next

- [09-bias-variance](./09-bias-variance.md) → the framework for choosing
- [07-confusion-matrices-and-per-class-metrics](./07-confusion-matrices-and-per-class-metrics.md) → how to report the comparison
- [13-on-device-inference](./13-on-device-inference.md) → why inference cost matters

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Train both (planned)             │ One only (alt)                   │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Training time      │ 2× (both fit)                    │ 1×                               │
│ Decision quality   │ Data-driven                      │ Fashion-driven                   │
│ Interview signal   │ "I ran the comparison"           │ "I picked X"                     │
│ Code volume        │ Two training scripts             │ One                              │
│ Reporting          │ Two columns                      │ One                              │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

A small amount of extra training time and a second model artifact to keep current. Both modest.

### Sub-block 2 — what one-only would cost

You'd have no data to defend "I picked X because Y". The "I tried LR first and it underfit by 7% F1, so I went GBT" answer is much stronger than "I picked GBT". The cost of skipping the baseline is your senior-level credibility.

### Sub-block 3 — the breakpoint

Always benchmark unless you have multi-year context on the data. For new domains, run both.

### Sub-block 4 — what isn't a tradeoff

Skipping straight to deep neural networks was not a real option at our data size — they'd overfit with 500 labeled examples per class.

---

## Tech reference (industry pairing)

### scikit-learn LogisticRegression

- **Codebase uses:** Not yet. Planned for the LR baseline.
- **Why it's here:** the canonical linear classifier; the comparison baseline.
- **Leading today:** scikit-learn — `adoption-leading`, 2026.
- **Why it leads:** standard, fast, well-documented.
- **Runner-up:** glmnet (R) — fast for regularized GLM-family, less ergonomic in Python.

### LightGBM

- **Codebase uses:** Not yet. Planned for the GBT.
- **Why it's here:** the modern GBT default for tabular ML.
- **Leading today:** LightGBM — `adoption-leading`, 2026.
- **Why it leads:** faster than XGBoost, native categorical features, lower memory.
- **Runner-up:** XGBoost — `adoption-leading` alternative; mature, slightly slower, more ecosystem.

---

## Project exercises

### [B2C.6] + [B2C.7] LR baseline + GBT comparison

- **Exercise ID:** `[B2C.6]` and `[B2C.7]`
- **What to build:** Two training scripts. Both consume the same split. Report per-class precision/recall/F1, macro-F1, and a confusion matrix for each on the test set. Write a paragraph in `docs/ml-results.md` explaining which won and why.
- **Why it earns its place:** the literal IK Module 1 question answered with your own numbers.
- **Files to touch:** `scripts/train_lr.py`, `scripts/train_gbt.py`, `docs/ml-results.md`.
- **Done when:** `docs/ml-results.md` has the comparison table with real numbers and a paragraph explaining the choice.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Train LR and GBT on the same data; compare on the same test set. LR is high-bias / low-variance (linear, fast, interpretable); GBT is low-bias / higher-variance (captures non-linearity, more accurate on most tabular tasks, less interpretable). The constraint forcing this design is the need to *defend* a model choice with numbers rather than fashion. The cost is 2× training time and two artifacts to maintain.

### Key points

- Always benchmark against the simplest baseline.
- GBT usually wins on accuracy; LR usually wins on calibration and interpretability.
- The right choice depends on deployment constraints, not pure metric.
- Reporting both is the senior signal.

---

## Interview defense

### Likely questions

**Q: Which performs better, LR or GBT?  [mid]**
A: On engineered tabular features, GBT usually wins on raw accuracy and per-class F1 — it captures non-linear feature interactions automatically. LR is competitive on calibration and interpretability. The honest answer is "depends on data" — I ran both and reported the comparison in `docs/ml-results.md`.

**Q: Why try LR if GBT usually wins?  [senior]**
A: Because "usually wins" isn't always. Without the baseline, you have no claim that GBT's complexity is earning its cost. Plus on small datasets (< few thousand labeled), LR sometimes beats GBT because it has fewer parameters to overfit. The comparison is also the deployment lens: if LR is 80% as good and 5× faster, that might be the right deployment choice.

**Q: Past 50k labels per class, would you switch models?  [arch]**
A: Probably to a neural network — small CNN or transformer over the landmark sequence. GBT plateaus around mid-to-high data scale; neural nets keep improving with data. At our planned scale (~few thousand labels per class), GBT is the right ceiling.

### One-line anchors

- Always run the baseline.
- GBT for accuracy; LR for interpretation.
- The choice is deployment-driven, not metric-driven.
- Both models on the same split.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the two-model comparison flow.

### Level 2 — Explain it out loud
Why train both? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a recommender. LR or GBT first?"

### Level 4 — Defend the decision you'd change
"Would you ever skip LR?" When?

### Quick check — code reference test
- What are the two planned training scripts?
- Which usually wins on accuracy?
- Which usually wins on calibration?

Then verify.
