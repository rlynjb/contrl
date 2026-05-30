# 05 — Production serving for agents

What single-call serving becomes when the unit is a loop or a topology. `.aipe/study-ai-engineering/06-production-serving/` covers caching, cost, rate limiting, and retry for one LLM call. This sub-section covers the three places where the single-call version is insufficient because the unit of execution is no longer one call.

**Anchor: single-agent + multi-agent (both).** All three files apply to contrl's planned coaching loop, though most are Case B at solo scale.

## Files

- **[01-cross-turn-caching.md](./01-cross-turn-caching.md)** — three caching layers: provider prompt-prefix cache, intra-run memoization, cross-run semantic cache.
- **[02-fan-out-backpressure.md](./02-fan-out-backpressure.md)** — concurrency control on parallel sub-agent spawns. Case B for contrl (single-agent, no fan-out).
- **[03-per-tool-circuit-breaking.md](./03-per-tool-circuit-breaking.md)** — circuit breaker scoped to each tool, with open-circuit state fed back to the agent as an observation.

## Reading order

01 → 03 are most relevant for contrl. 02 is for multi-agent shapes and is included for completeness.
