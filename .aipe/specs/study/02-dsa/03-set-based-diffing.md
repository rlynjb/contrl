# Set-based diffing

**Industry name(s):** Upsert-then-prune, set difference, list reconciliation
**Type:** Industry standard · Language-agnostic

> `pullExercises` upserts every Notion exercise locally, then calls `deleteExercisesNotIn(notionIds)` to remove anything not in the remote set. Same shape used in `pullSessions` to detect remote deletions: build a Set of active remote IDs, find local rows whose Notion ID isn't in that Set, delete them.

**See also:** → [01-system-design/03-bidirectional-sync](../01-system-design/03-bidirectional-sync.md)

---

## Why care

Two lists of IDs. You want to keep what's in both, remove what's in the first but not the second. This is set difference — and you do it three different ways depending on language and scale. In SQL it's `NOT IN`. In JS it's `!set.has(...)`. In a query plan it's an anti-join. Same operation, different syntax.

The pattern is **set-based diffing** for reconciliation. Used everywhere a local cache mirrors a remote source: `pullExercises` here, `git pull` for files, IMAP for messages, every "rsync delete" workflow.

---

## How it works

Two operations, in order: bring the local rows up to date (upsert), then drop anything that's stale (prune). The prune step uses a set of "things that should still exist".

### `deleteExercisesNotIn` — the SQL anti-join

```typescript
export async function deleteExercisesNotIn(ids: string[]): Promise<void> {
  if (ids.length === 0) return deleteAllExercises();
  const d = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`DELETE FROM exercises WHERE id NOT IN (${placeholders})`, ids);
}
```

`src/services/database.ts` L257–L262. Two things to notice:

1. **Empty-list early return.** If `ids` is empty, `WHERE id NOT IN ()` is invalid SQL — every database I know rejects empty `IN ()` clauses. We short-circuit to `deleteAllExercises()`. This is the canonical fix for the "empty IN list" SQL trap.

2. **Dynamic placeholder generation.** `ids.map(() => '?').join(',')` produces `?,?,?` for 3 ids. We can't just inline the array — parameterized queries are the only safe way to avoid SQL injection. The bridge from frontend: this is the same instinct as React's controlled inputs (never inline user data into a string).

The complexity is `O(n)` where `n` is the table size (`DELETE` scans for matching rows), plus the `NOT IN` membership test which is `O(m)` per row where `m` is the in-list size. SQLite optimizes `NOT IN` over indexed columns, so effective cost is `O(n + m log n)` for our index.

### `pullSessions` — the JS Set diff

```typescript
const activeNotionPageIds = new Set<string>();
for (const page of allPages) {
  if (page.archived) continue;
  activeNotionPageIds.add(page.id);
  // ... upsert logic
}

for (const local of localSessions) {
  if (local.notionPageId && !activeNotionPageIds.has(local.notionPageId)) {
    await deleteSession(local.id);
  }
}
```

`src/services/notion/sync.ts` L130 + L197–L202. Same logic, different layer:
1. Iterate the remote set, build a `Set<string>` of remote IDs.
2. Iterate the local set, check membership in the remote set.
3. Anything local that *was* synced (has `notionPageId`) but isn't in the remote set anymore was deleted on Notion's side. Delete locally.

`Set.has()` is O(1). Building the set is O(n_remote). The diff loop is O(n_local). Total: O(n_remote + n_local) for the whole reconciliation.

### Why two layers (SQL + JS)?

`pullExercises` does the diff in SQL because exercises is a *single table* with no complex matching logic — just "id is or isn't in this list". The query engine handles it.

`pullSessions` does the diff in JS because sessions need fuzzy matching (try `contrl ID` first, fall back to `notionPageId`), and the deletion path needs side effects beyond `DELETE` (e.g., logging which sessions were removed). Doing this in SQL would require a temporary table or a complex `WITH` clause.

### Move 2.5 — the empty-set edge case

```typescript
if (ids.length === 0) return deleteAllExercises();
```

This branch fires the first time you sync with an empty Notion database. Without it, the SQL would throw and the sync would log an error. The branch makes the semantics correct: "Notion has no exercises" → "local should have no exercises", not "empty list invalid".

---

## Brute force vs optimal

```
Brute force (don't):              Optimal (taken):
─────────────────────────────     ─────────────────────────────
for (local of locals) {            new Set + has() check
  let found = false;               OR SQL NOT IN with index
  for (remote of remotes) {
    if (local.id === remote.id) {
      found = true; break;
    }
  }
  if (!found) delete(local);
}
O(n × m)                          O(n + m)
```

For 1000 sessions × 1000 remote pages: 1M comparisons brute force, 2K with the Set. The Set is the difference between "feels instant" and "spinner for half a second".

### Execution trace

```
remoteSessions = [
  { notionId: 'A', ... },
  { notionId: 'B', ... },
  { notionId: 'D', ... },
]
localSessions = [
  { id: 'session1', notionPageId: 'A' },
  { id: 'session2', notionPageId: 'C' },  ← stale: C deleted from Notion
  { id: 'session3', notionPageId: 'D' },
]

Step 1: build remote set
  activeNotionPageIds = Set { 'A', 'B', 'D' }

Step 2: diff loop
  session1.notionPageId = 'A'
    'A' in set? YES → keep
  session2.notionPageId = 'C'
    'C' in set? NO → deleteSession('session2')
  session3.notionPageId = 'D'
    'D' in set? YES → keep

Final local state:
  [session1, session3]
```

### When brute force is fine

At ≤ 100 of each list (current scale), even the `O(n × m)` brute force is fine — 10k comparisons is a millisecond. We use the Set because the code reads more clearly, not because we need the speed.

---

## Set diffing — diagram

```
┌─ Remote (Notion) ──────────────┐         ┌─ Local (SQLite) ─────────────────┐
│  page A                        │         │  session1  notionId=A            │
│  page B                        │         │  session2  notionId=C  ←─ stale  │
│  page D                        │         │  session3  notionId=D            │
└──────────┬─────────────────────┘         └──────────────┬──────────────────┘
           │                                              │
           ▼  build Set                                   │
   ┌──────────────────────────┐                           │
   │ activeRemote = {A, B, D} │                           │
   └────────────┬─────────────┘                           │
                │                                          │
                │  for each local, check membership        │
                │◄──────────────────────────────────────────┘
                ▼
   ┌──────────────────────────────┐
   │  session1 (notionId=A) → in  │
   │  session2 (notionId=C) → OUT │  → deleteSession('session2')
   │  session3 (notionId=D) → in  │
   └──────────────────────────────┘
```

---

## In this codebase

**SQL anti-join:**
- `src/services/database.ts` L257 `deleteExercisesNotIn(ids)`
- Used in `src/services/notion/sync.ts` L94 after iterating remote exercises

**JS Set diff:**
- `src/services/notion/sync.ts` L130 (build set), L197–L202 (delete loop)

---

## Elaborate

### Where this pattern comes from

The "upsert-then-prune" pattern is the standard reconciliation shape in source-mirror systems: rsync's `--delete`, git's "checkout removes untracked", Kubernetes' reconcile loops. The intuition is "make the local copy look like the remote authoritative one"; the algorithm is "apply everything remote has, then delete everything remote doesn't".

### The deeper principle

Reconciliation is a set operation, not a record-by-record one. Thinking about it as "for each local, decide what to do" leads to O(n²) algorithms and weird edge cases. Thinking about it as "compute the intersection, the additions, the deletions, then apply each batch" leads to clean code and good complexity.

### Where this breaks down

When the remote source is paginated and you can't see the whole set at once. Then "id not in remote set" is ambiguous — maybe it just hasn't been pulled yet. Solution: drain all pages first, then diff. That's what `queryDatabase` does — it paginates internally and returns the full array.

The other breakpoint: at very large N, holding both sets in memory becomes expensive. The fix is streaming: process pages incrementally, maintain a running diff. We're not at this scale.

### What to explore next

- [01-system-design/03-bidirectional-sync](../01-system-design/03-bidirectional-sync.md) → where this diff fits in the sync flow
- [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) → another use of Set/Map

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Set/SQL diff (taken)             │ Nested-loop O(n×m) (alternative) │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Time             │ O(n + m)                         │ O(n × m)                         │
│ Memory           │ O(n) for the Set                 │ O(1) (no extra set)              │
│ Code clarity     │ "is it in this set?"             │ Two nested loops, found flag     │
│ Adaptability     │ Works for any size n             │ Slow at scale                    │
│ Empty list edge  │ Needs early return               │ Same                             │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The memory cost: O(n_remote) for the Set. At ~1000 ids of ~20 chars each plus overhead, that's ~30 KB. Negligible. The bigger cost is the empty-list trap — the SQL form needs an early return because empty `IN ()` clauses are invalid SQL. Easy to forget when writing new code; would be a bug if missed.

### Sub-block 2 — what brute force would have cost

For 1000 × 1000 = 1M comparisons, ~10–50 ms in JS. At 10k × 10k it's 100M, ~5 seconds — visible spinner territory. The Set form scales freely.

### Sub-block 3 — the breakpoint

Fine until both sets exceed ~100k entries each — at that point memory for the Set becomes a few MB and rebuilding it on every sync stops being free. Solution: persist a "synced-as-of" set and incremental update.

### Sub-block 4 — what wasn't actually a tradeoff

A `WITH` CTE in SQL for the JS Set use case wasn't a real option — SQLite would handle the diff, but the codebase pattern is "side effects in JS, queries in SQL". Mixing them would be a smell.

---

## Summary

### Concept recap

Reconciling local SQLite against remote Notion is a set operation: keep what's in both, remove what's only local. SQL form: `DELETE WHERE id NOT IN (?, ?, ?)` with dynamic placeholder generation and an empty-list guard. JS form: build `Set<string>` of remote IDs, iterate local rows, delete any whose `notionPageId` isn't in the set. Both are O(n + m); the brute force is O(n × m). The constraint that forced this was Notion's "no tombstone" model — we have to detect deletions by absence rather than by event. The cost is one full enumeration of remote IDs per sync.

### Key points

- The Set/SQL form is O(n + m); brute force is O(n × m).
- Empty list needs an early-return in SQL (empty `IN ()` is invalid).
- Build the set once, query membership many times.
- Same shape in both layers; the choice between SQL and JS is about where side effects live.

---

## Interview defense

### Likely questions

**Q: Why use a Set instead of nested loops?  [mid]**
A: Set membership is O(1); a nested loop is O(n×m). With 1000 remote sessions and 1000 local, the difference is 2000 ops vs. 1M ops. At smaller scale either works; the Set reads cleaner. Builders' habit pays off when the data grows.

```
   Nested loop                          │   Set
   ────────────────────────────────── │ ────────────────────────────────
   for each local                      │   build Set from remotes
     for each remote                   │   for each local
       if match: keep                  │     if Set has(local.id): keep
   O(n × m)                            │   O(n + m)
```

**Q: Why does `deleteExercisesNotIn` have an empty-list early return?  [senior]**
A: Empty `IN ()` is invalid SQL. Without the guard, a fresh-empty Notion database produces a 0-id list and the query throws. The semantics we want is "Notion has no exercises → delete all local". The early return implements that explicitly. Without it, the sync logs an error and the local DB silently keeps stale exercises forever.

```
   Without the guard (bug)            │   With guard (taken)
   ────────────────────────────────── │ ────────────────────────────────
   DELETE WHERE id NOT IN ()          │   if ids.length === 0:
   → SQL error                        │     return deleteAllExercises()
   sync logs error, local stays stale │   correct semantics
```

**Q: At 1M local exercises and 1M remote, where does this break?  [arch]**
A: The Set is fine in memory (1M strings ≈ 100 MB — large but feasible). The SQL form's `NOT IN` with 1M placeholders would explode SQLite's prepared-statement parameter limit (~1000 in default builds). So we'd hit the SQL form's limit first. The fix: switch to a temp table approach — INSERT all remote IDs into a temp table, then `DELETE FROM exercises WHERE id NOT IN (SELECT id FROM temp_active)`. That's an O(n) insert + an indexed anti-join.

```
┌─ at 1M items each ───────────────────────────────────────┐
│  JS Set       ~100 MB     OK on desktop, tight on mobile│
│  SQL IN(...)  fails       parameter limit ←─ breaks first│
│  temp-table   ~10s        right answer                  │
└──────────────────────────────────────────────────────────┘
```

### One-line anchors

- Build a set once; query membership many times.
- Empty `IN ()` is invalid SQL; guard for it.
- Reconciliation is a set operation, not a loop-and-check.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the remote / local arrays and the Set used to diff them.

### Level 2 — Explain it out loud
Explain why we need this for Notion. Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add `deleteSessionsNotIn(notionIds)` — same pattern, applied to sessions." Reference `database.ts` L257.

### Level 4 — Defend the decision you'd change
"Would you ever cache the remote set instead of rebuilding it each sync?" When?

### Quick check — code reference test
- What file has `deleteExercisesNotIn`?
- What's the empty-list guard return?
- What `Set` method does the JS form use?

Then verify.
