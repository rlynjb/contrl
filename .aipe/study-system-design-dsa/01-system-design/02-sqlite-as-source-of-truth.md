# SQLite as source of truth

**Industry name(s):** Embedded SQL database, on-device SQL, application-managed schema
**Type:** Industry standard

> One SQLite file (`contrl.db`) holds every piece of state the app uses. Migrations run on open, additively. No ORM. Direct SQL.

**See also:** → [01-local-first-architecture](./01-local-first-architecture.md) · → [05-derived-state](./05-derived-state.md)

---

## Why care

Most apps you've worked on hide their database behind an ORM and a connection pool. Pick up a mobile app and the database is right there: one file on disk, opened once, written by the same JS thread that paints the screen. That changes how you think about schemas, migrations, and "transactions" — they happen on the device, not in a managed cluster.

The pattern is **embedded SQL**. The shape is: a single-file database (SQLite, in this case) opened in-process, migrated forward on every app start, talked to with raw SQL. It belongs in the same family as Realm, IndexedDB, and the storage layers inside Slack/WhatsApp/Notion mobile apps. Embedded SQL is the dominant storage choice on mobile because it gives you ACID transactions and a query language without the operational cost of a database server. Here's how that shows up in this codebase.

---

## How it works

Imagine your data lives in a single notebook you carry everywhere. You don't dial up a librarian; you flip to the right page and write. Every read and every write is the same physical act.

The strategy: **one connection, one file, application-managed migrations**.

### One connection, opened once

`getDatabase()` in `src/services/database.ts` L17 is a module-level singleton. The first call opens `contrl.db` with `SQLite.openDatabaseAsync('contrl.db')` and runs `migrate()`; every subsequent call returns the same instance. If you're coming from frontend, this is like creating a single React Query client at the root of the app and using it everywhere — except this client is the database itself, not a layer over a remote one.

The practical consequence: there is no connection pool because there's no server. Every query in the codebase calls `await getDatabase()`, gets the same handle back, and runs the SQL directly. A misbehaving query can't starve a connection because there's only one and it's owned by the JS thread.

### WAL mode for non-blocking reads

`PRAGMA journal_mode = WAL` (L27) switches SQLite from rollback-journal mode to write-ahead-log mode. In rollback mode, a writer blocks readers; in WAL mode, readers see the last committed snapshot while a writer appends to the log. On the UI thread, this means a `getSessions()` call on render can proceed even if a `logSession()` write is in flight. Without WAL the skill tree would stutter every time you logged a set.

### Additive migrations on open

```typescript
await database.execAsync(`
  CREATE TABLE IF NOT EXISTS exercises (...);
`);
const exerciseCols = await database.getAllAsync<{ name: string }>(
  "PRAGMA table_info(exercises)"
);
const exerciseColNames = new Set(exerciseCols.map(c => c.name));
if (!exerciseColNames.has('tempo'))
  await database.execAsync('ALTER TABLE exercises ADD COLUMN tempo TEXT');
```

Every migration is **idempotent on schema state**. `CREATE TABLE IF NOT EXISTS` creates the table only if missing. To add a column on an existing install, the code reads `PRAGMA table_info(<table>)`, checks for the column name, and runs `ALTER TABLE … ADD COLUMN` only if absent. There is no migration-version table.

If you're coming from web with Prisma or Knex, you're used to `prisma migrate` producing a chain of versioned SQL files run sequentially with bookkeeping. Here, the migration logic *lives in the application* and runs every time the app opens. The cost: no rollback, no version table, no "what migration are we on?" introspection. The benefit: cold start works on a fresh install, an existing install, a re-install, or a partial upgrade — all the same code path.

The practical consequence: shipping a new column is a two-line change in `migrate()`. Shipping a column rename is harder — you can't rename, you have to add new + copy + drop old, and "drop" doesn't survive a downgrade. So we don't rename; we add.

### No ORM — direct SQL with hand-rolled row mappers

Every table has a `rowToX(row)` function (e.g., `rowToExercise` at L281, `rowToSession` at L413). The row shape is the SQL schema; the domain shape is the TypeScript type. Mappers translate between them, including `snake_case → camelCase`, `INTEGER 0/1 → boolean`, `TEXT JSON → ExerciseEntry[]`.

This is the bridge to backend that frontend engineers most often miss: an ORM does this translation for you and adds a query DSL on top. With raw SQL, *you write the SQL string*, you write the mapper, and you carry the type-safety yourself with TypeScript generics like `db.getAllAsync<ExerciseRow>(…)`.

The practical consequence: queries are inspectable. There's no "what SQL did Prisma generate?" mystery — the SQL is the code. The cost: it's verbose. The benefit: it's debuggable without leaving the editor, and there's no ORM behavior to surprise you.

### Exercises as `JSON` inside a row

`sessions.exercises_json` is a TEXT column holding `JSON.stringify(session.exercises)`, written in `insertSession` (L371). This is a deliberate denormalization — we could have a separate `exercise_entries` table, but the entries are *always* read with the session and never updated independently. Stuffing them into one column trades query expressiveness for write/read simplicity: one insert, one parse on read.

This is the same pattern as Postgres `jsonb` columns or MongoDB document fields — sometimes you want a fully-shaped record on disk, not a five-way join.

### The principle

Embedded SQL is what storage looks like when latency matters more than scale. A single-file database is too slow at 1M QPS and too unsharded for big-data — but at single-user-on-mobile scale it's the highest-performance option that still gives you ACID, indexes, and a query language. Every mobile app eventually lands here because none of the alternatives (key-value stores, in-memory state, NoSQL caches) give you both transactions and queries.

The full picture is below.

---

## SQLite as source of truth — diagram

```
┌─ JS thread (Expo runtime) ──────────────────────────────────────────────────────────────┐
│                                                                                         │
│   useGameState  ──┐                                                                     │
│   useExercises  ──┼──► getDatabase()  ─── module-level singleton ───┐                   │
│   useDatabase   ──┘                                                 │                   │
│                                                                     ▼                   │
│                                                       ┌─ Bridge / JSI call ──────┐      │
└───────────────────────────────────────────────────────┼──────────────────────────┼──────┘
                                                        │                          │
                                                        ▼                          │
┌─ Storage layer (on disk) ───────────────────────────────────────────────────────────────┐
│                                                                                         │
│   contrl.db   (SQLite, WAL mode)                                                        │
│      ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐                     │
│      │ user_profile    │  │ exercises       │  │ sessions         │                     │
│      │  push_level     │  │  id, name, ...  │  │  exercises_json  │  ← JSON-in-column   │
│      │  pull_level     │  │  tempo, notes   │  │  passed, updated │                     │
│      │  squat_level    │  └─────────────────┘  └──────────────────┘                     │
│      └─────────────────┘                                                                │
│                                                                                         │
│      ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐                     │
│      │ gate_progress   │  │ week_progress   │  │ drafts           │  ← never synced     │
│      │ ─derived─       │  │ ─derived─       │  │ ─session-scoped─ │                     │
│      └─────────────────┘  └─────────────────┘  └──────────────────┘                     │
│                                                                                         │
│      ┌────────────────────┐  ┌─────────────────────────────────────────────┐            │
│      │ sync_deletions     │  │ sync_state                                  │            │
│      │ ─tombstone outbox─ │  │  id, last_pushed_at, last_pulled_at         │            │
│      └────────────────────┘  └─────────────────────────────────────────────┘            │
│                                                                                         │
│      ┌─────────────────────────────────────────────────────────────────────┐            │
│      │ sync_meta                                                           │            │
│      │  table_name TEXT PK,  last_synced_at TEXT                          │            │
│      │  ─per-table push ledger; 5 rows; written by pushChanges()─         │            │
│      └─────────────────────────────────────────────────────────────────────┘            │
│                                                                                         │
│      migrate():                                                                         │
│        CREATE TABLE IF NOT EXISTS  (idempotent)                                         │
│        PRAGMA table_info(...) → set     (introspection)                                 │
│        ALTER TABLE ... ADD COLUMN       (when column absent)                            │
│        Indexes on category/level/notion_page_id(dead schema)/updated_at                 │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/services/database.ts`
**Function / class:** `getDatabase()` (L17), `migrate()` (L25), `seedExercisesIfEmpty()` (L214)
**Line range:** L17–L236

Public domain operations (all in `src/services/database.ts`):
- User: `getUser` L238, `updateUserLevel` L261
- Exercises: `getExercises` L298, `upsertExercise` L346, `deleteExercisesNotIn` L332
- Sessions: `insertSession` L371, `getSessions` L391
- Gate progress: `getAllGateProgress` L455, `updateGateProgress` L478
- Week progress: `getAllWeekProgress` L513, `updateWeekProgress` L536
- Drafts: `saveDraft` L556, `getDraft` L566, `deleteDraft` L584
- Sync watermark: `getSyncState` L591, `setLastPushedAt` L602, `setLastPulledAt` L607
- Tombstone outbox: `recordTombstone` L614, `getPendingTombstones` L623, `clearTombstones` L631
- Restore utility: `clearLocalForRestore` L671
- Sync ledger: `getAllSyncMeta()` L644, `setSyncMetaTouched(tableName)` L663 — reads/writes the `sync_meta` table; called by `pushChanges()` after each per-table upsert and by the Settings UI SYNC LEDGER section

---

## Elaborate

### Where this pattern comes from

SQLite landed in 2000 and has been the on-device database for almost every mobile platform since 2008 (Android shipped with it; iOS added it later). The "embedded SQL" pattern predates SQLite by decades — Berkeley DB, dBase, Access. What SQLite did differently was give every mobile app a free, public-domain, ACID-compliant SQL engine. The result: the question on mobile is rarely *whether* to use SQLite, but *how* to manage its schema.

### The deeper principle

The database doesn't have to be a service. When the data is single-tenant and the access pattern is local, an embedded engine is faster, cheaper, simpler, and easier to debug than a managed server. The "always use Postgres" intuition is wrong on mobile.

### Where this breaks down

Multi-process access (a widget process and the app process both reading the same DB) requires care; WAL is per-connection and contention can corrupt. SQLite's recommendation is one writer at a time per database file — fine for an Expo app, broken if you start spawning Android background services. Cross-device sync is also outside SQLite's scope: it's an embedded DB, not a replicated one.

### What to explore next

- [11-supabase-mirror-sync](./11-supabase-mirror-sync.md) → how local writes flow to the remote mirror
- [05-derived-state](./05-derived-state.md) → which tables get synced and which don't
- [02-dsa/02-composite-key-lookups](../02-dsa/02-composite-key-lookups.md) → how `${cat}:${level}` keys work

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension   │ Embedded SQLite (taken)          │ Cloud Postgres (alternative)      │
├──────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Read latency     │ ~0.1ms                           │ 50–200ms over WAN                 │
│ Write latency    │ ~1ms (fsync)                     │ 50–200ms + round-trip             │
│ Offline use      │ Works                            │ Doesn't                           │
│ Operational cost │ $0                               │ $20+/month per environment        │
│ Schema migrations│ Application-managed, additive    │ Tooling (Prisma/Flyway) + version │
│ Query expressivity│ Full SQL                        │ Full SQL + extensions             │
│ Multi-user       │ N/A (one device, one user)       │ First-class                       │
│ Debugging        │ Open .db with sqlite3 CLI        │ Need DB access + tooling          │
└──────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The hardest cost is migration discipline. Without a version table, the team must commit to additive-only migrations forever. A rename is a 4-step dance (add new column, copy values, deploy, drop old) and a `DROP` migration risks breaking older binaries still installed on a user's phone. The codebase enforces this via convention — every column added uses `PRAGMA table_info` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` — but the convention is paper-thin.

The second cost is multi-user: there is no concept of "another user's data". `user_profile` has a hard-coded `id = 'default'` (L30). If we ever needed multi-user-per-device, every query would need a `WHERE user_id = ?` rewrite — call it a week of mechanical work plus a migration.

A third cost: no triggers, no stored procedures, no constraints beyond primary key. All invariants are enforced in TypeScript — for example, "a session's exercises_json must parse to an `ExerciseEntry[]`" is only true because every writer goes through `insertSession`. There's no DB-level guard.

### Sub-block 2 — what cloud Postgres would have cost

If we'd put the database in the cloud, every read on the home screen would become an HTTPS call. At 200ms per call and 5–8 reads per render that's a full second of latency before the skill tree paints. The fix is a local cache, which means we'd still need most of `database.ts` — but now with an extra layer (server) and an extra failure mode (stale cache).

Operational cost: Supabase/Neon/RDS all start around \$20/month per environment, plus per-row egress past free tier. For a personal-use single-user app the cost is real and recurring.

Multi-user support, on the other hand, would have been free — every backend already understands "WHERE user_id = ?". For contrl's actual scope (single user, on-device), this is paying for a feature we don't need.

### Sub-block 3 — the breakpoint

Fine until **multi-device sync becomes a primary feature**. Two users on two phones editing the same session is the breakpoint. Under the current Supabase mirror (see [11-supabase-mirror-sync](./11-supabase-mirror-sync.md)), the model is local-wins on push + remote-wins on empty-DB restore — fine for single-user-on-two-devices in sequence, not concurrent multi-user. If the app added shared workout plans or trainer-shared programming, SQLite-as-truth would need a server-as-truth alternative.

### Sub-block 4 — what wasn't a tradeoff

Realm and WatermelonDB are the usual alternatives floated for "I want better DX than raw SQL". Neither was a real option because: (a) Expo's managed workflow makes Realm a pain (it requires native module config that fights the prebuild flow), and (b) the schema is so small (9 tables) that an ORM's value-add is minimal vs. its onboarding cost.

---

## Tech reference (industry pairing)

### expo-sqlite (WAL)

- **Codebase uses:** `expo-sqlite` opened via `SQLite.openDatabaseAsync('contrl.db')`. WAL mode set in `migrate()` L27.
- **Why it's here:** the embedded engine. If swapped out for AsyncStorage or MMKV, ACID transactions and queries disappear.
- **Leading today:** `expo-sqlite` — `adoption-leading`, 2026.
- **Why it leads:** ships with Expo SDK; minimal native config; async API matches the JS thread's non-blocking model.
- **Runner-up:** `op-sqlite` — `innovation-leading` JSI-binding alternative for bare React Native; sub-ms reads via direct JSI calls.

### Application-managed migrations

- **Codebase uses:** Hand-rolled `migrate()` function in `database.ts`. No external library.
- **Why it's here:** every Expo cold start needs to run migrations idempotently; an external library would add a dependency for a small task.
- **Leading today:** application-managed additive migrations — `adoption-leading` for SQLite on mobile, 2026.
- **Why it leads:** SQLite's `ALTER TABLE` is limited (no rename, no drop column pre-3.35) so external migration tools don't add much; idempotent SQL covers most needs.
- **Runner-up:** Drizzle + `drizzle-kit migrate` — `innovation-leading` for typed schema + versioned migrations; the alternative if schema complexity grows past ~15 tables.

---

## Summary

### Concept recap

contrl stores every piece of app state in a single SQLite file (`contrl.db`) opened once via `getDatabase()` in `src/services/database.ts`. Migrations run on every open, additively, using `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` introspection — there is no version table. WAL mode keeps reads non-blocking during writes. No ORM: SQL strings + hand-rolled row mappers. 9 tables total: 5 entity tables (exercises, sessions, gate_progress, week_progress, user_profile), plus drafts, sync_deletions (tombstone outbox), sync_state (push/pull watermarks), and `sync_meta` — per-table sync ledger written by `pushChanges()` after each upsert. The constraint that forced this was the latency budget (sub-ms reads on hot paths) and the requirement to work fully offline. The cost is that schema changes must remain additive forever and there's no DB-level invariant enforcement.

### Key points

- Lives in step 1 (Data model) of the system-design checklist.
- One connection, opened once, shared across the whole JS thread via a module singleton.
- WAL mode makes reads non-blocking during writes — critical when the UI thread is the only thread.
- Migrations are idempotent application logic: introspect schema, ALTER if column missing. No version table.
- `exercises_json` denormalization is a deliberate trade: one insert, one parse, no joins on the hot read path.
- Schema renames are effectively impossible — additive-only forever is the cost paid for the simplicity.

---

## Interview defense

### What an interviewer is really asking

Behind "why SQLite" is "do you understand storage tradeoffs, or did you pick the easy thing?" The signal is whether you can name what *kind* of database SQLite is (embedded, single-writer, ACID, no replication), what it isn't (multi-tenant, replicated, sharded), and which of those properties your app actually needed.

### Likely questions

**Q: Why no ORM?  [mid]**
A: The schema is small (9 tables) and the queries are simple. An ORM's value-add scales with query complexity and schema size — at this scale it would be all overhead and no win. The cost of raw SQL is `rowToX` mappers; the benefit is the SQL is right there in the code, no black-box behavior, no "what query did the ORM generate" debugging. If the schema grew past ~15 tables I'd reconsider Drizzle.

```
   With ORM                    Without ORM
   ┌───────────────┐           ┌───────────────┐
   │ Domain types  │           │ Domain types  │
   │   ▲           │           │   ▲           │
   │   │ generated │           │   │ hand-     │
   │   │           │           │   │ written   │
   │ Schema def    │           │ rowToX()      │
   │   │           │           │   ▲           │
   │   ▼           │           │   │           │
   │ Generated SQL │           │ Raw SQL       │
   └───────────────┘           └───────────────┘
```

**Q: You don't have a migration version table — what happens when a user skips three versions?  [senior]**
A: Migrations are idempotent. Every `CREATE TABLE` is `IF NOT EXISTS`; every `ALTER TABLE ADD COLUMN` is gated on `PRAGMA table_info`. A user who skips three versions runs the same migration block as a fresh install — every check that fires creates or alters; every check that doesn't no-ops. The risk is *renames* — they require a 4-step add-copy-deploy-drop dance, and the `DROP` step risks breaking the old binary if a user downgrades. We don't rename. The cost of that constraint is occasional column-name awkwardness; the benefit is the migration is robust across every install state.

```
   Versioned migration system          │   Idempotent additive
   ──────────────────────────────────  │   ──────────────────────────
   ┌────┐ ┌────┐ ┌────┐ ┌────┐         │   ┌────────────────────────┐
   │ v1 │→│ v2 │→│ v3 │→│ v4 │         │   │ migrate() — same code  │
   └────┘ └────┘ └────┘ └────┘         │   │ for every install      │
   table: schema_version                │   │ + IF NOT EXISTS guards │
   risk: skipped migration              │   └────────────────────────┘
                                         │   risk: schema must be
                                         │   additive-only forever
```

**Q: How does this scale to 1M users?  [arch]**
A: It doesn't. SQLite-as-source-of-truth assumes one device, one user. At 1M users you wouldn't put the database on each device-as-truth; you'd put it in a cloud DB with per-tenant rows. The local SQLite would become a *cache* of the cloud, and the conflict model would flip from "local wins" to "cloud wins, local is read cache". The migration would be concentrated in `src/services/sync/supabase-sync.ts` — that's the only file that encodes the push/pull policy. The rest of `database.ts` could stay structurally similar.

```
┌─ at 1M users ────────────────────────────────────────────┐
│  SQLite on device         ←─ now a cache                 │
│  cloud Postgres (per-tenant rows)  ←─ now source ←─ breaks first
│  sync engine inverted (cloud → local)                    │
└──────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: Why not put session data in AsyncStorage or MMKV — those are faster?**
A: They're faster for key-value reads but they're *not* a database. No indexes (can't `SELECT * WHERE category = ?`), no JSON queries, no transactions across multiple records, no `ORDER BY date DESC LIMIT 10`. The skill-tree paint requires `getExercisesByCategory(category, level)` — that's a query with two predicates and an order-by. AsyncStorage can't express it; MMKV can't express it. You'd end up loading the full set into memory and filtering in JS, which is fine at 100 exercises and broken at 10,000.

```
   SQLite                         vs   MMKV / AsyncStorage
   ──────────────────────────────     ──────────────────────────────
   WHERE category=? AND level=?       JSON.parse(full set) → .filter()
   ORDER BY date DESC LIMIT 10        JSON.parse(all sessions) → sort
   indexed scans                      O(N) linear in JS
   transactions across records        no transaction concept
```

### One-line anchors

- One file, one connection, one source of truth.
- Migrations are idempotent code, not versioned files.
- WAL is what makes the UI thread non-blocking.
- The denormalization (`exercises_json`) is the simplicity payment.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the table layout: 9 tables (including `sync_state` and `sync_meta`), which entities are "derived" (gate_progress, week_progress, user_profile.*_level), which is the "tombstone outbox" (sync_deletions), which is the "sync watermark" (sync_state), and which is the "per-table push ledger" (sync_meta). Then open and compare.

### Level 2 — Explain it out loud
Explain to a frontend engineer why this codebase doesn't use Prisma. Under 90 seconds.

Checkpoints:
- Did you name `database.ts` and the `migrate()` pattern?
- Did you say *why* (scale, complexity, debugging)?
- Did you name the tradeoff (mapper verbosity, no version table)?

### Level 3 — Apply it to a new scenario
"You're asked to add a `tags` field to exercises that's an arbitrary list of strings. How would you migrate the schema?"

Write your answer (3–5 sentences). Then open `src/services/database.ts` L118–L131 and check whether your answer matches the additive pattern.

### Level 4 — Defend the decision you'd change
"If you were starting today, would you still pick raw SQL over Drizzle?" Reference `src/services/database.ts` to support what exists, and what would change with Drizzle.

### Quick check — code reference test
- What file does the migration block live in?
- What pragma puts SQLite into non-blocking-reads mode?
- Approximately what line range is the column-addition migration logic?

Then open and verify.

---

_Updated: 2026-05-17 — Added sync_state as 8th table; replaced Notion-era functions (getUnsyncedSessions, upsertSessionFromNotion) with Supabase-era functions (getSyncState, setLastPushedAt, setLastPulledAt, recordTombstone, getPendingTombstones, clearTombstones, clearLocalForRestore); notion_page_id noted as dead schema; migration answer updated to reference supabase-sync.ts._
