# Reconstruction on reinstall

**Industry name(s):** Event replay, idempotent state rebuild, projection rebuild
**Type:** Industry standard

> When the local DB has sessions but no derived state (the reinstall fingerprint), `reconstructFromSessions` chronologically replays every session through the gate-state machine. Pure function, deterministic, safe to run twice — running it again with the same input produces the same output.

**See also:** → [05-derived-state](./05-derived-state.md) · → [11-supabase-mirror-sync](./11-supabase-mirror-sync.md)

---

## Why care

A user uninstalls the app, walks away for three months, reinstalls on a different phone. The local DB starts empty. The first sync calls `pullRestoreIfFresh()`, which pulls every row from Supabase across 5 tables: exercises, sessions, gate_progress, week_progress, user_profile. The app gets back both the *facts* (sessions) and the *interpretation* (gate state, levels) in one pass — the home screen renders correctly without any recomputation. The `reconstructFromSessions` replay is the fallback for the case where Supabase is unreachable on first launch.

The pattern is **event replay**, sometimes called **projection rebuild** in CQRS systems. It's the same idea as `git reset --hard $(git log --reverse | first commit)` followed by re-applying every commit: take the inputs, run them through your derivation function, and the output state is exactly what it should be. The trick is making the replay *idempotent* — running it twice on the same data must produce the same result, even if some derivations were already partially in place. Here's how that works in this codebase.

---

## How it works

Imagine your bank account got wiped and only the transaction log survived. You can rebuild the current balance by starting from $0 and applying every transaction in chronological order. The same trick rebuilds gates and levels here.

The strategy: **sort the inputs chronologically, replay each through a pure state-transition function, persist the final state**.

### When it fires

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
  // persist ...
}
```

`useGameState.ts` L107–L133. The fingerprint says "we have inputs but no interpretation":
1. **Sessions exist** — the sync pulled them down, otherwise there's nothing to replay.
2. **All levels are default** (every category = 1) — no incremental updates have applied yet.
3. **All current-level gates are untouched** (`consecutivePasses === 0` and no `lastSessionDate`) — no `logSession` has run.

When all three are true, replay runs. Note: a prior version of this check (`!hasAnyGate`) was unreliable — the *initial* DB-ready `load()` fires before sync pulls sessions, creating default L1 gate rows, which then made the post-sync reload skip reconstruction. The current fingerprint is robust: it doesn't care whether the gate row exists, only whether it has *recorded any progress*.

If you're coming from frontend, this is like a React hook that has both an effect-on-mount and an effect-on-prop-change — the trickier rule of "fire when the data shape says we're in a freshly-initialized state, not on every render".

### The replay function

```typescript
export function reconstructFromSessions(sessions: WorkoutSession[]) {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const userLevels: Record<Category, number> = { push: 1, pull: 1, squat: 1 };
  const gates: Record<string, GateProgress> = {};

  for (const session of sorted) {
    const { category, level } = session;
    if (level > userLevels[category]) continue;  // skip sessions above current

    const gate = getGate(category, level);
    if (gate.status === 'passed') continue;

    const isClean = session.exercises.length > 0 &&
      session.exercises.every(e => e.hitTarget);

    if (isClean) {
      gate.consecutivePasses += 1;
      gate.lastSessionDate = session.date;
      if (gate.consecutivePasses >= 3) {
        gate.status = 'passed';
        if (level === userLevels[category] && userLevels[category] < MAX_LEVEL) {
          userLevels[category] = level + 1;
        }
      }
    } else {
      gate.consecutivePasses = 0;
      gate.lastSessionDate = session.date;
    }
  }
  return { userLevels, gateProgress: gates };
}
```

`src/lib/game/reconstruct.ts` L13.

**Step 1 — Sort chronologically.** `[...sessions].sort(...)` produces a new sorted array; the input is not mutated. Sorting matters because gate state depends on *consecutive* clean sessions — order-dependent.

**Step 2 — Initialize fresh state.** Levels at 1, gates empty. The replay starts from scratch every time. This is what makes it idempotent: the function never reads from existing state, so calling it twice with the same input produces the same output.

**Step 3 — For each session, transition.** Skip if the session is at a level above the current derived level (out-of-band data, can't happen in normal flow). Skip if the gate at this level is already passed. Otherwise compute `isClean` (every exercise hit target) and either increment consecutive passes or reset to zero. If consecutive passes hit 3, mark gate passed and advance the level.

**Step 4 — Return the derived state.** Pure function out: `{ userLevels, gateProgress }`. The caller persists both.

### What makes it idempotent

```
state₀ = { levels: {1,1,1}, gates: {} }
   │
   │  apply session_1 (clean push L1)
   ▼
state₁ = { levels: {1,1,1}, gates: { push:1 → consec=1 } }
   │
   │  apply session_2 (clean push L1)
   ▼
state₂ = { levels: {1,1,1}, gates: { push:1 → consec=2 } }
   │
   │  apply session_3 (clean push L1)
   ▼
state₃ = { levels: {2,1,1}, gates: { push:1 → consec=3, passed } }
```

If we run `reconstructFromSessions(sessions[0..2])` then run it again on the same array, we get state₃ both times. The function doesn't *care* what state was in the DB before it ran. The persistence step that follows will `INSERT OR REPLACE` every row, so the DB ends up matching the function output.

The practical consequence: if reconstruction fires twice during a single app open (e.g., the initial post-sync reload races with a manual `refresh()`), nothing breaks. The second run produces the same output as the first.

### The principle

Replay is what makes event-sourced systems debuggable. When everything is a projection of an immutable log, you can rebuild any state by re-running the projection. Lost data? Pull the log and project. Bug in the projection? Fix it, replay. Want to add a new derived metric? Project it from the same log. This is the same shape used by Kafka Streams, Datomic, Apache Pulsar, and CQRS systems generally.

The full picture is below.

---

## Reconstruction on reinstall — diagram

```
┌─ Initial load (cold start) ───────────────────────────────────────────────────────┐
│                                                                                   │
│   useDatabase()  →  getDatabase()  →  contrl.db opened, tables created            │
│                                                                                   │
│   useGameState.load()  ──► db.getSessions()  →  []  ←─ empty, no replay needed    │
│                                                                                   │
└──────────┬────────────────────────────────────────────────────────────────────────┘
           │
           │  app/_layout.tsx L37–L42 — useEffect on `ready`
           ▼
┌─ Sync runs (pullRestoreIfFresh) ──────────────────────────────────────────────────┐
│                                                                                   │
│   pullRestoreIfFresh()                                                             │
│        │                                                                          │
│        ├─ check: last_pulled_at IS NULL?                                          │
│        ├─ check: sessions table empty?                                            │
│        │  (if either fails → early return; not a fresh install)                  │
│        │                                                                          │
│        ├─ supabase.from('exercises').select('*')                                  │
│        ├─ supabase.from('sessions').select('*')                                   │
│        ├─ supabase.from('gate_progress').select('*')                              │
│        ├─ supabase.from('week_progress').select('*')                              │
│        ├─ supabase.from('user_profile').select('*')                               │
│        │                                                                          │
│        ├─ restoreInProgress = true                                                │
│        ├─ clearLocalForRestore()  // wipes JSON-seed pollution before upsert      │
│        ├─ for each row → db.upsert* (writers fire pushChanges, blocked by flag)  │
│        ├─ set last_pulled_at = now, last_pushed_at = now  (inside try-finally)   │
│        └─ restoreInProgress = false                                               │
│                                                                                   │
│   .then(() => pushChanges())  ←─ fires after restore completes                   │
│                                                                                   │
└──────────┬────────────────────────────────────────────────────────────────────────┘
           │
           │  useGameState load() re-fires (React state update from db writes)
           ▼
┌─ Post-restore load ───────────────────────────────────────────────────────────────┐
│                                                                                   │
│   load() sees sessions + gate_progress + week_progress already populated          │
│                                                                                   │
│   isDefaultLevels? — likely false (user_profile levels restored from Supabase)    │
│   gatesAreUntouched? — likely false (gate rows restored with real progress)       │
│   → fingerprint does NOT match → reconstructFromSessions does NOT run             │
│                                                                                   │
│   ── fallback path (Supabase unreachable on first launch) ──────────────────────  │
│   If pull failed silently: sessions present, levels default, gates untouched      │
│   → fingerprint matches → reconstructFromSessions runs as recovery               │
│                                                                                   │
│   build gates, compute streak, set React state                                    │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/lib/game/reconstruct.ts`
**Function / class:** `reconstructFromSessions(sessions)`
**Line range:** L13–L72

Trigger logic:
- **File:** `src/hooks/useGameState.ts`
- **Function:** `load()` (the reinstall-fingerprint check is at L107–L133)

Supporting:
- `createGateProgress(category, level, userLevel)` — `src/lib/game/gate-check.ts` L23
- The restore trigger: `app/_layout.tsx` L37–L42 — `useEffect` on `ready` fires `pullRestoreIfFresh().then(() => pushChanges())`
- Restore engine: `src/services/sync/supabase-sync.ts` — `pullRestoreIfFresh()` L130–L196
- Restore flag: `restoreInProgress` (module-level in `supabase-sync.ts`) blocks fire-and-forget pushes during restore

---

## Elaborate

### Where this pattern comes from

Event sourcing as a formal pattern dates to Greg Young's CQRS talks (2010), but log-replay-for-state-rebuild is older — accounting ledgers, Unix logs, database WAL recovery. The shape is universal whenever you have an authoritative log and a derived projection: lose the projection, rebuild from the log.

### The deeper principle

Idempotence is the property that makes replay safe. A pure function of inputs produces the same outputs regardless of how many times you call it, so re-running the projection is risk-free. The discipline is making sure every step in the projection is itself a pure function — no clock reads, no random IDs, no side effects. `reconstructFromSessions` is pure (no clock, no I/O), which is why we can run it twice in flight without consequence.

### Where this breaks down

When the input log is unbounded or the projection is expensive. At 100,000 sessions a full replay starts to take noticeable time. The fix is checkpointing: snapshot the projection at intervals and replay only the tail. We don't need this yet.

The other breakpoint: when projections aren't pure. Anything that depends on "now" (e.g., a streak that considers today's date) is fragile across reload — you can't replay the past and get the same answer "today" produces. The codebase sidesteps this by computing streaks at render time from `buildWeekHistory`, not during reconstruction.

### What to explore next

- [05-derived-state](./05-derived-state.md) → why this rule exists in the first place
- [02-dsa/01-sorting-sessions-chronologically](../02-dsa/01-sorting-sessions-chronologically.md) → the sort step in detail
- [11-supabase-mirror-sync](./11-supabase-mirror-sync.md) → the sync engine that fires this on app open

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Full replay on fingerprint       │ Snapshot stored remotely          │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Reinstall path     │ pull sessions + replay (~30ms)   │ pull snapshot (fast) + apply      │
│ Code complexity    │ One replay function              │ Snapshot mgmt + invalidation       │
│ Bug surface        │ Must match incremental logic     │ Stale-snapshot bugs               │
│ Storage cost       │ None beyond session log          │ Extra snapshot rows per user      │
│ Determinism        │ Pure function                    │ Depends on snapshot freshness     │
│ Conflict story     │ N/A (purely local rebuild)       │ Snapshot can be stale vs sessions │
│ Migration friction │ Add a derivation → replay handles│ Add a derivation → backfill all   │
│ Scale to 100k rows │ ~300ms                           │ Constant                          │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is the *consistency-with-incremental-update* discipline. `reconstructFromSessions` must produce the same result as a chronological sequence of `logSession` calls would have. If `logSession` ever changes its gate-update logic without a matching change to `reconstructFromSessions`, a reinstall produces different state than a same-sessions live build. There's no test covering this divergence today — it's enforced by code review.

The second cost is *all-or-nothing* — the fingerprint either matches and the full replay runs, or it doesn't and nothing runs. If a user's local DB is in a *partially* corrupted state (some gate rows present, some missing, some with stale data), the fingerprint will likely not match and replay won't fire. The user is stuck with the corrupted cache until they uninstall.

### Sub-block 2 — what a snapshot strategy would have cost

If we stored a "current state" snapshot in a dedicated Supabase table (latest user levels + gate states as a single row), reinstall would be faster — pull the snapshot, apply, done. But: every `logSession` would need to push the snapshot, doubling sync write traffic. The snapshot could be stale vs. the actual session log if a sync only partially completed. Adding a new derivation (e.g., a "biggest gain this month" stat) would require backfilling snapshots for every existing user. Bug surface inverts: instead of "replay drifted from incremental", we'd have "snapshot drifted from sessions". The current approach — push each entity table's rows individually — is effectively the snapshot strategy without the dedicated snapshot table, since all rows arrive atomically in `pullRestoreIfFresh()`.

### Sub-block 3 — the breakpoint

Fine until session count exceeds ~50,000 (about 50 years of daily training × 3 categories). At that point full replay is ~300ms and post-sync reload becomes visibly slow. The fix is checkpointing — persist state-as-of-week-W and replay only the tail. The schema doesn't have to change; we'd add a `state_snapshots` table with one row per checkpoint and modify the trigger to use the latest snapshot + tail replay.

### Sub-block 4 — what wasn't a tradeoff under the new model

Storing derived state in Supabase IS what the current model does. The concern that blocked this under Notion ("a user could manually edit 'current level' in the remote DB and break the local recompute") still exists with Supabase, but the risk is bounded: `pushChanges()` uses a watermark, so any subsequent local write will overwrite a manually edited Supabase row. The remote is the mirror; the local is authoritative. A developer editing Supabase directly is fine — the next push wins.

What wasn't a tradeoff: full-replay-only (no remote derived state). Derived state in Supabase removes a restore-time race that made the reconstruct fingerprint fragile. Keeping it local-only would have required maintaining the fingerprint check indefinitely and accepting that a network failure during the session pull could produce a partially rebuilt state.

---

## Tech reference (industry pairing)

### Pure-function projection

- **Codebase uses:** `reconstructFromSessions` as a pure function in `src/lib/game/reconstruct.ts`. No I/O inside the function.
- **Why it's here:** purity enables idempotence; idempotence enables safe replay.
- **Leading today:** Pure projections — `adoption-leading` for event-sourced systems, 2026.
- **Why it leads:** debuggable, testable, predictable; the same input always produces the same output regardless of context.
- **Runner-up:** Stateful projections with checkpoints — `innovation-leading` for high-volume systems; the right choice past ~100k events.

---

## Summary

### Concept recap

On a fresh install, `pullRestoreIfFresh()` pulls all 5 entity tables from Supabase and upserts them locally — derived state (gates, levels, weeks) arrives pre-built, no recomputation needed. The `reconstructFromSessions` replay is the fallback: it fires if the Supabase pull fails and the reinstall fingerprint matches (sessions present, levels default, gates untouched). The replay function sorts every session chronologically, evaluates each through the gate-state machine starting from clean state, and returns projected user levels and gate progress. The function is pure, idempotent, and safe to invoke twice. The cost is the discipline that incremental updates (`logSession`) must always match what a full replay produces.

### Key points

- Lives in step 4 (State ownership) and step 5 (Failure handling) of the system-design checklist.
- Normal reinstall: `pullRestoreIfFresh()` pulls 5 tables from Supabase; reconstruction not needed.
- Fallback reinstall: Supabase unreachable → fingerprint check → `reconstructFromSessions`.
- Fingerprint: sessions present, all levels default, all current-level gates untouched.
- The replay function is pure — no clock reads, no I/O — which is what makes it idempotent.
- Sort chronologically; gate state depends on the order of clean vs. dirty sessions.
- `reconstructFromSessions` and `logSession` must always produce the same output for the same session sequence.

---

## Interview defense

### What an interviewer is really asking

Behind "what happens on reinstall" is "do you have a real recovery story for derived state, or is your local cache the only copy and you're hoping?" The signal is whether you can name the trigger condition, the function purity, and the idempotence property.

### Likely questions

**Q: What runs on app reinstall?  [mid]**
A: On reinstall, `getDatabase()` creates a fresh `contrl.db` with empty tables. Then `_layout.tsx`'s `useEffect` on `ready` calls `pullRestoreIfFresh()`, which checks that `last_pulled_at IS NULL` and `sessions` is empty — both true on a fresh install. It then selects all rows from all 5 Supabase tables (exercises, sessions, gate_progress, week_progress, user_profile), wipes any JSON-seed pollution via `clearLocalForRestore()`, upserts each row, and sets both watermarks to now. The home screen renders with the correct state directly from the pulled rows. `reconstructFromSessions` is the fallback only if the Supabase pull fails.

```
   reinstall → empty DB → pullRestoreIfFresh() → 5-table Supabase SELECT
             → clearLocalForRestore() → upsert each row → set watermarks
             → load() sees populated DB → render home screen
             (reconstructFromSessions: fallback only if Supabase unreachable)
```

**Q: Why does the function never read existing gate state?  [senior]**
A: To make it idempotent. If the function read existing state, running it twice could amplify changes (e.g., advance a counter that's already been advanced). By initializing from zero every time and returning the full computed state, the function is purely a projection of its input. The caller's `INSERT OR REPLACE` writes the output, so the final DB state equals the function output regardless of what was in the DB before the call.

```
   Stateful (reads existing)        │   Pure (initializes from 0)
   ────────────────────────────────│──────────────────────────────────
   2nd call may differ from 1st   │   2nd call == 1st call (always)
   amplification bugs possible    │   no amplification possible
   needs careful invariants       │   trivially idempotent
```

**Q: What if a user has 100,000 sessions?  [arch]**
A: Full replay is O(n) per session and per-session work is constant — read date, check level, evaluate cleanness, advance counter. At 100k sessions full replay is ~300ms — still under render budget but no longer free. The first scale concern is post-sync reload latency. The fix is a checkpoint mechanism: persist a snapshot every N weeks and replay only sessions after the snapshot. The schema would gain a `state_checkpoints` table; reconstruction would find the most recent checkpoint and replay only the tail.

```
┌─ at 100k sessions ─────────────────────────────────────────┐
│  sort + replay     ~300ms       ←─ user feels this        │
│  fix: checkpoint snapshots + tail replay                  │
│  result: replay ~30ms regardless of total session count   │
└───────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What happens if reconstruction *would* produce a different result than the incremental updates produced (because of a code change to one path but not the other)?**
A: Under the new model, reconstruction is the fallback — it only fires when Supabase was unreachable on first launch. So the bug is less likely to surface in normal use. But it's still silent when it does surface: reconstructed state replaces incrementally-built state, and the user sees a different home screen. There's no test catching this divergence. The mitigation is a property test: generate random session sequences, apply both `logSession` (incremental) and `reconstructFromSessions` (replay), assert identical output. That doesn't exist yet — call it tech debt. The alternative (always replay on load) would be slow on every save but would eliminate the divergence.

```
   Picked (incremental + replay)    │   Always-replay (alternative)
   ────────────────────────────────│──────────────────────────────────
   fast on every save              │   replay cost on every save
   bug surface: divergence between │   no divergence (one code path)
     two code paths                │   slower at scale
   relies on code-review discipline│   simpler, slower
```

### One-line anchors

- Normal reinstall: `pullRestoreIfFresh()` is the primary path; no replay needed.
- Fallback: fingerprint match → `reconstructFromSessions` → idempotent replay.
- Pure functions enable idempotent replay; initializing from zero each run is what makes it safe.
- Two code paths (incremental `logSession` + fallback `reconstructFromSessions`) must produce the same answer.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the trigger condition (3 booleans) and the replay flow (sort → loop → return). Compare against the diagram.

### Level 2 — Explain it out loud
Explain the reinstall flow to a teammate who's seen a user report "I uninstalled and reinstalled and my levels were wrong". Under 90 seconds. Name both the primary path (Supabase pull) and the fallback path (reconstruction) and explain when each fires.

### Level 3 — Apply it to a new scenario
"A user logs a clean session at L4 in `push`, but their current `push` level is L2 (this shouldn't happen normally, but say it did). What does reconstruction do?"

Trace through `reconstruct.ts` L36–L37. Then check whether your answer matches what the code skips.

### Level 4 — Defend the decision you'd change
"Derived state now syncs to Supabase, so reconstruction is just a fallback. Is keeping `reconstructFromSessions` worth the maintenance cost of two code paths?" Reference the cost-benefit table.

### Quick check — code reference test
- What file holds the replay function?
- What's the fingerprint condition (3 parts)?
- What file and line fires `pullRestoreIfFresh()` on app open?

Then verify.

---

_Updated: 2026-05-17 — Trigger diagram rewritten for pullRestoreIfFresh() 5-table Supabase pull; why-care narrative updated; Sub-block 4 reframed (derived state IS now in Supabase); interview Q updated from Notion/pullSessions to Supabase/pullRestoreIfFresh; reconstructFromSessions repositioned as fallback not primary path._

---
Updated: 2026-05-29 — Refreshed drifted line refs: reinstall fingerprint L112–133→L107–133 (two spots), pullRestoreIfFresh L125–190→L130–196. (reconstruct.ts L13–72, gate-check createGateProgress L23, skip line L36–37, _layout L37–42 still accurate.)
