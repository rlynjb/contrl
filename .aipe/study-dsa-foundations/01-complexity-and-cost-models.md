# 01 — Complexity and cost models

**Big-O / asymptotic analysis / amortized analysis** — Industry standard.

## Zoom out, then zoom in

Big-O is the language every other chapter uses to compare algorithms. Before you can say "a hash-map lookup beats a linear scan," you need a shared way to *measure*. That measure isn't seconds (machines vary) and isn't lines of code (they lie) — it's how the work grows as the input grows.

```
  Zoom out — where complexity analysis lives in the workflow

  ┌─ "I wrote code" ──────────────────────────────┐
  │  let total = 0                                 │
  │  for (const s of sessions) total += s.reps     │
  └────────────────────────┬───────────────────────┘
                           │  ask: how does cost grow with input?
  ┌─ ★ COMPLEXITY ANALYSIS ★ ─────────────────────┐ ← we are here
  │  count operations as n grows                   │
  │  identify dominant term                        │
  │  name it: O(n), O(log n), O(n²), …             │
  └────────────────────────┬───────────────────────┘
                           │  compare candidates
  ┌─ "pick the algorithm" ────────────────────────┐
  │  linear scan vs. binary search vs. hash lookup │
  └────────────────────────────────────────────────┘
```

You're not measuring milliseconds. You're measuring *the shape of how cost grows.* Two algorithms might both take 5ms on n=10, but at n=10 million one finishes and the other doesn't.

## Structure pass

**Layers.**

- **Counting layer** — how many primitive ops does the algorithm execute?
- **Asymptotic layer** — strip constants and lower-order terms; keep the dominant growth rate.
- **Worst / average / amortized layer** — which case are we measuring?
- **Cost-model layer** — operations aren't free; some are 1000× more expensive than others.

**Axis traced — cost (where does the work happen, and how does it scale?).**

```
  axis = "where does the cost go as n grows?"

  counting:     "5n + 3 ops"        → grows linearly with n
  asymptotic:   O(n)                → dominant term wins
  worst-case:   O(n) every time     → "guaranteed"
  amortized:    O(1) per op average → "over time"
  cost model:   not all ops equal   → 1 disk read ≫ 1000 RAM reads
```

**Seams.** The boundary that flips the axis-answer is **input size**. At n=5 a "quadratic" algorithm beats a "linear" one because of constants. At n=5,000,000 the linear one wins by 6 orders of magnitude. Big-O is asymptotic — it describes the limit, not your specific n. Know which side of the seam you're on.

## How it works

### Move 1 — the mental model

You count operations as a function of input size, drop everything except the dominant growth term, and label the result. That label is your prediction of how the algorithm will scale.

```
  Pattern — the growth curves you'll memorize

       cost
        │
  O(n!) │ /                                  ← factorial: brute permutations
  O(2ⁿ) │/  /                                ← exponential: brute subsets
  O(n²) │  /  /                              ← nested loops
  O(n log n)│  /                             ← sort, balanced divide-conquer
  O(n)  │     /                              ← single linear scan
  O(log n)│      ─                           ← binary search, balanced tree
  O(1)  │ ────────                           ← hash lookup, array index
        └────────────────────► n
```

Memorize the order. In an interview, "this is O(n log n) because we sort then scan" lands; "this is fast, probably" doesn't.

### Move 2 — the moves you'll make

#### Counting primitive operations

Walk the code. Each line is some number of ops. A loop multiplies by its iteration count.

```
  Pseudocode — counting operations

  function sumReps(sessions):              // input size n = len(sessions)
    total = 0                              // 1 op
    for each session in sessions:          // loop runs n times
      total = total + session.reps         // 2 ops × n
    return total                           // 1 op
  // total ops: 1 + 2n + 1 = 2n + 2 = O(n)
```

The seam everyone trips on: a nested loop where the inner loop's bound *depends on the outer index* is still O(n²) if the inner bound is some constant fraction of n. It's not "O(n × n/2)"; it's O(n²). Constants don't survive the asymptotic notation.

#### Dropping constants and lower-order terms

`5n + 3` becomes `O(n)`. `n² + 100n + 50` becomes `O(n²)`. Why? Because as n grows, the dominant term swamps everything. At n=1000, `n² = 1,000,000` and `100n = 100,000` — the lower-order term is 1% of the total and shrinking.

```
  Execution trace — why the dominant term wins

  cost function: T(n) = n² + 100n + 50

  n        n²            100n      50    T(n)        n² share
  ────     ─────────     ─────     ──    ─────────   ────────
  10       100           1000      50    1150        9%
  100      10,000        10,000    50    20,050      50%
  1000     1,000,000     100,000   50    1,100,050   91%
  10,000   100,000,000   1,000,000 50    101M        99%
```

The seam: this only matters in the limit. For small n, lower-order terms and constants dominate — that's why insertion sort beats quicksort at n=10 even though quicksort is asymptotically better.

#### Worst-case vs average-case vs amortized

Three different questions, three different answers, often confused.

- **Worst-case** — "what's the maximum cost over all inputs of size n?" Guarantees an upper bound.
- **Average-case** — "what's the expected cost over a random input of size n?" Requires assuming a distribution.
- **Amortized** — "what's the *average per-op* cost over a sequence of m ops?" Some ops are cheap, occasional ops are expensive; amortized smooths it out.

```
  Pattern — dynamic array push (the canonical amortized example)

  array capacity grows by doubling. Most pushes are O(1); occasionally
  a push triggers "allocate 2× and copy everything" — that one is O(n).

  push #1   capacity 1  cost: 1
  push #2   capacity 2  cost: 1  + 1 copy   = 2
  push #3   capacity 4  cost: 1  + 2 copies = 3
  push #4   capacity 4  cost: 1
  push #5   capacity 8  cost: 1  + 4 copies = 5
  push #6,7,8 capacity 8  cost: 1 each
  …

  total cost for n pushes ≈ 2n  →  amortized O(1) per push
  worst-case single push:  O(n)
```

JS arrays do this under the hood. `array.push()` is "O(1) amortized." Worst-case it's O(n). Both are true; both matter in different conversations.

#### Space complexity

Same idea, different resource: how much memory grows with n.

```
  Pseudocode — space complexity examples

  // in-place reverse: O(1) extra space
  function reverseInPlace(arr):
    for i from 0 to len(arr) / 2:
      swap(arr[i], arr[len(arr) - 1 - i])

  // build new reversed array: O(n) extra space
  function reverseCopy(arr):
    result = []                            // O(n) space
    for i from len(arr) - 1 down to 0:
      result.push(arr[i])
    return result
```

Time and space trade off constantly. Memoization (DP) buys O(2ⁿ) → O(n²) time by spending O(n²) space.

#### Cost models — when Big-O lies

Big-O assumes all primitive ops cost the same. They don't.

```
  Layers-and-hops — the cost gradient

  ┌─ register access ──────┐  ~0.3 ns      (1×)
  └────────┬───────────────┘
           │
  ┌─ L1 cache ─────────────┐  ~1 ns        (3×)
  └────────┬───────────────┘
           │
  ┌─ L2 cache ─────────────┐  ~4 ns        (13×)
  └────────┬───────────────┘
           │
  ┌─ main memory ──────────┐  ~100 ns      (333×)
  └────────┬───────────────┘
           │
  ┌─ SSD random read ──────┐  ~100,000 ns  (333,000×)
  └────────┬───────────────┘
           │
  ┌─ network round-trip ───┐  ~10,000,000 ns (33,000,000×)
  └────────────────────────┘
```

A "O(log n)" B-tree lookup that hits disk is slower than a "O(n)" array scan that stays in L1. SQLite's index is O(log n) in *page reads*, not in CPU ops. When Big-O disagrees with your benchmark, the cost model is the answer — you measured the wrong unit.

### Move 3 — the principle

**Big-O is not a benchmark; it's a *prediction* of how cost shape changes as input grows.** It exists to let you compare algorithms before you write them. Confirm with measurement when you can. When the prediction and the measurement disagree, the cost model is wrong — figure out which op you under-counted.

## Primary diagram

```
  The full picture — counting, asymptotic, cost model

  ┌─ counting layer ──────────────────────────────────────────┐
  │   walk the code, count ops as f(n)                         │
  │   T(n) = 3n² + 5n + 12                                     │
  └───────────────────────┬────────────────────────────────────┘
                          │  drop constants + lower terms
  ┌─ asymptotic layer ────▼────────────────────────────────────┐
  │   T(n) = O(n²)                                             │
  └───────────────────────┬────────────────────────────────────┘
                          │  is the case worst / average / amortized?
  ┌─ case layer ──────────▼────────────────────────────────────┐
  │   worst:     O(n²) guaranteed                              │
  │   average:   O(n²) under uniform input                     │
  │   amortized: O(n²) per op over m ops                       │
  └───────────────────────┬────────────────────────────────────┘
                          │  does the cost model agree?
  ┌─ cost model check ────▼────────────────────────────────────┐
  │   are the "primitive ops" actually constant-time?          │
  │   if they touch disk / network / GC, recompute             │
  └────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

`contrl` has no formal complexity analysis written down (no comments saying "O(n)"). But the algorithms have implied costs you can name.

### Use cases

- **Hot-path cost** — `calculateAngle` runs ~30 times per second per joint. Constant-time arithmetic, O(1). At 3 joints × 30 Hz = 90 calls/sec, this has to stay sub-microsecond.
- **Reconstruction cost** — `reconstructFromSessions` is O(n log n) (sort) + O(n) (fold) over sessions; n is bounded by user history (hundreds, not millions).
- **Streak cost** — `calculateStreak` is O(n) over week history; n is small (52 max if you keep a year).

### Code side by side

```
  src/lib/game/reconstruct.ts (lines 17-19, 32-61)

  const sorted = [...sessions].sort(                   ← O(n log n) — the sort
    (a, b) => new Date(a.date).getTime()                  dominates total cost
                  - new Date(b.date).getTime()
  )
  …
  for (const session of sorted) {                       ← O(n) — linear fold
    const { category, level } = session                    over sorted input
    …
    if (level > currentLevel) continue                  ← O(1) per session
    const gate = getGate(category, level)               ← O(1) record lookup
    if (gate.status === 'passed') continue
    const isClean = session.exercises.length > 0 &&
      session.exercises.every(e => e.hitTarget)         ← O(k) over exercises;
                                                          k bounded ≈ 5
    …
  }
       │
       └─ total complexity: O(n log n) — the .sort() is the dominant term.
          n = number of sessions in user's lifetime; bounded by user behavior
          (a year of 3 sessions/week ≈ 156). Even if 10× that, it's nothing.

          The cost-model lesson: this runs on app launch when local progress
          is missing. It's not in the hot path. O(n log n) at n≈200 is
          ~1500 ops — invisible compared to one React render.
```

```
  src/lib/pose/angles.ts (lines 7-19)

  export function calculateAngle(a, b, c) {
    const ba = { x: a.x - b.x, y: a.y - b.y }    ← O(1) — 2 subtractions
    const bc = { x: c.x - b.x, y: c.y - b.y }    ← O(1) — 2 subtractions
    const dot = ba.x * bc.x + ba.y * bc.y         ← O(1) — 2 mults + 1 add
    const magBA = Math.sqrt(...)                  ← O(1) — sqrt is "constant"
    const magBC = Math.sqrt(...)                     in the asymptotic sense
    if (magBA === 0 || magBC === 0) return 0      ← O(1) — early exit
    const cosAngle = Math.max(-1, Math.min(1, ...))
    return (Math.acos(cosAngle) * 180) / Math.PI
  }
       │
       └─ O(1) per call. But this runs ~90 times/sec; total work is O(1)
          per call × 90/sec = bounded. The interview lesson: "O(1)" doesn't
          mean "free" — it means the cost doesn't grow with input. The
          input here is one frame's landmarks; that's a fixed-size input.
```

## Elaborate

Big-O came from Paul Bachmann (1894) for number theory, formalized for algorithms by Donald Knuth in the 1970s. The notation hides constants on purpose — they're machine-dependent, compiler-dependent, cache-dependent. The growth rate is the portable thing.

**Amortized analysis** has three techniques: aggregate (total cost / m ops), accounting (charge each op a "tax" that pays for future expensive ops), and potential (define a potential function over the data structure's state). The doubling-array example uses aggregate; Fibonacci heap analyses use potential.

**Where Big-O misleads you:**

- Cache behavior. A sequential O(n) scan beats a "smarter" O(log n) tree walk if the tree scatters across memory and the scan stays in cache.
- Constant factors. Quicksort is O(n log n) like mergesort, but quicksort's constants are smaller, so it usually wins on random data.
- The 99% case. Hash-map lookup is O(1) average, O(n) worst-case (everyone hashes to one bucket). For a well-behaved hash function, the worst case essentially never happens.

**Cross-link:** Performance engineering work (cost models in practice) lives in `study-performance-engineering/`. Database query costs (page reads vs CPU ops) live in `study-database-systems/`.

## Interview defense

**Q: Walk me through the complexity of `reconstructFromSessions`.**

```
  Anchor diagram

  reconstructFromSessions(sessions) where |sessions| = n

  step 1: spread + sort     → O(n log n)
  step 2: linear fold       → O(n) × O(k) inside where k ≤ ~5
                              total: O(nk) = O(n)
  ───────────────────────────────────────
  total:                      O(n log n)
```

**Answer:** It's O(n log n), and the sort dominates. The fold inside is O(n) with a bounded inner loop over exercises (k around 5). I sort by date so the fold is order-dependent — gates require *consecutive* clean sessions, so the linear walk has to see them in time order.

**Q: When would Big-O lie to you?**

Anchor: the memory-hierarchy diagram from Move 2. **Answer:** When the cost model is wrong. A nominally-O(log n) algorithm that touches disk every level loses to a nominally-O(n) algorithm that stays in cache. Big-O counts ops as if all ops cost the same; they don't, and the gap between "L1 cache" and "main memory" is bigger than the gap between O(n) and O(log n) at any realistic n.

**Q: Explain amortized cost. Why is `array.push` "O(1) amortized"?**

Anchor: the doubling-array execution trace from Move 2. **Answer:** Most pushes write one slot — that's O(1). Occasionally the array runs out of capacity, allocates double, and copies everything — that's O(n). But because the doubling makes copies rarer as the array grows, the *total* cost of n pushes is bounded by 2n. Divide by n: each push averages O(1). It's the average over the sequence that's constant; any single push can still be O(n).

## Validate

1. **Reconstruct.** Without re-reading: name the dominant term of `reconstructFromSessions` and explain why. *(Expected: O(n log n) from the `.sort()` at line 17-19; the fold is O(n).)*
2. **Explain.** Why is `calculateAngle` in `src/lib/pose/angles.ts:7-19` O(1) but still a hot spot? *(Per-call O(1), called ~90 times/sec — the cost is hot because of frequency, not complexity.)*
3. **Apply.** A new feature stores all rep events from a workout in an array and re-sorts on every push. n ≈ 50. What's the cost? Is it a problem? *(O(n²) total over the workout, n=50 → 2500 ops, invisible. Not a problem.)*
4. **Defend.** A teammate says `[...sessions].sort()` at `reconstruct.ts:17` is wasteful — why not sort in place? *(The spread is a defensive copy: `sort` mutates, the original `sessions` array shouldn't be mutated. The cost is O(n) extra space; at the n we expect, it's nothing. Correct call.)*

## See also

- `02-arrays-strings-and-hash-maps.md` — the data structures whose costs you'll measure most often.
- `06-sorting-searching-and-selection.md` — where `.sort()` and binary-search costs get walked.
- `study-performance-engineering/` — cost models when measurement matters more than asymptotics.
- `study-database-systems/` — page-read cost model for B-tree indexes.
