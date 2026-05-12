# On-device inference

**Industry name(s):** On-device inference, edge ML, mobile inference, latency-bounded ML
**Type:** Industry standard

> Run the trained classifier on the user's phone, not on a server. Model exported to ONNX or TF Lite, bundled with the app, called per-rep at ~10ms. Same family as MediaPipe's pose model that already runs on-device in contrl-mo.

**See also:** → [01-supervised-pipeline](./01-supervised-pipeline.md) · → [14-quantization](./14-quantization.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

Server inference adds 100–500ms of round-trip and depends on connectivity. On-device inference is sub-50ms and works offline. For a workout app where the user is in a basement gym with no signal, on-device isn't a nice-to-have — it's the only thing that works.

The pattern is **edge ML** — same instinct that put MediaPipe's pose model on-device. The hard parts are: model size budget (memory and download), latency budget (must hit ~10ms on mid-tier phones), and update path (can't redeploy a model independently of the app).

---

## How it works

Three concerns: export the trained model to a mobile-friendly format, integrate the inference runtime, hit the latency budget.

### Step 1 — Export

Train in Python (LightGBM); export to ONNX:

```python
import onnxmltools
onnx_model = onnxmltools.convert_lightgbm(model, name='form_classifier',
                                          initial_types=[('input', FloatTensorType([None, 8]))])
onnxmltools.utils.save_model(onnx_model, 'models/form_classifier.onnx')
```

The ONNX file becomes part of the app's `models/` directory.

### Step 2 — Runtime

`onnxruntime-react-native` (or similar) loads the model and runs inference.

```typescript
import { InferenceSession } from 'onnxruntime-react-native';

const session = await InferenceSession.create(modelPath);

async function classify(features: Float32Array): Promise<{ label: string; confidence: number }> {
  const input = new Tensor('float32', features, [1, 8]);
  const outputs = await session.run({ input });
  // outputs.probabilities is a Float32Array of class probabilities
  return interpretOutputs(outputs);
}
```

### Step 3 — Latency budget

Target: ~10ms per rep on a mid-tier Android phone. LightGBM models are typically fast (sub-10ms even on weak CPUs). If the model exceeds budget, options:
- Quantization (int8 or fp16 — see [14-quantization](./14-quantization.md))
- Fewer trees (retrain with smaller `n_estimators`)
- GPU delegation (if applicable)

### Move 2.5 — What contrl-mo already does

MediaPipe's pose_landmarker_lite already runs on-device. The form classifier joins it. Both share the same shape: bundled model file + inference runtime + per-frame/per-rep call.

### Move 3 — The principle

Latency budgets cascade. Pose detection runs at 30fps (~33ms/frame). The rep counter is sub-1ms. The classifier adds ~10ms per rep — still well within budget. Each on-device step pays its latency; the total has to fit the user's expectation.

---

## On-device inference — diagram

```
   Training (Python, off-device)
   ─────────────────────────────
       LightGBM.fit(...)
              │
              ▼
       onnxmltools.convert(...)
              │
              ▼
       form_classifier.onnx (~MB)
              │
              ▼
       commit to repo under models/

   App (mobile, on-device)
   ───────────────────────
       app bundle ships with form_classifier.onnx
              │
              ▼
       startup: InferenceSession.create(...)
              │
              ▼
   per-rep:
       features = extractFeatures(landmarks)
       outputs  = session.run({ input: features })
       label, conf = interpret(outputs)
              │
              ▼
       write to classifier_outputs table

   Latency budget per rep:
   ┌────────────────────────────────────┐
   │  pose detection      ~10–30ms      │
   │  feature extraction  <1ms          │
   │  classifier          ~10ms         │
   │  total               ~20–40ms      │  well within frame budget
   └────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** Phase 2C ([B2C.12]). Expected:
- Trained model: `models/form_classifier.onnx`
- Inference wrapper: `src/services/ml/classifier.ts` (new)
- Runtime: `onnxruntime-react-native` (new dependency)

Already shipping: `models/pose_landmarker_lite.task` for MediaPipe — same architectural pattern.

---

## Elaborate

### Where this pattern comes from

On-device ML matured in 2018–2020 with TF Lite, Core ML, and ONNX Runtime Mobile. Earlier mobile ML was custom (e.g., bundle a manually-tuned classifier); modern apps use standardized runtimes.

### The deeper principle

The right place for compute is where the data lives. Pose landmarks live on the device (captured by the camera there); inference there avoids the round-trip. Privacy is a side effect.

### Where this breaks down

When the model is too big to ship (e.g., a 500MB LLM doesn't fit in an Android APK). For tabular classifiers (~MBs), no issue. For neural nets, see quantization.

### What to explore next

- [14-quantization](./14-quantization.md) → shrink the model
- [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md) → the existing on-device pipeline

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ On-device inference (planned)    │ Server inference (alt)           │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Latency            │ ~10ms                            │ 100–500ms round-trip             │
│ Offline            │ Works                            │ Doesn't                          │
│ Privacy            │ Native                           │ Data leaves device               │
│ Bundle size        │ +MB per model                    │ Zero                             │
│ Model updates      │ App release                      │ Server-side                      │
│ Compute cost       │ User's battery                   │ Your servers                     │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

App bundle size. ONNX form classifier is ~MB; not bad. If the model grew to 10s of MB, we'd hit Android's APK size sensitivities.

The other cost: model updates require an app release. Can't A/B test new models server-side; have to ship versions and use feature flags.

### Sub-block 2 — what server inference would cost

100–500ms per rep round-trip — too slow for end-of-rep classification. Offline gym sessions break entirely. Privacy: every workout video metadata leaves the device.

### Sub-block 3 — the breakpoint

Fine until the model exceeds ~50MB. Then quantization + smaller archives become necessary.

### Sub-block 4 — what isn't a tradeoff

Hybrid (small on-device + big server for harder cases) was not picked because the app must work offline. A server fallback could be added later without architectural changes.

---

## Tech reference (industry pairing)

### ONNX Runtime Mobile

- **Codebase uses:** Not yet. Planned dependency.
- **Why it's here:** the cross-platform mobile inference runtime.
- **Leading today:** ONNX Runtime — `adoption-leading`, 2026.
- **Why it leads:** supports models from every major framework (sklearn, LightGBM, PyTorch); cross-platform.
- **Runner-up:** TensorFlow Lite — `adoption-leading` alternative; Google-stack default.

---

## Project exercises

### [B2C.12] On-device deployment

- **Exercise ID:** `[B2C.12]`
- **What to build:** Export the trained classifier to ONNX; integrate `onnxruntime-react-native`; measure per-rep latency on a real Android device; target <50ms.
- **Why it earns its place:** the shippable artifact — your trained model running on a phone in real time.
- **Files to touch:** `models/form_classifier.onnx` (built), `src/services/ml/classifier.ts` (new), `package.json` (add dependency).
- **Done when:** integration test loads the model, runs inference on a fixed feature vector, returns the expected label. Latency reported in `docs/ml-results.md`.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

The trained form classifier ships with the app as an ONNX file. `onnxruntime-react-native` loads it on startup; per-rep inference runs at ~10ms. The same architectural pattern as the existing MediaPipe pose model. The constraint forcing this design is the offline-first user context plus the latency budget. The cost paid is app bundle size and model updates being tied to app releases.

### Key points

- Train off-device; ship the model in the app bundle.
- ONNX is the cross-platform export format.
- Latency budget ~10ms per rep, well within frame budget.
- Same shape as the existing MediaPipe-on-device pipeline.

---

## Interview defense

### Likely questions

**Q: Why on-device?  [mid]**
A: Latency (sub-50ms not achievable with a server round-trip), offline support (basement gyms have no signal), and privacy (no workout data leaves the device). The trade is app bundle size and the inability to update models without an app release.

**Q: How do you update the model in production?  [senior]**
A: Bundle a new version with the next app release. For A/B testing different model versions on different users, ship multiple model files and dispatch via a feature flag. For *hot* model updates without a release, support downloading models at runtime (e.g., from a CDN) — adds complexity and a security review (signed models, version pinning).

**Q: 100MB model — would on-device still work?  [arch]**
A: Tight. Android APK size limits + user download patience mean ~50MB is the comfortable upper bound. At 100MB you'd quantize aggressively (int8, fp16), ship the model in a separate app bundle (Android Play Asset Delivery), or move some inference to a server with on-device fallback for offline use. The breakpoint depends on the app's other size budget.

### One-line anchors

- Compute where the data lives.
- ONNX is the portable format.
- Latency budget is the design constraint.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the train-off-device → ship-with-app → run-per-rep flow.

### Level 2 — Explain it out loud
Why not server inference. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add nutrition coaching that needs an LLM. On-device or server?"

### Level 4 — Defend the decision you'd change
"Move inference to a server." When?

### Quick check — code reference test
- What's the planned export format?
- What's the latency target?
- What existing on-device model is precedent?

Then verify.
