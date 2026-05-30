# 02 — Agentic retrieval

Retrieval as a control loop, not a one-shot pipeline step. The mechanics of embeddings, chunking, vector DBs, and RAG live in `.aipe/study-ai-engineering/03-retrieval-and-rag/`. This sub-section covers only the shift from static retrieval to agentic retrieval — which is purely an agent-architecture concern.

**Anchor: single-agent (primary).** All three files here are Case B for contrl. The planned coaching agent uses **tool calls over local structured data** (SQLite + ONNX classifier output) rather than embedding-based retrieval. These files exist to teach the pattern; the planned coaching architecture doesn't need them.

## Reading order

01 → 02 → 03. The progression goes from "retrieve in a loop" to "grade what was retrieved" to "route across multiple sources."

## Files

- **[01-agentic-rag.md](./01-agentic-rag.md)** — ReAct whose primary tool is retrieval. The loop decides whether to retrieve more, refine the query, or stop.
- **[02-self-corrective-rag.md](./02-self-corrective-rag.md)** — relevance grader between retrieval and generation. Catches the gap between "a chunk came back" and "the chunk is relevant."
- **[03-retrieval-routing.md](./03-retrieval-routing.md)** — multiple knowledge sources; pick the right one before retrieving. Vector DB + SQL DB + web search at the front of the same query.
