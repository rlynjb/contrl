# 5. Data modelling

The schema has seven tables — `user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress`, `drafts`, `sync_deletions` — and the most important fact about it is that *only two of them are sources of truth*.

```
Source-of-truth grouping

  ┌─── canonical (must persist) ────────────┐
  │   user_profile      (one row)            │
  │   sessions          (append-mostly)      │
  │   sync_deletions    (tombstones)         │
  └──────────────────────────────────────────┘

  ┌─── cached / derived (rebuildable) ──────┐
  │   exercises         (mirror of Notion)   │
  │   gate_progress     (replay of sessions) │
  │   week_progress     (replay of sessions) │
  │   drafts            (transient UX state) │
  └──────────────────────────────────────────┘

Reconstruct on reinstall:

  sessions[] (sorted by date)
        │
        ▼
  for each session:
       isClean = every entry.hitTarget === true
       if isClean:
            consecutivePasses[cat][lvl] += 1
            if consecutivePasses == 3:
                 levelUp(cat)
                 consecutivePasses[cat][lvl+1] = 0
       else:
            consecutivePasses[cat][lvl] = 0
        │
        ▼
  persist user.levels, gate_progress
```

## Entity relationships

```
WorkoutSession
   │ id, date, level, category, passed, notes,
   │ notionPageId, updatedAt
   │
   └──▶ ExerciseEntry[]   (embedded JSON column)
            │ exerciseId, targetSets, targetReps,
            │ actualSets, actualReps[], actualHoldSeconds[],
            │ checkedSets[], hitTarget
            │
            └─── references ──▶ Exercise.id

Exercise
   │ id, name, category, level, targetSets, targetReps,
   │ isHold, sortOrder, tempo, notes (tip/next/scaleDown),
   │ notionPageId, updatedAt

User
   │ id, levels: { push: n, pull: n, squat: n },
   │ createdAt, notionPageId, updatedAt

GateProgress (derived)
   │ (level, category) → status, consecutivePasses,
   │                     lastSessionDate

WeekProgress (derived)
   │ weekStart (YYYY-MM-DD, Sunday) →
   │     sessionsCompleted: { push: bool, pull: bool, squat: bool }
```

## Interview questions

**[mid] Why is `ExerciseEntry[]` stored as a JSON column instead of a separate table?**

> Sessions are read and written as a unit — you never query "all exercise entries across all sessions where reps > 10." Every read in the app fetches a session and renders its entries together; every write inserts/updates the whole session. Normalising into a separate `session_entries` table would force a join on every read and an N-row insert on every write, with no query I'd actually run on the normalised form. SQLite handles JSON well, the schema is denormalised intentionally, and the cost is that I can't put an index on `entry.hitTarget` — but I never want to. If I ever needed to query across entries (e.g., "what's the user's best rep count for push-up A across all time?") I'd add a denormalised `exercise_stats` rollup, not normalise the entries.

**[senior] Walk me through the reinstall reconstruction. Why is it idempotent?**

> Idempotence falls out of three properties of the reducer in `src/lib/game/reconstruct.ts`. First, sessions are sorted by date before replay, so order is deterministic regardless of insert order. Second, the reducer is pure — same input session list, same output gate state — there's no random sampling, no clock dependency, no external read. Third, the reducer fully overwrites the gate cache rather than incrementally updating it. So running it twice in a row produces the same result as running it once. That property is *load-bearing* because of the two-phase load story: the first `load()` after a reinstall sees zero sessions and skips reconstruction; auto-sync pulls sessions and bumps `syncVersion`; the second `load()` sees sessions and runs reconstruction. If reconstruction weren't idempotent, the second pass could corrupt the first's output. With idempotence, a third or fourth pass is also safe — which I rely on, because manual sync after auto-sync re-runs it again.

**[arch] You said sessions are append-mostly. What happens when they aren't?**

> Two cases break the assumption: edits and deletions. Edits — the user goes back and corrects last week's session — are handled because every session has `updatedAt`, and the sync uses last-edit-wins with a 2-minute remote bias to resolve concurrent edits. The interesting case is deletions. SQLite delete on its own would lose the tombstone before sync, so the user's deletion would silently un-delete on the next pull. That's why `sync_deletions` exists: a separate tombstone table keyed by `notionPageId` that the sync flow processes (archive in Notion, then delete the tombstone) before pulling. At 10x scale this design starts to creak — the tombstone table grows unbounded if a sync never completes — so I'd add a `tombstoneCreatedAt` column and a sweep that deletes tombstones older than 30 days.

## The hard question

**"What's wrong with your `sessions.passed` column?"**

> It's redundant and inconsistent. `passed` is computable from the entries (`every(entry.hitTarget)`), but I store it as a column anyway. `buildSession()` in `useExerciseForm` doesn't always set it, `insertSession()` writes NULL when undefined, the History screen recomputes it from entries as a fallback, and the sync mapper reads it from Notion where it might not match the computed value. Three sources of truth for one boolean. I caught it during the audit (see `AUDIT.md`) and the fix is to either remove the column and always recompute, or guarantee it's set on insert and treated as authoritative. I haven't done either yet because the bug is silent — the fallback in History papers over it. That's the kind of thing that's "fine until it isn't" and is exactly the technical debt I'd surface in a real code review. I left it for now because the fix touches the sync mapper and I want to do the consolidation in one PR rather than three.
