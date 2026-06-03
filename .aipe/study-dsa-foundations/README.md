# Study — DSA Foundations (applied to `contrl`)

A curriculum-style guide. The reusable data-structures-and-algorithms vocabulary, taught against the parts of `contrl` that actually exercise it, honest about the parts that don't.

This isn't an interview prep dump and it isn't a textbook. It's the working DSA vocabulary you'd want loaded before walking into a senior interview that mixes "explain your code" with "now solve this on the board." Where `contrl` has a real example, you'll see the file path and the line numbers. Where it doesn't, you'll see `not yet exercised` and a one-line note on where the concept *would* attach if you added it.

## Reading order

```
  ┌─ orient ──────────────────────────────────────┐
  │  00-overview.md                                │
  └─────────────────────┬──────────────────────────┘
                        │
  ┌─ foundations ───────▼──────────────────────────┐
  │  01-complexity-and-cost-models.md              │
  │  02-arrays-strings-and-hash-maps.md            │
  │  03-stacks-queues-deques-and-heaps.md          │
  │  04-trees-tries-and-balanced-indexes.md        │
  │  05-graphs-and-traversals.md                   │
  │  06-sorting-searching-and-selection.md         │
  │  07-recursion-backtracking-and-dynamic-prog.md │
  └─────────────────────┬──────────────────────────┘
                        │
  ┌─ practice ──────────▼──────────────────────────┐
  │  08-dsa-foundations-practice-map.md            │
  └────────────────────────────────────────────────┘
```

Start at `00-overview.md` for the verdict — what `contrl` actually exercises, what it doesn't, and where the load-bearing algorithms live. Then walk 01 → 07 in order; the complexity chapter sets the cost model every subsequent file uses. Land at `08` for the practice plan: which exercises drill which gaps, ranked.

## What's actually in this repo

```
  Where DSA shows up in contrl

  ┌─ pose pipeline ─────────────────┐
  │  3-angle geometry (vectors)     │ → 02, 06
  │  EMA smoothing (online filter)  │ → 02, 06
  │  5-phase FSM rep counter        │ → 03 (state), 04 (state)
  └─────────────────────────────────┘

  ┌─ game / progression ────────────┐
  │  reduce-fold reconstruction     │ → 07
  │  streak linear scan             │ → 02, 06
  │  week-key bucketing (hash map)  │ → 02
  └─────────────────────────────────┘

  ┌─ data layer ────────────────────┐
  │  SQLite B-tree indexes          │ → 04 (cross-link to study-database-systems)
  │  arrays everywhere (sessions,   │ → 02
  │  exercises, weeks)              │
  └─────────────────────────────────┘
```

`contrl` is light on classic interview-DSA. No graphs in the codebase. No heaps in your code (the OS uses a heap for memory, that's not the same thing). No DP. No backtracking. That's not a bug — a fitness app with a 30 FPS pose pipeline doesn't need Dijkstra. But it does mean some chapters teach pure curriculum with `not yet exercised in contrl` honestly named, so you walk into an interview with the vocabulary even when the repo doesn't supply the war story.

## Cross-links to neighboring guides

- **B-tree internals** — taught in `study-database-systems/` (SQLite's `idx_sessions_date` is a B-tree; this guide covers what a B-tree *is* and links to the database-systems guide for *how SQLite implements it*).
- **Stack vs heap memory, recursion limits** — taught in `study-runtime-systems/`. This guide covers recursion as an algorithmic pattern; runtime concerns (stack overflow, tail calls, V8's call stack) live there.
- **FSM as an architectural pattern** — touched here at the algorithmic level (state set, transition function, hysteresis). The architectural framing (rep counter as a worklet, integration with the camera pipeline) lives in `study-system-design/`.

## Conventions

- **Pseudocode is plain English.** Real TypeScript only appears in Block 6 of each file, beside line-by-line annotation.
- **Every claim about `contrl` cites a file path + line range.** No hand-waving. If the line range isn't there, the claim isn't load-bearing.
- **`not yet exercised in contrl` is a feature.** Honest gap-naming beats invented examples.
- **Big-O is named, but the cost model is named harder.** "O(n)" is a label; "one linear scan over the sessions array on every render" is the lesson.

Open `00-overview.md` next.
