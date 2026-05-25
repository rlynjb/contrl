# AI engineering + ML — contrl guide

> Per-codebase AI engineering + ML guide for contrl. Covers LLM foundations, retrieval, agents, evals, production serving, and machine learning. **Codebase shape: classical supervised ML + on-device inference** (Phase 2C trained form classifier + recommender) plus a Phase 4 Path C LLM coaching agent layered on top of the ML outputs.

## Sub-sections

### LLM-side concepts (mostly Case B — contrl's only LLM surface is the planned coaching agent)

- **[01-llm-foundations](./01-llm-foundations/)** — what an LLM is, tokenization, sampling parameters, structured outputs, streaming, token economics, heuristic before LLM, provider abstraction, user override locks. Background reading for the coaching agent.
- **[02-context-and-prompts](./02-context-and-prompts/)** — context window, lost-in-the-middle, prompt chaining. Background.
- **[03-retrieval-and-rag](./03-retrieval-and-rag/)** — embeddings, chunking, vector DBs, hybrid retrieval with RRF, reranking, query rewriting (HyDE), stale embeddings, incremental indexing, RAG, GraphRAG. **All Case B — contrl has no retrieval surface.** Covered as study material.
- **[04-agents-and-tool-use](./04-agents-and-tool-use/)** — agents vs chains, tool calling, ReAct loop, tool routing, agent memory, error recovery, effective patterns, ML-in-the-loop. **Primary AI-side anchor: the Phase 4 Path C coaching agent. Full Case A treatment.**
- **[05-evals-and-observability](./05-evals-and-observability/)** — eval set types, eval methods, LLM-as-judge bias, LLM observability. Applies to both Phase 3 ML evals (B3.8, B3.9) and the coaching agent.
- **[06-production-serving](./06-production-serving/)** — LLM caching, cost optimization, prompt injection, rate limiting + backpressure, retry + circuit breaker. Mostly Case B; prompt injection applies to the coaching agent's tool inputs.

### ML-side concepts (Case A throughout — contrl's main shape)

- **[08-machine-learning](./08-machine-learning/)** — supervised pipeline, feature engineering, train/val/test, model selection, class imbalance, domain gap, transfer learning, confusion matrices, calibration, recommender systems, cold start, on-device inference, quantization, audit-trail logging, training-run logging, drift detection, retraining pipelines. **The richest sub-section — 19 concept files for contrl's Phase 2C ML work.**

### System design templates (IK-style interview reframes)

- **[07-system-design-templates](./07-system-design-templates/)** — search ranking, tech support chatbot.
- **[09-ml-system-design-templates](./09-ml-system-design-templates/)** — recommender system, anomaly detection, object detection / CV.

### Per-codebase synthesis

- **[ai-features-in-this-codebase.md](./ai-features-in-this-codebase.md)** — every AI feature in contrl (the planned coaching agent) with the patterns it uses.
- **[ml-features-in-this-codebase.md](./ml-features-in-this-codebase.md)** — every ML feature in contrl (form classifier, recommender, audit trail) with the patterns each uses.

## Reading order

Start with **08-machine-learning** — the richest, contrl-anchored Case A sub-section. Then **04-agents-and-tool-use** for the coaching agent that consumes the ML outputs. Then **05-evals-and-observability** for the discipline that protects both. **01**, **02**, **03**, **06** are background reading on LLM concepts that don't currently apply to contrl but inform what the Phase 4 coaching agent will need to handle. The two **templates** sub-sections are interview reframes; read them after the underlying concepts.

→ Portfolio overview: [00-overview.md](./00-overview.md)

→ Companion guides: prompt engineering at `../study-prompt-engineering/`. System-design + DSA at `../study-system-design-dsa/`.
