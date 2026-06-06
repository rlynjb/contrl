# 02 — On-device ML pipeline

### On-device inference · frame-processor worklet · edge ML — Industry standard

> The architectural choice that the only ML inference contrl runs (MediaPipe pose detection) happens entirely on the device, with the model file bundled and camera frames never crossing the device boundary. This is a system-design property, not a vendor choice: it constrains privacy, latency, cost, and connectivity in load-bearing ways.

**Load-bearing test (passes):** strip this out — push frames to a cloud inference endpoint instead — and you lose: (1) privacy (workout video would upload), (2) latency tolerance (30 fps over a network is unreasonable), (3) offline operation (no gym signal = no rep counter), (4) zero per-inference cost (cloud inference is metered). Any one of those alone would be a load-bearing capability lost.

## Zoom out, then zoom in

Most "AI in an app" today means: client → cloud LLM/CV endpoint → response. That's the path contrl will take for the Phase 4 coaching agent (which is fine — coaching is low-frequency, async, latency-tolerant). It is **not** the path contrl takes for rep counting, because rep counting is high-frequency (30 fps), latency-intolerant (the rep number must update visually before the next rep starts), and privacy-sensitive (the camera sees the user).

```
  Zoom out — the inference-placement choice

  ┌─ Typical cloud-ML ──────────────────┐  ┌─ contrl pose pipeline ─────────┐
  │  camera                              │  │  camera                         │
  │   │                                  │  │   │                             │
  │   ▼ upload frame (privacy boundary!) │  │   ▼ worklet thread (in process) │
  │  cloud inference                     │  │  MediaPipe (bundled .task)      │
  │   │                                  │  │   │                             │
  │   ▼ ~100-500ms latency               │  │   ▼ ~10-30ms latency             │
  │  result                              │  │  landmarks                      │
  │                                      │  │   │                             │
  │  cost: per inference billed          │  │   ▼                             │
  │  privacy: frames leave device        │  │  FSM rep counter                │
  │  offline: broken                     │  │   │                             │
  └──────────────────────────────────────┘  │   ▼                             │
                                            │  rep count                       │
                                            │                                  │
                                            │  cost: zero per inference        │
                                            │  privacy: nothing leaves device  │
                                            │  offline: fully functional        │
                                            └──────────────────────────────────┘
```

Zoom in. In contrl this means: `src/components/camera/PoseCamera.tsx` runs MediaPipe inside a vision-camera **frame processor worklet** (a separate worker thread). The bundled `.task` model file ships with the app build. Landmarks come back via `runOnJS(...)` to the JS thread, where pure-function code in `src/lib/pose/` extracts angles, smooths, and feeds the FSM rep counter. **No HTTP call, no upload, no remote endpoint.**

## Structure pass

**Layers** — Camera hardware → vision-camera frame processor (worklet thread) → MediaPipe (worklet) → JS thread (angles + FSM) → UI overlay.

**Axis traced — privacy + latency simultaneously** (where does the frame go, and how long does the round-trip take?).

```
  Tracing the privacy + latency axis

  layer            frame visible?         latency budget per frame
  ─────            ───────────────         ───────────────────────
  Camera hw         yes (device-internal)  0 (hardware)
  vision-camera     yes (worklet memory)   1-3 ms
   frame processor
  MediaPipe         yes (model input)      5-20 ms (GPU/CPU delegate)
   inference
  Landmarks         no — just numbers       crossing thread: ~1 ms
   (JS-thread cb)
  Angles + FSM      no                      sub-ms
  Render            no — number on screen    React commit: ~5-15 ms

  total: ~12-40 ms per frame, well under the 33 ms (30 fps) budget.
  the entire pipeline stays inside the device process. nothing crosses
  to network at any point.
```

**Seam that matters (where the axis would flip if you changed the architecture):** the **frame → MediaPipe** seam. Today the seam is in-process worklet → bundled model. If anyone ever moved MediaPipe to a remote inference endpoint, frames would cross the device boundary at this seam, and every property the architecture buys (privacy, latency, offline) would invert at the same instant. *This is the seam to defend.*

**Secondary seam: worklet thread → JS thread.** `runOnJS` carries the *landmarks* (numeric tuples), not the frame. This is where the data-volume axis flips — frames are megabytes, landmarks are kilobytes — so the threading boundary is also the data-reduction boundary. Worth knowing for performance ([see study-performance-engineering](../study-performance-engineering/) once that audit lands).

## How it works

### Move 1 — the mental model

You already know "in-process compute over a stream" from any audio/video processing library — Web Audio API, ffmpeg piping, OpenCV. The pattern is: a producer (camera, mic) emits a stream; consumers transform the stream in-process; the result is a tiny derived value, not the raw stream. **Inference is just one transformer in the pipeline.**

```
  Pattern — in-process inference over a frame stream

  ┌─ camera ────────────────────────────────────────────────────────────┐
  │  ~30 fps frames                                                      │
  └────────────────┬─────────────────────────────────────────────────────┘
                    │  worklet thread (separate JS context, off main)
  ┌─ Frame Processor (vision-camera) ──────────────────────────────────┐
  │  per frame:                                                          │
  │    let landmarks = MediaPipe.detect(frame)        ← bundled model    │
  │    if landmarks.length > 0:                                          │
  │      runOnJS(onLandmarks)(landmarks[0])           ← cross threads    │
  │  drop the frame; never persisted                                     │
  └────────────────┬─────────────────────────────────────────────────────┘
                    │  ~33 ms later, next frame
                    ▼
  ┌─ JS thread (the rest of the app) ───────────────────────────────────┐
  │  onLandmarks: extract angles, smooth, feed FSM, emit rep events     │
  │  no network. no persistence of frames. tiny CPU footprint.          │
  └─────────────────────────────────────────────────────────────────────┘
```

### Move 2 — the mechanism, walked

**Step 2.1 — the camera produces frames on a worklet thread.**

```
  // src/components/camera/PoseCamera.tsx (approximate)
  const poseDetector = usePoseDetector({
    modelPath: bundledModelFile,           // ← bundled .task; no remote fetch
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';                              // ← this body runs OFF the JS thread
    const result = poseDetector.detectFor(frame);
    if (result.results.length > 0) {
      runOnJS(onLandmarks)(result.results[0].landmarks);
    }
  }, [poseDetector]);

  // <Camera frameProcessor={frameProcessor} ... />
```

Two threading facts compound here:

1. **The frame never leaves the worklet thread.** Frames are large (RGB888 at 1080p = ~6 MB per frame); shipping them across threads or processes is expensive. Keeping them in the worklet lets MediaPipe consume the frame directly from camera-buffer memory.
2. **Landmarks (the result) DO cross to the JS thread.** They're small (~33 landmarks × 4 floats = ~132 bytes per detection). `runOnJS` marshals them; this is cheap.

**Step 2.2 — landmarks become angles on the JS thread.**

```
  // src/lib/pose/exercises/pushup.ts (the per-exercise classifier)
  export function createPushupProcessor() {
    let smoothedAngle = 0;
    let initialized = false;
    return {
      feed(landmarks: Landmark[]) {
        const shoulder = landmarks[SHOULDER_IDX];
        const elbow    = landmarks[ELBOW_IDX];
        const wrist    = landmarks[WRIST_IDX];
        const raw      = calculateAngle(shoulder, elbow, wrist);
        smoothedAngle  = initialized
          ? alpha * raw + (1 - alpha) * smoothedAngle
          : raw;
        initialized = true;
        return { angle: smoothedAngle };
      },
    };
  }
```

Pure functions over numeric inputs. No I/O. Trivially testable in isolation (drill writeup at `.aipe/drills/evals-pose-accuracy.md`).

**Step 2.3 — angles drive the FSM.**

```
  // src/lib/pose/rep-counter.ts (the 5-phase FSM)
  export class RepCounter {
    private phase: 'idle' | 'ready' | 'down' | 'bottom' | 'up' = 'idle';
    private prevAngle: number = 0;

    feed(angle: number): RepEvent | null {
      // transitions:
      // ready → down  when angle < downThreshold
      // down  → bottom when angle reverses direction
      // bottom → up    when angle > upThreshold
      // up    → ready  when angle > restThreshold  → emit { kind: 'rep' }
      // hysteresis dead-zone around each threshold
      // ...
    }
  }
```

Closed-state FSM. Per-exercise config sets the thresholds. The FSM has no awareness of the model, the camera, or the device — it just consumes angles and emits rep events. **This separation is what makes the pipeline portable** (you could swap MediaPipe for another pose model tomorrow without touching the rep counter).

**Step 2.4 — rep events bubble to the UI overlay.**

```
  // src/components/camera/SetCameraOverlay.tsx (approximate)
  function onLandmarks(landmarks) {
    const { angle } = processor.feed(landmarks);
    const event = counter.feed(angle);
    if (event?.kind === 'rep') {
      setRepCount(c => c + 1);
    }
  }
```

The visible rep counter on the HUD is just React state. Set boundary detection (user taps "finish set" or auto-detects rest) emits a session payload to `useGameState.logSession(...)`.

### Move 2 variant — the load-bearing skeleton of "on-device ML pipeline"

```
  Skeleton — what makes it on-device (not just "ML in the app")

  1. THE MODEL IS BUNDLED
       file ships with the app build; no remote fetch; no version drift
       between client and a server-side model.

  2. INFERENCE RUNS IN PROCESS, NOT OVER NETWORK
       device CPU/GPU does the math. no upload, no endpoint, no auth
       boundary for inference.

  3. THE FRAME NEVER CROSSES THE DEVICE BOUNDARY
       this is the privacy property. only derived values (landmarks,
       angles, rep counts) leave the worklet, and even those don't
       leave the device.

  4. THE PIPELINE IS A CHAIN, NOT AN AGENT
       deterministic step graph: camera → MediaPipe → angles → FSM.
       no LLM decides what step comes next. no autonomy in the loop.
       this is the right framing per study-agent-architecture:
       the engineer wrote every step; nothing decides at runtime.
```

Drop #1 (model remote-fetched at runtime) — works online, breaks offline; introduces a supply-chain attack surface. Drop #2 (inference goes to a cloud endpoint) — loses privacy, latency, offline, and zero-cost. Drop #3 (frames upload for any reason — debug logging, analytics) — privacy invariant broken; trust topology inverts. Drop #4 (LLM in the loop deciding pipeline steps) — wrong tool for a 30 fps real-time job; coaching agent properly stays in a separate, async, low-frequency path.

### Move 3 — the principle

> Place ML inference where the data already lives. Frames are big and private; rep counts are small and useful. Move the small thing across boundaries, not the big private thing. This is a data-locality principle that compounds with privacy, latency, cost, and offline behavior — getting it right once gets you all four.

## Primary diagram

```
  The on-device ML pipeline, the whole picture

  ╔════════════════════════════════════════════════════════════════════════╗
  ║                          ON DEVICE — NEVER LEAVES                       ║
  ║                                                                          ║
  ║  Camera hardware                                                        ║
  ║       │ ~30 fps raw frames                                              ║
  ║       ▼                                                                  ║
  ║  ┌─ vision-camera frame processor (worklet thread) ───────────────┐    ║
  ║  │                                                                  │    ║
  ║  │   PoseCamera.tsx — useFrameProcessor(({ frame }) => {            │    ║
  ║  │     'worklet';                                                    │    ║
  ║  │     const result = poseDetector.detectFor(frame);                │    ║
  ║  │     if (result.results.length) {                                  │    ║
  ║  │       runOnJS(onLandmarks)(result.results[0].landmarks);         │    ║
  ║  │     }                                                              │    ║
  ║  │   })                                                              │    ║
  ║  │                                                                    │    ║
  ║  │   ★ MediaPipe model is a BUNDLED .task file in the build.        │    ║
  ║  │     no remote fetch. no version drift. ships with the APK.        │    ║
  ║  │   ★ frame is consumed in worklet memory and dropped.             │    ║
  ║  └────────────────────┬─────────────────────────────────────────────┘    ║
  ║                        │ runOnJS — crosses thread boundary               ║
  ║                        │ payload: just landmarks (numeric tuples)        ║
  ║                        ▼                                                  ║
  ║  ┌─ JS thread — src/lib/pose/* ─────────────────────────────────────┐    ║
  ║  │                                                                    │    ║
  ║  │   exercises/<exercise>.ts: extract 3-landmark angles               │    ║
  ║  │   angles.ts: calculateAngle, smoothAngle (EMA alpha ~0.4)          │    ║
  ║  │   rep-counter.ts: 5-phase FSM, hysteresis                          │    ║
  ║  │                                                                    │    ║
  ║  │   ★ pure functions. no I/O. deterministic given angles.           │    ║
  ║  │   ★ trivially testable with fixture landmark sequences            │    ║
  ║  │     (drill: .aipe/drills/evals-pose-accuracy.md)                  │    ║
  ║  └────────────────────┬─────────────────────────────────────────────┘    ║
  ║                        │ RepEvent { kind: 'rep' }                         ║
  ║                        ▼                                                  ║
  ║  ┌─ UI overlay ─────────────────────────────────────────────────────┐    ║
  ║  │   SetCameraOverlay.tsx — visible rep counter                     │    ║
  ║  │   SetCameraHUD.tsx — debug info                                  │    ║
  ║  │   set boundary detection → useGameState.logSession(session)       │    ║
  ║  └─────────────────────────────────────────────────────────────────┘    ║
  ║                                                                          ║
  ║  ★ NOTHING in this stack crosses to network during inference.           ║
  ║  ★ NOTHING is uploaded for analytics, debug, or telemetry.              ║
  ║  ★ The privacy invariant is: frames stay in worklet memory; only         ║
  ║    derived rep counts persist (in SQLite, eventually mirrored to cloud). ║
  ║                                                                          ║
  ╚════════════════════════════════════════════════════════════════════════╝

  The only thing that EVER leaves the device is the *rep count* (and other
  session metadata: exercise, sets, dates). The video itself never leaves.
  This is the architectural reading of "on-device ML."
```

## Implementation in codebase

### Use cases

This pipeline is reached for every time the user is in a set:

- **Pushup set** — `createPushupProcessor()` extracts shoulder-elbow-wrist angle; FSM transitions on the angle crossing the down/bottom/up thresholds.
- **Squat set** — `createSquatProcessor()` uses hip-knee-ankle; same FSM kernel, different thresholds.
- **Plank hold** — different shape: a HOLD timer rather than a rep counter; same on-device principle.
- **Set boundary detection** — when the FSM stays in `ready` (no rep transitions) for N seconds, the set is considered complete; SetCameraOverlay emits a session payload up to `useGameState`.

### Code, side-by-side

```
  src/components/camera/PoseCamera.tsx (~line 44-61)

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';                                       ← this directive moves
                                                       the body to the worklet
                                                       thread; the body cannot
                                                       reference closures from
                                                       the JS context.
    const result = poseDetector.detectFor(frame);    ← inference happens here,
                                                       on the worklet thread,
                                                       against the bundled model.
    if (result.results.length > 0) {                 ← guard: no detection
                                                       this frame → no event.
      runOnJS(onLandmarks)(                          ← cross threads. payload
        result.results[0].landmarks                    is the LANDMARKS array,
      );                                                not the frame.
    }
  }, [poseDetector]);
       │
       └─ the 'worklet' directive + runOnJS pattern is the SHAPE of "frame
          stays here; only the derived value crosses." this is the privacy
          architecture in literal code.

  src/lib/pose/angles.ts (calculateAngle, the pure-math anchor)

  export function calculateAngle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAb = Math.hypot(ab.x, ab.y);
    const magCb = Math.hypot(cb.x, cb.y);
    const cos = magAb && magCb ? dot / (magAb * magCb) : 1;
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  }
       │
       └─ no model, no state, no I/O. just numerics. THIS is what the JS
          thread does — turn landmarks into degrees, feed the FSM. it's
          incidental to "ML" — the ML happened upstream on the worklet.
```

**Where to verify the no-upload claim:** open `PoseCamera.tsx` and search for any `fetch`, `axios`, `supabase.from`, or `runOnJS`-of-anything-network. There are none. The only thing crossing the worklet boundary is landmark data, and it goes to a JS-side function (`onLandmarks`) that's local. The worklet's only output is landmarks; the worklet has no network code.

## Elaborate

The historical reading: on-device ML used to be a constraint (no signal, no inference) and is now a design choice (Apple Neural Engine, Hexagon DSP, Google's Edge TPU, mobile MediaPipe builds). The shift means you can choose where inference happens based on **what the application needs**, not on what's feasible. For high-frequency, latency-intolerant, privacy-sensitive workloads (gesture recognition, AR overlays, real-time captioning, on-device speech), on-device is now the right default. For low-frequency, latency-tolerant, knowledge-rich workloads (coaching, summarization, complex reasoning), cloud is still the right default.

contrl picks the right placement for the right workload. The pose pipeline is on-device. The Phase 4 coaching agent will be cloud-based (Anthropic Sonnet). The two placements coexist because they're optimizing for different things: the pose pipeline cares about every frame; the coaching agent cares about every set summary. Different frequencies → different placements. **The principle is "place inference where the data's gravity is."** Frames are heavy and private; place inference where the frames already are (the device). Set summaries are light and not-particularly-private; placing inference where the cheap, smart model is (the cloud) is fine.

The vision-camera + worklets-core stack is the load-bearing dependency that makes on-device feasible in React Native. Without it, you'd be in native land (Swift / Kotlin) doing frame processing manually. With it, the entire pipeline is expressible in TypeScript with a `'worklet'` directive. That dependency choice is also why pinning `react-native-mediapipe-posedetection` and `react-native-worklets-core` matters — drift in either could change inference behavior under your feet (see study-security file 06 on supply chain).

A note on what's NOT in this pattern: **training**. contrl doesn't train any model. MediaPipe ships pre-trained; the FSM is hand-coded. The Phase 2C planned classifier (LightGBM/ONNX form classifier) would be the first trained model — but training would happen offline (developer machine, exported ONNX) and inference would still be on-device. The on-device principle extends naturally.

## Interview defense

**Q: "Why is the pose pipeline on-device and not in the cloud?"**

```
  ┌─ Four reasons, ranked ─────────────────────────────────────────┐
  │                                                                 │
  │  1. PRIVACY — frames are video of the user. uploading them is  │
  │     a privacy boundary I'm not willing to cross for a feature   │
  │     I don't need cloud for.                                     │
  │                                                                 │
  │  2. LATENCY — 30 fps means 33ms per frame budget. on-device    │
  │     MediaPipe runs in ~10-30 ms with GPU delegate. a cloud     │
  │     round-trip is 100-500 ms. cloud inference would either     │
  │     miss frames or feel laggy. the rep counter must update     │
  │     visually before the next rep starts.                        │
  │                                                                 │
  │  3. OFFLINE — the gym often has no signal. cloud inference     │
  │     would mean the core feature breaks the moment connectivity │
  │     drops. on-device means the rep counter works always.      │
  │                                                                 │
  │  4. COST — cloud inference is metered per call. 30 fps × N    │
  │     users × M sessions = a real monthly bill. on-device is    │
  │     free per inference; the cost is bundle size + battery.    │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: *"the frame is big and private; the rep count is small and useful. move the small thing, not the big private thing."*

**Q: "How does it actually work? Walk me through one frame."**

The camera produces frames on a separate worklet thread (vision-camera's `useFrameProcessor`). Inside the worklet, MediaPipe runs against a bundled model file — no remote fetch — and produces landmarks: 33 joint points with x, y, z, visibility. If detection succeeded, the landmarks cross to the JS thread via `runOnJS(...)`. On the JS side, a per-exercise processor (in `src/lib/pose/exercises/`) extracts the three landmarks that matter for the angle (shoulder, elbow, wrist for pushups), computes the angle, smooths it with EMA. The smoothed angle feeds a 5-phase FSM in `rep-counter.ts` — idle, ready, down, bottom, up — with hysteresis dead-zones to prevent ping-pong. When the FSM completes a full cycle, it emits a rep event; React state increments. Total latency from camera → rep count visible: under one frame, ~20-30 ms.

**Q: "What about model accuracy? How do you know it's correct?"**

Today, I don't — that's the load-bearing gap from the recon audit. The accuracy of MediaPipe's landmarks is assumed; the rep counter FSM is deterministic given good landmarks but I haven't characterized where MediaPipe + FSM disagree with ground truth. The drill writeup at `.aipe/drills/evals-pose-accuracy.md` lays out the eval — record ~10 labeled videos, run the pipeline, measure error, induce a known failure (likely fast-tempo undercount because of smoothing lag), tune. After that drill ships, the answer to this question is "here's the number, here's the failure mode, here's the regression test."

**Q: "Could you swap MediaPipe for another model?"**

Yes — the FSM and the angle math don't know which model produced the landmarks. As long as a new model emits the same landmark shape (or you write a shim), the rest of the pipeline doesn't change. The `lib/pose/` modules are model-agnostic by construction. That separation was deliberate — coupling the FSM to MediaPipe's specific landmark schema would have been a leak.

## Validate

1. **Reconstruct.** Sketch the worklet/JS-thread split from memory: what runs where, what crosses between them, why frames don't cross.
2. **Explain.** Why is the FSM model-agnostic, and what would make it model-coupled? (Hint: if `feed(angle)` became `feed(mediapipeLandmark)`, you'd have leaked the schema.)
3. **Apply.** Phase 2C plans a form classifier (LightGBM → ONNX). Where does it run? What kind of features does it consume? How does it integrate with the existing pipeline without breaking the on-device principle? (Answer: on-device via ONNX Runtime; consumes per-set aggregated features from the rep-counter outputs, not raw landmarks; integrates as a post-set step before `logSession()`. The principle extends.)
4. **Defend.** Argue that putting MediaPipe in the cloud would be simpler ops. Then rebut.

## See also

- [00-overview.md](./00-overview.md) — the pipeline's place in the wider architecture
- [01-local-first-canonical-with-cloud-mirror.md](./01-local-first-canonical-with-cloud-mirror.md) — the device-as-canonical principle this extends to inference
- [audit.md § 7 scale-bottlenecks-and-evolution](./audit.md#7-scale-bottlenecks-and-evolution) — pose pipeline scales by N devices, the right scaling axis
- `.aipe/study-runtime-systems/` — the threading model (worklet vs JS thread)
- `.aipe/study-security/01-trust-boundaries-and-attack-surface.md` — the camera boundary is the safest one
- `.aipe/study-agent-architecture/agent-patterns-in-this-codebase.md` — chains vs agents framing (this pipeline is a chain, the planned coaching agent is an agent)
- `.aipe/drills/evals-pose-accuracy.md` — the eval drill that closes the "is it accurate?" gap
