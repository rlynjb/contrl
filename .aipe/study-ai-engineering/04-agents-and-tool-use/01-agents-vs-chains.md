# When NOT to use an agent

**Industry name(s):** Anti-agent, single-shot LLM, deterministic alternatives
**Type:** Industry standard

> Agents are expensive, slow, and stochastic. If a task can be done with a heuristic, a single LLM call, or a trained model, the agent is the wrong tool. The senior-level signal is naming where you *didn't* use an agent and why.

**See also:** → [04-tool-routing](./04-tool-routing.md) · → [02-agent-loop-and-termination](./02-agent-loop-and-termination.md)

---

## Why care

Every conference talk about agents makes them sound magical. Every production deployment finds that the magic is expensive, slow, and occasionally wrong in surprising ways. The mature engineering decision is to *not* use an agent when something simpler works. Knowing where agents lose to alternatives is more valuable than knowing how to build one.

The pattern is **deliberate scope** — name the alternatives, pick agents only when they earn their place. Same shape as "don't use Kubernetes for two containers" — tool selection by problem fit, not by hype.

---

## How it works

For every place an agent *could* go, ask three questions:

1. Can a deterministic rule handle this? If yes → use the rule.
2. Can a single-shot LLM call handle this? If yes → use the single call.
3. Can a trained model handle this? If yes → use the model.

Only if all three are "no" does an agent earn its place.

### Where contrl does NOT use an agent

| Surface | What it does | Why not an agent |
|---|---|---|
| Rep counting | Convert pose landmarks to rep count | FSM is deterministic, real-time. Agent latency would kill UX. |
| Form classification | Label per-rep failures | Trained classifier (Phase 2C) — fast, repeatable, well-defined output space. |
| Gate state machine | Track 3 consecutive cleans | Deterministic rules. No ambiguity. |
| Streak / week stats | Aggregate sessions | Pure functions. No reasoning needed. |
| Session sync | Write-mostly Supabase push with restore-on-fresh-install pull | Deterministic; no LLM judgment involved. |
| Recommend next exercise | Pick what to do today | Rule-based (B2C.14) first; learned recommender (B2C.15) later. NOT an agent. |

### Where contrl WILL use an agent (Phase 4 Path C)

| Surface | What it does | Why an agent |
|---|---|---|
| End-of-session coaching | Generate natural-language coaching | Open-ended text generation; requires picking from multiple data sources; benefit from in-context reasoning. |

The coaching surface is the only place where: (a) the output is open-ended language, (b) the input requires fetching from multiple sources, and (c) reasoning over the fetched data adds value. Everywhere else, simpler tools win.

### The principle

Agents have a high cost floor (latency + tokens + stochasticity). They earn their place only when the work they do is genuinely beyond what cheaper alternatives can deliver. "I have an LLM, what can I do with it?" is the wrong question. "What does this user need, and what's the cheapest correct way to deliver it?" is the right one.

---

## Anti-agent decision tree — diagram

```
                  task arrives
                       │
                       ▼
            ┌───────────────────────┐
            │ deterministic rule    │
            │ can solve it?         │
            └────────┬──────────────┘
                     │
              yes ───┘── no
              │           │
              │           ▼
              │  ┌───────────────────────┐
              │  │ single LLM call       │
              │  │ (no tools, no loop)   │
              │  │ can solve it?         │
              │  └────────┬──────────────┘
              │           │
              │   yes ────┘── no
              │   │            │
              │   │            ▼
              │   │  ┌───────────────────────┐
              │   │  │ trained model         │
              │   │  │ (classifier, ranker)  │
              │   │  │ can solve it?         │
              │   │  └────────┬──────────────┘
              │   │           │
              │   │    yes ───┘── no
              │   │    │           │
              ▼   ▼    ▼           ▼
            use   use   use        use agent
            rule  LLM   model      (only here)
```

---

## In this codebase

**Status:** the choice is documented but only one agent surface exists (planned).

The conscious decisions:
- Rep counting → FSM ([02-dsa/05-rep-counter-state-machine](../02-dsa/05-rep-counter-state-machine.md))
- Form classification → trained classifier ([04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md))
- Progression recommender (v1) → rules ([04-machine-learning/12-cold-start](../04-machine-learning/12-cold-start.md))
- Progression recommender (v2) → trained model ([04-machine-learning/11-recommender-framing](../04-machine-learning/11-recommender-framing.md))
- Coaching → LLM agent (Phase 4 Path C)

Notably absent: any "AI assistant" surface for navigating the app, answering questions about workouts, or generating workout plans. Those would all be agent-shaped if they existed; they don't exist because rules/models already cover them.

---

## Elaborate

### Where this pattern comes from

The "don't use a model for what a rule can do" intuition is older than LLMs. It's the same instinct as choosing the simplest data structure that works, the smallest dependency that solves the problem, the most boring tool that ships the feature. LLM agents made it tempting to use a model for *everything*; the pushback is "use the right tool".

### The deeper principle

Capability isn't the only criterion. An agent could *technically* count reps — give it the landmark stream and ask. But it would be 100× slower, 1000× more expensive, and probabilistically wrong on the long tail. The FSM is 1ms, deterministic, and free. Picking the agent there would be malpractice. The principle: the bar to use an agent is "no cheaper alternative works", not "the agent works".

### Where this breaks down

When the alternatives are genuinely insufficient. For open-ended natural-language generation grounded in fetched data, agents are the right shape — that's exactly the coaching use case. The trap is *retrofitting* an agent into a problem where deterministic alternatives would have worked.

### What to explore next

- [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) → what the agent does when it does run
- [04-tool-routing](./04-tool-routing.md) → the outer gate that keeps agent runs rare

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Use simplest tool that works     │ Always reach for the agent       │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Latency          │ Per-tool — usually <50ms         │ 500ms–5s per agent run           │
│ Cost             │ Free for rules / models          │ $0.01–0.10 per run               │
│ Reliability      │ High (deterministic)             │ Lower (stochastic)               │
│ Maintenance      │ Per-rule clarity                 │ Prompt drift over time           │
│ Capability       │ Bounded by the rule              │ Unbounded (but unpredictable)    │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

The cost is *limited capability*. Rules can't handle ambiguous cases. The fix is *not* to upgrade the rule to an agent — it's to ship the rule for the common case and write down which cases it doesn't handle.

### Sub-block 2 — what "always-agent" would cost

Every interaction in the app fires an LLM call. Latency budget blown. Cost per user climbs into the dollars per session. UX feels sluggish. Reliability drops because every interaction is now stochastic. Bug surface explodes because there's no clear "input → output" relationship to test.

### Sub-block 3 — the breakpoint

Fine until **a feature genuinely requires the kind of reasoning only an agent provides**. The coaching surface is the only one in contrl's scope that fits.

### Sub-block 4 — what isn't a tradeoff

Some "obvious agent uses" — "AI assistant for the settings screen", "chatbot to help users understand their gate progress" — were never on the roadmap because the same problems are better solved by clear UI and good documentation. Not building those agents is the right call, not a sacrifice.

---

## Tech reference (industry pairing)

### Deliberate scope discipline

- **Codebase uses:** Implicit; documented in this study guide for the first time.
- **Why it's here:** the principle that keeps contrl from sprawling into an agent-everywhere mess.
- **Leading today:** "Use the simplest tool that works" — `adoption-leading` engineering wisdom, 2026.
- **Why it leads:** every production deployment of agents converges to this principle once costs and reliability concerns surface.
- **Runner-up:** Hype-driven AI everywhere — popular in pitch decks, expensive in production.

---

## Project exercises

### [B4.6] Document where you don't use an agent

- **Exercise ID:** `[B4.6]`
- **What to build:** A "when NOT to use an agent" section in the agent-architecture spec, naming each non-agent surface in contrl, the cheaper alternative chosen, and the reasoning.
- **Why it earns its place:** the senior-level signal in interviews is articulating *what you didn't build*. This exercise produces that artifact.
- **Files to touch:** `.aipe/specs/features/agent-architecture.md` (the Phase 4 Path C spec).
- **Done when:** the spec enumerates rep counting, gate state, recommender, sync, classification — each with one paragraph on why an agent would be wrong.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Agents have a high cost floor — latency, tokens, stochasticity. They earn their place only when the work is genuinely beyond simpler alternatives: rules, single LLM calls, trained models. In contrl, the only planned agent surface is end-of-session coaching (Phase 4 Path C). Everywhere else — rep counting, form classification, gates, sync, recommenders — simpler tools are the right choice. The constraint forcing this design is cost (financial + UX); the cost paid is bounded capability in the rule/model surfaces.

### Key points

- Agents earn their place only when rules + single LLM + trained model all fail.
- The cost floor of an agent is non-trivial: ~$0.02 + ~1.5s per run.
- The senior-level signal is naming surfaces where the agent would have been wrong.
- Deliberate scope is the principle that prevents agent-everywhere sprawl.

---

## Interview defense

### Likely questions

**Q: Where do you NOT use an agent?  [mid]**
A: Rep counting (deterministic FSM), form classification (trained classifier), gate state (deterministic rules), sync (deterministic pipeline). The only planned agent surface is end-of-session coaching, because that's the only place where open-ended natural language reasoning over multi-source data earns the agent's cost.

**Q: Why not let an LLM count reps?  [senior]**
A: Cost ($0.02 × 10 reps × 5 sets × 5 sessions/week = ~$25/user/year just for counting), latency (~500ms per rep — too slow for real-time UX), and reliability (a frontier model still occasionally miscounts). An FSM is 1ms, free, deterministic. There's no axis on which the agent would be better.

**Q: Where's the line — when DO you use an agent?  [arch]**
A: When all three alternatives genuinely fail. (1) Can a deterministic rule produce this output? If yes, rule. (2) Can a single LLM call (no tools, no loop) produce it? If yes, single call. (3) Can a trained model produce it (assuming you have training data)? If yes, model. If all three are "no" — open-ended reasoning over multi-source data with no closed-form correct answer — that's when an agent is the right shape.

### One-line anchors

- The bar to use an agent is "no cheaper alternative works".
- Rules > single LLM > trained model > agent, in cost-justification order.
- Naming where you didn't use one is the senior-level signal.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the decision tree.

### Level 2 — Explain it out loud
Why isn't there an agent for the home screen? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You're asked to add a 'workout history search' feature. Agent or no?"

### Level 4 — Defend the decision you'd change
"Would you ever use an agent for rep counting?" Walk through what would have to change.

### Quick check — code reference test
- How many planned agent surfaces in contrl?
- What's the deterministic alternative to rep counting?
- What's the trained-model alternative to coaching?

Then verify.

---
