# Supabase mirror sync

**Industry name(s):** Mirror replication, write-mostly cloud sync, restore-on-fresh-install

**Type:** Industry standard · Language-agnostic

> A write-mostly mirror that keeps Supabase as a recovery surface for SQLite — local writes flow up continuously, remote data flows down exactly once on a fresh install — making data durable across reinstalls without changing the local-first architecture.

**See also:** → `01-local-first-architecture` · → `02-sqlite-as-source-of-truth` · → `05-derived-state` · → `06-reconstruction-on-reinstall`

---

## Why care

**Move 1.** You have a React component that renders a list from a `useState` array. You add an item, the array grows, and React re-renders. Now close the browser tab and reopen it — the array is gone. The state lived in memory; nothing wrote it anywhere permanent. You already know the fix: persist to `localStorage` or a server. But persisting to a server creates a new question: which direction do writes flow, and when does the server read back?

**Move 2.** Right — that "remote state holds my data even when local state is gone" is what a mirror sync delivers. Not a primary store. Not a backup in the traditional sense. A mirror — the local writes flow up, and on a fresh install the remote writes flow down once. After that initial restore the remote is effectively read-only from the app's perspective. The local store stays authoritative for every read and write during normal use.

**Why you need to answer that question at all:** Without a remote mirror, every SQLite row that exists only on the device is lost the moment the user reinstalls or gets a new phone. In contrl that means months of workout session history, gate progress that controls which level the user is allowed to attempt, and user-profile levels — all gone silently. The user opens the app, sees a blank slate, and assumes the app deleted their data. With the mirror sync in place, the first app open after a fresh install pulls everything back from Supabase before the user sees the home screen. The `.then(pushChanges)` chain in `app/_layout.tsx` (line 39) makes this transparent: restore runs first, push runs after, and the user never sees empty state.

**Before / after.**

Without mirror sync:
- User reinstalls → SQLite is empty → weeks of workout history gone → user churns
- Deleted a session → tombstone exists in `sync_deletions` → never drained → accumulates forever

With mirror sync:
- User reinstalls → `pullRestoreIfFresh()` detects `last_pulled_at IS NULL AND sessions.length === 0` → pulls all five tables from Supabase → history restored before home screen renders
- Deleted a session → `recordTombstone()` writes to `sync_deletions` before the local `DELETE` → next `pushChanges()` drains it → remote row removed → `clearTombstones()` cleans the outbox

**Move 5.** The mirror sync is what Dropbox does for files, applied to SQLite rows — local edits are the authoritative source, the remote is the recovery surface, and the pull only matters when local state is empty.

---

## How it works

### Move 1 — The mental model

Think of a `useEffect` that fires after every state update and posts the new value to a server. You don't replace your local state with the server's response — the server just stores what you sent. On a fresh browser session (equivalent to a reinstall), you call `GET /state` once to rehydrate, then stop reading from the server. That's write-mostly mirror sync.

The strategy in plain English: **pushes go up on every write; one-shot pull only when local is empty.**

```
┌─────────────────────────────────────────────────────┐
│                    DEVICE                           │
│                                                     │
│  ┌─────────────┐   write    ┌───────────────────┐  │
│  │  UI / hooks │──────────▶│  SQLite (WAL)     │  │
│  └─────────────┘           │  source of truth  │  │
│                             └────────┬──────────┘  │
│                                      │              │
│                             pushChanges()           │
│                                      │ (every write)│
└──────────────────────────────────────┼─────────────┘
                                       │ HTTP upsert
                              ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ 
                              Network  │
                              boundary │
                              ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ 
                                       ▼
                             ┌─────────────────────┐
                             │   Supabase Postgres  │
                             │   (mirror / backup)  │
                             └──────────┬──────────┘
                                        │
                             pullRestoreIfFresh()
                             (only when local empty)
                                        │
                              ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─
                              Network   │
                              boundary  │
                              ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─
                                        ▼
                             ┌──────────────────────┐
                             │  SQLite (restored)   │
                             │  then stays primary  │
                             └──────────────────────┘
```

The arrows are directional and asymmetric. Most of the time only the upward arrow fires. The downward arrow fires exactly once per install lifetime.

---

### Move 2 — The layered walkthrough

#### The watermark

`sync_state` in SQLite holds a single row (`id = 'default'`) with two ISO-string columns: `last_pushed_at` and `last_pulled_at`. The watermark for pushes is `last_pushed_at`, stored and read by `getSyncState()` / `setLastPushedAt()` in `src/services/database.ts` (lines 591–607).

When `pushChanges()` runs, it reads `since = lastPushedAt`. Each entity is then filtered: `rows.filter(r => r.updatedAt && r.updatedAt > since)`. If `since` is null (first push ever), all rows qualify. After a fully successful push, `setLastPushedAt(now)` advances the watermark so the next push only sees rows modified after this moment.

If you're coming from React, you're used to `useState` triggering a re-render of everything that depends on the state atom — the framework decides what to re-process. Here the watermark is doing the same job: it tells `pushChanges()` "only process rows that changed since last time," without the caller having to know which rows those are.

```
  sync_state row (id='default')
  ┌──────────────────────────────────────────┐
  │  last_pushed_at: "2026-05-16T10:00:00Z"  │
  │  last_pulled_at: "2026-05-15T09:00:00Z"  │
  └──────────────────────┬───────────────────┘
                         │ since = last_pushed_at
                         ▼
  sessions table
  ┌────────────────────────────────────────────────────┐
  │  row A │ updated_at: "2026-05-16T09:55:00Z" │ SKIP │
  │  row B │ updated_at: "2026-05-16T10:05:00Z" │ PUSH │
  │  row C │ updated_at: "2026-05-16T10:12:00Z" │ PUSH │
  └────────────────────────────────────────────────────┘
                         │ filtered batch → upsert
                         ▼
              ┌─────────────────────┐
              │  Supabase sessions  │
              └─────────────────────┘
```

If the push fails mid-batch, the watermark stays at the old value. The next trigger re-runs from the same `since`, picking up the same (and potentially more) dirty rows. UPSERT semantics make this idempotent.

---

#### The push trigger

Two independent trigger points call `pushChanges()`:

1. **Per-writer fire-and-forget.** Every mutating function in `src/services/database.ts` — `insertSession`, `updateGateProgress`, `updateWeekProgress`, `updateUserLevel`, `upsertExercise`, `deleteSession`, `deleteAllExercises`, `deleteExercisesNotIn` — ends with `pushChanges().catch(() => {})`. The call is non-blocking; the writer resolves immediately and the push happens in the background.

2. **App-open chain.** In `app/_layout.tsx` (line 39), the `useEffect` that watches `ready` runs `pullRestoreIfFresh().then(() => pushChanges())`. This guarantees that even if the device was offline during the last session, an initial push fires when the user returns.

If you're coming from React, this maps to a debounced `useEffect` that fires on every state change — except instead of debouncing by time, we fire immediately and rely on UPSERT idempotency to handle any overlap.

```
  User action
       │
       ▼
  db.insertSession()
  ┌──────────────────────────────────────────────────┐
  │  1. INSERT into SQLite sessions                   │
  │  2. pushChanges().catch(() => {})   ←─ non-blocking│
  └──────────────────────────────────────────────────┘
       │                         │
       │ resolves immediately     │ runs async
       ▼                         ▼
  caller continues          pushChanges()
                            reads watermark
                                 │
                                 ▼
                            supabase.upsert(dirtyRows)
                                 │
                                 ▼
                            setLastPushedAt(now)
```

---

#### The pull guard

`pullRestoreIfFresh()` checks two conditions before doing anything:

1. `lastPulledAt IS NULL` — has a pull-restore ever completed on this device?
2. `sessions.length === 0` — is the sessions table truly empty?

Both must be true to proceed. If either is false, the function returns early with no network call. This is the idempotency guard — reinstalling triggers both conditions; normal app opens fail condition 1 immediately.

If you're coming from React, this is an idempotent effect that should only run once — like a `useEffect` with a `hasRun` ref that short-circuits on all subsequent renders.

```
  pullRestoreIfFresh() called
           │
           ▼
  ┌────────────────────────────────────┐
  │  getSyncState()                    │
  │  lastPulledAt = ?                  │
  └──────────────┬─────────────────────┘
                 │
    ┌────────────┴────────────┐
    │ NOT NULL                │ NULL
    ▼                         ▼
  return early        getSessions().length > 0?
  (already restored)      │
                    ┌─────┴──────┐
                    │ YES        │ NO
                    ▼            ▼
               return early   proceed with
               (not fresh)    full SELECT * pull
                                    │
                                    ▼
                              clearLocalForRestore()
                              write all remote rows
                              setLastPulledAt(now)
                              setLastPushedAt(now)
```

---

#### The race fix

The original bug: when `USER_ID` changed between runs (e.g., the constant was edited in source during development), `pullRestoreIfFresh()` would insert rows tagged with old_USER_ID into SQLite. Then the per-writer `pushChanges()` calls fired by those inserts would run with `since = null` (watermark unset) and push everything to Supabase under new_USER_ID — creating duplicate rows under a different identity.

The fix is two-part:

1. **`restoreInProgress` flag.** Set to `true` before the first restore write, cleared in `finally`. Every `pushChanges()` call checks this flag at the top and returns immediately if it is set. This suppresses the N concurrent pushes that each `db.upsertExercise()` / `db.insertSession()` call inside the restore would otherwise fire.

2. **Watermark inside try-finally.** `setLastPulledAt(now)` and `setLastPushedAt(now)` are called before `restoreInProgress = false`. This means when the flag clears and normal pushes resume, `since` is already set to `now` — the restore-written rows are older than `since` and won't be re-pushed.

```
  Timeline without the fix:
  ────────────────────────────────────────────────────────────────
  pullRestoreIfFresh() starts
    db.insertSession(row1)  ──▶  pushChanges() [since=null] fires
    db.insertSession(row2)  ──▶  pushChanges() [since=null] fires  ← RACE WINDOW
    db.insertSession(row3)  ──▶  pushChanges() [since=null] fires
  setLastPushedAt(now)  (too late — concurrent pushes already ran)

  Timeline with the fix:
  ────────────────────────────────────────────────────────────────
  restoreInProgress = true
    db.insertSession(row1)  ──▶  pushChanges() → returns early (flag set)
    db.insertSession(row2)  ──▶  pushChanges() → returns early (flag set)
    db.insertSession(row3)  ──▶  pushChanges() → returns early (flag set)
    setLastPushedAt(now)    ← watermark set BEFORE flag cleared
  restoreInProgress = false  (in finally)
  next pushChanges() sees since=now → no restore rows qualify
```

---

#### The single-tenant model

`USER_ID` is a hardcoded UUID constant in `src/services/sync/config.ts`:

```ts
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
export const USER_ID = process.env.EXPO_PUBLIC_USER_ID || DEFAULT_USER_ID;
```

Every mapper function stamps this value into the `user_id` field of every remote row. The Supabase client in `client.ts` uses only the anon key — RLS is off for MVP, and the JWT-based option described in the design spec (`scripts/generate-jwt.mjs`) was left in the repo as a future hook.

If you're coming from React, think of this as a static auth header on every `fetch()` call — `user_id` flows into every upsert the same way `Authorization: Bearer <token>` would flow into every request, except here it's embedded in the row data instead of the HTTP header.

```
  src/services/sync/config.ts
  ┌────────────────────────────────────────────────┐
  │  USER_ID = '00000000-0000-0000-0000-000000000001'│
  └──────────────────────┬─────────────────────────┘
                         │ imported by mapper.ts
                         ▼
  mapper.ts (each *ToRemote function)
  ┌──────────────────────────────────────────────────┐
  │  sessionToRemote(s) → { user_id: USER_ID, ... }  │
  │  exerciseToRemote(e) → { user_id: USER_ID, ... } │
  │  weekToRemote(w) → { user_id: USER_ID, ... }     │
  └──────────────────────┬───────────────────────────┘
                         │ rows passed to supabase.upsert()
                         ▼
  Supabase Postgres (all 5 tables)
  ┌──────────────────────────────────────────────────┐
  │  sessions: (user_id='00000...001', id='abc', ...) │
  │  exercises: (user_id='00000...001', id='xyz', ...) │
  └──────────────────────────────────────────────────┘
```

The composite primary key `(user_id, id)` means a future migration to real auth just needs to change the `USER_ID` constant and enable RLS — the row shape is already multi-tenant-ready.

---

#### Tombstones for deletes

UPSERT handles creates and updates. Deletes are different — you cannot upsert an absence. The tombstone pattern solves this with a local outbox table `sync_deletions`.

The rule: `recordTombstone()` is called BEFORE the local `DELETE`. If the local delete succeeded, the tombstone exists. The next `pushChanges()` drains the outbox: for each tombstone, it calls `supabase.from(entityType).delete().match({ user_id, id })`. Only if every individual remote delete succeeds does `clearTombstones(ids)` remove the outbox entries. A partial failure leaves uncleared tombstones, which the next push re-attempts.

```
  deleteSession('abc') called
       │
       ▼
  ┌────────────────────────────────────────────────────┐
  │  1. recordTombstone('sessions', 'abc')             │
  │     → INSERT INTO sync_deletions (entity_type,      │
  │       entity_id, deleted_at)                        │
  │                                                    │
  │  2. DELETE FROM sessions WHERE id = 'abc'          │
  │                                                    │
  │  3. pushChanges().catch(() => {})                  │
  └────────────────────────────────────────────────────┘
       │
       ▼ (inside pushChanges)
  getPendingTombstones()
       │
       ▼
  for each tombstone:
  ┌────────────────────────────────────────────────────┐
  │  supabase.from('sessions')                         │
  │    .delete()                                        │
  │    .match({ user_id: USER_ID, id: 'abc' })         │
  │         │                                          │
  │         ├─ success ──▶ continue to next tombstone  │
  │         └─ error   ──▶ return early (don't clear)  │
  └────────────────────────────────────────────────────┘
       │ (all succeeded)
       ▼
  clearTombstones([tombstone.id])
  → DELETE FROM sync_deletions WHERE id IN (...)
```

The tombstone is never recorded for `clearLocalForRestore()` wipes — those are wholesale replacements, not user-initiated deletes, and the remote already has the correct data.

---

#### The per-table sync ledger

If you're coming from frontend, think of a per-row `updated_at` on a list — each row has its own timestamp telling you when it last changed. The sync ledger is that pattern flipped: one row per *table*, recording when that table was last successfully pushed to Supabase. The technical term for this table is `sync_meta`.

`sync_meta` has two columns: `table_name TEXT PRIMARY KEY` and `last_synced_at TEXT`. Five rows are seeded by the migration with `last_synced_at = NULL`: `user_profile`, `exercises`, `sessions`, `gate_progress`, and `week_progress`. After each per-table upsert inside `pushChanges()`, a call to `setSyncMetaTouched(tableName)` (in `src/services/database.ts`) sets that row's `last_synced_at` to the current ISO timestamp. The Settings screen (`app/settings/index.tsx`) reads all five rows via `getAllSyncMeta()` and renders them in a SYNC LEDGER section showing each table's name and how long ago it was last synced.

The mechanism in table form:

```
  sync_meta table (SQLite, local-only)
  ┌────────────────────┬────────────────────────────┐
  │  table_name (PK)   │  last_synced_at            │
  ├────────────────────┼────────────────────────────┤
  │  user_profile      │  2026-05-19T08:31:00Z      │
  │  exercises         │  2026-05-19T08:31:00Z      │
  │  sessions          │  2026-05-19T08:31:01Z      │
  │  gate_progress     │  2026-05-19T08:31:01Z      │
  │  week_progress     │  2026-05-19T08:31:01Z      │
  └────────────────────┴────────────────────────────┘

  On fresh install: all last_synced_at = NULL (seeded by migration)
  After first pushChanges(): each row stamped with the push timestamp
```

The five rows are seeded with NULL on the first migration run. The value NULL means "this table has never been successfully pushed". Once `pushChanges()` upserts a batch for a given table and calls `setSyncMetaTouched`, the row shows the exact time that table's data made it to Supabase.

The data flow from push to Settings UI:

```
  pushChanges() in src/services/sync/supabase-sync.ts
       │
       ├── upsert user_profile batch to Supabase
       │        └── setSyncMetaTouched('user_profile')
       │               └── UPDATE sync_meta SET last_synced_at = now
       │                   WHERE table_name = 'user_profile'
       │
       ├── upsert exercises batch to Supabase
       │        └── setSyncMetaTouched('exercises')
       │
       ├── upsert sessions batch to Supabase
       │        └── setSyncMetaTouched('sessions')
       │
       ├── upsert gate_progress batch to Supabase
       │        └── setSyncMetaTouched('gate_progress')
       │
       └── upsert week_progress batch to Supabase
                └── setSyncMetaTouched('week_progress')

  app/settings/index.tsx
       │
       ├── useFocusEffect → getAllSyncMeta() → 5 rows
       ├── setInterval(15s) → getAllSyncMeta() → re-read
       └── renders SYNC LEDGER section: table name + "X ago"
```

One boundary condition worth naming: `setSyncMetaTouched` is called after each successful per-table upsert — even if that table had zero rows to push (an empty dirty-row batch still upserts successfully). This means `last_synced_at` advances on every successful sync attempt, not only when data actually changed. The semantics are "last time we checked this table and it was in sync with Supabase" — not "last time we actually sent data for this table". This is deliberate: a table with no dirty rows still successfully synced on that push cycle.

`sync_meta` is local-only — it never crosses the network boundary. It is not in the Supabase schema and is not pulled on restore. Its role is purely observability: it tells the user (via Settings) and the developer (via the database) that each entity type has a known-good push timestamp.

---

### Move 2.5 — Current state vs future state

**Phase A (current):** Single-tenant, anon key, RLS off. The `USER_ID` is a hardcoded constant. The Supabase client carries no custom auth header beyond the anon key and targets the `contrl` schema on the reindb shared project (via `db: { schema: 'contrl' }` in `createClient`). Any device with the same built app binary has access to the same Supabase rows.

**Phase B (future):** Real auth via Supabase Anonymous Auth or custom JWT. RLS policies on every table using `auth.uid() = user_id` or `(request.jwt.claims::json ->> 'user_id')::uuid = user_id`. Multi-device conflict resolution — the current last-writer-wins via `updated_at` is a starting point, but per-row vector clocks or CRDTs may be needed.

```
  Phase A (now)                        Phase B (later)
  ─────────────────────────────────    ──────────────────────────────────────
  ┌──────────────────────────┐         ┌──────────────────────────────────────┐
  │  createClient(url, anon) │         │  createClient(url, anon, {            │
  │  auth.persistSession=false│        │    auth: { persistSession: true }     │ (new!)
  └──────────────┬───────────┘         │  })                                   │
                 │                     └────────────────┬─────────────────────┘
  USER_ID =      │                                      │
  '00000...001'  │                     supabase.auth    │
  (hardcoded)    │                     .signInAnon()    │  (new!)
                 │                     → server-issued  │
                 │                       user_id        │
                 ▼                                      ▼
  Supabase tables                      Supabase tables
  RLS: OFF       ◄──── (change!)  ──▶  RLS: ON
  no per-user    │                     user_id = auth.uid()  (new!)
  isolation      │                     per-user row isolation
                 │
  Conflict       │                     Conflict: last-writer-wins + updated_at
  resolution:    │                     (Phase B may add vector clocks)  (new!)
  last-write-wins│
  (already done) │
                 │
  Restore identity: hardcoded          Restore identity: server-issued uuid
  (survives reinstall)                 stored in expo-secure-store (new!)
                                       reinstall = new uuid = no restore
                                       fix: email/magic-link login
```

The row schema does not change between phases. The composite primary key `(user_id, id)` is already there; only the auth surface and RLS configuration change.

---

### Move 3 — The principle

This is what cloud-mirror means in practice across any local-first system: local writes are authoritative and must never wait for the remote; the remote is a recovery surface that becomes relevant only when local state is absent; and the pull direction matters only at one specific moment in the device lifecycle.

The push watermark (`last_pushed_at`) is the mechanism that makes this efficient. The pull guard (`last_pulled_at IS NULL AND sessions.length === 0`) is the mechanism that makes the restore safe to trigger unconditionally on every app open. The tombstone outbox is the mechanism that closes the gap deletes would otherwise leave.

The primary diagram below shows how these three mechanisms layer across the full architectural stack.

---

## Supabase mirror sync — diagram

Every architectural layer from user action to Supabase Postgres, including the sync state that coordinates them.

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         UI LAYER                                    │
  │                                                                     │
  │  ┌──────────────────┐      ┌──────────────────────────────────┐    │
  │  │  Workout writers │      │  Settings UI (app/settings/)     │    │
  │  │  (insertSession, │      │  Status · Last push · Last pull  │    │
  │  │   updateGate,    │      │  Sync now button → pushChanges() │    │
  │  │   updateWeek,    │      └──────────────────────────────────┘    │
  │  │   upsertExercise)│                                               │
  │  └────────┬─────────┘                                               │
  └───────────┼─────────────────────────────────────────────────────────┘
              │ each writer calls pushChanges() fire-and-forget
              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                       SYNC ENGINE LAYER                             │
  │                                                                     │
  │  src/services/sync/supabase-sync.ts                                 │
  │                                                                     │
  │  ┌─────────────────────────────────────────────────────────────┐   │
  │  │  pushChanges()                                              │   │
  │  │  1. read last_pushed_at (watermark)                        │   │
  │  │  2. filter: updatedAt > since per entity                   │   │
  │  │  3. upsert batches: user_profile, exercises, sessions,     │   │
  │  │     gate_progress, week_progress                           │   │
  │  │  4. drain sync_deletions tombstones (remote DELETE each)   │   │
  │  │  5. clearTombstones() only on full success                 │   │
  │  │  6. setLastPushedAt(now)                                   │   │
  │  └──────────────────────────────┬──────────────────────────────┘   │
  │                                 │                                   │
  │  ┌──────────────────────────────┴──────────────────────────────┐   │
  │  │  pullRestoreIfFresh()                                       │   │
  │  │  guard: last_pulled_at IS NULL AND sessions.length === 0   │   │
  │  │  1. restoreInProgress = true                               │   │
  │  │  2. clearLocalForRestore()  (wipe 4 synced tables)        │   │
  │  │  3. SELECT * from all 5 Supabase tables                   │   │
  │  │  4. INSERT OR REPLACE into local SQLite                   │   │
  │  │  5. setLastPulledAt(now) + setLastPushedAt(now)           │   │
  │  │  6. restoreInProgress = false  (in finally)               │   │
  │  └──────────────────────────────┬──────────────────────────────┘   │
  │                                 │                                   │
  │  ┌─────────────────────────────────────────────────────────────┐   │
  │  │  mapper.ts: *ToRemote / *FromRemote                        │   │
  │  │  client.ts: supabase singleton (anon key, no session)      │   │
  │  │  config.ts: SUPABASE_URL, SUPABASE_ANON_KEY, USER_ID       │   │
  │  └─────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────┼───────────────────────────────────┘
                                    │ HTTP (upsert ▲ / select ▼)
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                          NETWORK BOUNDARY
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         CLOUD LAYER                                 │
  │                         Supabase Postgres                           │
  │                                                                     │
  │  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
  │  │  sessions      │  │  exercises   │  │  gate_progress       │   │
  │  │  (user_id, id) │  │  (user_id,id)│  │  (user_id, id)       │   │
  │  └────────────────┘  └──────────────┘  └──────────────────────┘   │
  │                                                                     │
  │  ┌────────────────────────┐  ┌────────────────────────────────┐   │
  │  │  week_progress         │  │  user_profile                  │   │
  │  │  (user_id, week_start) │  │  (user_id)                     │   │
  │  └────────────────────────┘  └────────────────────────────────┘   │
  │                                                                     │
  │  RLS: OFF (Phase A) · anon key · no per-user isolation             │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                      STORAGE LAYER (device)                         │
  │                      expo-sqlite / WAL mode                         │
  │                                                                     │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────┐ │
  │  │  sync_state (id='default')      │  │  sync_deletions         │ │
  │  │  last_pushed_at: ISO | null     │  │  entity_type, entity_id │ │
  │  │  last_pulled_at: ISO | null     │  │  (tombstone outbox)     │ │
  │  └─────────────────────────────────┘  └─────────────────────────┘ │
  │                                                                     │
  │  sessions · exercises · gate_progress · week_progress · user_profile│
  │  (source of truth for all reads and writes during normal use)       │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

- **Sync engine:** `/Users/rein/Public/contrl/src/services/sync/supabase-sync.ts` — `pushChanges()` (lines 34–128) and `pullRestoreIfFresh()` (lines 130–196). The `restoreInProgress` flag lives at module scope (line 32).
- **Client:** `src/services/sync/client.ts` — supabase singleton created with anon key, `persistSession: false`, `autoRefreshToken: false`. The `createClient` call passes `db: { schema: 'contrl' }` so all `.from('sessions')` etc. resolve under the `contrl` schema on reindb, not in public.
- **Config:** `/Users/rein/Public/contrl/src/services/sync/config.ts` — reads `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_USER_ID` from environment; falls back to hardcoded UUID.
- **Mapper:** `/Users/rein/Public/contrl/src/services/sync/mapper.ts` — `sessionToRemote`/`sessionFromRemote`, `exerciseToRemote`/`exerciseFromRemote`, `gateToRemote`/`gateFromRemote`, `weekToRemote`/`weekFromRemote`, `userToRemote`/`userFromRemote`.
- **Watermark storage:** `/Users/rein/Public/contrl/src/services/database.ts` — `sync_state` table (lines 103–107 in migration), `getSyncState()` (591), `setLastPushedAt()` (602), `setLastPulledAt()` (607).
- **Tombstones:** `/Users/rein/Public/contrl/src/services/database.ts` — `recordTombstone()` (614), `getPendingTombstones()` (623), `clearTombstones()` (631). Called before local DELETE in `deleteSession()` (315–319), `deleteAllExercises()` (322–329), `deleteExercisesNotIn()` (332–344).
- **Restore wipe:** `/Users/rein/Public/contrl/src/services/database.ts` — `clearLocalForRestore()` (671–679) deletes rows from exercises, sessions, gate_progress, week_progress. Does not record tombstones.
- **Trigger:** `/Users/rein/Public/contrl/app/_layout.tsx` — `useEffect` at line 37: `pullRestoreIfFresh().then(() => pushChanges())` fires once when `ready === true`.
- **Schema:** `supabase/migrations/0001_contrl_schema.sql` — Postgres DDL for the 5 synced tables under the `contrl` schema on reindb (the shared Supabase project that also hosts the buffr app under its own `buffr` schema).
- **JWT mint script (unused after MVP):** `/Users/rein/Public/contrl/scripts/generate-jwt.mjs` — left in repo for when RLS is re-enabled with per-user policies.

---

## Elaborate

**Where this pattern comes from.** Mirror replication is the simplest form of cloud backup for local-first applications. The term "write-mostly" distinguishes it from bidirectional sync (where both sides can originate writes) and from read-through caching (where the remote is primary and local is a cache). Git's `push` / `clone` is the canonical developer tool that follows this model: you push local commits up; when you clone, you pull everything down once.

**The deeper principle.** The key insight is that most data loss happens at a discrete event — reinstall, device loss, factory reset — not continuously. A write-mostly mirror exploits this: you don't need real-time bidirectional consistency for a backup; you need high-frequency pushes (so the last snapshot is recent) and a reliable one-shot pull (so recovery is complete). The watermark makes pushes cheap. The guard makes the pull safe to trigger unconditionally.

**Where this breaks down.** Three specific failure modes:

1. **Multiple devices.** If two devices share a `USER_ID` (possible in the current Phase A since the UUID is in source), both push independently. The last push wins per row (`updated_at` ordering). A workout logged on device A and then updated on device B will have device B's version win in Supabase — even if device A was more recent in wall-clock time but pushed later. This is the last-writer-wins problem.

2. **Tombstone accumulation.** An offline device accumulates `sync_deletions` rows indefinitely. There is no TTL or retention policy. If a user deletes a thousand sessions while offline and never comes back online, the `sync_deletions` table grows unbounded.

3. **Identity loss on reinstall with real auth.** The current hardcoded UUID survives reinstall because it's baked into the binary. When `USER_ID` moves to `expo-secure-store` (necessary for real multi-user support), reinstall erases the stored UUID. The pull guard runs, but `SELECT * FROM user_profile WHERE user_id = <new-uuid>` returns nothing. Recovery requires a login flow.

**What to explore next.** The local-first architecture this syncs into lives in `01-local-first-architecture`. The SQLite store it protects is described in `02-sqlite-as-source-of-truth`. The reconstruction-on-reinstall flow this enables is in `06-reconstruction-on-reinstall`.

---

## Tradeoffs

| Dimension | Write-mostly mirror (current) | Full bidirectional sync |
|---|---|---|
| Conflict resolution | Last-writer-wins via `updated_at` — simple, lossy | Vector clocks / CRDTs — correct, complex |
| Implementation cost | ~400 lines across 5 files | 2–10x more; requires merge logic per entity |
| Multi-device support | Accidental (same UUID = same rows), not designed for it | First-class; each device has an identity |
| Offline delete safety | Tombstone outbox (manual, explicit) | Typically built into the sync engine |
| Pull frequency | Once per install lifetime | Continuously, or on subscription event |
| Auth model | Anon key + hardcoded UUID (Phase A) | Real auth required |
| Storage cost | Low: only dirty rows pushed | Higher: full state diffs or CRDTs |

**What we gave up.** Correct multi-device convergence. If the same user ever uses two physical devices with the same hardcoded `USER_ID`, the last push wins. There is no merge — one device's writes silently overwrite the other's for rows touched by both. This is acceptable in Phase A because multi-device is explicitly out of scope.

**What bidirectional sync would have cost.** A real bidirectional sync engine — even a simple one — requires: per-entity merge functions (what happens when session A on device 1 and session A on device 2 differ?), a change log or vector clock on every row, a protocol for negotiating who sends what, and a failure recovery model for mid-sync crashes. The supabase-js client does not provide this. The implementation cost would be substantial and the edge cases (offline queue + merge conflict + device identity) would dominate the codebase.

**The breakpoint.** The current design is fine until one of three things happens: (a) the user wants the same data on two physical devices simultaneously, (b) multi-tenant support requires real per-user auth and RLS, or (c) the user population grows beyond a single test user and the hardcoded UUID creates a security boundary problem. None of these apply to the solo-user local-first app today.

**What was not actually a tradeoff.** The watermark approach (push only dirty rows) is strictly better than pushing all rows every time. It costs nothing extra and makes pushes faster and cheaper in network terms. This is not a tradeoff — it is an optimization with no downside in the current single-device, single-writer model.

---

## Tech reference (industry pairing)

### @supabase/supabase-js + Supabase Postgres

- **What it is:** The official JavaScript client for Supabase, which wraps PostgREST for database access, GoTrue for auth, and Realtime for subscriptions. In this codebase only the PostgREST database API is used — auth is disabled and realtime is not subscribed to.
- **UPSERT semantics:** `supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })` maps to Postgres `INSERT ... ON CONFLICT (user_id, id) DO UPDATE SET ...`. This is idempotent: pushing the same row twice is a no-op on the second call if no columns changed, or a safe update if they did.
- **anon key vs service role key:** The anon key is designed for client-side use. It carries the `anon` role, which can only do what RLS permits. With RLS off (Phase A), the anon key has full read/write access to all tables — which is acceptable for a single-user local app but not for a multi-user deployment.
- **`persistSession: false`:** The supabase-js client defaults to persisting the auth session to AsyncStorage. Setting this to `false` prevents the client from touching storage, which is appropriate here because there is no auth session — the hardcoded USER_ID flows in through row data, not through the auth header.
- **`react-native-url-polyfill`:** supabase-js uses the WHATWG `URL` API internally. React Native does not include a compliant implementation. The polyfill imported at the top of `client.ts` fills this gap. Without it, URL parsing inside the Supabase client throws at runtime.

### expo-sqlite (WAL)

- **What it is:** The Expo wrapper around the native SQLite library for React Native. Opens a persistent database file at the app's documents directory. The `WAL` journal mode (set in `migrate()` via `PRAGMA journal_mode = WAL`) enables concurrent reads without blocking writes — relevant because the sync engine reads tables while the UI might be writing them.
- **`getFirstAsync` / `getAllAsync` / `runAsync`:** The async API added in expo-sqlite v14. These return Promises and do not block the JS thread via a bridge call; they execute on a background thread pool. This is important for `pushChanges()` — the sequential await chain across five entity queries does not freeze the UI.
- **`INSERT OR REPLACE`:** Used in `pullRestoreIfFresh()` to write restored rows. SQLite semantics: if a row with the same primary key exists, delete it and insert the new one. This is intentionally destructive — the point of `clearLocalForRestore()` is to ensure no stale rows survive, so the replace semantics are a safety net rather than the primary mechanism.
- **WAL and sync_state:** The `sync_state` table is a single-row SQLite table. Reading and writing it is a trivial operation. WAL mode means concurrent reads from the Settings UI (which polls `getSyncState()` every 15 seconds) and writes from `setLastPushedAt()` inside `pushChanges()` do not contend.
- **Database singleton:** `getDatabase()` in `src/services/database.ts` returns a module-level singleton. The database is opened once and reused across all calls. This matters for the tombstone flow: `recordTombstone()` and the subsequent `DELETE` in `deleteSession()` both run in the same database instance without a reconnect overhead.

### EXPO_PUBLIC_* env-var pattern

- **What it is:** Expo's convention for environment variables that should be inlined into the JavaScript bundle at build time. Variables prefixed with `EXPO_PUBLIC_` are read from `.env` (or `.env.local`, `.env.production`) and made available via `process.env.EXPO_PUBLIC_*` in the JS bundle. They are NOT secrets — they are compiled into the binary.
- **Anon key exposure:** The `EXPO_PUBLIC_SUPABASE_ANON_KEY` is intentionally public. Supabase's security model assumes the anon key will be visible to clients; RLS is the access control boundary, not key secrecy. For Phase A with RLS off, the key gives access to the tables — but the app is a single-user local tool and the data is not sensitive in a multi-tenant sense.
- **`isSyncConfigured()`:** `src/services/sync/config.ts` exports this guard function. If `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` is empty, `pushChanges()` and `pullRestoreIfFresh()` both return immediately. This makes sync a zero-overhead no-op in development environments where `.env` is not configured.
- **`EXPO_PUBLIC_USER_ID` override:** The config accepts an override for `USER_ID` via env var. In production the default UUID is used. During testing or development, a different UUID can be passed to target a separate set of rows without changing source code.
- **Build-time vs runtime:** EXPO_PUBLIC vars are inlined at build time by the Metro bundler. They cannot change after the app is built. This means the Supabase URL and anon key are fixed per binary — appropriate for this use case, but it means releasing a new binary is required to change the Supabase project.

---

## Summary

The Supabase mirror sync is a write-mostly replication layer that sits between the local SQLite database and a Supabase Postgres instance. Local writes remain authoritative — every read and write during normal operation uses SQLite. Each write triggers a non-blocking `pushChanges()` call that filters dirty rows via a watermark (`last_pushed_at`), upserts them to Supabase, drains any pending tombstones for deletes, and advances the watermark on success. On a fresh install — detected by `last_pulled_at IS NULL AND sessions.length === 0` — `pullRestoreIfFresh()` runs first, wipes the local synced tables, and restores all five entity types from Supabase before any UI renders. A `restoreInProgress` flag and watermark-inside-try-finally pattern prevent the concurrent pushes that restore-triggered writes would otherwise cause.

**Key points:**

- **Watermark, not full-scan.** Only rows with `updated_at > last_pushed_at` are sent each cycle. The first push sends everything; subsequent pushes send only what changed.
- **Pull runs once per install lifetime.** The `last_pulled_at` guard makes `pullRestoreIfFresh()` safe to call unconditionally on every app open — it returns immediately after the first successful restore.
- **Tombstone outbox closes the delete gap.** `recordTombstone()` must be called before the local DELETE so a failed push can retry. `clearTombstones()` only runs after all remote deletes succeed.
- **`restoreInProgress` flag prevents the duplicate-push race.** Without it, each `db.upsertExercise()` inside the restore fires a concurrent `pushChanges()` with `since=null`, pushing everything under whatever `USER_ID` is current.
- **Phase A is single-tenant by design.** The hardcoded UUID in `config.ts` is a conscious MVP decision. The row schema is already multi-tenant-ready; auth and RLS are the Phase B work.
- **Lives in step 2 — request/response flow — and step 5 — failure handling — of the system-design checklist.** The push/pull mechanism is the request/response flow between device and cloud; the watermark-retry and tombstone-retry patterns are the failure handling.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how does your app sync to the cloud?", they want to know whether you understand the difference between a backup, a cache, and a sync engine. They want to see you name the failure modes — concurrent writes, delete propagation, offline behavior — and explain why you chose a simpler model over a complex one. They want evidence that you thought about the breakpoint: when does the simple model stop working?

---

### Likely questions

**[mid] How does the app avoid re-pushing data it already sent?**

The watermark. `last_pushed_at` in `sync_state` records the timestamp of the last successful push. On the next call to `pushChanges()`, each entity is filtered by `updatedAt > since`. Only rows modified after the last push qualify. After a full-success push, `setLastPushedAt(now)` advances the watermark.

```
  Push cycle N (last_pushed_at = T1)
  ┌──────────────────────────────────────────────────────┐
  │  sessions: filter updatedAt > T1 → [rowB, rowC]      │
  │  exercises: filter updatedAt > T1 → []               │
  │  → upsert [rowB, rowC] to Supabase                   │
  │  → setLastPushedAt(T2)                               │
  └──────────────────────────────────────────────────────┘

  Push cycle N+1 (last_pushed_at = T2)
  ┌──────────────────────────────────────────────────────┐
  │  sessions: filter updatedAt > T2 → [rowD]            │
  │  rowB and rowC are now before T2 → skipped           │
  └──────────────────────────────────────────────────────┘
```

---

**[mid] What happens if the user deletes a session while offline?**

The tombstone outbox. `deleteSession()` calls `recordTombstone('sessions', id)` before the local `DELETE`. This writes a row to `sync_deletions`. The local delete proceeds. The tombstone sits in `sync_deletions` until the next `pushChanges()` run that has network access. On success, `clearTombstones()` removes the outbox entry. If `pushChanges()` fails mid-way through tombstone draining, the surviving entries are retried on the next call.

---

**[senior] What's the difference between your pull and your push, architecturally?**

The push is high-frequency and incremental — it fires on every write, filters to only dirty rows, and is designed to run hundreds of times per session with minimal cost. The pull is one-shot and total — it runs once per install lifetime, fetches all rows for all five entities, and is designed to be correct, not fast. The asymmetry is deliberate: pushes optimize for low overhead; the pull optimizes for completeness. This is the core insight of write-mostly mirror sync — you don't need bidirectional sync most of the time; you just need the one-shot pull to be reliable.

```
  Push (high frequency, incremental)     Pull (once per lifetime, total)
  ─────────────────────────────────────  ──────────────────────────────────
  Trigger: every write                   Trigger: fresh install detected
  Filter: updatedAt > watermark          Filter: none (SELECT * all tables)
  Cost: network bytes ∝ changes          Cost: network bytes ∝ total data
  Failure: retry on next write           Failure: retry on next app open
  Idempotent: yes (UPSERT)              Idempotent: yes (clearLocal + INSERT OR REPLACE)
  Guard: restoreInProgress flag          Guard: last_pulled_at IS NULL AND count=0
```

---

**[senior] How does the system handle the race between restore and the per-writer push triggers?**

The `restoreInProgress` boolean at module scope in `supabase-sync.ts`. When `pullRestoreIfFresh()` starts writing data into SQLite, every `db.upsertExercise()` and `db.insertSession()` call fires `pushChanges()` as a side effect. Without the flag, each of those pushes would see `since = null` (because the watermark hasn't been set yet) and push everything to Supabase. With the flag, each `pushChanges()` call checks `if (restoreInProgress) return` at the top. The watermark is set inside the try block before the flag is cleared in the finally block, so by the time the next real push runs, `since` is already set to the restore timestamp and the restore-written rows are before the watermark.

---

**[arch] When does this design stop working, and what do you do then?**

Three breakpoints, each with a specific fix:

```
  Breakpoint 1: second device
  ──────────────────────────────────────────────────────────────
  Symptom: two devices with same USER_ID push simultaneously
           → last-writer-wins drops data silently
  Fix: per-device identity (Supabase Anonymous Auth or custom JWT)
       + conflict resolution per entity type
       + eventually: CRDTs for append-only data (sessions)

  Breakpoint 2: real auth required
  ──────────────────────────────────────────────────────────────
  Symptom: anon key + RLS off is a single-tenant security gap
  Fix: Supabase Anonymous Auth or custom JWT with user_id claim
       + RLS policies: user_id = auth.uid()
       + USER_ID moves from hardcoded const to expo-secure-store
       + reinstall → new UUID → need login flow to recover

  Breakpoint 3: tombstone accumulation
  ──────────────────────────────────────────────────────────────
  Symptom: offline device never pushes → sync_deletions unbounded
  Fix: TTL on sync_deletions (DELETE WHERE deleted_at < NOW() - 30d)
       + document the "stale tombstone" edge case in the known gaps
```

---

### The question candidates always dodge

**"Why not just bidirectional sync?"**

Because bidirectional sync requires solving the hardest problems in distributed systems: conflict detection, conflict resolution per entity type, a protocol for negotiating which side sends what, and failure recovery for mid-sync crashes. For a single-user local-first app, none of that complexity is justified. The question candidates dodge is "what does bidirectional sync actually cost?" — not conceptually, but in code.

```
  Write-mostly mirror (current)          Full bidirectional sync
  ──────────────────────────────────     ─────────────────────────────────────
  Merge logic: none needed               Merge function per entity (5+ functions)
  Conflict detection: none               Per-row vector clock or timestamp compare
  Push protocol: upsert everything       Negotiation: what did each side see last?
  Pull protocol: SELECT * once           Continuous: subscribe or poll
  Delete propagation: tombstone outbox   Symmetric: tombstones on both sides
  Implementation: ~400 lines             Implementation: 2–10x, plus test surface
  Failure modes: watermark retry         Failure modes: partial merge, split brain
  When it breaks: second device          When it breaks: never (designed for it)
```

The cost of bidirectional sync is not just the code — it is the test surface, the debugging surface when two devices diverge, and the operational complexity of understanding what the "correct" state is. Write-mostly mirror punts all of that. The bet is: a single-user app on a single device, with high-frequency pushes and a one-shot restore, never needs to merge.

---

### One-line anchors

- "The watermark is a `useState` initializer that tells the push which rows to re-render to the cloud."
- "The pull guard is an idempotent effect — `if (hasRun) return` at the top, run once per install lifetime."
- "The tombstone outbox is the ack queue that prevents silently dropping deletes."
- "The `restoreInProgress` flag is the mutex that prevents restore-triggered writes from flooding the push queue."
- "The row schema is already multi-tenant; only the auth surface and RLS configuration are Phase B work."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. On paper or a whiteboard, draw the full architectural diagram: UI layer (writers + settings UI), sync engine layer (pushChanges + pullRestoreIfFresh), storage layer (SQLite with sync_state and sync_deletions), network boundary, and cloud layer (five Supabase tables). Label every arrow with its direction and trigger condition. Check your diagram against the primary diagram in this file.

**Level 2 — Explain out loud.**
Explain the following sequence without looking at the file: "User logs a workout on their phone. Three weeks later they reinstall the app. Walk me through what happens from the moment they tap 'Save' to the moment they see their history on the reinstalled device."

Expected answer includes: per-writer `pushChanges()` fires → watermark filters to the new session → upsert to Supabase → watermark advances. On reinstall: `pullRestoreIfFresh()` checks `last_pulled_at IS NULL` and `sessions.length === 0` → both true → `clearLocalForRestore()` → `SELECT *` from all five tables → `INSERT OR REPLACE` into SQLite → `setLastPulledAt(now)` and `setLastPushedAt(now)` → `restoreInProgress = false` → normal app open continues.

**Level 3 — Apply to a new scenario.**
A user deletes three sessions while the phone is in airplane mode. They reopen the app two days later with network access. Trace the exact code path from `deleteSession()` to the moment those rows are gone from Supabase. Identify the file and function at each step. (Hint: start at `src/services/database.ts` line 315.)

**Level 4 — Defend the tradeoff.**
You're in a system design interview. The interviewer says: "Your watermark approach means if a push fails halfway through, you'll re-push rows that already made it to Supabase. Isn't that wasteful?" Defend the design choice, including: why UPSERT semantics make this safe, what the alternative would cost (per-entity success tracking), and when the current approach would actually need to change.

---

**Quick check.**

1. What are the two conditions that must both be true for `pullRestoreIfFresh()` to proceed?
2. Why is `setLastPushedAt(now)` called inside the restore's try block rather than after `restoreInProgress = false`?
3. What prevents the tombstone for a deleted session from being cleared if the remote delete fails?
4. What does `clearLocalForRestore()` NOT delete, and why?
5. If `EXPO_PUBLIC_SUPABASE_URL` is empty, what happens when `deleteSession()` is called?

*(Answers: 1. `last_pulled_at IS NULL` AND `sessions.length === 0`. 2. So the watermark is set before the flag clears — any push that runs after `finally` sees `since = now` and skips the restore-written rows. 3. `clearTombstones()` only runs after all remote deletes succeed; a single failure causes an early `return` before `clearTombstones()` is reached. 4. `user_profile` — it is always a single row and the pull updates it in place via `updateUserLevel()`. 5. `isSyncConfigured()` returns `false`; `pushChanges()` returns immediately; the tombstone is recorded in `sync_deletions` but not drained until a future call with a configured environment.)*

---
