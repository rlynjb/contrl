# 05 — Evals and observability

Eval discipline plus runtime observability. Applies to both ML (Phase 3 builds B3.8, B3.9 for contrl) and LLM (the coaching agent's quality and drift detection). Partial Case A throughout — contrl's curriculum explicitly includes eval infrastructure.

## Files

1. **[01-eval-set-types](./01-eval-set-types.md)** — four sets, four jobs: golden (anchor good), regression (don't repeat failures), holdout (detect overfitting), adversarial (probe worst-case). Case A for the planned Phase 2C/3 ML evals.
2. **[02-eval-methods](./02-eval-methods.md)** — programmatic (structural), reference-based (factual), LLM-as-judge (subjective). Layered in production. Case A for ML classifier; planned Case A for coaching agent.
3. **[03-llm-as-judge-bias](./03-llm-as-judge-bias.md)** — judges have biases (length, familiarity, position, inflation); calibrate against human ratings (≥85% agreement). Case B planned for coaching agent.
4. **[04-llm-observability](./04-llm-observability.md)** — per-call trace, per-chain dashboards, drift detection, sampling at scale. Case B planned for coaching agent; ML side has parallel audit-trail discipline (`classifier_outputs` table).

## Reading order

Read **01 (eval set types)** first — the typing discipline that makes everything else meaningful. Then **02 (eval methods)** for the scoring layer. **03 (judge bias)** is necessary when LLM-as-judge enters the picture; **04 (observability)** is the production runtime layer.

→ Companion concepts: prompt-engineering [05-eval-driven-iteration](../../study-prompt-engineering/05-eval-driven-iteration.md) and [08-machine-learning/03-train-val-test-discipline](../08-machine-learning/03-train-val-test-discipline.md).

→ Section overview: [../README.md](../README.md) · → next sub-section: [../06-production-serving/README.md](../06-production-serving/README.md)
