# 04 — Watermark-based incremental sync

### High-water mark · per-table cursor · incremental upsert — Industry standard

> The mechanism that makes the local-first canonical pattern (file [01](./01-local-first-canonical-with-cloud-mirror.md)) practical to run continuously. Each table tracks a per-row timestamp (`updated_at`); the sync layer tracks a per-table watermark (`last_pushed_at` in `sync_meta`); each push selects only rows updated since the watermark and advances the watermark on success. Without it, every push would re-upload the entire table.

**Load-bearing test (passes):** strip this out — push the entire table on every sync — and the cost scales with cumulative history, not delta. At 1000 sessions, every set logged means re-uploading the whole 1000-row sessions table. At 10,000, the cost compounds. The watermark is what makes "fire-and-forget after every write" affordable at scale.

## Zoom out, then zoom in

There are three ways to keep two stores in sync: **send the whole thing every time** (works, expensive at scale), **send only changes since last sync** (incremental), or **subscribe to change events** (push-based, e.g., Supabase Realtime, WAL replication). Incremental is the middle path: cheap when changes are small, robust when sync fails (no events lost — next sync catches up by reading the watermark), and stateless on the receiver side (Supabase's upsert is idempotent on primary keys).

```
  Zoom out — three sync flavors

  ┌─ full table ─────────────────────────┐  ┌─ incremental (★ contrl) ────────┐
  │  push entire table every sync         │  │  push only WHERE updated_at >    │
  │  cost = O(rows)                       │  │       last_pushed_at             │
  │  simple                               │  │  cost = O(delta)                 │
  │  wasteful at scale                    │  │  needs a watermark per table     │
  └─────────────────────────────────────┘  │  needs row-level timestamps       │
                                            └──────────────────────────────────┘

                                            ┌─ event-based (not used today) ───┐
                                            │  subscribe to change events;     │
                                            │  push as they happen              │
                                            │  cost = O(delta), bounded by     │
                                            │       backpressure                │
                                            │  needs a durable event log       │
                                            │  needs a push transport (e.g.,   │
                                            │       Supabase Realtime,         │
                                            │       Postgres logical decoding) │
                                            └──────────────────────────────────┘
```

Zoom in. In contrl, the watermark scheme lives in two specific places: the **`sync_meta` table** (durable per-table cursors) and the **`pushChanges` loop in `src/services/sync/supabase-sync.ts`** (which reads the cursor, finds dirty rows, upserts, advances the cursor).

## Structure pass

**Layers** — Persistence (where `updated_at` is stamped on every write) / Sync (where the watermark loop runs) / Storage (the cursor table `sync_meta`).

**Axis traced — cost** (latency, bytes, Supabase quota per sync) **vs. correctness** (do all dirty rows reach cloud?).

```
  Tracing cost-and-correctness across the sync loop

  step                            cost                  correctness
  ────                            ────                  ───────────
  stamp updated_at on every       ~negligible           must be monotonic
   write                           (one column write)    per row
  read sync_meta cursor           one row lookup        durable across
                                                         app restarts
  SELECT dirty rows                O(dirty), bounded     ALL dirty rows
                                   by index               must be visible
                                   (today: NO index)
  map to remote                    O(dirty)              format must survive
                                                         schema drift
                                                         (snake↔camel rename)
  UPSERT to Supabase              O(dirty) network calls idempotent on PK
  advance cursor                   one row write          ONLY on full success
                                                         per table (today: only
                                                         on full success across
                                                         ALL tables — the bug)
```

Seam: the **dirty-rows SELECT seam** is where correctness lives. If the predicate (`WHERE updated_at > last_pushed_at`) misses any row that should be dirty, that row never syncs. Two ways this can go wrong:

1. **Clock skew between the row write and the watermark advance.** If you advance the watermark to "now" but a concurrent write commits with an `updated_at` of "1ms earlier than now," the next sync misses it. Mitigation: advance the watermark to the **maximum `updated_at` of rows that just synced**, not to `Date.now()`. (Verify which contrl does — it should be the max, not the wall clock.)
2. **Watermark advances before the upsert is durable on the remote.** If the cursor advances optimistically and the network drops before the row commits, the row is lost from the sync delta. Mitigation: advance the cursor ONLY after a successful upsert response.

The current implementation has a different correctness bug (the all-or-nothing advance — see audit § 6 and the failure-handling drill), but the seam itself is the right place to look for correctness issues.

## How it works

### Move 1 — the mental model

You already know this pattern from log replication and change-data-capture. PostgreSQL's WAL has a `lsn` (log sequence number); replicas track their replayed-LSN and pull WAL records since that LSN. RSS feeds have a `lastBuildDate` and clients pull entries since they last fetched. Mail clients have a UIDVALIDITY + UIDNEXT cursor; they pull only message UIDs above the cursor. **All the same pattern: a monotonic cursor on the sender side; a record of "where I'm caught up to" on the receiver side; pull/push only the delta.**

```
  Pattern — the watermark loop

  ┌─ source side ────────────────────────────────────────────────────────┐
  │  every row carries updated_at (monotonic per row)                     │
  │                                                                        │
  │   sessions: { id: s1, updated_at: 2026-06-01T10:00:00Z, ... }         │
  │   sessions: { id: s2, updated_at: 2026-06-01T10:05:00Z, ... }         │
  │   sessions: { id: s3, updated_at: 2026-06-02T08:00:00Z, ... }         │
  └────────────────────────┬─────────────────────────────────────────────┘
                            │
                            │  watermark for sessions: last_pushed_at = 2026-06-01T10:00:00Z
                            │  (after the first push that included s1)
                            │
  ┌─ sync loop ─────────────▼─────────────────────────────────────────────┐
  │  for each table T:                                                     │
  │     dirty = SELECT * FROM T WHERE updated_at > sync_meta[T]            │
  │     UPSERT dirty into Supabase                                         │
  │     sync_meta[T] = MAX(updated_at of successfully-pushed rows)         │
  │                                                                        │
  │   after this push: cursor = 2026-06-02T08:00:00Z                       │
  │   next push: only NEW writes since then are considered dirty.          │
  └─────────────────────────────────────────────────────────────────────┘
```

### Move 2 — the mechanism, walked

**Step 2.1 — every row gets a monotonic `updated_at`.**

```
  // src/services/database.ts (every write CRUD)

  export async function insertSession(s: WorkoutSession) {
    await db.runAsync(
      `INSERT INTO sessions (id, date, ..., created_at, updated_at)
       VALUES (?, ?, ..., ?, ?)`,
      [s.id, s.date, ..., s.createdAt, s.updatedAt]
    );
    // ★ s.updatedAt is set by the caller to new Date().toISOString().
    pushChanges().catch(...);
  }

  export async function updateSession(s: WorkoutSession) {
    await db.runAsync(
      `UPDATE sessions
       SET ..., updated_at = ?
       WHERE id = ?`,
      [..., new Date().toISOString(), s.id]
    );
    pushChanges().catch(...);
  }
```

Every write bumps `updated_at` to the current wall clock. **The monotonicity assumption is "the clock doesn't go backward."** It can — see "clock skew" in the structure pass — but for a single-device single-user app this is acceptable. The schema cross-link is in `.aipe/study-data-modeling/`.

**Step 2.2 — the cursor table.**

```
  // schema: sync_meta in src/services/database.ts migrate()
  CREATE TABLE sync_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    last_pushed_at TEXT,
    last_pulled_at TEXT
  );
```

One row per table; the cursor is the `last_pushed_at` value. Per-table cursors mean each table advances independently — a sync that succeeds on sessions but fails on exercises shouldn't lose the sessions watermark advance. (Spoiler: the current `pushChanges` bug is exactly this case — see audit § 6 and the failure-handling drill.)

**Step 2.3 — the dirty-rows query.**

```
  // src/services/sync/supabase-sync.ts (approximate)
  async function getDirty(
    table: TableName,
    since: string | null
  ): Promise<Row[]> {
    const sql = since
      ? `SELECT * FROM ${table} WHERE updated_at > ?`
      : `SELECT * FROM ${table}`;          ← first-ever push: everything
    return await db.getAllAsync(sql, since ? [since] : []);
  }
```

When `last_pushed_at` is null (first push ever), the predicate selects everything. After the first successful push, subsequent calls return only the delta.

**Step 2.4 — the upsert and advance.**

```
  // src/services/sync/supabase-sync.ts pushChanges() (the loop)
  for (const table of TABLES) {
    const since = await getWatermark(table);
    const dirty = await getDirty(table, since);
    if (!dirty.length) continue;
    const { error } = await supabase
      .from(table)
      .upsert(dirty.map(toRemote));
    if (error) {
      logErr(error);
      return;                              ← ★ THE BUG (audit § 6, drill)
    }
    // ★ correct version would advance watermark per table here:
    //    await advanceWatermark(table, maxUpdatedAt(dirty));
  }
  // today: advance only on full-pass success
  await advanceAllWatermarks();
```

The `upsert(dirty)` is idempotent — re-running the same upsert is harmless. That's what makes the watermark scheme robust under failure: if a sync crashes after the upsert but before the cursor advance, the next sync re-uploads the same rows. Supabase's PK constraint catches the duplication; the network cost is one extra round-trip's worth of data; the user-visible behavior is "no change." This is the at-least-once delivery property — see `.aipe/study-distributed-systems/03-idempotency-deduplication-and-delivery-semantics.md` (when scaffolded).

### Move 2 variant — the load-bearing skeleton

```
  Skeleton — three parts of "watermark-based incremental sync"

  1. PER-ROW MONOTONIC TIMESTAMP
       every row has an updated_at; writes bump it. monotonicity is
       per-row, not global. (per-table or per-row; per-row is contrl's
       choice.)

  2. PER-TABLE CURSOR (DURABLE)
       sync_meta rows survive app restarts. the cursor is the
       "where I'm caught up to" record on the sender side.

  3. IDEMPOTENT UPSERT
       receiver (Supabase) accepts the same row twice harmlessly.
       this is what makes retry safe — and what makes "advance cursor
       only on success" enough to guarantee at-least-once delivery.
```

Drop #1 (no `updated_at` per row) — you can't tell which rows are dirty; you'd have to track dirtiness with a separate flag column (`is_dirty`) and clear it on push (more failure modes; harder to reason about).

Drop #2 (cursor is ephemeral or wall-clock-based) — every app restart re-uploads everything; reinstalls would force a full re-sync.

Drop #3 (receiver doesn't accept duplicates) — retry isn't safe; failure recovery requires expensive deduplication; the "fire-and-forget catch failure" pattern at the 8 call sites couldn't work because partial failure would leave the receiver in a broken state.

### Move 3 — the principle

> Incremental sync is "remember where you left off." The whole design space — log replication, change-data-capture, RSS, mail UIDs, Supabase Realtime, contrl's watermark loop — comes from one idea: a monotonic cursor on the sender, a durable record on the receiver, and an idempotent delta operation. Pick those three pieces well and the pattern works at any scale; pick any one of them wrong and the pattern doesn't compose.

## Primary diagram

```
  Watermark-based incremental sync — the whole loop

  ╔════════════════════════════════════════════════════════════════════════╗
  ║                              ON DEVICE                                   ║
  ║                                                                          ║
  ║  ┌─ user logs a session ────────────────────────────────────────────┐  ║
  ║  │   useGameState.logSession(session)                                │  ║
  ║  └────────────────────────┬─────────────────────────────────────────┘  ║
  ║                            │                                              ║
  ║  ┌─ src/services/database.ts ──────────────────────────────────────┐    ║
  ║  │                                                                    │    ║
  ║  │   INSERT INTO sessions (..., updated_at) VALUES (..., NOW)         │    ║
  ║  │                                                                    │    ║
  ║  │   ★ updated_at = new Date().toISOString()                          │    ║
  ║  │     (monotonic per row, by wall-clock convention)                  │    ║
  ║  │                                                                    │    ║
  ║  └────────────────────────┬─────────────────────────────────────────┘    ║
  ║                            │  pushChanges().catch(...)                    ║
  ║  ┌────────────────────────▼─────────────────────────────────────────┐    ║
  ║  │  src/services/sync/supabase-sync.ts pushChanges()                │    ║
  ║  │                                                                    │    ║
  ║  │   for each table T in [user_profile, exercises, sessions,         │    ║
  ║  │                          gate_progress, week_progress]:           │    ║
  ║  │                                                                    │    ║
  ║  │     since = await db.getWatermark(T)        ← read sync_meta      │    ║
  ║  │                                                                    │    ║
  ║  │     dirty = await db.getAllAsync(                                  │    ║
  ║  │       `SELECT * FROM ${T} WHERE updated_at > ?`,                  │    ║
  ║  │       [since]                                                      │    ║
  ║  │     )                                                              │    ║
  ║  │                                                                    │    ║
  ║  │     if (!dirty.length) continue;                                  │    ║
  ║  │                                                                    │    ║
  ║  │     { error } = await supabase                                    │    ║
  ║  │                     .from(T)                                       │    ║
  ║  │                     .upsert(dirty.map(toRemote))                  │    ║
  ║  │                                                                    │    ║
  ║  │     if (error) { logErr; return; }   ← ★ the all-or-nothing bug   │    ║
  ║  │                                                                    │    ║
  ║  │   // today: advance watermarks only on full success across tables │    ║
  ║  │   await db.advanceAllWatermarks();                                │    ║
  ║  └─────────────────────────────────────────────────────────────────┘    ║
  ║                                                                          ║
  ║  ┌─ sync_meta table (durable cursor) ────────────────────────────────┐  ║
  ║  │   id │ table_name      │ last_pushed_at      │ last_pulled_at     │  ║
  ║  │  ────┼─────────────────┼─────────────────────┼────────────────── │  ║
  ║  │   1  │ user_profile    │ 2026-06-01T10:00Z  │ 2026-04-15T08:00Z │  ║
  ║  │   2  │ exercises       │ 2026-06-01T10:00Z  │ 2026-04-15T08:00Z │  ║
  ║  │   3  │ sessions        │ 2026-06-01T10:05Z  │ 2026-04-15T08:00Z │  ║
  ║  │   4  │ gate_progress   │ 2026-06-01T10:05Z  │ 2026-04-15T08:00Z │  ║
  ║  │   5  │ week_progress   │ 2026-06-01T10:05Z  │ 2026-04-15T08:00Z │  ║
  ║  │                                                                    │  ║
  ║  │   ★ durable across app restarts                                    │  ║
  ║  │   ★ per-table independence DESIGNED IN (see the bug — code        │  ║
  ║  │     doesn't yet honor it; the audit and drill cover the fix)      │  ║
  ║  └─────────────────────────────────────────────────────────────────┘  ║
  ╚════════════════════════════════════════════════════════════════════════╝
                                  │
                                  ▼  HTTPS REST (Supabase JS client)
  ╔════════════════════════════════════════════════════════════════════════╗
  ║                          SUPABASE POSTGRES                              ║
  ║                                                                          ║
  ║  upsert(rows) — idempotent on PK                                        ║
  ║  receiver state: just the materialized mirror                            ║
  ║                                                                          ║
  ║  ★ no event log, no subscription, no notification back to device        ║
  ║  ★ this is fire-and-forget at the mechanism level too —                 ║
  ║    Supabase doesn't tell the device "I got the row"                     ║
  ║    (the HTTP response is the only signal)                                ║
  ╚════════════════════════════════════════════════════════════════════════╝
```

## Implementation in codebase

### Use cases

The watermark loop runs every time:

- **After any local write** — `pushChanges()` is fired (8 sites in `database.ts`). Most of those calls find few or no dirty rows (the previous push already caught them); the cost is one cheap SELECT per table.
- **On app foreground** — implicit; the next user action triggers a write which triggers `pushChanges`.
- **On reinstall** — `pullRestoreIfFresh` uses the inverse pattern (read everything from Supabase; populate local), then subsequent operation resumes the normal push loop.

### Code, side-by-side

```
  src/services/sync/supabase-sync.ts (approximate)

  export async function pushChanges() {
    if (restoreInProgress) return;                ← skip during restore
                                                     (see audit § 5)

    for (const table of TABLES) {
      const since = await getWatermark(table);    ← read sync_meta.last_pushed_at
                                                     for this table

      const dirty = await db.getAllAsync(         ← the dirty-rows SELECT
        `SELECT * FROM ${table}                      this is THE correctness
         WHERE updated_at > ?`,                       seam — if this predicate
        [since]                                       misses a row, the row
      );                                              never syncs.

      if (!dirty.length) continue;                ← cheap path; common case
                                                     after the first push

      const { error } = await supabase            ← the mutation
        .from(table)
        .upsert(dirty.map(toRemote));             ← idempotent (PK conflict
                                                     would update); safe to
                                                     retry

      if (error) {
        logErr(error);
        return;                                   ← ★ THE BUG: drops tables
                                                     after this one. fix:
                                                     accumulate { succeeded,
                                                     failed } and advance per-
                                                     table watermark.
                                                     (drill at .aipe/drills/
                                                     failure-handling-sync-
                                                     partial-failure.md)
      }
    }

    // today: only runs if all tables succeeded
    await db.advanceAllWatermarks();              ← advance to "now"; should
                                                     advance to max(updated_at)
                                                     of pushed rows to avoid
                                                     clock-skew gaps
  }
```

**Where to verify:** open `src/services/sync/supabase-sync.ts` and find `pushChanges`. Look at three things:

1. Is the SELECT predicate `WHERE updated_at > ?`? (Yes — it's the watermark scheme.)
2. Does the watermark advance per-table or all-or-nothing? (Today: all-or-nothing — that's the bug.)
3. Does the watermark advance to `Date.now()` or to `max(updated_at)` of dirty rows? (Verify; the correct version uses max of dirty rows to avoid clock-skew gaps.)

## Elaborate

The watermark scheme is one of those patterns that looks almost too simple until you compare it to the alternatives. The naive alternative — push the whole table every time — works perfectly and costs you nothing in dev time, until you have a thousand sessions and every set re-uploads them. The clever alternative — Supabase Realtime + subscription + per-row events — works well but introduces a stateful subscription, a backpressure problem, and a "what if the subscription dropped while you were offline?" recovery story. Incremental with a watermark sits in the middle: O(delta) cost, robust against network drops (next push catches up), no subscription state to manage, no event log to replay.

The pattern's history is older than databases as we know them — bank ledgers used "as-of" cursors before computers — and the specific name "watermark" comes from streaming systems (Apache Beam, Flink, Kafka), where it's a hard correctness primitive for windowed aggregations under late-arriving data. contrl's use is simpler than streaming-system watermarks (no late-arriving data; one writer; wall clock is fine), but the kernel is the same: a monotonic value that says "everything below this is caught up."

A note on the **per-row vs per-table** axis. contrl chose per-row `updated_at` (every row has its own timestamp) plus per-table `last_pushed_at` (the cursor is one row per table in `sync_meta`). The alternative would be per-row `is_dirty` flag (no timestamps; sync clears the flag on push). Both work; the timestamp version composes better with future "show me what changed since X" queries (auditing, undo, time-travel), and it's cheaper to maintain (every row already has timestamps for `created_at`/`updated_at`; you're not adding a column). The flag version requires an extra UPDATE per push to clear flags, which is more I/O. Contrl's choice is the more standard one in modern systems.

The **clock-skew gap** is worth understanding even if it's not biting today. Imagine: 10:00:00.000 — write row A; updated_at = 10:00:00.000. 10:00:00.500 — push starts; SELECT WHERE updated_at > 09:59:55. Returns row A. UPSERT succeeds at 10:00:01.000. ADVANCE watermark to `Date.now()` = 10:00:01.500. Meanwhile at 10:00:00.999, a concurrent write commits row B with updated_at = 10:00:00.999. **Next push: SELECT WHERE updated_at > 10:00:01.500 — row B is missed.** The fix is to advance the watermark to `max(updated_at of pushed rows)`, not to `Date.now()`. This guarantees no row with a timestamp ≤ the cursor is missed, because the cursor only advances to a timestamp that was actually observed. Verify which contrl does; if it's `Date.now()`-based, this is a latent bug that doesn't bite at single-writer scale but becomes a real concern at multi-writer.

## Interview defense

**Q: "How does your sync work?"**

```
  ┌─ The mechanism ────────────────────────────────────────────────┐
  │  Watermark-based incremental sync. Every row in every table   │
  │  has an updated_at timestamp; the sync layer maintains a       │
  │  per-table cursor in sync_meta.last_pushed_at. On each sync,  │
  │  for each table, SELECT WHERE updated_at > cursor; UPSERT     │
  │  the result to Supabase; advance the cursor. UPSERT is        │
  │  idempotent on the primary key, so retry on partial failure   │
  │  is safe.                                                      │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ Why this shape ───────────────────────────────────────────────┐
  │  Local-first means writes always commit locally first; sync   │
  │  is opportunistic. The watermark makes opportunistic-sync     │
  │  affordable at scale — only the delta crosses the network,    │
  │  not the whole table. Per-table cursors mean each table can   │
  │  advance independently; failures on one table don't lose the  │
  │  others' progress (... in principle; there's a current bug    │
  │  where the advance is all-or-nothing, which I have a drill    │
  │  for).                                                         │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: *"monotonic timestamp + durable cursor + idempotent upsert = at-least-once incremental sync."*

**Q: "What if the watermark advance succeeds but the row didn't actually reach the cloud?"**

That's the order-of-operations concern. The current code advances the cursor *only* on a successful upsert response — the Supabase JS client doesn't tell you "the row hit the disk in the cloud," but it does say "the API accepted the upsert." That's sufficient at MVP scale; in a stricter system you'd want a transactional "advance cursor AND get the upsert ack" boundary, possibly via a Supabase Edge Function that does both server-side. Today's risk is bounded by Supabase's own durability guarantees, which are strong for a hosted Postgres.

**Q: "What about clock skew?"**

Wall-clock-based cursors have a known gap: if a write commits concurrent with a cursor-advance, and the cursor advances to a timestamp later than the write's `updated_at`, the write is missed. The fix is to advance the cursor to `max(updated_at)` of the rows you just pushed — that guarantees you only advance to a timestamp you've actually observed and synced. I should verify which approach contrl is using; if it's `Date.now()`-based, that's a latent bug. At single-writer scale it doesn't bite, but it's the kind of thing a senior reviewer would catch.

**Q: "Could you use Supabase Realtime instead?"**

Yes, for the cloud-to-device direction — if Phase 4 multi-device becomes a real requirement, Realtime subscriptions on the 5 sync tables would push changes from one device to others within seconds, beating the current "no cloud-to-device pull except on reinstall." For the device-to-cloud direction, Realtime is the wrong shape — it's a subscription transport, not a write API. The watermark scheme stays.

## Validate

1. **Reconstruct.** Draw the watermark loop from memory: row write → SELECT predicate → UPSERT → cursor advance. Mark the seam where correctness could break.
2. **Explain.** Why does this pattern need *both* per-row `updated_at` AND per-table `last_pushed_at`? Why not just one or the other?
3. **Apply.** A teammate adds a new table `coaching_log` (Phase 4). What's the minimum set of changes to integrate it into the watermark scheme? (Answer: add `created_at` + `updated_at` columns; add a row to `sync_meta` for the table; add the table name to `TABLES` in supabase-sync.ts; ensure mapper.ts handles to/from remote.)
4. **Defend.** Argue that `Date.now()`-based watermark advance is fine because contrl is single-writer. Then rebut by naming the future scenario where it bites.

## See also

- [00-overview.md](./00-overview.md) — the architecture map
- [01-local-first-canonical-with-cloud-mirror.md](./01-local-first-canonical-with-cloud-mirror.md) — the polarity choice this mechanism serves
- [03-reconstruct-on-reinstall.md](./03-reconstruct-on-reinstall.md) — the inverse direction (cloud → device) that this loop's per-table independence helps survive
- [audit.md § 6 failure-handling-and-reliability](./audit.md#6-failure-handling-and-reliability) — the all-or-nothing-advance bug
- [audit.md § 7 scale-bottlenecks-and-evolution](./audit.md#7-scale-bottlenecks-and-evolution) — what changes when sync frequency grows
- `.aipe/drills/failure-handling-sync-partial-failure.md` — the hands-on drill that fixes the partial-failure bug at this layer
- `.aipe/study-distributed-systems/03-idempotency-deduplication-and-delivery-semantics.md` (when scaffolded) — the at-least-once delivery property idempotent upsert provides
- `.aipe/study-database-systems/` — the WAL/snapshot mechanics under expo-sqlite that make per-row timestamps durable
