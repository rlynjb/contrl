# 01 — LLM foundations

The predictor shape + the operational concepts that follow from it. Most files are Case B for contrl (no shipping LLM code yet); the partial Case A files are the ones that apply to the planned Phase 4 coaching agent.

## Files

1. **[01-what-an-llm-is](./01-what-an-llm-is.md)** — autoregressive next-token predictor + sampling. The mental model determines what you trust and how you debug. Case B.
2. **[02-tokenization](./02-tokenization.md)** — sub-word units; provider-specific tokenizers; tokens are the unit of cost, context, and rate limits. Case B.
3. **[03-sampling-parameters](./03-sampling-parameters.md)** — temperature / top-p / max_tokens. Set explicitly per chain; defaults are general-purpose compromises. Case B (with planned coaching-agent values).
4. **[04-structured-outputs](./04-structured-outputs.md)** — sampler-level schema constraint via tool_use / response_format strict. The AI-engineering angle on the prompt-engineering pattern. Case A (planned for coaching agent).
5. **[05-streaming](./05-streaming.md)** — token-by-token output for perceived latency. Use for user-visible chains; skip for backend. Case B (planned for coaching agent).
6. **[06-token-economics](./06-token-economics.md)** — per-call cost attribution; output is 5× input pricing. Case B.
7. **[07-heuristic-before-llm](./07-heuristic-before-llm.md)** — try the cheap deterministic answer first; LLM as fallback. Case A — contrl's rep counter is the canonical instance.
8. **[08-provider-abstraction](./08-provider-abstraction.md)** — interface + per-vendor implementations for portability. Case B; contrl uses Anthropic SDK directly at solo scale.
9. **[09-user-override-locks](./09-user-override-locks.md)** — track who set each LLM-suggested field; respect user corrections. Case B (no LLM-suggested editable fields in contrl today).

## Reading order

Read **01** first (the predictor shape). Then **03** (sampling parameters) and **04** (structured outputs) for the operational controls. **07** (heuristic-before-LLM) is the most contrl-relevant — the rep counter is the worked example. **02** (tokenization) and **06** (token economics) for the cost framing. **05** (streaming), **08** (provider abstraction), **09** (user override locks) when those become relevant to contrl's scope.

→ Section overview: [../README.md](../README.md) · → next sub-section: [../02-context-and-prompts/README.md](../02-context-and-prompts/README.md)
