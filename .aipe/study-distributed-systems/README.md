# study-distributed-systems — contrl

Per-codebase distributed-systems guide. Curriculum-style: nine fixed concepts,
walked through the lens of contrl's actual coordination boundary — on-device
SQLite as source of truth, Supabase as a write-mostly mirror, and the sync
engine that stitches them together.

```
  The through-line of every file in this folder

  ┌──────────────────────────────────────────────────────────┐
  │  what remains correct when coordination crosses a        │
  │  boundary and any participant can be slow, duplicated,   │
  │  stale, or unavailable?                                  │
  └──────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
       device / network    sync engine    Supabase cloud
       (SQLite, RN)        (writer of     (single project,
                            both sides)    shared schema)
```

contrl is mostly a single-device, single-user system today. That doesn't
mean the distributed-systems concepts don't apply — it means many of them
apply *hypothetically*. You'll see `not yet exercised` honestly named all
through this guide. The point is to know which concepts your current shape
already exercises, which are dormant but coming, and which will only matter
once you add a second device or a real auth boundary.

## Reading order

Each file uses the full `format.md` template: Zoom out → Structure pass →
How it works → Primary diagram → Implementation in codebase → Elaborate →
Interview defense → Validate → See also.

```
  Where to start              What you'll learn
  ────────────────            ─────────────────────────────────────
  00-overview.md              the coordination map + ranked findings
                              + the "not yet exercised" honesty list
                                                │
                                                ▼
  01-distributed-system-map   nodes, boundaries, messages, ownership
                                                │
                                                ▼
  02-partial-failure-...      what happens when Supabase is slow,
                              unreachable, or returns 500
                                                │
                                                ▼
  03-idempotency-...          why your upserts survive duplicate runs;
                              at-least-once delivery semantics
                                                │
                                                ▼
  04-consistency-models-...   eventual consistency; the read-your-
                              writes guarantee you do NOT have
                                                │
                                                ▼
  05-replication-...          what's not yet exercised, and the
                              shape it'll take if you add it
                                                │
                                                ▼
  06-queues-streams-...       there's no broker — but pushChanges()
                              IS your queue. Walk that mental model.
                                                │
                                                ▼
  07-clocks-coordination-...  client wall-clock as watermark; what
                              breaks the day you have two writers
                                                │
                                                ▼
  08-sagas-outbox-...         logSession()'s 6 sequential awaits with
                              no transaction; what compensating logic
                              would even look like
                                                │
                                                ▼
  09-distributed-systems-     ranked risks grounded in the repo —
  red-flags-audit.md          the things that'll bite first
```

## The concept partition

Distributed-systems content belongs in this folder. Adjacent concerns live
elsewhere — cross-link, don't restate:

```
  topic                                lives in
  ─────                                ────────
  WAL, MVCC, isolation                 study-database-systems
  schema shape, indexes                study-data-modeling
  service architecture, boundaries     study-system-design
  HTTP / TLS / DNS / timeouts at the   study-networking
    transport layer
  loops, async, cancellation in the    study-runtime-systems
    JS runtime
  ─────────────────────────────────────────────────────────────────
  correctness across coordination      study-distributed-systems
  boundaries (this folder)             (you are here)
```

## What's actually exercised in contrl today

Verdict-first: the only coordination boundary that's live is **device ↔
Supabase**. There is one writer (the device), one mirror (the cloud),
no replicas, no shards, no queue, no leader election, no second client,
no streaming, no exactly-once primitive. The sync engine is a periodic
push-pull driven by app lifecycle and individual writes, not a daemon
and not an event log.

```
  EXERCISED                      NOT YET EXERCISED
  ─────────                      ─────────────────
  partial failure (silent)       multi-writer reconciliation
  at-least-once delivery         vector clocks / logical time
  idempotent upserts             leader election / leases
  eventual consistency           queue / stream / broker
  tombstones for deletes         backpressure
  watermark push                 read replicas / quorum reads
  conditional restore on pull    partitioning / sharding
                                 circuit breakers
                                 sagas with compensation
                                 transactional outbox
                                 dead-letter handling
```

That contrast IS the lesson. Files 02, 03, 04 walk what's there. Files 05,
06, 07, 08 walk what's missing and why it isn't there yet. File 09 ranks
the risks the current shape creates.

## How to use this folder

You're a frontend engineer pivoting into AI engineering, and your distributed-
systems exposure is "I shipped sync once" — buffr (SQLite+Supabase, same
shape), and now contrl. You don't need the textbook treatment of Paxos. You
need to recognise the failure modes your existing code already has, the
ones it will have the moment you add a second device, and the vocabulary
to defend the design in an interview.

Each file ends with a `Validate` block that names a real file and line range
in this repo. If you can open the file and tell yourself the story without
opening the guide, the concept has landed. If not, walk back to the diagram.

## See also

- `.aipe/study-database-systems/` — WAL, MVCC, durability inside SQLite
- `.aipe/study-data-modeling/` — `sync_meta`, `sync_state`, `sync_deletions`
  schema shape
- `.aipe/study-system-design/` — the local-first-with-cloud-mirror pattern
- `.aipe/study-networking/` — Supabase client transport, HTTPS, retries
- `.aipe/project/context.md` — sync rules, what must not change
