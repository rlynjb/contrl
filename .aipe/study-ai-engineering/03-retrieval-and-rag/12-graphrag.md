# GraphRAG

**Industry name(s):** GraphRAG, knowledge-graph RAG, structured retrieval
**Type:** Industry standard

> Standard RAG retrieves passages by similarity; GraphRAG retrieves over a knowledge graph (entities + relationships) before generation. Solves multi-hop questions ("how is X related to Y?") and aggregation questions ("which papers are by author A about topic B?") that standard RAG handles poorly. Cost: building and maintaining the graph; only worth it for graph-shaped data.

**See also:** → [11-rag](./11-rag.md) · → [01-embeddings](./01-embeddings.md)

---

## Why care

**Move 1.** Your RAG system handles "what is X?" questions well — single-passage retrieval, generate answer. It fails on "how is X related to Y?" — the answer requires linking facts across documents. Standard RAG retrieves the X document and the Y document independently; the LLM has to synthesize. Often it makes up the relationship.

**Move 2.** That "multi-hop and relationship questions" question is what GraphRAG answers. Build a knowledge graph from the corpus (entities + relationships); retrieve by walking the graph from query-relevant entities; provide structured context to the LLM.

**Why you need to answer that question at all:** Two failures hide in standard RAG. First, **multi-hop questions** — answers requiring "A → B → C" chains miss the middle hop. Second, **aggregation questions** — "list all X by Y" requires structured data, not similarity-ranked passages.

**Move 5.** GraphRAG is what SQL JOIN is for relational data — when you need to traverse relationships, similarity search alone doesn't get you there.

---

## How it works

### Move 1 — The mental model

GraphRAG has two ingestion stages and one retrieval stage:

**Ingestion 1: extract entities and relationships from docs.** Use an LLM to read each doc and emit a list of entities (with types) and relationships (subject, predicate, object).

**Ingestion 2: build the graph.** Store entities as nodes, relationships as edges. Often in a graph DB (Neo4j) or a property graph encoded in Postgres/JSON.

**Retrieval: walk the graph from query-relevant entities.** The query gets parsed for entities; retrieval starts at those entities and follows edges to gather context.

Strategy in plain English: **structured knowledge first; retrieval walks the structure; LLM generates grounded in graph-shaped context.**

---

### Move 2 — The layered walkthrough

#### Building the graph

```
  Doc: "Alice Smith, a senior researcher at Acme Labs, co-authored a paper 
        with Bob Jones on neural network compression in 2024."
  
  LLM extracts:
    entities:
      Alice Smith   (type: Person)
      Bob Jones     (type: Person)
      Acme Labs     (type: Organization)
      "Neural network compression" (type: Topic)
    
    relationships:
      Alice Smith --[works_at]--> Acme Labs
      Alice Smith --[coauthored_with]--> Bob Jones
      Alice Smith --[wrote_about]--> "Neural network compression"
      Bob Jones --[wrote_about]--> "Neural network compression"
```

Repeat across the corpus; merge entities with the same canonical name; deduplicate edges.

Cost: one LLM call per doc (or chunk). At scale, this is expensive — extracting from 10K docs is 10K LLM calls. Often done as a batch process, with the graph rebuilt periodically.

---

#### Querying the graph

```
  Query: "What did Alice Smith work on in 2024?"
  
  1. Parse query for entities: Alice Smith, 2024
  2. Find node: Alice Smith
  3. Walk edges from Alice Smith:
       wrote_about → "Neural network compression"
       coauthored_with → Bob Jones
       works_at → Acme Labs
  4. Filter by year: 2024 (from edge metadata)
  5. Assemble context:
       "Alice Smith wrote about neural network compression in 2024,
        coauthored with Bob Jones at Acme Labs."
  6. Pass to LLM with the query
```

Graph traversal lets you answer multi-hop without LLM speculation: "is Alice connected to Bob?" → graph says yes (via coauthored_with).

---

#### When GraphRAG wins

```
  Question types where GraphRAG outperforms standard RAG
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ "How is X related to Y?"           — multi-hop                    │
  │ "List all X by Y"                  — aggregation                  │
  │ "What are common attributes of X?" — entity-centric               │
  │ "Find connections in this dataset" — graph-structure exploration  │
  └──────────────────────────────────────────────────────────────────┘
  
  Question types where standard RAG suffices:
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ "What is X?"                       — single-passage definition     │
  │ "How do I do X?"                   — procedural Q&A                │
  │ "Summarize this topic"              — passage-based summary        │
  └──────────────────────────────────────────────────────────────────┘
```

The decision criterion: does the answer require traversing relationships? If yes, GraphRAG. If no, standard RAG.

---

#### Microsoft's GraphRAG implementation

Microsoft Research published a GraphRAG implementation (2024) that combines:
- LLM-driven entity/relationship extraction.
- Hierarchical community detection (groups of related entities).
- Both query-time graph traversal AND community-level summaries.

The community summaries answer "what's this dataset broadly about" — a question standard RAG also struggles with. The implementation is influential; many production GraphRAG systems borrow patterns from it.

---

#### Cost-benefit

```
  GraphRAG cost
  
  ┌──────────────────────────────────┬────────────────────────────────┐
  │ Stage                            │ Cost                            │
  ├──────────────────────────────────┼────────────────────────────────┤
  │ Entity extraction (one LLM/doc)  │ ~$0.01/doc with Sonnet         │
  │ Graph storage                    │ Graph DB + entity table         │
  │ Query-time graph traversal       │ <100ms typically                │
  │ LLM call with structured context │ Same as standard RAG            │
  └──────────────────────────────────┴────────────────────────────────┘
  
  For 10K docs: ~$100 in extraction cost + Graph DB infrastructure.
  Compared to standard RAG: ~$10 in embedding cost + vector DB.
  
  ~10× higher cost. Worth it only when the graph structure adds value.
```

---

### Move 3 — The principle

GraphRAG trades cost for relationship-aware retrieval. Worth it when answers require traversing connections; over-engineering when the corpus is just a bag of passages. Build it when standard RAG visibly fails on multi-hop or aggregation questions, not before.

---

## GraphRAG — diagram

```
┌─ Ingestion (one-time + ongoing) ─────────────────────────────────────────────┐
│                                                                              │
│   Document                                                                   │
│         │                                                                    │
│         ▼ LLM extracts                                                       │
│   Entities + Relationships                                                   │
│         │                                                                    │
│         ▼ merge with graph                                                   │
│   Knowledge graph (Neo4j / property graph)                                   │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ query time
                                      ▼
┌─ Query ──────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User query                                                                 │
│         │                                                                    │
│         ▼ parse for entities                                                  │
│   Anchor entities                                                            │
│         │                                                                    │
│         ▼ graph traversal                                                    │
│   Related entities + edges                                                   │
│         │                                                                    │
│         ▼ assemble structured context                                        │
│   LLM call with graph-shaped context                                         │
│         │                                                                    │
│         ▼                                                                    │
│   Answer (grounded in graph relationships)                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no corpus, no graph.**

---

## Elaborate

**Where this pattern comes from.** Knowledge graphs are decades old (semantic web, RDF, OWL). The LLM-era application — extracting graphs from unstructured text — is Microsoft Research's GraphRAG (2024) and similar.

**The principle.** Structured retrieval beats similarity retrieval when the structure matters. The principle generalizes to any domain where relationships carry meaning.

**Where it breaks down.** Two places.

1. **Cost.** ~10× standard RAG. Not justified for most use cases.
2. **Bag-of-passages corpora.** Documentation, articles, FAQs — entities matter less than passages. Standard RAG sufficient.

---

## Tradeoffs

| Cost dimension | GraphRAG | Standard RAG |
|---|---|---|
| Setup cost | High (extraction + graph DB) | Lower (chunking + vector DB) |
| Per-doc ingest cost | ~$0.01 (LLM extraction) | ~$0.0001 (embedding only) |
| Query latency | Similar | Similar |
| Multi-hop question quality | Substantially better | Worse |
| Single-passage Q&A | Same | Same |

---

## Tech reference

### Microsoft GraphRAG (open-source)

- **Leading today:** `innovation-leading` for LLM-extracted knowledge graphs, 2026.
- **Why it leads:** open-source implementation + research paper; community summaries pattern.

### Neo4j

- **Leading today:** `adoption-leading` graph database for production.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

GraphRAG extracts entities and relationships from a corpus, builds a knowledge graph, and retrieves by graph traversal. Solves multi-hop and aggregation questions that standard RAG handles poorly. Cost: ~10× standard RAG due to LLM-driven extraction. Worth it for relationship-shaped corpora; over-engineering for bag-of-passages.

**Key points:**

- **Entities + relationships, not just passages.**
- **Solves multi-hop and aggregation questions.**
- **Ingestion cost: ~10× standard RAG** (LLM extraction per doc).
- **Microsoft GraphRAG is the reference implementation.**
- **For contrl: not applicable.**

---

## Interview defense

**[mid] When use GraphRAG instead of standard RAG?**

When answers require relationships (multi-hop, aggregation). Standard RAG retrieves passages; GraphRAG retrieves connected entities. If your eval set shows multi-hop questions failing in standard RAG, that's the signal.

**[senior] How is the graph built?**

LLM-driven extraction per document — extract entities (with types) and relationships (subject, predicate, object). Merge across docs; deduplicate; store in a graph DB (Neo4j) or encoded structure.

---

## Validate

**Level 1:** Draw ingestion + query stages.
**Level 2:** "When use GraphRAG?" Under 30 seconds.
**Level 3:** A teammate's RAG fails on "how is X related to Y" questions. Recommend GraphRAG.
**Level 4:** Defend skipping GraphRAG for a Q&A use case.

**Quick check:**
- Ingestion cost vs standard RAG? (~10×)
- Reference implementation? (Microsoft GraphRAG)
- Does contrl use GraphRAG? (No.)
