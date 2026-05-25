# Chunking strategies

**Industry name(s):** Chunking, document splitting, text segmentation for retrieval
**Type:** Industry standard

> Documents get split into chunks (typically 200-1000 tokens each) before embedding. The split shape determines retrieval quality more than the embedding model choice. Three strategies: fixed-size (simple, lossy at boundaries), semantic (preserves structure, expensive), recursive (compromise; most production). Chunking is irreversible in the sense that downstream retrieval can only see what each chunk contains.

**See also:** → [01-embeddings](./01-embeddings.md) · → [07-reranking](./07-reranking.md) · → [11-rag](./11-rag.md)

---

## Why care

**Move 1.** You embed a knowledge base. Retrieval misses the right answer despite the corpus containing it. Investigation: you chunked the source documents into 200-token blocks. The relevant answer spans the boundary between two chunks — half in chunk N, half in chunk N+1. Embedding each chunk separately broke the meaning. Retrieval can't reconstruct.

**Move 2.** That "how to split documents into retrievable units" question is what chunking answers. Not which embedding model. Just: at what granularity, with what overlap, respecting what structural boundaries.

**Why you need to answer that question at all:** Three failures hide in naive chunking. First, **boundary loss** — content that spans chunks doesn't retrieve. Second, **too small** — chunks lose context; "this" and "it" have no antecedent. Third, **too large** — chunks contain multiple topics; the embedding averages them; nothing matches well.

**Move 5.** Chunking is what page breaks are for printed books — the unit at which content is delivered, with consequences for what readers (or retrieval systems) can find.

---

## How it works

### Move 1 — The mental model

Documents are continuous; retrieval is granular. Pick a chunk size and a split rule that preserves coherence.

```
  Chunking decisions
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Chunk size    │ Larger = more context per match; harder to       │
  │               │ pinpoint relevant content                          │
  │ Overlap       │ Helps with boundary content; increases storage   │
  │ Split rule    │ Fixed-size (every N tokens) vs structural          │
  │               │ (paragraph, section, sentence)                    │
  └──────────────────────────────────────────────────────────────────┘
```

Strategy in plain English: **chunk small enough to be relevant, large enough to be coherent; respect structural boundaries; overlap to handle boundary content.**

---

### Move 2 — The layered walkthrough

#### Fixed-size chunking

Split the document into chunks of N tokens (typically 500), with optional overlap (50-100 tokens).

```
  Fixed-size chunking
  
  Document → [chunk 1: tokens 0-499]
             [chunk 2: tokens 450-949]  ← 50 token overlap
             [chunk 3: tokens 900-1399]
             ...
```

**Pros:** simple, fast, predictable storage.
**Cons:** breaks structural boundaries mid-sentence, mid-paragraph; meaning fragments at chunk boundaries.

Acceptable for unstructured documents (logs, transcripts) where structure is weak.

---

#### Semantic chunking

Split at semantic boundaries — paragraphs, sentences, sections — measured by embedding distance between adjacent segments.

```
  Semantic chunking
  
  1. Tokenize into sentences
  2. Embed each sentence
  3. Compute cosine similarity between adjacent sentences
  4. When similarity drops below threshold → chunk boundary
  
  Effect: chunks correspond to "this is about one topic"
```

**Pros:** chunks are coherent; meaning rarely fragments.
**Cons:** computational cost (embedding every sentence twice — once for chunking decision, once for storage); slow on large corpora.

Production teams often skip this in favor of recursive chunking (next).

---

#### Recursive chunking (most common in production)

Split by structural markers in order of significance:
1. Try splitting by major sections (## headings, page breaks).
2. If chunks too large, split by paragraphs (\n\n).
3. If still too large, split by sentences.
4. If still too large, split by tokens (with overlap).

This respects document structure when it exists; falls back to fixed-size when needed.

```
  Recursive chunking pipeline
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Document                                                          │
  │   try split by ## headings                                       │
  │     for each section:                                            │
  │       if section.tokens > MAX:                                   │
  │         try split by paragraphs (\n\n)                           │
  │           for each para:                                         │
  │             if para.tokens > MAX:                                │
  │               try split by sentences                             │
  │                 if sentence.tokens > MAX:                        │
  │                   split by fixed-size with overlap                │
  └──────────────────────────────────────────────────────────────────┘
```

Most modern frameworks (LangChain, LlamaIndex) implement recursive chunking with sensible defaults.

---

#### Chunk size selection

```
  Chunk size guidance
  
  ┌─────────────────────────────────────┬──────────────────────────┐
  │ Use case                            │ Chunk size               │
  ├─────────────────────────────────────┼──────────────────────────┤
  │ FAQ / Q&A retrieval                 │ 200-400 tokens           │
  │ Long-form documents (articles)      │ 500-800 tokens           │
  │ Code retrieval                      │ 200-500 tokens           │
  │ Conversational history              │ 500-1000 tokens          │
  │ Legal/technical specs               │ 300-600 tokens           │
  └─────────────────────────────────────┴──────────────────────────┘
```

The rule of thumb: chunks should contain enough context to be self-contained (a reader could understand the chunk without needing the surrounding text), but not so large that retrieval can't pinpoint relevant material.

---

#### Overlap

Overlap (where chunk N+1 starts before chunk N ends) helps with boundary content. Typical: 10-20% of chunk size.

```
  Overlap example (chunk_size=500, overlap=50)
  
  chunk 1: tokens 0-499
  chunk 2: tokens 450-949  ← overlap of 50 tokens with chunk 1
  chunk 3: tokens 900-1399
  ...
  
  A boundary phrase at position 480-510:
    appears entirely in chunk 1 (480-499 is in 0-499)
    appears entirely in chunk 2 (480-510 is in 450-949)
  
  Both chunks have access to the boundary phrase → retrieval more robust.
```

Cost: ~10-20% more storage and more chunks. Usually worth it.

---

#### Metadata attached to chunks

Each chunk should carry metadata pointing back to its source:

```ts
{
  chunk_id: 'doc_123__chunk_4',
  source_doc: 'doc_123',
  position: 4,  // chunk index in original doc
  text: '...the chunk content...',
  metadata: {
    title: 'Original document title',
    section: 'Chapter 3',
    author: 'Jane Doe',
    date: '2026-05-10',
  }
}
```

At retrieval time, you can filter by metadata (date range, author, section) before or alongside semantic similarity.

---

### Move 3 — The principle

Chunking is the segmentation that determines what retrieval can see. Get it wrong and the embedding model can't recover. Three strategies (fixed, semantic, recursive); recursive is the production default. Respect structural boundaries; add overlap for boundary content; attach metadata for filtering.

---

## Chunking strategies — diagram

```
┌─ Document ingestion ─────────────────────────────────────────────────────────┐
│                                                                              │
│   document.md (5000 tokens)                                                  │
│           │                                                                  │
│           ▼ recursive chunking                                                │
│   [chunk 1: 500 tokens, section "Intro"]                                     │
│   [chunk 2: 500 tokens, section "Background"]                                │
│   [chunk 3: 480 tokens, section "Method", para 1]                            │
│   [chunk 4: 510 tokens, section "Method", para 2]                            │
│   ...                                                                        │
│           │                                                                  │
│           ▼ embed each chunk                                                  │
│   Vectors stored with metadata                                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Retrieval at query time ────────────────────────────────────────────────────┐
│                                                                              │
│   query → embed → cosine-search → top-K chunks → return                      │
│                                                                              │
│   Each returned chunk carries source-doc reference (for citation)            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no corpus to chunk.**

contrl doesn't ingest documents or index a knowledge base. No chunking happens.

If contrl ever adds a knowledge base (e.g., exercise instruction library for the coaching agent), recursive chunking with 300-500 token chunks + 50 token overlap would be the starting point.

---

## Elaborate

**Where this pattern comes from.** Document segmentation is older than LLMs — IR systems have chunked since the 1970s. The modern recursive variant emerged in 2023+ with LangChain's `RecursiveCharacterTextSplitter` and similar tools.

**The deeper principle.** Segmentation determines what downstream operations can see. The principle applies to any pipeline that processes continuous data in discrete units — log analysis (line vs message grouping), video processing (frame vs shot detection), document retrieval (chunk vs whole-document).

**Where this breaks down.** Two places.

1. **Whole-document retrieval** — for short docs (< 1000 tokens), don't chunk; retrieve whole documents.
2. **Cross-chunk reasoning** — when the answer requires reasoning across chunks, retrieval finds the chunks but downstream LLM must synthesize. Hierarchical retrieval (chunk → expand to surrounding context) helps.

**What to explore next.**
- [01-embeddings](./01-embeddings.md) — what gets embedded after chunking.
- [07-reranking](./07-reranking.md) — improves top-K accuracy after retrieval.

---

## Tradeoffs

| Cost dimension | Recursive chunking | Fixed-size chunking |
|---|---|---|
| Implementation cost | Slightly higher | Lower |
| Boundary preservation | Better | Worse |
| Compute cost | Marginal | Lower |
| Production fit | Most documents | Unstructured text only |

### Sub-block 1 — what we gave up

Implementation complexity. LangChain / LlamaIndex handle it; if rolling your own, recursive splitting takes a day to implement well.

### Sub-block 2 — fixed-size cost

Boundary loss; meaning fragments. Acceptable for short unstructured text; problematic for structured documents.

### Sub-block 3 — the breakpoint

Recursive chunking is the right call until: (a) documents have no structure (transcripts, logs); (b) documents are short enough not to chunk at all. Otherwise use recursive.

---

## Tech reference (industry pairing)

### LangChain RecursiveCharacterTextSplitter

- **Codebase uses:** Not in contrl.
- **Leading today:** `adoption-leading` for recursive chunking, 2026.
- **Why it leads:** sensible defaults; handles markdown, code, plain text variants.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Chunking splits documents into retrievable units. Three strategies: fixed-size (simple, lossy), semantic (high-quality, expensive), recursive (most production). Chunk size 200-1000 tokens; overlap 10-20%; respect structural boundaries when present. Metadata attached for filtering.

**Key points:**

- **Chunking determines what retrieval can see.** Get it wrong, embedding can't recover.
- **Recursive chunking is the production default.** Tries structural splits before falling back to fixed-size.
- **Overlap 10-20%** handles boundary content.
- **Attach metadata** for filtering at retrieval time.
- **For contrl: Case B.** No corpus today.

---

## Interview defense

**[mid] How big should chunks be?**

200-1000 tokens, depending on use case. FAQs lean smaller; long-form leans larger. Rule: chunk should be self-contained but small enough to pinpoint relevance.

**[senior] What's recursive chunking?**

Split by document structure in order of significance: headings, paragraphs, sentences, then fixed-size as fallback. Respects structure when it exists; falls back when it doesn't.

---

## One-line anchors

- "Chunking determines what retrieval can see."
- "Recursive chunking is the production default."
- "Overlap 10-20% for boundary content."
- "Chunk size 200-1000 tokens, task-specific."
- "Metadata attached per chunk for filtering."

---

## Validate

**Level 1:** Draw recursive chunking flow.
**Level 2:** "How do you chunk a document?" Under 30 seconds.
**Level 3:** A teammate's RAG misses content at chunk boundaries. Diagnose. (Likely no overlap; recommend 50-100 token overlap.)
**Level 4:** Defend semantic chunking over recursive for a specific case.

**Quick check:**
- Typical chunk size? (200-1000 tokens)
- Typical overlap? (10-20% of chunk size)
- Most-used strategy in production? (Recursive.)
