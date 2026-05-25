# 09 — ML system design templates

IK-style interview reframes for common ML system design prompts. Each template uses the 9-labelled-bullet shape (NOT the per-concept template).

## Files

1. **[01-recommender-system.md](./01-recommender-system.md)** — "Design a recommender system." Applies-to-contrl: partial — contrl's planned Phase 2C recommender maps to this template once B2C.14/B2C.15 ship.
2. **[02-anomaly-detection.md](./02-anomaly-detection.md)** — "Design an anomaly detection system." Applies-to-contrl: no (structurally), but the drift-detection concept ([08-machine-learning/17-drift-detection](../08-machine-learning/17-drift-detection.md)) is the contrl-shaped instance.
3. **[03-object-detection-cv.md](./03-object-detection-cv.md)** — "Design an object detection / CV system." Applies-to-contrl: partial — contrl uses pre-trained MediaPipe pose detection; the principles around on-device deployment, quantization, and inference apply.

## Reading order

Read these AFTER the underlying ML concepts in `08-machine-learning/`. The templates synthesize ML primitives into whiteboard-shaped answers. **01 (recommender)** is the most contrl-aligned; **03 (object detection / CV)** has parallels with contrl's pose detection; **02 (anomaly)** is the broader pattern.

→ Section overview: [../README.md](../README.md)

→ All concept files migrated from the legacy contrl-only study guide (per 2026-05-19 work); content is contrl-anchored Case A throughout.
