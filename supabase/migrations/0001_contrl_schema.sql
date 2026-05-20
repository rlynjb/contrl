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
