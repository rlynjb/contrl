# Quantization

**Industry name(s):** Quantization, int8 quantization, fp16, post-training quantization (PTQ), QAT
**Type:** Industry standard

> Models trained in float32 (4 bytes per weight) can often be shrunk to int8 (1 byte) or fp16 (2 bytes) with minimal accuracy loss. Smaller model, faster inference, less battery. The standard pre-deployment step for any on-device model.

**See also:** → [13-on-device-inference](./13-on-device-inference.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

Mobile is constrained on three axes: storage (app bundle), memory (runtime footprint), and battery (compute cost). Quantization shrinks all three simultaneously with minimal quality cost. For any model going on-device, "quantize and measure" is the default last step.

The pattern is **post-training quantization** — train in float, deploy in lower precision. Universal across mobile ML. Quantization-aware training is the more sophisticated variant; PTQ covers most cases.

---

## How it works

Three precision levels, three tradeoffs.

### Precision levels

| Format | Bytes per weight | Typical accuracy loss | Speed gain |
|---|---|---|---|
| fp32 (baseline) | 4 | — | 1× |
| fp16 | 2 | ~0% (negligible) | 1.5–2× |
| int8 | 1 | 0–2% | 2–4× |
| int4 | 0.5 | 2–10% | 3–8× |

For a tabular classifier with ~10 trees of depth 8 = ~8000 weights × 4 bytes = 32KB. Tiny. For a CNN like MediaPipe's pose model (~5M weights × 4 = 20MB), quantization is what gets it under the bundle budget.

### Two quantization shapes

1. **Post-training quantization (PTQ).** Take the trained fp32 model, convert weights to lower precision after training. Cheap. Sometimes accuracy drops more than expected.
2. **Quantization-aware training (QAT).** Train with quantization in the loop (simulate low-precision arithmetic during forward/backward). More work; recovers more accuracy in tight quantization (int8 or below).

For LightGBM tabular models, PTQ is sufficient. For neural nets at int8 or below, QAT is often worth it.

### Move 2.5 — What contrl-mo needs

The form classifier (LightGBM, ~32KB) doesn't need quantization for size — it's already tiny. Quantization is still worth measuring for *inference speed* — int8 trees run faster.

The pose model is already quantized (MediaPipe's `lite` variant is the quantized version of `pose_landmarker_full`).

### Move 3 — The principle

Precision is a deployment knob. The model's training precision doesn't have to match its deployment precision. Pick the lowest deployment precision that hits the accuracy bar; that's the cheapest deployment.

---

## Quantization — diagram

```
   training: fp32                deployment: int8
   ──────────────                ──────────────
       │                              │
       │   trained model              │
       │   weights ∈ [-1.5, 2.3]      │
       │   (full float precision)     │
       │                              │
       ▼                              │
   PTQ: quantize step                 │
   ──────────────────                 │
       map fp32 → int8:               │
         min/max scaling              │
         w_int8 = round((w_fp32 -     │
                  min) / scale)       │
                                      │
       per-weight 1 byte               │
       per-activation 1 byte           │
                                      ▼
                                  4× smaller, 2–4× faster
                                  accuracy loss: ~1–2%

   Calibration set:
   ────────────────
   represent typical inputs; quantizer picks per-layer scales.
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B5.9`. Expected:
- Quantization step in training pipeline: `scripts/quantize.py`
- Measured before/after metrics: `docs/ml-results.md`

The pose model is *already* quantized (MediaPipe ships the lite version).

---

## Elaborate

### Where this pattern comes from

Quantization research formalized around 2015–2018 (Google's TensorFlow Quantization tooling). int8 became the standard mobile precision; fp16 became the standard for accuracy-critical mobile NN deployment.

### The deeper principle

Models don't need full precision to make decisions. The training process explores a continuous space, but the deployed model's decision boundaries are coarse-grained relative to the precision used to find them. Quantization exploits this gap.

### Where this breaks down

When the model's outputs are themselves small (e.g., scores in a narrow range near 0.5). Quantization noise can flip class predictions. Mitigation: calibration set tuning, or skip quantization on the output layer.

### What to explore next

- [13-on-device-inference](./13-on-device-inference.md) → what quantization enables

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ int8 quantize (planned, optional)│ Keep fp32                        │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Model size         │ 4× smaller                       │ Baseline                         │
│ Inference speed    │ 2–4× faster                      │ Baseline                         │
│ Battery            │ Lower                            │ Higher                           │
│ Accuracy loss      │ 0–2% typical                     │ None                             │
│ Setup              │ One conversion step + calibration│ Zero                             │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Small accuracy loss. For the form classifier, likely sub-1%. Worth measuring; ship int8 only if metrics stay above bar.

### Sub-block 2 — what skipping would cost

Marginally bigger app, slightly slower inference, more battery. For contrl-mo's small classifier this is acceptable; for a CNN it would be more significant.

### Sub-block 3 — the breakpoint

Fine until output precision matters (calibration-sensitive predictions, regression with small target ranges). At those scenarios, prefer fp16 over int8.

### Sub-block 4 — what isn't a tradeoff

int4 quantization wasn't picked because the accuracy hit is large for tabular tree models.

---

## Tech reference (industry pairing)

### onnxruntime tools for quantization

- **Codebase uses:** Not yet. Planned for the quantize step.
- **Why it's here:** native to the ONNX export already used.
- **Leading today:** `onnxruntime` quantization toolkit — `adoption-leading`, 2026.

---

## Project exercises

### [B5.9] Quantize the form classifier

- **Exercise ID:** `[B5.9]`
- **What to build:** Convert the fp32 ONNX model to int8 via `onnxruntime`'s quantization tools. Measure size + latency + accuracy before/after on the test set. Decide whether to ship.
- **Why it earns its place:** the production-ML knob applied with measurements.
- **Files to touch:** `scripts/quantize.py`, `docs/ml-results.md`.
- **Done when:** the results doc shows before/after numbers; the deployed model is the better choice.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Quantization reduces weight precision from fp32 to lower formats (fp16, int8) to shrink model size, speed up inference, and save battery. Post-training quantization is the standard approach — convert the trained fp32 model with a calibration set. For tabular tree models like the form classifier, int8 typically loses <1% accuracy. For neural nets, fp16 or QAT may be needed. The constraint forcing this is mobile resource budgets. The cost is small accuracy loss; the benefit is 2–4× size and speed.

### Key points

- fp32 → fp16: ~0% loss, 2× smaller.
- fp32 → int8: 0–2% loss, 4× smaller, 2–4× faster.
- QAT recovers more accuracy at tight precision.
- For small tabular models, PTQ suffices.
- Always measure before/after.

---

## Interview defense

### Likely questions

**Q: What's quantization?  [mid]**
A: Reducing the precision of model weights from float32 to fp16 or int8. Smaller, faster, less battery. Standard last step for any on-device model. For LightGBM tabular models, post-training int8 quantization typically loses under 1% accuracy.

**Q: PTQ vs QAT?  [senior]**
A: PTQ is post-training: convert weights after training. Cheap. Sometimes accuracy drops more than expected, especially at int4 or int8 for sensitive layers. QAT trains *with* quantization simulated in the forward/backward pass — recovers more accuracy at low precision. PTQ first, QAT only if PTQ doesn't hit the accuracy bar.

**Q: At what point does quantization break?  [arch]**
A: When the precision loss flips decisions or the calibration set doesn't represent deployment data. Mitigation: per-layer precision (keep the output layer fp32 even if hidden layers are int8); larger calibration set; QAT.

### One-line anchors

- Precision is a deployment knob.
- fp32 → int8 for size + speed.
- Always measure before/after.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the precision tradeoff.

### Level 2 — Explain it out loud
When PTQ vs QAT. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You're shipping a 50MB neural net. Quantize?"

### Level 4 — Defend the decision you'd change
"Skip quantization for the form classifier." When?

### Quick check — code reference test
- What's the planned quantization tooling?
- What precision does the existing pose model use?
- What's the curriculum exercise ID?

Then verify.
