# 4. AI engineering — on-device pose detection

There is no LLM in this app. The "AI" is a real-time computer-vision pipeline that runs MediaPipe's pose-landmarker model inside a vision-camera worklet at frame rate, extracts 33 keypoints per frame, computes joint angles, smooths them, and feeds them through a finite state machine that counts reps. Calling that "just calling an API" is the kind of answer that tells an interviewer you don't know what's hard about this. The hard parts:

- **The pipeline runs on the JSI worklet thread, not the JS thread.** Frame data never crosses the bridge. Anything that needs to reach the UI thread is throttled to phase transitions, not per-frame.
- **Pose models output noise.** Raw landmark positions jitter ±5–10 pixels frame-to-frame even when the subject is still. Naive angle calculation gives a counter that flickers between "down" and "up" twice per rep. The smoothing layer is what makes the counter usable.
- **The FSM is a state machine, not a threshold.** A "rep" is a *sequence* of phases — `ready → down → bottom → up → ready` — with hysteresis at every transition. A simple "angle < 90 = rep" approach double-counts, miscounts on partial reps, and counts a sit-up as a push-up.

```
Per-frame pipeline (worklet thread)

camera frame
    │
    ▼
MediaPipe pose-landmarker
    │
    ▼  33 landmarks {x, y, z, visibility}
    │
src/lib/pose/landmarks.ts
    │  pick the 3 joints for current exercise
    ▼
src/lib/pose/angles.ts
    │  angle = atan2(cross, dot) of two vectors
    ▼  raw angle θ_t
    │
exponential smoothing
    s_t = α·θ_t + (1-α)·s_{t-1}
    │
    ▼  smoothed angle
    │
src/lib/pose/rep-counter.ts (FSM)
    │
    ▼
┌────────┐  s > 160°   ┌────────┐  s < 90°-h    ┌─────────┐
│ idle   │────────────▶│ ready  │──────────────▶│  down   │
└────────┘             │        │               └────┬────┘
                       │        │   s < 90°+h        │
                       │        │◀───────────────┐   │
                       └────────┘                │   ▼
                          ▲                  ┌────────┐
                          │                  │ bottom │
                  rep++   │                  └────┬───┘
                  if up   │                       │  s > 90°+h
                          │                       ▼
                       ┌────────┐  s > 160°-h ┌────────┐
                       │   up   │◀────────────│  up    │
                       └────────┘             │  rising│
                                              └────────┘

   h = hysteresis band (10°). Without it the boundary
   between "down" and "bottom" oscillates with noise.
```

## Interview questions

**[mid] Why exponential smoothing instead of a moving average?**

> EMA has constant memory — one float per signal — and it adapts faster to genuine motion than a window average of the same effective length. A sliding window of 5 frames stores 5 floats per signal × 3 angles per exercise and smooths the leading edge of a real rep, which is exactly the part the FSM cares about. EMA with α≈0.3 has roughly the same noise rejection but with one cycle of lag instead of half the window length. On a 30fps stream that's ~33ms vs ~80ms — perceptible to the user holding the phone. The code is in `src/lib/pose/angles.ts`; the constant is named `SMOOTHING_ALPHA` so it's tunable.

**[senior] Walk me through why the state machine has a separate `bottom` state instead of just `up` and `down`.**

> Two reasons. First, "bottom" lets me enforce a *minimum hold* before counting the rep — without it, a fast bounce at 95° would count even though the user never actually reached the bottom of the movement. Second, the transition `down → bottom` happens at a different threshold than `bottom → up` (90°−h vs 90°+h), and that asymmetry is the hysteresis. If I collapsed `down` and `bottom` into one state, the hysteresis would have to live inside the transition logic for `up`, and the code becomes "if angle < 90 - 10 and was previously > 90 + 10 then..." which is unreadable and bug-prone. Splitting it into a state per phase makes the FSM declarative and the phase transition the place where hysteresis is enforced. That's why the FSM has *more* states than strictly needed — it's a readability decision, not a correctness one.

**[arch] What changes if you needed to support 20 exercises instead of 3?**

> The current design has a per-exercise file under `src/lib/pose/exercises/` that exports `{joints, readyAngle, bottomAngle, hysteresis}`. That scales linearly to ~10 exercises. Past that, two things happen. One: angle-based detection breaks for movements where the relevant signal isn't a single joint angle — pull-ups need bar contact (hand visibility + position), L-sits need static pose recognition. So the abstraction widens from "give me a joint angle" to "give me a phase classifier" — the FSM stops being the universal driver and becomes one strategy among several. Two: I'd want to push at least the angle calculation down into a native module rather than running it in JS, because at 20 exercises × 30fps × multiple joints per exercise the JSI bridge throughput becomes the bound. None of that is needed for three exercises.

## The hard question

**"How do you know your rep counter is actually accurate?"**

> Honest answer: I don't, beyond manual testing. There's no automated correctness suite for the pose pipeline because building one would require either a labelled video corpus or a synthetic landmark generator, and I haven't built either. What I *did* do: I ran each exercise through the counter against deliberate failure modes — half-reps, fast bounces, occlusion, going out of frame and back — and logged the FSM state transitions for visual inspection. The smoothing constant and the hysteresis band were tuned by watching the debug HUD on real workouts. That's calibration, not validation. The honest gap is that I can tell you the counter feels good and survives the failure modes I tested, but I can't give you a numerical accuracy figure on a held-out set. If this were a product I was monetising on rep-counting accuracy, that test corpus is the first thing I'd build.
