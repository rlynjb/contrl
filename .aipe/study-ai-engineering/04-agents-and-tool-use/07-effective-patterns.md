# Building effective agents (patterns)

**Industry name(s):** Anthropic's effective-agents patterns, chained / routed / parallel / orchestrator-worker / evaluator-optimizer
**Type:** Industry standard

> Anthropic's "Building Effective Agents" post (2024) names five composition patterns: prompt chaining, routing, parallelization, orchestrator-workers, and evaluator-optimizer. The right pattern for contrl's coaching agent is *routing* with a heuristic gate plus a small set of focused tools.

**See also:** → [04-tool-routing](./04-tool-routing.md) · → [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) · → [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)

---

## Why care

Most "agents" people build are over-engineered versions of simpler patterns. Anthropic's post (Schluntz & Zhang, 2024) named the five real shapes and made the case for picking the simplest one that fits. Reading the post and mapping its patterns to your design is a 60-minute exercise that prevents months of rework.

The patterns are universal — they describe LLM composition strategies, not Anthropic-specific tricks. The hard part is honest self-assessment: which pattern does my agent *actually* need, not which one sounds most impressive?

---

## How it works

Five patterns, briefly. For each, name the shape and the use case.

### Pattern 1 — Prompt chaining

A → B → C, deterministic pipeline.

```
input ──► step A (LLM) ──► step B (LLM) ──► step C (LLM) ──► output
```

Each step's output is the next step's input. Each LLM call has a focused, single prompt. Loopd's 5 chains are this pattern.

### Pattern 2 — Routing

A heuristic or LLM classifier routes the input to one of several specialized handlers.

```
input ──► classifier ──► handler A
                     ──► handler B
                     ──► handler C
```

contrl's coaching agent is this pattern: heuristic gate decides "should coach?", then the LLM-driven agent loop handles the "coach" branch.

### Pattern 3 — Parallelization

Same input, multiple LLM calls in parallel, then aggregate.

```
input ──► call A ─┐
       ──► call B ─├──► aggregator ──► output
       ──► call C ─┘
```

Useful when independent perspectives matter (sectioning + voting + n-best). Not used in contrl's coaching agent.

### Pattern 4 — Orchestrator-workers

A central orchestrator LLM dispatches sub-tasks to worker LLMs.

```
orchestrator ──► worker A
            ──► worker B
            ──► worker C  (decided at runtime by orchestrator)
```

The agent loop with tools is *like* this but flatter — the orchestrator dispatches to *tools*, not LLM workers. True orchestrator-workers escalate to actual LLM-on-LLM calls.

### Pattern 5 — Evaluator-optimizer

One LLM generates output, another evaluates and provides feedback, the first revises.

```
LLM-1: generate ──► LLM-2: evaluate ──► LLM-1: revise ──► ...
```

Useful for iterative refinement (e.g., code generation with self-review). Could apply to coaching ("draft coaching → evaluate quality → revise") but adds cost; not in scope for Phase 4 Path C.

### Move 2.5 — Which pattern fits contrl

The coaching agent maps cleanly to **routing**:
- Outer routing decision (heuristic) — `shouldCoach()`.
- Single specialized handler (the agent loop with tools).
- No parallel paths, no orchestrator-worker hierarchy, no evaluator step.

A more ambitious version could add evaluator-optimizer to score the coaching output for tone consistency. Worth noting in design docs; not Phase 4 Path C.

### Move 3 — The principle

Agent design starts with the simplest pattern that works. Anthropic's post is valuable precisely because it gives you the menu and the order of preference — try chaining first, routing if needed, parallelization only if independent perspectives genuinely help, orchestrator-workers only for genuinely complex multi-domain tasks, evaluator-optimizer only when iteration quality is the bottleneck.

The full picture is below.

---

## Effective agent patterns — diagram

```
   simplest          ┌─ Prompt chaining ────────────────────────┐
        │           │  A → B → C (each LLM call narrow)         │
        │           │  e.g. 5 single-purpose chains             │
        │           └───────────────────────────────────────────┘
        │
        │           ┌─ Routing ────────────────────────────────┐
        │           │  classifier → handler                     │
        │           │  contrl coaching agent (planned)       │
        │           └───────────────────────────────────────────┘
        │
        │           ┌─ Parallelization ─────────────────────────┐
        │           │  multiple LLM calls on same input         │
        │           │  aggregator combines                      │
        │           └───────────────────────────────────────────┘
        │
        │           ┌─ Orchestrator-workers ────────────────────┐
        │           │  parent LLM dispatches to child LLMs      │
        │           │  used for genuinely complex tasks         │
        │           └───────────────────────────────────────────┘
        │
        ▼           ┌─ Evaluator-optimizer ────────────────────┐
   complex          │  LLM-1 generates → LLM-2 evaluates       │
                    │  LLM-1 revises (loop until acceptable)   │
                    └───────────────────────────────────────────┘

   Pick the simplest pattern that fits. Combine patterns only when each adds value.
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C is the planned build, mapping to the routing pattern.

The mapping:
- Outer routing → heuristic gate (B4C.4)
- Specialized handler → agent loop with tools (B4C.1, B4C.2)

A formal mapping doc is the deliverable for curriculum item B4.8 ("read and annotate Anthropic's post — map each pattern to your build").

---

## Elaborate

### Where this pattern comes from

Anthropic's "Building Effective Agents" post (Schluntz & Zhang, December 2024) crystallized patterns that had been emerging across production LLM apps for ~18 months. The five-pattern taxonomy isn't novel — it's a useful naming of what experienced teams already did. The post's main contribution is the *order of preference*: simpler first.

### The deeper principle

Composition patterns are a hierarchy of complexity. Skipping levels (jumping to orchestrator-workers when chaining would work) introduces failure modes you don't need to handle. Climbing the hierarchy only when forced keeps the agent debuggable. This is the same instinct as "don't introduce abstractions until you have three concrete examples" applied to LLM composition.

### Where this breaks down

When the task genuinely needs a complex pattern but the team uses a simple one to avoid the lift. Coaching could *technically* be done with prompt chaining (no tools, just sequential single-purpose calls), but it would require pre-loading all data eagerly and would feel less responsive. Routing earns its complexity by keeping prompts focused.

### What to explore next

- [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) → the inner loop of the routing pattern
- [04-tool-routing](./04-tool-routing.md) → the outer routing decision
- [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md) → the simpler-than-any-pattern alternative

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Routing (planned)                │ Orchestrator-workers (over-eng)  │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ LLM calls per run  │ 1 outer + N inner                │ N parent + N children            │
│ Complexity         │ One classifier + one handler     │ Multi-LLM hierarchy              │
│ Cost               │ ~$0.01–0.05                      │ ~$0.05–0.30                      │
│ Latency            │ ~1.5s                            │ ~3–8s                            │
│ Debuggability      │ Linear trace                     │ Tree trace                       │
│ Capability         │ Bounded by handler               │ Higher (multi-domain)            │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Routing handles a fixed handler. If we wanted *different kinds* of coaching (e.g., a totally different tone for "celebrate this milestone" vs. "fix this form issue"), we'd need either multiple specialized handlers (routing → A or B) or a single handler that branches inside. The former is cleaner; the latter is what we'll start with for v1.

### Sub-block 2 — what orchestrator-workers would cost

For coaching's scope (single domain, single output type), an orchestrator-worker pattern would mean an outer LLM that dispatches to specialized inner LLMs ("history-finder", "cue-picker", "response-writer"). Each LLM call adds latency and cost. The marginal gain in quality wouldn't justify the 3× cost increase. Worth revisiting only if v1 routing produces poor outputs.

### Sub-block 3 — the breakpoint

Fine until coaching needs *cross-domain* reasoning (nutrition + sleep + form + progression). At that point each domain wants its own specialist; orchestrator-workers becomes the right shape. We're nowhere near that scope.

### Sub-block 4 — what isn't a tradeoff

Picking a simpler pattern (prompt chaining) wasn't a real option because chaining can't decide *which* data to fetch — it just runs a fixed sequence of calls. Coaching needs decisions, hence the LLM-driven inner dispatch, hence routing.

---

## Tech reference (industry pairing)

### Anthropic Building Effective Agents post

- **Codebase uses:** Reference document; pattern selection documented in Phase 4 Path C spec.
- **Why it's here:** the cleanest published framework for LLM-app composition.
- **Leading today:** Anthropic / OpenAI cookbook patterns — `adoption-leading`, 2026.
- **Why it leads:** vendor-published, battle-tested at production scale, framework-agnostic.
- **Runner-up:** LangChain Agent recipes — `innovation-leading` for library-integrated patterns; same shape with more abstraction overhead.

---

## Project exercises

### [B4.8] Map Anthropic's patterns to your agent

- **Exercise ID:** `[B4.8]`
- **What to build:** A short doc (1–2 pages) mapping each of the five Anthropic patterns to either: (a) where it's used in contrl (routing for coaching), (b) where it's *not* used and why, or (c) where it might apply in a future version. References to file paths or planned files.
- **Why it earns its place:** the exercise that produces a defensible answer to "which pattern is this?" — the question every interview about agents will ask.
- **Files to touch:** `.aipe/specs/features/agent-architecture.md` (the Path C spec; add a section).
- **Done when:** the spec has a "Patterns from Anthropic's post" section with one paragraph per pattern.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Anthropic's post names five LLM composition patterns: chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer. contrl's planned coaching agent maps to *routing* — heuristic gate decides "should coach?", a single specialized handler does the coaching. The constraint forcing this choice was the scope (single domain, well-defined output). The cost paid is that more diverse coaching styles would require additional handlers later.

### Key points

- Five patterns, ordered by complexity.
- Pick the simplest pattern that fits; climb the hierarchy only when forced.
- contrl coaching = routing pattern.
- The post's value is the order of preference, not the names themselves.

---

## Interview defense

### Likely questions

**Q: What pattern is your agent?  [mid]**
A: Routing, from Anthropic's "Building Effective Agents" post. A heuristic outer classifier decides if coaching is needed (`shouldCoach`); a specialized handler — the agent loop with tools — generates the coaching when triggered. No parallel paths, no orchestrator-workers, no evaluator-optimizer.

**Q: Why routing instead of orchestrator-workers?  [senior]**
A: Scope. Coaching is a single domain (movement form + progression). Orchestrator-workers earns its complexity when sub-tasks span multiple domains needing specialist LLMs. For a single-domain task it'd just be added cost without added quality. The decision is documented in `agent-architecture.md`.

**Q: When would you upgrade to evaluator-optimizer?  [arch]**
A: If coaching quality from the routing pattern's single-pass output is inconsistent — e.g., tone drifting between sessions, contradictory advice — adding an evaluator LLM to score the draft against criteria (tone, specificity, novelty) and iterate would help. Cost roughly 2× (one extra LLM call per coaching event); worth it only if v1 quality is genuinely below bar.

### One-line anchors

- Five patterns, pick the simplest that fits.
- Coaching = routing.
- Climb the hierarchy only when forced.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the five patterns.

### Level 2 — Explain it out loud
Why routing for coaching? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a 'progress narrative' feature that summarizes the last 4 weeks. Which pattern?"

### Level 4 — Defend the decision you'd change
"Would you ever switch to evaluator-optimizer?" When?

### Quick check — code reference test
- How many patterns?
- Which one is contrl using?
- What's the curriculum exercise number?

Then verify.

---
