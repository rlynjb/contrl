# 04 — Agents and tool use

**Primary AI-side anchor for contrl.** The Phase 4 Path C coaching agent reads classifier outputs and produces coaching messages via 5 read-only tools. Full Case A treatment throughout — these files describe contrl's planned agent architecture in detail.

## Files

1. **[01-agents-vs-chains](./01-agents-vs-chains.md)** — when an agent shape beats a fixed-sequence chain. contrl needs an agent because the tool sequence depends on classifier outputs.
2. **[02-tool-calling](./02-tool-calling.md)** — Anthropic's `tool_use` API; structured tool definitions; the contract between LLM and your tool implementations.
3. **[03-react-pattern](./03-react-pattern.md)** — observe → think → act loop; how the agent runs multiple tool calls per session.
4. **[04-tool-routing](./04-tool-routing.md)** — the agent decides which tools to call based on outputs; not all tools fire every session.
5. **[05-agent-memory](./05-agent-memory.md)** — `get_recent_coaching` is the memory boundary; agent's view of "what we've said before."
6. **[06-error-recovery](./06-error-recovery.md)** — what happens when a tool returns no data (new user, empty history); graceful degradation.
7. **[07-effective-patterns](./07-effective-patterns.md)** — the design patterns that make agents reliable in production.
8. **[08-ml-in-the-loop](./08-ml-in-the-loop.md)** — the canonical Case A — the coaching agent consumes the form classifier's outputs through tool calls. The "three shapes" interview story (CV + ML + LLM) lives here.

## Reading order

Read **08 (ML-in-the-loop)** first — it's the strongest contrl-anchored content and the centerpiece of the "three shapes" story. Then **01 (agents-vs-chains)** for the framing decision. Then **02-06** for the agent's mechanics. **07** for the broader pattern library.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../05-evals-and-observability/README.md](../05-evals-and-observability/README.md)
