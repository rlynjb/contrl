# Derived state

**Industry name(s):** Derive-don't-sync, computed state, projection from event log, single-source-of-truth + derivations
**Type:** Industry standard

> Sessions are the canonical inputs. Gates, levels, and weeks are pushed to Supabase as a convenience for restore, but are also recomputable from session history. SQLite is the source of truth; Supabase is the mirror. Streaks are computed at render time and never stored remotely.

**See also:** → [01-local-first-architecture](./01-local-first-architecture.md) · → [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md)

---

## Why care

You build a `useMemo(() => filtered = items.filter(...))` and never think "is this derivation safe?" — it's a function of `items`, so it can never disagree with `items`. Now picture the same setup across two devices, with `items` syncing but `filtered` *also* syncing. The moment those two clocks diverge by half a second you have a `filtered` that doesn't match `items.filter(...)` — and no obvious way to tell which one is the lie.

The pattern is **derive-don't-sync**. Sometimes called **single-source-of-truth + projections** or **event-sourced state**. It's the same instinct as Redux selectors, React's render-derives-from-state model, and how event-sourced systems (CQRS, Kafka Streams) work. The rule: if you can recompute it, don't store it as truth, and *never* sync it. Here's how that shows up in this codebase.

---

## How it works

Picture a single notebook of dated journal entries (the sessions). Anything you'd want to know — "what's my current level", "have I worked out this week", "what's my streak" — can be answered by flipping through the notebook. You don't need a second notebook that says "current level: 3" because you can always recompute it.

The strategy: **inputs and derived state both push to Supabase; on reinstall, pull restores everything; reconstruction is the fallback**.

### Inputs vs derivations

Looking at all SQLite tables and their sync status:

| Table | Role | Synced to Supabase? |
|---|---|---|
| `exercises` | reference data (seeded locally, synced for restore) | yes (push + pull-restore) |
| `sessions` | the input log | yes (push + pull-restore) |
| `gate_progress` | derived from sessions | yes (push + pull-restore; derivable as fallback) |
| `week_progress` | derived from sessions | yes (push + pull-restore; derivable as fallback) |
| `user_profile` | derived levels + profile | yes (push + pull-restore) |
| `drafts` | session-in-progress | **no** (transient by design) |
| `sync_state` | push/pull watermarks | **no** (local-only sync metadata) |
| `sync_deletions` | tombstone outbox | **no** (local-only outbox) |

All five entity tables cross the network boundary. Derived state (gates, weeks, levels) is pushed to Supabase as a convenience — removing a class of restore-time race — but is also recomputable from sessions via `reconstructFromSessions` if Supabase is unreachable.

If you're coming from frontend, the analogy is Redux: `sessions` is the action log; gates/levels/weeks are selectors *and* also persisted to a remote cache. You persist the selector output for the same reason you persist a `useMemo` result to localStorage — not because it's truth, but because recomputing on cold start has a cost.

### Why even store derivations locally?

`gate_progress` and `week_progress` *are* in SQLite — they're not recomputed from scratch on every render. The reason is performance: on app open, we want to paint the skill tree in tens of milliseconds, not after a full session-replay. So we maintain incremental updates in `logSession` (`useGameState.ts` L192–L287): when a new session is logged, the gate row updates in place.

The local DB is a cache of the derivation. It's allowed to be wrong (stale, missing rows) because we have a recovery path: `reconstructFromSessions` walks the session log and rebuilds the derivation deterministically. The cache is convenience; the session log is truth.

### The reconstruction safety net

```typescript
const isDefaultLevels = CATEGORIES.every(c => loadedUser.levels[c] === 1);
const existingGates = await Promise.all(
  CATEGORIES.map(c => db.getGateProgress(c, loadedUser.levels[c]))
);
const gatesAreUntouched = existingGates.every(
  g => !g || (g.consecutivePasses === 0 && !g.lastSessionDate)
);
if (allSessions.length > 0 && isDefaultLevels && gatesAreUntouched) {
  const reconstructed = reconstructFromSessions(allSessions);
  // ... persist reconstructed state
}
```

`useGameState.ts` L112–L133. The condition detects a "freshly initialized" state: sessions exist (we just pulled them from Supabase, but the derived rows didn't populate correctly) but levels are default and gates have no recorded progress. That's the reinstall fingerprint — sessions arrived, derivation didn't. The fix is to recompute from the session log. Under the normal reinstall path this trigger should not fire, because `pullRestoreIfFresh()` pulls all five tables including gate_progress and week_progress. See [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) for the replay itself.

This works *because* the rule is upheld everywhere else: gates/levels/weeks are *always* a function of sessions. If we ever broke that rule (e.g., let users manually set their level), reconstruction would silently overwrite their manual edits.

### The principle

Derived state (gates, weeks) IS pushed to Supabase as a convenience for restore, but is also derivable from sessions if Supabase is unavailable. SQLite remains the source of truth — Supabase is the mirror. The local rebuild path (`reconstructFromSessions` in `src/lib/game/reconstruct.ts`) is the proof that derived state is never *required* from the cloud — it can always be recomputed from the canonical session log. Pushing derived state to Supabase removes a class of restore-time race (recompute vs. eager population), and Supabase is cheap enough that the storage cost is irrelevant.

The full picture is below.

---

## Derived state — diagram

```
┌─ Pushed to Supabase (live, on every write) ──────────────────────────────────────────┐
│                                                                                      │
│   sessions       ──────► push ──────►  Supabase: sessions                            │
│   exercises      ──────► push ──────►  Supabase: exercises                           │
│   gate_progress  ──────► push ──────►  Supabase: gate_progress                       │
│   week_progress  ──────► push ──────►  Supabase: week_progress                       │
│   user_profile   ──────► push ──────►  Supabase: user_profile                        │
│                                                                                      │
│   ◄── pull (fresh install only) ──  all 5 tables via pullRestoreIfFresh()            │
│                                                                                      │
└──────────┬───────────────────────────────────────────────────────────────────────────┘
           │
           │  (reads in `load()` and `reconstructFromSessions` — fallback path)
           │
           ▼
┌─ Derived layer (SQLite — canonical; Supabase copy is convenience mirror) ────────────┐
│                                                                                      │
│   reconstructFromSessions(sessions)  ← fallback only if Supabase unreachable         │
│      ↓                                                                               │
│   ┌─────────────────────────────┐    ┌──────────────────────────────────┐            │
│   │ user_profile.*_level        │    │ gate_progress                    │            │
│   │  (current per-cat level)    │    │  (status, consecutivePasses,     │            │
│   │                             │    │   lastSessionDate per cat:level) │            │
│   └─────────────────────────────┘    └──────────────────────────────────┘            │
│                                                                                      │
│   buildWeekHistory(sessions) + getWeekStart(today)                                   │
│      ↓                                                                               │
│   ┌─────────────────────────────┐    ┌──────────────────────────────────┐            │
│   │ week_progress (current wk)  │    │ streak  (calculated each render) │            │
│   └─────────────────────────────┘    └──────────────────────────────────┘            │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

Push is one-way (SQLite → Supabase). Pull is one-shot (Supabase → SQLite, fresh install).
Streak is never stored remotely — computed at render time from buildWeekHistory.
```

---

## In this codebase

**File:** `src/hooks/useGameState.ts`
**Function / class:** `useGameStateInternal()` → `load()` → optional `reconstructFromSessions`
**Line range:** L68–L158 (load orchestration); L112–L133 (reconstruction trigger)

Derivation functions:
- `reconstructFromSessions(sessions)` — `src/lib/game/reconstruct.ts` L13
- `buildWeekHistory(sessions)` — `src/hooks/useGameState.ts` L329
- `calculateStreak(history)` — `src/lib/game/streaks.ts` L18
- `getWeekStart(date)` — `src/lib/game/week-progress.ts` L7

Incremental updates (the cache path):
- `logSession()` — `useGameState.ts` L192. Updates `gate_progress` and `week_progress` in place, advances `*_level` if a gate passes.

---

## Elaborate

### Where this pattern comes from

Event sourcing as a formal concept goes back to Greg Young's CQRS talks (2010), but the underlying intuition is much older — accountants have always treated the journal as truth and the ledger as a projection. In frontend the same shape became standard with Redux (2015) and stuck because it made debugging tractable: every state at every point in time is a pure function of the action log.

### The deeper principle

Eliminate disagreement by eliminating redundancy. Two sources of truth that *should* agree but *might not* is the bug factory. Having one source plus pure projections means the only way to get the wrong answer is to project incorrectly — which is a bug you can localize, write a test for, and fix. There's no possible "the two sources disagreed and we don't know which is right" scenario.

### Where this breaks down

When the derivation is expensive (large data + complex compute), recomputing on demand becomes infeasible. The cure is to materialize the derivation as a cache *with explicit invalidation rules* — which is exactly what `gate_progress` and `week_progress` are here. The cache is the optimization; the source of truth is still the session log.

The other breakpoint: when the inputs are unbounded (e.g., 10 years of daily sessions = ~3,500 rows). At that point full replay on every load becomes slow. The fix is incremental projection: maintain a checkpoint (e.g., "state as of 2025-01-01"), only replay sessions after the checkpoint. We're not at that scale.

### What to explore next

- [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) → what happens when the cache is empty
- [02-dsa/08-streak-fold](../02-dsa/08-streak-fold.md) → the streak fold over week history
- [01-local-first-architecture](./01-local-first-architecture.md) → why this rule pairs with local-first

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Push derived + reconstruction fallback│ Derive-only (no remote copy)      │
├────────────────────┼──────────────────────────────────────┼───────────────────────────────────┤
│ Sync surface       │ 5 entities                           │ 2 entities (sessions + exercises) │
│ Reinstall path     │ Pull all 5 tables (fast)             │ Pull sessions + replay (~30ms)    │
│ Reinstall race     │ None (derived arrives pre-built)     │ Possible if fingerprint misfires  │
│ Reconciliation     │ LWW per entity (watermark push)      │ Local recompute, deterministic    │
│ Code complexity    │ Sync code per entity                 │ Derivation functions only         │
│ Bug surface        │ "Remote derived stale vs sessions"   │ "Derivation off by one"           │
│ Storage cost       │ More Supabase rows                   │ Less Supabase rows                │
│ Fallback           │ reconstructFromSessions in code      │ reconstructFromSessions required   │
└────────────────────┴──────────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *replay correctness*. The derivation functions (`reconstructFromSessions`, `buildWeekHistory`, `calculateStreak`) must produce *exactly* the same output as the incremental updates in `logSession`. If they diverge — say, a future code change to `logSession` doesn't match a corresponding change to `reconstructFromSessions` — a reinstall would produce different state than the same sessions would have produced live. There's no DB-level constraint preventing this divergence; it's a discipline.

The second cost is incremental update bookkeeping. `logSession` does the work to keep `gate_progress` in sync with the underlying session log. If we ever miss an update path (e.g., a future "delete session" flow that doesn't recompute gates), the cache will silently drift from the session log. Reinstall would fix it, but in the meantime the UI would be wrong.

A third cost: the streak is recomputed on every `load()` from `buildWeekHistory(sessions)`. At 10 years of sessions that's still cheap (~3,500 rows), but the code structure assumes "load full session history" — at scale we'd need a windowed query.

### Sub-block 2 — what the previous derive-only model would have kept

Before derived state synced to Supabase, the reinstall path was: pull sessions → detect fingerprint → run `reconstructFromSessions`. That path had a race: if the fingerprint check fired before the session pull completed, reconstruction would produce default state. The new path — pull all 5 tables atomically — eliminates that race because the derived rows arrive in the same `pullRestoreIfFresh()` call as sessions, in a well-ordered sequence.

The cost of syncing derived state is more Supabase rows and slightly more push traffic per write (every gate update pushes a gate_progress row). The benefit is a reinstall path that doesn't require any recomputation. The `reconstructFromSessions` fallback remains in the code for the case where Supabase is unreachable on first launch — it is no longer the primary reinstall path, but it's still the safety net.

### Sub-block 3 — the breakpoint

Fine until **the session log exceeds ~50,000 rows** (about a decade of daily training across multiple categories). At that point full replay in `reconstructFromSessions` starts taking visible time (~200ms) and full `buildWeekHistory` becomes ~100ms — still within budget but no longer free. The fix is checkpointing: persist "state as of week W" and replay only the tail.

### Sub-block 4 — what wasn't actually a tradeoff

Redux Persist was not a real alternative because the cache is a SQL table, not a serialized JS object. The disk format matters: we want WHERE clauses on `gate_progress.category`, not a full JSON blob to load and filter in memory.

---

## Tech reference (industry pairing)

### React + custom reducer pattern

- **Codebase uses:** `useGameStateInternal` hook with imperative load + per-action update functions. No Redux. `src/hooks/useGameState.ts`.
- **Why it's here:** the state pattern that lets `load()` reconstruct from sessions and `logSession()` incrementally update without library overhead.
- **Leading today:** React Context + custom hooks — `adoption-leading` for single-store mobile apps, 2026.
- **Why it leads:** zero dependencies, predictable performance, native to the framework.
- **Runner-up:** Zustand — `innovation-leading` for ergonomic state management with minimal boilerplate; the right choice if state coordination grows beyond two contexts.

---

## Summary

### Concept recap

All five entity tables (sessions, exercises, gate_progress, week_progress, user_profile) push to Supabase on every write and are pulled on fresh install. Derived state (gates, levels, weeks) IS pushed to Supabase as a convenience — it removes a restore-time race and is cheap storage. SQLite remains the source of truth; Supabase is the mirror. The `reconstructFromSessions` fallback is still in the code for the case where Supabase is unreachable on first launch. Streak is the only derived value that never touches the remote — it is computed at render time from `buildWeekHistory`. The cost is discipline: every code path that touches gates must keep the local cache aligned with what a full replay would produce, and the Supabase copy must not be treated as authoritative over the local session log.

### Key points

- Lives in step 4 (State ownership) of the system-design checklist.
- All five entity tables sync to Supabase; drafts, sync_state, and sync_deletions are local-only.
- Derived state (gates, weeks, levels) is pushed to Supabase as a convenience mirror, not as truth.
- SQLite is the source of truth; Supabase holds a mirror that enables fast reinstall without recomputation.
- `reconstructFromSessions` is the fallback when Supabase is unreachable on first launch.
- `logSession` keeps the local cache up-to-date incrementally; `pushChanges()` keeps the Supabase mirror in sync.

---

## Interview defense

### What an interviewer is really asking

Behind "why don't you sync gates" is "do you understand that storing two sources of truth that *should* agree but *might not* is a bug factory?" The signal is whether you can name the disagreement-bug class and your fix for it.

### Likely questions

**Q: Why DO levels and gates now sync to Supabase, given they're derivable?  [mid]**
A: Pushing derived state to Supabase removes a class of restore-time race. The old path was: pull sessions → detect fingerprint → run `reconstructFromSessions`. If the fingerprint check fired before the session pull fully landed, reconstruction would produce default state. The new path pulls all five tables atomically in `pullRestoreIfFresh()` — derived rows arrive pre-built, no recomputation needed. Supabase storage is cheap enough that the cost of carrying extra rows is irrelevant. The fallback (`reconstructFromSessions`) is still in the code for when Supabase is unreachable on first launch.

```
   Old reinstall path                   New reinstall path
   ────────────────────────────────     ────────────────────────────────
   pull sessions (1 table)              pull all 5 tables atomically
   detect fingerprint                   set watermarks, done
   reconstructFromSessions              reconstructFromSessions (fallback only)
   race if fingerprint misfires         no race
```

**Q: How do you guarantee the local `gate_progress` matches the result of replaying sessions?  [senior]**
A: Two paths. The fast path is `logSession`, which updates `gate_progress` incrementally on every new session — same algorithm as `reconstructFromSessions` would use, just applied to one new session at a time. The fallback path is `reconstructFromSessions` itself, which runs on a clean-install fingerprint (sessions present, levels default, gates untouched) and rebuilds from scratch. Discipline is required: every change to gate-update logic has to be applied to both paths.

```
   Fast path (incremental)              Slow path (full replay)
   ────────────────────────────         ────────────────────────────────
   logSession after each save           reconstructFromSessions on
   updates gate_progress in place       reinstall-fingerprint detection
                                        idempotent — running twice is
                                        the same as running once
```

**Q: What happens at 10 years × 365 days × 3 categories = ~10,000 sessions?  [arch]**
A: Replay stays cheap because the per-session work is O(1) — read one row, evaluate one gate, advance one counter. ~10,000 sessions replay in tens of milliseconds. The first scale concern is `getSessions()` loading all rows into JS for `buildWeekHistory`, but that's still small (a few MB). The real concern past ~50,000 sessions is full-replay time on reinstall climbing past ~200ms; the fix is a checkpoint mechanism — persist "state as of week W" and replay only sessions after W.

```
┌─ at 10k sessions ──────────────────────────────────────┐
│  reconstructFromSessions   ~30ms                       │
│  buildWeekHistory          ~10ms                       │
│  load full into JS         ~5MB  ← memory               │
└────────────────────────────────────────────────────────┘
┌─ at 100k sessions ─────────────────────────────────────┐
│  reconstructFromSessions   ~300ms  ← breaks first      │
│  fix: checkpoint + delta replay                        │
└────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: If a user manually edits a row in the Supabase web console, what happens on next push?**
A: Because RLS is disabled and there's no auth gate, a user (or developer) can edit any row in Supabase directly. The risk profile is bounded: `pushChanges()` uses a watermark (`updated_at > last_pushed_at`), so any local write that happened *after* the manual edit will overwrite the stale remote data on the next push. Editing remote rows directly is functionally OK because the local push is the authoritative direction — Supabase is the mirror, not the master. There is no pull path that would bring a stale Supabase row back to the device (pull only fires on fresh install).

```
   Direct Supabase edit → stale remote row
   ─────────────────────────────────────────────────────────────
   next local write → updated_at bumped
        │
        ▼
   pushChanges() → upserts local row, overwrites stale Supabase row
   ─────────────────────────────────────────────────────────────
   net effect: edit is overwritten on next local write
   acceptable: Supabase is the mirror, not the source of truth
```

### One-line anchors

- SQLite is the source of truth; Supabase is the mirror.
- Derived state is pushed to Supabase for restore convenience, not correctness.
- `reconstructFromSessions` is the fallback, not the primary reinstall path.
- Streak is the only derived value that never touches remote storage.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the eight tables. Mark which five push to Supabase, which two are local-only (drafts, sync_state), which is the tombstone outbox (sync_deletions). Then note which of the five Supabase-synced tables are "derived" (reconstructable from sessions). Compare.

### Level 2 — Explain it out loud
Explain to a teammate why derived state (gates, weeks) now syncs to Supabase even though it's recomputable. Under 90 seconds. Then explain why the streak counter still has no remote row.

### Level 3 — Apply it to a new scenario
"A user asks: I want to manually set my level. How would the codebase handle that, and what would go wrong?"

Trace through `reconstructFromSessions` and decide whether the manual override survives a reload. Reference `src/hooks/useGameState.ts` L119.

### Level 4 — Defend the decision you'd change
"Gates now sync to Supabase. If derived state becomes stale on Supabase (e.g., a partial push failed), what is the recovery path?" What changes and what stays the same if derived state in Supabase were treated as authoritative?

### Quick check — code reference test
- What file holds the reinstall-detection fingerprint?
- What function rebuilds state from sessions?
- Which two columns of `gate_progress` does the fingerprint check?

Then verify.

---

_Updated: 2026-05-17 — "Synced to Notion?" column renamed and all rows updated; derived state (gates, weeks, levels) now syncs to Supabase; diagram redrawn for 5-table push + one-shot pull; principle paragraph updated; interview Q flipped from "why don't gates sync" to "why DO gates sync"; Notion-edit Q replaced with Supabase-console-edit Q._
