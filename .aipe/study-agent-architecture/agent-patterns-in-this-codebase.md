# Agent patterns in this codebase

contrl's agent surface today is empty. The planned Phase 4 Path C coaching agent is the only agent in scope, and it's a single-agent ReAct loop with five read-only tools. This file describes the planned shape; nothing in `src/lib/agent/` exists on disk yet.

## Agent patterns table

```
┌────────────────────────┬─────────────────────┬───────────────────────────────────────────┐
│ Feature                │ Pattern / shape     │ Why this pattern                          │
├────────────────────────┼─────────────────────┼───────────────────────────────────────────┤
│ Pose-detection         │ Workflow / chain    │ Engineer-written steps; deterministic;    │
│ pipeline (SHIPPING)    │                     │ no LLM in the loop                        │
├────────────────────────┼─────────────────────┼───────────────────────────────────────────┤
│ Rep-counter FSM        │ Workflow / chain    │ Deterministic state machine; no LLM       │
│ (SHIPPING)             │ (deterministic FSM) │                                           │
├────────────────────────┼─────────────────────┼───────────────────────────────────────────┤
│ Phase 4 coaching agent │ Single-agent ReAct  │ Tool sequence depends on classifier output;│
│ (PLANNED)              │                     │ cannot enumerate steps at code-writing    │
│                        │                     │ time                                       │
├────────────────────────┼─────────────────────┼───────────────────────────────────────────┤
│ — None planned —       │ Multi-agent         │ No specialty decomposition; one job       │
│                        │                     │ (produce coaching message); read-only      │
│                        │                     │ tool registry                              │
└────────────────────────┴─────────────────────┴───────────────────────────────────────────┘
```

## The shipping chains

contrl's runtime today has two chains, both fully deterministic, no LLM in the loop. They're chains by the definition in [01-reasoning-patterns/01-chains-vs-agents.md](./01-reasoning-patterns/01-chains-vs-agents.md) — the engineer wrote the control flow; nothing decides what step comes next at runtime.

```
┌─ Pose-detection pipeline (chain) ────────────────────────────────────────────────────┐
│                                                                                      │
│   camera frames ──► MediaPipe (GPU) ──► JS callback ──► per-exercise processor ──►   │
│   ~30 fps                                              ──► RepCounter FSM            │
│                                                                                      │
│   files: src/components/camera/PoseCamera.tsx                                        │
│          src/lib/pose/exercises/{pushup,squat,plank,pull,...}.ts                     │
│          src/lib/pose/rep-counter.ts                                                 │
│                                                                                      │
│   shape: chain — engineer wrote every step                                           │
│   loop: none (per-frame, no autonomous decision)                                     │
│   eval: planned per-exercise rep-count accuracy against video ground truth           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## The planned coaching agent

The only agent surface contrl will have. Detailed structure:

```
┌─ Phase 4 Path C — Single-agent coaching loop (PLANNED, not built) ───────────────────┐
│                                                                                      │
│   TRIGGER: user finishes a set (FSM emits rep count + classifier emits label)        │
│                                                                                      │
│   ┌──────────────────────────────────────────────────────────────────────────┐       │
│   │ Heuristic gate (planned, before the agent)                                │       │
│   │   - classifier confidence > 0.9                                           │       │
│   │   - label = "clean"                                                       │       │
│   │   - no recent drift signal                                                │       │
│   │   → SKIP the agent; emit canned encouragement                             │       │
│   └─────────────────────────────────┬────────────────────────────────────────┘       │
│                                     │ otherwise                                       │
│                                     ▼                                                 │
│   ┌──────────────────────────────────────────────────────────────────────────┐       │
│   │ Agent loop — ReAct                                                        │       │
│   │                                                                           │       │
│   │   Model: Anthropic Sonnet 4                                               │       │
│   │   Tools (5, all READ-ONLY):                                               │       │
│   │     - get_classifier_output(set_id)                                       │       │
│   │     - get_form_history(exercise, window)                                  │       │
│   │     - get_progression_state(category)                                     │       │
│   │     - get_recent_coaching(window)                                         │       │
│   │     - get_exercise_cues(exercise, level)                                  │       │
│   │                                                                           │       │
│   │   Expected trajectory: 2-4 turns per coaching event                       │       │
│   └─────────────────────────────────┬────────────────────────────────────────┘       │
│                                     ▼                                                 │
│   ┌──────────────────────────────────────────────────────────────────────────┐       │
│   │ Output guardrail (planned)                                                │       │
│   │   Zod schema: { message, priority_cue, confidence, formula_used }         │       │
│   │   The UI renders the validated structured output                          │       │
│   └─────────────────────────────────┬────────────────────────────────────────┘       │
│                                     ▼                                                 │
│                              Coaching message → UI                                    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Control envelope (the planned defenses)

| Defense | Setting | Lives in |
|---|---|---|
| Iteration cap | K = 8 turns max | `src/lib/agent/runner.ts` |
| Token budget | 50k tokens per run | `src/lib/agent/runner.ts` |
| Per-tool circuit breakers | 3 fails → OPEN, 30s cooldown | `src/lib/agent/runner.ts` |
| Tool allowlist | 5 read-only tools, no write surface | `src/lib/agent/tools/` |
| Input sanitization | exercise notes wrapped in `<exercise_notes>` | `src/lib/agent/sanitize.ts` |
| Output schema | Zod validation before UI render | `src/lib/agent/schemas.ts` |
| Prefix caching | `cache_control: ephemeral` on system + tools | `src/lib/agent/runner.ts` |

### Eval surface (Phase 3 work)

| Metric | Target | Lives in |
|---|---|---|
| Task success rate | LLM-as-judge against rubric, target >90% | `tests/agent/run.ts` |
| Tool-call accuracy | Programmatic (right tool, right args), target >95% | `tests/agent/run.ts` |
| Trajectory efficiency | p99 ≤ 6 turns | `tests/agent/run.ts` |
| Recovery rate | Graceful degrade on injected tool failures | `tests/agent/adversarial.json` |

## What contrl deliberately does NOT do

These are deliberate Case B — not "we forgot" but "not in scope at this design":

- **Multi-agent topologies** — no supervisor-worker, no pipeline, no fan-out, no debate, no swarm, no graph orchestration. One agent, one job, bounded tools. See [03-multi-agent-orchestration/01-when-not-to-go-multi-agent.md](./03-multi-agent-orchestration/01-when-not-to-go-multi-agent.md) for the rationale.
- **Plan-and-execute** — task too small (3-4 turns); planner round-trip would dominate cost. See [01-reasoning-patterns/03-plan-and-execute.md](./01-reasoning-patterns/03-plan-and-execute.md).
- **Reflexion / self-critique** — cost-of-bad-output is medium; 2-5× token cost not justified at solo scale. See [01-reasoning-patterns/04-reflexion-self-critique.md](./01-reasoning-patterns/04-reflexion-self-critique.md).
- **Tree of Thoughts** — no scoring function for coaching reasoning branches. See [01-reasoning-patterns/05-tree-of-thoughts.md](./01-reasoning-patterns/05-tree-of-thoughts.md).
- **Agentic RAG / retrieval routing** — data is structured (SQLite + ONNX output); tool calls beat embedding retrieval. See [02-agentic-retrieval/README.md](./02-agentic-retrieval/README.md).
- **Episodic + long-term memory tiers** — bounded tool calls over SQLite provide episodic-like behavior cheaply. See [04-agent-infrastructure/02-agent-memory-tiers.md](./04-agent-infrastructure/02-agent-memory-tiers.md).
- **Cross-run semantic caching** — solo scale (1-2 events/day) doesn't justify the vector store + embedding + freshness layer. See [05-production-serving/01-cross-turn-caching.md](./05-production-serving/01-cross-turn-caching.md).
- **Fan-out backpressure** — single-agent, no parallel sub-agents to backpressure. See [05-production-serving/02-fan-out-backpressure.md](./05-production-serving/02-fan-out-backpressure.md).
- **Human-in-the-loop pauses** — all tools read-only, no side effects to gate. Would land if write tools ever did.
- **MCP** — one agent with five tools; MCP earns its place at 3+ agents sharing a registry.

## When the design would grow

If contrl's agent surface ever grew, the most likely escalations in order:

1. **Confidence-gated heuristic upgrade** — the planned `should-coach` heuristic gate becomes more sophisticated (LLM classifier at the bottom of the cascade). Still single-agent.
2. **Episodic memory** — if cross-session continuity becomes a feature requirement (the agent remembers user-stated preferences across weeks), build an episodic store.
3. **Plan-and-execute** — if the agent's job grows to longer-horizon tasks (weekly program review, multi-week trend analysis), the planner round-trip pays back. Still single-agent.
4. **Write tools + human gate** — if the agent ever needs to modify user state directly (auto-adjust progression, create programs), the full prompt-injection defense + human-in-the-loop pause becomes mandatory.
5. **Multi-agent** — only if a feature genuinely splits into specialties with non-overlapping context. Unlikely for contrl; see the boundary file.

## Reading order to defend this design

1. [01-reasoning-patterns/01-chains-vs-agents.md](./01-reasoning-patterns/01-chains-vs-agents.md) — why the coaching loop is an agent, not a chain
2. [01-reasoning-patterns/02-react.md](./01-reasoning-patterns/02-react.md) — why ReAct, not anything more sophisticated
3. [04-agent-infrastructure/03-tool-calling-and-mcp.md](./04-agent-infrastructure/03-tool-calling-and-mcp.md) — the read-only tool registry
4. [04-agent-infrastructure/05-guardrails-and-control.md](./04-agent-infrastructure/05-guardrails-and-control.md) — the full control envelope
5. [03-multi-agent-orchestration/01-when-not-to-go-multi-agent.md](./03-multi-agent-orchestration/01-when-not-to-go-multi-agent.md) — why multi-agent is the wrong call

In an interview, the strong answer to "design the coaching agent" is to walk this path: chain or agent? agent. which pattern? ReAct. why not anything else? measure first; nothing in the eval signals escalation. what bounds it? read-only tool allowlist + iteration cap + token budget + per-tool circuit breakers + output schema.
