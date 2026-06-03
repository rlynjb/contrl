# Study — Data Modeling (contrl)

Does the shape of contrl's persistent data match how the app actually
reads and writes it — and can it stay correct as the schema evolves?
That's the whole question this guide answers, walked over 7 concepts
anchored in real files.

The data model is the most expensive thing to get wrong in a shipping
app. Code is cheap to change; a schema with live data in it is not.
Every migration in `src/services/database.ts` is the change-amplification
symptom made physical.

═════════════════════════════════════════════════
THE TWO PARTITION SEAMS — what this guide is NOT
═════════════════════════════════════════════════

Two seams keep this guide honest. Cross-link rather than re-teach.

```
  ┌─ study-data-modeling ─────────────────────────────────────┐
  │  the SHAPE of persistent data in this repo                 │ ← here
  │  schema, normalization, indexes, queries, integrity        │
  └─────────────────────┬──────────────────────────────────────┘
                        │  seam 1 — architecture vs shape
  ┌─ study-system-design ▼────────────────────────────────────┐
  │  WHICH datastore (SQLite + Supabase), how the two layers   │
  │  sync, when push fires. Not the schema shape itself.       │
  └────────────────────────────────────────────────────────────┘
                        │  seam 2 — disk shape vs memory shape
  ┌─ study-dsa-foundations ▼──────────────────────────────────┐
  │  in-memory data structures (heaps, BSTs). A B-tree index   │
  │  on disk is data modeling; a heap in RAM is DSA.           │
  └────────────────────────────────────────────────────────────┘
```

  → **Against system-design:** "use Postgres, mirror to Supabase, push
    on a watermark" is architecture → study-system-design. "the
    `sessions` table stores exercises as a JSON blob" is shape → here.
  → **Against DSA:** "we use a Map in `gateProgress` keyed by
    `category:level`" is in-memory → DSA. "the `gate_progress` table
    uses `category:level` as its primary key" is on-disk → here.
  → **Against software-design:** normalization IS information-hiding for
    data. Single source of truth, no fact stored twice. The snake_case
    ↔ camelCase leak in this repo (database.ts ↔ types/index.ts ↔
    sync/mapper.ts) is the same problem from the code side. We point
    at it here; the deep walk lives in `study-software-design`.

═════════════════════════════════════════════════
THE SCHEMA AS-BUILT — one diagram, all 9 tables
═════════════════════════════════════════════════

The whole persistent store of contrl in one frame. This is the picture
every concept file refers back to.

```
  contrl.db  —  SQLite, WAL journal mode

  ┌─ user_profile ───────────────────┐
  │ id                  TEXT PK ='default'  ← single-tenant: one row
  │ push_level          INTEGER             ← derived from sessions
  │ pull_level          INTEGER             ← (could be recomputed)
  │ squat_level         INTEGER
  │ created_at          TEXT NOT NULL
  │ notion_page_id      TEXT                ← dead schema (Notion)
  │ updated_at          TEXT NOT NULL
  └──────────────────────────────────┘

  ┌─ exercises ──────────────────────┐    ┌─ idx_exercises_category ─┐
  │ id                  TEXT PK      │◄───┤ idx_exercises_level      │
  │ name                TEXT NOT NULL│    │ idx_exercises_notion     │
  │ category            TEXT NOT NULL│    └──────────────────────────┘
  │ level               INTEGER NN   │   reference data, seeded from
  │ target_sets         INTEGER NN   │   src/data/exercises-seed.json
  │ target_reps         INTEGER NN   │
  │ sort_order          INTEGER = 0  │
  │ tempo               TEXT         │  ← added via ALTER
  │ notes               TEXT         │  ← added via ALTER
  │ notion_page_id      TEXT         │  ← dead schema
  │ updated_at          TEXT NOT NULL│
  └──────────────────────────────────┘

  ┌─ sessions ───────────────────────┐    ┌─ idx_sessions_date ──────┐
  │ id                  TEXT PK      │◄───┤ idx_sessions_category    │
  │ date                TEXT NOT NULL│    │ idx_sessions_notion      │
  │ level               INTEGER NN   │    │ idx_sessions_updated     │
  │ category            TEXT NOT NULL│    └──────────────────────────┘
  │ exercises_json      TEXT NOT NULL│  ← denormalized blob
  │ notes               TEXT         │     (ExerciseEntry[] as JSON)
  │ passed              INTEGER      │  ← added via ALTER
  │ created_at          TEXT         │  ← added via ALTER
  │ notion_page_id      TEXT         │
  │ updated_at          TEXT NOT NULL│
  └──────────────────────────────────┘

  ┌─ gate_progress ──────────────────┐
  │ id                  TEXT PK      │  ← composite encoded as
  │ level               INTEGER NN   │    "{category}:{level}"
  │ category            TEXT NOT NULL│    e.g. "push:3"
  │ status              TEXT NOT NULL│    'locked'|'in-progress'|'passed'
  │ consecutive_passes  INTEGER = 0  │
  │ last_session_date   TEXT         │
  │ notion_page_id      TEXT         │
  │ updated_at          TEXT NOT NULL│
  └──────────────────────────────────┘

  ┌─ week_progress ──────────────────┐
  │ week_start          TEXT PK      │  ← Monday YYYY-MM-DD
  │ push_done           INTEGER = 0  │  ← per-category boolean
  │ pull_done           INTEGER = 0  │
  │ squat_done          INTEGER = 0  │
  │ notion_page_id      TEXT         │
  │ updated_at          TEXT NOT NULL│
  └──────────────────────────────────┘

  ┌─ drafts ─────────────────────────┐    ┌─ sync_state ─────────────┐
  │ id                  TEXT PK      │    │ id  TEXT PK = 'default'  │
  │ category            TEXT NOT NULL│    │ last_pushed_at  TEXT     │
  │ level               INTEGER NN   │    │ last_pulled_at  TEXT     │
  │ exercises_json      TEXT         │    └──────────────────────────┘
  │ notes               TEXT         │
  │ saved_at            TEXT NOT NULL│    ┌─ sync_meta ──────────────┐
  └──────────────────────────────────┘    │ table_name      TEXT PK  │
                                          │ last_synced_at  TEXT     │
  ┌─ sync_deletions ─────────────────┐    └──────────────────────────┘
  │ id  INTEGER PK AUTOINCREMENT     │
  │ entity_type    TEXT NOT NULL     │   tombstones for cloud delete
  │ entity_id      TEXT NOT NULL     │   propagation
  │ notion_page_id TEXT              │
  │ deleted_at     TEXT NOT NULL     │
  └──────────────────────────────────┘
```

Nine tables. Four hold user-meaningful data (`user_profile`,
`exercises`, `sessions`, `gate_progress`). One holds derived weekly
state (`week_progress`). One holds autosaved drafts. Three are
sync plumbing (`sync_state`, `sync_meta`, `sync_deletions`).

No foreign keys anywhere. Every `user_id`-ish reference is implicit
(this is a single-user app, USER_ID is a hardcoded constant in
`src/services/sync/config.ts`). All invariants are enforced by app
code, not the database.

═════════════════════════════════════════════════
READING ORDER
═════════════════════════════════════════════════

The 7 files build on each other. Read them in this order:

```
  01 → the data model and its shape
        the 9 tables, what each holds, where the relationships are
        (and aren't). Re-draws the diagram above, then walks it.

  02 → normalization and duplication
        why exercises_json is a TEXT blob instead of a join.
        the snake_case/camelCase leak that pays a cost on every
        read and write.

  03 → indexing vs query patterns
        the 9 indexes that exist. the hot queries that hit them.
        the queries that don't, and why it doesn't matter — yet.

  04 → transactions and integrity
        the missing FKs, the missing CHECKs, the multi-write
        operation in logSession() that has no transaction wrapping
        its 6 awaits.

  05 → migrations and evolution
        the 87-line migrate() function. additive ALTERs.
        the Sunday→Monday week-key one-shot temporal logic.
        the table rebuild for the NOT NULL drop.

  06 → access patterns and storage choice
        does SQLite + JSON-blob + a cloud mirror fit the actual
        read/write shape? a verdict, not a tour.

  07 → data-modeling red flags audit
        consolidated checklist scored against this repo.
        worst-first ranking with the concrete consequence.
```

═════════════════════════════════════════════════
CROSS-LINKS
═════════════════════════════════════════════════

  → **study-database-systems** — engine internals. Why WAL mode
    helps concurrent reads. How SQLite uses the indexes from file 03
    in its query planner. What `PRAGMA journal_mode = WAL` actually
    buys.
  → **study-software-design** — the snake_case/camelCase leak (file 02
    here) is the data-side analog of the information-hiding violation
    that guide flags from the code side.
  → **study-distributed-systems** — once `sessions` is mirrored to
    Supabase, the consistency story shifts. The lack of FKs becomes
    the lack of cross-shard guarantees. Watermark-based push is one
    of the patterns walked there.
  → **study-system-design** — the SQLite-primary + Supabase-mirror
    architecture is the system-design story. The schema is shared
    between the two stores; this guide is about the schema itself.

═════════════════════════════════════════════════
THE VERDICT UP FRONT
═════════════════════════════════════════════════

The schema is correct for what contrl is *today* — single-user,
local-first, MVP-stage. The shape matches the access pattern. The
denormalization of `exercises_json` into the session row is a
deliberate read optimization that pays off at every history scroll.

The schema is *not* ready for multi-user. Three things break it the
moment a second user lands:

  1. No `user_id` column on most tables. The Supabase mirror has one;
     the local SQLite does not. Adding it is an additive migration;
     using it correctly is a refactor.
  2. No foreign keys. Today the app code is the only writer, so the
     invariants hold. The day a second writer touches the same DB
     (sync conflict resolution, an admin script), referential
     integrity is on hope.
  3. No multi-write transaction on `logSession()`. Six sequential
     awaits, no `BEGIN`/`COMMIT`. Today a crash mid-write produces
     ugly state; under sync contention it produces inconsistent
     state.

The capstone (file 07) ranks these. Read it last.
