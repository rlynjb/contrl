# Cross-turn caching

**Industry name(s):** Cross-turn caching · Prefix caching · Intra-run memoization · Semantic agent cache
**Type:** Industry standard

> Single-call caching keys on one request. An agent runs many turns per task, and many tasks repeat sub-steps. Three caching layers — provider prefix caching (free, just keep the prefix stable), intra-run memoization (your code), cross-run semantic cache (vector store) — each at a different scope. **For contrl, only prefix caching applies cleanly at solo scale.**

**See also:** → single-call caching: [`.aipe/study-ai-engineering/06-production-serving/01-llm-caching.md`](../../study-ai-engineering/06-production-serving/01-llm-caching.md) · → [04-agent-infrastructure/01-context-engineering.md](../04-agent-infrastructure/01-context-engineering.md) (the prefix-stability discipline)

---

## Why care

**Move 1.** A single LLM call has one prompt; you cache by the prompt's hash. An agent runs 4-8 turns per task; many of those turns share content (system prompt, tool definitions, recent history). Many tasks share sub-steps with previous tasks. Single-call caching captures none of this — you pay full price every turn.

**Move 2.** That "where can I save tokens across turns" question is what cross-turn caching answers. Not what to cache. Just: the three scopes at which caching applies once execution is agentic.

**Why it matters: agent token bills are dominated by the prefix (system prompt + tools + history) being re-sent every turn.** Prefix caching at the provider level is the cheapest, biggest savings; the engineering cost is keeping the prefix stable.

**Move 5.** Cross-turn caching is to agents what HTTP keep-alive is to a chatty client: don't re-establish what's already established.

---

## How it works

### Move 1 — The mental model — three caching layers

```
┌─ Layer 1 — Provider prefix caching (free, just keep prefix stable) ─────────────────┐
│                                                                                      │
│   The stable part of the prompt — system + tool definitions + few-shot examples —    │
│   gets cached by the provider on the FIRST call; every subsequent call reuses it.    │
│                                                                                      │
│   Anthropic prompt caching:                                                          │
│     - declared via `cache_control: { type: 'ephemeral' }` on the message              │
│     - cache TTL ~5 minutes                                                            │
│     - cost: ~10% of normal input pricing                                              │
│                                                                                      │
│   Engineering cost: zero, IF you keep the prefix byte-identical across turns.        │
│   Engineering cost: nonzero, if you don't (one `${variable}` interpolation in the    │
│   system prompt invalidates the cache).                                              │
└──────────────────────────────────────────────────────────────────────────────────────┘


┌─ Layer 2 — Intra-run memoization (your code) ────────────────────────────────────────┐
│                                                                                      │
│   Within ONE agent run, the agent might call the same tool with the same args twice. │
│   Memoize at the tool layer; return the cached result the second time.               │
│                                                                                      │
│   Example: get_form_history(exercise='pushup', window=5) called turn 2 AND turn 6.   │
│   Memoize by (tool_name, args_hash) within the run; same result, no second call.     │
│                                                                                      │
│   Engineering cost: ~30 lines in the agent runner.                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘


┌─ Layer 3 — Cross-run semantic cache ─────────────────────────────────────────────────┐
│                                                                                      │
│   Across DIFFERENT agent runs, similar sub-queries can hit a cached result.          │
│                                                                                      │
│   Example: today's coaching event queried "what cues for pushup?"; yesterday's also  │
│   did. Embed the query, check a vector store, return cached result if close enough.  │
│                                                                                      │
│   Engineering cost: medium (vector store + embedding + freshness gating).            │
│   Earns its place at: high-volume agent systems where sub-step repetition is common. │
│                                                                                      │
│   The catch: stale cache hits poison the WHOLE TRAJECTORY, not one response. Gate    │
│   semantic cache on freshness; never cache tool calls with side effects.             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Move 2 — The prefix discipline

The cheapest, biggest agent-caching win is provider prefix caching. The discipline is: **keep the prefix byte-stable across turns of the agent's loop and across runs of the agent**.

```
Bad: system prompt contains "${user.name}"
     → every user invalidates the cache
     → cache hit rate: zero

Better: system prompt has no interpolation
        user state goes in the messages[] array, not the system prompt
     → cache hit rate: ~95% across turns of the same run
     → cache hit rate: high across runs (same system + tools every time)

Best: system prompt + tool definitions + few-shot all in the stable prefix
      with cache_control: { type: 'ephemeral' }
     → maximum prefix cached
     → cost drops ~80% on a typical agent task vs no caching
```

### Move 3 — The principle

Agent token bills are dominated by re-sending the prefix every turn. Stable prefix + provider caching gets you 80% of the savings for ~0 engineering cost. Intra-run and cross-run caching are additive; pay for them when volume justifies them.

---

## Cross-turn caching — diagram

```
┌─ Agent run, with prefix caching active ──────────────────────────────────────────────┐
│                                                                                      │
│   Turn 1:                                                                            │
│     [system + tools] (~6k tokens) ┐                                                  │
│     [user message]   (~200 toks)  │                                                  │
│     [classifier obs] (~500 toks)  │                                                  │
│                                   │                                                  │
│     ─────────► provider call: 6.7k input tokens                                      │
│                cache write on the prefix (system + tools)                             │
│                                                                                      │
│   Turn 2:                                                                            │
│     [system + tools] (~6k toks)  ┐ ← cache HIT (~10% of price)                       │
│     [user message]                                                                   │
│     [classifier obs]                                                                  │
│     [tool result 1]  (~300 toks)  │                                                  │
│                                   │                                                  │
│     ─────────► provider call: ~7k input tokens                                       │
│                billed as: 6k at 10% + 1k at 100% = ~1.6k effective                   │
│                                                                                      │
│   ...                                                                                 │
│   Net cost across 4 turns: ~6k (prefix, cached) + ~4k (per-turn delta) ≈ 10k         │
│   Without caching: 4 × 6.7k = ~27k tokens                                            │
│                                                                                      │
│   Savings: ~60-70% on a typical agent run.                                           │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — prefix caching only; the rest is solo-scale overkill.**

contrl's planned coaching agent will use Anthropic prompt caching on the system + tools prefix. The prefix is the same across every coaching event, every turn — `cache_control: { type: 'ephemeral' }` on the system message. Cache hit rate target: >80% after the first call in a 5-minute window.

**Intra-run memoization** — not built. The coaching loop is 3-4 turns typical and tool calls are deterministic; if the agent calls the same tool twice within a run (rare at this scope), the redundant call is acceptable cost. Would land if the loop grew to 10+ turns.

**Cross-run semantic cache** — not built. Solo scale (1-2 coaching events per day) doesn't justify the vector store + embedding + freshness layer. Would land if contrl had 1000+ users running coaching events daily.

Planned: stable prefix in `src/lib/agent/system.md`; `cache_control` declared in `src/lib/agent/runner.ts`.

---

## Elaborate

**Where this pattern comes from.** Provider prefix caching was introduced by Anthropic in 2024 and quickly became standard. The intra-run and cross-run patterns predate LLMs — memoization is decades old; semantic caching maps onto request-response caches in distributed systems.

**The deeper principle.** Caching at the right scope for the work shape. Single-call work caches by request. Loop work caches by prefix + intra-run sub-steps. Cross-task work caches by semantic similarity. Mixing scopes (caching a single-call result across a loop) doesn't work.

**Where this breaks down.** Stale cache hits in cross-run semantic caching. A trajectory that builds on a stale cached sub-result inherits the error at every downstream turn. Mitigation: never cache tool calls whose underlying data can change; freshness-gate everything else.

**What to explore next.** [`.aipe/study-ai-engineering/06-production-serving/01-llm-caching.md`](../../study-ai-engineering/06-production-serving/01-llm-caching.md) for the single-call layer this builds on.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ All three caching layers          │ Prefix caching only              │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Setup cost         │ medium (vector store + freshness) │ ~zero (just cache_control)       │
│ Token savings      │ 80-95% on hot paths               │ 60-70% across most workloads     │
│ Failure modes      │ stale cross-run hits              │ none beyond invalidation         │
│ Earns place at     │ high-volume systems               │ every system, from day one       │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Prefix caching: every agent from day one. Intra-run: when loops average 10+ turns and tool calls repeat. Cross-run semantic: at high volume where sub-step repetition across users is common (typically B2B chatbots, support agents, coding agents).

---

## Tech reference (industry pairing)

### Anthropic prompt caching

- **Codebase uses:** planned. `cache_control: { type: 'ephemeral' }` on the system message in `runner.ts`.
- **Why it's here:** the cheapest agent-caching win.
- **Leading today:** Anthropic prompt caching — adoption-leading for prefix caching, 2026.

### Vector store for semantic cache

- **Codebase uses:** not used. Case B.
- **Why it's here:** the cross-run cache layer when volume justifies it.

---

## Summary

### Concept recap

Three caching layers: provider prefix caching (free, every agent from day one), intra-run memoization (your code, when loops are long), cross-run semantic cache (vector store, when volume is high). The prefix discipline — keep the system + tools byte-stable — is what unlocks the biggest savings. contrl: prefix caching planned; intra-run and cross-run not needed at solo scale.

### Key points

- Stable prefix is the cheapest, biggest win.
- One `${variable}` in the system prompt invalidates the prefix cache.
- Intra-run memoization is for long loops with tool repetition.
- Cross-run semantic cache is for high-volume sub-step repetition.
- Stale semantic cache hits poison the trajectory; gate on freshness.

---

## Interview defense

### Likely questions

**[mid] What changes about caching when the unit is an agent loop?**

Three new scopes. Provider prefix caching covers the stable system + tools across all turns. Intra-run memoization handles tool calls repeated within a single run. Cross-run semantic cache covers sub-step repetition across different runs. Each is at a different scope and earns its place at a different volume.

**[senior] How does contrl plan to use caching?**

Prefix caching on the system + tool definitions, declared via `cache_control` on the system message. Target >80% cache hit rate after the first call within the 5-minute TTL. Intra-run and cross-run caching aren't built — the loop is too short (3-4 turns) and the volume too low (1-2 events/day) to justify them.

**[arch] What's the senior signal on agent caching?**

Keeping the prefix byte-stable. The biggest win is free if the system prompt has no interpolation; one `${variable}` invalidates everything. The discipline isn't a feature; it's a prompt-engineering practice that has to be maintained over time as the agent evolves.

### One-line anchors

- "Stable prefix is the cheapest, biggest win."
- "One `${variable}` in the system prompt invalidates the cache."
- "Stale semantic cache hits poison the trajectory."

---

## Validate

**Level 1 — Reconstruct the diagram.** Three caching layers and their scopes.

**Level 2 — Explain in 60s.** Why does prefix stability matter so much for agent caching?

**Level 3 — Apply.** A teammate has a system prompt with `${user.name}` and asks why the cache hit rate is zero. Walk through the fix.

**Level 4 — Defend.** Defend the choice to skip cross-run semantic caching for contrl. What changes if contrl scales to 10k users?

**Quick check.**
- What's Anthropic's prefix cache TTL? — ~5 minutes.
- What's the cache price relative to normal input? — ~10%.
- Does contrl plan all three layers? — No; prefix only at planned scope.
