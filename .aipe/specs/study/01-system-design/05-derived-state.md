# Derived state

**Industry name(s):** Derive-don't-sync, computed state, projection from event log, single-source-of-truth + derivations
**Type:** Industry standard

> Sessions are the only inputs that sync. Gates, levels, weeks, and streaks are all computed from session history at load time. Never stored as truth, never synced. The session log is the only source of fact; everything else is a projection.

**See also:** → [01-local-first-architecture](./01-local-first-architecture.md) · → [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md)

---

## Why care

You build a `useMemo(() => filtered = items.filter(...))` and never think "is this derivation safe?" — it's a function of `items`, so it can never disagree with `items`. Now picture the same setup across two devices, with `items` syncing but `filtered` *also* syncing. The moment those two clocks diverge by half a second you have a `filtered` that doesn't match `items.filter(...)` — and no obvious way to tell which one is the lie.

The pattern is **derive-don't-sync**. Sometimes called **single-source-of-truth + projections** or **event-sourced state**. It's the same instinct as Redux selectors, React's render-derives-from-state model, and how event-sourced systems (CQRS, Kafka Streams) work. The rule: if you can recompute it, don't store it as truth, and *never* sync it. Here's how that shows up in this codebase.

---

## How it works

Picture a single notebook of dated journal entries (the sessions). Anything you'd want to know — "what's my current level", "have I worked out this week", "what's my streak" — can be answered by flipping through the notebook. You don't need a second notebook that says "current level: 3" because you can always recompute it.

The strategy: **inputs sync; derivations are reads, not writes**.

### Inputs vs derivations

Looking at the seven SQLite tables:

| Table | Role | Synced to Notion? |
|---|---|---|
| `exercises` | reference data (Notion authoritative) | yes (pulled) |
| `sessions` | the input log | yes (bidirectional) |
| `user_profile.*_level` | derived from sessions | **no** |
| `gate_progress` | derived from sessions | **no** |
| `week_progress` | derived from sessions | **no** |
| `drafts` | session-in-progress | **no** (ephemeral) |
| `sync_deletions` | outbox | **no** (transport state) |

Only `exercises` (reference data) and `sessions` (the input log) cross the network boundary. Everything else is recomputable.

If you're coming from frontend, the analogy is Redux: `sessions` is the action log; gates/levels/weeks are selectors. You wouldn't dispatch an action to "set the current filtered list"; you'd dispatch the underlying mutation and let the selector recompute. Same instinct here, but across a network.

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

`useGameState.ts` L112–L133. The condition detects a "freshly initialized" state: sessions exist (we just pulled them from Notion) but levels are default and gates have no recorded progress. That's the reinstall fingerprint — sessions arrived, derivation didn't. The fix is to recompute from the session log. See [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) for the replay itself.

This works *because* the rule is upheld everywhere else: gates/levels/weeks are *always* a function of sessions. If we ever broke that rule (e.g., let users manually set their level), reconstruction would silently overwrite their manual edits.

### The principle

If a piece of state can be derived from another, deriving it (instead of storing it as a separate truth) eliminates an entire class of bugs — the disagreement bug. Two pieces of truth that should agree but sometimes don't is the most insidious failure mode in any system. The cure is to have one source of truth and project everything else from it. This is what people mean when they say "event-sourcing" or "single source of truth" — it's the same instinct dressed in different vocabulary.

The full picture is below.

---

## Derived state — diagram

```
┌─ Synced layer ──────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   sessions   ◄────────── pull/push ──────────►   Notion: Sessions DB                │
│                                                                                     │
│   exercises  ◄────────── pull only ──────────►   Notion: Exercises DB               │
│                                                                                     │
└──────────┬──────────────────────────────────────────────────────────────────────────┘
           │
           │  (reads only, in `load()` and `reconstructFromSessions`)
           │
           ▼
┌─ Derived layer (local only — never synced) ─────────────────────────────────────────┐
│                                                                                     │
│   reconstructFromSessions(sessions)                                                 │
│      ↓                                                                              │
│   ┌─────────────────────────────┐    ┌──────────────────────────────────┐           │
│   │ user_profile.*_level        │    │ gate_progress                    │           │
│   │  (current per-cat level)    │    │  (status, consecutivePasses,     │           │
│   │                             │    │   lastSessionDate per cat:level) │           │
│   └─────────────────────────────┘    └──────────────────────────────────┘           │
│                                                                                     │
│   buildWeekHistory(sessions) + getWeekStart(today)                                  │
│      ↓                                                                              │
│   ┌─────────────────────────────┐    ┌──────────────────────────────────┐           │
│   │ week_progress (current wk)  │    │ streak  (calculated each render) │           │
│   └─────────────────────────────┘    └──────────────────────────────────┘           │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

The arrow is one-way: sessions → derived. Never the reverse.
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
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Derive-don't-sync (taken)        │ Sync everything (alternative)     │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Sync surface       │ 1 entity (sessions)              │ 5 entities                        │
│ Conflict surface   │ Sessions only                    │ Every derived entity too          │
│ Reconciliation     │ Local recompute, deterministic   │ Per-entity LWW or CRDT            │
│ Code complexity    │ Derivation functions             │ Sync code per entity              │
│ Sync latency       │ Fast (sessions are small)        │ Slow (every entity adds time)    │
│ Bug surface        │ "Derivation off by one"          │ "Local and remote disagree"       │
│ Multi-device       │ Inputs sync, derivations match   │ Derivations can diverge silently  │
│ Reinstall recovery │ Replay the input log             │ Hope the cloud copy is correct    │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *replay correctness*. The derivation functions (`reconstructFromSessions`, `buildWeekHistory`, `calculateStreak`) must produce *exactly* the same output as the incremental updates in `logSession`. If they diverge — say, a future code change to `logSession` doesn't match a corresponding change to `reconstructFromSessions` — a reinstall would produce different state than the same sessions would have produced live. There's no DB-level constraint preventing this divergence; it's a discipline.

The second cost is incremental update bookkeeping. `logSession` does the work to keep `gate_progress` in sync with the underlying session log. If we ever miss an update path (e.g., a future "delete session" flow that doesn't recompute gates), the cache will silently drift from the session log. Reinstall would fix it, but in the meantime the UI would be wrong.

A third cost: the streak is recomputed on every `load()` from `buildWeekHistory(sessions)`. At 10 years of sessions that's still cheap (~3,500 rows), but the code structure assumes "load full session history" — at scale we'd need a windowed query.

### Sub-block 2 — what sync-everything would have cost

If gates, levels, weeks, and streaks were all separate Notion entities with their own sync logic: every sync would be 5× slower (more network calls), there would be 5 conflict resolutions to write, and *every* one would have a potential disagreement bug. The bug surface would be quadratic: any pair of derived entities could disagree with each other or with the underlying session log. We'd be debugging "the user's level says 4 but the gate at level 3 doesn't say passed" support tickets forever.

The alternative also wouldn't have given us multi-device determinism. Even with all five entities synced, a stale local cache could disagree with what a fresh local replay would produce. The only way to *guarantee* consistency is to make the local cache derivable from the synced log — which is what we already do.

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

Only sessions (the input log) and exercises (reference data) sync to Notion. Everything else — current level per category, gate progress, week progress, streak — is computed from session history. `gate_progress` and `week_progress` live in SQLite as a performance cache, kept up-to-date incrementally by `logSession`; on a clean reinstall the cache is empty and `reconstructFromSessions` rebuilds it deterministically from the session log. The constraint forcing this was avoiding multi-source-of-truth disagreements — if it can be recomputed, it's a projection, not a fact. The cost is discipline: every code path that touches gates must keep the cache aligned with what a full replay would produce.

### Key points

- Lives in step 4 (State ownership) of the system-design checklist.
- Five derived entities (levels, gates, weeks, streaks, drafts) never cross the network boundary.
- Sessions are the only input that syncs; everything else is projected.
- The local DB stores derivations as a *cache*, not as truth — reconstruction is the recovery path.
- `logSession` keeps the cache up to date incrementally; reconstruction is the fallback for empty/stale state.

---

## Interview defense

### What an interviewer is really asking

Behind "why don't you sync gates" is "do you understand that storing two sources of truth that *should* agree but *might not* is a bug factory?" The signal is whether you can name the disagreement-bug class and your fix for it.

### Likely questions

**Q: Why don't levels and gates sync to Notion?  [mid]**
A: Because they're a pure function of session history. If they synced, the device and Notion would each maintain a copy that could drift. A user who edited a session in Notion (changing its `passed` flag) would have a Notion-side derivation that doesn't match the local recomputation. The cure is to derive everywhere from the same input — only sessions sync, and every device recomputes the rest the same way.

```
   Synced: sessions, exercises          Derived locally only: levels,
   ────────────────────────────────     gates, weeks, streaks
                                        ────────────────────────────────
   exists on the network                exists in SQLite only
   conflict-resolution required         no conflict possible
   subject to LWW                       always matches sessions
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

**Q: If a user manually edits `passed` on a session in Notion (so the gate would have passed but the user wants to un-pass), does that work?**
A: Yes — because gates are derived from `passed`. Editing `passed` in Notion changes the session, syncs down, and the next `load()` recomputes gates. The user's edit propagates correctly through the derivation chain. This works precisely *because* gates aren't synced — if they were, the gate row in Notion would still say "passed" until the user also edited that, and now we have two sources of truth and three opportunities for inconsistency.

```
   Edit `passed` in Notion → derivation handles it
   ─────────────────────────────────────────────────────────────
   session.passed (synced)
        │
        ▼
   reconstructFromSessions  →  user_levels, gate_progress (derived)

   Compare with: edit `passed` AND gate.status both in Notion
   ─────────────────────────────────────────────────────────────
   session.passed = false        gate.status = passed
   → which is right? both? neither? user has to fix both? bug.
```

### One-line anchors

- The session log is fact; everything else is opinion.
- One source of truth, many projections.
- The cache is a performance optimization, not a contract.
- If two stores should agree, store only one and compute the other.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the seven tables. Mark which ones are inputs (sync), which are derived (don't sync), and which are transport/ephemeral. Compare.

### Level 2 — Explain it out loud
Explain to a teammate why the streak counter doesn't have a row in any table. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"A user asks: I want to manually set my level. How would the codebase handle that, and what would go wrong?"

Trace through `reconstructFromSessions` and decide whether the manual override survives a reload. Reference `src/hooks/useGameState.ts` L119.

### Level 4 — Defend the decision you'd change
"Would you sync gates if cloud-side gate metrics became a product feature (e.g., a shareable progress card)?" What changes and what stays the same?

### Quick check — code reference test
- What file holds the reinstall-detection fingerprint?
- What function rebuilds state from sessions?
- Which two columns of `gate_progress` does the fingerprint check?

Then verify.
