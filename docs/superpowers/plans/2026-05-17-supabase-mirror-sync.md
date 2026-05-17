# Supabase Mirror Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase as a write-mostly remote mirror behind local-first SQLite, with pull-restore on fresh install.

**Architecture:** Single hardcoded `USER_ID` for MVP. Custom JWT with `user_id` claim, signed by the project JWT secret, attached to every Supabase request. RLS enforces isolation server-side via `request.jwt.claims`. Push uses an `updated_at > last_pushed_at` watermark; tombstones live in the existing `sync_deletions` table. Pull runs only on fresh install (empty sessions). Live trigger fires after every local write; app-open trigger runs once after DB ready.

**Tech Stack:** React Native + Expo, expo-sqlite, `@supabase/supabase-js`, `react-native-url-polyfill`, Supabase Postgres + RLS.

**Testing approach:** This project has no test infrastructure (no Jest, no test deps). Setting one up just for this feature is out of scope. Verification is by integration check: run the app on the connected phone, log/delete sessions, inspect the Supabase dashboard, query the local DB via `adb shell run-as com.rein.contrl sqlite3 ...`. Each task ends with a concrete "Verify" step.

**Spec:** [`docs/superpowers/specs/2026-05-17-supabase-mirror-sync-design.md`](../specs/2026-05-17-supabase-mirror-sync-design.md)

---

## Prerequisites (manual, before Task 1)

The user must, outside this plan:

1. Sign up at https://supabase.com if not already, create a new project (suggested name `contrl`, region nearest to them). Wait for provisioning (~2 min).
2. From the new project's **Settings → API**, copy:
   - **Project URL** (e.g., `https://xxxxxxxx.supabase.co`)
   - **anon public key**
   - **JWT Secret** (under "JWT Settings")
3. Choose a fixed UUID to be the app's `USER_ID`. Generate one in a terminal: `uuidgen | tr A-Z a-z`. Save it.

These three values + the UUID are provided to the implementer before Task 2.

---

## File Structure

**New files:**
- `src/services/sync/config.ts` — reads Supabase config from `expo-constants`
- `src/services/sync/client.ts` — single `supabase` client instance
- `src/services/sync/mapper.ts` — pure functions converting local rows ↔ remote rows
- `src/services/sync/supabase-sync.ts` — `pushChanges()`, `pullRestoreIfFresh()`
- `src/services/sync/index.ts` — re-exports
- `supabase/schema.sql` — table DDL + RLS policies (run once via dashboard SQL editor)
- `scripts/generate-jwt.mjs` — one-off helper to mint the hardcoded JWT

**Files modified:**
- `package.json` — add `@supabase/supabase-js`, `react-native-url-polyfill`
- `app.json` — add `expo.extra.supabase.{url, anonKey, authToken}` and `expo.extra.userId`
- `src/services/database.ts` — `sync_state` table in migrations; tombstone wrapper around deletes; non-blocking `pushChanges()` calls at end of writes
- `app/_layout.tsx` — call `pullRestoreIfFresh().then(pushChanges)` once after DB is ready

---

## Task 1: Create Supabase schema + RLS policies

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write the schema file**

Create `supabase/schema.sql` with the following content:

```sql
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
```

- [ ] **Step 2: Run the schema in Supabase**

Open the Supabase dashboard for the new project → **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.

- [ ] **Step 3: Verify tables and RLS**

In the dashboard → **Table Editor**: confirm `user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress` all exist. Click each → RLS toggle is **on**. Open **Authentication → Policies** and confirm `user_isolation` policy is listed for each.

- [ ] **Step 4: Commit the schema file**

```bash
git add supabase/schema.sql
git commit -m "feat(sync): supabase schema and RLS policies"
```

---

## Task 2: Mint the hardcoded JWT

**Files:**
- Create: `scripts/generate-jwt.mjs`

- [ ] **Step 1: Write the JWT generation script**

Create `scripts/generate-jwt.mjs`:

```js
// One-off: mint the hardcoded JWT for the app to use as its bearer token.
// Usage:
//   JWT_SECRET=<your supabase jwt secret> USER_ID=<your uuid> node scripts/generate-jwt.mjs
//
// Copy the output into app.json under expo.extra.supabase.authToken.

import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET;
const userId = process.env.USER_ID;
if (!secret || !userId) {
  console.error('Set JWT_SECRET and USER_ID env vars.');
  process.exit(1);
}

const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  role: 'authenticated',
  user_id: userId,
  iat: now,
  // 50 years; effectively non-expiring for MVP.
  exp: now + 60 * 60 * 24 * 365 * 50,
};

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const signature = crypto
  .createHmac('sha256', secret)
  .update(signingInput)
  .digest('base64')
  .replace(/=+$/, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

console.log(`${signingInput}.${signature}`);
```

- [ ] **Step 2: Run it**

```bash
JWT_SECRET='<paste from Supabase dashboard>' USER_ID='<your chosen uuid>' node scripts/generate-jwt.mjs
```

Expected: a long string starting `eyJ...` printed to stdout. Save it for Task 3.

- [ ] **Step 3: Commit the script**

```bash
git add scripts/generate-jwt.mjs
git commit -m "feat(sync): jwt minting helper script"
```

---

## Task 3: Add Supabase config to app.json and config module

**Files:**
- Modify: `app.json` (the `expo.extra` block)
- Create: `src/services/sync/config.ts`

- [ ] **Step 1: Add the config block to `app.json`**

In `app.json`, inside `"expo": { "extra": { ... } }`, add (alongside the existing `router` and `eas` entries):

```json
"supabase": {
  "url": "<your Supabase project URL>",
  "anonKey": "<your anon public key>",
  "authToken": "<the JWT from Task 2>"
},
"userId": "<your chosen uuid>"
```

- [ ] **Step 2: Write the config module**

Create `src/services/sync/config.ts`:

```ts
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};
const supabase = (extra.supabase ?? {}) as {
  url?: string;
  anonKey?: string;
  authToken?: string;
};

export const SUPABASE_URL = supabase.url ?? '';
export const SUPABASE_ANON_KEY = supabase.anonKey ?? '';
export const SUPABASE_AUTH_TOKEN = supabase.authToken ?? '';
export const USER_ID = (extra.userId ?? '') as string;

export function isSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_AUTH_TOKEN && USER_ID);
}
```

- [ ] **Step 3: Verify config is reachable from the app**

Add a one-line `console.log('[sync] configured:', isSyncConfigured())` temporarily inside `app/_layout.tsx`'s `useEffect` that runs once. Reload the app. In Metro logs:

```bash
adb logcat -d -v brief | grep -E "ReactNativeJS.*sync"
```

Expected: `LOG  [sync] configured: true`. Remove the temporary `console.log` after.

- [ ] **Step 4: Commit**

```bash
git add app.json src/services/sync/config.ts
git commit -m "feat(sync): supabase config wired through expo extras"
```

---

## Task 4: Add the Supabase client singleton + dependencies

**Files:**
- Modify: `package.json` (deps)
- Create: `src/services/sync/client.ts`

- [ ] **Step 1: Install the dependencies**

```bash
npx expo install @supabase/supabase-js react-native-url-polyfill
```

Expected: both packages added to `package.json` dependencies block.

- [ ] **Step 2: Write the client module**

Create `src/services/sync/client.ts`:

```ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_AUTH_TOKEN } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_AUTH_TOKEN}`,
    },
  },
});
```

- [ ] **Step 3: Smoke-test the client**

Temporarily add to `app/_layout.tsx` `useEffect` (after the DB-ready check):

```ts
import { supabase } from '../src/services/sync/client';
// ...
supabase.from('sessions').select('id', { count: 'exact', head: true })
  .then(r => console.log('[sync] ping:', r.status, r.error?.message ?? 'ok'));
```

Reload the app. Check logcat:

```bash
adb logcat -d -v brief | grep -E "ReactNativeJS.*sync"
```

Expected: `LOG  [sync] ping: 200 ok`. If you see `401`, the JWT is wrong. If you see `406` or `404`, the URL is wrong. Fix and re-run before continuing. Remove the temp code after.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/services/sync/client.ts
git commit -m "feat(sync): supabase client singleton with custom JWT auth"
```

---

## Task 5: Add `sync_state` table + helpers in database.ts

**Files:**
- Modify: `src/services/database.ts`

- [ ] **Step 1: Add the table to migrations**

In `src/services/database.ts`, find the big `database.execAsync` block inside `migrate()` (the one with all the `CREATE TABLE IF NOT EXISTS` statements). Add this table at the end of that block, after the `sync_deletions` table:

```sql
CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_pushed_at TEXT,
  last_pulled_at TEXT
);
```

Right after the `execAsync` returns, seed the row if absent:

```ts
await database.runAsync(
  `INSERT OR IGNORE INTO sync_state (id, last_pushed_at, last_pulled_at) VALUES ('default', NULL, NULL)`
);
```

Place this seed call alongside the existing user_profile seed.

- [ ] **Step 2: Add exported accessor functions**

At the bottom of `src/services/database.ts`, append:

```ts
// ── Sync state ──────────────────────────────────────────────

export async function getSyncState(): Promise<{ lastPushedAt: string | null; lastPulledAt: string | null }> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{ last_pushed_at: string | null; last_pulled_at: string | null }>(
    `SELECT last_pushed_at, last_pulled_at FROM sync_state WHERE id = 'default'`
  );
  return {
    lastPushedAt: row?.last_pushed_at ?? null,
    lastPulledAt: row?.last_pulled_at ?? null,
  };
}

export async function setLastPushedAt(at: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(`UPDATE sync_state SET last_pushed_at = ? WHERE id = 'default'`, [at]);
}

export async function setLastPulledAt(at: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(`UPDATE sync_state SET last_pulled_at = ? WHERE id = 'default'`, [at]);
}
```

- [ ] **Step 3: Verify the table exists on the phone**

Reload the app on the phone, then:

```bash
adb shell run-as com.rein.contrl sh -c 'cd files/SQLite && cat contrl.db' | sqlite3 :memory: ".tables"
```

(That won't quite work because of the pipe — instead, use:)

```bash
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > /tmp/contrl-check.db
sqlite3 /tmp/contrl-check.db "SELECT name FROM sqlite_master WHERE type='table'"
sqlite3 /tmp/contrl-check.db "SELECT * FROM sync_state"
rm /tmp/contrl-check.db
```

Expected: `sync_state` in the table list and one row `default|||`.

- [ ] **Step 4: Commit**

```bash
git add src/services/database.ts
git commit -m "feat(sync): sync_state table and accessors"
```

---

## Task 6: Write the row mapper

**Files:**
- Create: `src/services/sync/mapper.ts`

- [ ] **Step 1: Write the mapper module**

Create `src/services/sync/mapper.ts`:

```ts
import type {
  WorkoutSession,
  Exercise,
  GateProgress,
  WeekProgress,
  User,
  ExerciseEntry,
} from '@/types';
import { USER_ID } from './config';

// ── Sessions ────────────────────────────────────────────────

export function sessionToRemote(s: WorkoutSession) {
  return {
    user_id: USER_ID,
    id: s.id,
    date: s.date,
    level: s.level,
    category: s.category,
    exercises_json: s.exercises,
    notes: s.notes ?? null,
    passed: s.passed ?? null,
    created_at: s.createdAt ?? null,
    updated_at: s.updatedAt ?? new Date().toISOString(),
  };
}

export function sessionFromRemote(r: any): WorkoutSession {
  return {
    id: r.id,
    date: r.date,
    level: r.level,
    category: r.category,
    exercises: r.exercises_json as ExerciseEntry[],
    notes: r.notes ?? undefined,
    passed: r.passed ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null, // dead column, not synced
  };
}

// ── Exercises ───────────────────────────────────────────────

export function exerciseToRemote(e: Exercise) {
  return {
    user_id: USER_ID,
    id: e.id,
    name: e.name,
    category: e.category,
    level: e.level,
    target_sets: e.targetSets,
    target_reps: e.targetReps,
    sort_order: e.sortOrder ?? 0,
    tempo: e.tempo ?? null,
    notes: e.notes ?? null,
    updated_at: e.updatedAt ?? new Date().toISOString(),
  };
}

export function exerciseFromRemote(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    level: r.level,
    targetSets: r.target_sets,
    targetReps: r.target_reps,
    sortOrder: r.sort_order ?? 0,
    tempo: r.tempo ?? undefined,
    notes: r.notes ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── Gate progress ───────────────────────────────────────────

export function gateToRemote(g: GateProgress) {
  return {
    user_id: USER_ID,
    id: `${g.category}:${g.level}`,
    level: g.level,
    category: g.category,
    status: g.status,
    consecutive_passes: g.consecutivePasses,
    last_session_date: g.lastSessionDate ?? null,
    updated_at: g.updatedAt ?? new Date().toISOString(),
  };
}

export function gateFromRemote(r: any): GateProgress {
  return {
    level: r.level,
    category: r.category,
    status: r.status,
    consecutivePasses: r.consecutive_passes,
    lastSessionDate: r.last_session_date ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── Week progress ───────────────────────────────────────────

export function weekToRemote(w: WeekProgress) {
  return {
    user_id: USER_ID,
    week_start: w.weekStart,
    push_done: !!w.sessionsCompleted.push,
    pull_done: !!w.sessionsCompleted.pull,
    squat_done: !!w.sessionsCompleted.squat,
    updated_at: w.updatedAt ?? new Date().toISOString(),
  };
}

export function weekFromRemote(r: any): WeekProgress {
  return {
    weekStart: r.week_start,
    sessionsCompleted: {
      push: !!r.push_done,
      pull: !!r.pull_done,
      squat: !!r.squat_done,
    },
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── User profile ────────────────────────────────────────────

export function userToRemote(u: User) {
  return {
    user_id: USER_ID,
    push_level: u.levels.push,
    pull_level: u.levels.pull,
    squat_level: u.levels.squat,
    created_at: u.createdAt,
    updated_at: u.updatedAt ?? new Date().toISOString(),
  };
}

export function userFromRemote(r: any): User {
  return {
    id: 'default',
    levels: {
      push: r.push_level,
      pull: r.pull_level,
      squat: r.squat_level,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notionPageId: null,
  };
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit 2>&1 | grep -v "@expo/vector-icons" | grep -E "mapper|sync"
```

Expected: empty output. If any error appears, fix it before continuing (the most likely issue is a property-name mismatch with the actual types in `src/types/index.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/services/sync/mapper.ts
git commit -m "feat(sync): row mapper between local and supabase shapes"
```

---

## Task 7: Implement `pushChanges()`

**Files:**
- Create: `src/services/sync/supabase-sync.ts`
- Create: `src/services/sync/index.ts`

- [ ] **Step 1: Write the push module**

Create `src/services/sync/supabase-sync.ts`:

```ts
import * as db from '@/services/database';
import { supabase } from './client';
import { isSyncConfigured, USER_ID } from './config';
import {
  sessionToRemote,
  exerciseToRemote,
  gateToRemote,
  weekToRemote,
  userToRemote,
} from './mapper';

function logErr(label: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn(`[sync] ${label}:`, msg);
}

// Set to true while pullRestoreIfFresh is running, so the
// fire-and-forget pushChanges() calls triggered by the restore's
// db.insert/update writes early-return instead of thrashing the network.
let restoreInProgress = false;

export async function pushChanges(): Promise<void> {
  if (!isSyncConfigured()) return;
  if (restoreInProgress) return;

  const { lastPushedAt } = await db.getSyncState();
  const since = lastPushedAt;

  // 1. user_profile — always one row; push if updated_at > since (or no since).
  const user = await db.getUser();
  if (!since || (user.updatedAt && user.updatedAt > since)) {
    const { error } = await supabase
      .from('user_profile')
      .upsert(userToRemote(user), { onConflict: 'user_id' });
    if (error) { logErr('push user_profile', error); return; }
  }

  // 2. exercises
  const exercises = await db.getExercises();
  const dirtyExercises = since
    ? exercises.filter(e => e.updatedAt && e.updatedAt > since)
    : exercises;
  if (dirtyExercises.length) {
    const { error } = await supabase
      .from('exercises')
      .upsert(dirtyExercises.map(exerciseToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push exercises', error); return; }
  }

  // 3. sessions
  const sessions = await db.getSessions();
  const dirtySessions = since
    ? sessions.filter(s => s.updatedAt && s.updatedAt > since)
    : sessions;
  if (dirtySessions.length) {
    const { error } = await supabase
      .from('sessions')
      .upsert(dirtySessions.map(sessionToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push sessions', error); return; }
  }

  // 4. gate_progress
  const gates = await db.getAllGateProgress();
  const gateList = Object.values(gates);
  const dirtyGates = since
    ? gateList.filter(g => g.updatedAt && g.updatedAt > since)
    : gateList;
  if (dirtyGates.length) {
    const { error } = await supabase
      .from('gate_progress')
      .upsert(dirtyGates.map(gateToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push gate_progress', error); return; }
  }

  // 5. week_progress
  const weeks = await db.getAllWeekProgress();
  const weekList = Object.values(weeks);
  const dirtyWeeks = since
    ? weekList.filter(w => w.updatedAt && w.updatedAt > since)
    : weekList;
  if (dirtyWeeks.length) {
    const { error } = await supabase
      .from('week_progress')
      .upsert(dirtyWeeks.map(weekToRemote), { onConflict: 'user_id,week_start' });
    if (error) { logErr('push week_progress', error); return; }
  }

  // 6. Tombstones
  const tombstones = await db.getPendingTombstones();
  for (const t of tombstones) {
    if (t.entityType === 'week_progress') {
      const { error } = await supabase
        .from('week_progress')
        .delete()
        .match({ user_id: USER_ID, week_start: t.entityId });
      if (error) { logErr('push delete week_progress', error); return; }
    } else {
      const { error } = await supabase
        .from(t.entityType)
        .delete()
        .match({ user_id: USER_ID, id: t.entityId });
      if (error) { logErr(`push delete ${t.entityType}`, error); return; }
    }
  }
  if (tombstones.length) {
    await db.clearTombstones(tombstones.map(t => t.id));
  }

  // 7. Advance watermark
  await db.setLastPushedAt(new Date().toISOString());
}
```

- [ ] **Step 2: Add the tombstone helpers in database.ts that this push uses**

In `src/services/database.ts`, append:

```ts
// ── Tombstones (re-using sync_deletions for Supabase deletes) ──

export async function recordTombstone(entityType: string, entityId: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `INSERT INTO sync_deletions (entity_type, entity_id, notion_page_id, deleted_at)
     VALUES (?, ?, NULL, ?)`,
    [entityType, entityId, new Date().toISOString()]
  );
}

export async function getPendingTombstones(): Promise<{ id: number; entityType: string; entityId: string }[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{ id: number; entity_type: string; entity_id: string }>(
    'SELECT id, entity_type, entity_id FROM sync_deletions'
  );
  return rows.map(r => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id }));
}

export async function clearTombstones(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`DELETE FROM sync_deletions WHERE id IN (${placeholders})`, ids);
}
```

- [ ] **Step 3: Write the barrel file**

Create `src/services/sync/index.ts`:

```ts
export { supabase } from './client';
export { pushChanges } from './supabase-sync';
export { isSyncConfigured, USER_ID } from './config';
```

- [ ] **Step 4: Wire `pushChanges()` as fire-and-forget at the end of each writer**

In `src/services/database.ts`, near the top, add:

```ts
import { pushChanges } from './sync';
```

Then inside each of these functions, immediately before `return` (or at the end), append:

```ts
pushChanges().catch(() => {});
```

Functions to instrument: `updateUserLevel`, `upsertExercise`, `deleteAllExercises`, `deleteExercisesNotIn`, `insertSession`, `deleteSession`, `updateGateProgress`, `updateWeekProgress`, `saveDraft` — **skip** (drafts are not synced), `deleteDraft` — **skip**.

For `deleteSession` and `deleteAllExercises`/`deleteExercisesNotIn`, also call `recordTombstone(...)` for each deleted entity BEFORE firing `pushChanges()`. Example:

```ts
export async function deleteSession(sessionId: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  await recordTombstone('sessions', sessionId);
  pushChanges().catch(() => {});
}
```

For `deleteAllExercises`/`deleteExercisesNotIn`, before the delete fetch the list of IDs that will be removed, then loop `recordTombstone('exercises', id)` for each.

- [ ] **Step 5: Verify by logging a session**

Reload the app on the phone. Tap to log a workout (any category — doesn't need to be a full session, just save a draft and complete it). In the Supabase dashboard → **Table Editor → sessions**: the new row should appear with your hardcoded user_id within a few seconds.

Also verify the watermark advanced:

```bash
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > /tmp/contrl-check.db
sqlite3 /tmp/contrl-check.db "SELECT * FROM sync_state"
rm /tmp/contrl-check.db
```

Expected: `default|<recent ISO timestamp>|` (last_pulled_at still null).

- [ ] **Step 6: Verify deletion path**

In the app, navigate to History → tap a session → delete it (or any UI affordance for deleting). Supabase Table Editor → confirm the row is gone. `sync_deletions` should be empty after the push:

```bash
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > /tmp/contrl-check.db
sqlite3 /tmp/contrl-check.db "SELECT * FROM sync_deletions"
rm /tmp/contrl-check.db
```

Expected: no rows.

- [ ] **Step 7: Commit**

```bash
git add src/services/sync/supabase-sync.ts src/services/sync/index.ts src/services/database.ts
git commit -m "feat(sync): push changes with watermark + tombstones, wired to writes"
```

---

## Task 8: Implement `pullRestoreIfFresh()` and wire to app open

**Files:**
- Modify: `src/services/sync/supabase-sync.ts`
- Modify: `src/services/sync/index.ts`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add pull-restore to the sync module**

In `src/services/sync/supabase-sync.ts`, first add the `from` mapper imports alongside the existing `to` ones at the top of the file. Change:

```ts
import {
  sessionToRemote,
  exerciseToRemote,
  gateToRemote,
  weekToRemote,
  userToRemote,
} from './mapper';
```

to:

```ts
import {
  sessionToRemote,
  exerciseToRemote,
  gateToRemote,
  weekToRemote,
  userToRemote,
  sessionFromRemote,
  exerciseFromRemote,
  gateFromRemote,
  weekFromRemote,
  userFromRemote,
} from './mapper';
```

Then append the function to the bottom of the same file:

```ts
export async function pullRestoreIfFresh(): Promise<void> {
  if (!isSyncConfigured()) return;

  const { lastPulledAt } = await db.getSyncState();
  if (lastPulledAt) return; // already restored once

  const sessions = await db.getSessions();
  if (sessions.length > 0) return; // not fresh

  // Fetch everything for this user. RLS scopes by the JWT user_id claim.
  const [users, exercises, sessionRows, gates, weeks] = await Promise.all([
    supabase.from('user_profile').select('*'),
    supabase.from('exercises').select('*'),
    supabase.from('sessions').select('*'),
    supabase.from('gate_progress').select('*'),
    supabase.from('week_progress').select('*'),
  ]);

  const anyError = [users, exercises, sessionRows, gates, weeks].find(r => r.error);
  if (anyError?.error) {
    logErr('pull', anyError.error);
    return;
  }

  // Suppress the fire-and-forget pushChanges() that each db.* writer
  // triggers — we don't want N concurrent pushes during restore.
  restoreInProgress = true;
  try {
    for (const r of exercises.data ?? []) {
      await db.upsertExercise(exerciseFromRemote(r));
    }

    if (users.data?.[0]) {
      const u = userFromRemote(users.data[0]);
      for (const cat of ['push', 'pull', 'squat'] as const) {
        await db.updateUserLevel(cat, u.levels[cat]);
      }
    }

    for (const r of sessionRows.data ?? []) {
      await db.insertSession(sessionFromRemote(r));
    }

    for (const r of gates.data ?? []) {
      await db.updateGateProgress(gateFromRemote(r));
    }

    for (const r of weeks.data ?? []) {
      await db.updateWeekProgress(weekFromRemote(r));
    }
  } finally {
    restoreInProgress = false;
  }

  // Mark restored AND set the push watermark so we don't immediately
  // re-push everything we just pulled (each db.* call above bumped
  // updated_at locally).
  const now = new Date().toISOString();
  await db.setLastPulledAt(now);
  await db.setLastPushedAt(now);
}
```

- [ ] **Step 2: Add `pullRestoreIfFresh` to the barrel**

Edit `src/services/sync/index.ts` to also export `pullRestoreIfFresh`:

```ts
export { pushChanges, pullRestoreIfFresh } from './supabase-sync';
```

- [ ] **Step 3: Wire it into `app/_layout.tsx`**

In `app/_layout.tsx`, find the existing `useEffect` that hides the splash screen. Add a second effect immediately after the imports section update:

```tsx
import { pullRestoreIfFresh, pushChanges } from '../src/services/sync';
```

And inside `RootLayout`, after the existing `useEffect` for splash, add:

```tsx
useEffect(() => {
  if (!ready) return;
  pullRestoreIfFresh()
    .then(() => pushChanges())
    .catch(err => console.warn('[sync] startup sync failed:', err));
}, [ready]);
```

- [ ] **Step 4: Verify pull works via wipe-and-restore**

Important: this is destructive. Make sure all your data is pushed to Supabase first (sessions appear in dashboard).

On the phone:
```bash
adb shell pm clear com.rein.contrl
```

This wipes the app's local storage (sandbox is gone). Open the app. The splash will hold for a moment longer than usual. When the home screen appears:

- The history tab should show your sessions
- The home tab's week strip should reflect your gate / week progress
- Exercises should appear in skill tree

Then verify the local DB:

```bash
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > /tmp/contrl-check.db
sqlite3 /tmp/contrl-check.db "SELECT COUNT(*) FROM sessions; SELECT COUNT(*) FROM exercises; SELECT * FROM sync_state"
rm /tmp/contrl-check.db
```

Expected: sessions count = the count in Supabase. exercises count > 0. sync_state has non-null `last_pulled_at` AND `last_pushed_at`.

- [ ] **Step 5: Commit**

```bash
git add src/services/sync/supabase-sync.ts src/services/sync/index.ts app/_layout.tsx
git commit -m "feat(sync): pull-restore on fresh install, wired to app open"
```

---

## Task 9: End-to-end acceptance check

**Files:** none (this is a verification pass).

Run each acceptance criterion from the spec. None should require code changes; any failure indicates a bug to fix in the relevant earlier task.

- [ ] **AC1: live push of new session**

Phone connected, app open. Log a session in the UI. Within ~5 seconds, refresh Supabase Table Editor → `sessions` → the new row appears with your `user_id`.

- [ ] **AC2: force-stop survives**

Log a session. Immediately `adb shell am force-stop com.rein.contrl`. Re-open the app. Check Supabase — the session is there (either it pushed before force-stop OR the on-open trigger pushed it).

- [ ] **AC3: restore on wipe**

`adb shell pm clear com.rein.contrl`. Open app. Sessions, exercises, gate progress, week progress all restored from Supabase. Already covered by Task 8 Step 4 but re-run as a final check.

- [ ] **AC4: delete propagates**

Delete a session via the UI. Supabase Table Editor → row is gone within a few seconds.

- [ ] **AC5: offline tolerance**

Toggle airplane mode on the phone. Log a session. No crash, no visible error to the user. Toggle airplane mode off. Within a few seconds (or on next app open), Supabase has the session.

- [ ] **Commit final state**

```bash
git add -A  # nothing should be staged at this point if all earlier commits landed; this is a sanity check
git diff --cached
# If empty, skip the commit. Otherwise:
git commit -m "chore(sync): final wiring verified end-to-end"
```

---

## Out-of-scope / follow-ups (do NOT do in this plan)

These are explicitly *not* part of this implementation:

- `user_id` recovery on reinstall (settings UI for "show/import user_id", or Supabase Auth).
- Tombstone retention policy.
- Multi-device conflict resolution beyond updated_at last-writer-wins.
- Realtime subscriptions.
- "Synced X ago" status UI.
- Concurrent-push guard (in-flight flag).
- Background-task sync via expo-background-fetch.

Each is worth its own brainstorm + spec.
