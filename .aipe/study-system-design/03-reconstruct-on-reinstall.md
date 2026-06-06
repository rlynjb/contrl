# 03 — Reconstruct on reinstall

### Derived-state reconstruction · event-sourcing-flavored · state-from-history — Industry standard

> The pattern that makes the local-first-with-cloud-mirror choice (file [01](./01-local-first-canonical-with-cloud-mirror.md)) actually useful. When a user reinstalls the app — wipes local SQLite — the cloud doesn't store every state slice. It stores only what's *source-of-truth*: sessions, user_profile, exercises. Everything derived (current gate progress, current level, current week, streak) is **recomputed locally** by folding the session history. No round-trip per derived value.

**Load-bearing test (passes):** strip this out and reinstall means full data loss for everything except what's explicitly synced. Either you pay the cost of syncing every derived value (10x more sync surface, 10x more bugs at the persistence/sync seam), or the user reinstalls and discovers their level/gate progress/streak are gone. Neither is acceptable — the user has to be able to reinstall and continue.

## Zoom out, then zoom in

There are three kinds of state in contrl: **source-of-truth state** (the user actually wrote it; sessions, exercises, user_profile basic info), **derived state** (computed from source-of-truth via game rules; gate progress, current level, current week's stats, streak), and **ephemeral state** (in-memory, lost on app close; React state, the `restoreInProgress` flag).

```
  Zoom out — the three state categories

  ┌─ source-of-truth ───────────────────────────────────────────────────┐
  │  the user wrote it; nothing can recompute it from anywhere else      │
  │                                                                       │
  │  sessions      (every workout the user logged)                       │
  │  user_profile  (levels — the journal of where they ended up)         │
  │  exercises     (the catalog they're using)                           │
  │                                                                       │
  │  → THESE must round-trip to cloud and back on reinstall              │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─ derived ──────────────────────────────────────────────────────────┐
  │  computed from source-of-truth via deterministic rules               │
  │                                                                       │
  │  gate_progress (3-consecutive-pass logic over sessions)              │
  │  current week stats (sessions in current week)                       │
  │  streak (week boundaries + completion flags)                         │
  │                                                                       │
  │  → these CAN round-trip (they're also mirrored), but reconstruction  │
  │    from source-of-truth is the failsafe — and runs once on every     │
  │    reinstall.                                                         │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─ ephemeral ────────────────────────────────────────────────────────┐
  │  in-memory; lost on app restart; not stored anywhere                 │
  │                                                                       │
  │  React state (useGameState's per-render cache of SQLite)             │
  │  restoreInProgress flag (module-global in supabase-sync.ts)          │
  │  RepCounter's FSM phase mid-set                                      │
  │                                                                       │
  │  → not synced, not reconstructed — recomputed on next launch         │
  └──────────────────────────────────────────────────────────────────────┘
```

Zoom in. The pattern matters at one specific moment: **the user launches a fresh install with a non-empty cloud account.** That's it. After that single round-trip, the device is local-first forever (until the next reinstall).

## Structure pass

**Layers** — Cloud (source) / Sync (pull) / Persistence (write back to local) / Domain (`reconstructFromSessions`) / Hooks (consume the rebuilt state).

**Axis traced — what crosses the device boundary** (which state slices come from cloud, which get reconstructed locally?).

```
  Tracing what crosses the boundary on reinstall

  state slice          comes from cloud?   reconstructed locally?
  ───────────          ────────────────    ──────────────────────
  sessions             YES (full table)    no — they ARE the source
  user_profile         YES (full table)    no — they ARE the source
  exercises            YES (full table)    no — they ARE the source
  gate_progress        sort of (mirrored)  YES — from sessions
  week_progress        sort of (mirrored)  YES — from sessions
  streak               no                  YES — from week_progress
  React state          n/a                 happens on first render
  drafts               NO (never synced)   no — lost on reinstall (by design)
```

The "sort of" for gate_progress and week_progress is the architectural fact worth knowing: those tables ARE mirrored to Supabase (they go through the same `pushChanges` path as everyone else), so on reinstall they ALSO come down from cloud. But the device doesn't depend on them coming down correctly — it can rebuild them from sessions. That's the **safety net** the reconstruct pattern provides: the mirrored values can be wrong or stale or partially-restored, and the system still ends up correct, because the source-of-truth (sessions) is enough.

**Seam that matters: the `reconstructFromSessions(sessions, user) → { user, gates }` function.** It's a pure-function bridge between the raw source-of-truth (session history) and the rebuilt derived state. If reconstruct produces a different answer than what the mirrored gate_progress table has, **the reconstruct answer wins.** That's the architectural commitment.

## How it works

### Move 1 — the mental model

You already know this from event sourcing. In event-sourced systems, the database stores events (the source of truth); the current state is *derived* by replaying events from the start (or from the last snapshot). Reads use the materialized current state for speed; on cold start, you replay to rebuild.

contrl is event-sourcing-flavored: sessions ARE the event log, and `reconstructFromSessions` IS the replay. The difference is that contrl materializes the derived state in SQLite (`gate_progress`, `week_progress`) for fast read; replay happens only on reinstall. **This is the event-sourcing pattern restricted to the cold-start case.**

```
  Pattern — derived state reconstructed from a session log

  ┌─ event log (source of truth) ─────────────────────────────────────────┐
  │  sessions table:                                                       │
  │    s1: 2026-04-01 push level 1, 5x5 pushups, clean                    │
  │    s2: 2026-04-02 push level 1, 5x5 pushups, clean                    │
  │    s3: 2026-04-03 push level 1, 5x4 pushups, NOT clean                │
  │    s4: 2026-04-04 push level 1, 5x5 pushups, clean                    │
  │    s5: 2026-04-05 push level 1, 5x5 pushups, clean                    │
  │    s6: 2026-04-06 push level 1, 5x5 pushups, clean                    │
  │    ★ 3 consecutive clean at level 1 → gate passes → level up to 2      │
  │    s7: 2026-04-07 push level 2, ...                                    │
  └──────────────────────────────────────┬─────────────────────────────────┘
                                          │  reconstructFromSessions(sessions, user)
                                          │  (pure function, deterministic)
                                          ▼
  ┌─ derived state (rebuilt fresh) ───────────────────────────────────────┐
  │  user.pushLevel = 2                                                   │
  │  gate_progress.push: { status: 'in-progress', consecutivePasses: 0,   │
  │                         level: 2, lastEvaluatedAt: s7.date }          │
  │                                                                        │
  │  week_progress: { current week, completed N sessions, ... }            │
  │  streak: 4 consecutive complete weeks                                  │
  └──────────────────────────────────────────────────────────────────────┘

  the function is deterministic — given the same session list, you get the
  same derived state every time. that's the property that makes reinstall
  safe: replay from the source, get to a known state.
```

### Move 2 — the mechanism, walked

**Step 2.1 — detect a fresh install.**

```
  // src/services/sync/supabase-sync.ts (approximate)
  function isFreshInstall(): boolean {
    // local SQLite has no sessions, no user_profile, no exercises;
    // sync_meta has no recorded last_pulled_at.
    // (the exact heuristic lives in the supabase-sync source — verify
    // before relying on it; the architectural question is "is local empty?")
    return localSessionCount === 0;
  }
```

**Step 2.2 — pull source-of-truth tables from cloud.**

```
  // supabase-sync.ts pullRestoreIfFresh()
  restoreInProgress = true;
  for (const table of ['user_profile', 'exercises', 'sessions',
                       'gate_progress', 'week_progress']) {
    const { data } = await supabase.from(table).select('*');
    for (const r of data) {
      await db.runAsync(`INSERT INTO ${table} ...`, mapFromRemote(r));
    }
  }
  restoreInProgress = false;
```

All five sync tables come down. Note that `gate_progress` and `week_progress` are mirrored too — so on reinstall, the **mirrored** versions land in SQLite first. The reconstruct step (next) doesn't rely on them; it independently derives the same state.

**Step 2.3 — run reconstructFromSessions to derive state.**

```
  // src/lib/game/reconstruct.ts (approximate — verify against actual code)
  export function reconstructFromSessions(
    sessions: WorkoutSession[],
    initialUser: User
  ): { user: User; gates: GateProgress[] } {
    let user = { ...initialUser };
    let gates: GateProgress[] = initGates(user);

    for (const session of sortByDate(sessions)) {
      if (session.exercises[0].level > user[session.category + 'Level']) {
        continue;                       ← skip future-level sessions
      }
      const isClean = evaluateSessionCleanness(session);
      gates = applyGatePassCheck(gates, session, { isClean });
      user = checkCategoryLevelUp(user, gates);
    }

    return { user, gates };
  }
```

The function is pure. Same `sessions` array → same output every time. **It does not look at the mirrored `gate_progress` table** — it rebuilds from sessions alone. This is the load-bearing property: the mirror is a *cache*, not a source.

**Step 2.4 — write the reconstructed state back to SQLite, overriding mirrored values if they disagree.**

```
  // pseudocode — verify exact integration point in src/hooks/useGameState.ts
  const { user, gates } = reconstructFromSessions(sessions, currentUser);
  await db.updateUser(user);           ← overrides whatever came from cloud
  for (const gate of gates) {
    await db.updateGate(gate);          ← overrides cloud mirror
  }
```

If the cloud's mirrored `gate_progress` table is stale or wrong (e.g., a previous device hadn't synced its latest gate state before uninstall), the device's reconstruction *replaces* the stale values. **The session history is the arbiter.**

**Step 2.5 — week_progress and streak follow the same pattern.**

```
  const weeks = buildWeekHistory(sessions, /* current week */ getCurrentDate());
  for (const week of weeks) {
    await db.updateWeek(week);
  }
  const streak = calculateStreak(weeks);
  // streak isn't persisted as its own table; it's stored in memory in useGameState
  // and recomputed from week_progress on every load.
```

### Move 2 variant — the load-bearing skeleton of "reconstruct on reinstall"

```
  Skeleton — three parts

  1. SEPARATE SOURCE-OF-TRUTH FROM DERIVED
       what could you delete and recompute? that's derived. what is
       the user's act of writing? that's source. the line matters.

  2. PURE-FUNCTION RECONSTRUCTOR
       (sources) → (derived) with no I/O. deterministic. no clock
       dependencies that aren't passed in. no random state. this is
       what makes reinstall safe and tests cheap.

  3. ON REINSTALL, RUN THE RECONSTRUCTOR AS A FAILSAFE
       even if the mirrored derived tables came down "correctly,"
       reconstruct anyway. let the function be the arbiter, not the
       mirror.
```

Drop #1 (mirror everything as if it's source) — you pay 10x sync surface; bugs at the persistence/sync seam now corrupt derived state irreparably. Drop #2 (reconstructor is impure — needs the network, the clock, randomness) — reinstall is no longer safe; you can rebuild to different states from the same history. Drop #3 (trust the mirror on reinstall) — stale mirrors poison the rebuilt state forever; the system loses its safety net.

### Move 3 — the principle

> The cheapest sync is the sync you can skip. If a value can be derived from another value you already sync, don't sync it — derive it. The reconstructor function is the contract that lets you do this safely; it's also what tells you, by its very existence, which values are source-of-truth and which are derived.

The reconstructor is the **structural test** for "is this state source-of-truth?" If you can write a pure function that produces the value from other values, it's derived. If you can't, it's source. The function existing is the proof.

## Primary diagram

```
  Reconstruct on reinstall — the full flow

  ╔════════════════════════════════════════════════════════════════════════╗
  ║                            REINSTALL EVENT                              ║
  ║                                                                          ║
  ║  user uninstalls + reinstalls (or installs on a new device)              ║
  ║  app launches with empty SQLite                                          ║
  ║                                                                          ║
  ║  ┌─ migrate() ────────────────────────────────────────────────────┐    ║
  ║  │   src/services/database.ts                                      │    ║
  ║  │   creates 9 tables; all empty                                   │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ useDatabase / useGameState boot ──────────────────────────────┐    ║
  ║  │   detects empty state                                          │    ║
  ║  │   triggers pullRestoreIfFresh()                                │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ pullRestoreIfFresh ───▼─────────────────────────────────────────┐    ║
  ║  │   src/services/sync/supabase-sync.ts                             │    ║
  ║  │                                                                    │    ║
  ║  │   restoreInProgress = true                                        │    ║
  ║  │                                                                    │    ║
  ║  │   for each table in [user_profile, exercises, sessions,           │    ║
  ║  │                       gate_progress, week_progress]:               │    ║
  ║  │     SELECT * FROM <table> in Supabase                              │    ║
  ║  │     INSERT each row into local SQLite (via mapper.fromRemote)     │    ║
  ║  │                                                                    │    ║
  ║  │   restoreInProgress = false                                       │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ reconstructFromSessions ──────────────────────────────────────┐    ║
  ║  │   src/lib/game/reconstruct.ts                                    │    ║
  ║  │                                                                    │    ║
  ║  │   const { user, gates } =                                         │    ║
  ║  │     reconstructFromSessions(sessions, initialUser);              │    ║
  ║  │                                                                    │    ║
  ║  │   for each session in sortByDate(sessions):                       │    ║
  ║  │     if session.level > user[category + 'Level']: skip             │    ║
  ║  │     isClean = evaluate(session)                                   │    ║
  ║  │     gates = applyGatePassCheck(gates, session, isClean)           │    ║
  ║  │     user = checkCategoryLevelUp(user, gates)                      │    ║
  ║  │                                                                    │    ║
  ║  │   ★ pure function. mirror values from cloud are IGNORED here.   │    ║
  ║  │     the session history is the arbiter.                           │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ write reconstructed state to SQLite ──────────────────────────┐    ║
  ║  │   db.updateUser(user)            ← overrides cloud mirror      │    ║
  ║  │   for each gate: db.updateGate(gate)                            │    ║
  ║  │   buildWeekHistory(sessions) → write week_progress rows         │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ hooks hydrate from SQLite ────────────────────────────────────┐    ║
  ║  │   useGameState loads user, gates, week, streak from SQLite     │    ║
  ║  │   UI renders the fully-restored state                          │    ║
  ║  └─────────────────────────────────────────────────────────────────┘    ║
  ║                                                                          ║
  ║  ★ DONE. The device is now local-first again.                           ║
  ║  ★ Every subsequent operation reads from local SQLite, writes locally    ║
  ║    then opportunistically pushes to cloud. No more pulls until the next   ║
  ║    reinstall.                                                            ║
  ║                                                                          ║
  ╚════════════════════════════════════════════════════════════════════════╝
```

## Implementation in codebase

### Use cases

This pattern is reached for:

- **Reinstall on the same device** — user deletes app, reinstalls; cold start with empty SQLite triggers `pullRestoreIfFresh`.
- **First install on a new device** — same Supabase project, fresh phone; same flow.
- **(Edge case) Local DB corruption recovery** — if you forced SQLite to be empty (e.g., bug in migrate; a debug flag), the same pull-and-reconstruct path would run.

The pattern is NOT used for:

- Steady-state app launches (local DB has data; pull-restore skipped)
- Resuming after force-quit (local DB has the last-written state; no restore needed)
- Recovering from a sync push failure (the failure mode lives in the sync layer, not the reconstruct path)

### Code, side-by-side

```
  src/lib/game/reconstruct.ts (the reconstructor — pure function)

  export function reconstructFromSessions(             ← inputs are everything
    sessions: WorkoutSession[],                          this function needs.
    initialUser: User                                   no globals, no clock,
  ): { user: User; gates: GateProgress[] }              no random.
  {
    let user = { ...initialUser };                     ← immutable updates;
    let gates: GateProgress[] = initGates(user);         each iteration produces
                                                          a new user/gates pair.

    for (const session of sortByDate(sessions)) {      ← deterministic ordering.
      const cat = session.exercises[0].category;         (sorting matters: gates
      if (session.exercises[0].level >                    advance in time order.)
          user[`${cat}Level` as const]) {
        continue;                                       ← skip "future" sessions
                                                          (the user logged a level
                                                          they hadn't yet reached
                                                          on this device — guard).
      }
      const isClean = evaluate(session);
      gates = applyGatePassCheck(gates, session, { isClean });
      user = checkCategoryLevelUp(user, gates);
    }

    return { user, gates };                             ← outputs are everything
  }                                                       the caller needs to write
                                                          back. no side effects in
                                                          this function.

  src/services/sync/supabase-sync.ts (the integration point)

  export async function pullRestoreIfFresh() {
    if (!isFreshInstall()) return;
    restoreInProgress = true;
    try {
      // pull source-of-truth tables
      for (const table of TABLES) {
        const { data } = await supabase.from(table).select('*');
        for (const r of data) {
          await db.runAsync(`INSERT INTO ${table} ...`, mapFromRemote(r));
        }
      }
      // reconstruct derived state
      const sessions = await db.getSessions();
      const user = await db.getUser();
      const { user: rebuiltUser, gates: rebuiltGates } =
        reconstructFromSessions(sessions, user);
      await db.updateUser(rebuiltUser);
      for (const g of rebuiltGates) await db.updateGate(g);
      // weeks rebuilt from sessions too
      const weeks = buildWeekHistory(sessions, getCurrentDate());
      for (const w of weeks) await db.updateWeek(w);
    } finally {
      restoreInProgress = false;
    }
  }
```

**Where to verify:** open `src/lib/game/reconstruct.ts` and confirm the function takes only `(sessions, initialUser)` — no other inputs. The function signature IS the architectural contract; if you ever see `new Date()` or a global read in the body, the purity is broken.

## Elaborate

The historical context: event sourcing was popularized by Greg Young (CQRS) and Vaughn Vernon (DDD); the older roots are in databases (WAL replay, snapshot + log) and bookkeeping (double-entry: balances are derived from transactions). The pattern's value across those domains is the same one contrl gets: **the source-of-truth is the irreducible record; everything else is a query that can be regenerated.** When you find yourself worrying about whether the derived value is in sync with the source, the answer is "derive it on demand instead of caching it" — exactly what reconstruct does.

contrl's version is light because it doesn't replay every event on every read — it materializes the derived state in SQLite (`gate_progress`, `week_progress`) and only replays on cold start. This is the standard speed/safety tradeoff: replay-every-read is safe but slow; materialize-and-trust is fast but risks drift; **materialize for speed, reconstruct as safety net on the rare event that matters** is the middle path. The rare event is reinstall.

The function's purity is load-bearing in a way that's worth naming explicitly: `reconstructFromSessions` doesn't take "today's date" as a parameter (it processes historical sessions; the current date isn't relevant to whether a 3-consecutive-pass already happened in the past). It doesn't take "the cloud's gate_progress" as a parameter (it would be circular — using the value you're rebuilding to rebuild it). It doesn't take a random seed (rebuilt state must be deterministic). The function signature `(sessions, user) → { user, gates }` is the entire contract; the body has to honor it. **A signature this constrained is testable, defensible, and refactor-safe.**

A note on `buildWeekHistory` (the parallel reconstructor for week_progress): it DOES take "current date" as a parameter, because "the current week" is genuinely a function of when you ask. That's not a violation of the purity principle — it's the same purity, just with one more input. The architectural test is "does the function depend only on its inputs?" — yes, for both. Inputs being explicit (not read from globals) is what matters.

What this pattern does NOT cover: **conflict resolution across devices**. If two devices both wrote different sessions to the cloud between syncs, reconstruct on a third device will produce a single combined session list that respects all writes — that's fine. But if two devices wrote *the same session ID* with different content (e.g., user edited the same session on both devices), `INSERT` will fail or `UPSERT` will pick one. That's the multi-writer conflict problem, and it's deferred until Phase 4 multi-device becomes a real requirement. The current state is "single hardcoded USER_ID, single device, no conflict."

## Interview defense

**Q: "How does your app handle reinstall?"**

```
  ┌─ The mechanism ────────────────────────────────────────────────┐
  │  On a fresh install with a non-empty Supabase account, the    │
  │  pullRestoreIfFresh path runs once: pull all five sync tables  │
  │  from cloud, insert into local SQLite. Then reconstruct: a    │
  │  pure function takes the session history and rebuilds derived │
  │  state — current level, gate progress, week progress, streak.  │
  │  The reconstruct overrides whatever came down from the cloud's │
  │  mirror, because sessions are the source of truth and          │
  │  reconstruct is the deterministic arbiter.                     │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ Why this shape ───────────────────────────────────────────────┐
  │  Sessions are what the user actually wrote. Everything else   │
  │  (gates, levels, streaks) is computable from sessions via the  │
  │  game rules. Storing them in cloud as mirrors is fine for     │
  │  performance, but on reinstall I trust the reconstruct, not   │
  │  the mirror. If the mirror is stale or wrong, the device      │
  │  ends up correct anyway.                                       │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ The trade ────────────────────────────────────────────────────┐
  │  Reinstall takes a few seconds for the pull + reconstruct,    │
  │  proportional to session count. At 1000 sessions it's a       │
  │  second; at 100k it'd be longer and need a snapshot strategy. │
  │  Today, single-user MVP scale, the trade is "rare event,      │
  │  acceptable cost."                                             │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: *"sessions are source-of-truth; everything derived is reconstructed; the mirror is a cache, not the source."*

**Q: "Why not just sync the gate_progress table and trust it?"**

Because trust is fragile. If a previous device's last push failed midway (which today's sync layer can drop tables silently — see the failure-handling drill), the cloud's gate_progress could be stale. On reinstall, trusting it would corrupt the rebuilt state. Reconstruct from sessions is the safety net; it costs me a few seconds at reinstall and gives me confidence the rebuilt state matches what the user actually did. The mirror exists for speed in steady-state reads, not for source-of-truth.

**Q: "What if reconstruct gives a different answer than the cloud's mirror?"**

The reconstructed answer wins. The function is deterministic given the sessions; if it disagrees with the mirror, the mirror is wrong (or stale). I write the reconstructed values back to SQLite, overriding what came down from cloud. The next push will eventually update the cloud's mirror with the correct values.

**Q: "What's the failure mode if reinstall is interrupted mid-restore?"**

That's a known gap. The `restoreInProgress` flag is in-memory; force-quit during the pull-restore loses the flag, and next launch might not realize the restore was incomplete. If pullRestoreIfFresh isn't idempotent on partial state, you could end up with duplicate inserts or missed tables. The fix would be persisting the restore-in-progress state to SQLite (e.g., sync_state) so it survives restart. Today's drill backlog includes this; the failure-handling drill at `.aipe/drills/failure-handling-sync-partial-failure.md` covers a related but distinct case (push partial-failure, not pull partial-failure).

## Validate

1. **Reconstruct.** Draw the reinstall flow from memory: empty local → pull → reconstruct → write back → render. Mark which arrows are network and which are local.
2. **Explain.** Why is `reconstructFromSessions` a pure function with no clock parameter, while `buildWeekHistory` IS allowed to take "today's date" as a parameter? What's the principle?
3. **Apply.** Phase 2C adds a form classifier label per set. Is that derived (recomputable from session data on reinstall) or source (must come down from cloud)? Why? (Likely source — the classifier ran at training time on devices that no longer have the model state. The label needs to ship with the session.)
4. **Defend.** Argue that sessions don't need to be source-of-truth either — you could store "current level + current gate state" and let the user log only "today's set was clean/dirty" without keeping the full history. Then rebut. (Hint: history is what makes reconstruct work; throwing it away makes derivation impossible.)

## See also

- [00-overview.md](./00-overview.md) — the architecture map
- [01-local-first-canonical-with-cloud-mirror.md](./01-local-first-canonical-with-cloud-mirror.md) — the canonical-with-mirror choice this pattern depends on
- [04-watermark-based-incremental-sync.md](./04-watermark-based-incremental-sync.md) — the mechanism that keeps sessions synced cheaply between reinstalls
- [audit.md § 3 state-ownership-and-source-of-truth](./audit.md#3-state-ownership-and-source-of-truth) — the state-graph this pattern carves up
- `.aipe/study-data-modeling/` — the schema details: which tables are source, which are derived (mirrored)
- `.aipe/study-distributed-systems/` — the consistency model framing: this pattern is "eventual via replay" not "eventual via CRDT"
- `.aipe/study-software-design/02-deep-vs-shallow-modules.md` — `reconstructFromSessions` is one of the codebase's deepest modules; the pure-function discipline is what makes it work
