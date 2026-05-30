# 04 — Agent infrastructure

The cross-cutting disciplines that matter more than any single topology. These are the parts most practitioners underweight and the parts that separate a demo from a shipped agent: what goes in the context window, how memory layers, what tools look like, how you measure trajectories, and what control envelope wraps the loop.

**Anchor: single-agent + multi-agent (both).** All five files apply to contrl's planned single-agent coaching loop.

## Files

- **[01-context-engineering.md](./01-context-engineering.md)** — the superset of prompt + retrieval + memory + tool outputs. The discipline that decides what fills the window.
- **[02-agent-memory-tiers.md](./02-agent-memory-tiers.md)** — working (in-context), episodic (recent sessions), long-term (persistent). The three-tier model.
- **[03-tool-calling-and-mcp.md](./03-tool-calling-and-mcp.md)** — tool calling as the substrate everything sits on; MCP as the protocol that standardizes the connection.
- **[04-agent-evaluation.md](./04-agent-evaluation.md)** — eval at the trajectory level, not the output level. Task success, tool-call accuracy, trajectory efficiency, recovery rate.
- **[05-guardrails-and-control.md](./05-guardrails-and-control.md)** — the input/output guardrails plus the loop's control envelope.

## Reading order

01 → 02 (the context+memory pair) → 03 (tools) → 04 (eval) → 05 (guardrails). 04 and 05 are independent but interact — the eval surface motivates the guardrails.
