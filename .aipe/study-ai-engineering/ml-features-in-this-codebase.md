# ML features in this codebase

**Industry name(s):** ML capability inventory, per-feature ML map, model registry (lightweight)
**Type:** Project-specific

> Reference card for every ML surface contrl has shipped, plans to ship, or has decided not to ship — what each is, what model type, where it runs, and which curriculum build it traces back to. The codebase's dominant shape is **classical supervised ML + on-device inference**, with a Phase 4 LLM coaching agent layered on top of the ML outputs.

**See also:** Companion: → [ai-features-in-this-codebase.md](./ai-features-in-this-codebase.md) for AI/LLM features. Closely paired with → [08-machine-learning/01-supervised-pipeline](./08-machine-learning/01-supervised-pipeline.md) (the training pipeline that makes most of these real) · → [08-machine-learning/13-on-device-inference](./08-machine-learning/13-on-device-inference.md) (the serving constraint that shapes every model choice).

---

## Why care

**Move 1.** You join a project that has an `ml/` directory. Inside: three `.onnx` files, two `.py` training scripts, a `models.json` config, one `notes.md` from someone who left. You open the app and the user-facing features that *look* ML-powered are not all powered the same way — one is a rule lookup, one is a pre-trained library call, one is genuinely a trained model. Two PRs from last week add more. After a week of this, you still can't answer "which of these actually ships, and which is a stub I'm allowed to delete?" without grepping the codebase for half an afternoon.

**Move 2.** That "which of these actually ships" question is what a per-feature ML map answers. Not the model architecture, not the metrics dashboard, not the training pipeline — just the inventory: feature → status → model type → where it runs → what it depends on. It's the table you'd put on the wall behind your desk if every PR meeting started with "and where does this fit on the map?"

**Why you need to answer that question at all:** Without the map, the codebase's ML scope becomes folklore. A new contributor can't tell shipped from planned from cancelled. The interview answer to "what ML does your app do?" devolves into a tour of the codebase rather than one sentence per surface. And — load-bearing for this project specifically — the curriculum tags (`B2C.x`, `B3.x`, `B4C.x`, `B5.x`) only stay meaningful if each build can be traced back to the feature it produces. The map is the join between the curriculum's verbs and the codebase's nouns.

**Before / after.**

Without an ML map:
- A new contributor opens `lib/ml/` and sees three folders. They ask in chat "is `form-classifier/` shipped?" and somebody answers "kind of — the training script works, ONNX export works, on-device inference is wired but the UI doesn't read it yet."
- In an interview, "what ML does contrl do?" becomes a 4-minute walk through the codebase instead of a 30-second answer with three named surfaces.
- A drift-detection PR lands without anybody asking "which feature does this protect?" because the question has no easy answer.

With an ML map:
- New contributor opens this file. Reads the "Currently shipped" table — sees that no trained ML ships yet, only MediaPipe (pre-trained). Knows what's stable and what's in flight in two minutes.
- Interview answer: "Three shapes — pre-trained CV via MediaPipe (shipped), trained classifier on pose features (Phase 2C, on-device ONNX), and an LLM coaching agent that consumes the classifier's outputs (Phase 4 Path C). Want me to expand any of them?"
- The drift-detection PR's reviewer opens the map, sees "Form classifier" as the only model with drift exposure, and confirms scope before the diff even gets discussed.

**Move 5.** The ML map is what a database schema diagram is to backend devs — a flat reference of what exists, organized by type, that you return to every time scope or coverage comes up. Not the implementation, not the metrics, just the inventory.

---

## How it works

### Move 1 — The mental model

Think of a database table where each row is a *feature* and each column is a fact about that feature you'd want to look up without reading code: status (`shipped` / `planned` / `cancelled`), model type (`pre-trained` / `trained-tabular` / `rule-based` / `LLM-agent`), where it runs (`device` / `cloud` / `local-js`), inputs, outputs, curriculum build IDs. The map is that table. The "rows" are written by hand because the truth lives in the team's heads and the curriculum doc, not in any code metadata.

The strategy in plain English: **one row per feature, columns chosen so any reviewer can answer scope, coverage, and risk questions without reading the codebase.**

```
  ML capability map (mental model)
  ┌─────────────────────┬──────────┬───────────────┬──────────────┬───────────────┐
  │ Feature             │ Status   │ Model type    │ Runs at      │ Curriculum    │
  ├─────────────────────┼──────────┼───────────────┼──────────────┼───────────────┤
  │ Rep counting        │ shipped  │ deterministic │ device JS    │ —             │
  │ Pose estimation     │ shipped  │ pre-trained   │ device GPU   │ —             │
  │ Form classifier     │ planned  │ trained-LGBM  │ device ONNX  │ B2C.1–B2C.12  │
  │ Recommender v1      │ planned  │ rule-based    │ device JS    │ B2C.14        │
  │ Recommender v2      │ planned  │ trained-LGBM  │ device ONNX  │ B2C.15        │
  │ Coaching agent      │ planned  │ LLM + tools   │ cloud LLM    │ B4C.1–B4C.5   │
  └─────────────────────┴──────────┴───────────────┴──────────────┴───────────────┘
```

The reader scans this and gets, in ten seconds: nothing trained ships today, three trained models are planned, and one LLM-agent layer sits on top.

---

### Move 2 — The layered walkthrough

The map is structured in five phases, mirroring the curriculum's phase tags. Each phase answers a different question.

#### Currently shipped — what's real today

If you're coming from frontend, this is the equivalent of a "what's in production" status page — a flat list of the surfaces a user actually touches today, with what *kind* of code is behind each one. Not "what's deployed to staging," not "what's behind a feature flag" — just shipped.

| Feature | Status | What it does |
|---|---|---|
| Rep counting | Shipped | Deterministic FSM (no ML at all) — see [02-dsa/05-rep-counter-state-machine](../study-ml-workout/02-dsa/05-rep-counter-state-machine.md) |
| Pose estimation | Shipped | MediaPipe pre-trained pose landmarker, on-device GPU delegate — see [01-system-design/07-pose-detection-pipeline](../study-ml-workout/01-system-design/07-pose-detection-pipeline.md) |

The honest read: the current app uses *pre-trained* ML (MediaPipe pose) but does no *trained* ML of its own. Anyone telling you the app "uses ML" today is half-right — MediaPipe is ML, but it's not contrl's model and contrl didn't train it. The boundary condition: the moment we ship Phase 2C's form classifier (a `.onnx` produced by our own training pipeline), that statement flips.

```
  Today's ML surface
  ┌──────────────────────────────┐
  │ User opens camera            │
  │   ▼                          │
  │ MediaPipe pose landmarker    │ ← pre-trained, on-device
  │   ▼ 33 landmarks @ ~30 fps   │
  │ Deterministic FSM (no ML)    │ ← angles + hysteresis only
  │   ▼ rep count                │
  │ UI shows count               │
  └──────────────────────────────┘
       no trained model in the loop
```

#### Phase 2C — supervised pipeline (planned)

This is the core training pipeline contrl is being built toward. Three surfaces, each with a tag from the curriculum's `B2C.*` build series.

| Feature | Model type | Where it runs | Inputs | Outputs | Curriculum |
|---|---|---|---|---|---|
| Form classifier | Tabular (LR baseline + LightGBM) | On-device via ONNX | 8 per-rep features | Per-rep label + confidence | B2C.1–B2C.12 |
| Progression recommender v1 | Rule-based | Local JS | Gate state, recent history | Recommended exercise | B2C.14 |
| Progression recommender v2 | LightGBM classifier | On-device via ONNX | Recent sessions, gate state, form history | Ranked exercise list | B2C.15 |

If you're coming from frontend, the model type column is the analogue of "is this a real component or a `<div>` with `display:none`" — the rule-based recommender v1 is the placeholder, the trained v2 is the real component. Both ship under the same UI surface; the team can swap the implementation behind a flag without users noticing.

#### Phase 3 — evaluation infrastructure (planned)

The eval surface exists for one reason: every trained model in Phase 2C needs a number you can defend. "F1 on held-out set" / "PSI vs baseline" are interview answers; this row of the map is where those answers come from.

| Capability | Implementation | Curriculum |
|---|---|---|
| Eval harness for classifier | Python on test set + held-out self-labeled | B3.8 |
| Eval for recommender (single-user A/B) | Random arm assignment + outcome logging | B3.9 |
| Training-run logging | JSONL `docs/ml-runs.jsonl` | B3.12 |
| Drift detection | PSI on rolling window | B3.13 |

#### Phase 4 Path C — LLM coaching agent (planned)

The map's role here is to make clear that the LLM coaching layer *consumes* the Phase 2C classifier's outputs — it isn't a parallel ML surface; it's a layer on top.

| Surface | Tools | Curriculum |
|---|---|---|
| End-of-session coaching agent | `get_classifier_output`, `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues` | B4C.1–B4C.5 |

```
  How Phase 4 stacks on Phase 2C
  ┌──────────────────────────────┐
  │ Phase 2C classifier emits    │ ← form label + confidence
  │ rows into audit_inferences   │
  │           │                  │
  │           ▼  (tool call)     │
  │ Coaching agent reads via     │ ← LLM with 5 tools
  │ get_classifier_output()      │
  │           │                  │
  │           ▼                  │
  │ Generates coaching text      │
  └──────────────────────────────┘
   Phase 4 cannot ship before Phase 2C audit trail is real
```

#### Phase 5 — production ML (planned)

| Capability | Curriculum |
|---|---|
| On-device deployment via ONNX Runtime Mobile | B5.9–B5.11 |
| Quantization measurement | B5.9 |
| Retraining decision pipeline | B5.12 |
| On-device personalization (calibration-extended) | B5.13 |

---

### Move 3 — The principle

The map is what people mean by "knowing what your codebase actually does" at the ML layer. Every shipped or planned ML surface has a row. Every curriculum build has a target row. Every interview question of the form "what ML does your app do?" gets answered by reading top-to-bottom. When the map and the code disagree, one of them is wrong — and the map is the artifact that's easiest to update first.

The full inventory and per-file curriculum map are below.

---

## ML features in this app — diagram

The end-state data flow once Phase 2C and Phase 4 Path C ship. Layers labelled to show the on-device boundary.

```
┌─ Capture layer (on-device, existing) ──────────────────────────────────────────┐
│                                                                                │
│  MediaPipe pose landmarker  →  33 landmarks @ ~30 fps                          │
│  (pre-trained, GPU delegate)                                                   │
└────────────┬───────────────────────────────────────────────────────────────────┘
             │
             ▼ pose landmarks
┌─ Feature layer (on-device, Phase 2C) ──────────────────────────────────────────┐
│                                                                                │
│  feature extraction (8 per-rep features: knee angle range, tempo, depth, …)    │
└────────────┬───────────────────────────────────────────────────────────────────┘
             │
             ▼ feature vector
┌─ Model layer (on-device, Phase 2C) ────────────────────────────────────────────┐
│                                                                                │
│  Form classifier (LightGBM → ONNX → ONNX Runtime Mobile)                       │
│         │                                                                       │
│         ├──▶ classifier_outputs row  (audit trail, Phase 2C, B2C.4 / B2C.13)   │
│         │                                                                       │
│         └──▶ per-rep label + confidence                                        │
│                                                                                │
│  Progression recommender (v1 rule-based → v2 LightGBM)                         │
│         │                                                                       │
│         ├──▶ A/B arm assignment + outcome log (Phase 3, B3.9)                  │
│         │                                                                       │
│         └──▶ today's recommended exercise                                      │
└────────────┬───────────────────────────────────────────────────────────────────┘
             │
             ▼ classifier_outputs + form history
┌─ Agent layer (cloud LLM, Phase 4 Path C) ──────────────────────────────────────┐
│                                                                                │
│  Coaching agent (LLM + 5 tools)                                                │
│    tools: get_classifier_output / get_form_history /                           │
│           get_progression_state / get_recent_coaching / get_exercise_cues      │
│         │                                                                       │
│         ▼                                                                       │
│  End-of-session coaching text                                                  │
└────────────────────────────────────────────────────────────────────────────────┘
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
   On-device boundary: everything above runs on the phone; only the agent
   crosses the network. Audit trail rows produced by the classifier stay
   in local SQLite and are read by the agent through tool calls (which
   themselves cross the network in the request payload).
```

---

## Per-file curriculum coverage

Every concept file in this section traces back to one or more curriculum concept IDs. This is the load-bearing join between the map and the per-concept files.

| Section file | Curriculum concept(s) | Build(s) |
|---|---|---|
| [01-supervised-pipeline](./08-machine-learning/01-supervised-pipeline.md) | C2C.1 | B2C.1–B2C.12 |
| [02-feature-engineering-from-pose](./08-machine-learning/02-feature-engineering-from-pose.md) | C2C.2 | B2C.3 |
| [03-train-val-test-discipline](./08-machine-learning/03-train-val-test-discipline.md) | C2C.3 | B2C.9 |
| [04-model-selection-lr-vs-gbt](./08-machine-learning/04-model-selection-lr-vs-gbt.md) | C2C.4 | B2C.6, B2C.7 |
| [05-class-imbalance](./08-machine-learning/05-class-imbalance.md) | C2C.5, C3.5 | B2C.8 |
| [06-domain-gap-and-transfer-learning](./08-machine-learning/06-domain-gap-and-transfer-learning.md) | C2C.6, C2C.7 | B2C.1, B2C.10 |
| [07-confusion-matrices-and-per-class-metrics](./08-machine-learning/07-confusion-matrices-and-per-class-metrics.md) | C2C.11, C3.4 | B2C.11 |
| [08-calibration](./08-machine-learning/08-calibration.md) | C2C.12 | B2C.11 |
| [09-bias-variance](./08-machine-learning/09-bias-variance.md) | C3.9 | (interpretive — B2C.7 produces the data) |
| [10-ab-testing-single-user](./08-machine-learning/10-ab-testing-single-user.md) | C3.6, C3.7 | B2C.18, B3.9 |
| [11-recommender-framing](./08-machine-learning/11-recommender-framing.md) | C2C.9, C5.11 | B2C.14, B2C.15, B2C.17 |
| [12-cold-start](./08-machine-learning/12-cold-start.md) | C2C.10 | B2C.14, B2C.16 |
| [13-on-device-inference](./08-machine-learning/13-on-device-inference.md) | C2C.8, C5.15 | B2C.12, B5.10, B5.11 |
| [14-quantization](./08-machine-learning/14-quantization.md) | C5.15 (subset) | B5.9 |
| [15-audit-trail-inference-logging](./08-machine-learning/15-audit-trail-inference-logging.md) | C2C.13 | B2C.4, B2C.13 |
| [16-training-run-logging](./08-machine-learning/16-training-run-logging.md) | C3.10, C3.11 | B3.12 |
| [17-drift-detection](./08-machine-learning/17-drift-detection.md) | C3.12 | B3.13 |
| [18-retraining-pipelines](./08-machine-learning/18-retraining-pipelines.md) | C5.16 | B5.12, B5.13 |
| [19-ml-system-design](./08-machine-learning/19-ml-system-design.md) | C5.9 | B5.14 |

---

## In this codebase

**This file's role.** The map is the entry point to `.aipe/study-ml-workout/04-machine-learning/`. It does not point at production code because nothing in Phase 2C ships yet.

**Where the shipped ML actually lives:**
- **Pose estimation:** `src/components/camera/PoseCamera.tsx` — `usePoseDetection` hook from `react-native-mediapipe-posedetection`. Model file `models/pose_landmarker_lite.task`.
- **Rep counting:** `src/lib/pose/rep-counter.ts` — deterministic FSM, no ML.

**Where planned ML will land** (per curriculum scope, not yet on disk):
- **Form classifier training pipeline:** Python under a future `ml/form-classifier/` directory; ONNX export to `assets/models/form-classifier.onnx`.
- **On-device inference:** new wrapper in `src/lib/ml/` reading the ONNX file via ONNX Runtime Mobile.
- **Audit trail table:** new `classifier_outputs` SQLite table with migration in `src/services/database.ts`.
- **Recommender:** `src/lib/recommender/` for v1 rule logic; v2 ONNX next to the classifier.
- **Coaching agent:** `src/lib/agent/` for the tool definitions and LLM client wiring.

---

## Elaborate

**Where this pattern comes from.** Lightweight model registries appear the moment a team has more than one model in flight. The ML observability literature (Eugene Yan's "What We've Learned From A Year of Building with LLMs", Hidden Technical Debt in Machine Learning Systems) repeatedly names "feature inventory" as the artifact that distinguishes serious teams from accidental ones. At larger scales, the artifact becomes a database (MLflow, Weights & Biases, Vertex AI Model Registry); at this scale, a markdown file with three tables is the right size.

**The deeper principle.** ML scope is the part of a codebase most likely to drift between what's claimed and what's true. Code can be grepped; metrics can be measured; an ML surface's *status* — shipped vs. planned vs. cancelled — is a social fact that has to be maintained by hand. The map exists because nothing else in the repo holds that fact authoritatively.

**Where this breaks down.** Three failure modes:
1. **Stale rows.** A planned feature gets cancelled but nobody removes the row. The map drifts; interview answers cite features that won't ship.
2. **Rows that hide complexity.** The "Form classifier" row says "LightGBM" — but the actual training pipeline may go through three variants before settling. The map doesn't show experiments; for that you need the training-run log (`16-training-run-logging`).
3. **Coverage gaps.** A new ML surface ships without a row. The map silently undersells the codebase. Hard to detect because the absence has no signal.

**What to explore next.**
- `01-supervised-pipeline` → the training pipeline that produces every "trained" row's `.onnx`.
- `13-on-device-inference` → the constraint that shapes every model-type column ("device ONNX" vs "cloud LLM").
- `15-audit-trail-inference-logging` → the row that everything in Phase 4 depends on.
- `19-ml-system-design` → the system-design-template view of these same surfaces, sized for an interview whiteboard.

---

## Tradeoffs

| Cost dimension | Hand-written ML map (this file) | Tool-generated registry (e.g. MLflow) |
|---|---|---|
| Setup cost | ~200 lines of markdown | New service, schema, integration code |
| Truth maintenance | Manual — author edits every change | Automatic on training-run upload |
| Status tracking (shipped/planned/cancelled) | First-class — explicit columns | Awkward — registries track *runs*, not roadmap state |
| Curriculum traceability | Built in — `B2C.x` IDs in every row | Foreign — registries don't know about learning goals |
| Onboarding cost | Read one file | Spin up an MLflow account, find the project |
| Drift risk | High — staleness has no detector | Low for run metadata; same as this file for roadmap |
| Searchability | `grep` | Web UI + API |

**Sub-block 1 — what we gave up.** Two things. First, automatic freshness: a tool-generated registry knows the moment a new run lands; this file finds out when its human author opens it. The freshness gap is real and the only mitigation is discipline ("update the map in the same PR that adds the feature"). Second, run-level history: the file shows the *current* state of each surface, not the history of attempts that got it there. For that, `16-training-run-logging` is the artifact; for the high-level roadmap state, this file is.

**Sub-block 2 — what the alternative would have cost.** MLflow (or W&B, or Vertex Model Registry) gives you run history, model versioning, artifact storage, and a web UI. Setup at the smallest tier still means: a hosted account, a project ID, a logging callback in the training script, an auth secret in CI, and a permanent dependency on a service that's not part of the React Native runtime. For a project with zero trained models in production today, that's infrastructure spend on a problem that doesn't exist yet. The honest answer is: the moment the third trained model lands in production *and* the team is more than one person, switching to a real registry is correct. Until then, this file is the right size.

**Sub-block 3 — the breakpoint.** This file is the right artifact until one of: (a) more than three trained models actively in production with regular retraining, (b) more than one engineer making ML changes such that "did Rein update the map?" becomes a coordination cost, or (c) the curriculum traceability needs to become read-by-automation (CI checking that every shipped feature has a curriculum tag, for example). At any of those, migrate the inventory to a tool — but keep this file as the "human roadmap" view that points into the tool.

---

## Tech reference (industry pairing)

### LightGBM (planned)

- **Codebase uses:** Not yet on disk. Planned for `ml/form-classifier/` (Python) per curriculum builds B2C.6–B2C.7.
- **Why it's here:** the trained model behind the form classifier and recommender v2. Tabular gradient boosting is the right choice for small-data per-rep feature vectors with mixed numeric/categorical inputs.
- **Leading today:** LightGBM — `adoption-leading` for tabular gradient boosting, 2026.
- **Why it leads:** faster training than XGBoost on the same hardware, native categorical support, smaller artifacts, mature ONNX export.
- **Runner-up:** XGBoost — slightly more popular by raw GitHub stars; CatBoost is the `innovation-leading` choice for heavy categorical workloads.

### ONNX + ONNX Runtime Mobile (planned)

- **Codebase uses:** Not yet on disk. Planned for `assets/models/*.onnx` artifacts loaded by a future `src/lib/ml/` wrapper, per builds B5.9–B5.11.
- **Why it's here:** the serialization and runtime that lets a Python-trained LightGBM (or LR) model run on Android without rebuilding the model in JS. Removes the train-language ≠ serve-language friction.
- **Leading today:** ONNX — `adoption-leading` for cross-runtime model interchange, 2026.
- **Why it leads:** broad framework support (sklearn, LightGBM, PyTorch, TF all export to ONNX); ONNX Runtime Mobile is small and proven on Android.
- **Runner-up:** TensorFlow Lite — leader for TF-native pipelines but constrains training-side choices to TF.

### MediaPipe pose landmarker (shipped)

- **Codebase uses:** `models/pose_landmarker_lite.task` loaded by `react-native-mediapipe-posedetection` in `src/components/camera/PoseCamera.tsx`.
- **Why it's here:** the pre-trained model that produces the 33-landmark pose stream — the input to every Phase 2C feature extractor and the rep counter today.
- **Leading today:** MediaPipe Pose Landmarker — `adoption-leading` for on-device pose estimation, 2026.
- **Why it leads:** Google-maintained, GPU-delegated on Android, three model variants (lite / full / heavy) with explicit accuracy-vs-latency tradeoffs.
- **Runner-up:** MoveNet — TensorFlow Lite-based, comparable accuracy on most poses, less complete tooling.

### Single-user A/B (planned)

- **Codebase uses:** Not yet on disk. Planned for `src/lib/recommender/ab.ts` per build B3.9.
- **Why it's here:** the eval mechanism for the rule-based-vs-trained recommender swap. With one user, classical A/B math breaks; the curriculum names a single-user random-arm-assignment pattern as the workaround.
- **Leading today:** This is a project-specific pattern; no industry leader exists for "valid A/B with n=1." Closest neighbors are quasi-experimental methods (interrupted time series, change-point detection).
- **Runner-up:** N/A.

---

## Project exercises

This file is a roll-up; its curriculum role is to *list* the builds that produce the rows of the map, not to add new builds. The exercises below are the highest-leverage map-affecting items from across the section. Each is documented in detail in the linked concept file.

### [B2C.4] Audit trail table — the prerequisite for everything else

- **Exercise ID:** `[B2C.4]`
- **What to build:** A `classifier_outputs` SQLite table + a migration in `src/services/database.ts` + a `recordClassifierOutput()` helper called every time the (not-yet-built) classifier emits a label. Schema includes `rep_id`, `feature_vector_json`, `predicted_label`, `confidence`, `model_version`, `created_at`.
- **Why it earns its place:** every later Phase 2C, Phase 3, and Phase 4 build assumes this table exists. Phase 4's `get_classifier_output` tool reads it; Phase 3's drift detection rolls a window over it; B2C.13 reads it to populate training data for v2. Build this first and the rest of the map's "planned" rows become real targets.
- **Files to touch:** `src/services/database.ts` (migration + CRUD helpers), `src/types/index.ts` (new `ClassifierOutput` type), `src/lib/ml/` (new directory for the helper).
- **Done when:** the migration runs cleanly, `recordClassifierOutput({...})` writes a row, `getClassifierOutputs({since, exerciseId})` returns rows, all callable from a unit test that doesn't require a model to exist.
- **Estimated effort:** `1–4hr`

### [B2C.12] On-device ONNX inference wrapper

- **Exercise ID:** `[B2C.12]`
- **What to build:** A `src/lib/ml/onnx-runner.ts` that loads an ONNX model from `assets/models/*.onnx` and exposes `predict(featureVector: number[]): Promise<{ label: string; confidence: number }>`. Tested against a dummy ONNX classifier that returns deterministic outputs.
- **Why it earns its place:** unblocks every "device ONNX" row in the map. Without this, every trained model on the map is theoretical.
- **Files to touch:** `src/lib/ml/onnx-runner.ts` (new), `assets/models/.gitkeep` (new), `package.json` (add `onnxruntime-react-native`).
- **Done when:** `predict(...)` returns deterministic outputs against a hand-built test ONNX file; bundle size delta is documented in `docs/ml-runs.jsonl`.
- **Estimated effort:** `1–2 days`

### [B5.14] Write the system-design template

- **Exercise ID:** `[B5.14]`
- **What to build:** Write `04-machine-learning/system-design-templates/01-recommender-system.md` so the section's `system-design-templates/` directory has a recommender file that maps to this project. (The file already exists in the guide; this exercise refines its `**Applies to this codebase:**` and `**How to make it apply:**` bullets once Phase 2C ships.)
- **Why it earns its place:** the interview reframe of the whole map — "design a recommender" — needs an answer specific to contrl. Currently the template is generic; once the real recommender ships, the template becomes a defensible interview answer.
- **Files to touch:** `.aipe/study-ml-workout/04-machine-learning/system-design-templates/01-recommender-system.md`.
- **Done when:** the `Applies` verdict shifts from `partially` to `yes` (after B2C.14/B2C.15 ship) and the `How to make it apply` bullet describes the actual deployment.
- **Estimated effort:** `1–4hr` (after the underlying ML ships)

---

## Summary

contrl's ML scope spans four curriculum phases. Phase 2C builds the supervised pipeline (form classifier + recommender). Phase 3 builds the eval infrastructure that makes those defensible. Phase 4 Path C layers an LLM coaching agent on top of the classifier's outputs. Phase 5 is on-device production discipline (quantization, retraining, calibration). Nothing trained ships today; the audit-trail table (B2C.4) is the prerequisite that unlocks every later phase because it produces the training data the rest depend on. The interview payoff is the "three shapes" demonstration — pre-trained CV (MediaPipe) plus trained ML (form classifier) plus LLM (coaching agent) — in one production path on a single device.

**Key points:**

- **Nothing trained ships today.** MediaPipe is pre-trained; rep counting is deterministic; everything else is planned.
- **The map is a join, not a registry.** It joins curriculum build IDs (`B2C.x`) to feature surfaces and to per-concept files in this section.
- **Phase 4 cannot ship before Phase 2C audit trail (B2C.4) is real.** The coaching agent's tools read from the classifier's outputs; no outputs, no tools.
- **The on-device boundary is the shaping constraint.** Every trained model in the map runs on the phone; the LLM agent is the only cloud surface. That single constraint drives the LightGBM-via-ONNX choice and bounds the model-size budget.
- **The breakpoint for switching to MLflow is three trained models in production plus more than one engineer.** Today, neither holds; this file is the right artifact.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "what ML does your app do?", they're listening for three things at once: (1) can you separate pre-trained vs. trained vs. rule-based without smushing them together, (2) do you know what's actually shipped versus planned, and (3) do you understand the dependency order — which build unlocks which others. Candidates who answer with one model name fail signal (1). Candidates who name a roadmap fail signal (2) unless they explicitly say "this is planned, not shipped." Candidates who can't tell you which build comes first fail signal (3) — and that signal is the one that distinguishes senior from mid.

---

### Likely questions

**[mid] What ML is in the app today?**

Pre-trained MediaPipe pose landmarker on-device for the 33-landmark stream. A deterministic finite-state machine on top of those landmarks for rep counting — no ML, just angles plus hysteresis. Nothing else is trained ML yet; the planned classifier and recommender are in the curriculum's Phase 2C and haven't shipped.

```
  Today
  ┌─────────────┐    ┌──────────────────┐
  │ MediaPipe   │ →  │ Deterministic FSM │ → rep count
  │ (pre-trained)│   │ (angles + hyst.)  │
  └─────────────┘    └──────────────────┘
       ML                no ML
```

---

**[senior] Why a LightGBM classifier on device instead of a small neural net?**

Three reasons, in order of weight. First, the input is a 8-feature tabular vector per rep — exactly the shape gradient boosting excels at; a small neural net would over-parameterize the problem. Second, ONNX Runtime Mobile handles LightGBM with a small runtime footprint and known mobile performance; the same isn't true for ad-hoc PyTorch architectures. Third, the eval story is simpler — feature importance is interpretable, and with one user labeling their own data, interpretability matters for catching label noise.

```
  LightGBM (chosen)              Small NN (alternative)
  ─────────────────────────────  ─────────────────────────────
  Input: 8 tabular features      Input: same, but underused
  Train: minutes on a laptop     Train: hours; needs grad GPU
  Artifact: small ONNX (<1MB)    Artifact: comparable size
  Mobile runtime: ONNX RT Mobile  Mobile runtime: ONNX RT Mobile
  Interpretability: feature imp   Interpretability: needs SHAP
  Right for tabular: yes          Right for tabular: not really
```

---

**[arch] Walk me through the dependency order. Which build do you do first and why?**

`B2C.4` — the audit trail table — first. Without it, every later build is theoretical. Then `B2C.3` (feature extraction) so we have data to label. Then `B2C.6` (LR baseline) before `B2C.7` (LightGBM) because we want a baseline number to beat — skipping that is how teams ship complexity without measuring whether it earned its place. `B2C.12` (ONNX wrapper) can land in parallel because it has no model dependency. Phase 3 evals (`B3.8`, `B3.12`) start the moment the LR baseline produces its first predictions; we don't wait for LightGBM to start measuring. Phase 4 (`B4C.1–B4C.5`) starts only after the audit table has weeks of real classifier outputs to read.

```
  Dependency order (breaks first if reversed)
  ┌──────────────────────────┐
  │ B2C.4  audit trail table │  ← prereq for everything else
  └──────────┬───────────────┘
             ▼
  ┌──────────────────────────┐    ┌──────────────────────────┐
  │ B2C.3  feature extract   │    │ B2C.12 ONNX wrapper      │ ◄─ parallel-safe
  └──────────┬───────────────┘    └──────────────────────────┘
             ▼
  ┌──────────────────────────┐
  │ B2C.6  LR baseline       │  ← measure before you swap
  └──────────┬───────────────┘
             ▼
  ┌──────────────────────────┐    ┌──────────────────────────┐
  │ B2C.7  LightGBM swap     │ ── │ B3.8   eval harness      │
  └──────────┬───────────────┘    └──────────────────────────┘
             ▼
  ┌──────────────────────────┐
  │ B4C.1–B4C.5  coaching    │  ← only after weeks of audit
  │              agent       │     data exist
  └──────────────────────────┘
```

---

### The question candidates always dodge

**"You don't ship any trained ML today. Why is the ML section the biggest section of your study guide?"**

Because the study guide reflects what I'm learning, not what I've shipped. Phase 2C is the next thing I'm building, and the curriculum is structured so the comprehension work happens before the implementation work, not after — the per-concept files are the spec the builds reference, not docs written after the fact. The honest answer to "what ML does your app do today?" is "pre-trained CV plus a deterministic FSM"; the honest answer to "what ML are you building toward?" is the rest of this section. A candidate who can defend the gap without flinching — who can tell the interviewer "the section is the work plan, the app is the proof artifact, and I'll have shipped the classifier in N weeks" — has more interview signal than one who pretends the planned state is shipped.

```
  What the study guide is      What the app ships today
  ──────────────────────────   ─────────────────────────────
  Per-concept files for the    MediaPipe (pre-trained)
   ML curriculum + roadmap     Deterministic FSM rep counter
   for Phase 2C–5              (no trained ML at all)
       │
       ▼ comprehension
       (this happens first)
       │
       ▼ implementation
       (B2C.4 → B2C.6 → B2C.7 → …)
       │
       ▼ proof artifact
       (the shipped app, eventually)
```

---

### One-line anchors

- "Today's ML is pre-trained CV plus an FSM rep counter; nothing else is trained yet."
- "B2C.4 — the audit trail table — is the prereq that unlocks every later phase."
- "LightGBM-over-ONNX-Mobile is the on-device-tabular default; the input shape chose it."
- "Phase 4's coaching agent reads from the classifier; it's a layer on top, not a parallel ML surface."
- "The 'three shapes' interview story is CV + trained ML + LLM agent in one production path."

---

## Validate your understanding

**Level 1 — Reconstruct the map.**
Close this file. On paper, draw a table with the columns `Feature | Status | Model type | Where it runs | Curriculum`. Fill in every row from memory — the two shipped features plus the four to six planned ones. Check your table against the "Currently shipped" + "Phase 2C" + "Phase 4 Path C" tables above. Pass: you got every row's status (shipped vs. planned) right and named at least three of the four planned-trained surfaces correctly.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds, answer: "What ML does your app do today, what are you building toward, and what's the order?" Checkpoints:
- Did you separate *pre-trained* (MediaPipe) from *trained* (nothing yet) from *rule-based* (rep counter, recommender v1)?
- Did you name B2C.4 as the prereq?
- Did you mention the on-device boundary?

If you skipped any: you described the map, you didn't internalize it.

**Level 3 — Apply to a new scenario.**
A reviewer asks: "I'm adding a drift-detection capability — which row of the map does it protect?" Answer in writing, citing the file and the row. Then open `.aipe/study-ml-workout/04-machine-learning/17-drift-detection.md` and check whether your answer matches what that file says about its scope.

**Level 4 — Defend the decision you'd change.**
Pick the biggest tradeoff above: hand-written map vs. tool-generated registry. Answer in writing: "If you were starting this project today, would you still hand-write the map? Why or why not?" Reference (a) the current scale of the project (one engineer, zero trained models shipped) and (b) the breakpoint conditions from the Tradeoffs sub-block 3.

There is no right answer. The point is specificity. "Yes, because we have no trained models in production yet, so the registry would be infrastructure-without-a-problem" is a specific defense. "No, because every serious team uses MLflow" is not — that's appeal to authority without naming this project's scale.

**Quick check — code reference test.**
Without opening any files, answer:
- Which SQLite table is the prerequisite for every later phase?
- Which JavaScript file holds the rep counter today?
- Where will the classifier's ONNX file live once it ships?

Then open the files and verify.

Pass: you named `classifier_outputs`, `src/lib/pose/rep-counter.ts`, and `assets/models/form-classifier.onnx`.

---
