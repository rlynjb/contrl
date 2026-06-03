# 01 — Database Systems Map

**Subtitle:** Datastore inventory, query paths, durability boundary — *Project-specific*

## Zoom out, then zoom in

You've got a local-first mobile app. Two databases, two completely different jobs. SQLite is the one the UI reads from on every render — it has to be fast and present even with no network. Postgres is reached only when you push or pull, and the device never trusts what Postgres says except on a fresh install. Everything in this guide hangs off that asymmetry.

```
  Zoom out — where this concept lives

  ┌─ UI layer (React Native / Expo) ──────────────────────────┐
  │  screens, hooks (useExercises, useGameState)              │
  └────────────────────────┬──────────────────────────────────┘
                           │ function call
  ┌─ Data-access layer ────▼──────────────────────────────────┐
  │  src/services/database.ts  (all CRUD)                     │
  │  src/services/sync/*.ts    (mirror to cloud)              │
  └────────────────────────┬──────────────────────────────────┘
                           │ runAsync / getAllAsync
  ┌─ ★ Storage layer ★ ────▼──────────────────────────────────┐
  │  expo-sqlite (WAL)    Postgres (Supabase REST)           │ ← we are here
  │  canonical            write-mostly mirror                 │
  └────────────────────────────────────────────────────────────┘
```

Zoom in. The question this whole guide answers: *for every read and write the app makes, which engine executes it, what does that engine guarantee, and what happens when something goes wrong mid-operation?*

## Structure pass

Three layers, one axis, two seams.

**Layers.** Top: TypeScript callers in `src/services/database.ts`. Middle: the SQLite engine compiled into the binary (file I/O, B-tree pages, WAL log). Bottom: the kernel's fsync. On the cloud side: REST calls in `src/services/sync/supabase-sync.ts` → PostgREST → Postgres MVCC → WAL → fsync.

**Axis — "where does authority live?"** Trace it:

```
  Axis: who is authoritative for this byte?

  ┌─ TypeScript caller ───┐   talks to one engine at a time
  │  knows nothing about  │
  │  durability           │
  └──────────┬────────────┘
             │
  ┌─ SQLite engine ───────▼────┐   AUTHORITATIVE at runtime
  │  page cache + WAL log      │   every read/write goes here first
  │  single writer             │
  └──────────┬─────────────────┘
             │  best-effort push
  ┌─ Postgres engine ─────▼────┐   AUTHORITATIVE only at fresh install
  │  full MVCC, RLS off        │   otherwise: backup
  │  reached via REST          │
  └────────────────────────────┘
```

The answer flips between layers 2 and 3 depending on lifecycle: at runtime SQLite owns the truth; at fresh install Postgres owns it for exactly one pull.

**Seam 1 — TypeScript ↔ SQLite.** This is the in-process boundary. `runAsync(sql, params)` crosses it. Failure here is a thrown promise; nothing partial survives. Contract: parameterized SQL goes in, results come back as JS objects.

**Seam 2 — SQLite ↔ Postgres (over the network).** This is the load-bearing one. Failure here can be partial: some tables pushed, others not. Contract: idempotent upsert by `(user_id, id)`. Read this seam carefully — most of the audit findings live here.

## How it works

### Move 1 — the shape

The pattern is **canonical local with cloud mirror, watermark-pushed, fresh-install-pulled.** You've already shipped this exact shape in buffr; contrl is the second iteration.

```
  The pattern — canonical local + cloud mirror

   ┌── writes ──┐                  ┌── reads ──┐
   │ UI action  │                  │ render    │
   └─────┬──────┘                  └─────┬─────┘
         │                               │
         ▼                               ▼
   ┌────────────────────────────────────────┐
   │            SQLite (canonical)          │  ← always answers
   └────────────────┬───────────────────────┘
                    │ fire-and-forget
                    │ pushChanges()
                    │ filters by updated_at > lastPushedAt
                    ▼
   ┌────────────────────────────────────────┐
   │  Postgres (mirror, write-mostly)       │  ← never read except on
   └────────────────────────────────────────┘     pullRestoreIfFresh()
```

### Move 2 — the moving parts

**The SQLite singleton.** One `db` module-level variable, lazy-initialized. Every CRUD call reaches for the same handle. This is what makes the "single writer" property hold without any explicit lock.

```
  getDatabase() — the singleton

  caller #1 ──► getDatabase() ──┐
  caller #2 ──► getDatabase() ──┼──► same handle ──► one writer queue
  caller #3 ──► getDatabase() ──┘
                                       └─ expo-sqlite serializes calls
                                          on the same handle internally
```

If you ever introduced a second handle to the same file (you probably won't — expo-sqlite makes this awkward), you'd get `SQLITE_BUSY` on writes. contrl is safe because there's exactly one handle.

**The schema.** Nine tables, four of them carry real user data, three are sync infrastructure, two are derived state.

```
  Nine tables, four roles

  ┌─ user data ─────────┐  ┌─ derived ─────────┐
  │ user_profile        │  │ gate_progress     │  recomputable from sessions
  │ exercises (seed +   │  │ week_progress     │  recomputable from sessions
  │   user-edited)      │  └───────────────────┘
  │ sessions            │
  │ drafts              │  ┌─ sync infra ──────┐
  └─────────────────────┘  │ sync_deletions    │  tombstones
                           │ sync_state        │  watermarks
                           │ sync_meta         │  per-table timestamps
                           └───────────────────┘
```

The derived tables are interesting — they EXIST in SQLite (and ARE pushed to Supabase) but they're also reconstructable. That redundancy is the safety net for the sync; see `08`.

**The sync path.** Push reads dirty rows from SQLite, calls `supabase.from(table).upsert(...)`, then touches the per-table sync_meta timestamp. No batching across tables. No transaction across tables. If table 3 fails, tables 4 and 5 never run and `last_pushed_at` is never advanced — so the next push retries all dirty rows from table 1.

```
  Layers-and-hops — push path

  ┌─ Device process ────────────┐
  │  database.ts (read dirty)   │ hop 1: SELECT * FROM <table>
  └──────────────┬──────────────┘         WHERE updated_at > ?
                 │
                 │  (in-process)
                 ▼
  ┌─ supabase-sync.ts ──────────┐
  │  .filter(updated_at > since)│ hop 2: upsert array of rows
  └──────────────┬──────────────┘
                 │  HTTPS POST
                 ▼
  ┌─ PostgREST edge ────────────┐ hop 3: SQL upsert
  │  parses, validates          │         ON CONFLICT (user_id, id)
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─ Postgres engine ───────────┐
  │  MVCC write, WAL, fsync     │
  └─────────────────────────────┘
```

Every hop is a place a failure can leave things partial. The whole guide hangs off knowing what each engine does to handle that.

### Move 3 — the principle

**Two engines with different jobs do not need the same guarantees.** SQLite is in the request path; it has to be fast and crash-safe. Postgres is out of the request path; it has to eventually have the data. Conflating the two — trying to make the cloud authoritative at runtime, or trying to give SQLite multi-user concurrency it doesn't need — is how local-first apps get over-engineered.

## Primary diagram

```
  The full map — every datastore, every query path, every durability boundary

  ┌─ UI / hooks ───────────────────────────────────────────────────────────┐
  │  useExercises, useGameState, settings screen                            │
  └─────────────────────┬──────────────────────────────────────────────────┘
                        │
  ┌─ src/services/database.ts ─────────────────────────────────────────────┐
  │  • getDatabase() singleton                                              │
  │  • migrate() (CREATE TABLE IF NOT EXISTS × 9, CREATE INDEX × 9)         │
  │  • parameterized CRUD: runAsync, getAllAsync, getFirstAsync             │
  │  • one non-parameterized site: updateUserLevel (column name interp)     │
  └────────────┬───────────────────────────────────────────┬───────────────┘
               │                                           │
  ┌─ expo-sqlite ────────────────┐         ┌─ src/services/sync/* ─────────┐
  │  PRAGMA journal_mode = WAL   │         │  pushChanges (dirty-row push) │
  │  9 tables                    │         │  pullRestoreIfFresh           │
  │  9 secondary indexes         │         │     (fresh-install only)      │
  │  WAL log + main file         │         └──────────────┬────────────────┘
  └──────────────────────────────┘                        │ HTTPS
                                                          │
                                       ┌──────────────────▼───────────────┐
                                       │  Supabase project "reindb"        │
                                       │  schema = "contrl"                │
                                       │  • Postgres + true MVCC           │
                                       │  • RLS DISABLED                   │
                                       │  • anon key with full access      │
                                       └───────────────────────────────────┘
```

## Implementation in codebase

**Use cases.** Every interaction triggers a read from SQLite. Every write to SQLite triggers an async, best-effort push to Postgres. The cloud is never read except on the very first launch after install.

**Code side by side.**

```ts
// src/services/database.ts:17–23 — the singleton
let db: SQLite.SQLiteDatabase | null = null;          // module-level handle

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;                                  // ← cached after first call
  db = await SQLite.openDatabaseAsync('contrl.db');   // ← opens the file
  await migrate(db);                                  // ← idempotent migrations
  await seedExercisesIfEmpty(db);                     // ← seed only when empty
  return db;
}
       │
       └─ caching `db` here is what makes "single writer per file" automatic.
          Every caller in the app re-enters this function; only the first one
          actually opens the file.
```

```ts
// src/services/sync/client.ts:5–13 — the cloud client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,      // ← no auth flow; same anon key always
    autoRefreshToken: false,
  },
  db: { schema: 'contrl' },     // ← shared "reindb" project; this app uses
});                             //    the `contrl` schema, buffr uses `buffr`
       │
       └─ `persistSession: false` is why USER_ID has to be hardcoded in config.ts.
          There's no JWT carrying a user identity; RLS would have nothing to
          scope by even if it were on.
```

## Elaborate

The "canonical local + cloud mirror" pattern is the consumer-app variant of CQRS: read model is the device, write model is whatever the device decides, and the cloud is an event log that happens to be table-shaped. SQLite is doing the job most apps reach for Redis for: a fast, local, structured store close to the consumer. The cost is that you give up server-side aggregations and cross-user queries — both of which contrl genuinely doesn't need yet (single user).

The seam to read next:

- `02` for how rows sit in pages and why `exercises_json` being a TEXT blob is acceptable here.
- `03` for which indexes earn their keep and which are dead weight.
- `05` for the migration-without-a-transaction risk.

## Interview defense

**Q: Why SQLite on the device instead of AsyncStorage or MMKV?**

```
  AsyncStorage   MMKV         SQLite (chosen)
  ─────────────  ────────     ───────────────
  key/value      key/value    relations + indexes
  no query       no query     ORDER BY date DESC
  async only     sync         range filters
                              updated_at watermark
```

The watermark-based sync needs a range query (`updated_at > ?`). Key-value stores can't do that without reading every key. SQLite is the smallest engine that gives you the indexed range scan. Anchor: `database.ts:182` is `idx_sessions_updated`, the index that makes the sync path scale.

**Q: How do you avoid `SQLITE_BUSY` errors?**

One handle, returned from `getDatabase()` at `database.ts:17`. expo-sqlite serializes calls through a single native handle, so even concurrent `runAsync` calls queue up rather than collide. The load-bearing part people forget: opening a second handle to the same file from a worker thread is what breaks this. We don't do that.

**Q: What does Postgres actually buy you here?**

Cloud-side backup and the future "log in on a second device" story. Today, exactly one thing: the `pullRestoreIfFresh()` path at install time. Everything else is fire-and-forget. The honest framing is that Supabase is the cheapest "durable backup" you can wire up in a weekend — not a runtime dependency.

## Validate

- **Reconstruct:** name every table in `database.ts:25–115` and which of the four roles (user / derived / sync infra / draft) it plays.
- **Explain:** trace one write (e.g. `insertSession` at `database.ts:371–389`) from the UI button press to the row landing in Postgres. Name every layer it crosses.
- **Apply:** if I asked you to add a `bodyweight_log` table, which file changes, what indexes do you add, and how does it get into the push path? Cite the lines.
- **Defend:** why doesn't `pushChanges()` open a transaction across all five tables? What would it gain and what would it cost?

## See also

- `02-records-pages-and-storage-layout.md` — what's inside a SQLite page
- `04-query-planning-and-execution.md` — how the hot queries actually run
- `08-replication-and-read-consistency.md` — the cloud side once you turn on auth
- `../study-distributed-systems/` — the watermark/tombstone protocol in depth
