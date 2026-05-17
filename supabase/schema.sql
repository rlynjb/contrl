-- Supabase schema for contrl mirror sync.
-- Run this once in the Supabase SQL Editor for a fresh project.

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.user_profile (
  user_id uuid not null,
  push_level int not null default 1,
  pull_level int not null default 1,
  squat_level int not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id)
);

create table if not exists public.exercises (
  user_id uuid not null,
  id text not null,
  name text not null,
  category text not null,
  level int not null,
  target_sets int not null,
  target_reps int not null,
  sort_order int not null default 0,
  tempo text,
  notes text,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.sessions (
  user_id uuid not null,
  id text not null,
  date timestamptz not null,
  level int not null,
  category text not null,
  exercises_json jsonb not null,
  notes text,
  passed boolean,
  created_at timestamptz,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.gate_progress (
  user_id uuid not null,
  id text not null,
  level int not null,
  category text not null,
  status text not null,
  consecutive_passes int not null default 0,
  last_session_date timestamptz,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.week_progress (
  user_id uuid not null,
  week_start date not null,
  push_done boolean not null default false,
  pull_done boolean not null default false,
  squat_done boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, week_start)
);

-- ── RLS ─────────────────────────────────────────────────────
-- MVP: RLS is OFF. Anyone with the project URL + anon key has full
-- read/write to these tables. Acceptable for a single-user backup
-- where the anon key lives in the user's own APK. Add proper auth
-- + RLS before sharing the project URL beyond yourself.

alter table public.user_profile  disable row level security;
alter table public.exercises     disable row level security;
alter table public.sessions      disable row level security;
alter table public.gate_progress disable row level security;
alter table public.week_progress disable row level security;
