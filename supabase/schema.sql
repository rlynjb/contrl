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

alter table public.user_profile  enable row level security;
alter table public.exercises     enable row level security;
alter table public.sessions      enable row level security;
alter table public.gate_progress enable row level security;
alter table public.week_progress enable row level security;

-- Helper: read user_id from JWT claims.
create or replace function public.jwt_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'user_id', '')::uuid
$$;

create policy "user_isolation" on public.user_profile
  for all using (user_id = public.jwt_user_id())
  with check (user_id = public.jwt_user_id());

create policy "user_isolation" on public.exercises
  for all using (user_id = public.jwt_user_id())
  with check (user_id = public.jwt_user_id());

create policy "user_isolation" on public.sessions
  for all using (user_id = public.jwt_user_id())
  with check (user_id = public.jwt_user_id());

create policy "user_isolation" on public.gate_progress
  for all using (user_id = public.jwt_user_id())
  with check (user_id = public.jwt_user_id());

create policy "user_isolation" on public.week_progress
  for all using (user_id = public.jwt_user_id())
  with check (user_id = public.jwt_user_id());
