# Plan-and-execute

**Industry name(s):** Plan-and-execute · Plan-then-act · LLM Compiler-style
**Type:** Industry standard

> Separate the strategy (one expensive model call that builds the plan) from the execution (cheaper calls that run each step). The win: you decouple the cost of strategy from the cost of doing, and you avoid re-deciding the approach on every loop. The cost: brittleness when the plan's assumptions break mid-execution. **Not used by contrl** — the coaching agent's tasks are too small to justify a planner round-trip.

**See also:** → [02-react.md](./02-react.md) (the alternative when re-planning is cheap) · → [04-reflexion-self-critique.md](./04-reflexion-self-critique.md) (re-plan trigger via a critic)

---

## Why care

**Move 1.** You have an agent task with 6-10 steps where the right order matters and the steps have dependencies. Run it as ReAct and the model re-decides the strategy on every turn — sometimes it picks the same plan as before, sometimes it swerves halfway through. Cost and trajectory variance go up. The senior move is to commit to a plan once.

**Move 2.** That "should I commit to a plan up front, or re-decide each step" question is what plan-and-execute answers. Not how to run an agent. Just: where in the loop the strategy gets decided.

**Why it matters: at task lengths past about 5 dependent steps, ReAct loops become unstable** — the model can change its mind partway through, which thrashes the trajectory and burns tokens. Plan-and-execute commits the strategy once with an expensive model and then uses a cheap executor for the grunt work.

**Move 5.** Plan-and-execute is to ReAct what a compiler is to an interpreter: pay the planning cost once, then execute fast.

---

## How it works

### Move 1 — The mental model

```
┌─ Plan phase (once, expensive) ─────────────────────────────────────┐
│                                                                    │
│   user task → planner model → ordered list of steps                │
│                  (e.g., GPT-4 / Sonnet 4)                          │
│                                                                    │
│   plan = [                                                          │
│     1. retrieve auth flow docs                                      │
│     2. retrieve related controller code                             │
│     3. propose diff                                                 │
│     4. run tests                                                    │
│     5. if tests fail, re-plan                                       │
│   ]                                                                 │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌─ Execute phase (many, cheap) ──────────────────────────────────────┐
│                                                                    │
│   for each step in plan:                                            │
│     cheaper model + tools run the step                              │
│     (e.g., Haiku / GPT-4o-mini)                                     │
│                                                                    │
│   if the executor detects the plan is broken (test failed, file    │
│   doesn't exist, etc.) → re-plan from current state                 │
└────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** spend tokens on planning once; spend tokens on doing many times. Don't re-decide the strategy on every action.

### Move 2 — The layered walkthrough

#### When the planner round-trip pays back

Plan-and-execute is the right pattern when:

- The task has more than ~5 dependent steps (the order matters; an earlier step's output drives a later step's choice).
- The plan can usually be made without seeing intermediate results (the strategy is decidable up front from the user request).
- The execution steps are mechanical enough that a cheap model can run them.

When any of these fails, ReAct is better: the planner adds cost without saving anything if the plan needs to be re-derived every turn.

#### The re-plan trigger

```
plan step k fails (test failed, tool error, unexpected output)
       │
       ▼
re-plan from current state:
  pass to planner the original task + completed steps + the failure
       │
       ▼
new plan replaces the remaining steps; execute continues
```

The re-plan trigger is what saves plan-and-execute from being too brittle. Without it, a single broken assumption stalls the whole task. With it, the pattern degrades gracefully — you pay the planner cost again, but only when execution diverges from the plan.

### Move 3 — The principle

The strategy/execution split lets you spend different models on different cognitive loads. Planning is reasoning-heavy → expensive model. Execution is procedural → cheap model. The cost shape inverts ReAct's: ReAct uses the expensive model for every turn (since reasoning happens every turn); plan-and-execute spends the expensive model once, cheap models N times. At long task lengths, the cost difference dominates.

---

## Plan-and-execute — diagram

```
                  USER TASK
                      │
                      ▼
              ┌──────────────────┐
              │  Planner          │   expensive model (Sonnet 4)
              │  (one big call)   │   one call per task (or per re-plan)
              └─────────┬────────┘
                        │  plan = [step1, step2, ...]
                        ▼
              ┌──────────────────┐
              │  Executor        │   cheap model (Haiku)
              │  runs each step  │   N calls per task
              └─────────┬────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
       step succeeded     step diverged
              │                   │
              ▼                   ▼
        next step          re-plan from
                            current state
                                  │
                                  └─► back to planner

Cost shape:
  ReAct:        N × expensive
  Plan-execute: 1 × expensive + N × cheap

At N = 10 dependent steps, plan-and-execute can run 3-5× cheaper.
```

---

## In this codebase

**Case B — not used by contrl.**

The planned coaching agent doesn't need plan-and-execute because the coaching task is short (1-4 tool calls expected, 8 cap) and each tool call's choice depends on what the previous one revealed. There's no plan worth committing to up front — by the time you've called `get_classifier_output` you've already done most of the "planning" the task needs.

When plan-and-execute would earn its place in contrl: if the agent's job grew to "review last week's training and propose a new program for next week" — that's a longer task (read all sessions, compute trends, identify weak spots, propose a structured plan, validate against the user's stated goals). At that task length the planner round-trip pays back.

Planned path if needed: `src/lib/agent/planner.ts` (separate from `runner.ts`).

---

## Elaborate

**Where this pattern comes from.** The split between planning and execution predates LLMs by decades — classical AI planning (STRIPS, PDDL) and operations research both use this structure. The LLM version was popularized by Wang et al., "Plan-and-Solve Prompting" (2023), and matured through the agent-framework era as the natural answer to ReAct's long-task instability.

**The deeper principle.** Decoupling cognitive loads onto different models is a senior architecture move. The planner needs to reason; the executor needs to follow steps. Using one model for both wastes tokens when execution is mechanical. The pattern shows up everywhere — compilers (parse + emit), build systems (plan + execute), pipelines (orchestrator + workers).

**Where this breaks down.** When the plan's assumptions can't be made without seeing intermediate results. If step 2's choice fundamentally depends on what step 1 returns, the planner has to guess — and guessing means the plan is wrong on edge cases, which forces re-planning, which negates the cost savings. ReAct handles this better.

**What to explore next.** [02-react.md](./02-react.md) for the alternative; [04-reflexion-self-critique.md](./04-reflexion-self-critique.md) for the failure detection layer that often gates re-planning.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Plan-and-execute                  │ ReAct                            │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Strategy decision  │ once, up front                    │ every turn                       │
│ Cost shape         │ 1 × expensive + N × cheap         │ N × expensive                    │
│ Stability at long N│ stable (plan is committed)         │ degrades (model changes mind)   │
│ Adaptability        │ low (plan is fixed until re-plan) │ high (every turn re-decides)    │
│ When plan is wrong │ re-plan trigger (extra round-trip)│ adapts inline                    │
│ Eval surface       │ plan quality + execution accuracy │ trajectory only                  │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what plan-and-execute gives up

Adaptability mid-trajectory. The plan is decided before the first execution step; if step 1 reveals something that should have changed the plan, the executor either pushes through with the old plan or triggers a re-plan. ReAct handles this for free because there is no plan; there's only the next decision.

### Sub-block 2 — what ReAct costs at long task length

Token budget. Every ReAct turn runs the expensive model (the one doing the reasoning). At N=10 dependent steps that's 10× the expensive model. Plan-and-execute is 1× expensive + 10× cheap. The breakpoint where plan-and-execute pays back is roughly N=5-7 dependent steps on a task where the plan is mostly stable.

### Sub-block 3 — the breakpoint

Switch from ReAct to plan-and-execute when: (a) eval shows trajectories exceeding ~5 turns on average, (b) the trajectory traces show the model second-guessing earlier decisions (a planner-deficit pattern), (c) cost per task is dominated by expensive-model turns. The Phase 4 coaching agent doesn't hit any of these — it's a short-task agent.

### Sub-block 4 — what isn't a tradeoff

"Plan-and-execute is more sophisticated than ReAct." Sophistication isn't free; the planner round-trip is real and the re-plan brittleness is real. Pick by task shape, not by perceived sophistication.

---

## Tech reference (industry pairing)

### LangGraph for explicit-graph plan-and-execute

- **Codebase uses:** not used. contrl doesn't plan to ship plan-and-execute.
- **Why it's here:** if plan-and-execute ever lands in contrl (program-design agent), a graph framework with checkpointed state makes the re-plan trigger trivial.
- **Leading today:** LangGraph — innovation-leading for stateful agent orchestration, 2026.
- **Why it leads:** explicit nodes for "plan," "execute step," "check status," with conditional edges back to "re-plan."
- **Runner-up:** plain TypeScript with a function per phase; no framework needed at small scale.

### Cheap executor model

- **Codebase uses:** not yet. If plan-and-execute lands, the executor would be Haiku (or GPT-4o-mini) while the planner stays Sonnet 4.
- **Why it's here:** the whole pattern's cost win depends on routing cheap calls to a cheap model.
- **Leading today:** Anthropic Haiku, OpenAI GPT-4o-mini, Gemini Flash — adoption-leading for executor-grade tasks, 2026.
- **Why it leads:** 5-10× cheaper than the planner model with strong-enough following of structured tool instructions for mechanical steps.

---

## Summary

### Concept recap

Plan-and-execute splits the strategy (one expensive call) from the execution (many cheap calls), with a re-plan trigger when execution diverges from the plan. The pattern earns its place at task lengths past ~5 dependent steps; below that, ReAct is simpler and cheaper. contrl's coaching agent is short-task (1-4 tool calls expected) and re-plans aren't needed — ReAct is the right call. The pattern would land if a longer-horizon job (program design, weekly review) joined the agent surface.

### Key points

- The planner is expensive; the executor is cheap. The split is the cost win.
- Re-plan trigger is required — without it, the pattern is too brittle.
- Earn its place at N≥5 dependent steps; below that, ReAct wins.
- contrl: Case B, planned only for a future longer-horizon agent.

---

## Interview defense

### Likely questions

**[mid] What's plan-and-execute?**

Separate the strategy (one expensive model call that builds the plan) from the execution (cheaper model calls that run each step). Re-plan trigger fires when an executor detects the plan is broken. The win is cost — at long task lengths, one expensive call plus N cheap calls beats N expensive calls.

**[senior] When would you reach for it on contrl?**

Not for the coaching agent. The coaching task is short (1-4 tool calls); a planner round-trip would dominate. If the agent surface grew to longer-horizon jobs — a weekly program-design agent that reads the past 7 days of sessions and proposes next week's plan — then plan-and-execute earns its place. The forcing function is task length plus stable plan structure.

**[arch] How do you decide between plan-and-execute and ReAct?**

Measure first. Build ReAct, look at trajectory traces and per-task cost. If trajectories are short and stable, ReAct wins. If trajectories average >5 turns and the model is second-guessing earlier decisions, plan-and-execute pays back. The decision is eval-driven, not architectural-preference-driven.

### One-line anchors

- "Pay for planning once; pay for doing many times."
- "Re-plan trigger or it's too brittle."
- "Earn its place at N≥5 dependent steps; below that, ReAct."

---

## Validate

**Level 1 — Reconstruct the diagram.** Draw the plan phase, the execute phase, and the re-plan trigger.

**Level 2 — Explain in 60s.** When does plan-and-execute beat ReAct? When does it lose?

**Level 3 — Apply.** Pitch: "the contrl coaching agent should be plan-and-execute." Argue against the pitch in 3 sentences using the task-shape argument.

**Level 4 — Defend.** A teammate says "let's always use plan-and-execute for cost reasons." Defend the choice to stay on ReAct for short-task agents.

**Quick check.**
- What's the breakpoint where plan-and-execute pays back? — ~5 dependent steps.
- What's the re-plan trigger? — Executor detects the plan is broken; pass current state back to the planner.
- Does contrl use plan-and-execute? — No; Case B, planned only for hypothetical longer-horizon agents.
