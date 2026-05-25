# Vector databases

**Industry name(s):** Vector database, vector store, vector index, approximate nearest neighbor (ANN) search
**Type:** Industry standard

> Specialized storage and search for high-dimensional vectors. Find the top-K most-similar vectors to a query in milliseconds across millions of records. Two architectural choices: managed (Pinecone, Weaviate Cloud) vs self-hosted (Qdrant, Milvus, pgvector). Plus algorithmic choices: exact search (slow but accurate) vs approximate (HNSW, IVF — fast with tunable recall).

**See also:** → [01-embeddings](./01-embeddings.md) · → [03-chunking-strategies](./03-chunking-strategies.md) · → [10-incremental-indexing](./10-incremental-indexing.md)

---

## Why care

**Move 1.** You have 1M embedded documents and a query vector. Find the 10 most-similar. Linear scan: compute cosine similarity against every doc, sort. At 1M × 768 dims × float32, that's ~3GB scanned per query, ~500ms+. At 10 queries/sec, your CPU is saturated. Linear scan doesn't work at scale.

**Move 2.** That "how to find nearest vectors fast at scale" question is what vector databases answer. Specialized indexes (HNSW, IVF) trade exact accuracy for orders-of-magnitude speed gains. Tens of milliseconds per query across millions of docs.

**Why you need to answer that question at all:** Two failures hide in naive storage. First, **linear scan doesn't scale** — beyond ~10K docs, latency hurts. Second, **rolling your own ANN** is a multi-week research project; battle-tested libraries / databases beat hand-rolled.

**Move 5.** Vector databases are what B-tree indexes are for SQL — without them, every query is a full scan; with them, queries scale to millions of records.

---

## How it works

### Move 1 — The mental model

Approximate nearest neighbor (ANN) algorithms build a navigable graph or partition structure over the vectors at index time. At query time, traverse the structure to find nearby vectors without scanning everything.

```
  Index build (one-time)            Query (per request)
  ──────────────────────             ────────────────────────────
  Insert vectors into index         Traverse index from entry point
  Build graph / partitions          Visit ~log(N) vectors instead of N
  ~1-5x storage overhead             Return top-K candidates
                                     Cosine-similarity-rank them
                                     ~10-50ms at 1M-doc scale
```

Strategy in plain English: **specialized index + ANN algorithm → milliseconds per query at millions of docs scale.**

---

### Move 2 — The layered walkthrough

#### ANN algorithms in brief

**HNSW (Hierarchical Navigable Small World)** — a multi-layer graph where each layer is progressively sparser. Search starts at top, descends. Recall (% of true top-K returned) tunable via `M` and `efConstruction` parameters. Most common modern choice.

**IVF (Inverted File)** — partition vectors into clusters; search only relevant clusters. Faster build than HNSW; slightly lower recall.

**Product Quantization (PQ)** — compress vectors (e.g., 768 floats → 64 bytes). Lower storage; slightly lower recall. Often combined with HNSW or IVF.

For production:
- < 1M vectors: HNSW with default settings; high recall (>95%); low latency.
- 1M-100M vectors: HNSW + PQ; balance speed and storage.
- > 100M vectors: specialized solutions (FAISS distributed, hosted services).

---

#### Managed vs self-hosted

```
  Managed vs self-hosted (2026)
  
  ┌─────────────────────────┬──────────────────────┬──────────────────────┐
  │ Option                  │ Pros                 │ Cons                  │
  ├─────────────────────────┼──────────────────────┼──────────────────────┤
  │ Pinecone (managed)      │ Zero ops             │ Cost; vendor lock-in  │
  │ Weaviate Cloud (managed)│ Zero ops             │ Cost                  │
  │ Qdrant Cloud or self    │ Open-source          │ Self-host = real ops  │
  │ Milvus                  │ Open-source, mature  │ Heavier than Qdrant   │
  │ pgvector (Postgres ext) │ Reuse existing DB    │ Slower at 10M+ scale  │
  │ Chroma                  │ Lightweight, embedded│ Less mature           │
  └─────────────────────────┴──────────────────────┴──────────────────────┘
```

For solo / small teams without ops capacity: managed.
For teams with infra and self-host capacity: open-source self-hosted.
For projects that already have Postgres: pgvector is the cheap-start option.

---

#### Metadata filtering

Real RAG queries often combine semantic search with metadata filters: "find docs about X authored after 2024-01-01 by Alice." Vector databases support this differently:

- **Pre-filter**: filter by metadata first, then ANN search the filtered set. Best when filter is selective (returns <10% of corpus).
- **Post-filter**: ANN search first, then filter top-K. Best when filter is broad.
- **Hybrid**: some databases support filter-aware ANN (e.g., Qdrant's filtered HNSW).

Choosing the right strategy per query matters at scale.

---

#### Vector + keyword (hybrid) search

Often you want both semantic similarity AND keyword match. Covered in [05-dense-vs-sparse](./05-dense-vs-sparse.md) and [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md). Most modern vector DBs support both modes (or integrate with BM25 indexes alongside).

---

#### Scale thresholds

```
  Scale → architecture
  
  ┌──────────────────────────────┬──────────────────────────────────┐
  │ Corpus size                  │ Architecture                      │
  ├──────────────────────────────┼──────────────────────────────────┤
  │ < 10K vectors                │ In-memory; even Python dict works │
  │ 10K - 100K                   │ pgvector or Chroma; in-process    │
  │ 100K - 1M                    │ Qdrant / Weaviate self-hosted     │
  │ 1M - 100M                    │ Managed (Pinecone, Weaviate Cloud)│
  │ > 100M                       │ Distributed (FAISS-cluster, Milvus│
  │                              │ on Kubernetes)                    │
  └──────────────────────────────┴──────────────────────────────────┘
```

Most projects sit in the < 1M range; the choice is mostly between pgvector (cheap) and Qdrant/Weaviate (purpose-built).

---

### Move 3 — The principle

Vector databases convert nearest-neighbor search from O(N) to O(log N) via ANN indexes (HNSW, IVF). Choice axes: managed vs self-host, algorithm, recall-vs-speed tuning, metadata filter support. For small projects: pgvector or embedded options. For production scale: purpose-built vector databases.

---

## Vector databases — diagram

```
┌─ Index build (one-time, per insert) ─────────────────────────────────────────┐
│                                                                              │
│   Vector + metadata                                                          │
│         │                                                                    │
│         ▼ insert into vector DB                                              │
│   ┌───────────────────────────────────────────┐                              │
│   │ HNSW index                                 │                              │
│   │   layer N: sparsest, longest hops          │                              │
│   │   layer N-1: ...                           │                              │
│   │   layer 0: densest, full vectors           │                              │
│   └───────────────────────────────────────────┘                              │
│         + metadata index (B-tree, inverted)                                  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ query time
                                      ▼
┌─ Query ──────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Query: { vector, filter, top_k }                                           │
│         │                                                                    │
│         ▼                                                                    │
│   Optional: metadata filter (pre-filter if selective)                        │
│         │                                                                    │
│         ▼ traverse HNSW from entry point                                     │
│   Visit ~log(N) vectors                                                      │
│         │                                                                    │
│         ▼                                                                    │
│   Top-K by cosine similarity                                                 │
│         │                                                                    │
│         ▼                                                                    │
│   Return [{ id, metadata, similarity }, ...]                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no vector storage.**

No retrieval = no vector DB. If contrl ever adds RAG, the choice would likely be:
- pgvector if contrl moves to Postgres (currently SQLite + Supabase).
- Qdrant or Chroma for a dedicated vector store.

---

## Elaborate

**Where this pattern comes from.** Approximate nearest neighbor research (LSH, IVF, HNSW) dates to the 2000s. Production vector databases shipped 2021+ with Pinecone, Weaviate, Qdrant. By 2026, vector storage is commodity infrastructure.

**The deeper principle.** Specialized indexes for specialized queries. Vector DBs are to ANN what B-trees are to range queries — purpose-built, fast.

**Where this breaks down.** Two cases.

1. **Tiny corpora.** < 1000 vectors: in-memory dict + linear scan beats setting up a vector DB. Don't over-engineer.
2. **Multi-tenant isolation.** Vector DBs vary in how they handle per-tenant filtering. Check before committing if multi-tenant is required.

**What to explore next.**
- [10-incremental-indexing](./10-incremental-indexing.md) — keeping the index fresh as corpus changes.
- [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md) — combining vector + keyword search.

---

## Tradeoffs

| Cost dimension | Managed (Pinecone) | Self-hosted (Qdrant) | pgvector |
|---|---|---|---|
| Ops cost | None | Real (deploy, monitor) | Reuse existing Postgres |
| $$ at 1M vectors / month | ~$70-200 | ~$30-100 (infra) | Existing DB |
| Performance | Optimized | Tuneable | Slower at scale |
| Scaling concerns | Provider handles | You handle | Postgres limits |

### Sub-block 1 — what we gave up

For managed: cost, vendor lock-in. For self-hosted: ops work. For pgvector: peak performance at >10M scale.

### Sub-block 2 — wrong-choice cost

Documented: starting on pgvector, scaling past 10M docs, query latency hurting. Migration to Qdrant or Pinecone = re-index everything + change query API.

### Sub-block 3 — the breakpoint

pgvector good until ~1M-10M docs (varies with hardware). Self-hosted Qdrant good through ~100M. Managed services for ops-light or massive scale.

---

## Tech reference (industry pairing)

### Pinecone

- **Leading today:** `adoption-leading` for managed vector DB, 2026.
- **Why it leads:** zero ops, fast indexing, good docs.

### Qdrant / Weaviate / Milvus (self-hosted)

- **Leading today:** `innovation-leading` open-source category, 2026.
- **Why it leads:** open source, performant, growing ecosystem.

### pgvector (Postgres extension)

- **Leading today:** `adoption-leading` for projects already on Postgres, 2026.
- **Why it leads:** reuse existing DB; no new infra; SQL access.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Vector databases provide approximate nearest neighbor search over high-dimensional vectors at scale. ANN algorithms (HNSW, IVF) trade exact accuracy for orders-of-magnitude speed gains. Choice axes: managed vs self-hosted; algorithm parameters; metadata filtering support. For small projects: pgvector or Chroma. For production: Qdrant, Pinecone, Weaviate.

**Key points:**

- **ANN beats linear scan** at 10K+ vectors.
- **HNSW is the modern default.** Tunable recall via M and efConstruction.
- **Managed vs self-hosted** is the first axis; algorithm is the second.
- **Metadata filtering** matters at scale; check provider support.
- **For contrl: no vector DB needed.**

---

## Interview defense

**[mid] Why use a vector database instead of a regular database?**

Specialized ANN indexes (HNSW, IVF) make nearest-neighbor search O(log N) instead of O(N). At >10K vectors, the speed gap is the difference between feasible and infeasible.

**[senior] How do you choose between managed and self-hosted?**

Ops capacity. Solo / small team without ops bandwidth: managed (Pinecone, Weaviate Cloud). Team with infra ops: self-hosted (Qdrant, Milvus). Postgres-using team < 10M vectors: pgvector.

---

## One-line anchors

- "ANN beats linear scan at >10K vectors."
- "HNSW is the modern default."
- "Managed vs self-hosted is the first axis."
- "pgvector for projects already on Postgres."
- "Metadata filtering matters at scale."

---

## Validate

**Level 1:** Draw HNSW search.
**Level 2:** "Why use a vector DB?" Under 30 seconds.
**Level 3:** A teammate's RAG is slow at 100K docs. Diagnose. (Likely linear scan; recommend HNSW-backed vector DB.)
**Level 4:** Defend pgvector for a 5M-vector corpus.

**Quick check:**
- The modern default ANN algorithm? (HNSW)
- Scale where linear scan stops working? (~10K vectors)
- Does contrl use a vector DB? (No.)
