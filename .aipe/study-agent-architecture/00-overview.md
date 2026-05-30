# Agent architecture — overview

> contrl's agent surface today is empty. The planned Phase 4 Path C coaching agent is a **single-agent ReAct loop** with five read-only tools — that's the dominant shape for this guide. Multi-agent topologies are out of scope: contrl will not coordinate many agents, it will run one agent that reasons over local data through bounded tool calls. This guide places the planned agent in the family of reasoning patterns, names the infrastructure it needs (context engineering, memory tiers, evals, guardrails), and explains the multi-agent boundary so you can defend the choice not to cross it.

```
┌─ Agent surface — what's planned for contrl, with the loop and the bounds ────────────────────┐
│                                                                                              │
│   SHIPPING TODAY                                                                             │
│   ─────────────                                                                              │
│   nothing agentic — pose detection + rep-counter FSM are deterministic;                      │
│   no LLM, no autonomous loop                                                                 │
│                                                                                              │
│                                                                                              │
│   PLANNED — Phase 4 Path C — single-agent coaching loop                                      │
│   ──────────────────────────────────────────────────────                                     │
│                                                                                              │
│       ┌─────────────────────────────────────────────────────────────────┐                    │
│       │                User finishes a set                              │                    │
│       └──────────────────────┬──────────────────────────────────────────┘                    │
│                              │  (set complete, classifier emits label)                       │
│                              ▼                                                               │
│       ┌─────────────────────────────────────────────────────────────────┐                    │
│       │              Coaching agent — ReAct loop                        │                    │
│       │                                                                  │                    │
│       │     ┌──────────┐    ┌──────────┐    ┌──────────┐                 │                    │
│       │     │  Reason  │───►│   Act    │───►│ Observe  │                 │                    │
│       │     │  (Sonnet │    │ (tool    │    │ (tool    │                 │                    │
│       │     │  4)       │    │  call)   │    │  result) │                 │                    │
│       │     └──────────┘    └──────────┘    └────┬─────┘                 │                    │
│       │            ▲                              │                       │                    │
│       │            └──────────────────────────────┘                       │                    │
│       │                  loop, capped (iteration + cost ceiling)         │                    │
│       │                                                                  │                    │
│       │     Tools (5, all READ-ONLY):                                    │                    │
│       │       get_classifier_output(set_id)                              │                    │
│       │       get_form_history(exercise, window)                         │                    │
│       │       get_progression_state(category, level)                     │                    │
│       │       get_recent_coaching(window)                                │                    │
│       │       get_exercise_cues(exercise)                                │                    │
│       └──────────────────────┬──────────────────────────────────────────┘                    │
│                              │                                                                │
│                              ▼                                                               │
│       ┌─────────────────────────────────────────────────────────────────┐                    │
│       │           Coaching message → UI (structured output)             │                    │
│       └─────────────────────────────────────────────────────────────────┘                    │
│                                                                                              │
│                                                                                              │
│   OUT OF SCOPE — multi-agent topologies                                                      │
│   ─────────────────────────────────────                                                      │
│   no supervisor-worker, no pipeline, no fan-out, no debate, no swarm, no graph              │
│   orchestration. One agent. One loop. Bounded tools. Read the                                │
│   multi-agent boundary file before reaching for any of it.                                   │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Dominant shape: single-agent (planned, not built).** The whole guide is anchored to this shape. SECTION A (reasoning patterns) is the primary anchor — ReAct is the baseline for the coaching agent, and the file family explains why you'd escalate (and why contrl doesn't need to). SECTION D (agent infrastructure) is where the design work lives — context engineering, memory tiers, evals, guardrails. SECTION C (multi-agent) is covered minimally: the boundary file ("when not to") and coordination failure modes, because even a single-agent loop has the cost-blowup and tool-call cascade modes.

---

## Legend

- **Phase 4 Path C** — the coaching agent path in `aieng-curriculum.md`. Five read-only tools, Anthropic Sonnet 4, ReAct-style loop. Not built yet; the curriculum has it scoped, not started.
- **Single-agent** — one autonomous loop. The model decides which tool to call and when to stop. One actor. (Distinct from a chain, where the engineer writes the steps and the model fills slots.)
- **Tool registry (planned)** — five read-only data accessors over the local SQLite tables and ONNX classifier output. No write tools. No external API tools. The read-only-tool allowlist is contrl's primary prompt-injection defense — see `.aipe/study-ai-engineering/06-production-serving/03-prompt-injection.md` and 04-agent-infrastructure/05-guardrails-and-control.md in this guide.
- **Coaching message output** — a structured `tool_use` call with `{ message, priority_cue, confidence, formula_used }`. The agent emits exactly one of these per set; no free-text path.
- **Iteration + cost cap** — every loop terminates in O(small) turns; the agent's `runner.ts` enforces both a per-run token budget and a max-iteration ceiling. Concrete defenses against tool-call cascade (see 03-multi-agent-orchestration/02-coordination-failure-modes.md).

---

## How this guide pairs with `study-ai-engineering`

This guide does NOT re-teach single-agent mechanics. Those live in `.aipe/study-ai-engineering/04-agents-and-tool-use/` — the per-concept files there cover agents vs chains, tool calling, ReAct, tool routing, agent memory, error recovery, effective patterns, and ML-in-the-loop. This guide cross-references those files and covers only what's *additional* once you treat the agent's loop as an architectural pattern:

```
┌─ The split with study-ai-engineering ────────────────────────────────────────────────────┐
│                                                                                          │
│   study-ai-engineering              study-agent-architecture (this guide)                │
│   ─────────────────────              ──────────────────────────────────────              │
│   what ONE agent does                what happens ABOVE one agent                        │
│   ReAct mechanics                    placement in the reasoning-pattern family           │
│   tool calling mechanics             tool calling as the substrate of every topology     │
│   RAG/GraphRAG mechanics             retrieval as a control loop (agentic RAG)            │
│   agent memory (two layers)          memory tiers (working / episodic / long-term)        │
│   LLM evals (output quality)         agent evals (trajectory + tool-call accuracy)        │
│   single-call serving (cache,        loop/topology serving (cross-turn cache,              │
│   cost, rate limit, retry)           fan-out backpressure, per-tool circuit breaking)      │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Every concept file in this guide cites the study-ai-engineering file that owns the mechanics. If you're reading the chain-of-thought story here for the first time and you want to ground in the per-call mechanics, follow the `See also` link.

---

→ Sub-section indexes: [01-reasoning-patterns](./01-reasoning-patterns/README.md) · [02-agentic-retrieval](./02-agentic-retrieval/README.md) · [03-multi-agent-orchestration](./03-multi-agent-orchestration/README.md) · [04-agent-infrastructure](./04-agent-infrastructure/README.md) · [05-production-serving](./05-production-serving/README.md) · [06-orchestration-system-design-templates](./06-orchestration-system-design-templates/README.md)

→ Per-codebase synthesis: [agent-patterns-in-this-codebase.md](./agent-patterns-in-this-codebase.md)

→ Companion guides: `.aipe/study-ai-engineering/` for single-agent mechanics; `.aipe/study-prompt-engineering/` for prompt-side discipline; `.aipe/study-interview-defense/` for the project-level defense.
