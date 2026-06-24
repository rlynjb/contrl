# Exponential smoothing

**Industry name(s):** Exponential moving average (EMA), single-pole IIR filter, exponential weighted moving average (EWMA)
**Type:** Industry standard · Language-agnostic

> One-line recurrence: `smoothed = previous + α × (current − previous)`. Constant memory (one previous value), responsive to recent change. Used to de-jitter joint angles before feeding them to the rep counter.

**See also:** → [05-rep-counter-state-machine](./05-rep-counter-state-machine.md) · → [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md)

---

## Why care

A signal that bounces ±2° per sample makes your downstream consumer miserable. The fix is a low-pass filter. The cheapest, simplest, fastest low-pass filter known to humanity is exponential smoothing — one multiply, one add, one state variable. Every sensor stack on every microcontroller uses it. So does every stock-market chart's "moving average" line.

The pattern is **EWMA** — exponential weighted moving average. Same shape as Kalman filter's update step (with α as the static gain), the τ-controlled time constant in analog RC filters, and the `momentum` parameter in machine-learning optimizers.

---

## How it works

You have a current measurement and a previous smoothed value. The new smoothed value is a blend of the two, weighted by α (alpha).

```typescript
export function smoothAngle(current: number, previous: number, factor: number): number {
  return previous + factor * (current - previous);
}
```

`src/lib/pose/angles.ts` L21–L23. Three forms of the same equation:

```
smoothed = previous + α × (current − previous)
         = previous × (1 − α) + current × α
         = (1 − α) × previous + α × current
```

All three forms are mathematically identical. The codebase uses the first because it reads as "nudge previous toward current by α of the gap" — which is intuitive.

### What α controls

α (called `factor` in the code) ∈ [0, 1]. It controls how much the output trusts the *new* sample vs. the *previous* smoothed value.

| α | Behavior |
|---|---|
| 0.0 | Output never changes. `smoothed = previous`. Useless. |
| 0.1 | Heavy smoothing. Slow to respond. Single-frame noise barely visible. |
| 0.4 | **Codebase value.** Balanced — responsive enough that 30fps motion isn't lagged. |
| 0.7 | Light smoothing. Responsive but lets some noise through. |
| 1.0 | Pass-through. `smoothed = current`. No smoothing. |

The choice of α = 0.4 came from empirical tuning. α = 0.2 was too laggy (the angle still descended after the user reached bottom); α = 0.8 was too jittery (the rep counter occasionally false-triggered).

### Constant memory

The function takes `(current, previous)` and returns `smoothed`. The caller maintains the `previous` value:

```typescript
const SMOOTHING_FACTOR = 0.4;
let smoothedAngle = 0;
let initialized = false;

// per frame:
const rawAngle = calculateAngle(shoulder, elbow, wrist);
if (!initialized) {
  smoothedAngle = rawAngle;
  initialized = true;
} else {
  smoothedAngle = smoothAngle(rawAngle, smoothedAngle, SMOOTHING_FACTOR);
}
```

`src/lib/pose/exercises/pushup.ts` L29–L34. One scalar of state. Compare to a moving-average filter (`avg of last N samples`) which requires a buffer of length N.

### The initialization branch

The `initialized` flag handles the first frame. Without it, the first call would do `smoothed = 0 + 0.4 × (angle - 0) = 0.4 × angle` — a wrong value that would need ~10 frames to "catch up" to the truth. With the flag, the first frame seeds `smoothedAngle = rawAngle`, and from frame 2 onward the smoothing kicks in.

### Why EMA over moving average?

| Property | EMA (taken) | Moving average |
|---|---|---|
| Memory | O(1) — one value | O(N) — buffer of N |
| Latency | None inherent | (N/2) sample lag |
| Warm-up | 1 frame | N frames |
| Tuning | One param (α) | One param (N) |
| Weight on recent | Exponentially highest | Equal across window |

EMA's "all recent samples weighted higher than older ones" matches what we want — angle right now matters more than angle 10 frames ago.

---

## Brute force vs optimal

```
Brute force (no smoothing):
─────────────────────────────
const angle = rawAngle;  // pass through
counter.update(angle);
                                 → FSM sees raw jitter, misfires

Moving average (alternative):
─────────────────────────────
const buf = [];  // size N
buf.push(rawAngle);
if (buf.length > N) buf.shift();
const avg = buf.reduce(...) / N;
                                 → O(N) per frame; N/2 sample lag

EMA (taken):
─────────────────────────────
smoothedAngle = smoothedAngle + 0.4 * (rawAngle - smoothedAngle);
                                 → O(1) memory, O(1) time, responsive
```

### Execution trace

```
α = 0.4
frame  raw   prev_smooth    new_smooth   (raw - prev) × α
─────  ───   ───────────    ──────────   ─────────────────
1      155   (init)         155.0         (seed)
2      170   155.0          161.0         +6
3      163   161.0          161.8         +0.8
4      165   161.8          163.1         +1.3
5      130   163.1          149.8         -13.3   ← rapid motion
6      120   149.8          137.9         -11.9
7      110   137.9          126.7         -11.2
8      105   126.7          118.0         -8.7
9       95   118.0          108.8         -9.2
10      85   108.8           99.3         -9.5   ← near bottom
11      80    99.3           91.6         -7.7
12      90    91.6           91.0          -0.6   ← noise absorbed
13      82    91.0           87.4         -3.6
```

Note how the smoothed value lags the raw value slightly (the user is at 130 by frame 5; smoothed is at 149.8) but moves consistently in the right direction without bouncing.

### When brute force is fine

For very clean sensor data (e.g., direct hardware angle encoders), no smoothing is needed. For neural-network-derived landmarks at 30fps, smoothing is mandatory — every commercial pose app uses it.

---

## EMA — diagram

```
   raw input              previous smoothed              new smoothed
   ─────────              ─────────────────              ─────────────
        │                          │                          ▲
        │                          │                          │
        │                          │                          │
        │       (current − previous) × α                      │
        │   ┌──────────────────────────────┐                  │
        │   │                              │                  │
        ▼   │                              ▼                  │
   ┌─────────────┐                   ┌─────────────┐          │
   │   current   │ ────► × α ────►   │   delta     │ ──► add ─┘
   └─────────────┘                   └─────────────┘    │
                                                        ▼
                                                  previous + delta


   Time-domain view:

   raw:        ▆▇▇▇▇▆▆▅▄▄▃▃▂▃▂▂▂▃▃▃▃▄▅▆▇▇▇▇▇
   smoothed:    ▆▆▇▇▇▇▆▆▅▄▄▃▃▃▂▂▂▂▃▃▃▃▄▅▆▆▇▇▇
                ↑ small lag, but suppresses single-frame noise
```

---

## In this codebase

**File:** `src/lib/pose/angles.ts`
**Function / class:** `smoothAngle(current, previous, factor)`
**Line range:** L21–L23

Used by every per-exercise processor:
- `src/lib/pose/exercises/pushup.ts` L29–L34
- `src/lib/pose/exercises/squat.ts` L29–L34
- `src/lib/pose/exercises/pull-bar.ts`, `pull-trx.ts` similar

Constant: `SMOOTHING_FACTOR = 0.4` per processor.

---

## Elaborate

### Where this pattern comes from

EMA in its current form is from time-series statistics (Brown, 1956). The discrete recurrence formulation `s_t = α x_t + (1 − α) s_{t−1}` is standard. In signal processing it's called a single-pole IIR (infinite impulse response) filter — "infinite" because every input contributes to all future outputs (exponentially decaying weight).

### The deeper principle

A noisy signal with a known time scale of interest can be filtered by mixing each new sample with a memory of the past, weighted by the desired responsiveness. The mixing coefficient α encodes "how much do I trust now vs. history?". Larger α = trust now more; smaller α = trust history more.

### Where this breaks down

When the signal has both fast (real) and slow (drift) components, EMA can't separate them — it just blurs both. The fix is more sophisticated filters (band-pass, Kalman). For pose-angle motion, the signal is dominated by real motion at ~1Hz–~5Hz and noise at ~10Hz+, which EMA at α=0.4 separates well enough.

The other breakpoint: when the *first* sample is wrong (e.g., a frame where the model glitched). EMA never fully recovers from a bad first value — it asymptotically approaches the correct value but never quite gets there. The codebase's `initialized` flag handles this for the first frame only; subsequent bad frames just contribute α to the smoothed value.

### What to explore next

- [05-rep-counter-state-machine](./05-rep-counter-state-machine.md) → what the smoothed angle feeds into
- [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md) → the surrounding pipeline

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ EMA α=0.4 (taken)                │ Moving average N=10 (alt)        │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Memory           │ 1 scalar                         │ N scalars                        │
│ Per-frame ops    │ 1 multiply + 1 add               │ 1 push + 1 shift + 1 sum/N       │
│ Latency          │ ~2–3 frames effective            │ N/2 frames                       │
│ Warm-up          │ 1 frame                          │ N frames                         │
│ Noise rejection  │ Good for high-freq noise         │ Better for transient spikes      │
│ Tunability       │ α                                │ N                                │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *some* lag — at α=0.4, the smoothed value reaches ~95% of a step input in ~6 frames (200ms at 30fps). For most reps this is invisible. For explosive movements (a kipping pullup, a clean) the lag would matter — but those aren't supported exercises here.

The other cost is *no protection against persistent bad input*. If the pose model glitches for 10 frames in a row, the smoothed angle follows. We don't have a "skip frame if confidence low" guard — see the pose-detection file for that gap.

### Sub-block 2 — what moving average would have cost

Moving average needs a buffer of N samples (10 floats = 40 bytes per joint pair). N/2 frame inherent lag (5 frames = 167ms at 30fps — worse than EMA's effective lag). Warm-up is the first N frames (the average is biased toward zero). Per-frame work is push + shift + sum/N (or maintain running sum with single addition + subtraction). Same complexity class but worse constants.

### Sub-block 3 — the breakpoint

Fine until **explosive-movement exercises become a feature** (Olympic lifts, kipping pullups). At that point we'd need lower α (more responsive) or a different filter entirely (e.g., predict-then-correct).

### Sub-block 4 — what wasn't actually a tradeoff

A Kalman filter for angle estimation would be more sophisticated but unnecessary — we don't have a dynamics model. Kalman is the right tool when you can predict the state's evolution between measurements (e.g., constant velocity). For "human doing an unknown pace pushup" we don't have that.

---

## Tech reference (industry pairing)

### Hand-rolled EMA (single-pole IIR filter)

- **Codebase uses:** `smoothAngle(current, previous, factor)` in `angles.ts` L21–23 — the one-line recurrence `previous + factor * (current - previous)`. The caller keeps one `previous` scalar; init branch seeds it on frame 1 (`pushup.ts`/`squat.ts` L29–34).
- **Why it's here:** the cheapest low-pass filter that exists — one multiply, one add, one state variable on a per-frame hot path.
- **Leading today:** hand-rolled EMA — `adoption-leading` (language-agnostic; ubiquitous in sensor stacks), 2026.
- **Why it leads:** O(1) memory and time, no buffer lag, no dependency; α is the single intuitive tuning knob.
- **Runner-up:** a moving-average / `rxjs`-style operator — clearer intent in a stream pipeline, but adds buffer memory and N/2-sample lag for no accuracy gain here.

### Empirically-tuned α (smoothing factor)

- **Codebase uses:** `SMOOTHING_FACTOR = 0.4` per exercise processor; chosen by sweeping α against downstream rep-counter behavior.
- **Why it's here:** α trades responsiveness against noise rejection, and the right value depends on the input's noise characteristics — there's no closed form.
- **Leading today:** empirical α tuning against the consumer — `adoption-leading` for filter design without a dynamics model, 2026.
- **Why it leads:** the FSM's false-trigger / missed-bottom rates are directly observable, so a sweep finds the value faster than analytical design would.
- **Runner-up:** adaptive α (raise α during fast motion, lower it at rest) — more responsive, but a second mechanism to tune and test; not justified at current accuracy.

---

## Summary

### Concept recap

`smoothAngle(current, previous, factor)` computes `previous + factor * (current − previous)`. Constant memory (the caller keeps one `previous` value), constant time per frame. Each per-exercise processor calls it with `factor = 0.4`. The constraint forcing this design was the jitter in pose-landmark output. Moving average would have required a buffer and added inherent lag; EMA is cheaper and more responsive. The cost is some lag on rapid motion and no protection against persistent bad input.

### Key points

- `smoothed = previous + α × (current − previous)` — three equivalent forms, one truth.
- α controls trust-in-now vs. trust-in-history.
- α = 0.4 was tuned empirically; lower lags too much, higher lets jitter through.
- O(1) memory and time per frame.
- First frame must seed `previous = raw` or the smoothed value asymptotes from zero for many frames.

---

## Interview defense

### Likely questions

**Q: Walk me through the formula.  [mid]**
A: `smoothed = previous + α × (current − previous)`. Read it as "nudge the previous smoothed value toward the current sample by α of the gap". α = 0 means never move; α = 1 means jump to current; α = 0.4 means take 40% of the difference each frame. It's a one-line low-pass filter.

```
   α = 0.4
   prev = 100
   current = 130

   gap = 130 − 100 = 30
   smoothed = 100 + 0.4 × 30 = 112
   (40% of the way from 100 to 130)
```

**Q: Why EMA over moving average?  [senior]**
A: EMA is O(1) memory and has no buffer-induced lag. Moving average requires a buffer (one scalar per sample in the window) and has an inherent (N/2)-sample delay because the average lags the current value by half the window. EMA gives the most weight to the most recent sample, which is what we want for motion tracking. The one-parameter (α) tuning is also easier than the N-parameter (window size) tuning.

```
   EMA                                  │   Moving average
   ────────────────────────────────── │ ──────────────────────────────────
   O(1) memory                          │   O(N) memory (buffer)
   1 mul + 1 add per frame              │   sum or push+shift per frame
   no inherent lag (responsive)         │   N/2 sample lag
   warms up in 1 frame                  │   warms up in N frames
```

**Q: How do you tune α?  [arch]**
A: Empirically against the downstream consumer. Too low (α=0.1) and the smoothed value still falls when the user has already reached the bottom — the rep counter misses the `bottom` transition timing. Too high (α=0.8) and pose jitter leaks through — the counter false-triggers. In between is a range; we picked α=0.4 because it gave the cleanest counter behavior on real-user video. There's no closed-form answer because it depends on the noise characteristics of the input.

```
┌─ α sweep, downstream FSM behavior ────────────────────────┐
│  α = 0.1   smooth but lagged; misses fast bottom         │
│  α = 0.2   slightly better but still lag                 │
│  α = 0.4   ← picked. clean transitions, no jitter        │
│  α = 0.6   responsive, occasional false trigger          │
│  α = 0.8   raw-ish, frequent false trigger               │
└──────────────────────────────────────────────────────────┘
```

### One-line anchors

- One multiply, one add, one scalar of state.
- α blends now vs. history.
- EMA is moving-average's faster cousin.
- Seed `previous = raw` on frame 1.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the recurrence and three equivalent forms.

### Level 2 — Explain it out loud
Why is EMA O(1) memory? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You need to smooth both a fast signal (rep angle) and a slow signal (plank alignment over 30 seconds). Should they use the same α?"

Reference `src/lib/pose/exercises/plank.ts` and pushup configs.

### Level 4 — Defend the decision you'd change
"Would you ever use a Kalman filter instead?" When?

### Quick check — code reference test
- What file has `smoothAngle`?
- What's the formula?
- What's the smoothing factor for pushups?

Then verify.

---
