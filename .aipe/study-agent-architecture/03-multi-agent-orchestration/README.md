# 03 — Multi-agent orchestration

Everything above one agent. Each topology is a *shape* first — lead with the diagram, then walk the coordination mechanism, then name the overhead it buys and what it buys with it.

**Anchor: multi-agent (primary).** This is the load-bearing new ground in the agent-architecture spec.

**contrl is single-agent (planned), so this sub-section is COVERED MINIMALLY.** Only two files are generated here: the boundary file (when not to go multi-agent — required reading even for single-agent codebases) and coordination failure modes (the failures from this sub-section that *also* hit single-agent loops, notably tool-call cascade and cost blowup).

The seven other topology files (supervisor-worker, sequential-pipeline, parallel-fan-out, debate-verifier-critic, swarm-handoff, graph-orchestration, shared-state-and-message-passing) are **not generated** because contrl's shape doesn't exercise them. They would be generated if contrl ever grew into a multi-agent system — at which point the SECTION F templates name the refactor.

## Files

- **[01-when-not-to-go-multi-agent.md](./01-when-not-to-go-multi-agent.md)** — the boundary. Required reading even for single-agent codebases. The decision to NOT cross into multi-agent is the most important multi-agent decision.
- **[02-coordination-failure-modes.md](./02-coordination-failure-modes.md)** — failure modes that also hit single-agent loops: infinite handoff (mostly multi-agent, but agents-as-tools have a flavor), tool-call cascade, context bloat, cost blowup. Mitigations that apply to contrl's planned agent.

## What's NOT here (and why)

If/when contrl grows past single-agent, these are the files that would be generated:

- `02-supervisor-worker.md` — most common multi-agent topology
- `03-sequential-pipeline.md` — agent chain
- `04-parallel-fan-out.md` — independent subtasks in parallel
- `05-debate-verifier-critic.md` — symmetric or asymmetric critique
- `06-swarm-handoff.md` — peer-to-peer control transfer
- `07-graph-orchestration.md` — explicit state machine over agents
- `08-shared-state-and-message-passing.md` — how agents communicate

For now, they're covered structurally in the SECTION F templates (`06-orchestration-system-design-templates/`).
