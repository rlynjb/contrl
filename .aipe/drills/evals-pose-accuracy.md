# Drill — pose-pipeline accuracy eval

```
  competency:   evals + on-device inference                   raises: L1 → L2
  curriculum:   (no Bx.y today — contrl's curriculum doesn't enumerate
                 a pose-eval Build item; closest concept is the
                 deterministic-harness-around-probabilistic-core seam)
  study ref:    .aipe/study-testing/06-testing-ai-features.md
                .aipe/study-ai-engineering/05-evals-and-observability/
  context:      ★ recon load-bearing gap. evals cap every track in the
                recon map — closing this lifts the ceiling on the whole
                on-device-ML competency stack. Today MediaPipe's accuracy
                is ASSUMED. After this drill, you can defend a number.
  triggered by: .aipe/audits/recon-2026-06-03.md → TRACK Move 1
```

> The only proof you understand a system is that you can break it on purpose and explain why. This drill turns "pose detection works" (L1) into "I measured it, found where it breaks, fixed what I could, and documented what I couldn't" (L2 — defensible).

The six steps walk one competency up the ladder. Each step is a real action in the editor, not a thought experiment.

---

## 1. BUILD — the naive happy-path eval

**Goal:** make a pose-accuracy eval exist. Don't optimize it. Make it run.

**Where it lives:**

```
  tests/eval/pose-accuracy/
    fixtures/
      pushup-clean-001.mp4       ← real video, you in frame, 5 clean reps
      pushup-clean-002.mp4       ← 5 more reps, different lighting
      pushup-partial-occlusion.mp4  ← arm partially out of frame
      pushup-fast-tempo.mp4      ← 1.5x normal speed
      squat-clean-001.mp4         ← 5 squats
      plank-30s.mp4               ← 30 seconds of plank hold
      ...10 videos total
    fixtures-labels.json          ← ground truth: { 'pushup-clean-001': { reps: 5, exercise: 'pushup' }, ... }
    run-eval.ts                   ← the harness: load video → feed to pose pipeline → assert
    report.md                     ← per-run output: per-video accuracy + aggregate
```

**The naive harness (pseudocode — adapt to your test runner):**

```
  for each video in fixtures-labels.json:
    landmarks = run_mediapipe_on_video(video.path)        ← bundled model
    processor = createProcessorFor(exercise=video.exercise)
    counter = new RepCounter({ exerciseKind: video.exercise })
    rep_count = 0
    for each frame in landmarks:
      result = processor.feed(frame)
      if result.repCompleted: rep_count += 1
    log { video: video.name, expected: video.reps, actual: rep_count }

  print summary: mean absolute error, per-video accuracy %
```

**File:line cite for what you're wrapping:**
- `src/components/camera/PoseCamera.tsx:44-61` — the frame processor + `runOnJS(onLandmarks)`
- `src/lib/pose/exercises/pushup.ts` — `createPushupProcessor()`
- `src/lib/pose/rep-counter.ts` — `RepCounter.feed(angle)`

**Done when:** `npm run eval:pose` prints a number per video and a mean. The number is allowed to be wrong. The harness must *run*.

**Expected naive result:** "5 of 10 videos give the right rep count, mean absolute error 1.2 reps per video." (Your numbers will vary; the point is they exist now.)

---

## 2. INDUCE — force the failure

**The assignment is to break it.** The starter library is explicit: *a drill with no induced failure is a tutorial and produces zero interview signal.* Your job is to find the input that makes the pipeline lie confidently.

**Where to look (ranked by likely yield):**

```
  candidate failure mode               likely trigger
  ──────────────────────                ──────────────
  ★ fast tempo                          record pushups at 1.5x or 2x speed.
                                        prediction: rep-counter misses reps
                                        because the smoothing factor (~0.4
                                        in pushup.ts) is tuned for stable
                                        cadence. Fast tempo → smoothed
                                        angle never crosses bottom threshold.

  partial occlusion                     stand at angle; one arm leaves frame.
                                        prediction: visibility check (line
                                        69-77 in SetCameraOverlay) drops the
                                        rep frame; counter stays in same phase
                                        across the whole rep → 0 reps counted.

  hysteresis boundary ping-pong         go down halfway, come up halfway,
                                        repeat. prediction: FSM stays in
                                        `ready` because dead-zone prevents
                                        the transition → user looks like
                                        they're doing reps, count stays at 0.

  bad lighting                          dim room. prediction: MediaPipe
                                        landmark visibility drops; same
                                        path as partial occlusion.

  background motion                     someone walks past behind you.
                                        prediction: MediaPipe sometimes
                                        switches subject → landmarks
                                        teleport → phantom reps from
                                        single-frame jumps.
```

**Force at least ONE failure.** Pick fast-tempo first — it's the highest-yield. If the eval shows ≥90% accuracy on every video including fast-tempo, **the fixtures aren't hard enough**. Push harder: 2x speed, 3x speed, partial reps, rep at extreme angle.

**Done when:** at least one video has a rep count that's off by ≥1 and you can name the input feature that caused it. Document the failure in `report.md`.

**Resist the temptation to jump to the fix.** Step 3 is the rep.

---

## 3. DIAGNOSE — symptom → hypotheses → isolated cause

**This is where L2 signal lives.** Coaches push back here in interviews. Walk the rep deliberately.

**The diagnose protocol:**

```
  STEP A. State the symptom in numbers.
           "fast-tempo pushup video shows 3 reps; ground truth is 5;
            error = -40% rep undercount."

  STEP B. List 3-4 hypotheses BEFORE testing any.
           h1. MediaPipe loses tracking at speed → landmark gaps
           h2. visibility threshold filters out blurred frames
           h3. smoothing alpha = 0.4 is too aggressive for fast cadence
           h4. FSM hysteresis dead-zone is too wide for short reps

  STEP C. Eliminate hypotheses with EVIDENCE, not intuition.
           h1: log the per-frame landmark.visibility for the fast video.
               if visibility stays > 0.5 throughout → h1 unlikely.
               if visibility drops to 0.3 mid-rep → h1 confirmed.

           h2: same data answers h1+h2. if h1 is wrong, h2 is too.

           h3: log the smoothedAngle frame-by-frame against raw angle.
               if smoothedAngle never reaches the bottom threshold
               (~80° for pushup) → h3 confirmed.

           h4: log the FSM phase per frame. if phase = 'down' but
               never transitions to 'bottom' → could be h3 OR h4.
               distinguish by lowering hysteresis dead-zone and re-running.

  STEP D. Name the isolated cause in one sentence.
           Example: "the smoothing alpha (0.4) lags the smoothedAngle
           by ~3 frames at 30fps. at 2x rep tempo, the smoothed angle
           never crosses the bottom threshold because the rep is over
           before smoothing catches up."
```

**Done when:** you have a one-sentence cause statement backed by frame-level instrumentation (you printed the values; they show the cause). Save the instrumentation script as `tests/eval/pose-accuracy/debug-frames.ts` — you'll want it next time.

**The interview test:** can you say the cause in 30 seconds without saying "I think" or "probably"? If yes, this rep earned L2.

---

## 4. FIX + REJECT — the fix shipped, AND the alternative rejected

The fix earns L2.5; **the rejected alternative earns the full L2**. A fix with no rejected alternative is luck, not a tradeoff. Two real choices must be on the table.

**For the fast-tempo failure (assuming h3 was the diagnosis):**

```
  FIX:    lower smoothing alpha from 0.4 to ~0.25.
          file:line: src/lib/pose/exercises/pushup.ts (the alpha constant)

  REJECT 1: dynamic alpha based on detected rep tempo.
          why rejected: introduces a feedback loop — tempo detection
          depends on smoothed angle, which depends on alpha. circular.
          would need a separate phase-aware tempo estimator. cost too high
          for the marginal gain over a static fix.

  REJECT 2: drop smoothing entirely.
          why rejected: handheld phone introduces ~2-frame noise. raw
          angle ping-pongs across hysteresis boundary, causing phantom
          phase transitions. (induced this; verified in step 3 instrumentation.)
          smoothing has to exist; the question is just the alpha.

  REJECT 3 (the meta-reject): "tune all four parameters at once."
          why rejected: a multi-parameter sweep without per-parameter
          isolation produces no defensible story. one parameter at a time;
          one eval per change.
```

**Why three rejections (not one):** real tradeoffs have multiple losing alternatives. Listing one alternative reads as "I considered TWO options" — common, but L1-ish. Listing three with concrete reasons reads as "I considered the space" — L2.

**Done when:** the fix is in `src/lib/pose/exercises/pushup.ts` (or wherever) AND `report.md` has a "Rejected alternatives" section with three named-and-reasoned rejections.

---

## 5. EVAL — prove the fix; cap the regression

The eval that caps the drill at L3 is not the same as the eval you started with. Step 1's eval was the *measurement surface*. Step 5's eval is the *regression bound*.

**The proof:**

```
  before:  fast-tempo pushup video → 3 reps (ground truth: 5)   = 60% accuracy
  after:   fast-tempo pushup video → 5 reps (ground truth: 5)   = 100% accuracy

  the delta the fix bought:  +40 percentage points on the induced case.
```

**The regression bound — equally important:**

```
  before:  clean-cadence pushup video → 5 reps (ground truth: 5)   = 100%
  after:   clean-cadence pushup video → 5 reps (ground truth: 5)   = 100%
  ✓ no regression on the easy case.

  before:  partial-occlusion pushup video → 4 reps (ground truth: 5) = 80%
  after:   partial-occlusion pushup video → 4 reps (ground truth: 5) = 80%
  ✓ untouched (this drill didn't try to fix occlusion; that's the next drill).
```

**The full eval report (`report.md`):**

```
  ┌──────────────────────────────┬───────┬──────┬──────────┐
  │ video                         │ truth │ pre  │ post     │
  ├──────────────────────────────┼───────┼──────┼──────────┤
  │ pushup-clean-001             │   5   │  5   │   5 ✓    │
  │ pushup-clean-002             │   5   │  5   │   5 ✓    │
  │ pushup-fast-tempo            │   5   │  3   │   5 ★    │
  │ pushup-partial-occlusion     │   5   │  4   │   4      │  ← untouched
  │ pushup-bad-lighting          │   5   │  4   │   4      │  ← untouched
  │ squat-clean-001              │   5   │  5   │   5 ✓    │
  │ squat-fast-tempo             │   5   │  3   │   5 ★    │  ← bonus: fix
  │                               │       │      │   transferred         │
  │ ...                           │       │      │                       │
  └──────────────────────────────┴───────┴──────┴──────────┘

  aggregate: pre 7/10 correct (70%); post 9/10 correct (90%).
  outstanding gaps: partial-occlusion, bad-lighting (next drills).
```

**Done when:** `report.md` exists with pre/post numbers; the file is committed; you can point at it on a screenshare.

**The L3 capstone:** an eval that wouldn't have *prevented* a future regression isn't a real eval. Wire the per-video assertion into a test:

```
  // tests/eval/pose-accuracy/regression.test.ts
  test.each(fixtureManifest)('rep count matches ground truth: %s', async ({ video, truth }) => {
    const counted = await runEval(video);
    expect(Math.abs(counted - truth)).toBeLessThanOrEqual(1);  // ±1 rep tolerance
  });
```

Now a future "let me retune that alpha" PR runs the suite and either passes or fails honestly.

---

## 6. WAR STORY — the sentence you can now say in a room

Write this in your own voice. The starter library says: *the war story is the deliverable; steps 1-5 are the evidence that earns it.* If you can't write the sentence after step 5, the drill isn't done.

**Template — fill in with your numbers:**

> "I built an accuracy eval for my pose detection pipeline against ~10 labeled videos. The naive harness flagged that fast-tempo pushups were undercounted by ~40% because the angle smoothing alpha I'd tuned for stability lagged the smoothed value 3 frames behind the raw angle — at 2× tempo, the smoothed value never crossed the bottom threshold, so the FSM never registered the rep. I lowered alpha from 0.4 to 0.25, which kept noise rejection acceptable on the clean videos while letting the fast videos transition correctly. The fix transferred to squats. Partial occlusion and bad lighting are the next two drills; they need different fixes."

**What that sentence demonstrates in 90 seconds:**
- ✓ you measured something specific (10 videos, named metric)
- ✓ you found a real failure (not "I think it sometimes misses reps")
- ✓ you diagnosed mechanically (smoothing lag, not "the model was bad")
- ✓ you made a tradeoff (alpha 0.25 vs 0.4 vs dynamic) with evidence
- ✓ you bounded what you fixed and what you didn't (transferred to squats, didn't touch occlusion)
- ✓ you can name the next drill

**The push-back you should expect — and have ready:**

- *"Why didn't you make alpha dynamic per-rep?"* → "I tried that path mentally; it requires phase-aware tempo estimation, which depends on the smoothed angle that alpha is producing. Circular dependency. Static alpha gave the result; the dynamic version was higher complexity for marginal gain."
- *"How do you know 0.25 is the right alpha and not 0.20?"* → "I don't know it's the global optimum. I know it lifts fast-tempo from 60% to 100% accuracy without regressing clean-cadence. The eval will catch a future drift either way."
- *"What's the accuracy on the videos you didn't fix?"* → "80% on partial-occlusion, 80% on bad-lighting. Both are documented gaps; the partial-occlusion fix is the next drill — I expect it's a visibility-threshold or required-landmark-set change, but I haven't run that rep yet."

**The L3 finish line:** you can hold this story under push-back without retreating to "I think" or "probably." If a push-back makes you hedge, the drill earned L2.5 and you owe yourself one more rep. If you hold the line — verdict-first, no hedging — this is the war story that anchors your AI/ML claim on the resume.

---

**Done.** Save `report.md`, the regression test file, and the alpha change in one commit titled `eval(pose): characterize fast-tempo undercount; tune alpha 0.4→0.25`. The commit is the artifact that backs the war story.

---

*Next drill in the recon queue: failure-handling for sync partial-failure (Move 2 in `.aipe/audits/recon-2026-06-03.md` TRACK queue).*
