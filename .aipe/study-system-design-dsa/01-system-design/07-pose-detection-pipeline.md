# Pose detection pipeline

**Industry name(s):** On-device CV pipeline, real-time pose estimation, mobile inference pipeline
**Type:** Industry standard

> Camera frames flow into MediaPipe's GPU-delegated pose landmarker, which emits 33 landmarks per frame at ~30fps. Each frame's landmarks pass through a per-exercise processor (averaging left/right joints, exponential smoothing, FSM update) to count reps. All on-device, no network involved.

**See also:** → [02-dsa/05-rep-counter-state-machine](../02-dsa/05-rep-counter-state-machine.md) · → [02-dsa/06-exponential-smoothing](../02-dsa/06-exponential-smoothing.md) · → on-device inference: [study-ai-engineering/08-machine-learning/13-on-device-inference](../../study-ai-engineering/08-machine-learning/13-on-device-inference.md)

---

## Why care

You're holding a phone, doing pushups. Every quarter of a second the camera grabs a frame, a neural network maps your body to 33 numbered points, and a state machine decides whether that's the bottom of a rep. The phone doesn't know what a pushup is; it knows what angles look like, and it knows when angles cross thresholds in a pattern. That's how every mobile fitness app counts reps without server help.

The pattern is an **on-device CV inference pipeline**. The shape: camera capture → native ML model inference → JS-side post-processing → app state. It belongs to the same family as Apple Visual Intelligence, Snapchat lenses, Pokémon Go's AR, and any app that runs computer vision on the device without a backend. The reasons to do it on-device — privacy, latency, offline use — are non-negotiable for fitness apps. Here's how that actually works in this codebase.

---

## How it works

A camera captures frames. A model interprets them. Code decides what they mean. Three boxes connected by arrows — but the speed each arrow has to move at is what makes this hard.

The strategy: **let the GPU do the inference, pass minimal data to JS, treat the JS as a control plane**.

### Layer 1 — Camera capture (native)

`react-native-vision-camera` provides the camera, and `react-native-mediapipe-posedetection` is a wrapper that pipes frames through MediaPipe's `pose_landmarker_lite.task` model. Configuration in `PoseCamera.tsx` L69–L76:

```typescript
const solution = usePoseDetection(callbacks, RunningMode.LIVE_STREAM, POSE_MODEL, {
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  delegate: Delegate.GPU,
  mirrorMode: 'mirror-front-only',
});
```

`Delegate.GPU` is the critical line. MediaPipe runs the pose model on the GPU instead of the CPU — on Android with a Mali or Adreno GPU that's the difference between ~30fps inference and ~5fps inference. The CPU path is the fallback if the GPU isn't available.

If you're coming from frontend, this is like the difference between `requestAnimationFrame` (which gets GPU vsync) and `setInterval(16)` (which doesn't) — except the work is matrix math, not paint commands.

### Layer 2 — Result callback (the JS boundary)

```typescript
onResults: useCallback((result: PoseDetectionResultBundle) => {
  if (result.results.length > 0 && result.results[0].landmarks.length > 0) {
    const rawLandmarks = result.results[0].landmarks[0];
    const landmarks: Landmark[] = rawLandmarks.map((lm: MPLandmark) => ({
      x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility ?? 0,
    }));
    onLandmarks(landmarks);
  }
}, [onLandmarks]);
```

`PoseCamera.tsx` L44–L62. The native side fires `onResults` for every processed frame. The callback runs on the JS thread. It maps the native `MPLandmark[]` to the codebase's domain `Landmark[]` type and passes them to the parent.

The bridge cost here is real but bounded: a 33-element array of `{x, y, z, visibility}` is 528 bytes per frame, plus the function call overhead. At 30fps that's ~16 KB/sec across the bridge — well under the threshold that would cause jank.

The practical consequence: the JS thread sees a steady stream of landmark arrays. The native thread does the heavy lifting; JS only has to decide what to *do* with the landmarks.

### Layer 3 — Per-exercise processor (in JS)

```typescript
const shoulder = averageLandmarks(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER]);
const elbow    = averageLandmarks(landmarks[POSE.LEFT_ELBOW],    landmarks[POSE.RIGHT_ELBOW]);
const wrist    = averageLandmarks(landmarks[POSE.LEFT_WRIST],    landmarks[POSE.RIGHT_WRIST]);

const rawAngle = calculateAngle(shoulder, elbow, wrist);
smoothedAngle = smoothAngle(rawAngle, smoothedAngle, SMOOTHING_FACTOR);
const result = counter.update(smoothedAngle);
```

`src/lib/pose/exercises/pushup.ts` L23–L36. Three steps per frame:

1. **Average left + right joints.** A pushup is symmetric — the model gives left and right elbow separately, but the rep angle is "elbow angle" so we average. This also cancels lateral camera bias.
2. **Smooth the angle.** Raw landmark data is jittery. `smoothAngle(raw, prev, 0.4)` is exponential smoothing — output is 40% of the new value + 60% of the previous smoothed value. The result is jitter-free without losing real motion.
3. **Update the FSM.** `RepCounter.update(angle)` (`src/lib/pose/rep-counter.ts` L31) runs the state machine: `idle → ready → down → bottom → up → ready (count++)`.

If you're coming from frontend, this is like a controlled input where every keystroke runs through a debounce + validation chain before updating state. Here, every frame runs through average + smooth + FSM before updating the rep count.

### Layer 4 — Per-exercise FSM with hysteresis

```typescript
case 'down':
  if (angle <= bottomAngle + hysteresis) this.phase = 'bottom';
  else if (angle >= readyAngle) this.phase = 'ready';
  break;
case 'bottom':
  if (angle > bottomAngle + hysteresis) this.phase = 'up';
  break;
case 'up':
  if (angle >= readyAngle - hysteresis) {
    this.count++;
    this.phase = 'ready';
  }
  break;
```

`src/lib/pose/rep-counter.ts` L36–L72. The FSM has 5 states (`idle → ready → down → bottom → up`) and 10° hysteresis at every threshold. Hysteresis prevents counter-jitter at boundary angles: if the angle hovers at exactly the `bottomAngle = 90°`, the FSM doesn't flicker between `down` and `bottom` — it requires the angle to drop *below* 80° (90 - 10) to enter `bottom`, and rise *above* 100° to leave it.

The practical consequence: a person stuck mid-rep at the boundary doesn't accidentally count multiple reps. The cost: very-shallow reps may not be counted.

### Layer 2.5 — Different exercises, same shape

Each exercise has its own processor in `src/lib/pose/exercises/`:

- **pushup.ts** — shoulder-elbow-wrist angle, ready=160°, bottom=90°
- **squat.ts** — hip-knee-ankle angle, ready=160°, bottom=90°
- **plank.ts** — shoulder-hip-ankle alignment, deviation from 180° must be ≤ 15° to count as "holding"; accumulates hold time
- **pull.ts** — dispatches to `bar`, `trx-incline`, `trx-vertical`, `trx-horizontal`, or `trx-hold` variants based on exercise ID

The pattern is consistent: pick joints by `POSE.*` index, average symmetric pairs, calculate angle, smooth, update FSM. Adding a new exercise is a ~50-line file.

### Move 3 — The principle

Mobile CV looks intimidating from the outside (neural networks! 33 landmarks! 30fps!) but the architecture is mundane: native does the inference, JS does the control logic, the bridge between them is narrow and slow enough that it doesn't matter. The same shape applies to face filters, body tracking, gesture detection — every on-device CV app is some variation on this pipeline.

The full picture is below.

---

## Pose detection pipeline — diagram

```
┌─ Hardware ──────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   Camera (front or back)                                                            │
│      │  raw frames @ 30+fps                                                         │
│      ▼                                                                              │
│   GPU (Adreno / Mali / Apple)                                                       │
│                                                                                     │
└────────┬────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Native layer (react-native-mediapipe-posedetection) ──────────────────────────────┐
│                                                                                     │
│   MediaPipe runtime + pose_landmarker_lite.task                                     │
│   Delegate.GPU                                                                      │
│   numPoses: 1, confidence thresholds: 0.5                                           │
│   mirrorMode: 'mirror-front-only'                                                   │
│      │                                                                              │
│      │  33 landmarks per detected pose                                              │
│      ▼                                                                              │
│   onResults callback (RN bridge)                                                    │
│                                                                                     │
└────────┬────────────────────────────────────────────────────────────────────────────┘
         │  ~528 bytes per frame
         ▼
┌─ JS layer (per-frame, on the UI thread) ───────────────────────────────────────────┐
│                                                                                     │
│   PoseCamera.onLandmarks(landmarks)                                                 │
│      │                                                                              │
│      ▼                                                                              │
│   per-exercise processor.processFrame(landmarks)                                    │
│      ┌─ pushup ──────────────────────────────────────────────────────────────┐      │
│      │ shoulder = avg(L_SHOULDER, R_SHOULDER)                                │      │
│      │ elbow    = avg(L_ELBOW,    R_ELBOW)                                   │      │
│      │ wrist    = avg(L_WRIST,    R_WRIST)                                   │      │
│      │ rawAngle = calculateAngle(shoulder, elbow, wrist)                     │      │
│      │ smoothedAngle = smoothAngle(raw, prev, 0.4)                           │      │
│      │ RepCounter.update(smoothedAngle)                                      │      │
│      │   FSM: idle → ready → down → bottom → up → ready, count++             │      │
│      │   hysteresis 10° at every transition                                  │      │
│      └───────────────────────────────────────────────────────────────────────┘      │
│      │                                                                              │
│      ▼                                                                              │
│   SetCameraOverlay / SkeletonOverlay / HUD                                          │
│      paint skeleton, current angle, current rep count                               │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Camera capture:** `src/components/camera/PoseCamera.tsx` L69 (MediaPipe config) · L44 (results callback)
**Skeleton overlay:** `src/components/camera/SkeletonOverlay.tsx`
**Per-exercise processors:** `src/lib/pose/exercises/{pushup,squat,plank,pull,pull-bar,pull-trx}.ts`
**Angle math:** `src/lib/pose/angles.ts` (calculateAngle L7, smoothAngle L21, averageLandmarks L25)
**FSM:** `src/lib/pose/rep-counter.ts` L21
**Landmark constants:** `src/lib/pose/landmarks.ts` (POSE indices L13)

Configuration constants per exercise:
- pushup: `{ readyAngle: 160, bottomAngle: 90, hysteresis: 10 }` smoothing 0.4
- squat: same as pushup, different joints
- plank: alignment ≤ 15° deviation from 180°
- pull (TRX): per-orientation thresholds in `pull-trx.ts`

---

## Elaborate

### Where this pattern comes from

MediaPipe (Google, 2019) productized what had previously been research-grade pose models. Before MediaPipe you'd train your own pose model or pay Vision API services. MediaPipe ships the model, the inference runtime, and the GPU delegate as one library — every app since 2021 that has on-device pose is some variation of "MediaPipe + glue code".

### The deeper principle

Native does the work the GPU is good at; JS does the work the GPU is bad at. Image processing, matrix math, neural network inference — GPU. Control flow, state, business logic — JS. The bridge between them stays narrow (numbers and small arrays, not images). This separation of concerns is what makes any on-device ML pipeline fast.

### Where this breaks down

Multi-person scenes (numPoses: 2+) increase inference cost approximately linearly with person count. At 4 people the GPU starts losing fps. Heavily occluded poses produce low-confidence landmarks; the FSM doesn't currently filter on confidence, so a hidden joint could produce a bogus angle. The visibility field is read into the domain type but not consulted in the rep counter — a future improvement.

The other breakpoint: pose-based rep counting is *only* accurate for well-formed reps. A user doing half-pushups will trigger the FSM less consistently. The Phase 2C ML curriculum item (form classifier) is the natural extension that solves this.

### What to explore next

- [02-dsa/05-rep-counter-state-machine](../02-dsa/05-rep-counter-state-machine.md) → the FSM in detail
- [02-dsa/06-exponential-smoothing](../02-dsa/06-exponential-smoothing.md) → why smoothing matters
- [study-ai-engineering/08-machine-learning/02-feature-engineering-from-pose](../../study-ai-engineering/08-machine-learning/02-feature-engineering-from-pose.md) → the future of these landmarks

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ On-device GPU pipeline (taken)   │ Cloud inference API (alternative) │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Latency per frame  │ ~10–30ms (GPU inference)         │ 200–800ms (round-trip)            │
│ Frame rate         │ ~30fps                           │ <5fps practical                   │
│ Privacy            │ Frames never leave device        │ Frames uploaded                   │
│ Offline use        │ Full                             │ None                              │
│ Bandwidth          │ Zero                             │ 0.5–2 Mbps for video stream       │
│ Battery cost       │ GPU sustained (warm)             │ Network sustained (more)          │
│ Cost per session   │ $0                               │ Per-frame inference $$$           │
│ Model size in app  │ ~5–15 MB (`.task` files)         │ Zero                              │
│ Multi-person       │ Linear in poses                  │ Same on server                    │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is the model bundled with the app. `pose_landmarker_lite.task` is ~5MB; the full task file lives in `models/`. Every download of the app carries this; updating the model means shipping a new app version. We can't do A/B testing on different models without a release cycle.

The second cost is on-device variability. A flagship phone runs at 30+fps; a mid-tier Android phone might struggle to hold 20fps. The FSM is tolerant (it doesn't assume any particular frame rate) but very low fps means missed reps if the user moves through bottom-position faster than the camera captures a frame at the threshold.

A third cost: the GPU delegate isn't universally available. The fallback path (CPU inference) runs but is much slower. The codebase doesn't currently surface this fact to the user.

### Sub-block 2 — what cloud inference would have cost

If we sent frames to a cloud pose API (e.g., Google Cloud Vision, AWS Rekognition Custom Labels), the user's privacy story would change immediately — workout videos uploaded to a third party. The latency would make real-time rep counting infeasible: even 200ms round-trip is too slow for "did the user just hit the bottom of a squat?" feedback. Bandwidth would matter: at 480p30 a video stream is ~1.5 Mbps, which on cellular costs the user money and the app reliability.

Cost would also scale per-frame: at $0.01/inference (Vision API list price) × 30fps × 60 seconds/set × 5 sets × 5 sessions/week × N users, the cloud bill would dwarf the alternative even at modest user counts.

### Sub-block 3 — the breakpoint

Fine until **multi-person scene tracking** becomes a feature (e.g., partner workouts), at which point GPU inference cost climbs linearly with detected poses. At 4 people the inference time exceeds the frame interval and FPS drops. The fix is either a heavier model that natively handles multi-person more efficiently (MediaPipe Holistic or YOLO-Pose) or accepting a lower frame rate.

The other breakpoint is **a serious form-classification feature**. Rep counting from angles is good enough for "did you hit depth?". Classifying *form errors* (elbow flare, knee valgus, hip sag) requires a trained classifier on top of the landmarks — not pure FSM logic. The curriculum's Phase 2C is the planned answer; today we ship rep counting only.

### Sub-block 4 — what wasn't actually a tradeoff

Apple's Vision framework / Google's ML Kit are alternatives, but both lock the app to one platform. MediaPipe runs the same model on both Android and iOS with one codebase — for a cross-platform Expo app that's worth the dependency.

---

## Tech reference (industry pairing)

### react-native-vision-camera + react-native-mediapipe-posedetection

- **Codebase uses:** `react-native-vision-camera` for camera access; `react-native-mediapipe-posedetection` for the inference wrapper. Camera setup in `PoseCamera.tsx` L69.
- **Why it's here:** the camera + ML stack that delivers GPU inference at 30fps with one cross-platform codebase.
- **Leading today:** `react-native-vision-camera` + MediaPipe — `adoption-leading` for cross-platform CV on RN, 2026.
- **Why it leads:** maintained, GPU delegate works on both platforms, Frame Processors API (worklets) for low-latency native-side processing if needed.
- **Runner-up:** Native iOS Vision + Android ML Kit via per-platform bridges — `innovation-leading` for apps that need platform-specific tuning; double the code.

### MediaPipe pose_landmarker_lite

- **Codebase uses:** `pose_landmarker_lite.task` bundled in `models/`.
- **Why it's here:** the model that maps a frame to 33 landmarks. Lite variant balances size (~5MB) with accuracy (good for fitness use cases).
- **Leading today:** MediaPipe pose landmarker — `adoption-leading` for on-device pose, 2026.
- **Why it leads:** Google-maintained, Mobile-optimized, BlazePose architecture, runs at 30+fps on GPU.
- **Runner-up:** YOLOv8-Pose — `innovation-leading` for multi-person scenes and stronger accuracy; larger model, more battery cost.

---

## Summary

### Concept recap

`PoseCamera.tsx` configures MediaPipe with GPU delegation, single-pose detection, and 50% confidence thresholds. The native runtime feeds raw frames into `pose_landmarker_lite.task` and fires `onResults` with 33 landmarks per detected pose. The JS callback maps to domain types and hands them to a per-exercise processor (`src/lib/pose/exercises/*.ts`), which averages symmetric joints, exponentially smooths the relevant angle, and runs a 5-state FSM with 10° hysteresis to count reps. The constraint forcing this design was real-time inference at 30fps with no network and full privacy. The cost paid is per-app model size (~5MB) and on-device variability across phones.

### Key points

- Lives in step 2 (Request flow) of the system-design checklist.
- GPU delegation is the difference between 30fps and 5fps.
- 528 bytes per frame across the RN bridge — narrow enough to be free.
- Every exercise has the same shape: average joints → calculate angle → smooth → update FSM.
- Hysteresis (10°) prevents counter-jitter at threshold boundaries.
- Privacy is a side effect of the architecture; frames never leave the device.

---

## Interview defense

### What an interviewer is really asking

Behind "how does the rep counter work" is "do you understand the full pipeline — from camera capture to UI update — or just the JS slice?" The interviewer wants to hear you describe the GPU work, the bridge cost, the FSM rationale, and the failure modes in one coherent story.

### Likely questions

**Q: What's in the pipeline from camera frame to rep count?  [mid]**
A: A camera frame goes through MediaPipe on the GPU and returns 33 landmark points (x, y, z, visibility). The native runtime fires `onResults`, which crosses the JS bridge and lands in `PoseCamera`. The per-exercise processor averages symmetric joints (left + right shoulder, etc.), computes the relevant angle (shoulder-elbow-wrist for pushups), exponentially smooths it, and feeds it to a 5-state FSM with 10° hysteresis. The FSM counts a rep on the `up → ready` transition.

```
camera → GPU inference → 33 landmarks → JS bridge
                                          │
                                          ▼
                          processFrame: average → angle → smooth → FSM
                                                                     │
                                                                     ▼
                                                                  rep count++
```

**Q: Why exponential smoothing — why not a moving average?  [senior]**
A: Exponential smoothing is constant-memory (one `previous` value) and gives more weight to recent samples — which is what we want for motion. A 10-sample moving average requires keeping a buffer, costs more per-frame, and adds latency (the output lags by N/2 samples). Exponential smoothing with α=0.4 is responsive enough that the FSM transitions at the right time and smooth enough to suppress single-frame noise. The factor 0.4 was picked empirically — α=0.8 was too jittery, α=0.2 was too laggy.

```
   Exponential (taken)                   │   Moving average (alternative)
   ────────────────────────────────────  │   ────────────────────────────────
   O(1) memory: 1 value                  │   O(N) memory: buffer of N
   responsive to recent change            │   lags by N/2 samples
   one param to tune (α)                  │   one param to tune (N)
   no warm-up beyond first frame          │   warm-up over first N frames
```

**Q: What happens at 60fps capture and a 30fps phone?  [arch]**
A: The native runtime is rate-limited by inference time, not by frame capture. If inference takes ~33ms (30fps budget), frames captured at 60fps that arrive during inference are simply dropped — `RunningMode.LIVE_STREAM` doesn't queue. The FSM doesn't assume any particular frame rate, so missed frames just mean less granular angle sampling. The danger is at the *bottom* of a fast rep, where a missed frame at the boundary angle means the FSM never sees the `bottom` transition. In practice this is rare; users who care about depth-accuracy slow down.

```
┌─ at 60fps capture, ~30fps inference ─────────────────────────────────┐
│  frames captured       60                                            │
│  frames inferred       ~30  ←─ inference is the bottleneck           │
│  dropped frames        ~30  (handled silently by LIVE_STREAM)        │
│  FSM danger            missing the bottom transition on a fast rep   │
└──────────────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What happens when a landmark has very low `visibility` (occluded joint) and you use it anyway?**
A: Today, nothing — the FSM doesn't read `visibility`, so a low-visibility wrist produces a noisy `calculateAngle` output that gets fed into the smoother and the FSM. The smoother absorbs some noise but a fully occluded joint is a steady wrong angle, which can prematurely trigger transitions or miss them. The mitigation would be to abort the frame's update if average visibility on the relevant joints is below a threshold (e.g., 0.5), keeping the previous smoothed angle. We surface average visibility on screen as a confidence badge but don't gate the FSM on it. This is a known gap.

```
   Picked (no visibility check)         │   Alternative (visibility gate)
   ─────────────────────────────────── │ ────────────────────────────────────
   every frame updates the FSM         │   skip if confidence below threshold
   noise tolerated by smoother (α=0.4) │   skip frame keeps last angle
   occluded → FSM may misfire          │   occluded → FSM pauses (correct)
   simple                              │   one extra threshold to maintain
```

### One-line anchors

- GPU does the work; JS does the decisions.
- 33 landmarks per frame, 528 bytes per crossing.
- Hysteresis is what kills the jitter.
- Privacy is a side effect of putting the model on-device.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the four layers (hardware, native, JS, UI). Mark where the GPU work happens and where the FSM lives.

### Level 2 — Explain it out loud
Explain to a frontend engineer how the rep counter works, end to end. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"You're asked to add a `dead-hang` exercise that counts seconds the user can hold a bar with straight arms (elbow angle > 160°)." What processor structure would you write?

Reference `src/lib/pose/exercises/plank.ts` for the "hold timer" pattern.

### Level 4 — Defend the decision you'd change
"Would you ever move inference to a server (e.g., a partner workout that compares to a coach's reference)?" Walk through the cost-benefit table.

### Quick check — code reference test
- What file holds the MediaPipe configuration?
- What's the smoothing factor for pushups?
- What's the file path for `RepCounter`?

Then verify.

---
Updated: 2026-05-29 — Redirected two stale `04-machine-learning/` links (See also + What to explore next) to the study-ai-engineering companion guide where ML content now lives. All source line refs (PoseCamera L44/L69, pushup L23–36, rep-counter L21/L31/L36–72, angles L7/L21/L25, landmarks L13) verified accurate — no line drift.
