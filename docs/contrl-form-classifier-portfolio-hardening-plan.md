# contrl — supervised form classifier plan

goal: give contrl a real AI-engineering signal that's a *different pillar* from blooming insights (LLM/agents). this is a classical supervised ML pipeline: pose landmarks → features → trained classifier → on-device inference → evaluated honestly. it converts contrl from "consumes a pretrained MediaPipe landmarker" (CV integration) into "I built and shipped a supervised ML model" (ML engineering).

scope discipline up front: this is phase-two work. finish blooming insights through evals first. this runs as a focused single-pillar build, not in parallel with two other threads.

---

## the crux — the label problem is the project

an interviewer's first question on any classifier is "where did your labels come from?" for form classification, that's also the hardest engineering problem, and it's where the senior signal lives. get this framing right before writing any code.

**the datasets do not contain form-quality labels.**

- **MM-Fit** — built for activity segmentation, exercise recognition, and rep counting. ships 2D/3D pose + IMU. *no good/bad-form labels.* useful only if you ever do exercise-recognition (you already do rep detection with the FSM, so low value here).
- **Fit3D / AIFit** — 3D mocap ground truth + a feedback system that works by *reference deviation* (compare trainee to trainer-learnt standards), not a labeled error classifier. its 37 exercises overlap poorly with push/pull/squat.
- **the dataset that actually fits a supervised form classifier**: the squats/lunges/planks "correct + deliberate-mistake" datasets (e.g. the EC3D-style "3D pose based feedback" work), where each rep is performed correctly and with specific labeled mistakes. squat + plank overlap your tree; pushup/pull have little labeled public data.

**plus a second, sneakier problem: domain shift.** those datasets capture pose via RGB-D / mocap. contrl infers on **MediaPipe landmarks from a phone camera**. a model trained on mocap-quality 3D poses and run on phone MediaPipe poses is being tested out of distribution — different keypoint definitions, noise, occlusion, framing. this quietly wrecks accuracy and is the kind of thing that separates "trained a model on a benchmark" from "shipped a model that works on real input."

**the design decision (pick one, defend it):**

| approach | labels needed | domain-shift risk | matches "supervised classifier" ask |
|---|---|---|---|
| **A — supervised classifier, self-collected data** | yes — you generate them | **eliminated** (train + infer on same MediaPipe pipeline) | yes ✓ |
| B — supervised classifier, public dataset | exists for squat/plank only | high (mocap → MediaPipe) | yes, but fragile |
| C — reference-deviation (AIFit-style) | none | medium | no — it's anomaly detection, not classification |

**recommendation: A.** record clean reps + deliberately-wrong reps *through contrl's own MediaPipe pipeline*, label them, train on those features. it kills domain shift (train and inference distributions are identical), gives you labels you fully understand, and is a genuinely defensible story: *"public fitness datasets are pose/recognition benchmarks without form labels and in the wrong capture distribution, so I built a small labeled set in my own inference pipeline — here's how I controlled label quality and class balance."* that paragraph alone reads as ML-mature.

use the public squat/plank mistake datasets as a **secondary validation / pretraining** signal if you want, but don't make them the training source.

---

## scope the v1 narrowly — one exercise, a few error classes

don't try to classify all of push/pull/squat at once. pick **squat** for v1 (clearest, best public-data overlap for cross-checking, and you already have squat angle math in `src/lib/pose/exercises/squat`).

predict **per-rep**, not per-frame (a rep is the natural unit, and your rep-counter FSM already segments reps). start with a small, honest label set:

- `good`
- `shallow_depth` (insufficient hip-knee flexion)
- `knee_valgus` (knees caving in)
- `heel_lift` / `forward_lean` (pick the 1–2 most detectable from landmarks)

multi-label per rep (a rep can be both shallow and knees-in), or a single quality score + the dominant error. multi-label is more useful for coaching; decide based on how much data you can label.

---

## the moat — freeze this

contrl is a working, near-shippable app. the classifier is **additive and advisory**. these do not change:

- the rep-counter FSM (`idle → ready → down → bottom → up → ready`), angle smoothing, hysteresis
- the gate state machine, progression, `MAX_LEVEL = 5`, reconstruction idempotency
- `hitTarget`-per-entry as the **cleanliness signal** for gates (your "what must not change" rule)
- the Supabase write-mostly mirror + sync invariants
- derived-state-never-synced

**critical scope rule: do NOT wire the classifier into gate progression in v1.** the form score is *coaching feedback shown to the user*, not a gate criterion. keeping a probabilistic model out of your deterministic progression logic until it's earned trust is itself the right call — and a clean thing to say in an interview ("I deliberately kept the model advisory; coupling a ~85%-accurate classifier to level-up logic would make progression feel random").

---

## phases

### phase 1 — data collection harness
- [ ] add a dev/record mode that captures the **landmark sequence per rep** (the buffered window between FSM `down` and `up`) plus a label you tag at capture time.
- [ ] collect clean + deliberately-wrong squat reps across as much variation as you can (lighting, angle, distance, a few different people if possible — variation is what generalizes).
- [ ] store as sequences of normalized landmarks + your existing per-frame angles. this is your dataset; version it.
- [ ] **track class balance from day one.** bad-form examples are rarer in the wild but you're generating them, so deliberately balance — note the real-world imbalance for your eval discussion.

### phase 2 — features
reuse the pose math you already wrote; this is a real advantage.
- [ ] per-rep features from the landmark window: min/max joint angles (hip-knee-ankle depth), angular velocity, range of motion, tempo (you compute this), left/right symmetry, knee-over-toe horizontal offset, torso angle.
- [ ] start with **aggregated per-rep features** (one feature vector per rep) before any sequence model. simple, debuggable, and a strong baseline.

### phase 3 — model (baseline first, always)
- [ ] **baseline**: logistic regression / gradient-boosted trees (XGBoost/LightGBM) on the per-rep feature vector. this is your honest floor — if a temporal model can't beat it, you don't ship the temporal model.
- [ ] **only if the baseline underperforms**: a small temporal model (1D-CNN or small LSTM) over the landmark sequence. justify the jump with numbers, not vibes.
- [ ] export to **TFLite** (you already ship TFLite via MediaPipe, so the on-device runtime is solved).

### phase 4 — evals (the differentiator, and the tie to your pivot)
this is where it stops being "I trained a model" and becomes "I engineer ML systems." it also rhymes with the blooming-insights evals work.
- [ ] **confusion matrix + per-class precision/recall.** accuracy alone is a trap with class imbalance.
- [ ] **the imbalance discussion**: report per-class numbers, note that `good` will dominate real usage, and what you'd do about it (threshold tuning, class weights).
- [ ] **the generalization test — the senior move**: hold out *a person/session you never trained on* and report the drop. cross-subject generalization is the honest measure for pose models; in-subject accuracy is near-meaningless.
- [ ] **calibration**: is a 0.8 confidence actually right ~80% of the time? matters because the score is shown to users.
- [ ] **(if you used public data) the domain-shift number**: train on public mocap poses, test on your MediaPipe captures, show the gap — this *demonstrates* why you chose self-collected data.

### phase 5 — on-device integration (advisory)
- [ ] classifier fires **after the FSM completes a rep** (the `up → ready` transition), reading the same buffered landmark window the rep counter already produces. one inference per rep — cheap.
- [ ] surface the result as coaching feedback in the workout flow (e.g. a per-rep form note / a session form summary). advisory only.
- [ ] persist the form result alongside the session (new optional field; respect the additive-migration + sync rules — new fields stay optional so older rows/snapshots validate).
- [ ] **do not** touch `hitTarget` or gate logic.

---

## what this proves (and the gap it does / doesn't fill)

- **classical supervised ML pipeline** — data → features → model → on-device inference → eval. a genuinely distinct pillar from the LLM/agent work in blooming insights.
- **ML maturity signals**: navigated label scarcity, controlled domain shift, baselined before going complex, evaluated cross-subject with a confusion matrix and calibration — the things that separate ML engineers from people who ran `model.fit()` on a clean benchmark.
- **on-device / edge ML** — TFLite inference in a real shipped RN app, latency-bounded to one inference per rep.

does **not** fill the RAG gap — that stays a separate corpus-first project (the aipe/`study.md` direction). this and that prove different things; build one at a time.

## the honest cost check

this is a real ML project, not a weekend. the data collection (phase 1) is the unglamorous bulk of the work and the part most likely to make you want to cut corners — don't, because the whole credibility of the project rests on label quality and cross-subject generalization. if you only have appetite for a slice, phases 1–4 *without* shipping (a notebook + an honest eval writeup) is already a strong portfolio artifact; phase 5 (on-device) is the cherry, not the core.
