# AI engineering + ML — overview

> contrl's AI/ML system map. The codebase's dominant shape is **classical supervised ML + on-device inference** (the contrl-mo example shape from the spec): pre-trained MediaPipe pose detection shipping today, a planned LightGBM form classifier and progression recommender (Phase 2C), and a planned LLM coaching agent (Phase 4 Path C) that consumes the classifier's outputs through 5 read-only tools. Three layers of "AI" stacked on one production path — pre-trained CV + trained ML + LLM agent — and the contrast between the layers is the interview story.

```
┌─ Capture layer (on-device, SHIPPED today) ───────────────────────────────────┐
│                                                                              │
│   react-native-vision-camera + react-native-mediapipe-posedetection           │
│   model: pose_landmarker_lite.task (pre-trained, GPU delegate)               │
│   output: 33 landmarks @ ~30 fps                                             │
│                                                                              │
│   Files:                                                                     │
│     src/components/camera/PoseCamera.tsx                                      │
│     models/pose_landmarker_lite.task                                          │
│                                                                              │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │ landmarks
             ▼
┌─ FSM layer (on-device, SHIPPED today, no ML) ────────────────────────────────┐
│                                                                              │
│   Rep counter: deterministic FSM (idle → ready → down → bottom → up)         │
│   Plus 10° hysteresis. No trained model in this loop.                        │
│                                                                              │
│   Files:                                                                     │
│     src/lib/pose/rep-counter.ts                                              │
│     src/lib/pose/exercises/{pushup,squat,plank,pull,pull-bar,pull-trx}.ts    │
│                                                                              │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │ rep events
             ▼
┌─ Feature + classifier layer (on-device, PLANNED Phase 2C) ───────────────────┐
│                                                                              │
│   Feature extraction: ~8 per-rep features derived from pose landmarks         │
│   (knee angle range, tempo, depth, etc).                                     │
│   Classifier: LightGBM trained in Python → ONNX → ONNX Runtime Mobile.       │
│                                                                              │
│   Outputs:                                                                   │
│     per-rep label + confidence → audit_inferences table (B2C.4)               │
│                                                                              │
│   Planned files: ml/form-classifier/ (Python training)                       │
│                  src/lib/ml/onnx-runner.ts (on-device inference)             │
│                  assets/models/form-classifier.onnx                          │
│                                                                              │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │ classifier_outputs rows
             ▼
┌─ Recommender layer (on-device, PLANNED Phase 2C) ────────────────────────────┐
│                                                                              │
│   v1: rule-based (current gate state + recent history). JS-only. B2C.14.    │
│   v2: LightGBM classifier consuming form history + gate state. B2C.15.      │
│                                                                              │
│   Output: ranked exercise list                                               │
│                                                                              │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │
             ▼
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                        on-device boundary above
                        cloud boundary below
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
┌─ Agent layer (cloud LLM, PLANNED Phase 4 Path C) ────────────────────────────┐
│                                                                              │
│   Coaching agent: Anthropic Sonnet 4 + 5 read-only tools                     │
│     get_classifier_output(workout_id)                                         │
│     get_form_history(exercise_id, days_back)                                  │
│     get_progression_state(category)                                           │
│     get_recent_coaching(days_back)                                            │
│     get_exercise_cues(exercise_id)                                            │
│                                                                              │
│   Output: end-of-session coaching text (rendered in UI)                      │
│                                                                              │
│   Planned files: src/lib/agent/                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Legend

- **Capture layer** — `src/components/camera/PoseCamera.tsx`. The MediaPipe call that produces 33 pose landmarks at ~30 fps. Pre-trained, GPU delegate, runs on-device. SHIPPED today.
- **FSM layer** — `src/lib/pose/rep-counter.ts` + `src/lib/pose/exercises/*.ts`. Deterministic state machine consuming angles derived from pose landmarks. No ML. Produces rep counts. SHIPPED today.
- **Feature + classifier layer** — planned Phase 2C. Derives ~8 per-rep features from pose landmarks; runs them through a LightGBM model exported to ONNX. Outputs land in a new `audit_inferences` SQLite table (B2C.4 prereq).
- **Recommender layer** — planned Phase 2C. v1 is rule-based (deterministic); v2 swaps in a LightGBM model. Reads gate state + recent session history + (eventually) form history from the classifier.
- **On-device boundary** — every layer above this line runs on the phone (Android via Expo). The only cloud surface is the coaching agent.
- **Agent layer** — planned Phase 4 Path C. Anthropic Sonnet 4 with 5 read-only tools. The tools READ contrl's local SQLite (classifier_outputs, sessions, gate progress) via local Node serving the read endpoints, then send to the LLM. No write tools — agent can only generate coaching text, not modify data.
- **Three shapes** — Pre-trained CV (MediaPipe), trained ML (LightGBM), LLM agent (Anthropic). One production path. The contrast between layers is the interview story.

## Reading order

1. **08-machine-learning/** is the richest sub-section (19 contrl-anchored Case A files covering the supervised pipeline through retraining). Start there — it grounds you in the concrete planned ML work.
2. **04-agents-and-tool-use/** (8 contrl-anchored Case A files about the Phase 4 coaching agent). Read second — it shows what the agent does with the ML outputs.
3. **05-evals-and-observability/** — applies to both the ML (Phase 3 evals B3.8, B3.9) and the coaching agent (LLM evals).
4. **01-llm-foundations/** — background reading for the coaching agent. Mostly Case B because contrl doesn't ship LLM code yet.
5. **06-production-serving/** — operational concerns. Some apply to ML (caching, observability); most are Case B for LLM serving.
6. **02-context-and-prompts/** and **03-retrieval-and-rag/** — pure background. contrl does no RAG and minimal prompt-context engineering. All Case B.
7. **07-system-design-templates/** (2 AI templates) and **09-ml-system-design-templates/** (3 ML templates) — interview reframes. Read after the underlying concepts.

→ Section indexes: [01-llm-foundations](./01-llm-foundations/README.md) · [02-context-and-prompts](./02-context-and-prompts/README.md) · [03-retrieval-and-rag](./03-retrieval-and-rag/README.md) · [04-agents-and-tool-use](./04-agents-and-tool-use/README.md) · [05-evals-and-observability](./05-evals-and-observability/README.md) · [06-production-serving](./06-production-serving/README.md) · [07-system-design-templates](./07-system-design-templates/README.md) · [08-machine-learning](./08-machine-learning/README.md) · [09-ml-system-design-templates](./09-ml-system-design-templates/README.md)

→ Synthesis files: [ai-features-in-this-codebase](./ai-features-in-this-codebase.md) · [ml-features-in-this-codebase](./ml-features-in-this-codebase.md)

→ Companion guides: prompt engineering at `../study-prompt-engineering/`. System-design + DSA at `../study-system-design-dsa/`.
