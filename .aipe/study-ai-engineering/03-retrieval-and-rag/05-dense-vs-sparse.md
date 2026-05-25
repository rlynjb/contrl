# Dense vs sparse retrieval

**Industry name(s):** Dense retrieval, sparse retrieval, BM25, semantic vs lexical search
**Type:** Industry standard

> Dense retrieval (embeddings + ANN) finds semantically similar content; misses exact keyword matches. Sparse retrieval (BM25, TF-IDF) finds exact keyword matches; misses semantic paraphrases. Production retrieval combines both — dense for meaning, sparse for keywords — and merges results via RRF (covered in [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md)).

**See also:** → [01-embeddings](./01-embeddings.md) · → [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md) · → [07-reranking](./07-reranking.md)

---

## Why care

**Move 1.** User searches "ACL injury rehab." Dense retrieval finds documents about knee surgery, ligament damage, post-op recovery — semantically related. Misses a document titled "ACL Rehabilitation Protocol" because that exact phrase didn't appear in the user's query in a way the embedding picked up strongly. Sparse retrieval (BM25) would have ranked that document first because of the exact keyword match.

**Move 2.** That "semantic match vs exact-keyword match" question is what dense vs sparse retrieval answers. Two complementary methods; production combines both.

**Why you need to answer that question at all:** Dense alone misses exact-keyword matches (rare terms, proper nouns, code identifiers). Sparse alone misses semantic paraphrases. The complement matters — using only one leaves half the surface unsearchable.

**Move 5.** Dense vs sparse is what "fuzzy search" vs "exact search" is for SQL queries — both have their place; production systems support both.

---

## How it works

### Move 1 — The mental model

```
  Dense (embeddings)              Sparse (BM25)
  ────────────────────────         ──────────────────────────────
  Vector per document              Token frequency vectors
  Cosine similarity                Term-frequency × inverse-doc-frequency
  Finds: paraphrases, synonyms     Finds: exact keyword matches
  Misses: rare terms not in        Misses: paraphrases without
   training distribution            keyword overlap
```

Strategy in plain English: **dense for meaning, sparse for keywords. Run both, merge results.**

---

### Move 2 — The layered walkthrough

#### What sparse retrieval does

BM25 (Best Matching 25, the workhorse of search since the 1990s) ranks documents by how well they match query keywords:

- High score if the document contains query terms.
- Weighted by inverse document frequency (rare terms count more).
- Penalized for document length (longer docs don't get bonus for happening to contain the term).

```
  BM25 sketch
  
  score(doc, query) = Σ_term IDF(term) × (TF(term, doc) × (k+1)) / (TF + k × (1 - b + b × doc_len / avg_doc_len))
  
  Where:
    TF = term frequency in doc
    IDF = inverse document frequency (rare terms weighted higher)
    k, b = tunable parameters (typically k=1.2, b=0.75)
```

Strong on exact matches; misses paraphrases.

---

#### What dense retrieval misses

Dense embeddings represent meaning. They struggle with:

- **Rare proper nouns.** A query for "Volkov-Lindh syndrome" relies on the embedding having seen that term during training. Rare or novel terms have weak embeddings; retrieval misses documents containing them.
- **Code identifiers.** `useEffect`, `forwardRef` are technical terms; embeddings treat them as low-information tokens. BM25 finds exact matches.
- **Acronyms.** "ACL," "RBC," "SQL" are short tokens with varied meanings; embeddings underperform.
- **Numerical precision.** "$1,000,000" vs "$10,000" embed similarly; BM25 distinguishes.

---

#### What sparse retrieval misses

BM25 misses semantic paraphrases:

- "Workout for back pain" doesn't match "Lower-back rehabilitation exercises" — no shared keywords beyond "back."
- "How do I make tea?" doesn't match "Tea brewing instructions."
- Synonyms, multilingual cases, related concepts — all invisible to keyword matching.

---

#### Combining both

Production retrieval typically runs both, merges with Reciprocal Rank Fusion (RRF):

```
  Hybrid retrieval pipeline
  
  query
    │
    ├── dense (embedding) retrieval → top-50 docs by cosine
    │
    └── sparse (BM25) retrieval → top-50 docs by BM25 score
    
  Merge with RRF → final top-K
```

Covered in detail in [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md).

The combination catches both surfaces — semantic AND exact — at the cost of running two retrieval pipelines.

---

#### When each alone suffices

- **Dense alone**: knowledge bases with mostly prose, paraphrase-heavy queries (general Q&A, customer support).
- **Sparse alone**: code search, exact-match heavy domains (legal precedent, product SKU lookup), enterprise document search where the user often knows exact terms.

For uncertain cases: hybrid wins almost always; the extra retrieval pipeline cost is modest.

---

### Move 3 — The principle

Dense and sparse are complementary, not competing. Each captures a different similarity signal. Production retrieval combines both. The discipline: don't pick one — run both in parallel, merge with RRF, win on both axes.

---

## Dense vs sparse — diagram

```
┌─ Two retrieval pipelines ────────────────────────────────────────────────────┐
│                                                                              │
│   Query                                                                      │
│     │                                                                        │
│     ├──▶ Dense pipeline                                                      │
│     │    embed(query) → cosine search against vector DB                      │
│     │    top-50 by similarity                                                │
│     │                                                                        │
│     └──▶ Sparse pipeline                                                     │
│          BM25 search against inverted index                                  │
│          top-50 by BM25 score                                                │
│                                                                              │
│   Merge (RRF or weighted fusion) → final top-K                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Each pipeline catches what the other misses:
    Dense: paraphrases, multilingual, synonyms
    Sparse: rare terms, code identifiers, exact matches
```

---

## In this codebase

**Case B — contrl has no retrieval.**

---

## Elaborate

**Where this pattern comes from.** BM25 dates to the 1990s; dense retrieval to 2019+. Hybrid retrieval as production default emerged 2023+.

**The principle.** Different similarity signals capture different aspects of relevance. Combining beats either alone.

**Where it breaks down.** Sparse-only domains where semantic similarity is misleading (legal precedent matching exact phrasing).

---

## Tradeoffs

(See [06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md) for hybrid-retrieval tradeoffs.)

---

## Tech reference

### BM25 implementations

- **Elasticsearch, OpenSearch** — production BM25 search.
- **`rank_bm25` (Python)** — lightweight BM25 for in-memory search.
- **Qdrant, Weaviate** — bundle BM25 alongside vector indexes for hybrid search.

---

## Summary

Dense retrieval finds semantic similarity; sparse retrieval finds exact keyword matches. Production combines both via RRF. Neither alone is sufficient for general retrieval; both together cover the surface. For contrl: not applicable today.

**Key points:**

- **Dense = semantic.** Embeddings + cosine.
- **Sparse = keyword.** BM25.
- **Production = both.** Run in parallel; merge with RRF.
- **Dense misses rare terms;** sparse misses paraphrases.

---

## Interview defense

**[mid] Why use both dense and sparse retrieval?**

Each catches what the other misses. Dense finds paraphrases; sparse finds exact keyword matches. Production typically runs both and merges.

**[senior] When does dense alone work?**

When queries and documents share enough semantic structure and lexical mismatch is the main retrieval gap — general Q&A, customer support, content-driven search. For code search, rare proper nouns, or exact-phrase needs: hybrid wins.

---

## Validate

**Level 1:** Draw the two-pipeline hybrid flow.
**Level 2:** "Dense vs sparse?" Under 30 seconds.
**Level 3:** A teammate's RAG misses results when queries use exact technical terms. Diagnose. (Dense-only; add BM25.)
**Level 4:** Defend dense-only for a specific case.

**Quick check:**
- Sparse algorithm? (BM25)
- Hybrid merge mechanism? (RRF)
- Does contrl need either? (No.)
