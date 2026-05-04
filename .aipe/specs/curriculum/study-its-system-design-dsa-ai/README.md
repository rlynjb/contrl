# Curriculum: study its system design, DSA, AI

A learning resource derived from contrl's own code — a fitness progression app (Expo / React Native / SQLite / Notion sync / MediaPipe pose detection) used as the textbook. Each concept is grounded in a specific file or function so you can cross-reference theory with the running code.

---

## Chapters

1. **[00 — Overview](00-overview.md)** — why this curriculum exists for *this* codebase, where its surface area is rich vs. thin, and how to actually study from it.
2. **[01 — Agentic AI](01-agentic-ai.md)** — the absent category. The closest deterministic analogs (FSM as a perception loop, sessions as memory) and what you'd build to add a real agent.
3. **[02 — Systems thinking](02-systems-thinking.md)** — sync ordering, last-edit-wins with bias, idempotency, mini event sourcing, additive migrations, soft delete, the post-sync-reconstruction race.
4. **[03 — Thinking in code](03-thinking-in-code.md)** — the rep counter FSM, hysteresis, exponential smoothing, discriminated-union dispatch, error classification, mapper pattern, local-first IDs.
5. **[04 — AI product engineering](04-ai-product-engineering.md)** — spec-driven dev via `.aipe/`, the memory bank pattern, context-window-aware file structure, the deliberate non-LLM tradeoffs.
6. **[05 — Language-agnostic principles](05-language-agnostic.md)** — the transferable rules (15 of them) that apply in any language: SSoT, idempotency, FSMs, hysteresis, additive migrations, etc.
7. **[06 — Ordered learning path](06-curriculum-path.md)** — the spine. 36 concepts in dependency order across 7 phases, plus suggested follow-up reading.

---

## Concept index

Every concept covered, with its category, difficulty, and link.

### Foundational 🟢

| Concept | Category | Link |
|---|---|---|
| Tool calling (absent) | Agentic AI | [§1.2](01-agentic-ai.md#12--tool-calling-absent-) |
| Orchestration | Agentic AI | [§1.5](01-agentic-ai.md#15--orchestration-absent-for-ai-present-for-sync-) |
| Source of truth, by entity | Systems | [§2.1](02-systems-thinking.md#21--source-of-truth-by-entity-) |
| Idempotency (in this codebase) | Systems | [§2.4](02-systems-thinking.md#24--idempotency-) |
| Separation of concerns | Systems | [§2.10](02-systems-thinking.md#210--separation-of-concerns-storage-vs-policy-vs-ui-) |
| Finite state machine: rep counter | Code | [§3.1](03-thinking-in-code.md#31--finite-state-machine-the-rep-counter-) |
| Schema-first storage | Code | [§3.5](03-thinking-in-code.md#35--schema-first-storage-) |
| Pure derivations as functions | Code | [§3.10](03-thinking-in-code.md#310--pure-derivations-as-functions-not-methods-) |
| Spec-driven development | AI Product | [§4.1](04-ai-product-engineering.md#41--spec-driven-development-) |
| Single source of truth (SSoT) | Lang-agnostic | [§5.1](05-language-agnostic.md#51--single-source-of-truth-ssot-) |
| Idempotency (transferable) | Lang-agnostic | [§5.2](05-language-agnostic.md#52--idempotency-) |
| Finite state machines | Lang-agnostic | [§5.4](05-language-agnostic.md#54--finite-state-machines-) |
| Additive migrations (transferable) | Lang-agnostic | [§5.9](05-language-agnostic.md#59--additive-migrations-) |
| Pure-function policy at the core | Lang-agnostic | [§5.10](05-language-agnostic.md#510--pure-function-policy-at-the-core-) |

### Intermediate 🟡

| Concept | Category | Link |
|---|---|---|
| Deterministic vs. agentic perception | Agentic AI | [§1.1](01-agentic-ai.md#11--deterministic-perception-vs-agentic-perception-) |
| ReAct loop (absent) | Agentic AI | [§1.3](01-agentic-ai.md#13--react-loop-absent-) |
| Memory patterns (absent) | Agentic AI | [§1.4](01-agentic-ai.md#14--memory-patterns-absent-) |
| Sync ordering | Systems | [§2.2](02-systems-thinking.md#22--sync-ordering-) |
| Additive migrations | Systems | [§2.6](02-systems-thinking.md#26--additive-migrations-) |
| Soft delete + tombstones | Systems | [§2.7](02-systems-thinking.md#27--soft-delete--tombstones-) |
| Rate limiting + backoff | Systems | [§2.8](02-systems-thinking.md#28--rate-limiting--backoff-) |
| Hysteresis | Code | [§3.2](03-thinking-in-code.md#32--hysteresis-preventing-edge-bouncing-) |
| Exponential smoothing | Code | [§3.3](03-thinking-in-code.md#33--exponential-smoothing-) |
| Discriminated unions for dispatch | Code | [§3.4](03-thinking-in-code.md#34--discriminated-unions-for-processor-dispatch-) |
| Error classification | Code | [§3.6](03-thinking-in-code.md#36--error-classification-transient-vs-permanent-) |
| Optimistic UI / draft autosave | Code | [§3.7](03-thinking-in-code.md#37--optimistic-ui--draft-autosave-) |
| Mapper pattern (boundary translation) | Code | [§3.8](03-thinking-in-code.md#38--mapper-pattern-boundary-translation-) |
| Memory bank pattern | AI Product | [§4.2](04-ai-product-engineering.md#42--memory-bank-pattern-externalised-context-) |
| Context window management | AI Product | [§4.3](04-ai-product-engineering.md#43--context-window-management-by-file-structure-) |
| Cost vs. capability tradeoffs | AI Product | [§4.4](04-ai-product-engineering.md#44--cost-vs-capability-tradeoffs-the-absent-llm-) |
| Event log + projection | Lang-agnostic | [§5.3](05-language-agnostic.md#53--event-log--projection-) |
| Hysteresis (transferable) | Lang-agnostic | [§5.5](05-language-agnostic.md#55--hysteresis-) |
| Last-edit-wins with bias (transferable) | Lang-agnostic | [§5.6](05-language-agnostic.md#56--last-edit-wins-with-bias-) |
| Soft delete + tombstones (transferable) | Lang-agnostic | [§5.7](05-language-agnostic.md#57--soft-delete--tombstones-) |
| Rate limiting + Retry-After (transferable) | Lang-agnostic | [§5.8](05-language-agnostic.md#58--rate-limiting--retry-after-) |
| Schema-first, types-mirror-storage | Lang-agnostic | [§5.11](05-language-agnostic.md#511--schema-first-types-mirror-storage-) |
| Discriminated unions (transferable) | Lang-agnostic | [§5.13](05-language-agnostic.md#513--discriminated-unions-for-shape-variation-) |
| Boundary translation (transferable) | Lang-agnostic | [§5.14](05-language-agnostic.md#514--boundary-translation-mapper-pattern-) |

### Advanced 🔴

| Concept | Category | Link |
|---|---|---|
| Prompt chaining (absent) | Agentic AI | [§1.6](01-agentic-ai.md#16--prompt-chaining-absent-) |
| Last-edit-wins with bias | Systems | [§2.3](02-systems-thinking.md#23--last-edit-wins-with-bias-) |
| Event log + derived cache (mini ES) | Systems | [§2.5](02-systems-thinking.md#25--event-log--derived-cache-mini-event-sourcing-) |
| Race: post-sync reconstruction | Systems | [§2.9](02-systems-thinking.md#29--race-condition-post-sync-reconstruction-ordering-) |
| Local-first IDs + late binding | Code | [§3.9](03-thinking-in-code.md#39--deterministic-id-generation--late-binding-) |
| Evaluation (mostly absent) | AI Product | [§4.5](04-ai-product-engineering.md#45--evaluation-mostly-absent--and-what-would-change-if-added-) |
| Spec → AI-agent execution loop | AI Product | [§4.6](04-ai-product-engineering.md#46--spec--ai-agent-execution-loop-) |
| Local-first IDs + late binding (transferable) | Lang-agnostic | [§5.12](05-language-agnostic.md#512--local-first-ids--late-binding-) |
| Order is a spec | Lang-agnostic | [§5.15](05-language-agnostic.md#515--order-is-a-spec-not-an-implementation-detail-) |
