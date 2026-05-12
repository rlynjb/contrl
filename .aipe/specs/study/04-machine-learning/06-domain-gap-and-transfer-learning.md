# Domain gap and transfer learning

**Industry name(s):** Domain gap, distribution shift, transfer learning, fine-tuning, source-target adaptation
**Type:** Industry standard

> Public datasets are recorded in studios with multiple camera angles and lighting. Your phone in your living room produces different inputs. The model trained on public data underperforms on your data — the *domain gap*. The fix is transfer learning: train on public + fine-tune on self-labeled.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [18-drift-detection](./18-drift-detection.md)

---

## Why care

You can't label 50,000 of your own reps. So you bootstrap with public data — but public data isn't *your* data. The gap between training-distribution and deployment-distribution is the most common reason ML projects "look great in training, fail in production". Naming the gap, measuring it, and bridging it is the senior skill.

The pattern is **transfer learning** — train on a large source domain, fine-tune on a smaller target domain. Standard in computer vision (ImageNet → your dataset), text (large corpus → your task), and any setting where you have lots of *similar* data and a little *exact* data.

---

## How it works

Three phases: train on public data, measure the gap on your data, fine-tune to close the gap.

### Phase 1 — Train on public

Pick a public dataset close to your label space (MM-Fit, Fit3D — see B2C.1). Train the classifier on it. Get baseline metrics on the public test set; they should look reasonable.

### Phase 2 — Measure the gap

Evaluate the public-trained model on your self-labeled set (~500 reps from your phone). The metrics drop. Compare:

```
Test set            Macro F1
─────────────────   ────────
Public test         0.78
Self-labeled set    0.52   ← the gap
```

The gap (0.78 → 0.52) is the domain shift. Causes:
- Different camera angles (public uses studio rigs; you use phone-on-tripod).
- Different lighting (controlled vs ambient).
- Different bodies (public has athletes; you have you).
- Different feature distributions downstream of all of the above.

### Phase 3 — Fine-tune

Continue training the public-trained model on the self-labeled set. The model starts from "knows pushups" and learns "knows pushups in your living room".

```python
# pseudo-code
model = load_public_trained()
model.fit(X_self, y_self,
          init_model=model,
          callbacks=[lgb.early_stopping(10)])

# Or with sample weights — higher weight on self-labeled rows when combining
combined_X = np.vstack([X_public, X_self])
combined_y = np.concatenate([y_public, y_self])
weights = np.concatenate([np.ones(len(X_public)), 3 * np.ones(len(X_self))])
model.fit(combined_X, combined_y, sample_weight=weights)
```

Two options: continue from public-trained checkpoint (incremental) or combine with weights (joint).

### Phase 4 — Re-measure

```
Test set            After public-only   After fine-tuning
─────────────────   ─────────────────   ─────────────────
Public test         0.78                0.76    ← slight forget
Self-labeled set    0.52                0.71    ← gap closed
```

Fine-tuning trades a small drop on the public test for a large gain on your set. Net positive for deployment because your set is what users encounter.

### Move 2.5 — When fine-tuning isn't enough

If the self-labeled set is too small (< 100 examples), fine-tuning won't move the needle much. Options:
- Active learning: have the public-trained model predict on unlabeled self-data, label the uncertain examples first.
- Self-supervised pretraining: use unlabeled self-data to learn feature representations, then fine-tune with the labeled subset.

### Move 3 — The principle

A model is only as good as the *match* between its training distribution and its deployment distribution. Public data is a starting point, not the answer. The discipline is always-measure-the-gap and have an explicit plan to close it.

---

## Domain gap — diagram

```
                          PUBLIC DATA                       YOUR DATA
                          (training)                        (deployment)
                          ──────────                        ───────────
   camera angles          multiple, studio                  single, phone
   lighting               controlled                         ambient
   bodies                 athletes                           you
   feature distribution   peaked, low variance               wide, high variance
                                  │                                  │
                                  ▼                                  │
                          model trained                              │
                                  │                                  │
                                  ▼                                  ▼
                          P(public test)                    P(your test)
                          F1 0.78                            F1 0.52   ←─ the gap
                                                                ▲
                                                                │
                                                          measure first
                                                                │
                                                                ▼
                                                          fine-tune
                                                                │
                                                                ▼
                                                          F1 0.71  (gap closed)
```

---

## In this codebase

**Not yet implemented.** Phase 2C. Expected:
- Public training: `scripts/train_public.py`
- Gap measurement: `scripts/eval_on_self.py` (load public-trained, run on self-labeled)
- Fine-tune: `scripts/finetune.py` (continue training on self-labeled)

---

## Elaborate

### Where this pattern comes from

Transfer learning was the breakthrough that made deep learning practical for narrow tasks — ImageNet-pretrained CNNs fine-tuned on small specialty datasets (medical imaging, satellite imagery) outperformed from-scratch models. For tabular ML the analogous pattern is "train on a related dataset, fine-tune on yours" — less dramatic but the same instinct.

### The deeper principle

The model's generalization depends on the *similarity* between training and deployment distributions. When they differ, generalization fails. The fix is always to acknowledge the difference and bridge it; pretending they're the same is the trap.

### Where this breaks down

When the source and target distributions are too dissimilar — fine-tuning then *hurts* (negative transfer). For pose classification, public-and-your data are similar enough that fine-tuning helps; for radically different domains (gym vs at-home with different equipment) it might not.

### What to explore next

- [18-drift-detection](./18-drift-detection.md) → catching distribution shift after deployment
- [01-supervised-pipeline](./01-supervised-pipeline.md) → the broader process

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Public + fine-tune (planned)     │ Self only (alt)                  │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Labels needed      │ ~500 self-labeled                │ Thousands self-labeled           │
│ Time to v1         │ Days                             │ Months (labeling)                │
│ Domain match       │ Closes the gap                   │ Native to deployment             │
│ Generalization     │ Better with broader public base  │ Limited by your variation         │
│ Risk               │ Negative transfer if dissimilar  │ Underfit if data too small        │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Some quality. The fine-tuned model may not reach the quality of a model trained on 10× more self-labeled data. We accept this because 10× more self-labels would cost weeks of labeling time.

### Sub-block 2 — what self-only would cost

Months of labeling before the model is useful. The product can't ship until labels accumulate.

### Sub-block 3 — the breakpoint

Fine until the domain gap is too wide for fine-tuning to close. Mitigation: self-supervised pretraining on unlabeled self-data.

### Sub-block 4 — what isn't a tradeoff

Public-only deployment (no fine-tuning) is not viable — the gap is too large.

---

## Tech reference (industry pairing)

### LightGBM `init_model` for incremental training

- **Codebase uses:** Not yet. Planned for the fine-tune step.
- **Why it's here:** the standard mechanism to continue training from a checkpoint.
- **Leading today:** Incremental training for tabular ML — `adoption-leading`, 2026.
- **Why it leads:** native to LightGBM/XGBoost, no surgery needed.
- **Runner-up:** Joint training with sample weights — `adoption-leading` alternative; cleaner conceptually.

---

## Project exercises

### [B2C.1] + [B2C.10] Domain gap measured and closed

- **Exercise ID:** `[B2C.1]` (data selection) + `[B2C.10]` (gap measurement and fine-tune)
- **What to build:** Train on public; eval on self (record the gap in `docs/ml-results.md`); fine-tune on self; re-eval; record the after-numbers.
- **Why it earns its place:** "I measured a 26-point F1 gap and closed it to 7 points via fine-tuning" is the kind of concrete result that turns the abstract concept into an interview answer.
- **Files to touch:** `scripts/train_public.py`, `scripts/eval_on_self.py`, `scripts/finetune.py`, `docs/ml-results.md`.
- **Done when:** the results doc shows before/after numbers and explains the technique.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Public datasets train the model but differ from your deployment data. The domain gap shows up as a drop in metrics when evaluating the public-trained model on self-labeled data. Fine-tuning — continuing training on the self-labeled subset — bridges most of the gap. The constraint forcing this design is the impracticality of labeling enough self-data from scratch; transfer learning amortizes the labeling cost across public + self. The cost paid is some quality loss on the public test set and dependence on the source-target similarity.

### Key points

- Always measure the gap before claiming generalization.
- Fine-tuning closes gaps; doesn't eliminate them.
- The gap is data, not a model bug.
- Negative transfer is possible if source-target are too dissimilar.

---

## Interview defense

### Likely questions

**Q: How do you handle the domain gap?  [mid]**
A: Train on public data first, evaluate on a held-out self-labeled set to measure the gap, then fine-tune on self-labeled data. The gap typically drops from ~25 F1 points to ~5–10 after fine-tuning. The metric is "F1 on self-labeled test set" because that's what deployment encounters.

**Q: What if fine-tuning makes the public test worse?  [senior]**
A: Catastrophic forgetting — the model loses some of what it learned from public. Usually small (~2 F1 points). For deployment we care about self-set performance, so the trade is fine. If public performance matters for some product reason, joint training with sample weights keeps both better than sequential fine-tuning.

**Q: At 5× the self-labeled data, when do you stop fine-tuning?  [arch]**
A: When self-only training starts approaching combined performance. With enough self-data, the public dataset becomes a regularizer rather than the load-bearing source. The transition point depends on data quality but typically happens around 1–10× the public set size for the relevant labels.

### One-line anchors

- Public is the start; self is the truth.
- Measure the gap first.
- Fine-tune to close, never to eliminate.
- Watch for negative transfer.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the public → measure gap → fine-tune → re-measure flow.

### Level 2 — Explain it out loud
Why public data alone isn't enough. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Use a public bench-press dataset to train a pull-up classifier. Will fine-tuning help?"

### Level 4 — Defend the decision you'd change
"Would you ever skip public data?" When?

### Quick check — code reference test
- What's the planned fine-tune script?
- What metric measures the gap?
- What's the curriculum exercise ID?

Then verify.
