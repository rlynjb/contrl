# 02 — Context and prompts

Operational concerns around prompt context: how much fits, where attention lands, when to chain calls vs use one. Mostly Case B for contrl — the coaching agent has modest context needs at solo scale.

## Files

1. **[01-context-window](./01-context-window.md)** — fixed buffer; declare per-section budget; 80% utilization rule; lost-in-the-middle is the partner concept. Case B.
2. **[02-lost-in-the-middle](./02-lost-in-the-middle.md)** — LLM attention is primacy + recency biased; middle content under-used. Reverse-relevance ordering in RAG contexts. Case B.
3. **[03-prompt-chaining](./03-prompt-chaining.md)** — multi-step LLM pipeline with typed boundaries. Distinct from agents (which branch on outputs). Case B; contrl uses agent shape, not chain.

## Reading order

Read **01** first (context window as buffer). **02** (lost-in-the-middle) layers on the position-attention nuance. **03** (prompt chaining) is the chain-vs-agent decision. For contrl: read for general LLM-engineering literacy; not directly applicable to current scope.

→ Companion in prompt-engineering: prompts-as-code, token-budgeting, single-purpose-chains.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../03-retrieval-and-rag/README.md](../03-retrieval-and-rag/README.md)
