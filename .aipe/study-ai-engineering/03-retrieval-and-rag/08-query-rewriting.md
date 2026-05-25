# Query rewriting (HyDE)

**Industry name(s):** Query rewriting, HyDE (Hypothetical Document Embedding), query expansion, query understanding
**Type:** Industry standard

> User queries are often short, ambiguous, or stylistically different from the corpus they retrieve against. Query rewriting transforms the query before retrieval — adding context, expanding to multiple variations, or generating a hypothetical answer to embed (HyDE). Improves recall without changing the corpus.

**See also:** → [01-embeddings](./01-embeddings.md) · → [11-rag](./11-rag.md) · → [04-agents-and-tool-use/02-tool-calling](../04-agents-and-tool-use/02-tool-calling.md)

---

## Why care

**Move 1.** User searches "back pain" — three words, no context. Your corpus is full of structured documents about specific conditions, treatments, anatomy. The short query doesn't embed well — semantically too broad. Retrieval returns scattered, low-relevance results. If the query were "I have lower-back stiffness when sitting for long periods. What stretches might help?", retrieval would find the right docs.

**Move 2.** That "transform the query before retrieval" question is what query rewriting answers. The user's actual query is the input; an enriched/expanded/transformed version is what gets embedded for retrieval.

**Why you need to answer that question at all:** Two failures hide in retrieving with the raw user query. First, **short queries embed poorly** — too little context. Second, **stylistic mismatch** — queries are casual, corpus is formal; embeddings don't bridge perfectly.

**Move 5.** Query rewriting is what auto-complete + search-as-you-type is for traditional search — turn the user's terse input into a richer query before searching.

---

## How it works

### Move 1 — The mental model

Two patterns:

1. **HyDE** (Hypothetical Document Embedding): use the LLM to write a hypothetical answer to the query. Embed that. Search against the corpus with the hypothetical's vector.
2. **Query expansion**: use the LLM to rewrite the query — add context, generate multiple paraphrases, structure it.

Both add one LLM call before retrieval. Cost: ~50-200ms + a small token cost. Benefit: dramatically better recall on short/ambiguous queries.

```
  Without rewriting
  
  user query → embed → retrieve → top-K
  
  With HyDE
  
  user query → LLM generates hypothetical answer → embed answer → retrieve → top-K
  
  With query expansion
  
  user query → LLM expands to richer query / multiple variations → embed → retrieve → top-K
```

Strategy in plain English: **transform the user's query into a richer embed-able form before retrieval.**

---

### Move 2 — The layered walkthrough

#### HyDE in detail

HyDE was introduced by Gao et al. (2022). The intuition: the user's query is sparse; the documents they want are dense. Instead of embedding the sparse query, ask an LLM to write a dense, hypothetical "answer" to the query, and embed THAT.

```
  HyDE pipeline
  
  user_query: "back pain"
    │
    ▼ LLM prompt: "Write a one-paragraph response to: {user_query}"
    │
  hypothetical: "Back pain is often caused by muscle strain or poor 
                 posture. Common treatments include rest, gentle 
                 stretching, and over-the-counter pain medication. 
                 Severe or persistent pain may require..."
    │
    ▼ embed(hypothetical)
    │
  search vector DB → top-K docs
```

The hypothetical doesn't have to be factually correct. It just has to look like the kind of document you're searching for. The embedding captures the "shape" of relevant content.

Cost: one LLM call per query. With caching disabled (each user query is unique), this is per-call cost. Use a cheap model (Haiku) for the rewrite.

---

#### Query expansion

A different approach: ask the LLM to rewrite the query as a more retrieval-friendly version, possibly generating multiple variations.

```
  Query expansion
  
  user_query: "back pain"
    │
    ▼ LLM prompt: "Rephrase this query as 3 variations that might match
                    documents about back pain:"
    │
  expanded: 
    1. "lower back pain causes and treatments"
    2. "exercises for back pain relief"
    3. "when to see a doctor about back pain"
    │
    ▼ embed each
    │
  multi-vector search → merge results → top-K
```

Multi-vector search runs retrieval per variation; merges with RRF or similar.

---

#### Conversational query rewriting

For multi-turn conversations, the latest user message may not stand alone:

```
  User: "What does HyDE mean?"
  Assistant: [explains HyDE]
  User: "How is it different from query expansion?"
  
  The second query "How is it different from query expansion?" is ambiguous
  without context. Query rewriting resolves it:
  
  Rewritten: "How is HyDE different from query expansion?"
```

The LLM uses conversation history to make the query self-contained before embedding.

---

#### Cost-benefit decision

Query rewriting adds one LLM call per retrieval. For high-volume systems, this matters:

```
  At 100K queries/day with Haiku 4 rewriting (~$0.0002/call):
    Daily rewriting cost: $20
    Monthly: ~$600
    
  Trade-off: better retrieval quality vs ~$600/month cost.
```

For low-volume systems (contrl scale): negligible.

The biggest gain is on short queries; long well-formed queries benefit less. A common pattern: rewrite only when query length < threshold (e.g., < 20 tokens).

---

#### When NOT to rewrite

- **Long, specific queries** — already detailed; rewriting may add noise.
- **Code search** — exact keywords matter; rewriting risks losing identifiers.
- **Tight latency budgets** — adding 100-200ms is non-negotiable.

---

### Move 3 — The principle

The user's query and the corpus's documents live in different language registers. Query rewriting bridges that gap before retrieval. HyDE is the most powerful variant (generates a hypothetical answer); query expansion is the lighter-weight alternative. Both add one LLM call; both can substantially improve recall on short/ambiguous queries.

---

## Query rewriting — diagram

```
┌─ HyDE pipeline ──────────────────────────────────────────────────────────────┐
│                                                                              │
│   user_query: "back pain"                                                    │
│         │                                                                    │
│         ▼ LLM call                                                            │
│   hypothetical answer: 200-token paragraph                                   │
│         │                                                                    │
│         ▼ embed                                                              │
│   query_vector                                                               │
│         │                                                                    │
│         ▼ retrieve                                                           │
│   top-K docs                                                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Query expansion pipeline ───────────────────────────────────────────────────┐
│                                                                              │
│   user_query                                                                 │
│         │                                                                    │
│         ▼ LLM call                                                            │
│   3 query variations                                                         │
│         │                                                                    │
│         ▼ embed each                                                         │
│   3 query vectors                                                            │
│         │                                                                    │
│         ▼ retrieve each, merge with RRF                                      │
│   top-K docs                                                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no retrieval.**

---

## Elaborate

**Where this pattern comes from.** Query rewriting is old (search engines have done it forever). HyDE specifically: Gao et al. (2022) "Precise Zero-Shot Dense Retrieval without Relevance Labels." Production adoption picked up 2023+.

**The principle.** Bridging language registers between users and corpora is a search problem older than LLMs. The LLM-specific application is HyDE — using the LLM's generative ability to create a richer embed-able form.

**Where it breaks down.** Code search, exact-keyword domains. Plus: HyDE-generated hypotheticals can drift from the corpus's actual content if the LLM has different priors.

---

## Tradeoffs

| Cost dimension | Query rewriting | Raw query |
|---|---|---|
| Per-query latency | +50-200ms | Baseline |
| Per-query cost | +$0.0001-0.001 (cheap model) | Free |
| Recall on short queries | Substantially higher | Baseline |
| Recall on long queries | Marginal | Baseline (already good) |

---

## Tech reference

### Cheap LLM for the rewrite step

- **Anthropic Haiku, OpenAI GPT-4o-mini** — `adoption-leading` for cost-effective query rewriting.

### LangChain query-transformation chains

- **Leading today:** built-in HyDE and multi-query patterns.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Query rewriting transforms user queries before retrieval to bridge the language register gap between casual queries and corpus documents. HyDE generates a hypothetical answer and embeds that; query expansion produces multiple variations. Both add one LLM call; both improve recall on short queries. For contrl: not applicable.

**Key points:**

- **HyDE: generate hypothetical answer, embed THAT.**
- **Query expansion: multiple variations, multi-vector search.**
- **Conversational rewriting** makes follow-up queries self-contained.
- **Cost: one LLM call per query.** Use a cheap model.
- **Skip for long queries, code search, tight latency.**

---

## Interview defense

**[mid] What's HyDE?**

Generate a hypothetical answer to the user's query using an LLM; embed the hypothetical; search. The hypothetical "looks like" the docs you want, even if not factually correct. Improves recall on short queries.

**[senior] When NOT to rewrite?**

Long detailed queries (already good), code search (exact terms matter), latency-tight chains (can't afford +100ms).

---

## Validate

**Level 1:** Draw HyDE pipeline.
**Level 2:** "What's query rewriting?" Under 30 seconds.
**Level 3:** A teammate's RAG fails on short queries. Recommend HyDE. (Cheap LLM rewrite; better embed vector.)
**Level 4:** Defend skipping query rewriting for long well-formed queries.

**Quick check:**
- HyDE acronym? (Hypothetical Document Embedding)
- Typical model for the rewrite step? (Cheap: Haiku, GPT-4o-mini)
- Does contrl use query rewriting? (No.)
