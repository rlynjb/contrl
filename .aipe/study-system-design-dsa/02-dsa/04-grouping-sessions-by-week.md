# Grouping sessions by week

**Industry name(s):** Group-by reduction, key-based bucketing, partition-by-key
**Type:** Industry standard · Language-agnostic

> `buildWeekHistory` iterates over the session log and groups sessions by week-start. The accumulator is `Map<weekStart, Set<Category>>` — one Map keyed by week, each value a Set of categories logged in that week. Same shape as SQL `GROUP BY`, just in-memory.

**See also:** → [07-week-start-derivation](./07-week-start-derivation.md) · → [08-streak-fold](./08-streak-fold.md)

---

## Why care

You have an unordered list of timestamped events and a question: "for each week, what categories were touched?" The answer requires *grouping* — collecting events into buckets by some key, then summarizing each bucket. The "for each bucket, summarize" idea is universal across SQL, MapReduce, Pandas, and every analytics framework.

The pattern is **group-by**, implemented in-memory with a Map. Same shape as SQL `GROUP BY week_start, category`, except we control the bucket structure (Set, in this case) directly.

---

## How it works

Two passes. First pass: drop each session into a bucket keyed by its week-start. Second pass: emit one record per bucket, summarized.

### The implementation

```typescript
function buildWeekHistory(sessions: WorkoutSession[]): WeekProgress[] {
  const byWeek = new Map<string, Set<Category>>();

  for (const s of sessions) {
    const weekStart = getWeekStart(new Date(s.date));
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, new Set());
    byWeek.get(weekStart)!.add(s.category);
  }

  const currentWeekStart = getWeekStart(new Date());

  return Array.from(byWeek.entries())
    .filter(([ws]) => ws !== currentWeekStart)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, cats]): WeekProgress => ({
      weekStart,
      sessionsCompleted: {
        push: cats.has('push'),
        pull: cats.has('pull'),
        squat: cats.has('squat'),
      },
    }));
}
```

`src/hooks/useGameState.ts` L311–L333.

**Pass 1 — group.** For each session, compute `weekStart` via `getWeekStart` (`'YYYY-MM-DD'` of the Monday of that week — see [07-week-start-derivation](./07-week-start-derivation.md)). If the Map doesn't have that key yet, initialize an empty Set. Add `s.category` to the Set for that week.

The `!byWeek.has(...)` check is the "lazy initialization" idiom: only create the inner Set when we first need it. Doing it upfront for every possible week would be wasteful (many weeks have no sessions).

**Pass 2 — project.** Convert each `Map` entry to a `WeekProgress` object. The `cats.has('push')` calls produce booleans for the `sessionsCompleted` flags.

**Filter + sort.** Exclude the current week (it's tracked separately as the active `weekProgress` state). Sort by week start ascending so the streak calculation later sees chronological order.

### Why Set, not array?

A `Set<Category>` automatically dedupes — if the user logs *two* push sessions in the same week (rare but possible — re-logging or correction), they still count as "push done this week", not "push done twice". The Set lets us drop sessions in without a contains-check.

The bridge from frontend: this is the same pattern as React's `Set` use for unique keys in a list — Set is the right data structure when membership matters more than count.

### Complexity

- **Pass 1:** O(n) where n is session count. Each iteration: O(1) for `getWeekStart`, O(1) for Map `has/set/get`, O(1) for Set `add`.
- **Pass 2:** O(w) where w is the number of weeks (much smaller than n).
- **Sort:** O(w log w).
- **Total:** O(n + w log w) ≈ O(n) for the typical case.

### Execution trace

```
sessions:
  [ { date: '2026-04-13', category: 'push'   },   ← Monday
    { date: '2026-04-14', category: 'pull'   },   ← Tuesday
    { date: '2026-04-15', category: 'push'   },   ← (dupe push, same week)
    { date: '2026-04-20', category: 'squat'  } ]  ← next week Monday

Pass 1 — group:

  s = { 2026-04-13, push }
  weekStart = getWeekStart(2026-04-13) = '2026-04-13'  ← Monday
  byWeek.has('2026-04-13')?  no  →  byWeek.set(..., new Set())
  byWeek.get(...).add('push')
  byWeek = { '2026-04-13': Set{ push } }

  s = { 2026-04-14, pull }
  weekStart = '2026-04-13'
  byWeek.has(...)?  yes
  byWeek.get(...).add('pull')
  byWeek = { '2026-04-13': Set{ push, pull } }

  s = { 2026-04-15, push }
  weekStart = '2026-04-13'
  byWeek.get(...).add('push')   ← Set dedupes; no change
  byWeek = { '2026-04-13': Set{ push, pull } }

  s = { 2026-04-20, squat }
  weekStart = '2026-04-20'  ← next Monday
  byWeek.has(...)?  no  →  byWeek.set(..., new Set())
  byWeek.get(...).add('squat')
  byWeek = { '2026-04-13': Set{ push, pull },
             '2026-04-20': Set{ squat } }

Pass 2 — project (currentWeekStart = '2026-04-20'):

  filter out current week ('2026-04-20')
  remaining:  [ ['2026-04-13', Set{ push, pull }] ]
  sort by ws (only one entry)
  result:
    [ { weekStart: '2026-04-13',
        sessionsCompleted: { push: true, pull: true, squat: false } } ]
```

---

## Group-by — diagram

```
sessions (unordered)                                  byWeek (after pass 1)
─────────────────────                                 ─────────────────────────
{2026-04-13, push}  ──┐                               '2026-04-13' → {push,
{2026-04-14, pull}  ──┤  ─── group by weekStart ──►                  pull,
{2026-04-15, push}  ──┤                                              push}*
{2026-04-20, squat} ──┘                                              ← Set
                                                       '2026-04-20' → {squat}
                                                                * dedupe

                          │  pass 2: project + filter + sort
                          ▼

                  [ WeekProgress { weekStart, completed: {push:t, pull:t, squat:f} },
                    ... ]
```

---

## In this codebase

**File:** `src/hooks/useGameState.ts`
**Function / class:** `buildWeekHistory(sessions)`
**Line range:** L311–L333

Called by `load()` at L144 to compute `prevWeeks` for the streak calculation.

---

## Elaborate

### Where this pattern comes from

`GROUP BY` is one of SQL's load-bearing operators (SQL-86). MapReduce formalized the same pattern for distributed compute (Google's paper, 2004). In JS, idiomatic group-by means `Map` + `Set`/`Array`/`Object` as the per-bucket aggregator — every framework reinvents it (Lodash `groupBy`, Ramda `groupBy`, native `Map.groupBy` proposal).

### The deeper principle

When you have N items and want one summary per category-of-item, do two passes: one to bucket, one to summarize. The buckets are an intermediate data structure; their shape determines what summarization is cheap. A `Set` per bucket makes "did category X happen this week?" trivial. An array per bucket would require a `.includes()` check. Pick the bucket shape based on the summary you need.

### Where this breaks down

When the *order within a bucket* matters. Set discards order; if we needed "the latest push session in the week", a Set wouldn't work. The fix is to switch the bucket value to an ordered structure (sorted array, sorted Set keyed by date).

The other breakpoint: at very large N, hashing-into-a-Map is fast but the constant factors add up. SQL with `GROUP BY` on an indexed column is faster — push the grouping to the database. We don't need to here because the dataset is small and in-memory.

### What to explore next

- [07-week-start-derivation](./07-week-start-derivation.md) → how the group key is computed
- [08-streak-fold](./08-streak-fold.md) → the next step that consumes the grouped output

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Map+Set group-by (taken)         │ SQL GROUP BY (alternative)       │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Time             │ O(n)                             │ O(n) with index                  │
│ Memory           │ O(weeks × cats)                  │ O(weeks × cats) in result        │
│ Where compute    │ JS thread                        │ Database engine                  │
│ Round-trips      │ One getSessions, then in-memory  │ Multiple per-feature queries     │
│ Type safety      │ Domain types throughout          │ Rows + manual mapping            │
│ Code readability │ Two-pass loop                    │ SQL string + mapping             │
│ Scale ceiling    │ ~100k sessions OK                │ Higher                           │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is JS-thread CPU. At 100k sessions, the two-pass approach is ~10–50ms. Not free, not awful. SQL `GROUP BY week_start, category` with appropriate indexes would do the same in ~1ms — but we'd need a separate query and an additional schema for `week_start` as a stored column or derived index. The simplicity wins at current scale.

### Sub-block 2 — what SQL `GROUP BY` would have cost

A direct SQL approach: store `week_start` as a column (or derived from `date`), index it, and `SELECT week_start, GROUP_CONCAT(DISTINCT category) FROM sessions WHERE week_start != ? GROUP BY week_start`. Then parse the result. The cost: schema change (add column + backfill + migration), a query plus a parser, and the result isn't naturally typed — we'd manually map back to `WeekProgress[]`. For a 10ms gain on a once-per-load operation, not worth it.

### Sub-block 3 — the breakpoint

Fine until session count exceeds ~100k or `load()` is called more than once per second. Past that, push the grouping to SQL.

### Sub-block 4 — what wasn't actually a tradeoff

A nested object (`{ [weekStart]: { push: bool, pull: bool, squat: bool } }`) was not picked because: (a) `Object` keys are strings and so are weekStarts — fine on shape, but (b) iterating `Object.entries` doesn't preserve insertion order across all JS engines reliably. `Map` does.

---

## Tech reference (industry pairing)

### JavaScript `Map` + `Set` (in-memory group-by)

- **Codebase uses:** `Map<string, Set<Category>>` in `buildWeekHistory` (`useGameState.ts` L311–333) — Map buckets by week-start, Set dedupes categories within a week.
- **Why it's here:** the language-native group-by accumulator. Map preserves insertion order (Object doesn't reliably); Set makes "did category X happen this week?" an O(1) idempotent add.
- **Leading today:** `Map` + `Set` group-by — `adoption-leading` for in-memory bucketing, 2026.
- **Why it leads:** native, ordered, value-equality on string keys; no library.
- **Runner-up:** `Map.groupBy` (TC39 / ES2024) and Lodash `groupBy` — terser, but Lodash adds a dependency and `Map.groupBy` returns arrays (needs a manual dedupe step the Set gives free).

### SQL `GROUP BY` (the database-side alternative)

- **Codebase uses:** Not used — grouping happens in JS over the already-loaded session array.
- **Why it's here:** the move once session count or call frequency outgrows the JS two-pass loop.
- **Leading today:** SQL `GROUP BY` on an indexed column — `adoption-leading` for set aggregation, 2026.
- **Why it leads:** the query engine aggregates with an index in ~1ms; no full-table load into JS.
- **Runner-up:** materialized `week_progress` rows (already maintained incrementally by `logSession`) — the codebase's actual fast path for the *current* week; `buildWeekHistory` is the historical replay.

---

## Summary

### Concept recap

`buildWeekHistory` groups sessions by `weekStart` using a `Map<string, Set<Category>>`. Pass one populates the map; pass two projects each entry into a `WeekProgress` record with three booleans. The current week is excluded (it's tracked separately), and the result is sorted ascending. The constraint that forced this design was that streak calculation requires chronological week history, and querying SQL per-week would have meant multiple round-trips. The cost is JS-thread CPU proportional to session count.

### Key points

- Two passes: group, then project.
- Set as bucket value dedupes automatically — same category twice in a week is still once.
- Lazy initialization (`if (!has) set(new Set())`) avoids pre-allocating empty weeks.
- Current week excluded because it's the active state, not historical.

---

## Interview defense

### Likely questions

**Q: Walk me through the group-by.  [mid]**
A: Iterate sessions. For each, compute the Monday-of-its-week string. Look it up in a Map; lazily initialize a Set if missing. Add the session's category to the Set. Once all sessions are grouped, iterate the Map entries: project each `(weekStart, Set)` to a `WeekProgress` record with three boolean flags. Filter out the current week. Sort ascending by week start. Return.

```
   Map<weekStart, Set<Category>>
   ──────────────────────────────
   pass 1: for each session, byWeek.get(ws).add(s.category)
   pass 2: for each entry, project to {push:bool, pull:bool, squat:bool}
   filter, sort, return
```

**Q: Why Set and not array as the bucket value?  [senior]**
A: Set dedupes for free. If the user logs two push sessions in the same week (re-logging, correction, etc.), we want "push: true" once, not "push: true, push: true". Set's `add(x)` is idempotent. Array would need a `.includes(x)` check before push, which is O(k) per check — at 3 categories per week it's negligible but the Set form is cleaner.

```
   Array form (works)                 │   Set form (taken)
   ────────────────────────────────── │ ──────────────────────────────────
   if (!arr.includes(c)) arr.push(c)  │   set.add(c)
   O(k) per add                       │   O(1) per add
   pre-add check easy to forget       │   idempotent by construction
```

**Q: At 100k sessions per user, where does this break?  [arch]**
A: The two-pass loop is O(n), ~50ms in JS. The Set/Map data structures are fine in memory (few KB per week). The first scale concern is `getSessions()` loading all rows into JS — at 100k that's a few MB of memory. Past ~500k we'd push grouping to SQL with `GROUP BY week_start` and a stored `week_start` column.

```
┌─ at 100k sessions ─────────────────────────────────────┐
│  pass 1 + 2     ~50ms                                  │
│  Map/Set memory ~few KB                                │
│  getSessions    ~few MB    ←─ first bottleneck         │
│  fix at scale: SQL GROUP BY with indexed week_start    │
└────────────────────────────────────────────────────────┘
```

### One-line anchors

- Group then project, two passes.
- Set is the right bucket shape when dedup-by-membership matters.
- Lazy initialization keeps memory tight.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the sessions → Map → WeekProgress flow.

### Level 2 — Explain it out loud
Why Set instead of array? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add 'longest streak per category'. What bucket structure do you need?"

Reference `useGameState.ts` L311.

### Level 4 — Defend the decision you'd change
"Push the grouping to SQL — when is it worth it?"

### Quick check — code reference test
- What file has `buildWeekHistory`?
- What's the Map's value type?
- Why exclude the current week?

Then verify.

---
