# Supabase mirror sync — design

**Date:** 2026-05-17
**Status:** Approved (pending implementation plan)
**Replaces:** the removed Notion sync (commit `b057136`)

## Goal

Add a remote backup mirror to the local-first SQLite app, using Supabase as the hosted Postgres. Local SQLite remains the source of truth; Supabase is a write-mostly mirror that can restore on fresh install.

## Non-goals

- No realtime subscriptions.
- No conflict resolution beyond last-writer-wins on `updated_at`.
- No background-task sync — push fires only while the app is foregrounded.
- No multi-device support (yet) — single hardcoded `user_id`.
- No auth UI — anon key + RLS scoped via a Postgres GUC.
- No sync-status UI beyond an optional "last synced X ago" line in settings.

## Sync direction

**Restore-capable backup.** Pushes flow local → remote continuously. Pulls run **only** when local state is detected as freshly initialized (sessions table empty). After the initial restore, the cloud is read-only from the app's perspective.

## Sync scope

Synced tables (mirrored to Supabase):

- `sessions`
- `exercises` (the local SQLite copy is the truth — JSON seed is a stale fallback)
- `gate_progress`
- `week_progress`
- `user_profile`

Not synced:

- `drafts` — transient by design.
- `sync_deletions` — used as a local outbox for tombstones, not mirrored.

The dead `notion_page_id` column on local tables is **not** mirrored to Supabase — local-only legacy.

## Supabase schema

One Postgres table per synced entity. All tables have:

- `user_id uuid not null`
- Composite primary key `(user_id, id)` (or `(user_id, week_start)` for week_progress).
- `updated_at timestamptz not null` for last-writer-wins ordering.

```
sessions(user_id, id, date, level, category, exercises_json jsonb, notes, passed, created_at, updated_at)
exercises(user_id, id, name, category, level, target_sets, target_reps, sort_order, tempo, notes, updated_at)
gate_progress(user_id, id, level, category, status, consecutive_passes, last_session_date, updated_at)
week_progress(user_id, week_start, push_done, pull_done, squat_done, updated_at)
user_profile(user_id, push_level, pull_level, squat_level, created_at, updated_at)
sync_deletions(user_id, entity_type, entity_id, deleted_at)  -- DELETEs propagated here
```

`exercises_json` becomes Postgres `jsonb` (was a `TEXT` blob in SQLite).

### RLS + auth mechanism

RLS is enforced on every table; the policy checks `user_id` against the identity attached to the request. PostgREST/Supabase makes one HTTP call = one connection, so transaction-scoped GUCs don't survive between requests. Two practical mechanisms exist; we choose **Option A** for MVP:

**Option A — Custom JWT with `user_id` claim (chosen).**

Generate a long-lived JWT signed with the project's JWT secret containing:

```json
{ "role": "authenticated", "user_id": "<hardcoded-uuid>" }
```

Generated once via the Supabase dashboard or a small Node snippet that uses the JWT secret. Hardcoded into `app.json` → `expo.extra.supabase.authToken`. Client created as:

```ts
createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${authToken}` } }
});
```

RLS policy:

```sql
create policy "user_isolation" on <table>
  for all
  using (user_id = ((current_setting('request.jwt.claims', true))::json ->> 'user_id')::uuid);
```

This works on every request because PostgREST exposes the JWT claims via `request.jwt.claims` automatically — no per-request setup call needed.

**Option B — Supabase Anonymous Auth (not chosen for MVP).**

Call `supabase.auth.signInAnonymously()` on first launch; persist session via `expo-secure-store` adapter. RLS becomes `user_id = auth.uid()`. Standard pattern but adds session lifecycle complexity and would change the "hardcoded user_id" decision since the anon user_id is generated server-side.

Either way, the "reinstall = lose identity" gap is the same and remains punted.

## Local sync state

New SQLite table:

```sql
create table if not exists sync_state (
  id text primary key default 'default',
  last_pushed_at text,
  last_pulled_at text
);
```

Single row, id `'default'`. Both timestamps are ISO strings; `null` = never.

## Push algorithm

`pushChanges()` in new module `src/services/sync/supabase-sync.ts`:

1. Read `last_pushed_at` from `sync_state`. Call it `since`.
2. For each synced table, query rows where `updated_at > since` (or all rows if `since` is null).
3. UPSERT each batch via `supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })` (or `'user_id,week_start'`). The Authorization header (custom JWT) attached to the client carries the user_id claim; RLS handles isolation server-side.
4. Query local `sync_deletions` for pending tombstones. For each: `supabase.from(<entity_type>).delete().match({ user_id: USER_ID, id: <entity_id> })`. On full success, `DELETE FROM sync_deletions WHERE id IN (...)` locally.
5. On full success across all batches: `UPDATE sync_state SET last_pushed_at = <now ISO>`.
6. On any error: log and bail. Watermark stays put; the next trigger retries the same set.

Concurrent pushes (two triggers firing close together) are safe: UPSERT is idempotent, watermark updates are last-write-wins on wall-clock-now, tombstone DELETEs are no-ops on the second pass. v1 does not guard against concurrent pushes; an in-flight flag may be added in v1.1 to reduce wasted work.

The watermark approach means an updated row may be pushed multiple times if a later push partially fails — UPSERT semantics make that safe.

## Pull algorithm

`pullRestoreIfFresh()`:

1. Detect fresh install: `last_pulled_at IS NULL AND (SELECT COUNT(*) FROM sessions) = 0`.
2. If not fresh, return early.
3. For each synced table: `select('*')`. RLS filters by the JWT's user_id claim; no client-side filter needed. Batch the results into local SQLite with `INSERT OR REPLACE`.
4. `UPDATE sync_state SET last_pulled_at = <now>, last_pushed_at = <now>` so we don't immediately re-push what we just pulled.

The JSON seed (`seedExercisesIfEmpty`) still runs on first launch. If the pull succeeds shortly after, its UPSERT semantics overwrite the stale seed with fresh remote data. If the pull fails (offline first launch), the seed serves as a fallback.

## Tombstones (deletions)

Wrap every local delete (`deleteSession`, etc.) to also insert into `sync_deletions`:

```ts
await db.runAsync(
  'INSERT INTO sync_deletions (entity_type, entity_id, notion_page_id, deleted_at) VALUES (?, ?, NULL, ?)',
  [entityType, entityId, new Date().toISOString()]
);
```

(The `notion_page_id` column on `sync_deletions` is dead; we pass NULL.)

`pushChanges()` drains these in step 5 above.

## Triggers

- **Live trigger:** at the end of each writing function in `src/services/database.ts` (`insertSession`, `updateGateProgress`, `updateWeekProgress`, `updateUserLevel`, `upsertExercise`, delete wrappers), fire `pushChanges().catch(logSyncError)` — non-blocking, fire-and-forget.
- **App-open trigger:** in `app/_layout.tsx`, after `ready === true`, run `pullRestoreIfFresh().then(pushChanges).catch(logSyncError)` once.

## Auth and configuration

- Supabase URL + anon key in `app.json` → `expo.extra.supabase.{url,anonKey}`. The anon key is designed for client exposure; RLS is the real boundary.
- `USER_ID`: hardcoded `const` in `src/services/sync/config.ts` for MVP.
- A new file `src/services/sync/client.ts` exports a singleton `supabase` client built from the config.

## Offline behavior

Failures are silent. The watermark approach naturally retries: a failed push just doesn't advance `last_pushed_at`, so the next trigger re-attempts. No retry-with-backoff schedule; we rely on the next user action or next app open.

A small `useSyncStatus` hook may surface `{ lastSuccessAt, lastAttemptAt, lastError }` for an optional "Synced X ago" line in settings. Optional in v1; can be added if useful.

## Module layout

```
src/services/sync/
  client.ts          # supabase client singleton
  config.ts          # url, anonKey, USER_ID
  supabase-sync.ts   # pushChanges, pullRestoreIfFresh
  mapper.ts          # row ↔ Supabase row conversion (exercises_json text↔jsonb, etc.)
  index.ts           # re-exports
```

`src/services/database.ts` imports `pushChanges` and calls it at the end of each write function.

## Dependencies

- `@supabase/supabase-js` — add to `package.json`.
- `react-native-url-polyfill` — supabase-js prerequisite under React Native.
- `expo-secure-store` — already installed (kept after Notion removal). Not strictly needed for MVP since `USER_ID` is hardcoded; reserved for when we add real auth.

## Known gaps to revisit before going further

1. **`user_id` recovery on reinstall.** With a hardcoded UUID in source, reinstall preserves identity, but the moment we move it to `expo-secure-store` (the right place long-term) reinstall = new user_id = no restore. The fix is either (a) "show user_id in settings, paste to restore" or (b) Supabase Auth with email/magic link. Decision deferred to a follow-up.
2. **Tombstone retention.** `sync_deletions` rows are deleted after successful push, but a never-online device accumulates them indefinitely. No retention policy in v1.
3. **Migration to multi-device.** When that arrives, last-writer-wins via `updated_at` is a starting point but probably not sufficient — we'll likely need per-row vector clocks or move to a CRDT. Not addressed now.

## Acceptance criteria

- Logging a session locally results in a corresponding row appearing in Supabase within a few seconds (with network).
- Force-stopping the app immediately after a workout and reopening triggers a successful push without manual action.
- Wiping the app's data on the phone (or installing on a second device with the same hardcoded `USER_ID`) and opening the app restores all sessions, exercises, gate progress, week progress, and user_profile from Supabase.
- Deleting a session locally results in the corresponding row being removed from Supabase on the next push.
- Killing the network mid-session causes no user-visible errors; pending pushes complete on the next trigger.
