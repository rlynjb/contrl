# 00 — Overview

The one-page map of contrl as a database system. Two engines, one direction of authority, write-mostly mirror, single user.

## The whole picture

```
  contrl — two engines, one direction, write-mostly mirror

  ┌─ Device (React Native / Expo SDK 55) ─────────────────────────────────────┐
  │                                                                            │
  │   UI ──► hooks ──► src/services/database.ts                                │
  │                         │                                                  │
  │                         ▼                                                  │
  │             ┌──────────────────────────────┐                               │
  │             │ expo-sqlite (WAL mode)       │  ← canonical store            │
  │             │ file: contrl.db              │     single writer             │
  │             │ 9 tables, PK indexes +       │     readers see a snapshot    │
  │             │ 9 secondary indexes          │                               │
  │             └──────────────┬───────────────┘                               │
  │                            │ fire-and-forget pushChanges()                 │
  └────────────────────────────┼───────────────────────────────────────────────┘
                               │  HTTPS / @supabase/supabase-js (REST)
  ┌─ Cloud (Supabase project "reindb", schema = contrl) ─────────────────────┐
  │                            ▼                                              │
  │             ┌──────────────────────────────┐                              │
  │             │ Postgres                     │  ← write-mostly mirror       │
  │             │ true MVCC                    │     no RLS today             │
  │             │ anon key has full access     │     single hardcoded USER_ID │
  │             └──────────────────────────────┘                              │
  └───────────────────────────────────────────────────────────────────────────┘

  authority flows DOWN at runtime (device writes → cloud mirrors).
  authority flows UP exactly once: pullRestoreIfFresh() on a fresh install.
```

The device decides. The cloud holds the backup. That's the whole shape.

## What this guide audits, lens by lens

| Lens                              | What contrl actually does                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage layout                    | SQLite default 4KB pages; rowid B-tree; wide rows for `sessions.exercises_json` (TEXT blob holding the full set list). See `02`.                                |
| Indexes                           | 9 secondary indexes created in `migrate()` at `database.ts:175–185`. Mostly on `notion_page_id` (dead column, kept) and `sessions.date / .category / .updated_at`. See `03`. |
| Query planning                    | No EXPLAIN inspection in repo. Hot queries are `getSessions ORDER BY date DESC` (index-served), `getExercises ORDER BY category, level, sort_order` (NO composite index — full scan + sort). See `04`. |
| Transactions                      | `runAsync` auto-commits each statement. `migrate()` runs a sequence of statements with NO explicit `BEGIN`/`COMMIT`. Partial-migration risk on crash. See `05`. |
| Isolation                         | SQLite WAL: readers see a snapshot (serializable by construction for single-writer). Postgres side: default isolation = read committed, but contrl never opens a transaction over Supabase REST. See `05`, `06`. |
| Locks / MVCC                      | SQLite: single writer, many readers, WAL gives readers a snapshot without blocking the writer. Postgres MVCC: not exercised — every write is a single `upsert` REST call. See `06`. |
| Durability                        | `PRAGMA journal_mode = WAL` at `database.ts:27`. Default `synchronous = NORMAL` under WAL: durable on fsync of the WAL, checkpoints fold into main file. See `07`. |
| Recovery                          | SQLite WAL replay on next open. Cloud "recovery" is `pullRestoreIfFresh()` — fresh-install only, no PITR. See `07`.                                              |
| Replication                       | None today. Single Supabase project, no read replicas, no failover wiring. See `08`.                                                                            |

## The five most consequential mechanisms in this repo

Ranked by how much they're holding up:

1. **WAL mode on SQLite.** Set once at line 27. Without it, every concurrent read during a write would either block or see partial writes. WAL is what makes the fire-and-forget `pushChanges()` pattern safe — the push reader sees a clean snapshot while the UI thread can still write the next session.

2. **The `updated_at` watermark.** Every dirty-row check in `pushChanges()` is `row.updatedAt > lastPushedAt`. That column is what makes the sync incremental instead of full-table-every-time. `idx_sessions_updated` (line 182) is what keeps that filter from doing a full scan as `sessions` grows.

3. **Single writer per SQLite file.** All `runAsync` calls go through one `getDatabase()` singleton. There's no second thread holding the same file — which means contrl never hits a `SQLITE_BUSY` in practice. This is the silent guarantee everything else depends on.

4. **The `notion_page_id` dead columns.** Six tables still carry `notion_page_id` (kept "for column compatibility" per `context.md`). Five secondary indexes index that dead column. Write amplification on every upsert. Not load-bearing — pure carrying cost. See `03` and `09`.

5. **The string-interpolated UPDATE in `updateUserLevel`.** Line 265: `` `UPDATE user_profile SET ${category}_level = ?, ...` ``. Parameter for the value, but the column name comes from a TypeScript `Category` type. Type-safe at compile, not at runtime. See `09` for the verdict.

## Ranked findings (full list in `09-database-systems-red-flags-audit.md`)

1. **migrate() runs without a transaction** (`database.ts:25–212`) — a crash mid-migration leaves the schema in a half-applied state with no rollback. Severity: medium. Surface area widens as you add migrations.
2. **String-interpolated column name in `updateUserLevel`** (`database.ts:264–267`) — the only non-parameterized SQL in the file. Type-gated, not runtime-gated. Severity: low today (one caller), but a refactor land-mine.
3. **`getExercises ORDER BY category, level, sort_order` has no composite index** (`database.ts:300–303`) — current row count makes it fine; will become a sort on every render once the seed list grows.
4. **Five indexes on `notion_page_id` after Notion was removed** (`database.ts:178–184`) — dead write cost on every exercise / session / gate / week upsert.
5. **No RLS on Supabase** (`config.ts:6`, project context line 9) — anon key has full table access. The single `USER_ID` is enforced client-side only.
6. **No retries, no idempotency keys, no batch on the Supabase push path** (`supabase-sync.ts:34–128`) — partial push failures (network blip after pushing exercises but before sessions) leave `last_pushed_at` un-advanced; next push re-sends everything dirty. Idempotent because of `onConflict: 'user_id,id'`, but the bandwidth is wasted.
7. **`exercises_json` is a TEXT blob holding an array** (`database.ts:58`, `database.ts:382`) — can't index into entries, can't query by exercise, parses on every read. Acceptable for the access pattern (read whole session, write whole session) but locks in that pattern.

## Not yet exercised — name them honestly

- **Read replicas.** One Postgres primary, no replicas. Stale-read reasoning doesn't apply yet.
- **Failover.** No standby, no health-check wiring.
- **Point-in-time recovery.** Supabase has backups, but contrl never invokes them; restore path is "fresh install + pull."
- **True MVCC awareness.** Both engines have MVCC; contrl never opens a transaction over the network, never sees snapshot vs. read-committed differences.
- **Prepared-statement caching at the binding layer.** `runAsync` re-parses each call site. expo-sqlite supports `prepareAsync` — not used anywhere.
- **Vacuuming / page reclamation.** `DELETE FROM` leaves freelist pages. No `VACUUM` ever runs.
- **Streaming reads.** Every read is `getAllAsync` — full result set into memory. Fine at current row counts.
- **WAL checkpoint tuning.** Default checkpoint behavior. Never explicitly checkpointed; never tuned via `wal_autocheckpoint`.

## How to use this guide

Open `01-database-systems-map.md` first — it's the picture you keep open while reading the rest. Each subsequent file zooms into one mechanism in the order they show up on that map. The last file (`09`) is the verdict.

Cross-links:
- Schema shape and field meaning → `../study-data-modeling/`
- Sync coordination, partial failure, ordering → `../study-distributed-systems/`
- Why SQLite + Supabase was chosen at all → `../study-system-design/`
