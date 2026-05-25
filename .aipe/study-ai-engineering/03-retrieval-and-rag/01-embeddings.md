# Embeddings

**Industry name(s):** Embeddings, dense vector representations, semantic embeddings, vector encoding
**Type:** Industry standard

> An embedding is a fixed-dimensional vector (typically 384-3072 floats) that captures a piece of text's semantic content. Texts with similar meaning have similar vectors (close cosine distance). The vector is computed by an embedding model — a separate model from the LLM, optimized for semantic similarity rather than generation. Embeddings power retrieval, similarity search, clustering, and the R in RAG.

**See also:** → [02-embedding-model-choice](./02-embedding-model-choice.md) · → [04-vector-databases](./04-vector-databases.md) · → [11-rag](./11-rag.md)

---

## Why care

**Move 1.** You want to find documents similar to a user's query. Keyword search returns documents matching the words; misses documents that talk about the same topic using different vocabulary. "Workout for back pain" finds docs containing those exact words; misses "lower-back rehab exercises" — semantically identical, lexically different. Embeddings solve this by representing meaning, not words.

**Move 2.** That "how do I find semantically similar content" question is what embeddings answer. Each piece of text gets a vector; nearby vectors are similar meaning. Retrieval becomes: embed the query, find documents with closest vectors.

**Why you need to answer that question at all:** Two failures hide in keyword-only retrieval. First, **vocabulary mismatch** — same meaning, different words. Second, **multi-language queries** — a query in one language finding documents in another. Embeddings handle both because they encode meaning, not strings.

**Move 5.** Embeddings are what hash functions are for set membership — a fixed-size representation that preserves the property you care about (semantic similarity, instead of equality).

---

## How it works

### Move 1 — The mental model

Picture each piece of text as a point in 768-dimensional space. The embedding model learned during training to place semantically-similar texts close together; semantically-different texts far apart. Cosine similarity between two vectors quantifies how close they are.

```
  Embedding model maps text → vector
  
  "workout for back pain"      → [0.12, -0.05, 0.81, ..., 0.33]  (768 dims)
  "lower-back rehab exercises" → [0.13, -0.04, 0.80, ..., 0.31]  (very close)
  "favorite pizza toppings"    → [-0.42, 0.61, -0.05, ..., 0.18] (far)
  
  Cosine similarity:
    (1) and (2):  0.97 (very similar)
    (1) and (3):  0.12 (not similar)
```

Strategy in plain English: **embed once, store the vector, search by cosine similarity at query time.**

---

### Move 2 — The layered walkthrough

#### What an embedding model actually does

The embedding model is a smaller transformer (often 100M-7B params) trained on pairs of similar texts (paraphrases, query-document pairs, translation pairs). The training objective: produce vectors such that similar pairs are close and dissimilar pairs are far.

The output: a fixed-dimensional vector (384, 768, 1024, or up to 3072 depending on model) summarizing the input.

```
  Embedding pipeline (typical)
  
  text → tokenizer → token IDs → transformer → pooling → vector[D]
                                                          (e.g., D=768)
```

Pooling: average across token positions, or take the [CLS] token, or learned pooling. Implementation detail; mostly handled by the model API.

---

#### Cosine similarity

Two vectors u and v have cosine similarity = (u · v) / (||u|| * ||v||). Range: -1 to 1. For normalized vectors (most modern embeddings are pre-normalized), this simplifies to the dot product. Higher = more similar.

```
  Cosine similarity intuition
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Cosine = 1.0  → identical direction (same meaning)               │
  │ Cosine = 0.97 → very similar (near-paraphrase)                   │
  │ Cosine = 0.85 → related topic                                    │
  │ Cosine = 0.50 → loosely related                                  │
  │ Cosine = 0.20 → unrelated                                        │
  │ Cosine = -1.0 → opposite direction (rare in practice)            │
  └──────────────────────────────────────────────────────────────────┘
```

For retrieval: sort documents by cosine similarity to the query embedding; return top-K.

---

#### Embedding cost

Embedding APIs price per million tokens (typically $0.02-0.13/1M tokens, an order of magnitude cheaper than LLM input). Embedding a document set is a one-time cost (per document); re-embedding is needed when the model upgrades or the document changes.

```
  Sample embedding costs (OpenAI text-embedding-3-large, mid-2026)
  
  Cost: $0.13 / 1M tokens
  
  Embedding 1,000 documents averaging 500 tokens each:
    500K tokens × $0.13/1M = $0.07
  
  Embedding 1M documents averaging 500 tokens each:
    500M tokens × $0.13/1M = $65
```

Cheap. The cost driver in RAG is usually storage + retrieval infrastructure, not embedding itself.

---

#### Limits of embeddings

Embeddings capture *semantic similarity* — what the text is about. They don't capture:

- **Negation** poorly. "I like coffee" and "I don't like coffee" have similar embeddings even though they mean opposite things.
- **Numerical precision.** "$100" and "$1000" embed similarly.
- **Sequential/temporal information.** "She left then he arrived" and "He arrived then she left" embed similarly.
- **Speaker/source identity.** Texts about "Alice said X" and "Bob said X" embed by topic, not by speaker.

For tasks needing these distinctions, embeddings alone don't suffice — combine with structured metadata, re-rankers, or LLM-based filtering.

---

### Move 3 — The principle

Embeddings convert text to fixed-size vectors that preserve semantic similarity. The whole retrieval-augmented stack is built on this primitive: embed corpus → store vectors → embed query → find closest vectors → return matched documents. Understanding the primitive clarifies what retrieval can and can't do (good at meaning; bad at negation, precision, temporal/speaker info).

---

## Embeddings — diagram

```
┌─ Embedding pipeline ─────────────────────────────────────────────────────────┐
│                                                                              │
│   text → embedding model → vector[768]                                       │
│                                                                              │
│   Properties:                                                                │
│     similar text → similar vector (cosine close to 1)                        │
│     dissimilar text → distant vector (cosine close to 0)                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Retrieval at query time ────────────────────────────────────────────────────┐
│                                                                              │
│   query text → embedding model → query_vector                                │
│   for each doc in corpus:                                                    │
│     score = cosine(query_vector, doc_vector)                                 │
│   return top-K docs by score                                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no retrieval surface.**

contrl doesn't search over the user's session history, doesn't have a knowledge base, doesn't do RAG. No embedding usage today.

The discipline becomes relevant if/when contrl adds:
- Semantic search over the user's workout notes ("find sessions where I noted form issues").
- Knowledge base lookup for the coaching agent (retrieve relevant coaching cues from an exercise library).

For now: study material.

---

## Elaborate

**Where this pattern comes from.** Word2vec (2013) introduced dense word embeddings; sentence embeddings (Universal Sentence Encoder, BERT-derived models) followed. Production RAG over personal/business corpora exploded in 2023+. By 2026, embedding APIs are commodity infrastructure.

**The deeper principle.** Fixed-dimensional representations are the universal substrate for nearest-neighbor search. Embeddings + cosine similarity is a particular instantiation. The principle generalizes — images, audio, code all have embedding models for the same purpose.

**Where this breaks down.** Negation, precision, temporal/speaker info — covered above. Plus: embedding models trained on general text may underperform on specialized domains (medical, legal, code) where domain-specific embeddings exist.

**What to explore next.**
- [02-embedding-model-choice](./02-embedding-model-choice.md) — choosing the right embedding model.
- [04-vector-databases](./04-vector-databases.md) — storage + nearest-neighbor at scale.
- [11-rag](./11-rag.md) — the full retrieval-augmented pipeline.

---

## Tradeoffs

(Embeddings as a primitive don't have meaningful tradeoffs — they're the bedrock of retrieval. Tradeoffs live in choices around embeddings: model size vs cost, chunking strategy, storage choice.)

---

## Tech reference (industry pairing)

### OpenAI text-embedding-3-large

- **Codebase uses:** Not in contrl.
- **Why it's here:** common general-purpose embedding model.
- **Leading today:** OpenAI text-embedding-3 series — `adoption-leading` for general-purpose embedding, 2026.
- **Why it leads:** strong quality, configurable dimensions (256-3072), reasonable pricing.
- **Runner-up:** Voyage AI embeddings (Anthropic-recommended), Cohere embed-v3, open-source `bge` family.

---

## Project exercises

(Not applicable for contrl today.)

---

## Summary

Embeddings are fixed-dimensional vectors (typically 768) that capture semantic content. Similar text → close vectors. Computed by a dedicated embedding model (smaller than the LLM). Power retrieval, similarity, clustering. Limited at negation, precision, temporal info — combine with metadata when those matter. For contrl: Case B; not applicable to current scope.

**Key points:**

- **Vectors, not strings.** Semantic similarity, not lexical match.
- **Embedding model is separate from the LLM.** Trained on similar/dissimilar pairs.
- **Cosine similarity** quantifies closeness. Higher = more similar.
- **Cheap to compute.** $0.13/1M tokens range.
- **Limits: negation, precision, temporal/speaker info.** Combine with structured metadata when needed.

---

## Interview defense

**[mid] What's an embedding?**

A fixed-dimensional vector representation of text where similar meaning produces similar vectors. Used for retrieval, similarity search, clustering. Computed by a dedicated embedding model.

**[senior] What are embeddings bad at?**

Negation (positive/negative paraphrases embed similarly), numerical precision, temporal order, speaker attribution. For tasks needing these, combine embeddings with structured metadata or LLM-based filtering.

---

## One-line anchors

- "Text → vector. Similar meaning, similar vector."
- "Cosine similarity quantifies closeness."
- "Embedding model is separate from the LLM."
- "Cheap to compute; one-time cost per document."
- "Limited at negation, precision, temporal/speaker — use metadata for those."

---

## Validate

**Level 1:** Draw text → embedding → retrieval flow.
**Level 2:** "What's an embedding?" Under 30 seconds.
**Level 3:** A teammate's keyword search misses semantically-similar documents. Recommend embeddings. (Embed query + corpus; sort by cosine similarity.)
**Level 4:** Defend cases where keyword search beats embeddings.

**Quick check:**
- Typical dimension count? (384-3072; commonly 768)
- Cost order? (~$0.10/1M tokens — much cheaper than LLM)
- Does contrl use embeddings? (No — no retrieval surface.)
