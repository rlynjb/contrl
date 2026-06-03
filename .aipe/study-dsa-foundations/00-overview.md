# 00 — Overview

The DSA map for `contrl`, verdict-first. What's exercised, what isn't, and where the load-bearing algorithms sit.

## The verdict in one sentence

`contrl` is a real-time **finite state machine** (the rep counter) bolted onto a **vector geometry** primitive (the 3-angle calculator), with the rest of the app being plain-old **array + hash-map** plumbing — no graphs, no heaps, no DP, no recursion of consequence. The interesting DSA in this repo lives in 80 lines of `src/lib/pose/`. Everything else is bookkeeping.

That's not a complaint. It's the right shape for a fitness app. But it means the DSA curriculum here is mostly *teaching foundations the repo doesn't exercise* so you walk into a board interview with the full vocabulary, not just the slice this codebase happens to need.

## Where DSA lives in `contrl`

```
  Zoom out — the DSA map across the whole system

  ┌─ Camera / ML layer ──────────────────────────────────────────┐
  │  MediaPipe pose model → 33 landmarks per frame @ ~30 FPS     │
  │  (the model is a neural net; we don't audit its internals)   │
  └───────────────────────────────┬──────────────────────────────┘
                                  │  landmarks: Landmark[]
  ┌─ Pose math (the DSA) ─────────▼──────────────────────────────┐
  │  calculateAngle(a, b, c)      ← vector dot-product geometry  │
  │  smoothAngle(curr, prev, α)   ← EMA (online streaming filter)│
  │  RepCounter.update(angle)     ← 5-phase FSM with hysteresis  │
  └───────────────────────────────┬──────────────────────────────┘
                                  │  rep events
  ┌─ Game / progression (also DSA, but quieter) ─────────────────┐
  │  reconstructFromSessions()    ← reduce-fold over sorted list │
  │  calculateStreak(history)     ← linear scan, state-machine-ish│
  │  getWeekStart(date)           ← date → string bucket key     │
  │  WeekProgress (Record<...>)   ← hash map over categories     │
  └───────────────────────────────┬──────────────────────────────┘
                                  │  state writes
  ┌─ Storage layer ───────────────▼──────────────────────────────┐
  │  SQLite (B-tree indexes)  →  AsyncStorage (key/value blobs)  │
  │  (B-tree = a tree; see study-database-systems for internals) │
  └──────────────────────────────────────────────────────────────┘
```

Two zones of interesting DSA. The **pose math** zone runs at frame rate and gets profiled in `study-performance-engineering`; the algorithms here are short but they execute 30 times per second per landmark, so constant factors matter. The **game zone** runs at user-event rate (after a workout); algorithms here are O(n) over a small n (sessions per user), so the cost model is "is this n bounded?" not "is this O(log n)?"

## What's exercised vs not — the inventory

```
  Concept                            │ in contrl?                   │ file
  ───────────────────────────────────┼──────────────────────────────┼─────────────
  Big-O / amortized analysis         │ implicit, never written down │ —
  Array iteration (map/filter/reduce)│ pervasive                    │ everywhere
  Hash map / Record<K, V>            │ pervasive (WeekProgress,     │ src/lib/game/
                                     │   userLevels)                │
  Set / Set semantics                │ via Record<K, boolean>       │ week-progress.ts:21
  Linked list                        │ not yet exercised            │ —
  Stack (LIFO)                       │ implicit (JS call stack)     │ —
  Queue (FIFO)                       │ not yet exercised            │ —
  Deque                              │ not yet exercised            │ —
  Heap / priority queue              │ not yet exercised            │ —
  Tree (general n-ary)               │ React component tree         │ implicit
  Binary search tree                 │ not yet exercised in user    │ SQLite uses
                                     │   code; SQLite uses B-trees  │   internally
  Trie                               │ not yet exercised            │ —
  Graph                              │ not yet exercised            │ —
  BFS / DFS                          │ not yet exercised            │ —
  Dijkstra / A*                      │ not yet exercised            │ —
  Topological sort                   │ not yet exercised            │ —
  Union-find                         │ not yet exercised            │ —
  Sorting (any kind)                 │ one .sort() call             │ reconstruct.ts:17-19
  Binary search                      │ not yet exercised            │ —
  Recursion                          │ not yet exercised in user    │ React renders
                                     │   logic                      │   recursively
  Backtracking                       │ not yet exercised            │ —
  Dynamic programming                │ not yet exercised            │ —
  Finite state machine               │ YES — the rep counter        │ rep-counter.ts:31-72
  Online streaming / EMA             │ YES — angle smoothing        │ angles.ts:21-23
  Vector geometry (dot, magnitude)   │ YES — joint angles           │ angles.ts:7-19
  Date bucketing / week-key hash     │ YES                          │ week-progress.ts:7-15
  Reduce-pattern reconstruction      │ YES — fold over sorted list  │ reconstruct.ts:32-61
  Linear scan with state             │ YES — streak calculation     │ streaks.ts:18-28
```

The ratio is roughly: **5 exercised, 20 not yet exercised**. That's a normal frontend-app ratio. The exercised ones are taught with real code and line annotations. The not-yet-exercised ones are taught as curriculum with a hypothetical-placement note ("if you added X to contrl, this is where it would attach").

## Ranked by what matters most for *this* repo

1. **Finite state machine** (rep counter) — the most algorithmically interesting thing in `contrl`. 5 phases, hysteresis, runs at 30 FPS. Chapter 04 (state-as-tree) and Chapter 03 (state ordering) both touch it.
2. **EMA smoothing + dot-product geometry** — pose math. 80 lines, executes constantly. Chapter 02 (arrays + numeric ops) and Chapter 06 (online algorithms) cover it.
3. **Reduce-fold reconstruction** — `reconstructFromSessions` is the closest thing to a "real algorithm" in the game layer. Chapter 07 covers folds.
4. **Linear scan / streak** — trivial algorithm, useful interview anchor for "explain Big-O of your code." Chapter 06.
5. **Hash map bucketing** — `getWeekStart` produces a string key, then `Record<string, WeekProgress>` looks up by it. Chapter 02.

Everything else in the curriculum (graphs, heaps, DP) you're learning *outside* the repo. That's fine. The curriculum still teaches them — `contrl` just isn't where you'll see them happen.

## Ranked by what matters most for an interview

This is the inversion of the above. Interview boards don't care that your repo doesn't have a graph; they care that you can implement BFS in 10 minutes.

```
  Interview signal weight        │ contrl exercises it?
  ───────────────────────────────┼─────────────────────
  arrays + hash maps             │ yes — strong anchor
  binary search                  │ no — pure curriculum
  recursion / tree DFS           │ no — pure curriculum
  BFS / shortest path            │ no — pure curriculum
  DP (1D + 2D)                   │ no — pure curriculum
  sorting (quick, merge, heap)   │ partial — one .sort() call
  heaps / priority queue         │ no — pure curriculum
  sliding window / two pointers  │ no — pure curriculum
  FSM (less common in interviews)│ yes — strong anchor
```

The FSM is your differentiator. "I shipped a 5-phase state machine at 30 FPS with hysteresis" is a real war story. Most candidates have only solved FSM problems on paper.

## Cross-link map

```
  this guide          → study-database-systems    : B-tree internals (SQLite indexes)
  this guide          → study-runtime-systems     : call stack, recursion limits, memory
  this guide          → study-performance-eng     : algorithm cost in the 30 FPS budget
  this guide          → study-system-design       : FSM as an architectural pattern
  this guide          → study-testing             : how you'd unit-test the FSM
```

Each chapter cross-links specifically where the adjacent guide owns the topic.

## What to do with this guide

If you're prepping for a senior interview in 2 weeks: read 01 (complexity) and 08 (practice map) first, then drill the chapters with the highest interview weight (02, 04, 05, 06, 07). Skip 03 if you're tight on time — stacks/queues/heaps are the lowest-difficulty chapter.

If you're using this to deepen your understanding of `contrl`: read 04 (FSM is here, sort of), 02 (the pose-math substrate), and 07 (reduce-fold reconstruction). Skip 05 entirely; there are no graphs in the repo.

Open `01-complexity-and-cost-models.md` next.
