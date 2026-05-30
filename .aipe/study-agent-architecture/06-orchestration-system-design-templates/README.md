# 06 — Orchestration system-design templates

IK-style interview reframes. Each template asks "design an agentic X system" — the standard architecture is generic; the "Applies to this codebase" and "How to make it apply" bullets are answered about contrl specifically.

Each template uses the 9-labelled-bullet shape from `study-ai-engineering.md`:

- `**The prompt:**`
- `**Standard architecture:**`
- `**Data model:**`
- `**Key components:**`
- `**Scale concerns:**`
- `**Eval framing:**`
- `**Common failure modes:**`
- `**Applies to this codebase:**` (one of `yes` / `partially` / `no`)
- `**How to make it apply:**`

## Files

- **[01-multi-agent-research-assistant.md](./01-multi-agent-research-assistant.md)** — "Design a system that answers a complex research question by gathering from multiple sources and synthesizing."
- **[02-agentic-support-system.md](./02-agentic-support-system.md)** — "Design an agent that resolves user requests by taking real actions across tools, and escalates when it can't." **Closest in shape to contrl's planned coaching agent.**
- **[03-agentic-coding-system.md](./03-agentic-coding-system.md)** — "Design an agent that completes a coding task across a repo — read, plan, edit, verify."

Templates are always generated, regardless of how closely they apply to the studied codebase. The "Applies" bullet is honest; the "How to make it apply" bullet names the concrete refactor.
