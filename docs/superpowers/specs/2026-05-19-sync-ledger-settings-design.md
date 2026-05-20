# Sync ledger in settings — design

**Date:** 2026-05-19
**Status:** Approved (pending implementation plan)

## Goal

Add a "Sync Ledger" section to the existing Settings page that lists the 5 mirror-synced tables (`sessions`, `exercises`, `gate_progress`, `week_progress`, `user_profile`) with a per-table "last synced at" relative timestamp. Lets the user see at a glance which tables successfully pushed in the most recent sync.

## Non-goals

- A separate Cloud Sync screen with its own back-nav. (Stays inline in Settings.)
- A separate PULL button. (`pullRestoreIfFresh` already runs on app open; manual pull is out of scope.)
- A dev-menu with force-push / reset-cloud / reset-local actions. (Out of scope; can be added later if needed.)
- Per-table push-vs-pull split timestamps. (Single "last synced" per table.)
- Per-table error display (`lastError`). (Errors still log via `[sync] push <table>:` — out of scope for UI.)
- Multi-device sync semantics. (Single-device app.)

## Architecture

```
Settings screen (existing)
├── SUPABASE SYNC card (existing)
│     · Status: Configured
│     · Last push: 2m ago
│     · Last pull: 2m ago
│     · [Sync now]
│
├── SYNC LEDGER card (new)
│     · user_profile     2m ago
│     · exercises        2m ago
│     · sessions         2m ago
│     · gate_progress    2m ago
│     · week_progress    2m ago
│
└── ABOUT card (existing)
```

The new section reads from a small SQLite table (`sync_meta`). Each row is updated by `pushChanges()` after a successful per-table upsert. The UI re-reads on focus and every 15s, reusing the existing `useFocusEffect + setInterval` pattern in `app/settings/index.tsx`.

## Data model

New SQLite table:

```sql
CREATE TABLE IF NOT EXISTS sync_meta (
  table_name      TEXT PRIMARY KEY,
  last_synced_at  TEXT
);
```

`table_name` matches the Supabase table name (`sessions`, `exercises`, etc.). `last_synced_at` is an ISO 8601 string, NULL when never synced.

Migration (additive, in `migrate()` in `src/services/database.ts`):

```sql
CREATE TABLE IF NOT EXISTS sync_meta (
  table_name      TEXT PRIMARY KEY,
  last_synced_at  TEXT
);
```

Plus seed inserts (idempotent) for the 5 rows:

```sql
INSERT OR IGNORE INTO sync_meta (table_name, last_synced_at) VALUES
  ('user_profile',   NULL),
  ('exercises',      NULL),
  ('sessions',       NULL),
  ('gate_progress',  NULL),
  ('week_progress',  NULL);
```

Order matches the push order in `pushChanges()` so the ledger displays in push-flow order naturally.

## Public API (in `src/services/database.ts`)

Two new exports at the bottom of the file:

```ts
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

The ORDER BY is hardcoded to the push-flow order so the UI doesn't need to sort.

## Push integration (in `src/services/sync/supabase-sync.ts`)

After each successful per-table upsert in `pushChanges()`, call `setSyncMetaTouched` for that table. Concretely, inside the existing 5 table sections — after the `if (error) { logErr(...); return; }` check that confirms the upsert succeeded — add a `setSyncMetaTouched` call.

The watermark advance happens once at the end; the per-table `setSyncMetaTouched` calls happen mid-loop. If a later table errors, earlier tables still have their `last_synced_at` advanced — which correctly reflects that those tables DID sync this round.

One subtle detail: when `dirtyExercises.length === 0` (nothing to push), we still want to mark the table as "synced now" because the push attempt confirms remote is up to date. So the call should fire whether the upsert ran or not, as long as no error occurred for that table.

The cleanest pattern is to call `setSyncMetaTouched(<tableName>)` immediately after the table's `if (error) ... return` block (so it only runs when no error occurred and we'd be proceeding to the next table).

## UI changes (in `app/settings/index.tsx`)

Add a new state slot for ledger rows:

```ts
type SyncMetaRow = { tableName: string; lastSyncedAt: string | null };
// ...
const [ledger, setLedger] = useState<SyncMetaRow[]>([]);
```

Extend `refresh()` to fetch ledger alongside sync state:

```ts
const refresh = useCallback(() => {
  getSyncState().then(setSync).catch(() => {});
  getAllSyncMeta().then(setLedger).catch(() => {});
}, []);
```

Render a new section between `SUPABASE SYNC` (and its Sync now button) and `ABOUT`:

```tsx
<Text style={[styles.sectionTitle, { marginTop: 32 }]}>SYNC LEDGER</Text>
{ledger.map(row => (
  <View key={row.tableName} style={styles.row}>
    <Text style={styles.rowLabel}>{row.tableName}</Text>
    <Text style={styles.rowSubtitle}>{formatTimeSince(row.lastSyncedAt)}</Text>
  </View>
))}
```

Reuses the existing `row`, `rowLabel`, `rowSubtitle` styles and the existing `formatTimeSince` helper (already handles the `null → 'Never'` case). No new styles needed.

## Behavior on a fresh install

After `pm clear` (or any other "never-synced" state), `sync_meta` has 5 rows all with `last_synced_at = NULL`. The UI renders 5 rows of "Never". On the first successful `pushChanges()` after the migration runs, each table's row updates to its actual sync timestamp.

Note that `pullRestoreIfFresh` does NOT touch `sync_meta` — only `pushChanges` does. That's deliberate: the ledger represents the user's outbound sync state. A pull-restore doesn't "sync" the local copy; it copies remote to local. We can revisit this later if useful, but for now it matches the design's "last synced = last pushed" semantics.

## Acceptance criteria

1. **Migration applied.** After app open with the new code, `sync_meta` has 5 rows (one per synced table) with `last_synced_at = NULL` on a fresh install, or whatever timestamps the existing push logic wrote.
2. **Push updates ledger.** Trigger a push (log a workout, or tap "Sync now"). The Settings page's SYNC LEDGER section shows each table with a recent `< 1m ago` timestamp.
3. **Display order matches push order.** Reading the ledger top-to-bottom: `user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress`.
4. **Per-row refresh.** Stay on the Settings screen for >15s. The timestamps re-render (e.g., `12s ago` → `27s ago`) without navigating away.
5. **Never state.** On a fresh install (`pm clear`), the ledger shows "Never" for each row until the first push completes.
6. **No data lost.** Adding the new table + helpers doesn't affect existing local SQLite data.

## Tradeoffs

| Cost dimension | Path taken | Alternative |
|---|---|---|
| Files added | 0 new files; edits to 3 existing | New screen file + new orchestrator file |
| Lines added | ~50 across the 3 files | ~300 (per buffr's pattern) |
| New tables | 1 (`sync_meta`) | Same, but plus error/lastPullAt columns |
| Per-table push timestamp granularity | Yes | Same |
| Per-table pull timestamp | No | Yes |
| Per-table error surfacing | No | Yes (lastError column) |
| User-visible buttons added | 0 | PUSH, PULL, dev actions |

**Sub-block 1 — what we gave up:** No per-table pull timestamp means the ledger only describes outbound state. Pull behaviors (fresh-install restore) aren't visible. No per-table error means a transient PostgREST failure on a single table won't show in the ledger — the user would have to check Metro logs to debug. Both are acceptable for a single-device app where sync failures are rare and recovery is "open the app again."

**Sub-block 2 — what the alternative would have cost:** Buffr's full cloud-sync.tsx is 323 lines plus 4 supporting modules (orchestrator, syncMeta, devActions, types). For contrl's much simpler synced surface (5 tables vs ~12, single-device vs aspiring-multi-device), that scale of infrastructure is over-built. Maintaining two paradigms (full orchestrator + dev menu + force-actions) would be its own cognitive load for a feature whose user-visible benefit is "five timestamps on a settings screen."

**Sub-block 3 — the breakpoint:** Fine until contrl genuinely needs multi-device sync (two phones, or shared workouts). At that point, push-only timestamps don't capture the full picture and per-table pull state becomes load-bearing. The migration to a richer `sync_meta` (adding `last_pull_at`, `last_error`) is an additive ALTER TABLE — no rewrite of the current code.

## Out of scope (future work)

- PUSH/PULL buttons separate from existing "Sync now"
- Per-table error display
- Dev-menu actions (force push all, reset cloud, reset local from cloud)
- A dedicated Cloud Sync screen with back nav
- Per-table pull timestamps
- Sync history beyond "most recent" (e.g., last 10 syncs)
