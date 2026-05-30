# Agent architecture — index

contrl's agent surface, organized as six sub-sections plus a per-codebase synthesis file. The dominant shape is **single-agent (planned, not built)** — the Phase 4 Path C coaching agent is one ReAct-style loop with five read-only tools. The guide covers what's relevant for that shape, cross-references `study-ai-engineering` for mechanics, and explains the multi-agent boundary so you can defend the choice not to cross it.

## Reading order

Read across sub-sections in alphabetical order on first pass: A → B → C → D → E → F. Within each sub-section, most files are self-contained — the sub-section README names a recommended order, but you can drill in from this index.

```
┌─ A. Reasoning patterns  (primary anchor for contrl) ─────────────────────────────────────┐
│  How one model thinks through a task. The substrate everything else sits on.            │
│  Start with chains-vs-agents (the boundary) and react (the baseline contrl uses).       │
│                                                                                          │
│  → 01-chains-vs-agents.md           where the contrl coaching agent sits                 │
│  → 02-react.md                       the baseline — the planned coaching agent's loop    │
│  → 03-plan-and-execute.md            when to separate planning from doing                │
│  → 04-reflexion-self-critique.md     critique-and-revise; cost vs reliability            │
│  → 05-tree-of-thoughts.md            why it rarely earns its place in production         │
│  → 06-routing.md                     the bridge to multi-agent topologies                │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ B. Agentic retrieval  (in-scope; Case B for contrl) ────────────────────────────────────┐
│  Retrieval as a control loop, not a one-shot pipeline step.                             │
│  contrl uses tool calls over local data, not embedding retrieval — these are Case B.   │
│                                                                                          │
│  → 01-agentic-rag.md                 ReAct whose primary tool is retrieval               │
│  → 02-self-corrective-rag.md          relevance grader + fallback                        │
│  → 03-retrieval-routing.md            many sources; route the query                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ C. Multi-agent orchestration  (out-of-shape; boundary files only) ─────────────────────┐
│  Everything above one agent. contrl is single-agent — only the boundary files apply.   │
│                                                                                          │
│  → 01-when-not-to-go-multi-agent.md  the gate; required reading even for single-agent   │
│  → 02-coordination-failure-modes.md   tool-call cascade, cost blowup, context bloat —    │
│                                       single-agent has subset of these too               │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ D. Agent infrastructure  (cross-cutting; applies to contrl's single-agent) ────────────┐
│  The disciplines that separate a demo from a shipped agent.                              │
│                                                                                          │
│  → 01-context-engineering.md          the superset of prompt + retrieval + memory + tools │
│  → 02-agent-memory-tiers.md           working / episodic / long-term                      │
│  → 03-tool-calling-and-mcp.md         the substrate; MCP for cross-agent tool reuse       │
│  → 04-agent-evaluation.md             trajectory + tool-call accuracy (not just output)  │
│  → 05-guardrails-and-control.md       the bounded loop: caps, budgets, human gates       │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ E. Production serving for agents  (planned for contrl; mostly Case B at solo scale) ───┐
│  What single-call serving becomes when the unit is a loop or a topology.                 │
│                                                                                          │
│  → 01-cross-turn-caching.md           three caching layers: prefix / intra-run / cross   │
│  → 02-fan-out-backpressure.md         multi-agent only — Case B for contrl               │
│  → 03-per-tool-circuit-breaking.md    feeds the open-circuit state back to the agent     │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ F. Orchestration system-design templates  (always generated) ──────────────────────────┐
│  IK-style reframes. The studied codebase (contrl) reframed as an agentic system.         │
│                                                                                          │
│  → 01-multi-agent-research-assistant.md  "design a research system"                      │
│  → 02-agentic-support-system.md           "design an action-taking agent" — closest to    │
│                                            contrl's coaching agent in structure          │
│  → 03-agentic-coding-system.md            "design a coding agent"                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Per-codebase synthesis

→ [`agent-patterns-in-this-codebase.md`](./agent-patterns-in-this-codebase.md) — the patterns contrl currently uses (none today; one planned) with the structure of the planned coaching loop, its control envelope, and its eval surface.

## How this guide pairs with the rest

This guide does NOT re-teach single-agent mechanics (those live in `.aipe/study-ai-engineering/04-agents-and-tool-use/`). Every concept file cross-references the mechanics file in `study-ai-engineering` and covers only the agent-architecture angle — placement in the pattern family, the loop, the topology, the trajectory.

- Single-agent mechanics → `.aipe/study-ai-engineering/04-agents-and-tool-use/`
- RAG / retrieval mechanics → `.aipe/study-ai-engineering/03-retrieval-and-rag/`
- Prompt-level disciplines → `.aipe/study-prompt-engineering/`
- Project-level interview defense → `.aipe/study-interview-defense/` (Chapter 6 — the planned ML/LLM work)
