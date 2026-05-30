# 01 — Reasoning patterns

How one model thinks through a task. This is the substrate every orchestration topology sits on — a supervisor-worker system is supervisor and workers each running one of these patterns. The family has an escalation ladder: start at the bottom, measure, escalate only when a specific failure shows up.

**Anchor: single-agent (primary) · workflow (secondary).** This is the primary sub-section for contrl, because contrl's planned coaching agent is a single-agent ReAct loop.

## The escalation ladder

```
Chain (engineer writes steps)
        │
        ▼  the model needs to choose what comes next
Single-agent ReAct (default loop)
        │
        ▼  the task has a structured plan worth committing up front
Plan-and-execute (separate planning from doing)
        │
        ▼  the agent's outputs need a second pass before trust
Reflexion / self-critique (critic loop)
        │
        ▼  the search space is wide and you can score candidates
Tree of Thoughts (branch and score — rarely worth it)
        │
        ▼  multiple specialties; the failure isn't single-agent fixable
Multi-agent topology (see SECTION C — usually NOT the right call)
```

The strong default is ReAct. The senior signal is "I built a ReAct baseline, measured, and only escalated when a specific failure appeared." Reaching past ReAct prematurely is one of the most common patterns of weak agent design.

## Files

- **[01-chains-vs-agents.md](./01-chains-vs-agents.md)** — the boundary. Where does the coaching loop sit relative to a chain? Why is this a single-agent codebase rather than a chain or a multi-agent system?
- **[02-react.md](./02-react.md)** — the baseline pattern, placed in the family. The mechanics live in `study-ai-engineering`; this file is about placement and escalation gating.
- **[03-plan-and-execute.md](./03-plan-and-execute.md)** — when to separate the planner from the executor. Why contrl's coaching loop doesn't need this (yet).
- **[04-reflexion-self-critique.md](./04-reflexion-self-critique.md)** — critique-and-revise. The cost is 2-5× tokens; the failure mode is shared blind spots.
- **[05-tree-of-thoughts.md](./05-tree-of-thoughts.md)** — branch and score. Why it rarely earns its place in production.
- **[06-routing.md](./06-routing.md)** — the heuristic-first router. The bridge from single-agent to multi-agent topologies.

## Reading order

01 → 02 first (the boundary, then the baseline). After that, drill in whichever pattern you're being asked about.
