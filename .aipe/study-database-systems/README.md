# Study — Database Systems (applied)

A repo-grounded walk through the storage engines, indexes, query paths, transactions, concurrency, durability, and replication that the contrl app actually exercises. Two engines are in play and they behave very differently: **expo-sqlite (WAL mode)** on the device is the canonical store; **Postgres via Supabase** is a write-mostly cloud mirror reached through REST.

This guide treats SQLite as primary. Postgres shows up as the second side of the seam — what travels across the network and what the engine guarantees once it lands. Mechanisms the repo doesn't yet exercise (true MVCC awareness, read replicas, point-in-time recovery, prepared statements at the binding layer, etc.) are named honestly as `not yet exercised` with the trigger that would activate them.

## Reading order

```
  orient ─────────────────►   mechanism by mechanism                ───► verdict
  ┌────────────────┐ ┌────────────────────────────────────────────┐ ┌─────────┐
  │ 00 overview    │ │ 01 map → 02 storage → 03 indexes →         │ │ 09 red  │
  │ 01 systems map │ │ 04 query plans → 05 txn/isolation →        │ │ flags   │
  └────────────────┘ │ 06 locks/MVCC → 07 WAL/recovery → 08 repl │ │ audit   │
                     └────────────────────────────────────────────┘ └─────────┘
```

- **00-overview.md** — the one-page map: engines, tables, indexes, the durability seam, ranked findings.
- **01-database-systems-map.md** — every datastore, every query path, every durability boundary in one diagram.
- **02-records-pages-and-storage-layout.md** — how rows live on disk in SQLite pages, what locality buys, where contrl's wide rows pay the cost.
- **03-btree-hash-and-secondary-indexes.md** — the rowid B-tree, the secondary indexes contrl creates, the ones it doesn't, and the write-amplification cost of each.
- **04-query-planning-and-execution.md** — how `EXPLAIN QUERY PLAN` would read contrl's hot queries, where indexes are used, where full scans still happen.
- **05-transactions-isolation-and-anomalies.md** — what `runAsync` gives you (auto-commit per statement), what migrate() does NOT wrap, and the anomalies that follow.
- **06-locks-mvcc-and-concurrency-control.md** — SQLite's single-writer/many-reader model under WAL, Postgres MVCC on the other side, and which guarantees contrl actually assumes.
- **07-wal-durability-and-recovery.md** — what `PRAGMA journal_mode = WAL` buys, when checkpoints happen, what survives a crash, and what doesn't.
- **08-replication-and-read-consistency.md** — what's true today (one Supabase primary, no replicas, no failover) vs. what shows up the moment you turn on auth + multi-device.
- **09-database-systems-red-flags-audit.md** — ranked risks with `file:line` evidence and the move that closes each one.

## Cross-links

- **`../study-data-modeling/`** owns the schema SHAPE — which fields exist, normalization, what the columns mean. This guide owns the MECHANISMS that execute the queries over that shape.
- **`../study-distributed-systems/`** owns how the SQLite-Supabase pair coordinates across the network — watermarks, tombstones, partial failure, ordering.
- **`../study-system-design/`** owns WHICH datastore was chosen and how it scales. This guide stays inside the engines once chosen.

## Anchor

Primary source files referenced across this guide:

- `src/services/database.ts` (679 LOC) — schema, migrations, all CRUD.
- `src/services/sync/supabase-sync.ts` — the dirty-row reads, the upserts to Postgres.
- `src/services/sync/client.ts` — Supabase client config (`db: { schema: 'contrl' }`).
- `src/services/sync/config.ts` — anon key plumbing and the single hardcoded `USER_ID`.
