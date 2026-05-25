# Incremental indexing

**Industry name(s):** Incremental indexing, online indexing, streaming ingestion, change-data-capture for vectors
**Type:** Industry standard

> Production corpora grow continuously. Re-indexing the whole corpus on every change is impractical at scale. Incremental indexing: new docs are embedded and added to the live index; deleted docs are removed; edited docs are re-embedded and replaced. The vector DB handles this concurrently with reads. Without it, your retrieval is always stale relative to current content.

**See also:** → [04-vector-databases](./04-vector-databases.md) · → [09-stale-embeddings](./09-stale-embeddings.md) · → [11-rag](./11-rag.md)

---

## Why care

**Move 1.** Your knowledge base has a daily batch indexing job — every night, re-embed everything, rebuild the index. Takes 2 hours. Works fine at 100K docs. Six months in, corpus is 5M docs; job takes 12 hours, and content edited at 9 AM doesn't make it to retrieval until 9 PM. The 12-hour staleness window is the operational bug.

**Move 2.** That "keep the index fresh as corpus changes" question is what incremental indexing answers. New / edited / deleted docs reflect in retrieval within seconds, not hours. The vector DB supports concurrent writes (insert/update/delete) alongside reads.

**Why you need to answer that question at all:** Two failures hide in batch-only indexing. First, **staleness window** — production users can't find content that exists. Second, **scaling pain** — full re-index time grows with corpus; at some point, batch becomes infeasible.

**Move 5.** Incremental indexing is what real-time replication is for databases — keep the read replica current without full restore each cycle.

---

## How it works

### Move 1 — The mental model

Three operations the index must support concurrently with reads:

- **Insert**: new doc → embed → write vector + metadata to index.
- **Update**: edited doc → re-embed → replace vector (or delete + insert).
- **Delete**: removed doc → remove vector from index.

Modern vector databases (Qdrant, Weaviate, Pinecone) handle all three online. The discipline is wiring document-change events to the indexing pipeline.

Strategy in plain English: **document change → embed pipeline → vector DB update. Run continuously, not in batches.**

---

### Move 2 — The layered walkthrough

#### Change-data-capture (CDC) pipeline

The source of truth (database, document store, S3 bucket) emits change events; the indexer consumes:

```
  Source: PostgreSQL with logical replication (or equivalent CDC)
         │ INSERT / UPDATE / DELETE events
         ▼
  Change queue (Kafka, SQS, or simple in-process queue)
         │ events with doc id + operation type
         ▼
  Indexer worker:
    For INSERT: fetch doc, chunk, embed, upsert
    For UPDATE: re-fetch, re-chunk, re-embed, upsert (replaces existing)
    For DELETE: delete vectors by doc id
         │
         ▼
  Vector DB (Qdrant / Pinecone / Weaviate)
```

For lower-scale projects: simpler — webhook from CMS, or polling the source on a schedule, or direct in-process triggers.

---

#### Lag and consistency

Incremental indexing has lag — time from doc change to vector update. Typical:

```
  Indexing lag at different scales
  
  ┌─────────────────────────┬──────────────────────┐
  │ Scale                   │ Typical lag           │
  ├─────────────────────────┼──────────────────────┤
  │ Solo / small (low write)│ seconds               │
  │ Mid (10s of writes/sec)│ tens of seconds       │
  │ High (100+ writes/sec)  │ minutes (queue-driven)│
  └─────────────────────────┴──────────────────────┘
```

Define and monitor lag. Users complaining about staleness usually means lag exceeded their tolerance.

---

#### Delete and replace handling

Edited docs are common; the pattern: chunk and re-embed the entire doc, replace ALL chunks for that doc.

```
  On doc edit:
    1. delete vectors WHERE source_doc_id = doc.id
    2. for each new chunk:
         vector = embed(chunk)
         insert into index with source_doc_id = doc.id
```

Some vector DBs support atomic "replace all by metadata" operations; others require explicit delete-then-insert. Check provider.

---

#### Batch vs streaming tradeoff

Some teams choose batch for cost reasons:
- Embedding cost amortizes (batch API often cheaper).
- Indexing overhead (HNSW rebuild) is real per-insert.

Streaming for freshness reasons:
- Users see current content.
- No "indexing window" tied to deployment cadence.

Most production teams land on streaming for the core surface + periodic batch rebuilds when major structural changes happen (chunking strategy, embedding model).

---

#### Common pitfalls

- **Forgetting deletes.** Easy to insert; easy to forget to remove vectors for deleted docs. Stale results = phantom data.
- **Doc-edit detection.** Without hashes on source content, you may re-embed docs that didn't change. Hash tracking saves the cost.
- **Embedding errors mid-pipeline.** A failed embedding call shouldn't leave the index inconsistent. Idempotent upserts + retry policy.

---

### Move 3 — The principle

Production corpora are continuous; indexing must be continuous too. Batch re-indexing scales poorly past mid-size corpora. The discipline: CDC pipeline + incremental updates + observability on lag. Vector DBs support this natively; the work is wiring document-change events to the pipeline.

---

## Incremental indexing — diagram

```
┌─ Source of truth ────────────────────────────────────────────────────────────┐
│                                                                              │
│   Document store (DB / CMS / S3)                                             │
│   INSERT / UPDATE / DELETE events                                            │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ CDC / webhook / polling
                                      ▼
┌─ Change queue ───────────────────────────────────────────────────────────────┐
│                                                                              │
│   Event: { doc_id, operation, timestamp }                                    │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Indexer worker ─────────────────────────────────────────────────────────────┐
│                                                                              │
│   INSERT: fetch → chunk → embed → upsert                                     │
│   UPDATE: delete vectors → re-chunk → re-embed → upsert                      │
│   DELETE: delete vectors by source_doc_id                                    │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ writes
                                      ▼
                            Vector DB
                            (handles concurrent reads)
```

---

## In this codebase

**Case B — contrl has no corpus.**

---

## Elaborate

**Where this pattern comes from.** Real-time indexing is standard in search infrastructure (Elasticsearch, Solr). Applied to vector DBs since they emerged in 2021+.

**The principle.** Production data is continuous; static snapshots of it grow stale. Indexing must keep up. Same pattern as cache invalidation, replication, real-time analytics.

**Where it breaks down.** Tiny corpora that change rarely (a one-time document upload that's never edited) — a one-shot batch index is fine.

---

## Tradeoffs

| Cost dimension | Incremental indexing | Batch re-index nightly |
|---|---|---|
| Staleness window | Seconds to minutes | Up to 24 hours |
| Operational complexity | CDC pipeline + worker | Cron job |
| Scaling cost at 5M docs | Linear with change rate | Quadratic (full rebuild grows) |
| Embedding cost | Per-change (small batches) | Per-document, batched (efficient) |

### Sub-block 1 — what we gave up

Operational complexity. CDC pipelines, queue management, retry handling, lag monitoring. Real engineering work; pays back at scale.

### Sub-block 2 — batch cost at scale

Documented: batch re-index time grows with corpus; eventually exceeds the available window (overnight 12 hours → can't ship same-day edits). Users notice. Migration to incremental is forced; better to have started there.

### Sub-block 3 — the breakpoint

Incremental is the right call once corpus exceeds ~100K docs OR change rate exceeds a few edits/hour. Below those, batch is fine.

---

## Tech reference

### Vector DB built-in incremental support

- **Qdrant, Weaviate, Pinecone, Milvus** — all support concurrent insert/update/delete with reads.

### CDC tools

- **Postgres logical replication** — for Postgres-source corpora.
- **Debezium** — for multi-source CDC across MySQL, Mongo, etc.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Incremental indexing keeps the vector index current as the source corpus changes. CDC pipeline + worker that handles INSERT/UPDATE/DELETE events. Lag is the operational metric. Required at scale; over-engineering for tiny corpora.

**Key points:**

- **CDC pipeline** wires doc changes to indexing.
- **Modern vector DBs** support concurrent writes.
- **Lag is the metric** — staleness window before a change reflects in retrieval.
- **Hashes detect "actually changed"** to avoid wasted re-embeddings.
- **For contrl: not applicable.**

---

## Interview defense

**[mid] Why not just re-index nightly?**

Staleness window. Users can't find content they just created. Also: re-index time grows with corpus; eventually exceeds the available window.

**[senior] How do you keep the index consistent under concurrent writes and reads?**

Vector DBs handle this natively — most provide ACID-style semantics on individual vector updates. The application discipline is idempotent upserts (re-running the same insert doesn't double-add) and CDC reliability (don't lose events).

---

## Validate

**Level 1:** Draw CDC → queue → worker → vector DB.
**Level 2:** "Why incremental indexing?" Under 30 seconds.
**Level 3:** A teammate's batch re-index takes 12 hours. Recommend migration. (CDC pipeline; worker; vector-DB native incremental.)
**Level 4:** Defend batch indexing for a specific case.

**Quick check:**
- Three operations needed? (Insert, update, delete.)
- The operational metric? (Indexing lag.)
- Does contrl need this? (No.)
