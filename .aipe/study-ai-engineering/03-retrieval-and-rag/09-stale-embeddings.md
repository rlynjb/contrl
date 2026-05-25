# Stale embeddings

**Industry name(s):** Stale embeddings, embedding drift, embedding versioning, re-embedding migration
**Type:** Industry standard

> Embedding models upgrade; documents change; corpora grow. Vectors that were embedded last year with model v1 don't compose with vectors embedded today with model v2 — they live in different spaces. The discipline is tracking embedding-version per vector and managing migrations: parallel-run during transition, eventually deprecate the old model.

**See also:** → [02-embedding-model-choice](./02-embedding-model-choice.md) · → [10-incremental-indexing](./10-incremental-indexing.md) · → [04-vector-databases](./04-vector-databases.md)

---

## Why care

**Move 1.** You embedded 1M documents with `text-embedding-ada-002` in 2023. A new model, `text-embedding-3-large`, launched and benchmarks substantially better. You upgrade — but now half your corpus is v1 vectors and half is v2; cosine similarity across versions is meaningless. Retrieval breaks.

**Move 2.** That "vectors from different model versions don't compose" question is what stale-embeddings discipline addresses. Each vector carries its embedding version; cross-version comparisons are explicitly disallowed; migrations are planned events with parallel-run windows.

**Why you need to answer that question at all:** Embeddings live in your storage. Models change. Documents change. Without versioning, you can't tell what's stale, what's current, or whether retrieval scores are meaningful. The discipline is record-keeping at the vector level.

**Move 5.** Stale embeddings are what database migrations are for schemas — you can't just change the format and hope; track versions, plan migrations.

---

## How it works

### Move 1 — The mental model

Each stored vector carries metadata about how it was produced:

```
  Vector record schema
  
  {
    id: "doc_123__chunk_4",
    vector: [0.12, -0.05, ...],
    embedding_model: "text-embedding-3-large",
    embedding_model_version: "2024-01-25",
    embedded_at: "2026-05-15T10:30:00Z",
    source_doc_hash: "abc123...",  ← changes if doc text changes
    text: "...",
    metadata: {...}
  }
```

Strategy in plain English: **track embedding version per vector. Only compare same-version vectors. Plan migrations explicitly.**

---

### Move 2 — The layered walkthrough

#### Causes of staleness

1. **Embedding model upgrade.** New model launched; you want to switch. Old vectors are in v1 space; new vectors would be in v2. Either re-embed everything or run parallel.

2. **Document content changed.** A doc was edited. Its current text differs from what was embedded. The stored vector represents stale text.

3. **Chunking strategy changed.** You decided 800-token chunks beat 500. Old vectors represent old chunks.

Each cause has a different fix.

---

#### Migration patterns

**Re-embed everything (full migration).**

For doc edits: re-embed the changed docs. For model upgrade: re-embed the entire corpus.

```
  Full migration
  
  For each doc:
    new_vector = embed_v2(doc.text)
    write_to_db({...doc, vector: new_vector, embedding_model: "v2"})
  Delete v1 vectors.
  Update retrieval code to use v2.
```

Cost: depends on corpus size × embedding price. At 1M docs × 500 tokens × $0.13/1M = $65. Plus engineering work.

Downtime: ideally none. Either:
- Parallel-write: write v2 alongside v1; switch retrieval atomically.
- Backfill window: re-embed in background; switch retrieval when done.

---

**Parallel-run window.**

For model upgrades where you want to evaluate the new model on production traffic before committing:

```
  Parallel run
  
  Write path: embed with BOTH v1 and v2; store both vectors
  Read path: route X% of traffic to v2; rest to v1
  Compare retrieval quality on the eval set
  
  When confidence in v2: ramp X to 100%
  Then: stop writing v1; eventually delete v1 vectors
```

Cost: 2x embedding cost during parallel-run window; 2x storage. Worth it when the upgrade is risky and you need eval evidence.

---

**Selective re-embedding.**

For partial updates (a subset of docs changed):

```
  Triggered by document change events
  
  On doc edit:
    new_hash = hash(doc.text)
    if new_hash != stored_hash:
      new_vector = embed(doc.text)
      update_vector(doc.id, new_vector, embedded_at: now())
```

Requires hash tracking. Common pattern.

---

#### Detecting stale vectors

Without versioning, you can't tell what's stale. With versioning, queries can filter:

```sql
-- Find vectors embedded with the old model
SELECT id FROM vectors WHERE embedding_model_version != '2024-01-25';

-- Find vectors whose source doc has been edited since embedding
SELECT v.id FROM vectors v
JOIN documents d ON v.source_doc_id = d.id
WHERE v.embedded_at < d.updated_at;
```

Background job: nightly, find and re-embed stale vectors.

---

#### Versioning best practices

- **Store the model name AND version.** `text-embedding-3-large` plus `2024-01-25` (or whatever the model's published version identifier is).
- **Hash the source content.** Lets you detect "doc was edited" without comparing full text.
- **Embedded-at timestamp.** Audit trail.
- **Reject cross-version comparisons.** Application code rejects retrieval results from vectors of different versions if it expects them to compose.

---

### Move 3 — The principle

Embeddings are stored artifacts of a model + content at a point in time. Either evolves and the stored vector is stale. Versioning makes staleness detectable and migration planable. Without it, you have a corpus of vectors and no way to know which represent current content with current model. Treat embeddings like any other versioned cached computation.

---

## Stale embeddings — diagram

```
┌─ Vector record with versioning ──────────────────────────────────────────────┐
│                                                                              │
│   {                                                                          │
│     id: "doc_123__chunk_4",                                                  │
│     vector: [0.12, ...],                                                     │
│     embedding_model: "text-embedding-3-large",                               │
│     embedding_model_version: "2024-01-25",                                   │
│     embedded_at: "2026-05-15T10:30:00Z",                                     │
│     source_doc_hash: "abc123..."                                             │
│   }                                                                          │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
        Doc text changed?                         Model version changed?
        (compare hash)                            (compare metadata)
                  │                                       │
                  ▼                                       ▼
        re-embed this doc                       plan migration:
                                                   - parallel run
                                                   - background backfill
                                                   - eventual cutover
```

---

## In this codebase

**Case B — contrl has no vector corpus.**

---

## Elaborate

**Where this pattern comes from.** Caching invalidation discipline applied to embeddings. The pattern is well-established; the LLM-era twist is the fast model release cadence — embedding models upgrade often enough that the migration discipline matters.

**The principle.** Stored derived data needs versioning. Same as schema migrations, build artifacts, cached responses — anywhere a derived value depends on a producer that can change, version both.

**Where it breaks down.** Tiny corpora where re-embedding is fast/free; the discipline is overhead.

---

## Tradeoffs

(Single sub-block: track versions or don't. Almost always: track.)

---

## Tech reference

### Embedding model version strings

- **OpenAI**: `text-embedding-3-large@2024-01-25` style identifiers.
- **Anthropic**: model strings + date stamps.

### Background re-embedding jobs

- **Hand-rolled**: scheduled job querying for stale records, re-embedding in batches.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Stale embeddings come from model upgrades, doc edits, or chunking-strategy changes. Each needs a different fix; all require version tracking. Migrations are planned events: parallel-run or background-backfill. Without versioning, you can't tell what's stale; with it, migration is a managed process.

**Key points:**

- **Track embedding model + version per vector.**
- **Hash source content** to detect doc-edit staleness.
- **Plan migrations** — parallel-run or background backfill.
- **Reject cross-version comparisons** in application code.
- **For contrl: not applicable.**

---

## Interview defense

**[mid] Why version embeddings?**

Because models change, content changes, chunking changes. Without per-vector version metadata, you can't tell what's current; cross-version retrieval scores are meaningless.

**[senior] How do you migrate when the embedding model upgrades?**

Plan: parallel-run window (write both versions, route traffic gradually) or background backfill (re-embed corpus, swap atomically). Pick based on risk and cost tolerance.

---

## Validate

**Level 1:** Draw vector record schema with versioning fields.
**Level 2:** "What's a stale embedding?" Under 30 seconds.
**Level 3:** A teammate upgraded the embedding model but didn't re-embed. Retrieval is broken. Diagnose. (Vectors in two incompatible spaces.)
**Level 4:** Defend background backfill over parallel-run for a specific scenario.

**Quick check:**
- What three causes of staleness? (Model upgrade, doc edit, chunking change.)
- Versioning fields per vector? (model, version, embedded_at, source_hash.)
- Does contrl have stale embedding concerns? (No — no corpus.)
