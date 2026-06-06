# 01 — Local-first canonical with cloud mirror

### Local-first architecture · canonical store · mirror replication — Industry standard

> The single biggest architectural decision in contrl. SQLite is the source of truth; Supabase is a mirror, not the source. Every other architectural property — offline behavior, sync semantics, reinstall recovery, failure modes — descends from this one choice.

**Load-bearing test (passes):** strip this out and you lose the ability to use the app offline at all. Every read becomes a network round-trip; every write becomes a remote-then-local sequence that fails when there's no signal. The "no network needed for the gym" property is the entire reason this pattern is here.

## Zoom out, then zoom in

Most web apps are "server-canonical with client cache" — the server has the truth; clients hold a (possibly stale) copy and re-fetch. contrl flips the polarity: **the device** has the truth; the cloud is the (possibly stale) mirror, and the user only ever notices the cloud when reinstalling.

```
  Zoom out — the polarity choice

  ┌─ Typical web ───────────────────┐    ┌─ contrl ─────────────────────────┐
  │  client (cache)                  │    │  device (canonical) ★            │
  │    ▲                              │    │    │                             │
  │    │ stale data                   │    │    │ writes happen here first    │
  │    ▼                              │    │    ▼                             │
  │  server (canonical) ★             │    │  cloud (mirror)                  │
  │    ▲                              │    │    ▲                             │
  │    │ requests + cache invalidation│    │    │ eventual upsert; pull only  │
  │    ▼                              │    │    │   on reinstall              │
  │  database                         │    │  database                         │
  └─────────────────────────────────┘    └─────────────────────────────────┘

  in the contrl model, the cloud has no opinion about the user's data until
  the device tells it. the cloud is a backup that the user can restore from,
  not an authority the device asks.
```

Zoom in. In contrl this means **`src/services/database.ts` IS the source of truth.** Every write goes there first. The `src/services/sync/` layer's job is to push that truth to the cloud opportunistically. The cloud's job is to hold a copy in case the device dies or gets uninstalled.

## Structure pass

**Layers** — UI / Hooks / Domain / Persistence (SQLite) / Sync / External (Supabase).

**Axis traced — state ownership** (who has the truth, and what direction does it flow?).

```
  Tracing state-ownership down the stack

  layer            owns                              flow direction
  ─────            ────                              ──────────────
  UI               nothing — pure render             reads only
  Hooks            per-render cache from SQLite       cache mirrors SQLite
  Domain           no state (pure functions)          ─
  Persistence       ★ the truth                       reads + writes
                   (SQLite is canonical)
  Sync             watermarks + the mirror direction  reads from SQLite,
                                                      writes to Supabase
  Supabase         the mirror                         eventually-consistent
                                                      backup
```

**Seams that matter (where the axis flips):**

- **Hook ↔ Persistence seam.** The hook reads SQLite via async functions; updates trigger setState. The hook is a *projection* of SQLite for the current render. If a hook's state ever disagrees with SQLite, SQLite wins on next read.
- **Persistence ↔ Sync seam.** This is where the truth-direction matters most. Writes go local-first; sync is a one-way mirror push *after* the local write commits. The fire-and-forget pattern (8 sites in `database.ts`) is the architectural shape of "sync is optional" — see the failure-mode walkthrough.
- **Sync ↔ Supabase seam.** Supabase has no privileged read path back to the device. Pulls happen only at reinstall (via `pullRestoreIfFresh`), and only when the local DB is empty. Steady-state operation = zero pulls.

## How it works

### Move 1 — the mental model

You already use this with `localStorage` for client-side preferences in web apps. The user's theme choice is canonical in localStorage; the server stores a copy when the user logs in, but the device doesn't ask the server for the theme on every page load. contrl applies the same pattern to *all* user data, not just preferences.

```
  Pattern — local-first reads and writes

  ┌─ READ ────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │   useGameState                                                         │
  │     ▲                                                                  │
  │     │ getX() — async                                                  │
  │     │                                                                  │
  │   database.ts (SQLite)                                                 │
  │                                                                        │
  │   ★ no Supabase involvement                                            │
  └────────────────────────────────────────────────────────────────────────┘

  ┌─ WRITE ───────────────────────────────────────────────────────────────┐
  │                                                                        │
  │   user action                                                          │
  │     │                                                                  │
  │     ▼                                                                  │
  │   useGameState.logSession                                              │
  │     │                                                                  │
  │     ▼                                                                  │
  │   database.ts insertX (await runAsync)                                 │
  │     │ ★ local write commits here. truth established.                  │
  │     │                                                                  │
  │     ▼                                                                  │
  │   pushChanges().catch(() => {})                                       │
  │     │ ★ fire-and-forget mirror push. failure does not roll back local.│
  │     │                                                                  │
  │     ▼                                                                  │
  │   Supabase upsert                                                      │
  │     │ eventually-consistent mirror                                     │
  └────────────────────────────────────────────────────────────────────────┘

  The fire-and-forget catch is the architectural choice that says
  "sync is optional." A web app with server-canonical would await this and
  surface the failure to the user. Local-first treats it as eventual.
```

### Move 2 — the mechanism, walked

**Step 2.1 — every write commits locally first.**

```
  // src/services/database.ts (every CRUD has this shape)
  export async function insertSession(session: WorkoutSession) {
    await db.runAsync(                       // ← await blocks until WAL fsync
      `INSERT INTO sessions ...`,
      [session.id, session.date, ...]
    );
    // local truth is now durable; pushChanges is opportunistic
    pushChanges().catch(err => console.warn('push failed', err));
  }
```

The await on `runAsync` is the durability boundary. By the time it returns, the write is in the WAL — the OS can crash, the app can be killed, the battery can die, the row is still there. **The user's data is safe before the function returns.**

The `pushChanges().catch(...)` is intentionally fire-and-forget at the architectural level (though see file [04](./04-watermark-based-incremental-sync.md) and `.aipe/drills/failure-handling-sync-partial-failure.md` for the failure-mode bug in `pushChanges` itself — that's a sync-layer issue, not a local-first issue).

**Step 2.2 — reads never round-trip.**

```
  // src/services/database.ts (every read has this shape)
  export async function getSessions(): Promise<WorkoutSession[]> {
    const rows = await db.getAllAsync(
      `SELECT ... FROM sessions ORDER BY date DESC`
    );
    return rows.map(rowToSession);
  }
```

No Supabase call. No network. The read returns whatever the local SQLite has. If the cloud has different data, contrl wouldn't know — and **at single-user-single-device scale, this is correct.** The device wrote it; the device knows.

**Step 2.3 — the one exception: pull-restore on reinstall.**

```
  // src/services/sync/supabase-sync.ts
  export async function pullRestoreIfFresh() {
    // only runs when local DB is empty (the reinstall case)
    if (!isFreshInstall()) return;

    restoreInProgress = true;
    for (const table of TABLES) {
      const { data } = await supabase.from(table).select('*');
      for (const r of data) {
        await db.runAsync(`INSERT INTO ${table} ...`, [...]);
      }
    }
    restoreInProgress = false;
  }
```

This is the ONLY place the cloud-to-device direction exists in normal operation. It's gated by the fresh-install check; after the local DB has any data, this never runs again. See file [03](./03-reconstruct-on-reinstall.md) for the full restore protocol.

### Move 2 variant — the load-bearing skeleton of "local-first canonical"

```
  Skeleton — what makes it canonical (not just cached)

  1. WRITES COMMIT LOCALLY BEFORE THE FUNCTION RETURNS
       no async-to-server-then-mark-clean dance. the local store
       is the truth at the moment of the write.

  2. READS NEVER FETCH FROM REMOTE IN STEADY STATE
       a read that needs to ask the cloud is a read that needs
       the network. local-first means reads work offline always.

  3. SYNC IS OPPORTUNISTIC, ONE-WAY, OPTIONAL
       device → cloud, when convenient. cloud → device, only on
       the explicit restore path.

  4. NO CACHE-COHERENCE PROBLEM EXISTS WITHIN A DEVICE
       because there's no cache — the local store is the truth.
       (cross-device coherence is a different problem; see file
       04 + study-distributed-systems.)
```

Drop #1 and you have a typical "cached client" — writes go server-first, local copy follows. Drop #2 and you have a hybrid "local cache with backfill" — works online, broken offline. Drop #3 and you have a typical sync-everywhere replication scheme — coherence becomes the whole problem.

### Move 3 — the principle

> Choosing where canonical state lives is the most important architectural decision in a system. Web apps default to server-canonical because the network was historically reliable enough and clients were untrusted; mobile apps with offline requirements default to client-canonical because the network can't be assumed and the device is trusted-enough for its own data.

The discipline is to **make the polarity decision explicit and apply it uniformly**. contrl is consistently local-first: every write, every read, every cache, every failure mode follows from "local is canonical." Mixing polarities (some state server-canonical, some client-canonical) is what makes hybrid systems hard.

## Primary diagram

```
  Local-first canonical with cloud mirror — the whole picture

  ╔════════════════════════════════════════════════════════════════════════╗
  ║                            ON DEVICE                                    ║
  ║                                                                          ║
  ║  ┌─ user action ──────────────────────────────────────────────────┐    ║
  ║  │  log a workout · view sessions · open the app · log a set       │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ React layer ──────────▼─────────────────────────────────────────┐    ║
  ║  │  useGameState (per-render cache; not the truth)                  │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │  await getX / await insertX                    ║
  ║  ┌─ Persistence ──────────▼─────────────────────────────────────────┐    ║
  ║  │                                                                   │    ║
  ║  │   ★ SQLite (WAL) — the canonical store ★                          │    ║
  ║  │   src/services/database.ts                                        │    ║
  ║  │   reads return from here; writes commit here (WAL durable).      │    ║
  ║  │                                                                   │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │  pushChanges().catch(() => {})                ║
  ║                            │  ★ fire-and-forget — sync is opportunistic   ║
  ╚════════════════════════════│════════════════════════════════════════════╝
                                │
                                ▼
  ╔════════════════════════════════════════════════════════════════════════╗
  ║                            CLOUD                                        ║
  ║                                                                          ║
  ║  ┌─ Sync (one-way mirror) ─────────────────────────────────────────┐    ║
  ║  │  src/services/sync/supabase-sync.ts pushChanges()                │    ║
  ║  │  per table: SELECT dirty since watermark; UPSERT to Supabase     │    ║
  ║  │  on success: advance per-table watermark                         │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │                                              ║
  ║  ┌─ Supabase Postgres ────▼─────────────────────────────────────────┐    ║
  ║  │  mirror tables: user_profile, exercises, sessions, gate_progress,│    ║
  ║  │   week_progress, drafts (not synced), sync_deletions             │    ║
  ║  │  truth for: NOTHING during normal operation.                     │    ║
  ║  │  used for: reinstall recovery only (see pullRestoreIfFresh).     │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │ pullRestoreIfFresh — runs ONCE on            ║
  ║                            │ first launch with empty local DB             ║
  ╚════════════════════════════│════════════════════════════════════════════╝
                                │
                                ▼  on reinstall: local ← cloud (one time)
                          back to ON DEVICE → reconstruct (file 03)
```

## Implementation in codebase

### Use cases

This pattern is reached for in every operation:

- **Logging a workout set** — `useExerciseForm.updateValue(...)` → eventual `useGameState.logSession(...)` → SQLite writes → fire-and-forget push. The user sees the set logged before the network finishes. They can lose signal mid-set and the rep counter keeps working; they can close the app and the data is durable.
- **Viewing past sessions** — `useGameState.sessions` is loaded from SQLite on hook init. No network call. Works on airplane.
- **Opening the app fresh on a known device** — SQLite has data → no restore → no network until next write.
- **Opening the app fresh on a NEW device (reinstall)** — SQLite is empty → trigger `pullRestoreIfFresh` → one-time bulk read from Supabase → reconstruct derived state. After this single round-trip, the device is local-first forever.

### Code, side-by-side

```
  src/services/database.ts  (every CRUD)

  export async function insertSession(session: WorkoutSession) {
    await db.runAsync(                                ← ★ blocking until
      `INSERT INTO sessions                              local WAL durable.
       (id, date, exercises_json, notes,                 this line is the
        user_id, created_at, updated_at)                truth boundary.
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.date,
       JSON.stringify(session.exercises),
       session.notes, USER_ID,
       session.createdAt, session.updatedAt]
    );
    pushChanges().catch(err =>                        ← ★ opportunistic mirror.
      console.warn('push failed', err)                   if this throws, the
    );                                                   local truth is still
  }                                                       intact.
                                                          (see file 04 for the
                                                          sync-layer failure-
                                                          mode bug; this site
                                                          is correctly local-
                                                          first.)

  src/services/sync/supabase-sync.ts (the mirror direction)

  export async function pushChanges() {
    if (restoreInProgress) return;                    ← ★ skip during restore.
    for (const table of TABLES) {                        the canonical → mirror
      const dirty = await getDirty(                      direction; never reverses.
        table, await getWatermark(table)
      );
      // ... upsert to Supabase ...
    }
  }
```

**Where to verify:** open `src/services/database.ts` and grep `pushChanges().catch` — you should find 8 call sites, one per write CRUD per table. The pattern is uniform; that uniformity *is* the architectural commitment to local-first.

## Elaborate

The deepest argument for local-first is that **for the user's own data, on the user's own device, the device is the most trusted writer in the system**. The cloud is a backup; the cloud is multi-tenant; the cloud has access controls (and contrl doesn't have RLS yet, so today the cloud has *no* meaningful access controls). The device is single-tenant and physically held by the user. Treating it as canonical respects the trust topology.

The standard objection is "what about syncing across devices?" — the answer is that local-first **doesn't** make multi-device sync easier; it makes it harder than server-canonical, because both devices have their own truth and you have to merge. The reason contrl picks local-first anyway is that the *primary* use case (one user, one phone, often offline at the gym) is dominant; multi-device is a future-Phase-4 problem. Picking the polarity to optimize for the dominant case is correct; paying the multi-device cost later is acceptable.

The other thing local-first buys you is **failure isolation**. Server outages don't break your app; network blips don't lose your set. The user's experience of "the app just works" comes from this — and once you have it, you can't easily give it up. The cost is that the cloud sometimes has stale data, which is fine for a fitness journal and would not be fine for a banking app.

The classic local-first reference is Ink & Switch's "Local-first software" essay (Kleppmann et al.); the pattern predates that name (Lotus Notes, Git, mobile email clients). The current ecosystem (Replicache, Yjs, Automerge, RxDB) builds on the same foundation contrl uses: a canonical local store + an opportunistic sync layer. contrl's implementation is the simplest version of this — no CRDTs, no operational transforms, no merge logic — because single-user single-device makes the merge problem disappear.

## Interview defense

**Q: "Walk me through the architecture of this app."**

```
  60-second answer

  ┌─ The polarity ─────────────────────────────────────────────────┐
  │  SQLite (WAL) on the device is the source of truth. Supabase  │
  │  is a one-way mirror, not the source. Every write commits     │
  │  locally first; sync to the cloud is fire-and-forget. Reads   │
  │  never round-trip in steady state — they return from local.   │
  │  This is local-first canonical with cloud mirror.              │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ What this buys ───────────────────────────────────────────────┐
  │  Works fully offline. Network failures degrade the mirror, not │
  │  the user's session. Pose detection runs without network at    │
  │  all. Reinstall recovery exists as the single restore path —   │
  │  the one time we pull from cloud to device.                    │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ What this costs ──────────────────────────────────────────────┐
  │  No real-time multi-device sync. Conflict resolution is "not  │
  │  yet exercised" because Phase 2A is single-user-single-device. │
  │  When multi-device matters, the watermark scheme has to grow  │
  │  per-device awareness — meaningful refactor.                   │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: *"SQLite IS the truth; cloud is opportunistic mirror."*

**Q: "Why not just server-canonical with offline caching?"**

Because the dominant use case is the gym, where signal is unreliable. Server-canonical-with-cache means every write needs eventual consistency reconciliation back to the local cache, and every read fights cache invalidation. Local-first eliminates both. The tradeoff is that the cloud is sometimes stale — which is fine for a fitness journal. The tradeoff would be wrong for, say, a banking app where the cloud has to be authoritative.

**Q: "What happens when sync fails?"**

Locally, nothing — the user's data is in SQLite, the app keeps working. In the cloud, the data is missing until the next successful push. This is by design at the architectural level. (There IS a real bug at the implementation level — `pushChanges` early-returns on the first table that fails, silently dropping the rest. That's in the failure-handling drill.)

**Q: "What if the device gets uninstalled?"**

Reinstall on the same Supabase project triggers `pullRestoreIfFresh`. Sessions, user_profile, exercises, gate_progress, week_progress come down from cloud. The reconstruct step (file 03) folds the session history to rebuild any derived state. After this one round-trip, the device is local-first again. The cloud's purpose, basically, is to make this restore possible.

## Validate

1. **Reconstruct.** Sketch the local-first polarity from memory: writes commit where, reads return from where, sync runs in which direction, pull runs when.
2. **Explain.** Why is `pushChanges().catch(() => {})` architecturally correct at the *call-site* level even though `pushChanges` itself has a bug that drops tables? (Hint: the catch is about local-first; the bug is about the sync function's loop.)
3. **Apply.** A teammate proposes adding a "favorites" feature where each user pins 5 exercises. Where does that state live (which SQLite table; do we add one)? How does it sync? What changes for reinstall recovery? (Answer: new column on `exercises` or a new `favorites` table; mirror through `pushChanges` and the mapper; on reinstall, comes down via `pullRestoreIfFresh`. The local-first polarity tells you the answer.)
4. **Defend.** Argue that server-canonical would be simpler at single-user-single-device scale. Then rebut: simpler in code, worse offline. The simplicity tax of server-canonical falls on the user (no signal = no app), which is the wrong tax.

## See also

- [00-overview.md](./00-overview.md) — the architecture map this pattern dominates
- [02-on-device-ml-pipeline.md](./02-on-device-ml-pipeline.md) — pose detection's "device is canonical" choice extended to inference
- [03-reconstruct-on-reinstall.md](./03-reconstruct-on-reinstall.md) — the one read direction this pattern allows
- [04-watermark-based-incremental-sync.md](./04-watermark-based-incremental-sync.md) — the mechanism that makes the mirror push efficient
- [audit.md § 5 storage-choice-and-durability-boundaries](./audit.md#5-storage-choice-and-durability-boundaries) — durability guarantees per store
- [audit.md § 6 failure-handling-and-reliability](./audit.md#6-failure-handling-and-reliability) — the failure-mode the canonical-with-mirror choice makes safe
- `.aipe/study-distributed-systems/` — the consistency-model framing (eventual; at-least-once; not yet exercised: read-your-writes across devices)
- `.aipe/drills/failure-handling-sync-partial-failure.md` — the next hands-on drill for the sync-layer bug
