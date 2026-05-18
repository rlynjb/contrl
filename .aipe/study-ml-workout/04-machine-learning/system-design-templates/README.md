# 04 / system design templates

IK-style interview-prompt reframes for ML systems. Each file is a 9-bullet template covering the prompt, standard architecture, data model, key components, scale concerns, eval framing, common failure modes, applicability to contrl, and how to make it apply.

## File index

- **[01-recommender-system](./01-recommender-system.md)** — content + collaborative + hybrid recommenders. IK Module 2.
- **[02-anomaly-detection](./02-anomaly-detection.md)** — flag unusual instances. IK Module 3.
- **[03-object-detection-cv](./03-object-detection-cv.md)** — bbox / keypoint / segmentation pipeline. IK Module 4.

## Applies-to-this-codebase

| Template | Applies? | Notes |
|---|---|---|
| 01-recommender-system | partially | Phase 2C's planned progression recommender IS this template at single-user scale |
| 02-anomaly-detection | partially | PSI-based drift detection on the form classifier is an instance |
| 03-object-detection-cv | yes | The existing MediaPipe pose pipeline implements this; the planned classifier is downstream |

contrl is unusual in that *all three* ML templates apply at least partially. That's the curriculum's "three shapes" payoff: a single project that defends multiple IK ML modules with real code.

## Pattern

Each template uses the 9-labelled-bullet shape exactly:

1. The prompt
2. Standard architecture (ASCII diagram)
3. Data model
4. Key components
5. Scale concerns
6. Eval framing
7. Common failure modes
8. Applies to this codebase
9. How to make it apply
