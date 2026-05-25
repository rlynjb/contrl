# 06 — Production serving

The runtime concerns: caching, cost, injection defense, rate limits, retries. Mostly Case B for contrl at solo scale, but the cost-free levers (caching, max_tokens cap, heuristic short-circuit) apply regardless of volume.

## Files

1. **[01-llm-caching](./01-llm-caching.md)** — Anthropic prompt cache (~90% discount on cached prefix). Trivial enable; planned for coaching agent.
2. **[02-llm-cost-optimization](./02-llm-cost-optimization.md)** — measure-first discipline; levers in order: heuristic > routing > caching > output trim > input trim > provider switch.
3. **[03-prompt-injection](./03-prompt-injection.md)** — runtime defenses (input validation, tool allowlist, output validation, audit). Partial Case A — contrl's read-only tools bound damage scope.
4. **[04-rate-limiting-backpressure](./04-rate-limiting-backpressure.md)** — provider rate limits + client-side backpressure. Case B for contrl at solo scale.
5. **[05-retry-circuit-breaker](./05-retry-circuit-breaker.md)** — classify errors (transient, sustained, permanent); appropriate response per class. Case B; SDK defaults sufficient at solo scale.

## Reading order

Read **02 (cost optimization)** first — the framing for the rest. Then **01 (caching)** for the cheapest single lever. **03 (prompt injection)** is the security layer; pairs with prompt-engineering [12-prompt-injection-defense](../../study-prompt-engineering/12-prompt-injection-defense.md). **04** and **05** are operational concerns that become load-bearing at higher volume.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../07-system-design-templates/README.md](../07-system-design-templates/README.md)
