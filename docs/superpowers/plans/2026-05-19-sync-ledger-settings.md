# Sync Ledger in Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-table "last synced at" list to the existing Settings page, backed by a tiny `sync_meta` SQLite table that `pushChanges()` updates on each successful upsert.

**Architecture:** New `sync_meta` table (`table_name` PK + `last_synced_at` ISO string), seeded with 5 rows for the synced entity tables. `pushChanges()` calls `setSyncMetaTouched(tableName)` after each per-table upsert succeeds. Settings UI reads via a new `getAllSyncMeta()` accessor and renders rows in push-flow order using existing styles.

**Tech Stack:** React Native + Expo, `expo-sqlite`, existing `@supabase/supabase-js` sync layer.

**Testing approach:** This project has no test infra (no Jest). Verification is integration-style: reload the app on the connected phone, log a session (or tap Sync Now), inspect the Settings screen, optionally cross-check via `adb run-as` + `sqlite3` on the SQLite file.

**Spec:** [`docs/superpowers/specs/2026-05-19-sync-ledger-settings-design.md`](../specs/2026-05-19-sync-ledger-settings-design.md)

---

## File Structure

**Files modified (no new files):**

- `src/services/database.ts` — add `sync_meta` table to `migrate()`, add `getAllSyncMeta` + `setSyncMetaTouched` exports at the bottom
- `src/services/sync/supabase-sync.ts` — add 5 `setSyncMetaTouched(...)` calls (one per synced table) after each upsert's error check
- `app/settings/index.tsx` — add `ledger` state, extend `refresh()` to fetch ledger alongside sync state, render new `SYNC LEDGER` section

---

## Task 1: Add `sync_meta` table + accessors to database.ts

**Files:**
- Modify: `src/services/database.ts`

- [ ] **Step 1: Add the CREATE TABLE statement to `migrate()`**

Find the big `await database.execAsync(...)` block inside `migrate()` that contains all the `CREATE TABLE IF NOT EXISTS` statements. Add this new table at the end of that block, after the existing `CREATE TABLE IF NOT EXISTS sync_state` block:

```sql
    CREATE TABLE IF NOT EXISTS sync_meta (
      table_name      TEXT PRIMARY KEY,
      last_synced_at  TEXT
    );
```

Preserve the file's existing indentation (matches the other CREATE TABLE blocks in the same execAsync template literal).

- [ ] **Step 2: Seed the 5 rows after the execAsync block**

Right after the `execAsync` returns — alongside the existing seed call for `sync_state` (`INSERT OR IGNORE INTO sync_state ...`) — add a seed for the 5 entity-table rows:

```ts
  await database.runAsync(
    `INSERT OR IGNORE INTO sync_meta (table_name, last_synced_at) VALUES
       ('user_profile',   NULL),
       ('exercises',      NULL),
       ('sessions',       NULL),
       ('gate_progress',  NULL),
       ('week_progress',  NULL)`
  );
```

Order matches the push order in `pushChanges()` so the ledger displays in push-flow order. `INSERT OR IGNORE` keeps it idempotent across re-opens.

- [ ] **Step 3: Add the two exported accessors at the bottom of the file**

Append to the end of `src/services/database.ts`:

```ts

// ── Sync ledger (per-table last-synced timestamps) ──────────

export async function getAllSyncMeta(): Promise<{
  tableName: string;
  lastSyncedAt: string | null;
}[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{ table_name: string; last_synced_at: string | null }>(
    `SELECT table_name, last_synced_at FROM sync_meta
     ORDER BY CASE table_name
       WHEN 'user_profile'   THEN 1
       WHEN 'exercises'      THEN 2
       WHEN 'sessions'       THEN 3
       WHEN 'gate_progress'  THEN 4
       WHEN 'week_progress'  THEN 5
       ELSE 6
     END`
  );
  return rows.map(r => ({ tableName: r.table_name, lastSyncedAt: r.last_synced_at }));
}

export async function setSyncMetaTouched(tableName: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `UPDATE sync_meta SET last_synced_at = ? WHERE table_name = ?`,
    [new Date().toISOString(), tableName]
  );
}
```

The CASE WHEN ORDER BY hardcodes push-flow order so the UI gets rows in display order without further sorting.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "database\.ts" | grep -v "passed" | head
```

Expected: no NEW errors involving the lines you just added. Pre-existing errors about `passed` / `rowToSession` are unrelated.

- [ ] **Step 5: Commit**

```bash
git add src/services/database.ts
git commit -m "feat(sync): add sync_meta table and per-table accessors"
```

---

## Task 2: Wire `pushChanges` to update `sync_meta`

**Files:**
- Modify: `src/services/sync/supabase-sync.ts`

The current `pushChanges()` has 5 per-table sections (user_profile, exercises, sessions, gate_progress, week_progress), each with an `if (error) { logErr(...); return; }` guard after the upsert call. Right after each guard, call `setSyncMetaTouched` for that table — this only runs when the upsert had no error AND we're about to proceed to the next table.

Important: the call must fire even when the table had no dirty rows to push (the spec says "last synced = last successful sync attempt"). The current code structure already does this — the `if (dirtyExercises.length)` block wraps the upsert call. We add the `setSyncMetaTouched` AFTER the entire `if` block (not inside it), so it fires whether or not the upsert ran.

- [ ] **Step 1: Read the current file to confirm structure**

```bash
sed -n '20,120p' src/services/sync/supabase-sync.ts
```

Expected: 5 per-table sections in pushChanges with comments like `// 1. user_profile`, `// 2. exercises`, etc.

- [ ] **Step 2: Add `setSyncMetaTouched` calls in each per-table section**

Use Edit to insert one line per table. The exact edits:

**user_profile (section 1)** — replace:

```ts
  // 1. user_profile
  const user = await db.getUser();
  if (!since || (user.updatedAt && user.updatedAt > since)) {
    const { error } = await supabase
      .from('user_profile')
      .upsert(userToRemote(user), { onConflict: 'user_id' });
    if (error) { logErr('push user_profile', error); return; }
  }
```

with:

```ts
  // 1. user_profile
  const user = await db.getUser();
  if (!since || (user.updatedAt && user.updatedAt > since)) {
    const { error } = await supabase
      .from('user_profile')
      .upsert(userToRemote(user), { onConflict: 'user_id' });
    if (error) { logErr('push user_profile', error); return; }
  }
  await db.setSyncMetaTouched('user_profile');
```

**exercises (section 2)** — replace:

```ts
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
```

with:

```ts
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
  await db.setSyncMetaTouched('exercises');
```

**sessions (section 3)** — replace:

```ts
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
```

with:

```ts
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
  await db.setSyncMetaTouched('sessions');
```

**gate_progress (section 4)** — replace:

```ts
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
```

with:

```ts
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
  await db.setSyncMetaTouched('gate_progress');
```

**week_progress (section 5)** — replace:

```ts
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
```

with:

```ts
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
  await db.setSyncMetaTouched('week_progress');
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "supabase-sync\.ts" | head
```

Expected: empty. The `db.setSyncMetaTouched` symbol is imported via the existing `import * as db from '@/services/database'` line.

- [ ] **Step 4: Commit**

```bash
git add src/services/sync/supabase-sync.ts
git commit -m "feat(sync): record per-table sync_meta timestamps in pushChanges"
```

---

## Task 3: Add `SYNC LEDGER` section to Settings UI

**Files:**
- Modify: `app/settings/index.tsx`

- [ ] **Step 1: Add the import for `getAllSyncMeta`**

Find the existing import line:

```ts
import { getSyncState } from '../../src/services/database';
```

Replace with:

```ts
import { getSyncState, getAllSyncMeta } from '../../src/services/database';
```

- [ ] **Step 2: Add a type alias and a new state slot**

Just below the `type SyncState = ...` line near the top of the component file, add:

```ts
type SyncMetaRow = { tableName: string; lastSyncedAt: string | null };
```

Inside `SettingsScreen()` component, just after the existing state declarations (`const [sync, setSync] = ...; const [pushing, setPushing] = ...`), add:

```ts
  const [ledger, setLedger] = useState<SyncMetaRow[]>([]);
```

- [ ] **Step 3: Extend `refresh()` to fetch the ledger**

Find the current `refresh` callback:

```ts
  const refresh = useCallback(() => {
    getSyncState().then(setSync).catch(() => {});
  }, []);
```

Replace with:

```ts
  const refresh = useCallback(() => {
    getSyncState().then(setSync).catch(() => {});
    getAllSyncMeta().then(setLedger).catch(() => {});
  }, []);
```

- [ ] **Step 4: Render the SYNC LEDGER section**

In the JSX, find the existing `<Text style={[styles.sectionTitle, { marginTop: 32 }]}>ABOUT</Text>` line. Insert this block immediately BEFORE it:

```tsx
      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>SYNC LEDGER</Text>
      {ledger.map(row => (
        <View key={row.tableName} style={styles.row}>
          <Text style={styles.rowLabel}>{row.tableName}</Text>
          <Text style={styles.rowSubtitle}>{formatTimeSince(row.lastSyncedAt)}</Text>
        </View>
      ))}
```

The existing `styles.sectionTitle` already applies the `marginTop: 32` when needed; preserve that pattern. The new section uses the same `row`/`rowLabel`/`rowSubtitle` styles already defined in the file.

- [ ] **Step 5: Adjust ABOUT spacing if needed**

Since SYNC LEDGER now sits between SUPABASE SYNC and ABOUT, the ABOUT header's `marginTop: 32` is correct (it should still visually separate from the ledger rows). Verify by reading the surrounding JSX.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "settings/index\.tsx" | head
```

Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add app/settings/index.tsx
git commit -m "feat(sync): show per-table sync ledger in Settings"
```

---

## Task 4: Verify on device

**Files:** none.

- [ ] **Step 1: Reload the app**

If Metro is running with the new code:
```bash
adb shell am force-stop com.rein.contrl
adb shell am start -n com.rein.contrl/.MainActivity
```

If the app is the release variant (bundled JS, no Metro), rebuild first:
```bash
npx expo run:android --variant release
```

- [ ] **Step 2: Wait for the app-open push to fire** (~5 seconds after launch).

- [ ] **Step 3: Navigate to Settings**

Tap the settings icon in the app header. Confirm SUPABASE SYNC section appears with a recent "Last push" timestamp.

- [ ] **Step 4: Confirm SYNC LEDGER section appears**

Scroll if needed. Expected: a `SYNC LEDGER` heading above `ABOUT`, with 5 rows in this order:

```
user_profile     <Xs ago>
exercises        <Xs ago>
sessions         <Xs ago>
gate_progress    <Xs ago>
week_progress    <Xs ago>
```

All five should show recent timestamps. If any show "Never", that table failed to push (check Metro logs).

- [ ] **Step 5: Cross-check via adb sqlite (optional)**

Optionally verify the SQLite state matches the UI:

```bash
cd /tmp && rm -rf c-ledger; mkdir c-ledger && cd c-ledger
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db > contrl.db
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db-wal > contrl.db-wal
adb exec-out run-as com.rein.contrl cat files/SQLite/contrl.db-shm > contrl.db-shm
sqlite3 contrl.db "SELECT table_name, last_synced_at FROM sync_meta ORDER BY CASE table_name WHEN 'user_profile' THEN 1 WHEN 'exercises' THEN 2 WHEN 'sessions' THEN 3 WHEN 'gate_progress' THEN 4 WHEN 'week_progress' THEN 5 ELSE 6 END"
cd / && rm -rf /tmp/c-ledger
```

(Run-as only works if the installed APK is a debug build. If it's release, skip this step — the UI verification in step 4 is sufficient.)

Expected: 5 rows, all with recent ISO timestamps.

- [ ] **Step 6: Test the live-update behavior**

Tap "Sync now" in Settings. Wait a couple seconds. The SYNC LEDGER timestamps should all refresh to show very recent (e.g. `1s ago`) within the next 15s polling tick — or immediately if the focus effect re-fires.

- [ ] **Step 7: Push commits to remote**

```bash
git push origin main
```

---

## Out-of-scope / follow-ups (do NOT do in this plan)

- PUSH / PULL buttons separate from existing "Sync now".
- Per-table error display (`lastError` column in `sync_meta`).
- Dev-menu actions (force push all, reset cloud DB, reset local from cloud).
- A dedicated Cloud Sync screen with its own back-nav.
- Per-table pull timestamps (only push timestamps are tracked).
- Updating `sync_meta` from `pullRestoreIfFresh` — by design, the ledger only tracks outbound state.
