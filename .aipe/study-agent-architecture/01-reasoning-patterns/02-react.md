# ReAct — placement in the family

**Industry name(s):** ReAct · Reason-Act-Observe loop · tool-using agent
**Type:** Industry standard · Language-agnostic

> ReAct interleaves reasoning (the model thinks about what to do next) with action (the model calls a tool) and observation (the model reads the result). This file places ReAct in the reasoning-pattern family — it's the default baseline you start with and escalate past only when a specific failure shows up. Mechanics live in `study-ai-engineering`; this file is about placement and the escalation gate.

**See also:** → mechanics: [`.aipe/study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md`](../../study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md) · → [01-chains-vs-agents.md](./01-chains-vs-agents.md) · → [03-plan-and-execute.md](./03-plan-and-execute.md) · → [04-reflexion-self-critique.md](./04-reflexion-self-critique.md)

---

## Why care

**Move 1.** Your team needs an agent. The first decision is which pattern. The frameworks all advertise plan-and-execute, reflexion, tree-of-thoughts, multi-agent. The papers are full of impressive benchmarks. The temptation is to pick something sophisticated.

**Move 2.** That "which pattern do I start with" question is what this file answers. Not how ReAct works (mechanics live in study-ai-engineering). Just: when you're choosing a pattern, why does the answer almost always start with ReAct?

**Why answering that question at all:** **Production agent quality is determined more by your eval discipline than by which reasoning pattern you pick.** ReAct + a good eval set + a tight tool registry beats plan-and-execute + no eval, every time. The escalation past ReAct happens when the eval shows a specific failure ReAct can't address — not when a blog post recommends something flashier.

**Move 5.** ReAct is to agent patterns what `useState` is to React state management. You start there. You escalate only when you can name what's wrong.

---

## How it works

### Move 1 — The mental model

The model emits a `tool_use` block; your code runs the tool and feeds back a `tool_result`; the model decides whether to call again or stop.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ReAct loop                                    │
│                                                                     │
│       ┌──────────────────────────────────────────┐                  │
│       │ User message: "user just finished a set,│                  │
│       │  coach them"                             │                  │
│       └────────────────────┬─────────────────────┘                  │
│                            ▼                                        │
│       ┌──────────────────────────────────────────┐                  │
│       │ Model: "I should check the classifier   │   ◄── Reason     │
│       │  output for this set"                    │                  │
│       │ tool_use: get_classifier_output(set_id) │   ◄── Act        │
│       └────────────────────┬─────────────────────┘                  │
│                            ▼                                        │
│       ┌──────────────────────────────────────────┐                  │
│       │ Your code runs the tool, returns:        │                  │
│       │ { label: "form-drift", confidence: 0.8} │   ◄── Observe    │
│       └────────────────────┬─────────────────────┘                  │
│                            ▼                                        │
│       ┌──────────────────────────────────────────┐                  │
│       │ Model: "I need recent coaching to avoid │                  │
│       │  repeating myself"                       │                  │
│       │ tool_use: get_recent_coaching(window=5) │                  │
│       └────────────────────┬─────────────────────┘                  │
│                            ▼                                        │
│             ...loop until stop_reason: 'end_turn'                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** start with ReAct. Build the tool registry. Build the eval set. Measure success rate, tool-call accuracy, latency, cost. If the eval reveals a specific failure ReAct can't address, escalate to a pattern that addresses *that* failure — not because the pattern is fashionable.

### Move 2 — Where ReAct sits in the family

```
┌─ The reasoning-pattern family — start at the top, escalate when measured ──────────────────┐
│                                                                                            │
│                              ┌─ Chain ─────────────────────────────────┐                   │
│                              │ engineer writes the steps               │                   │
│                              └──────────────────┬──────────────────────┘                   │
│                                                 │ task needs autonomous decisions          │
│                                                 ▼                                          │
│                              ┌─ ReAct  (DEFAULT) ──────────────────────┐                   │
│                              │ model decides next tool at runtime      │                   │
│                              └──────┬───────────────────────────────┬──┘                   │
│                                     │                               │                      │
│      task has a structured plan     │       outputs need a critic   │                      │
│      worth committing up front      ▼       pass for reliability    │                      │
│                              ┌─ Plan-and-execute ──────┐            │                      │
│                              │ planner + cheap executor│            │                      │
│                              └─────────────────────────┘            │                      │
│                                                                     ▼                      │
│                                                            ┌─ Reflexion / self-critique ┐ │
│                                                            │ produce → critique → revise│ │
│                                                            └────────────────────────────┘ │
│                                                                                            │
│                              the search space is wide                                      │
│                              and candidates are scorable                                   │
│                                     │                                                       │
│                                     ▼                                                       │
│                              ┌─ Tree of Thoughts ──────────────────────┐                   │
│                              │ branch, score, prune (rarely worth it)  │                   │
│                              └─────────────────────────────────────────┘                   │
│                                                                                            │
│                              the failure isn't single-agent fixable                        │
│                              (specialties, parallelism, debate)                            │
│                                     │                                                       │
│                                     ▼                                                       │
│                              ┌─ Multi-agent topology (SECTION C) ──────┐                   │
│                              │ supervisor-worker, pipeline, etc.       │                   │
│                              └─────────────────────────────────────────┘                   │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Every escalation has a cost. Plan-and-execute adds the planner round-trip. Reflexion adds 2-5× tokens for the critic pass. Tree of Thoughts adds the branch factor. Multi-agent adds 2-5× coordination overhead. Pay only when the eval shows the cheaper pattern is the binding constraint.

### Move 3 — The principle

The senior-grade answer to "which pattern?" is "I built a ReAct baseline, measured on these four metrics, and only escalated when the eval showed a specific failure ReAct couldn't address." The weak answer is "I picked plan-and-execute because the blog post said it works better." Pick by measurement, not by fashion.

---

## ReAct — diagram

```
       ┌─────────────────────────────────────────────────────────────┐
       │              The ReAct loop                                  │
       │                                                              │
       │     turn 1:  Reason  → "I need the classifier output"        │
       │              Act     → tool_use: get_classifier_output       │
       │              Observe → { label: "form-drift", confidence }   │
       │              (capped iteration counter: 1/8)                 │
       │                                                              │
       │     turn 2:  Reason  → "I need the form history for context" │
       │              Act     → tool_use: get_form_history            │
       │              Observe → [recent sessions...]                  │
       │              (capped iteration counter: 2/8)                 │
       │                                                              │
       │     turn 3:  Reason  → "ready to coach — emit message"       │
       │              Act     → tool_use: emit_coaching_message       │
       │              stop_reason: 'end_turn'                         │
       │                                                              │
       └─────────────────────────────────────────────────────────────┘

       ┌─ The control envelope around every ReAct loop ──────────────┐
       │                                                              │
       │   iteration cap        max 8 turns; halt and degrade if hit  │
       │   token budget         per-run ceiling; halt at ceiling      │
       │   tool allowlist       only read-only tools (5 in contrl)    │
       │   output guardrail     schema check on final message         │
       │                                                              │
       └─────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — the coaching agent is a ReAct loop.**

The Phase 4 Path C agent is the canonical ReAct shape for contrl. One model (Anthropic Sonnet 4), five read-only tools, the loop runs until the model emits a final `emit_coaching_message` tool call or hits the iteration cap (planned: 8 turns). Expected average per coaching event: 2-4 turns.

Why ReAct first (and not plan-and-execute, reflexion, or anything else):

- The task is small enough that a planner round-trip costs more than it saves. Coaching one set has a small action space — at most a few tool calls. Planning is overkill.
- The outputs aren't high-stakes enough to warrant a critic pass. A wrong coaching message is annoying, not destructive. The 2-5× token cost of reflexion is not paid back.
- Tree of Thoughts has no scoring function for a coaching message — there's no objective truth to score branches against.
- Multi-agent: contrl has one job (produce a coaching message), not many specialties.

Planned in `src/lib/agent/runner.ts` (does not exist yet). The mechanics — how `tool_use` and `tool_result` interleave — live in [`.aipe/study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md`](../../study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md).

---

## Elaborate

**Where this pattern comes from.** Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (2022). The paper showed that interleaving reasoning with action outperformed either alone on multi-step tasks. By 2024 it had become the default agent pattern; every agent framework supports it as the baseline.

**The deeper principle.** Reasoning without action is theorizing; action without reasoning is brute force. The interleaving — think a step, take it, observe the result, think again — is the loop human engineers run when debugging or doing research. ReAct works because it mirrors that structure rather than fighting it.

**Where this breaks down.** Two genuine failures. First, tasks where reasoning between actions actively misleads the model — repetitive, mechanical tasks (e.g., apply this transformation 50 times) where the model's "let me think about this" turns into "let me re-derive the transformation differently each time." For these, a chain with the transformation hard-coded is better. Second, tasks where the right plan needs to commit before the first action (because re-planning is expensive) — plan-and-execute exists for these.

**What to explore next.**
- [03-plan-and-execute.md](./03-plan-and-execute.md) — when to commit to a plan up front
- [04-reflexion-self-critique.md](./04-reflexion-self-critique.md) — adding a critic pass on top of ReAct
- [`.aipe/study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md`](../../study-ai-engineering/04-agents-and-tool-use/03-react-pattern.md) — the mechanics

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ ReAct                              │ Skip-ReAct alternatives          │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Turns per task     │ 1-8 typical                        │ plan: 1 plan + N exec; T-o-T: BF│
│ Eval surface       │ trajectory + tool-call accuracy   │ same + extra (plan quality, etc)│
│ Cost               │ baseline                           │ 1.5-5× depending on pattern     │
│ Complexity         │ one loop                          │ planner + executor / critic / BF │
│ Failure modes you  │ wrong tool, infinite loop,        │ plan mismatches reality,         │
│ inherit            │ no halt                           │ critic shares blind spots, etc. │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what ReAct gives up

Plan commitment. ReAct can re-decide the strategy on every turn, which is good for exploratory tasks and bad for tasks where the right plan is "do A, then B, then C in order" — the model might second-guess the plan partway through, switch strategies, and waste turns. The cost is variable trajectory length; the benefit is the model adapts to what each observation reveals.

### Sub-block 2 — what escalating past ReAct costs

Plan-and-execute costs the planner round-trip (one expensive model call up front) plus brittleness when the plan's assumptions break mid-execution. Reflexion costs 2-5× tokens for the critic pass. Tree of Thoughts costs the branch factor in tokens and rarely outperforms a well-prompted ReAct loop. Multi-agent costs 2-5× coordination overhead. None of these are free; the eval has to justify each.

### Sub-block 3 — the breakpoint

Stay on ReAct until a specific eval-measured failure forces escalation. The most common forcing functions: (a) plan-mismatch failures where the model fails to commit to an early decision and wastes turns re-deriving it → plan-and-execute; (b) output-quality failures on high-stakes content where a single pass isn't reliable → reflexion; (c) specialties that don't share the same context → multi-agent (rare; usually a misdiagnosis).

For contrl's coaching agent, none of these forcing functions apply at the planned scope. ReAct is the right call until evidence says otherwise.

### Sub-block 4 — what isn't actually a tradeoff

"ReAct is too simple for production." This phrasing comes up when teams reach for sophistication for its own sake. ReAct ships in production at scale across thousands of systems; it's the baseline because it works. The complexity argument is usually a sign that the eval discipline is weak and the team is hoping a fancier pattern will fix it. It won't.

---

## Tech reference (industry pairing)

### Anthropic Messages API (`tool_use` / `tool_result` loop)

- **Codebase uses:** planned for `src/lib/agent/runner.ts`. The runner will alternate `tool_use` (model's call) and `tool_result` (your code's reply) until `stop_reason: 'end_turn'`.
- **Why it's here:** the API surface that makes ReAct mechanical. Typed schema, deterministic stop conditions, prompt-caching primitives for the stable prefix.
- **Leading today:** Anthropic Messages — adoption-leading for typed tool use, 2026.
- **Why it leads:** explicit schema means no JSON-from-text parsing; stop conditions are reliable; cache-friendly prefix.
- **Runner-up:** OpenAI Chat Completions with `tools` — comparable; choice often comes down to model fit on the task's eval.

### Hand-rolled `while` loop vs framework

- **Codebase uses:** plain TypeScript `while` loop in `runner.ts` is the planned shape. No framework.
- **Why it's here:** for one agent with five tools and a fixed loop structure, a 30-line `while` is more readable than a framework abstraction.
- **Leading today:** plain code — adoption-leading at small agent counts.
- **Why it leads:** zero dependency cost, the loop is right there in the codebase, every behavior is visible.
- **Runner-up:** LangGraph for graph orchestration — earns its place when the loop grows to multi-agent or needs human-in-the-loop pauses; not needed for contrl's planned scope.

---

## Summary

### Concept recap

ReAct is the default agent reasoning pattern: Reason → Act → Observe → loop. It's the baseline you start with and escalate past only when the eval shows a specific failure it can't address. contrl's planned coaching agent is a ReAct loop with five read-only tools — the task is small enough that no escalation pattern (plan-execute, reflexion, ToT, multi-agent) earns its overhead. The senior-grade answer to "which pattern?" is "I built a ReAct baseline, measured, and only escalated when specific evidence justified the cost."

### Key points

- ReAct is the default. Escalation past it has measurable cost; pay only when the eval shows the cheaper pattern is the binding constraint.
- The contrl coaching agent is a ReAct loop. No planner, no critic, no branching, no multi-agent.
- The control envelope around every ReAct loop: iteration cap, token budget, tool allowlist, output guardrail.
- "Plan-and-execute is more sophisticated" isn't an argument; it's a recommendation that depends on a specific failure mode.
- Mechanics live in `study-ai-engineering`'s `03-react-pattern.md`. This file is about placement and escalation.

---

## Interview defense

### Likely questions

**[mid] Why ReAct and not [framework or paper they've heard of]?**

ReAct is the default for the same reason `useState` is the default for component state — it works for the 80% case and you escalate only when something doesn't. The cost of escalating prematurely (plan-execute's planner round-trip, reflexion's 2-5× tokens, multi-agent's coordination overhead) is real. The eval discipline is what tells me whether the escalation pays back. For contrl's coaching agent at planned scope, none of the escalation patterns are justified by an eval failure.

```
ReAct                       Patterns above it (when justified)
─────                       ──────────────────────────────────
default loop                added overhead (planner, critic, BF, coordination)
one model, N tools          model + extras
trajectory eval             trajectory + plan eval / critic eval / branch eval
```

**[senior] What would make you escalate past ReAct on the coaching agent?**

Three forcing functions, all eval-driven. First, if I see the model second-guessing tool order mid-trajectory — calling `get_form_history`, then `get_classifier_output`, then back to `get_form_history` for the same set — that's a planner-deficit signal, and I'd consider plan-and-execute. Second, if coaching messages fail a quality bar (eval set shows them missing the right cue 15% of the time and the failures are reasoning-shaped, not retrieval-shaped), I'd add a reflexion pass. Third, if the coaching task split into separate specialties (form-coaching, progression-coaching, deload-coaching, each needing different context), that's a supervisor-worker signal — but I'd only go there if a single-agent prompt couldn't switch modes cleanly.

None of these are visible yet because the agent isn't built. Escalation decisions wait for the data.

### One-line anchors

- "ReAct is to agent patterns what useState is to component state."
- "Escalation costs real tokens and complexity. Pay when the eval justifies it."
- "The senior-grade answer is 'I built a ReAct baseline, measured, and escalated based on evidence.'"

---

## Validate

**Level 1 — Reconstruct the diagram.** Draw the ReAct loop and label each step. Show the control envelope (iteration cap, token budget, tool allowlist, output guardrail).

**Level 2 — Explain in 60 seconds.** Why ReAct first? What would make you escalate?

**Level 3 — Apply.** A teammate proposes adding plan-and-execute to the coaching agent "for sophistication." What's the question you ask back?

**Level 4 — Defend.** The CTO has read a blog post about multi-agent debate and wants you to add a critic agent. Walk through the eval question that decides whether it earns its place.

**Quick check.**
- What's the default agent pattern? — ReAct.
- What's the test for escalating past it? — A specific eval-measured failure ReAct can't address.
- How many turns is contrl's coaching agent capped at? — 8 turns.
