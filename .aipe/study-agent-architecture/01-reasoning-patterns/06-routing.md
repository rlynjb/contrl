# Routing

**Industry name(s):** Routing · Intent routing · Heuristic-first routing · Cascade routing
**Type:** Industry standard

> Pick the right handler before committing to a loop. Cheap heuristic at the front for predictable cases; LLM router at the back for ambiguous ones. Routing is the bridge from SECTION A (single-agent reasoning) to SECTION C (multi-agent orchestration) — in a single-agent system it picks a tool; in a multi-agent system the same pattern picks which *agent* handles the request.

**See also:** → [02-react.md](./02-react.md) (the loop routing wraps) · → [`.aipe/study-ai-engineering/01-llm-foundations/07-heuristic-before-llm.md`](../../study-ai-engineering/01-llm-foundations/07-heuristic-before-llm.md) (the cheaper layer) · → [03-multi-agent-orchestration/02-coordination-failure-modes.md](../03-multi-agent-orchestration/02-coordination-failure-modes.md)

---

## Why care

**Move 1.** A user makes a request. Some requests are obvious — a regex catches them, a heuristic dispatches them, done. Some are ambiguous — they need an LLM to figure out what the user means. If you route everything through the LLM, you pay for the LLM on every request, including the trivial ones. If you route everything through heuristics, you can't handle the ambiguous cases.

**Move 2.** That "who decides where the request goes" question is what routing answers. Not which handler runs. Just: how the dispatcher picks.

**Why it matters: the cheapest LLM call is the one you don't make. Routing is the discipline of asking — every request — whether the LLM is needed at all.**

**Move 5.** Routing is to agent systems what middleware is to a web server: a thin layer at the front that decides what comes next.

---

## How it works

### Move 1 — The mental model

```
                        INCOMING REQUEST
                              │
                              ▼
              ┌───────────────────────────────────┐
              │ Heuristic router (fast, free)     │
              │                                    │
              │   regex / rules / type dispatch    │
              │   covers ~80% of requests          │
              └───────────────┬───────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼ match                 ▼ no match
              direct dispatch         ┌───────────────────────┐
              (skip LLM entirely)     │ LLM router            │
                                      │ classifies intent,    │
                                      │ picks the handler     │
                                      └───────┬───────────────┘
                                              ▼
                                          dispatch
```

**Strategy in plain English:** the heuristic catches the obvious cases for free. The LLM catches the ambiguous cases for tokens. Don't make the LLM work for cases your code already knows how to handle.

### Move 2 — The two routing levels

#### Level 1 — heuristic routing (cheap)

```typescript
// pseudocode
function routeRequest(input: Input) {
  // exact-match cases
  if (input.kind === 'classified_set') return handleClassifiedSet(input);
  if (input.kind === 'manual_log')     return handleManualLog(input);

  // regex / rule cases
  if (/^(skip|pass|next)/i.test(input.text)) return handleSkip(input);

  // fall through to LLM routing
  return llmRoute(input);
}
```

Speed: microseconds. Cost: zero. Covers cases where the input shape itself determines the handler.

#### Level 2 — LLM routing (for ambiguous cases)

```
ambiguous request
       │
       ▼
┌──────────────────────────────┐
│ small fast model (Haiku-tier)│   classification call
│  prompt: "classify this      │   structured output:
│  request into one of N       │   { intent: 'coaching' |
│  intents"                    │     'logging' | 'review' }
└───────┬──────────────────────┘
        ▼
   dispatch handler
```

Speed: ~200ms. Cost: one cheap LLM call. Covers cases where intent isn't obvious from the input shape.

### Move 3 — The principle

Heuristic-first routing is the production pattern that separates an LLM from "I throw everything at the LLM." A well-designed router handles 80% of traffic without ever calling the model. The 20% that's genuinely ambiguous gets the cheap classifier. The expensive agent runs only when the cheap layers can't decide.

This is also the architectural seed for multi-agent orchestration: in a multi-agent system, the supervisor IS the router. The same heuristic-first / LLM-classifier pattern just picks an *agent* instead of a *handler*.

---

## Routing — diagram

```
┌─ The routing cascade ──────────────────────────────────────────────────────────────┐
│                                                                                    │
│   request                                                                          │
│      │                                                                             │
│      ▼                                                                             │
│   ┌───────────────────┐                                                            │
│   │ exact-match rule  │  hit?  ──► run handler directly                            │
│   └─────────┬─────────┘                                                            │
│             │ miss                                                                 │
│             ▼                                                                      │
│   ┌───────────────────┐                                                            │
│   │ regex / rule set  │  hit?  ──► run handler directly                            │
│   └─────────┬─────────┘                                                            │
│             │ miss                                                                 │
│             ▼                                                                      │
│   ┌───────────────────┐                                                            │
│   │ small LLM router  │  classify  ──►  dispatch to handler                        │
│   └─────────┬─────────┘                                                            │
│             │ classification confidence too low                                    │
│             ▼                                                                      │
│   ┌───────────────────┐                                                            │
│   │ escalate / human  │                                                            │
│   └───────────────────┘                                                            │
│                                                                                    │
│   Cost grows downward. Coverage grows downward. Hits at the top are free; hits     │
│   at the bottom are slow and expensive. Tune the rules to catch the predictable    │
│   80% so the LLM only handles the ambiguous 20%.                                  │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — light routing inside the coaching agent.**

contrl's coaching agent isn't a multi-handler system; it has one job (produce a coaching message). The routing inside it is light: the ReAct loop's tool choice IS the routing — the model picks `get_classifier_output` vs `get_form_history` vs `get_recent_coaching` based on what the previous turn revealed.

That said, there's one place a deliberate heuristic gate earns its place: **the "should I even run the agent" check before the LLM call**. If the classifier emits high-confidence clean form on a familiar exercise with no recent coaching needed, the agent doesn't need to run — a deterministic "encourage and continue" path is cheaper and more predictable. Routing logic:

```
set completes → classifier emits label
              ↓
        ┌────────────────────────────┐
        │ heuristic: should coach?   │
        │  - confidence > 0.9 AND    │
        │  - label = "clean" AND     │
        │  - no recent drift signal  │
        │  → skip the LLM            │
        │  → emit canned encouragement│
        └─────────┬──────────────────┘
                  │ otherwise
                  ▼
            run coaching agent (ReAct)
```

Planned path: `src/lib/agent/should-coach.ts` (does not exist; under design). The senior-grade move: name this heuristic explicitly in the architecture rather than burying it inside the agent's prompt. Heuristic gates that aren't named in code get lost to maintenance over time.

---

## Elaborate

**Where this pattern comes from.** Routing is older than LLMs — it's the dispatcher pattern from web servers, the middleware chain from frameworks, the type-dispatch from compilers. The LLM version adds a cheap-classifier layer between the rules and the expensive handler.

**The deeper principle.** Cost compounds at scale. A 1ms heuristic that catches 80% of traffic saves 80% of the downstream model cost. Heuristic-first is the same instinct as: don't query the database if you can answer from the cache, don't run the test suite if the file hasn't changed, don't ask the LLM if a regex would do.

**Where this breaks down.** Two cases. First, when the heuristic is wrong more often than expected — a regex matches cases it shouldn't, dispatching them to the wrong handler. Mitigation: pin a regression test for every regex. Second, when the LLM classifier itself becomes a bottleneck — too many ambiguous cases hit it, and the classifier's accuracy starts to drift. Mitigation: monitor classifier-fail rate; expand the heuristic layer to absorb the new common cases.

**What to explore next.** [`.aipe/study-ai-engineering/04-agents-and-tool-use/04-tool-routing.md`](../../study-ai-engineering/04-agents-and-tool-use/04-tool-routing.md) — the agent-internal version (which tool to call).

---

## Tradeoffs

```
┌────────────────────┬─────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Heuristic-first cascade         │ LLM-only routing                 │
├────────────────────┼─────────────────────────────────┼──────────────────────────────────┤
│ Cost on common case│ free (rules)                    │ classifier call per request      │
│ Cost on ambiguous  │ classifier call                 │ classifier call (same)           │
│ Maintenance        │ rules need pinning + tests      │ classifier prompt + eval         │
│ Latency on common  │ microseconds                    │ ~200ms                           │
│ Coverage growth    │ rules age as inputs evolve      │ retrain/re-prompt the classifier │
│ Eval surface       │ rule coverage + classifier      │ classifier alone                 │
└────────────────────┴─────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what the cascade gives up

Maintenance burden on the rules. Every regex needs a test; every rule has edge cases; rules age as the input distribution shifts. A team that doesn't invest in rule pinning ends up with bit-rotted rules that misroute traffic silently.

### Sub-block 2 — what LLM-only routing costs

Per-request inference cost. Every request — even the obvious ones — runs through a classifier. At scale that adds up. For low-volume systems (contrl: 1-2 coaching events per day), this doesn't matter. For high-volume (a chatbot at 10k requests/day), it matters a lot.

### Sub-block 3 — the breakpoint

Stick with LLM-only at low volume. Add the heuristic cascade when request volume × per-request inference cost becomes a real budget line — typically around 1000+ requests/day where every saved LLM call compounds.

### Sub-block 4 — what isn't a tradeoff

"Heuristics can't handle ambiguity." True for any specific heuristic — but the cascade pattern doesn't require it to. Heuristics handle the unambiguous cases; the LLM at the bottom of the cascade handles the rest. The pattern is heuristic-first, not heuristic-only.

---

## Tech reference (industry pairing)

### Small fast classifier model

- **Codebase uses:** not yet. If the coaching agent's "should I run" heuristic ever needs LLM-level classification, it would use Anthropic Haiku.
- **Why it's here:** the cheap classifier layer between rules and the main agent.
- **Leading today:** Haiku-tier or GPT-4o-mini — adoption-leading for routing classifiers, 2026.
- **Why it leads:** sub-200ms, cheap, strong-enough at structured intent classification.

---

## Summary

### Concept recap

Routing decides where a request goes. Cheap heuristics at the front; LLM classifier at the back. The cascade pattern catches 80% of traffic for free, then pays for LLM classification only on the ambiguous remainder. In a single-agent system the same pattern picks a tool; in a multi-agent system it picks an agent (the supervisor IS the router). contrl plans a light version: a heuristic gate that skips the coaching agent entirely on high-confidence clean sets.

### Key points

- Cheapest LLM call is the one you don't make.
- Heuristic-first; LLM-only is wasteful at scale.
- Pin tests on every rule — silent misroutes are the failure mode.
- contrl: a planned `should-coach` heuristic gate above the agent.

---

## Interview defense

### Likely questions

**[mid] What's routing in an agent system?**

Picking the right handler before committing to the agent loop. Heuristic rules at the front (regex, type dispatch) catch the predictable cases for free. An LLM classifier at the back handles the ambiguous cases. The cheap-first cascade saves cost on volume.

**[senior] Where does routing show up in contrl?**

Two places. Inside the agent, the tool-choice in ReAct is routing (model picks next tool based on observation). Above the agent, planned, a heuristic gate decides whether the agent should even run — if the classifier emits high-confidence clean form on a familiar exercise, skip the LLM and emit a canned encouragement. The heuristic gate is the cheap-first cascade pattern applied at the boundary of the agent.

**[arch] How does routing seed multi-agent orchestration?**

The supervisor in supervisor-worker IS the router. Same cascade pattern: heuristic decisions where they're predictable, LLM classification where they're not. Multi-agent isn't routing-plus-something; it's routing scaled up to picking *agents* instead of *handlers*.

### One-line anchors

- "The cheapest LLM call is the one you don't make."
- "Heuristic-first; LLM at the bottom of the cascade."
- "Routing is the seed of supervisor-worker — same pattern, different scope."

---

## Validate

**Level 1 — Reconstruct the diagram.** The routing cascade: exact rules → regex → LLM classifier → escalation.

**Level 2 — Explain in 60s.** Why heuristic-first? What does it cost not to do it?

**Level 3 — Apply.** Where in contrl's coaching pipeline would a routing gate save the most cost? Why?

**Level 4 — Defend.** A teammate says "just run the LLM on every set — it's simpler." Defend the heuristic gate at planned volume vs scale.

**Quick check.**
- What's at the front of the cascade? — Cheap heuristics (regex, type dispatch).
- What's at the bottom? — LLM classifier, then escalation.
- Does contrl plan routing? — Yes; a `should-coach` heuristic gate above the agent.
