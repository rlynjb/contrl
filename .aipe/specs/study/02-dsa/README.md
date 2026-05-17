# 02 — Data structures & algorithms

Meaningful operations performed by contrl on its data. Most are O(n) or O(n log n); none are accidentally O(n²).

## Complexity cheat sheet

| # | Operation | Where it lives | Time | Space | Holds at 10×? |
|---|---|---|---|---|---|
| 01 | Sort sessions chronologically | `reconstruct.ts` L17 | O(n log n) | O(n) | ✓ |
| 02 | Composite-key lookup | `useGameState.ts` L56 + SQL `PRIMARY KEY` | O(1) | O(1) | ✓ |
| 03 | Set-based diffing (upsert-then-prune) | `database.ts` L257 / `sync.ts` L130 | O(n + m) | O(n) | ✓ |
| 04 | Group sessions by week | `useGameState.ts` L329 | O(n) | O(weeks) | ✓ |
| 05 | Rep counter FSM | `rep-counter.ts` L21 | O(1) per frame | O(1) | ✓ |
| 06 | Exponential smoothing | `angles.ts` L21 | O(1) per frame | O(1) | ✓ |
| 07 | Week-start derivation | `week-progress.ts` L7 | O(1) | O(1) | ✓ |
| 08 | Streak fold | `streaks.ts` L18 | O(weeks) | O(1) | ✓ |

No operation in contrl is currently O(n²) where O(n) is reachable. The closest miss would be the `pullSessions` reconciliation if it used nested loops instead of a `Set`; that's why [03-set-based-diffing](./03-set-based-diffing.md) earns its place.

## File index

- **[01-sorting-sessions-chronologically](./01-sorting-sessions-chronologically.md)** — comparator-based sort, immutable spread, ascending epoch ms. Prerequisite for any order-dependent computation.
- **[02-composite-key-lookups](./02-composite-key-lookups.md)** — `${category}:${level}` strings as the lingua franca of gate addressing across JS and SQL.
- **[03-set-based-diffing](./03-set-based-diffing.md)** — `Set`-based O(n+m) reconciliation; `WHERE id NOT IN` with the empty-list guard.
- **[04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md)** — `Map<weekStart, Set<Category>>` two-pass group-by, lazy initialization, project + filter + sort.
- **[05-rep-counter-state-machine](./05-rep-counter-state-machine.md)** — 5-state FSM with 10° hysteresis; count++ on `up → ready`.
- **[06-exponential-smoothing](./06-exponential-smoothing.md)** — `smoothed = previous + α × (current − previous)`; one-line low-pass; α = 0.4 empirically tuned.
- **[07-week-start-derivation](./07-week-start-derivation.md)** — Local-time `getDay()` + `setDate` + manual YYYY-MM-DD format; strings as stable keys.
- **[08-streak-fold](./08-streak-fold.md)** — Fold-with-reset; increment on success, snap to zero on failure.

## Where to drill in

- Need to understand the pose pipeline? Read **05** then **06**, then jump to [01-system-design/07-pose-detection-pipeline](../01-system-design/07-pose-detection-pipeline.md).
- Need to understand sync's reconciliation? Read **03**.
- Need to understand the week metrics? Read **07**, then **04**, then **08** (it's the pipeline).
- Need to understand gates and IDs? Read **02**, then [01-system-design/05-derived-state](../01-system-design/05-derived-state.md).
