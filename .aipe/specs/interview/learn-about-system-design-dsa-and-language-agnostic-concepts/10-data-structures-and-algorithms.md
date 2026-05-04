# 10. Data structures and algorithms

DSA grounded in actual operations in this codebase. For each: where it lives, the brute-force version, the optimal version, and the trace.

## Problem 1 — Sliding-window cleanliness check

**Statement.** Given a stream of workout sessions for a given (category, level), a "gate pass" requires 3 consecutive clean sessions. A clean session resets the count on a dirty one. Stream is append-mostly; you must answer "what is the current passes count?" after each insert, and "has the gate passed?" should fire the moment count reaches 3.

**Where it lives.** `src/lib/game/gate-check.ts` and `src/lib/game/reconstruct.ts`.

**Brute force — recompute from full history each time. O(n) per insert, O(1) extra space.**

```typescript
function consecutivePasses(sessions: WorkoutSession[]): number {
  let count = 0;
  for (const s of sessions) {
    count = isClean(s) ? count + 1 : 0;
  }
  return count;
}
```

**Trace** (sessions in order; ✓ = clean, ✗ = dirty):
```
sessions:   ✓   ✓   ✗   ✓   ✓   ✓
count:      1   2   0   1   2   3   ← gate passes here
```

**Optimal — incremental update on each insert. O(1) per insert.**

```typescript
// Stored per gate: consecutivePasses
function onSessionInserted(gate: GateProgress, session: WorkoutSession) {
  if (isClean(session)) {
    gate.consecutivePasses += 1;
    if (gate.consecutivePasses >= 3) levelUp();
  } else {
    gate.consecutivePasses = 0;
  }
}
```

**Trace.**
```
state:      gate.consecutivePasses = 0
insert ✓ →  1
insert ✓ →  2
insert ✗ →  0
insert ✓ →  1
insert ✓ →  2
insert ✓ →  3  → levelUp(), reset for next level
```

**Why optimal wins.** O(1) per session for the common path (steady-state usage) vs O(n) over the lifetime of the user. The brute-force version is what the *reconstructor* runs (because it's replaying history from scratch); the incremental version is what runs at session-save time. Both exist for different reasons.

**Interviewer follow-up:** *"Why two implementations of the same logic?"*
> They're not the same logic — they're two evaluation strategies for the same recurrence. The incremental one is online (one new datum, update state); the batch one is offline (full history, recompute state). Having both lets me evaluate cheaply at runtime and reconstruct deterministically on reinstall. The contract is that they always agree, which I enforce by sharing `isClean()` between them.

---

## Problem 2 — Last-edit-wins merge of two record streams

**Statement.** Given two arrays of records — local sessions and remote sessions — keyed by stable ID, produce a merged stream where: records present in only one side are kept; records present in both are resolved by `updatedAt` with a 2-minute remote bias. Output must be sorted by date.

**Where it lives.** `src/services/notion/sync.ts` (the pull-and-merge step).

**Brute force — for each remote, scan local. O(n·m).**

```typescript
function merge(local: Session[], remote: Session[]): Session[] {
  const out: Session[] = [...local];
  for (const r of remote) {
    const i = out.findIndex(l => l.notionPageId === r.notionPageId);
    if (i < 0) out.push(r);
    else if (r.updatedAt - out[i].updatedAt > 2 * 60_000) out[i] = r;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
```

**Trace** (local L1 L2, remote R2 R3; L2/R2 share ID):
```
out = [L1, L2]
r=R2: find by id → idx 1, R2.updatedAt - L2.updatedAt = 5min > 2min → replace
out = [L1, R2]
r=R3: find by id → -1 → push
out = [L1, R2, R3]
sort by date → [L1, R2, R3]
```

**Optimal — index local by ID, single pass. O(n + m).**

```typescript
function merge(local: Session[], remote: Session[]): Session[] {
  const byId = new Map<string, Session>();
  for (const l of local) byId.set(l.notionPageId, l);
  for (const r of remote) {
    const l = byId.get(r.notionPageId);
    if (!l || r.updatedAt - l.updatedAt > 2 * 60_000) byId.set(r.notionPageId, r);
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

**Trace.**
```
byId: { L1.id: L1, L2.id: L2 }
r=R2 (== L2.id): L2 exists, R2.updatedAt - L2.updatedAt > 2min → byId[L2.id] = R2
r=R3 (new): byId[R3.id] = R3
byId: { L1.id: L1, L2.id: R2, R3.id: R3 }
sort → [L1, R2, R3]
```

**Why optimal wins.** Hash lookup is O(1); the brute force is quadratic and at the typical sync size (hundreds of sessions) the constant matters: 500 × 500 = 250,000 comparisons per sync vs 1,000 hash ops. On a phone CPU, the difference is hundreds of ms.

**Interviewer follow-up:** *"What if `notionPageId` is null?"*
> Local sessions created on this device but not yet pushed have `notionPageId = null`. They can't conflict with anything remote (remote only has things that have been pushed), so they're never matched and always fall through into the output unchanged. They get an ID after the push step, on the next sync.

---

## Problem 3 — Skill-tree node classification

**Statement.** Given user levels per category and the user's gate progress map, classify every cell of a 5×3 grid as one of: `passed`, `current`, `in-progress`, `locked`. Render the result.

**Where it lives.** `src/components/SkillTree.tsx`.

**Brute force — for each cell, scan gate-progress array.**
```
for level in 1..5:
  for cat in [push, pull, squat]:
    if level < user.levels[cat]: status = 'passed'
    elif level == user.levels[cat]: status = 'current'
    elif gateProgress.find(g => g.level === level && g.category === cat): status = 'in-progress'
    else: status = 'locked'
```
O(n) per cell × 15 cells = O(15n) where n = gates count.

**Optimal — index gate progress by `(level, category)`, then per-cell lookup is O(1).**
```typescript
const byKey = new Map<string, GateProgress>();
for (const g of gates) byKey.set(`${g.level}:${g.category}`, g);

for (const level of [1,2,3,4,5]) {
  for (const cat of CATEGORIES) {
    const cur = user.levels[cat];
    let status: Status;
    if (level < cur) status = 'passed';
    else if (level === cur) status = 'current';
    else if (byKey.get(`${level}:${cat}`)?.consecutivePasses) status = 'in-progress';
    else status = 'locked';
    cells.push({ level, cat, status });
  }
}
```

**Trace** (user.levels = {push:2, pull:1, squat:3}; gates: [{push,3,passes:1}]):
```
(L5,push):   5 > 2, no gate entry            → locked
(L5,pull):   5 > 1, no gate entry            → locked
(L5,squat):  5 > 3, no gate entry            → locked
(L4,push):   4 > 2, no gate entry            → locked
... (skip to interesting cells)
(L3,push):   3 > 2, byKey has push:3 (1)     → in-progress
(L3,squat):  3 == 3                          → current
(L2,push):   2 == 2                          → current
(L1,pull):   1 == 1                          → current
(L1,push):   1 < 2                           → passed
```

**Why optimal wins.** Building the index once is O(n); the grid render becomes O(15) hash lookups. The brute force re-scans gates for every cell; with 15 cells and growing gate history, the constant factor adds up on every render.

**Interviewer follow-up:** *"Why a Map and not just `gates.find()` inline?"*
> Two reasons. The hot reason: `<SkillTree>` re-renders when `gates` changes; the index gets memoised against the gates reference, so re-renders that don't change gates pay zero index-build cost. The cold reason: the `find()` inline version reads as O(15) but is actually O(15·n) and hides that fact. Naming the index makes the complexity visible.

---

## Problem 4 — Smoothed-angle FSM transition

**Statement.** Given a stream of joint angles at 30fps, output a stream of "rep counted" events. Each rep is a full traversal of `ready → down → bottom → up → ready`. Smooth the input. Use 10° hysteresis at every threshold.

**Where it lives.** `src/lib/pose/rep-counter.ts`.

**Brute force — threshold-only, no FSM.**
```typescript
let lastBelow = false;
let count = 0;
for (const θ of stream) {
  const below = θ < 90;
  if (below && !lastBelow) count += 1;  // wrong: counts a single bounce
  lastBelow = below;
}
```
Single-threshold counting — O(1) per frame, but counts noise as reps.

**Optimal — EMA smoothing + FSM with hysteresis.**
```typescript
let s = NaN, phase: Phase = 'idle', count = 0;
const α = 0.3, h = 10;

function onFrame(θ: number) {
  s = isNaN(s) ? θ : α * θ + (1 - α) * s;
  switch (phase) {
    case 'idle':   if (s > 160) phase = 'ready'; break;
    case 'ready':  if (s < 90 - h) phase = 'down'; break;
    case 'down':   if (s < 90 + h && s > 90 - h) phase = 'bottom'; break;
    case 'bottom': if (s > 90 + h) phase = 'up'; break;
    case 'up':     if (s > 160 - h) { count += 1; phase = 'ready'; } break;
  }
}
```
O(1) per frame, O(1) state.

**Trace** (frames at 30fps, raw θ — small jitter at the bottom of the rep):
```
frame  raw θ   smoothed s   phase
  1    170     170          idle   → ready (s > 160)
  2    150     164          ready
  3     85     140.3        ready
  4     78     121.6        ready  → down  (s < 80)   no, s=121, still ready
                                          (showing that smoothing matters)
  5     82      109          ready  → down  (need s < 80)
  ...
  10    78      82           down   → bottom (s within [80,100])
  11    79      81           bottom
  12    81      81           bottom
  13    91      84           bottom → up   (s > 100)   not yet
  14    100     89           bottom → up   (s > 100)   not yet
  15    120     98           bottom → up   (s > 100)
  16    160     117          up
  17    170     132          up
  18    175     145          up
  19    175     154          up
  20    175     160          up    → ready (s > 150 = 160-h), count=1
```

**Why optimal wins.** The brute force counts every threshold crossing — a single noisy frame near 90° increments the counter. The FSM requires a *full* traversal of all four phases plus hysteresis, which means a real rep (which is slow, ~0.5–1.5s) gets counted and a sub-frame jitter doesn't.

**Interviewer follow-up:** *"What's α=0.3 doing exactly?"*
> 30% weight to the new sample, 70% to the running estimate. Larger α → faster response, more noise; smaller α → slower response, smoother. 0.3 was tuned by watching the debug HUD on real workouts; below 0.2 the counter lagged the user noticeably, above 0.4 it picked up jitter. There's no closed-form right answer — it's a tradeoff between latency and stability that depends on the input signal's noise floor.
