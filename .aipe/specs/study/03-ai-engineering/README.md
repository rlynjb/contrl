# 03 — AI Engineering

Curriculum-loaded mode. contrl-mo's AI scope is **Phase 4 Path C** of the curriculum: an LLM coaching agent that orchestrates over a trained form classifier. **No AI surface ships today** — every file in this section is **Case B** (concept not yet implemented; the file's `## In this codebase` says so and the `## Project exercises` block names the curriculum Build item that *would* implement it).

## Curriculum mapping

| File | Concept ID | Build IDs | Status in contrl-mo |
|---|---|---|---|
| [01-tool-and-function-calling](./01-tool-and-function-calling.md) | C4.1 | B4C.1, B4C.2 | Not yet — Case B |
| [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) | C4.2 | B4C.1, B4C.3, B4.7 | Not yet — Case B |
| [03-agent-memory](./03-agent-memory.md) | C4.5 | B4C.1, B4C.2 | Not yet — Case B |
| [04-tool-routing](./04-tool-routing.md) | C4.6 | B4C.4 | Not yet — Case B |
| [05-error-recovery-in-agents](./05-error-recovery-in-agents.md) | C4.7 | B4C.5 | Not yet — Case B |
| [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md) | C4.9 | B4.6 | Documented (this guide) |
| [07-building-effective-agents-patterns](./07-building-effective-agents-patterns.md) | C4.11 | B4.8 | Not yet — Case B |
| [08-ml-in-the-loop-agents](./08-ml-in-the-loop-agents.md) | C4.12 | B4C.1, B4C.2 + Phase 2C | Not yet — Case B |

## Sub-discipline groupings

(Standard AI-engineering catalog. contrl-mo's curriculum-tagged scope is narrow — Phase 4 Path C only — so most sub-disciplines are absent here.)

### Agents and tool use *(in scope for contrl-mo)*
- [01-tool-and-function-calling](./01-tool-and-function-calling.md)
- [02-agent-loop-and-termination](./02-agent-loop-and-termination.md)
- [03-agent-memory](./03-agent-memory.md)
- [04-tool-routing](./04-tool-routing.md)
- [05-error-recovery-in-agents](./05-error-recovery-in-agents.md)
- [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)
- [07-building-effective-agents-patterns](./07-building-effective-agents-patterns.md)
- [08-ml-in-the-loop-agents](./08-ml-in-the-loop-agents.md) — contrl-mo's interview-defining pattern

### Sub-disciplines NOT in scope for contrl-mo

(These have no curriculum-tagged contrl-mo concepts. Anchored to loopd or aipe in the curriculum.)
- LLM foundations (loopd anchored)
- Prompt engineering (aipe anchored)
- Context and prompts (loopd anchored)
- Retrieval and RAG (loopd 2A, aipe 2B)
- Evals and observability — *AI side covered in [03 of 04-machine-learning](../04-machine-learning/) for ML side*
- Production serving (loopd anchored)

## AI features table (current state)

| Feature | Pattern used | Status |
|---|---|---|
| Rep counting | Deterministic FSM + exponential smoothing | Shipped (no LLM involvement) |
| Form classification | Trained classifier | Planned — Phase 2C |
| Progression recommender | Rule-based first, learned later | Planned — Phase 2C |
| End-of-session coaching | LLM agent with ML-as-tool | Planned — Phase 4 Path C |

**No surface in contrl-mo currently calls an LLM.** This section documents the planned agent so the design discussion is ready when Phase 4 Path C ships.

## Where to drill in

- Start at **[01-tool-and-function-calling](./01-tool-and-function-calling.md)** — the mechanism the rest assumes.
- Then **[02-agent-loop-and-termination](./02-agent-loop-and-termination.md)** — how the loop runs.
- **[08-ml-in-the-loop-agents](./08-ml-in-the-loop-agents.md)** is the interview-defining file; read after 01 and 02.
- **[06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)** is the maturity signal; read last.

→ See [`system-design-templates/`](./system-design-templates/) for IK-style interview reframes (search ranking, tech support chatbot).
