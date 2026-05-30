# When NOT to go multi-agent

**Industry name(s):** The multi-agent boundary · Multi-agent escalation gate · Single-agent first principle
**Type:** Industry standard

> The most important multi-agent decision is whether to be multi-agent at all. Multi-agent systems add roughly 2-5× coordination overhead and a much larger debugging surface; the quality gain is often modest unless the problem genuinely splits into specialties. This file teaches the gate: build a single-agent baseline, measure, escalate only when a specific failure can't be fixed inside single-agent. **For contrl, this is required reading even though it'll be single-agent forever.**

**See also:** → [02-coordination-failure-modes.md](./02-coordination-failure-modes.md) · → [01-reasoning-patterns/02-react.md](../01-reasoning-patterns/02-react.md)

---

## Why care

**Move 1.** A blog post, a paper, or a senior teammate suggests multi-agent. The intuition is appealing: split the task into specialists, run them in parallel, get better results. The pitch is "single agents can't do X; multi-agent can." Most of the time the pitch is wrong — single agents *can* do X if you've prompted them correctly and given them the right tools.

**Move 2.** That "should I go multi-agent" question is what this file answers — almost always with "no, fix single-agent first." Not how to coordinate agents. Just: when does the 2-5× overhead pay back.

**Why it matters: multi-agent is the most common over-engineering pattern in 2026 agent design.** Teams reach for it before single-agent has hit its ceiling. They end up with 2-5× the cost, 5× the debugging surface, and the same quality bar single-agent would have reached.

**Move 5.** Multi-agent is to single-agent what microservices is to a monolith. Sometimes right. Usually premature. Always more expensive than you expected.

---

## How it works

### Move 1 — The mental model

The escalation gate:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   1. Build a single-agent (ReAct) baseline                           │
│        │                                                             │
│        ▼                                                             │
│   2. Measure: success rate, tool-call accuracy, latency, cost        │
│        │                                                             │
│        ▼                                                             │
│   3. Identify the SPECIFIC failure single-agent cannot fix           │
│        │                                                             │
│   ┌────┴────────────────────────────────────────────────────────┐    │
│   │  4. Is that failure genuinely decomposable into independent │    │
│   │     specialties?                                            │    │
│   │       │                                                     │    │
│   │       ├─ NO  → stay single-agent. fix the prompt / tools /  │    │
│   │       │        retrieval. the gain you're imagining isn't   │    │
│   │       │        decomposable; multi-agent won't unlock it.   │    │
│   │       │                                                     │    │
│   │       └─ YES → escalate to the SPECIFIC topology that       │    │
│   │                addresses it. supervisor-worker is the       │    │
│   │                default; pick a different topology only      │    │
│   │                with a clear reason.                         │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** start single-agent. Measure. Escalate only when a specific failure can't be addressed in single-agent and the failure splits cleanly into specialties.

### Move 2 — What multi-agent costs

```
COST: ~2-5× COORDINATION OVERHEAD
─────────────────────────────────
- supervisor's tokens: classify, decompose, synthesize (every task)
- worker calls: N agents × token cost
- inter-agent message passing or shared-state context bloat
- typical: 2-5× single-agent token cost for the same task


COST: 5× DEBUGGING SURFACE
──────────────────────────
- you now debug the conversation BETWEEN agents, not one agent's loop
- coordination failures (handoff loops, synthesis mismatch) don't
  exist in single-agent
- traces are deeper; the question "why did this fail" splits across
  N agents


COST: EMERGENT FAILURE MODES
────────────────────────────
- handoff loops (A→B→A→B forever)
- supervisors that re-decompose mid-task and lose state
- synthesis of contradictory worker outputs
- cost blowup that's not visible until you check the bill
```

### Move 3 — When it pays back

Three conditions, all required:

```
1. Single-agent has hit a measured quality ceiling
   - eval set shows a specific failure mode
   - the failure isn't a prompt fix, a tool fix, or a retrieval fix
   - you've tried all three

2. The failure decomposes into independent specialties
   - "specialty A needs context X; specialty B needs context Y"
   - X and Y don't overlap meaningfully
   - the agents can do their work without coordination beyond the
     supervisor's routing/synthesis

3. The 2-5× overhead is justified by the quality gain
   - measure the gain on the eval; calculate cost vs benefit
   - if the gain is 10% and the cost is 3×, the math is bad unless
     the 10% is on a high-stakes failure
```

If any condition is missing, stay single-agent. The fourth condition is sometimes implicit but worth naming: **the team has eval discipline strong enough to measure multi-agent quality.** Without it, you can't tell whether the topology helped.

---

## The multi-agent boundary — diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   STAY SINGLE-AGENT IF:                                                      │
│     - eval baseline hasn't been built yet                                    │
│     - single-agent failure modes are prompt / tool / retrieval fixable       │
│     - failure doesn't split into independent specialties                     │
│     - team can't measure whether multi-agent helped                          │
│                                                                              │
│   ESCALATE TO MULTI-AGENT IF ALL OF:                                         │
│     - single-agent baseline hit a measured ceiling                           │
│     - failure decomposes into specialties                                    │
│     - 2-5× overhead is justified by quality gain                             │
│     - eval can measure the gain                                              │
│                                                                              │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                              │
│   PICK THE SPECIFIC TOPOLOGY:                                                │
│     specialties + central coordinator → supervisor-worker (default)          │
│     fixed serial order → sequential pipeline                                 │
│     independent parallel subtasks → fan-out / fan-in                         │
│     adversarial quality check → debate or verifier-critic                    │
│     dynamic peer transfer → swarm / handoff                                  │
│     inspectable + human-in-loop → graph orchestration                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B (deliberately stays single-agent forever) — the coaching agent.**

contrl's planned coaching agent is single-agent by design. The task is one job (produce a coaching message); the action space is bounded (5 read-only tools); the data is structured (SQLite + ONNX output); and "specialties" don't naturally split here. The reasoning the agent does — figure out which tools to call based on the classifier — is fundamentally one specialty. There's no "form-coaching agent + progression-coaching agent + deload-coaching agent" because all three share the same context (recent sessions, current state, last coaching message) and the same data tools.

What single-agent will reach its ceiling on (if it does): outputs that lose context across a long history of past coaching messages. The fix isn't multi-agent — it's better context engineering (SECTION D) and possibly an episodic memory layer. Both are single-agent moves.

What would force multi-agent: a feature that genuinely needs parallel specialties — for example, "review the user's past week and propose a new program" where you need (a) trend analysis on past sessions, (b) physiology / programming knowledge, (c) injury-history-aware advice. *Maybe* a multi-agent split there. But that's not contrl's current scope.

---

## Elaborate

**Where this pattern comes from.** The "start small, escalate by measurement" pattern is the same one that governs every architectural decision in production engineering. Monolith vs microservices. Single-database vs sharded. The multi-agent debate inherited it almost word-for-word from the microservices debate of the 2010s, with the same failure mode: teams reach for the more complex pattern before the simpler one has hit its limit.

**The deeper principle.** Complexity should be earned. Adding architectural complexity (multi-agent, microservices, sharding) without evidence that it's the binding constraint is the most common production engineering mistake. The senior-grade move is the empirical one: measure single-agent on the actual task, identify the specific failure, then ask whether the failure is decomposable.

**Where this breaks down.** Two edge cases. First, when single-agent's context window genuinely can't fit the task (e.g., a task that needs to reason over a 500-page document with internal cross-references). Even then, the answer is usually retrieval or summarization, not multi-agent. Second, when the team has multi-agent expertise already and single-agent expertise is the gap — the team builds what they know. Honest framing: that's a team-skill argument, not an architectural one.

**What to explore next.** [02-coordination-failure-modes.md](./02-coordination-failure-modes.md) — the specific ways multi-agent overhead shows up in production.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Multi-agent                       │ Single-agent                     │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Coordination cost  │ 2-5× overhead per task            │ baseline                         │
│ Debugging surface  │ inter-agent conversation trace    │ one trajectory                   │
│ Failure modes      │ adds: handoff loop, synthesis     │ has only single-agent failures   │
│                    │  mismatch, cost blowup            │                                  │
│ Quality gain       │ situational; only on decomposable │ baseline                         │
│                    │  problems                          │                                  │
│ Time-to-ship       │ slower (more pieces to build)     │ faster                           │
│ Eval surface       │ trajectory + per-agent + topology │ trajectory                       │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what multi-agent gives up

Predictable cost and simple debugging. Every multi-agent system I've seen ship in production has a runbook for "the supervisor decomposed wrong and a worker is running forever" and "the synthesis step combined contradictory outputs and we don't know which to trust." These don't exist in single-agent.

### Sub-block 2 — what single-agent gives up

The ability to handle problems that genuinely require separate specialties with different context. If the problem really does split into "agent A reasons over X; agent B reasons over Y; X and Y don't share context," single-agent will struggle. But this is rarer than teams think.

### Sub-block 3 — the breakpoint

All three conditions: (a) measured single-agent ceiling, (b) decomposable failure, (c) overhead justified by gain. Plus eval discipline strong enough to verify. If you can't verify, you can't tell whether the topology helped. Most teams flip too early because they lack (a) or (d).

### Sub-block 4 — what isn't a tradeoff

"Multi-agent is more powerful." Power isn't free; the overhead is real. The strong framing is "multi-agent buys decomposability at 2-5× cost. Pay only when decomposability is the binding constraint."

---

## Tech reference (industry pairing)

### Supervisor-worker (the default escalation)

- **Codebase uses:** not used.
- **Why it's here:** if contrl ever crossed the gate, this is the topology to start with.
- **Leading today:** supervisor-worker — adoption-leading for first-step multi-agent, 2026.
- **Why it leads:** the coordination mechanism (central supervisor that routes and synthesizes) is the easiest to debug and the easiest to evaluate.

### LangGraph for explicit-state multi-agent

- **Codebase uses:** not used.
- **Why it's here:** when a team does escalate to multi-agent, an explicit-state framework with checkpointing is what keeps it debuggable.
- **Leading today:** LangGraph — innovation-leading for multi-agent orchestration, 2026.

---

## Summary

### Concept recap

The most important multi-agent decision is whether to cross into multi-agent at all. Multi-agent costs 2-5× coordination overhead and a much larger debugging surface; the quality gain is often modest unless the problem splits into specialties. Single-agent first. Measure. Escalate only when (a) single-agent has a measured ceiling, (b) the failure decomposes into specialties, (c) the overhead is justified by the gain. contrl: stays single-agent by design — no decomposition advantage for the coaching task.

### Key points

- Multi-agent is the most common over-engineering pattern in agent design.
- Single-agent first. Measure on the eval. Escalate by evidence.
- The senior-grade answer is "I considered multi-agent and chose not to because [the failure wasn't decomposable]."
- contrl's coaching task is one specialty; multi-agent would add overhead without unlocking decomposition.

---

## Interview defense

### Likely questions

**[mid] When would you go multi-agent?**

When three conditions hold: single-agent has a measured quality ceiling, the failure decomposes into independent specialties, and the 2-5× coordination overhead is justified by the gain. If any is missing, stay single-agent and fix the simpler problem first — usually a prompt fix, a tool fix, or a retrieval fix.

**[senior] Why doesn't contrl go multi-agent?**

The coaching task doesn't decompose. Form coaching, progression coaching, and deload coaching all share the same context (recent sessions, classifier output, last coaching messages) and the same five tools. There are no independent specialties. A "form agent + progression agent" split would just pay 2-5× coordination overhead to do what one agent does in one pass.

**[arch] What's the senior signal on multi-agent?**

The signal is "I built single-agent, measured the eval, identified a specific failure, considered whether it decomposed, and chose [stay / escalate]." The weakest signal is reaching for multi-agent without that sequence. Production engineering values "measured choice" much more than "sophisticated architecture."

### One-line anchors

- "Multi-agent is to single-agent what microservices is to a monolith."
- "Complexity should be earned. Multi-agent's overhead is real."
- "The senior answer is 'I considered it and chose not to, because the failure wasn't decomposable.'"

---

## Validate

**Level 1 — Reconstruct the diagram.** The escalation gate: build single-agent → measure → identify specific failure → decomposable? → escalate or stay.

**Level 2 — Explain in 90s.** What's the cost of going multi-agent? What's the senior-grade gate for crossing it?

**Level 3 — Apply.** A teammate pitches a multi-agent design for the coaching feature: "form agent + progression agent + deload agent." Argue the single-agent case in 4 sentences.

**Level 4 — Defend.** Defend the choice to stay single-agent for contrl's coaching surface even when the codebase grows. What would change your mind?

**Quick check.**
- What's the overhead cost of multi-agent? — 2-5× coordination tokens.
- What's the gate to cross into multi-agent? — Measured ceiling + decomposable failure + justified overhead.
- Will contrl ever go multi-agent? — Not for the current coaching task; would consider for a hypothetical longer-horizon programming agent.
