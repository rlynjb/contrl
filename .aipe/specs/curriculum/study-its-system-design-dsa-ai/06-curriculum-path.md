# 06 — Ordered learning path

A dependency-ordered walkthrough of every concept in this curriculum. If you read in this order, prerequisites are always behind you. Each entry links back to the chapter section where it's grounded in code.

---

## Phase 1 — Foundations 🟢

Read these first. Everything else assumes you understand the shape of the system and the basic vocabulary.

1. **[Single source of truth](05-language-agnostic.md#51--single-source-of-truth-ssot-)** — the design discipline that every other sync decision flows from.
2. **[Source of truth, by entity](02-systems-thinking.md#21--source-of-truth-by-entity-)** — the entity-by-entity application: exercises one-way, sessions bidirectional, derived state never synced.
3. **[Schema-first storage](03-thinking-in-code.md#35--schema-first-storage-)** — start with `database.ts:25` and `types/index.ts`. The schema *is* the domain.
4. **[Pure-function policy at the core](05-language-agnostic.md#510--pure-function-policy-at-the-core-)** + **[Pure derivations as functions](03-thinking-in-code.md#310--pure-derivations-as-functions-not-methods-)** — read `src/lib/game/` as a whole. Notice none of it imports from `services/`.
5. **[Separation of concerns](02-systems-thinking.md#210--separation-of-concerns-storage-vs-policy-vs-ui-)** — the rule that explains the directory layout.
6. **[Idempotency](02-systems-thinking.md#24--idempotency-)** + **[Idempotency (transferable)](05-language-agnostic.md#52--idempotency-)** — the property that makes everything else retryable.
7. **[Finite state machines](03-thinking-in-code.md#31--finite-state-machine-the-rep-counter-)** + **[FSMs (transferable)](05-language-agnostic.md#54--finite-state-machines-)** — read `src/lib/pose/rep-counter.ts` end-to-end. 86 lines; you'll know FSMs after this one.

By end of Phase 1 you can articulate: "where does the truth live, what's derived from what, and why are policy and storage in different folders."

---

## Phase 2 — The sync engine 🟡

These concepts cluster around `src/services/notion/`. They are best read as a unit because they interlock.

8. **[Sync ordering](02-systems-thinking.md#22--sync-ordering-)** — read `syncAll` at `sync.ts:33-73` and the comments at lines 46–65.
9. **[Boundary translation (mapper)](03-thinking-in-code.md#38--mapper-pattern-boundary-translation-)** + **[Boundary translation (transferable)](05-language-agnostic.md#514--boundary-translation-mapper-pattern-)** — read `mapper.ts` to see the firewall.
10. **[Rate limiting + Retry-After](02-systems-thinking.md#28--rate-limiting--backoff-)** + **[Transferable](05-language-agnostic.md#58--rate-limiting--retry-after-)** — `notion/api.ts:9-49`. Notice 429 doesn't increment the retry counter; 5xx does.
11. **[Error classification](03-thinking-in-code.md#36--error-classification-transient-vs-permanent-)** — same file, different angle: how the API layer classifies, and how the call sites partial-fail.
12. **[Last-edit-wins with bias](02-systems-thinking.md#23--last-edit-wins-with-bias-)** + **[Transferable](05-language-agnostic.md#56--last-edit-wins-with-bias-)** — `pullSessions`, lines 151-156.
13. **[Soft delete + tombstones](02-systems-thinking.md#27--soft-delete--tombstones-)** + **[Transferable](05-language-agnostic.md#57--soft-delete--tombstones-)** — `sync_deletions` table, `processDeletions`.
14. **[Local-first IDs + late binding](03-thinking-in-code.md#39--deterministic-id-generation--late-binding-)** + **[Transferable](05-language-agnostic.md#512--local-first-ids--late-binding-)** — the two-map lookup at `sync.ts:124-127`.
15. **[Order is a spec](05-language-agnostic.md#515--order-is-a-spec-not-an-implementation-detail-)** — re-read `syncAll`. By now the ordering should *feel* like the spec, not look like a function body.

By end of Phase 2 you can explain: "how does a session created offline reach Notion, and what happens if the user edits it on Notion's side first."

---

## Phase 3 — The progression engine 🟡

The "game" — how sessions become levels.

16. **[Event log + projection](05-language-agnostic.md#53--event-log--projection-)** — the meta-pattern.
17. **[Event log + derived cache (mini event sourcing)](02-systems-thinking.md#25--event-log--derived-cache-mini-event-sourcing-)** — the contrl-specific application.
18. **[Race condition: post-sync reconstruction ordering](02-systems-thinking.md#29--race-condition-post-sync-reconstruction-ordering-)** — the bug that motivates the design.
19. **[Discriminated unions for processor dispatch](03-thinking-in-code.md#34--discriminated-unions-for-processor-dispatch-)** + **[Transferable](05-language-agnostic.md#513--discriminated-unions-for-shape-variation-)** — `pull.ts:21`, the dispatcher that knows TRX-hold returns plank-typed processors.

By end of Phase 3 you can answer: "if I reinstall the app and sync, how does my level get back?"

---

## Phase 4 — The perception pipeline 🟡

The pose detection / rep counting / hold timing layer.

20. **[Hysteresis](03-thinking-in-code.md#32--hysteresis-preventing-edge-bouncing-)** + **[Transferable](05-language-agnostic.md#55--hysteresis-)** — re-open `rep-counter.ts` and trace each transition with the 10° band in mind.
21. **[Exponential smoothing](03-thinking-in-code.md#33--exponential-smoothing-)** — read `src/lib/pose/angles.ts`. Notice smoothing belongs to the angle pipeline, not the FSM.
22. **[Deterministic perception vs. agentic perception](01-agentic-ai.md#11--deterministic-perception-vs-agentic-perception-)** — the design decision behind not using a model.
23. **[Cost vs. capability tradeoffs](04-ai-product-engineering.md#44--cost-vs-capability-tradeoffs-the-absent-llm-)** — generalised version of the same call: when to *not* use AI.

By end of Phase 4 you can explain: "why is the rep counter not an LLM, and what would change if it were."

---

## Phase 5 — The deployment shape 🟡

How the codebase is shaped to ship and evolve.

24. **[Additive migrations](02-systems-thinking.md#26--additive-migrations-)** + **[Transferable](05-language-agnostic.md#59--additive-migrations-)** — `database.ts:106-137`, the column-existence checks.
25. **[Optimistic UI / draft autosave](03-thinking-in-code.md#37--optimistic-ui--draft-autosave-)** — `drafts` table + 500ms debounce.
26. **[Schema-first, types-mirror-storage](05-language-agnostic.md#511--schema-first-types-mirror-storage-)** — generalised version of #3.

---

## Phase 6 — AI product engineering meta 🔴

How the project itself is built when AI is the collaborator.

27. **[Spec-driven development](04-ai-product-engineering.md#41--spec-driven-development-)** — read `.aipe/project/context.md` slowly. Note the "what must not change" section.
28. **[Memory bank pattern](04-ai-product-engineering.md#42--memory-bank-pattern-externalised-context-)** — observe how the project memory and the user/tool memory layer.
29. **[Context window management (by file structure)](04-ai-product-engineering.md#43--context-window-management-by-file-structure-)** — re-read `src/lib/game/` with token cost in mind.
30. **[Spec → AI-agent execution loop](04-ai-product-engineering.md#46--spec--ai-agent-execution-loop-)** — the loop you are *currently inside* by running `/aipe:curriculum`.

---

## Phase 7 — Advanced / what's missing 🔴

Where the codebase intentionally stops, and what you'd build to extend it.

31. **[Tool calling (absent)](01-agentic-ai.md#12--tool-calling-absent-)** — what an agentic feature would look like here.
32. **[ReAct loop (absent)](01-agentic-ai.md#13--react-loop-absent-)** — the structural analog in `RepCounter.update`.
33. **[Memory patterns (absent)](01-agentic-ai.md#14--memory-patterns-absent-)** — sessions-as-memory.
34. **[Orchestration (present, for sync)](01-agentic-ai.md#15--orchestration-absent-for-ai-present-for-sync-)** — generalised sense of the pattern.
35. **[Prompt chaining (absent)](01-agentic-ai.md#16--prompt-chaining-absent-)** — the per-exercise processor split as the deterministic analog.
36. **[Evaluation (mostly absent)](04-ai-product-engineering.md#45--evaluation-mostly-absent--and-what-would-change-if-added-)** — the eval set you'd build for the rep counter.

---

## Suggested next steps

If you want to deepen each thread:

- **Sync engines.** Read Martin Kleppmann's *Designing Data-Intensive Applications*, ch. 5 (replication) and ch. 9 (consistency). Then read PouchDB or Yjs source — both go further than contrl on conflict resolution.
- **Event sourcing.** Greg Young's "CQRS Documents" PDF; Fowler's "Event Sourcing" article; the LMAX Disruptor paper.
- **State machines.** David Khourshid's XState docs (especially the *statecharts* primer); Erlang/OTP's `gen_statem`. Then *re-implement* `RepCounter` as a statechart and feel the difference.
- **Local-first software.** Ink & Switch's "Local-first software" essay (the founding text for this whole space).
- **Agentic AI.** Anthropic's "Building effective agents" post; LangGraph docs (read for the orchestration patterns, not the API). Then build the form-coach agent suggested in `01-agentic-ai.md`.
- **CV / pose detection.** MediaPipe's pose-landmarker docs; the original BlazePose paper. Add a fourth exercise (e.g., dip) end-to-end as the exercise.
- **Eval engineering.** Hamel Husain's "Your AI product needs evals" blog post. Then build the rep-counter eval set proposed in §4.5.

Then come back and re-read this curriculum. The same sentences will read differently, and that gap *is* the learning.
