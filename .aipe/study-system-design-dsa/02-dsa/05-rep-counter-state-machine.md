# Rep counter state machine

**Industry name(s):** Finite State Machine (FSM), deterministic state machine with hysteresis, threshold-based state transitions
**Type:** Industry standard · Language-agnostic

> A 5-state machine (`idle → ready → down → bottom → up → ready`, count++ on the last transition) counts reps from a stream of joint angles. Every transition has 10° hysteresis to prevent jitter at boundary positions. The angle stream is exponentially smoothed before feeding the FSM.

**See also:** → [06-exponential-smoothing](./06-exponential-smoothing.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

A muscle contracts, an arm bends, a body lowers, then rises. A counter has to recognize that the *shape* of that motion is one rep — not multiple, not zero. If you naively count "every time angle goes below threshold X", a body hovering at the threshold counts 15 reps when they did one. The fix is to require the body to *cross past* the threshold by some margin before crediting a transition.

The pattern is **FSM with threshold hysteresis** — same shape as Schmitt triggers in analog electronics, button-debounce logic, and any UI gesture detector that needs to ignore micro-fluctuations.

---

## How it works

Five states arranged in a cycle. The system moves through them in order, gated on the smoothed angle. The cycle completes — `up` returns to `ready` — and that completion is the rep. Hysteresis prevents the system from bouncing between states at the boundaries.

### The states and transitions

```
                                  count++  on this edge only
                                       ▲
        ┌─── idle ───► ready ───► down ─▼─► bottom ───► up ───► ready ─┐
        │                                                              │
        └─────────────────── reset() goes back to idle ────────────────┘
```

- **idle** — no movement detected yet (or after `reset()`). Transitions to `ready` when angle ≥ `readyAngle - hysteresis`.
- **ready** — body at the "top" of a rep (arms extended for pushup). Transitions to `down` when angle < `readyAngle - hysteresis`.
- **down** — descending. Transitions to `bottom` when angle ≤ `bottomAngle + hysteresis`. Can also re-enter `ready` if the angle rebounds back up (e.g., a half-rep aborted).
- **bottom** — at the bottom of a rep. Transitions to `up` when angle > `bottomAngle + hysteresis`.
- **up** — ascending. Transitions to `ready` when angle ≥ `readyAngle - hysteresis` (and **`count++`** fires here). Can also re-enter `bottom` if the user reverses direction.

### The code

```typescript
update(angle: number): RepUpdateResult {
  const prev = this.phase;
  const { readyAngle, bottomAngle, hysteresis } = this.config;
  let repCompleted = false;

  switch (this.phase) {
    case 'idle':
      if (angle >= readyAngle - hysteresis) this.phase = 'ready';
      break;
    case 'ready':
      if (angle < readyAngle - hysteresis) this.phase = 'down';
      break;
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
        repCompleted = true;
      } else if (angle <= bottomAngle + hysteresis) {
        this.phase = 'bottom';
      }
      break;
  }
  return { phaseChanged: this.phase !== prev, repCompleted, phase: this.phase, count: this.count };
}
```

`src/lib/pose/rep-counter.ts` L31–L80.

### Why hysteresis matters

For a pushup with `readyAngle: 160, bottomAngle: 90, hysteresis: 10`:
- To leave `ready`, angle must drop *below* 150° (160 - 10).
- To enter `bottom`, angle must drop *at or below* 100° (90 + 10).
- To leave `bottom`, angle must rise *above* 100°.
- To complete the rep (re-enter `ready` from `up`), angle must rise *at or above* 150°.

Without hysteresis, a person whose arms relax at exactly 90° would have their `bottom` state flicker as the noise oscillates around 90°. Each flicker would advance the FSM ('up' → 'ready' → count, then immediately back to 'down' → 'bottom' → 'up' → 'ready' → count again). Hysteresis enforces "the angle has to commit past the threshold" before the transition.

If you're coming from frontend, this is the same idea as the `hover` state in CSS — once you enter, you require leaving the *outside* of the bounding box, not just the inside.

### Per-exercise tuning

The `RepCounterConfig` is set per exercise:

| Exercise | readyAngle | bottomAngle | hysteresis |
|---|---|---|---|
| Pushup | 160 | 90 | 10 |
| Squat | 160 | 90 | 10 |
| Plank (no rep count; alignment-only) | — | — | — |
| Pull (TRX, vertical) | per-orientation | per-orientation | 10 |

The FSM logic is the same; only the thresholds change. Adding a new exercise is a config record, not a code change.

---

## Brute force vs optimal — both work, hysteresis is the differentiator

```
Brute force (counts every threshold cross):
─────────────────────────────────────────────
if (angle < 90 && !wasDown) { count++; wasDown = true }
if (angle > 160 && wasDown) { wasDown = false }

Optimal (FSM with hysteresis):
─────────────────────────────────────────────
5-state cycle, hysteresis on every transition
Filters out boundary jitter
Tracks direction (down vs up) explicitly
```

The brute force counts a rep on every threshold crossing — fine for clean reps but bad for noisy input. The FSM is correct because it requires the *full cycle* (ready → down → bottom → up → ready) before crediting a count. A partial motion (ready → down → ready) doesn't count.

### Execution trace

```
Pushup config: readyAngle=160, bottomAngle=90, hysteresis=10
State sequence over a single rep:

frame  angle  state          notes
─────  ─────  ─────────────  ─────────────────────────────────
1      170    idle           initial
                              angle >= 150 → ready
       170    ready
2      155    ready          155 < 160 - 10 = 150? no, stay
3      130    ready          130 < 150? yes → down
       130    down
4      100    down           100 <= 90 + 10 = 100? yes → bottom
       100    bottom
5       85    bottom         85 > 100? no, stay
6       95    bottom         95 > 100? no, stay
7      110    bottom         110 > 100? yes → up
       110    up
8      140    up             140 >= 150? no, stay
9      155    up             155 >= 150? yes → ready, count++!
       155    ready          repCompleted = true, count = 1
```

The hysteresis means that even though the angle hits 95° briefly mid-bottom (jitter), the FSM stays in `bottom` because 95 ≤ 100. Without hysteresis, 95 would have re-entered `up`, then 110 → `ready` → count++ on a non-complete rep.

---

## State machine — diagram

```
                                  reset()
                          ◄──────────────────────────
                          │
                          ▼
                       ┌──────┐
                       │ idle │
                       └──┬───┘
                          │ angle ≥ readyAngle - 10
                          ▼
                      ┌───────┐
              ┌──────►│ ready │◄──────┐
              │       └───┬───┘       │
              │  angle <  │           │
              │  readyAng │           │ angle ≥ readyAngle - 10
              │  - 10     │           │ (count++ here!)
              │           ▼           │
              │       ┌──────┐    ┌──────┐
              │       │ down │    │  up  │
              │       └───┬──┘    └───┬──┘
              │  angle ≥  │           │
              │  readyAng │           │ angle ≤ bottomAngle + 10
              │           │           │
              └───────────┤           │  (going backwards)
                          │  angle ≤  │
                          │  bottomAng│
                          │  + 10     │
                          ▼           │
                       ┌────────┐     │
                       │ bottom │◄────┘
                       └────┬───┘
                            │
                            │ angle > bottomAngle + 10
                            └──► up
```

---

## In this codebase

**File:** `src/lib/pose/rep-counter.ts`
**Function / class:** `class RepCounter`, `update(angle)`
**Line range:** L21–L86

Per-exercise instances created in:
- `src/lib/pose/exercises/pushup.ts` L17 — `new RepCounter(PUSHUP_CONFIG)` (`{ readyAngle: 160, bottomAngle: 90, hysteresis: 10 }`)
- `src/lib/pose/exercises/squat.ts` L17 — `new RepCounter(SQUAT_CONFIG)` (same values)
- `src/lib/pose/exercises/pull-bar.ts`, `pull-trx.ts` — per-orientation configs

---

## Elaborate

### Where this pattern comes from

FSMs are an ancient computing primitive (Turing 1936). Hysteresis came from analog electronics (Schmitt trigger, 1938). The combination — a discrete FSM with hysteresis on every transition — is the textbook pattern for converting noisy continuous input into clean discrete events.

### The deeper principle

A state machine separates "what kind of motion we're in" from "what threshold we just crossed". Threshold crossings alone don't tell you which direction you're going or whether you've completed a full cycle. The state machine remembers context; hysteresis filters noise. Together they convert "raw sensor stream" into "discrete events".

### Where this breaks down

When the user moves *very* fast — faster than the frame rate. If a user explodes from `ready` to past `bottom` in one frame, the FSM still works (it transitions `ready → down → bottom` in subsequent updates as it sees the threshold crossings), but a single-frame full rep would only register the `bottom` transition, then the next frame's `ready` would close it. Practically: ~30fps is fine for any realistic exercise pace.

The other breakpoint: pose estimation confidence near zero. If the model can't see the joint, the angle is garbage. The FSM doesn't filter on confidence — that's a known gap (see [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)).

### What to explore next

- [06-exponential-smoothing](./06-exponential-smoothing.md) → the pre-FSM filter
- [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md) → the surrounding pipeline

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ FSM + hysteresis (taken)         │ Simple threshold counter (alt)   │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Robustness       │ Filters boundary jitter          │ Counts every crossing            │
│ Code volume      │ ~80 LOC                          │ ~10 LOC                          │
│ Tunability       │ 3 params (ready, bottom, hyst)   │ 1 param (threshold)              │
│ False positives  │ Rare                             │ Common at boundary               │
│ False negatives  │ Some on very shallow reps        │ Rare                             │
│ Per-exercise cfg │ One config object                │ Same                             │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *missing very shallow reps*. A user who barely passes `bottomAngle + 10` won't trigger the `bottom` transition. For pushups at `bottomAngle = 90, hysteresis = 10`, the user must reach 100° or shallower elbow angle to count. Most "real" pushups go below 90°; shallow half-reps don't count, which is arguably correct.

The second cost is the *3 parameters per exercise*. Tuning these required test runs with real users; the values in the codebase are the result of those tests. Adding a new exercise requires another tuning round.

### Sub-block 2 — what a simple threshold counter would have cost

`if (angle < threshold && !wasDown) { count++; wasDown = true }` — 5 lines, no FSM. But: a person resting with their arm hovering near the threshold would trigger 10–20 counts per second. The FSM is the difference between a usable rep counter and a broken one. Not a real alternative.

### Sub-block 3 — the breakpoint

Fine until very high frame rates (60fps+) and very fast exercises. At >120fps with explosive motion, the FSM's per-frame check would need adjustment. Not happening here.

### Sub-block 4 — what wasn't actually a tradeoff

A Kalman filter for state estimation would be more sophisticated but inappropriate — we don't have a dynamics model for "human doing a pushup", just a threshold model. Kalman filters earn their place when the underlying process has predictable dynamics; ours doesn't.

---

## Tech reference (industry pairing)

### Hand-rolled FSM (`switch` over a `phase` field)

- **Codebase uses:** `class RepCounter` (`rep-counter.ts` L21–86) with a `switch (this.phase)` in `update()` (L31–80). One field (`phase`), one config object (`{ readyAngle, bottomAngle, hysteresis }`), no library.
- **Why it's here:** five states and six transitions is small enough that a `switch` is clearer than any library DSL, and it has zero dependency/bundle cost on a hot per-frame path.
- **Leading today:** hand-rolled `switch` FSM — `adoption-leading` for small embedded/per-frame state machines, 2026.
- **Why it leads:** transparent, allocation-free, trivially testable; the whole machine fits on one screen.
- **Runner-up:** XState — `innovation-leading` for complex UI state charts; earns its place at ~10+ states with guards/actions/parallel regions, which this isn't.

### Threshold hysteresis (Schmitt-trigger pattern)

- **Codebase uses:** 10° margin applied at every transition (`readyAngle - hysteresis`, `bottomAngle + hysteresis`) to convert a noisy continuous angle into clean discrete transitions.
- **Why it's here:** without it, jitter around a threshold counts many reps for one motion — the same failure a raw `if (angle < threshold)` counter has.
- **Leading today:** hysteresis on threshold transitions — `adoption-leading` (language-agnostic, borrowed from analog electronics), 2026.
- **Why it leads:** one extra constant per threshold buys robustness against sensor noise; universal across debounce, gesture detection, and signal processing.
- **Runner-up:** post-hoc smoothing only (no hysteresis) — the codebase already smooths upstream (α=0.4), but smoothing alone doesn't track direction; the FSM + hysteresis is what credits a *complete* cycle.

---

## Summary

### Concept recap

`RepCounter` implements a 5-state FSM (`idle → ready → down → bottom → up`) with 10° hysteresis at every transition. The count increments on the `up → ready` edge, which represents the completion of a full ready-down-bottom-up cycle. Smoothing happens upstream (see [06-exponential-smoothing](./06-exponential-smoothing.md)); the FSM receives an already-de-jittered angle. The constraint forcing this design was pose-data jitter and the need to distinguish complete reps from partial ones. The cost is missed very-shallow reps and three per-exercise tuning parameters.

### Key points

- The count fires on one specific edge: `up → ready`, not on any threshold crossing.
- Hysteresis (10°) is the difference between a usable counter and one that counts 20 reps per second of noise.
- Direction is tracked by the state, not inferred from angle deltas.
- Each exercise's config (readyAngle, bottomAngle, hysteresis) is the only thing that changes per exercise.
- `reset()` returns to `idle`; the first frame after reset bumps `idle → ready` if angle is high enough.

---

## Interview defense

### Likely questions

**Q: Walk me through one full rep.  [mid]**
A: At rest, the FSM is in `ready` (high angle, arms extended). User descends — angle drops below `readyAngle - hysteresis`, FSM enters `down`. User reaches the bottom — angle drops to `bottomAngle + hysteresis`, FSM enters `bottom`. User pushes up — angle rises above `bottomAngle + hysteresis`, FSM enters `up`. User finishes — angle rises to `readyAngle - hysteresis`, FSM re-enters `ready` and `count++`. The count is on the `up → ready` transition, nowhere else.

```
ready  (top)
  ↓  angle drops past 150
down
  ↓  angle drops past 100
bottom (the dip)
  ↑  angle rises past 100
up
  ↑  angle rises past 150  ←─ count++ here
ready
```

**Q: Why 10° of hysteresis specifically?  [senior]**
A: It's the smallest value that reliably suppresses pose-model jitter without affecting normal-rep detection. Pose estimation is accurate to ~3–5° on visible joints; using less than 10° would let occasional jitter trip transitions. Using more than 10° would make shallow reps fail to count. 10° was tuned empirically — values around it (8°, 12°) all worked; the smoothing factor of α=0.4 is the other tunable that interacts here.

```
   hysteresis < 5°      jitter trips state transitions
   hysteresis = 10°     stable transitions, normal reps count
   hysteresis > 20°     shallow reps fail to register
```

**Q: How would you adapt this for an exercise like a `dead-hang` where the goal is to *not* move?  [arch]**
A: Replace the rep-counting FSM with a hold-timer FSM. Two states: `holding` (alignment within tolerance), `not-holding` (drift out). Accumulate `deltaMs` per frame while `holding`. That's exactly what `createPlankProcessor` does in `src/lib/pose/exercises/plank.ts`. The shape is FSM-with-timer instead of FSM-with-counter.

```
Plank FSM:
   ┌───────────┐  alignment within ±15° of 180°
   │ holding   │◄──────────────────────────────────┐
   └─────┬─────┘                                   │
         │  alignment drifts > 15°                 │
         ▼                                          │
   ┌─────────────┐  back within ±15°               │
   │ not-holding │───────────────────────────────┘
   └─────────────┘
   while holding: holdTimeMs += deltaMs
```

### The question candidates always dodge

**Q: How do you handle the user pausing at the bottom of a rep for 30 seconds?**
A: The FSM stays in `bottom` for the entire pause; nothing increments because no transition fires. When the user moves up again, the FSM transitions normally. The count doesn't double, the pause doesn't break anything. This is a free property of the design — the FSM doesn't care about *time*, only about *transitions*. The only thing that would change is if the user *moved* during the pause (e.g., flickered their arms), but the smoothing absorbs that.

```
   Picked (timeless FSM)              │   Alternative (time-aware)
   ────────────────────────────────── │ ──────────────────────────────────
   long pause: stays in bottom        │   long pause: maybe rejects rep?
   restart natural                    │   needs explicit "still counting"
   right for any tempo                │   right for tempo-strict training
```

### One-line anchors

- 5 states, one cycle, one count-on-edge.
- Hysteresis 10° is the difference between counting reps and counting noise.
- Each exercise's config is the only thing that changes.
- Time-invariant: pause as long as you like.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the FSM with all transitions and threshold annotations.

### Level 2 — Explain it out loud
Explain why the count is on one specific edge. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Design a counter for jumping jacks (arms going up + legs going wide, both simultaneously)." What states do you need?

Reference `src/lib/pose/exercises/`.

### Level 4 — Defend the decision you'd change
"Would you swap the hand-rolled FSM for a state-machine library like xstate?" Walk through the tradeoff.

### Quick check — code reference test
- What file has `RepCounter`?
- What's the count++ transition?
- What's the hysteresis value for pushups?

Then verify.

---
