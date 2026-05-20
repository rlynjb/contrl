# Contrl schema on reindb — design

**Date:** 2026-05-19
**Status:** Approved (pending implementation plan)
**Supersedes:** the standalone Supabase project for contrl described in `2026-05-17-supabase-mirror-sync-design.md`. Contrl's anon-key + URL + RLS-off model is unchanged; only the project and schema move.

## Goal

Move contrl's 5 mirror-sync tables off contrl's standalone Supabase project and onto **reindb** — the shared Supabase project that already hosts buffr's tables under a `buffr` schema. Contrl's tables land under a new `contrl` schema on the same project. One project, multiple apps, schema-isolated.

## Non-goals

- Re-enabling RLS on the contrl schema. Phase A (no RLS, single hardcoded `USER_ID`) is preserved — same posture as `buffr/supabase/migrations/0009_disable_rls_phase_a.sql`. Adding RLS is a separate future migration.
- Decommissioning the old standalone contrl Supabase project. It goes dormant; deletion is deferred to a follow-up.
- Backfilling existing remote data via `pg_dump`. Local SQLite has all 14 sessions / 58 exercises / 5 gate_progress / 5 week_progress / 1 user_profile. First push after cutover repopulates the new schema from local.
- Dropping the dead `notion_page_id` columns from local SQLite. They remain as dead schema (consistent with prior decision).
- Changing the contrl mirror sync mechanics (`pushChanges`, `pullRestoreIfFresh`, watermark, `clearLocalForRestore`, `restoreInProgress`, tombstones). All unchanged.

## Architecture

```
Before                                After
─────────────────────────────         ─────────────────────────────
contrl's Supabase project             reindb (shared project)
  public.sessions                       buffr.entries          ← unchanged
  public.exercises                      buffr.projects
  public.gate_progress                  buffr.vlogs
  public.week_progress                  ...
  public.user_profile
                                        contrl.sessions        ← new
reindb (shared project)                 contrl.exercises
  buffr.entries                         contrl.gate_progress
  buffr.projects                        contrl.week_progress
  ...                                   contrl.user_profile

                                      (contrl's standalone project
                                       sits dormant in dashboard)
```

The contrl app's bundle and sync engine remain identical in behavior. Only the connection target changes: a different Supabase URL + anon key, and an additional `db: { schema: 'contrl' }` option on the JS client so every `supabase.from('sessions')` call resolves to `contrl.sessions` automatically.

## Per-app migrations decision

Each app owns its schema DDL. Contrl gets its own `supabase/migrations/` folder linked to reindb. The Supabase CLI's `schema_migrations` tracker keys on filename + hash, so contrl's `0001_contrl_schema.sql` and buffr's existing `0001_initial_schema.sql` are distinct rows with no collision.

**Why per-app over shared:**

- Ownership matches the code: contrl PRs land in contrl's repo.
- Scales: a third app added to reindb later gets its own migrations folder without a central bottleneck.
- Failure isolation: a bad contrl migration doesn't pollute buffr's migration history.

**Filename hygiene:** contrl prefixes its migration files with the app name to make the per-app boundary visible at-a-glance — `0001_contrl_schema.sql`, `0002_contrl_<thing>.sql`, etc. Buffr's existing files don't change.

## Data flow

```
Client (contrl app on phone)
        │
        │  EXPO_PUBLIC_SUPABASE_URL = <reindb URL>
        │  EXPO_PUBLIC_SUPABASE_ANON_KEY = <reindb anon key>
        │  createClient(url, key, { db: { schema: 'contrl' }, … })
        ▼
PostgREST (reindb)
        │
        │  Exposed schemas: public, buffr, contrl
        │  Resolves supabase.from('sessions') against schema 'contrl'
        ▼
contrl.sessions, contrl.exercises, contrl.gate_progress,
contrl.week_progress, contrl.user_profile
```

The contrl app never touches buffr tables; the buffr app never touches contrl tables. Isolation is by **client-side schema convention**, not by RLS. Same posture buffr has today.

## Migration content — `contrl/supabase/migrations/0001_contrl_schema.sql`

The migration mirrors the shape of `buffr/supabase/migrations/0010_namespace_to_buffr_schema.sql` and the original `contrl/supabase/schema.sql` (which gets retired). Concretely:

```sql
-- Contrl mirror-sync schema on reindb.
-- Hosts contrl alongside buffr under separate schemas in one Supabase project.
-- See docs/superpowers/specs/2026-05-19-contrl-schema-on-reindb-design.md
--
-- AFTER APPLYING THIS MIGRATION, two out-of-band steps are required:
--   1. Supabase dashboard for reindb → Settings → API → "Exposed schemas"
--      → add `contrl` to the list (next to `public`, `buffr`).
--   2. Update contrl/.env and contrl/src/services/sync/client.ts per
--      the cutover plan.

BEGIN;

CREATE SCHEMA IF NOT EXISTS contrl;

GRANT USAGE ON SCHEMA contrl TO anon, authenticated, service_role;

-- Default privileges for any FUTURE tables created inside `contrl`.
ALTER DEFAULT PRIVILEGES IN SCHEMA contrl
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS contrl.user_profile (
  user_id      uuid PRIMARY KEY,
  push_level   int NOT NULL,
  pull_level   int NOT NULL,
  squat_level  int NOT NULL,
  created_at   timestamptz,
  updated_at   timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS contrl.exercises (
  user_id       uuid NOT NULL,
  id            text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,
  level         int  NOT NULL,
  target_sets   int  NOT NULL,
  target_reps   int  NOT NULL,
  sort_order    int  NOT NULL DEFAULT 0,
  tempo         text,
  notes         text,
  updated_at    timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS contrl.sessions (
  user_id         uuid NOT NULL,
  id              text NOT NULL,
  date            timestamptz NOT NULL,
  level           int  NOT NULL,
  category        text NOT NULL,
  exercises_json  jsonb NOT NULL,
  notes           text,
  passed          boolean,
  updated_at      timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS contrl.gate_progress (
  user_id            uuid NOT NULL,
  id                 text NOT NULL,
  level              int  NOT NULL,
  category           text NOT NULL,
  status             text NOT NULL,
  consecutive_passes int  NOT NULL DEFAULT 0,
  last_session_date  timestamptz,
  updated_at         timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS contrl.week_progress (
  user_id     uuid NOT NULL,
  week_start  date NOT NULL,
  push_done   boolean NOT NULL DEFAULT false,
  pull_done   boolean NOT NULL DEFAULT false,
  squat_done  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, week_start)
);

-- RLS deliberately not enabled. Phase A model: single hardcoded USER_ID,
-- anon-key access only. Adding RLS is a future migration.

COMMIT;
```

## App-side changes

**File: `contrl/.env` (gitignored)**

Swap two lines:

```
EXPO_PUBLIC_SUPABASE_URL=<reindb URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<reindb anon key>
```

No new env vars. `EXPO_PUBLIC_USER_ID` stays unset (defaults to `00000000-0000-0000-0000-000000000001` per `src/services/sync/config.ts`).

**File: `contrl/.env.example`** — update the comment header to reference reindb rather than a contrl-specific Supabase project.

**File: `contrl/src/services/sync/client.ts`** — one option added to `createClient`:

```ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'contrl',
  },
});
```

With `db.schema = 'contrl'` in the client options, every `supabase.from('sessions')` / `supabase.from('exercises')` / etc. in `src/services/sync/supabase-sync.ts` automatically resolves to `contrl.sessions` / `contrl.exercises`. **No changes needed in `supabase-sync.ts` or `mapper.ts`.**

**File: `contrl/supabase/schema.sql`** — delete. The canonical schema source lives in the new migrations folder. Git history preserves it.

## Cutover sequence

1. **Write migration file** at `contrl/supabase/migrations/0001_contrl_schema.sql` with the SQL above.
2. **Link contrl's repo to reindb** via Supabase CLI:
   ```bash
   cd /Users/rein/Public/contrl
   supabase link --project-ref <reindb project ref>
   ```
   (Project ref pulled from buffr's existing link or the reindb dashboard URL.)
3. **Apply migration:**
   ```bash
   supabase db push
   ```
   Should report `0001_contrl_schema.sql` applied successfully.
4. **Dashboard step (one-time, manual):** reindb → Settings → API → Exposed schemas → add `contrl`. Save. PostgREST reloads within ~30s.
5. **Update `contrl/.env`** with reindb's URL + anon key.
6. **Update `contrl/src/services/sync/client.ts`** with `db: { schema: 'contrl' }`.
7. **Delete `contrl/supabase/schema.sql`** (the old standalone-project schema).
8. **Restart Metro** with `npx expo start --dev-client --clear`. The env vars get re-inlined into the bundle.
9. **Reset the push watermark on the phone.** Local SQLite stays put — we want to keep the 14 sessions / 58 exercises / 5 gate_progress / 5 week_progress / 1 user_profile and push them all to the new project. But `last_pushed_at` is currently set to a recent timestamp (from when we last pushed to the old project), which means `pushChanges()` would filter ALL rows out (`updated_at <= since`) and the new project would stay empty. Clearing the watermark to NULL forces the next push to treat every row as dirty.

    ```bash
    # Pull the db, NULL out last_pushed_at, push back.
    adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > /tmp/contrl-reset.db
    sqlite3 /tmp/contrl-reset.db "UPDATE sync_state SET last_pushed_at = NULL WHERE id = 'default'"
    adb push /tmp/contrl-reset.db /sdcard/Download/contrl-reset.db
    adb shell "cat /sdcard/Download/contrl-reset.db | run-as com.rein.contrl tee files/SQLite/contrl.db > /dev/null"
    adb shell rm /sdcard/Download/contrl-reset.db
    rm /tmp/contrl-reset.db
    ```

    Why not `pm clear`: that wipes local SQLite entirely. The new project's `contrl` schema is empty at cutover, so `pullRestoreIfFresh` after a clear would restore *nothing* and the workout history would be gone. The watermark-reset path preserves local data and uses the existing push mechanism to repopulate the new project.

10. **Force-stop and reopen the app.** The next push fires with `since = NULL`; every local row matches the filter; all 14 sessions / 58 exercises / gate / week / user_profile rows upsert into `contrl.*` on reindb. Watermark advances to "now".

    ```bash
    adb shell am force-stop com.rein.contrl
    adb shell am start -n com.rein.contrl/.MainActivity
    ```

11. **Verify** per the acceptance plan below.

Nothing in this sequence destroys local data. The only "destructive" action is on the new project (which starts empty by definition). The old contrl Supabase project is untouched.

## Acceptance criteria

1. **Migration applied.** reindb dashboard → Table Editor → `contrl` schema is selectable in the schema dropdown → 5 tables visible.
2. **Schema exposed.** `curl <reindb-url>/rest/v1/sessions?select=*&schema=contrl` (or the dashboard "Test API" view) returns `[]` rather than `{"code":"PGRST106","message":"schema not exposed"}`.
3. **Live push.** Log a workout in the app → row appears in `contrl.sessions` within a few seconds.
4. **Restore.** After the cutover push completes (step 10 of the sequence), the new project holds the full set of local rows. Verify by checking reindb dashboard: `contrl.sessions` has 14 rows, `contrl.exercises` has 58, `contrl.gate_progress` and `contrl.week_progress` have 5 each, `contrl.user_profile` has 1. Then `adb shell pm clear com.rein.contrl` → reopen → all rows restored from reindb's `contrl.*` via `pullRestoreIfFresh`.
5. **Buffr unaffected.** Open buffr app on the same phone → it still talks to `buffr.*` only; no cross-contamination.
6. **Old project untouched.** Contrl's standalone Supabase project shows no new activity after cutover (free-tier auto-pause kicks in within hours).

## Risks

- **Forgetting the "Exposed schemas" dashboard step.** Without it, every contrl query fails `PGRST106 schema not exposed`. Mitigation: this is step 4 of cutover, explicit and named.
- **Anon-key coupling.** Contrl and buffr now share one anon key. Rotating buffr's key breaks contrl. Acceptable for a single-developer setup; would matter with multiple teams.
- **Cutover race.** If the contrl app is open during step 5 (.env swap), in-flight pushes might target the old project for a few seconds. Step 9 (`pm clear`) and the Metro restart in step 8 make this trivially recoverable.
- **Supabase CLI migration tracker.** If `supabase db push` is run against reindb from both contrl's and buffr's repos at different times, both repos' `schema_migrations` rows live in the same `supabase_migrations.schema_migrations` table. Filenames differ (`0001_contrl_schema.sql` vs `0001_initial_schema.sql`), so the tracker keeps them distinct. Risk surfaces only if a filename collision is introduced later; this is a process-hygiene concern, not a technical blocker.
- **Local-only state at cutover.** Anything in local SQLite that was never pushed to the old contrl Supabase remains local-only after cutover (it'll push to the new schema on next sync trigger). No data loss; just a reminder that "the cloud" identity changes.

## Out of scope

- Deleting the old standalone contrl Supabase project. Scheduled for a follow-up once the cutover has burned in.
- Re-enabling RLS on the contrl schema (Phase B).
- Migrating dead `notion_page_id` columns out of local SQLite.
- Adding a feature flag to swap providers at runtime (single project for life is fine).
- Setting up CI to auto-apply contrl migrations to reindb (manual `supabase db push` per migration is fine at this scale).
