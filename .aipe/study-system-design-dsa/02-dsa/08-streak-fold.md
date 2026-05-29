# Streak fold

**Industry name(s):** Fold / reduce, accumulator pattern, consecutive-counter
**Type:** Industry standard · Language-agnostic

> Iterate week history. For each complete week, increment streak. For each incomplete week, reset streak to zero. Final value is the current streak. One pass, constant memory, the canonical fold.

**See also:** → [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) · → [07-week-start-derivation](./07-week-start-derivation.md)

---

## Why care

"How many days in a row have you done X?" shows up everywhere — Duolingo, GitHub contributions, Twitter posting streaks. The data structure is a history; the operation is a fold that *adds* on success and *resets* on failure. One missed day breaks the chain. The algorithm is mundane and the failure mode is dramatic, which is what makes it interesting from a product perspective.

The pattern is **fold with reset** — accumulator that grows on positive events and snaps back to zero on negative ones. Same shape as winning-streaks, longest-run-of-heads in coin flips, and any "consecutive things" metric.

---

## How it works

Start at zero. Walk the history. Each week is either complete (all three categories logged) or not. Complete → increment. Not complete → reset to zero. At the end of the walk, return the accumulator.

```typescript
export function calculateStreak(history: WeekProgress[]): number {
  let streak = 0;
  for (const week of history) {
    if (isWeekComplete(week)) {
      streak += 1;
    } else {
      streak = 0;
    }
  }
  return streak;
}
```

`src/lib/game/streaks.ts` L18–L28.

### The shape

It's a **`reduce`** rewritten as a `for` loop. In a more functional style:

```typescript
return history.reduce(
  (streak, week) => isWeekComplete(week) ? streak + 1 : 0,
  0
);
```

Both forms are identical in semantics. The for-loop version reads slightly more clearly for the "branch on condition, accumulate" pattern; the reduce form is one expression.

### Why the input is sorted

`history` comes from `buildWeekHistory(sessions)`, which sorts by week start ascending (see [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md)). Sorted-oldest-to-newest order is critical because the fold's *direction* matters: we process weeks chronologically. A missing week in the middle resets the count, and "now" is at the end.

If we walked in reverse (newest to oldest), the fold would also work but the semantics would be different — we'd be computing "how many *recent* weeks were complete" rather than the "current streak". The codebase iterates oldest-to-newest and the *final* accumulator value is the answer.

### What `isWeekComplete` checks

```typescript
export function isWeekComplete(week: WeekProgress): boolean {
  return CATEGORIES.every(c => week.sessionsCompleted[c]);
}
```

`week-progress.ts` L46–L48. All three category booleans must be true. Two-out-of-three is not enough; the streak demands all three. This is product policy embedded in the predicate.

### Complexity

- O(n) where n is week count.
- O(1) extra memory (one scalar accumulator).
- Single pass through the array.

The cheapest possible algorithm for this question.

---

## Brute force vs optimal — they're the same

```
The fold IS the optimal:               Recompute on each week (naive):
─────────────────────────────────      ─────────────────────────────────
single pass, O(n)                       look up "last incomplete week"
streak = 0                               on each query, O(n²)
for each: increment or reset             far worse, no benefit
return streak
```

There's no asymptotic improvement over a single pass. Any "smarter" algorithm has to look at every week at least once, and the fold already does only that.

### Execution trace

```
history (sorted oldest → newest):

  W0  push:t pull:t squat:t   ← complete
  W1  push:t pull:t squat:t   ← complete
  W2  push:t pull:f squat:t   ← incomplete (pull missed)
  W3  push:t pull:t squat:t   ← complete
  W4  push:t pull:t squat:t   ← complete
  W5  push:t pull:t squat:t   ← complete

fold trace:

  streak = 0
  W0 complete → streak = 1
  W1 complete → streak = 2
  W2 incomplete → streak = 0   ← reset!
  W3 complete → streak = 1
  W4 complete → streak = 2
  W5 complete → streak = 3

return 3
```

The pre-W2 streak of 2 is lost; we don't track "longest streak ever" — only "current streak as of now".

### When brute force is fine

There is no brute force worth comparing to. This is already the minimum-viable algorithm.

---

## Streak fold — diagram

```
   history (sorted oldest → newest)

   W0  complete   ┐
   W1  complete   │ → streak = 1, 2
   W2  miss       │ → streak = 0 (reset)
   W3  complete   │
   W4  complete   │ → streak = 1, 2
   W5  complete   ▼ → streak = 3

                    └─ current streak

                    ────────────────
                       2 0 0 0 3
                       │       └ final answer
                       │
                       previous streak peak (lost — not tracked)

   For each week:
     ┌── complete ──►  streak += 1
     │
     └── incomplete ──►  streak = 0
```

---

## In this codebase

**File:** `src/lib/game/streaks.ts`
**Function / class:** `calculateStreak(history)`, `updateStreakOnWeekEnd(currentStreak, endedWeek)`
**Line range:** L8–L28

Called by `useGameState.ts` L145 — `const computedStreak = calculateStreak(prevWeeks);`.

`prevWeeks` comes from `buildWeekHistory(sessions)` which already excludes the current week and sorts ascending.

---

## Elaborate

### Where this pattern comes from

`reduce` / `fold` is the universal pattern for collapsing a list to a value (LISP, 1960). The reset-on-failure variant is in every "consecutive count" problem in interview prep books. It's also how every "streak" feature in consumer apps is implemented.

### The deeper principle

A fold encodes "process each element with knowledge of the accumulator". The pattern generalizes to any "running quantity" — counts, sums, maxes, mins, custom records. When you can express your computation as "start state + per-element update rule", fold is the right shape.

### Where this breaks down

When the input isn't pre-sorted by the dimension you're folding over. If `history` were in arbitrary order, the streak meaning would be lost. The fix is to sort first; this codebase relies on `buildWeekHistory` to do that.

The other breakpoint: when the predicate is fuzzy (e.g., "missed by less than one rep") — the binary complete/incomplete reset becomes too harsh. The fix is a different scoring function (e.g., gradient instead of step). We don't need it; the current product is binary-by-design.

### What to explore next

- [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) → produces the sorted input
- [01-system-design/05-derived-state](../01-system-design/05-derived-state.md) → why the streak is a fold not a stored value

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ One-pass fold (taken)            │ Stored streak counter (alt)      │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Time per call    │ O(weeks)                         │ O(1) read                        │
│ Memory           │ O(1) extra                       │ O(1) stored + reads/writes       │
│ Consistency      │ Always matches history           │ Can drift if not maintained      │
│ On reinstall     │ Recomputed correctly             │ Needs sync or recomputation      │
│ Code volume      │ 9 LOC                            │ Update at every save point       │
│ Bug surface      │ Tiny (sorted input is the rule)  │ Forgetting to update is silent   │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is recomputing on every `load()` — but at ~100 weeks per user this is sub-millisecond. We pay nothing meaningful.

### Sub-block 2 — what a stored counter would have cost

A stored streak (one row, one column) would have to be updated on every session save AND every session delete AND on remote-side edits AND on reinstall. Forgetting any path means a stale counter. The derive-from-history approach is *always correct by construction* — see [01-system-design/05-derived-state](../01-system-design/05-derived-state.md) for the general principle.

### Sub-block 3 — the breakpoint

Fine until session count exceeds ~50 years of history (~2500 weeks). At that point recomputing on every load becomes noticeable. The fix is checkpointing — store a "streak as of week W" and only fold the tail.

### Sub-block 4 — what wasn't actually a tradeoff

A SQL `WITH RECURSIVE` query to compute the streak in the database was not picked because (a) the data is already in JS for the same load(), and (b) recursive CTEs are awkward to reason about. Stay in JS.

---

## Tech reference (industry pairing)

### Fold (`for`-loop accumulator / `Array.prototype.reduce`)

- **Codebase uses:** `calculateStreak` (`streaks.ts` L18–28) — a `for` loop over sorted week history, `streak += 1` on `isWeekComplete`, `streak = 0` otherwise. The single-week variant `updateStreakOnWeekEnd` (L8–13) is the same rule as a ternary.
- **Why it's here:** the canonical "collapse a list to a running value" shape; the `for` form reads slightly clearer than `reduce` for branch-and-accumulate.
- **Leading today:** fold / reduce — `adoption-leading` (language-agnostic), 2026.
- **Why it leads:** O(n) one pass, O(1) accumulator, no dependency; the reset-on-failure variant is the textbook consecutive-counter.
- **Runner-up:** `Array.prototype.reduce` one-liner (`history.reduce((s, w) => isWeekComplete(w) ? s + 1 : 0, 0)`) — terser, identical semantics; the for-loop is kept for readability of the branch.

### Derive-not-store (cross-cutting choice)

- **Codebase uses:** the streak is recomputed from week history on every `load()`, never persisted — see [01-system-design/05-derived-state](../01-system-design/05-derived-state.md).
- **Why it's here:** a stored counter is a second source of truth that can silently drift from the session log; recomputation is correct by construction.
- **Leading today:** derive-from-log for cheap projections — `adoption-leading`, 2026.
- **Why it leads:** eliminates the update-on-every-mutation obligation; O(weeks) is free at this scale.
- **Runner-up:** stored streak with checkpointing — the right move only past ~2500 weeks, where folding the full history per load stops being free.

---

## Summary

### Concept recap

`calculateStreak` walks an ascending-sorted week history. For each complete week (`isWeekComplete` requires all three categories logged), the accumulator increments. For each incomplete week, it resets to zero. The final value is the current streak. The function is pure (no I/O), so it's safe to call on every render — but the codebase calls it once per `load()` and caches in React state. The constraint that forced this design was the derive-don't-sync rule: streaks are a projection of session history, not stored truth. The cost paid is recomputation on every load, which is O(weeks) and trivially fast at any realistic scale.

### Key points

- Fold with reset: increment on success, snap to zero on failure.
- Input must be sorted oldest → newest for "current streak" semantics.
- `isWeekComplete` requires all three categories — product policy, not a coding artifact.
- Pure function; output depends only on inputs.
- The streak is derived, not stored — see [05-derived-state](../01-system-design/05-derived-state.md).

---

## Interview defense

### Likely questions

**Q: Walk me through the fold.  [mid]**
A: Start at zero. For each week in oldest-to-newest order: if all three categories were logged, increment; if not, reset to zero. The final accumulator is the current streak. Length matters because "now" is at the end; a missed week breaks the chain back to zero.

```
   W0 W1 W2 W3 W4 W5
   ✓  ✓  ✗  ✓  ✓  ✓
   1  2  0  1  2  3   ← streak after each week
                  ↑
            current streak = 3
```

**Q: Why is the streak recomputed instead of stored?  [senior]**
A: Two reasons. First, the streak is a pure function of session history — storing it would create a second source of truth that *should* agree with the recompute but might not, which is the worst kind of bug. Second, the cost is trivial: O(weeks) at sub-millisecond per call. The recompute happens once per app load; it's free. Storing would create an obligation to update it on every session save, delete, and remote-side edit — a much larger surface to maintain.

```
   Recompute (taken)                     │   Stored (alternative)
   ────────────────────────────────── │ ────────────────────────────────
   O(weeks) per call ~ sub-ms          │   O(1) read; O(?) update
   always matches history              │   can drift, silently
   no obligation to update             │   must update on save/delete/sync
   no extra storage                    │   one row, one column
   right when recompute is cheap       │   right when recompute is expensive
```

**Q: What if I had 100k weeks of history?  [arch]**
A: 100k weeks is about 1,900 years — not a real scale. But at, say, 10k weeks (200 years) the fold is still <10ms. The first scale concern would be loading the full history into JS (memory pressure). The fix is checkpointing: store a "streak as of week W" snapshot and only fold the tail past W. Schema change is one new table; semantics stay the same.

```
┌─ at 10k weeks ─────────────────────────────────────────┐
│  fold time           ~5ms                              │
│  memory for history  ~MB                               │
│  bottleneck          loading getSessions               │
│  fix: checkpoint snapshots, fold the tail              │
└────────────────────────────────────────────────────────┘
```

### One-line anchors

- Increment on success, reset on failure.
- Sorted input is a prerequisite.
- The streak is a projection, not a record.
- O(weeks) is free; storage would create a drift bug.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the fold trace with a miss in the middle.

### Level 2 — Explain it out loud
Why doesn't this need to be stored? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add 'longest streak ever'. What changes in `calculateStreak`?"

Reference `streaks.ts` L18.

### Level 4 — Defend the decision you'd change
"Would you ever store the streak?" When?

### Quick check — code reference test
- What file has `calculateStreak`?
- What's the initial accumulator?
- What predicate gates the increment?

Then verify.

---
Updated: 2026-05-17 — "Notion-side edits" replaced with "remote-side edits" for provider neutrality.
Updated: 2026-05-29 — Added Tech reference section (fold/reduce / derive-not-store) per v1.42.0. Refreshed calculateStreak span L18–27→L18–28 and call site useGameState L150→L145. (isWeekComplete L46–48, line range L8–28 accurate.)
