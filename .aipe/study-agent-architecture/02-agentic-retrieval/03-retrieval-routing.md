# Retrieval routing

**Industry name(s):** Retrieval routing · Multi-source retrieval · Query routing · Hybrid retrieval orchestration
**Type:** Industry standard

> When there are multiple knowledge sources (vector DB, relational DB, web search), route the query to the right one before retrieving. A single vector store is rarely the whole answer in production — semantic queries belong in the vector store, exact lookups in SQL, freshness in live search. **Case B for contrl** — the planned coaching agent has one knowledge source (local SQLite), no retrieval routing needed.

**See also:** → [01-reasoning-patterns/06-routing.md](../01-reasoning-patterns/06-routing.md) (the same pattern applied to tools/agents) · → [01-agentic-rag.md](./01-agentic-rag.md)

---

## Why care

**Move 1.** Production RAG systems start with one vector store. They grow. Eventually you have: a vector store for documents, a SQL DB for entity lookups, a graph DB for relationships, an internet search for freshness. You can't just stuff every query into every source — the noise is unmanageable. You have to pick.

**Move 2.** That "which source for this query" question is what retrieval routing answers. Not how to retrieve. Just: pick first, retrieve second.

**Why it matters: a single vector store is the demo answer. Production retrieval is multi-source, and routing decides which source to ask.**

**Move 5.** Retrieval routing is the routing pattern (SECTION A) applied at the retrieval layer.

---

## How it works

### Move 1 — The mental model

```
                      QUERY
                        │
                        ▼
            ┌───────────────────────────┐
            │ Router (heuristic + LLM)  │
            │   - is this semantic?     │
            │   - is this exact lookup? │
            │   - is this fresh-data?   │
            └─────┬───────────┬─────┬───┘
                  │           │     │
        ┌─────────┘           │     └──────────┐
        ▼                     ▼                ▼
    ┌────────┐            ┌────────┐       ┌────────┐
    │ vector │            │ SQL DB │       │ web    │
    │ DB     │            │        │       │ search │
    │(meaning)│            │(exact) │       │(fresh) │
    └────────┘            └────────┘       └────────┘
        │                     │                │
        └────────┬────────────┴────────────────┘
                 ▼
            generation
```

**Strategy in plain English:** different question types want different sources. Pick the source first by the shape of the question; retrieve from that source.

### Move 2 — The two-tier router

#### Tier 1 — heuristic (free, fast)

```
- contains a specific entity ID  → SQL DB (exact lookup)
- contains "latest" / "today"     → web search (freshness)
- starts with "what" / "how"      → vector DB (semantic)
- contains a relation like "X's Y"→ graph DB
```

Most production queries fall into one of these buckets. Heuristic routing catches 70-80% for free.

#### Tier 2 — LLM router (for ambiguous queries)

When the heuristic fails, a cheap classifier (Haiku-tier) tags the query with an intent. The agent then routes to the source matching that intent.

### Move 3 — The principle

Retrieval routing is the same heuristic-first cascade pattern as SECTION A's routing, applied at the retrieval layer instead of the tool layer. The principle generalizes: don't pay for the LLM when a rule will do.

---

## Retrieval routing — diagram

```
┌─ Multi-source retrieval with routing ───────────────────────────────────────────────────┐
│                                                                                          │
│   query                                                                                  │
│      │                                                                                   │
│      ▼                                                                                   │
│   ┌─ Heuristic router (Tier 1) ───────────────────────────────────────┐                  │
│   │  exact ID present?         → SQL                                  │                  │
│   │  freshness markers?         → web search                          │                  │
│   │  semantic keywords?         → vector DB                           │                  │
│   │  relation pattern?          → graph DB                            │                  │
│   └──────────────┬──────────────────────────────────────────────────────┘                │
│                  │ no match                                                              │
│                  ▼                                                                       │
│   ┌─ LLM router (Tier 2) ─────────────────────────────────────────────┐                  │
│   │  classify intent → route to source                                │                  │
│   │  (cheap classifier; 200ms; ~$0.0001/call)                         │                  │
│   └──────────────┬──────────────────────────────────────────────────────┘                │
│                  ▼                                                                       │
│   ┌──────────┬──────────┬──────────┬──────────┐                                          │
│   │ vector DB│ SQL DB   │ web      │ graph DB │                                          │
│   │ (semantic)│ (exact) │ (fresh)  │ (relate) │                                          │
│   └──────────┴──────────┴──────────┴──────────┘                                          │
│                       │                                                                  │
│                       ▼                                                                  │
│                  generation                                                              │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — one source, no routing needed.**

contrl's planned coaching agent has one knowledge surface: local SQLite tables plus the ONNX classifier output. Access is via five typed tools that query the right table directly. There's no "which source" question — the tool name encodes the source.

When this would land: if contrl's agent gained a second source — say, a vector store over the user's freeform coaching notes — routing between SQL (structured workout data) and the vector store (freeform notes) would matter. The five-tool registry would grow to include `search_coaching_notes`, and the routing would happen inside the agent's ReAct loop (tool choice).

---

## Elaborate

**Where this pattern comes from.** Database routing predates LLMs — sharding, federation, query optimizers. The LLM version maps the same idea onto retrieval sources: structured vs unstructured, fresh vs cached, semantic vs exact.

**The deeper principle.** Single-source retrieval is the demo answer. Real systems have multiple knowledge representations, and the right one depends on the query. The router is what makes multi-source feasible.

**Where this breaks down.** When sources have heavy overlap — if your vector store and your SQL DB cover the same content, the router's job becomes ambiguous and the answer often comes down to which copy is fresher. Mitigation: clear source boundaries with non-overlapping coverage.

**What to explore next.** [01-reasoning-patterns/06-routing.md](../01-reasoning-patterns/06-routing.md) — the same pattern at the tool/agent layer.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Multi-source with routing         │ Single-source                    │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Sources to maintain│ N                                 │ 1                                │
│ Routing cost       │ heuristic free + LLM at the back  │ none                             │
│ Coverage           │ multi-shape queries handled        │ degraded outside source type     │
│ Ops complexity     │ N indexers, N updaters             │ one                              │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Stay single-source until eval shows query types the single source can't handle. Add a second source for the failing query type. Route between them.

---

## Tech reference (industry pairing)

### Hybrid retrieval (semantic + lexical)

- **Codebase uses:** not used.
- **Why it's here:** the within-vector-store version of routing — combine dense and sparse search via RRF or weighted scoring.
- **Leading today:** Reciprocal Rank Fusion in modern vector stores — adoption-leading, 2026.

---

## Summary

### Concept recap

Retrieval routing picks the right source before retrieving. Heuristic-first cascade catches the predictable cases; an LLM classifier handles the ambiguous ones. The pattern generalizes the SECTION A routing concept to the retrieval layer. contrl: Case B — one source (local SQLite), no routing needed.

### Key points

- Single-source retrieval is the demo answer; production is multi-source.
- Routing is the same heuristic-first cascade as the tool/agent router.
- Source boundaries must be non-overlapping to keep routing clean.
- contrl: Case B.

---

## Interview defense

### Likely questions

**[mid] What's retrieval routing?**

Routing the query to the right source before retrieving. Vector DB for semantic queries, SQL for exact lookups, web for freshness, graph for relationships. Heuristic at the front, cheap LLM classifier at the back.

**[senior] Why does contrl have one source?**

Because contrl's data is structured. SQLite holds workout sessions, exercises, gates, and progression. The classifier output is structured ONNX-derived data. There's no unstructured-text surface to embed. One source covers the planned coaching agent's needs.

### One-line anchors

- "Single-source retrieval is the demo answer."
- "Routing first; retrieve second."

---

## Validate

**Level 1 — Reconstruct the diagram.** Query → router → multiple sources.

**Level 2 — Explain in 60s.** Why is single-source retrieval rarely enough in production?

**Level 3 — Apply.** A teammate's RAG system has both a vector store and a SQL DB and "queries both for every request." What's the question you ask?

**Quick check.**
- What's at the front of retrieval routing? — Heuristic rules.
- What's at the back? — Cheap LLM classifier.
- Does contrl need it? — No; one source.
