# Sorting sessions chronologically

**Industry name(s):** Comparator-based sort, key-based sort
**Type:** Industry standard · Language-agnostic

> Before replaying session history, `reconstructFromSessions` sorts a copy of the session array by ISO date string converted to epoch milliseconds. Order is load-bearing because gates depend on *consecutive* clean sessions.

**See also:** → [01-system-design/06-reconstruction-on-reinstall](../01-system-design/06-reconstruction-on-reinstall.md)

---

## Why care

You're handed a stack of receipts and asked "did this person spend more than $100 three days in a row?" You can't answer without sorting them by date first. Sorting before processing is the most boring possible step in any pipeline — and that's why it's the easiest to skip and the most damaging when you do.

The pattern is **comparator sort** — Array.prototype.sort with a `(a, b) => number` callback. Same shape used everywhere sorting matters: SQL `ORDER BY`, leaderboards, calendar entries. Here it's the prerequisite to every session-history projection.

---

## How it works

Picture a deck of cards dealt in random order. You can't play a game until they're in order. Sorting is the act of imposing that order before the game starts.

The strategy: **immutable copy, comparator on numeric date, ascending order**.

```typescript
const sorted = [...sessions].sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
);
```

`src/lib/game/reconstruct.ts` L17–L19.

**Step 1 — Spread copy.** `[...sessions]` clones the input array. `sort` mutates in place; spreading first preserves the caller's array. If you're coming from frontend, this is the same instinct as `setState(prev => [...prev, item])` — never mutate; produce a new value.

**Step 2 — Comparator.** Subtract `a.date` from `b.date` as epoch milliseconds. Negative result → `a` before `b`; positive → `b` before `a`; zero → equal. This is the canonical comparator shape; it works because `Date.getTime()` is a monotonic number.

**Step 3 — Default `Array.prototype.sort`.** V8 / Hermes use TimSort, which is O(n log n) average and stable (equal-keyed elements keep their input order). The stability matters here because two sessions logged on the exact same ISO timestamp (rare but possible from Notion roundtrips) keep their relative order.

### Why `new Date(...).getTime()` and not `localeCompare(...)`?

ISO 8601 strings (`'2026-05-11T10:00:00.000Z'`) *do* sort correctly as strings — that's the whole point of ISO. So `(a, b) => a.date.localeCompare(b.date)` works too. The `.getTime()` form is used here because the resulting numbers are also useful in surrounding code (e.g., `notionEditTime > localEditTime` in the conflict-resolution logic), so the codebase is consistent in treating dates as epoch ms.

---

## Brute force vs optimal — they're the same

This is the rare case where there's no asymptotic improvement over the obvious approach. The brute force *is* `sort`. Custom sorts (bubble, insertion, quicksort) would be slower and more code.

```
Comparator-sort                  Bubble sort (don't)
─────────────────────────────    ─────────────────────────────
O(n log n) average               O(n²) average
TimSort, stable                  Stable
~10 lines including comparator   ~25 lines, custom implementation
```

### When brute force is fine

For N < ~50 sessions, even O(n²) would feel instant. The point of choosing `sort` isn't speed at small N — it's that `sort` is what every other JS engineer expects to see, and adding a custom sort would be a "why?" in code review.

### Execution trace

```
input sessions:
   [ { id: 'A', date: '2026-04-12' },
     { id: 'B', date: '2026-04-10' },
     { id: 'C', date: '2026-04-11' } ]

step 1: spread copy
   copy = [ A, B, C ]  (separate array, same items)

step 2: sort starts (TimSort)
   compare A, B:  A.ts - B.ts = +2  →  swap (B, A)
   state: [ B, A, C ]
   compare A, C:  A.ts - C.ts = +1  →  swap (C, A)
   state: [ B, C, A ]
   compare B, C:  B.ts - C.ts = -1  →  no swap
   state: [ B, C, A ]

result:
   [ { id: 'B', date: '2026-04-10' },
     { id: 'C', date: '2026-04-11' },
     { id: 'A', date: '2026-04-12' } ]

input array still:
   [ A, B, C ]   (unchanged — spread copy preserved it)
```

---

## Sorting — diagram

```
┌─ before ─────────────────────────────────────────────────┐
│  sessions    [ session3, session1, session5, session2 ]  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼  [...sessions].sort(comparator)
┌─ after ──────────────────────────────────────────────────┐
│  sorted      [ session1, session2, session3, session5 ]  │
│  sessions    [ session3, session1, session5, session2 ]  │  ← untouched
└──────────────────────────────────────────────────────────┘

   comparator(a, b) = new Date(a.date).getTime()
                    - new Date(b.date).getTime()

   negative → a before b   (older date sorts earlier)
   positive → b before a
   zero     → equal, stable order preserved
```

---

## In this codebase

**File:** `src/lib/game/reconstruct.ts`
**Function / class:** `reconstructFromSessions(sessions)`
**Line range:** L17–L19

Same comparator pattern shows up in:
- `useExerciseForm.ts` L33–L37 — sorting sessions by date DESC for "last session" lookup.

---

## Elaborate

### Where this pattern comes from

`Array.prototype.sort` with a comparator has been in JS since ECMAScript 1 (1997). Comparator-based sort generalizes the older "key extraction" pattern from C — you express "what makes a < b" inline. The implementation evolved over time: V8 switched to TimSort in 2018; Hermes (React Native's JS engine) uses a different stable sort.

### The deeper principle

Sorting is a prerequisite, not the work. A sort step's existence in your pipeline tells you "the next step depends on order". Without the sort, the next step's correctness becomes data-dependent — *if the input happened to be ordered*, it works; otherwise it doesn't. The sort step makes the dependency explicit.

### Where this breaks down

Two sessions with identical ISO timestamps (rare but possible from Notion's per-second precision) sort in arbitrary order. If the gate-replay algorithm depended on differentiating them, this would matter — but the replay treats sessions at the same timestamp as fungible.

The other breakpoint: at very large N (~10M items) the comparator's `new Date(...)` allocations would dominate. We'd cache the epoch ms once or use a Schwartzian transform. We're nowhere near this scale.

### What to explore next

- [01-system-design/06-reconstruction-on-reinstall](../01-system-design/06-reconstruction-on-reinstall.md) → why this sort exists
- [08-streak-fold](./08-streak-fold.md) → another order-dependent computation

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Comparator sort (taken)          │ Pre-sorted index (alternative)   │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ CPU per call     │ O(n log n)                       │ O(n) maintenance + O(1) read     │
│ Memory           │ One extra array copy             │ Persistent index alongside data  │
│ Code complexity  │ One line                         │ Index maintenance on every write │
│ Correctness      │ Order is fresh                   │ Index can drift if not updated   │
│ N scale (current)│ Trivial at ~1000 sessions        │ Same                             │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is the per-call `O(n log n)` plus the array allocation. At 10,000 sessions that's still milliseconds. The cleaner option (maintain an index sorted by date) would only matter if we sorted constantly — and we don't; reconstruction runs at most once per app load.

### Sub-block 2 — what a pre-sorted index would have cost

We'd need to maintain a separate data structure (a SQL index on `sessions.date` would suffice, but reconstruction reads `getSessions()` which already orders by date DESC). Adding an "ascending date" index requires either changing the query or sorting after read. Either way, the sort step is now somewhere; we've just hidden it.

### Sub-block 3 — the breakpoint

Fine until session count exceeds ~1M, at which point a Date-allocation per comparison becomes the bottleneck. The fix is to pre-extract `dateMs` once into a parallel array and sort indices. We won't hit this.

### Sub-block 4 — what wasn't actually a tradeoff

A custom non-comparator sort (e.g., bucket sort by year-month) would be over-engineering; the comparator sort is already correct and fast at this scale.

---

## Summary

### Concept recap

`reconstructFromSessions` opens with `[...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())`. The spread creates an immutable copy; the comparator sorts ascending by epoch ms. The result is fed into the gate-replay loop, which depends on chronological order because gates count consecutive clean sessions. The constraint that forces sorting is the consecutive-clean rule; the cost paid is one O(n log n) pass and one extra array.

### Key points

- Lives in the prerequisite step of any order-dependent computation.
- Spread before sort preserves the caller's array.
- The comparator returns `a.ts - b.ts`; negative means a is older and sorts earlier.
- TimSort is stable, so same-timestamp sessions keep their input order.
- Order *is* the work — the rest of `reconstructFromSessions` assumes the sort already happened.

---

## Interview defense

### What an interviewer is really asking

Behind "why are you sorting" is "do you understand which steps depend on which other steps?" The signal is whether you can name the consecutive-clean rule and explain that out-of-order input would silently produce wrong gates.

### Likely questions

**Q: Walk me through the comparator.  [mid]**
A: `(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()`. Both sides converted to epoch milliseconds. Subtraction yields negative if `a` is older, positive if `a` is newer, zero if same. TimSort uses the sign to decide ordering; stability ensures equal-timestamp sessions keep input order. Result is ascending by date.

```
   a.date = '2026-04-10'   → 1744... ms
   b.date = '2026-04-12'   → 1744... + 2 days
   a - b                   → negative
   → a sorts before b
```

**Q: Why spread the array first?  [senior]**
A: `Array.prototype.sort` mutates in place. The caller (which is `useGameState.load`) is using the same array for other purposes — passing the mutated version to subsequent steps would silently change their inputs. Spread creates a shallow copy; sort mutates the copy. The original is preserved. The pattern is "compute pure on a copy, never mutate inputs".

```
   Without spread (bug)                  │   With spread (taken)
   ──────────────────────────────────── │ ────────────────────────────────────
   sessions.sort(...)                    │   const sorted = [...sessions]
   caller's array is now mutated         │     .sort(...)
   downstream readers see new order      │   sessions untouched
   silent contract violation             │   pure transformation
```

**Q: What if you had 10M sessions and needed to sort every render?  [arch]**
A: We don't, but if we did, the bottleneck would be the `new Date(...)` per comparison — millions of allocations. The fix is the Schwartzian transform: pre-compute `dateMs` into a parallel array once, sort indices by that, then materialize the sorted sessions. That's O(n) extra space for one allocation instead of O(n log n) allocations. Beyond ~10M we'd push the sort to the database (`ORDER BY date ASC` in SQL) and skip the JS sort entirely.

```
┌─ at 10M sessions ──────────────────────────────────────┐
│  comparator-sort        ~5s, GC pressure ←─ breaks    │
│  Schwartzian            ~1s, one allocation            │
│  SQL ORDER BY           negligible, DB-side            │
└────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: Could you sort by ISO string directly without converting to numbers?**
A: Yes — ISO 8601 strings sort lexicographically the same as chronologically because of the fixed-width zero-padded format. `localeCompare` or just `<` would work. We use `.getTime()` for consistency with the rest of the codebase, where dates show up as epoch ms in other comparisons (e.g., the 2-minute conflict bias). The string sort would be marginally cheaper (no `new Date` allocation per comparison) but consistency wins.

```
   String sort (works)              │   Epoch-ms sort (taken)
   ──────────────────────────────── │ ────────────────────────────────────
   '2026-04-10' < '2026-04-12'      │   1744... < 1744... + 2 days
   no allocation per compare        │   one Date allocation per compare
   relies on ISO format             │   relies on .getTime() correctness
```

### One-line anchors

- Spread, then sort.
- Comparator returns `a - b` for ascending.
- Order is a prerequisite; the next step depends on it.
- TimSort is stable; same-keyed items keep input order.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the before/after arrays + the comparator's logic.

### Level 2 — Explain it out loud
Explain why the spread is needed. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You're sorting `sessions` by category first, then by date within category. Write the comparator."

Compare against patterns in `useExerciseForm.ts` L33.

### Level 4 — Defend the decision you'd change
"Would you replace the per-call sort with a maintained sorted index?" Walk through the tradeoff table.

### Quick check — code reference test
- What file has the sort?
- What's the comparator signature?
- Does `sort` mutate?

Then verify.
