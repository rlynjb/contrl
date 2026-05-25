# 03 — Retrieval and RAG

The full retrieval-augmented stack from embeddings to GraphRAG. **All Case B for contrl** — contrl has no retrieval surface. The concepts are study material for any future contrl LLM feature that grounds in proprietary content, plus general LLM-engineering literacy.

## Files

1. **[01-embeddings](./01-embeddings.md)** — fixed-dimensional vectors capturing semantic meaning; foundation of retrieval.
2. **[02-embedding-model-choice](./02-embedding-model-choice.md)** — locks the corpus; pick by task / language / domain / MTEB.
3. **[03-chunking-strategies](./03-chunking-strategies.md)** — fixed / semantic / recursive; chunk size 200-1000 tokens with overlap.
4. **[04-vector-databases](./04-vector-databases.md)** — ANN indexes (HNSW); managed vs self-hosted vs pgvector.
5. **[05-dense-vs-sparse](./05-dense-vs-sparse.md)** — embeddings find semantic; BM25 finds keyword; production uses both.
6. **[06-hybrid-retrieval-rrf](./06-hybrid-retrieval-rrf.md)** — Reciprocal Rank Fusion merges multiple retrieval pipelines.
7. **[07-reranking](./07-reranking.md)** — cross-encoder re-scores top-50; improves precision@K.
8. **[08-query-rewriting](./08-query-rewriting.md)** — HyDE and query expansion; bridge query/corpus language gap.
9. **[09-stale-embeddings](./09-stale-embeddings.md)** — version tracking + migration discipline.
10. **[10-incremental-indexing](./10-incremental-indexing.md)** — CDC pipeline; keep index fresh as corpus changes.
11. **[11-rag](./11-rag.md)** — the production integration; composes everything above.
12. **[12-graphrag](./12-graphrag.md)** — knowledge-graph retrieval for multi-hop questions.

## Reading order

Read **11 (RAG)** first as the integration target. Then **01-04** for the foundations (embeddings, chunking, vector DBs). Then **05-08** for production quality (hybrid retrieval, reranking, query rewriting). **09-10** are operational concerns. **12 (GraphRAG)** is specialized; read when standard RAG visibly fails on multi-hop questions.

→ All Case B for contrl. Concepts apply if/when contrl adds retrieval — e.g., search over user session history, or a knowledge base for the coaching agent.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../04-agents-and-tool-use/README.md](../04-agents-and-tool-use/README.md)
