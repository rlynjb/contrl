# Chains vs agents

**Industry name(s):** Chain · workflow · agent loop · autonomous decision loop
**Type:** Industry standard · Language-agnostic

> A chain is a control flow the engineer writes — input flows through known steps, the model fills slots but does not choose what comes next. An agent is a control flow the model writes at runtime — it picks the next tool, reads the result, decides whether to keep going. contrl's deterministic pipelines (pose → FSM rep count) are chains; the planned coaching agent is the only agent in the codebase.

**See also:** → mechanics: [`.aipe/study-ai-engineering/04-agents-and-tool-use/01-agents-vs-chains.md`](../../study-ai-engineering/04-agents-and-tool-use/01-agents-vs-chains.md) · → [02-react.md](./02-react.md)

---

## Why care

**Move 1.** You have a feature that needs three steps. You can either write the three steps in TypeScript and call the LLM at each slot — a `.then()` chain — or you can give the LLM three tools and let it decide which to call in what order. Both are common. They look similar in pseudocode. They behave radically differently in production.

**Move 2.** That "who decides the next step — me or the model" question is what the chain/agent boundary answers. Not what the LLM does. Not how the tools are called. Just: at runtime, who picks the order.

**Why answering that question at all:** This is the load-bearing architectural decision for every LLM feature. **Get it wrong and you pay the cost of agent debugging (variable step count, variable cost, unpredictable failure modes) for a problem that didn't need autonomous reasoning — or you fight a chain through branches that should have been agent decisions and end up with a 400-line orchestrator nobody can change.** The cost of an agent is unpredictability. The benefit is the model handling decisions you can't enumerate up front. Pick the smallest tool that fits the job.

**Move 5.** A chain is a function pipeline; an agent is an interpreter that decides which functions to compose at runtime.

---

## How it works

### Move 1 — The mental model

Two shapes. The chain looks like this:

```
INPUT ──► step 1 ──► step 2 ──► step 3 ──► OUTPUT
          (LLM)      (LLM)      (LLM)
          ▲          ▲          ▲
          │          │          │
       you wrote   you wrote  you wrote
       this        this        this
       order       order       order
```

The agent looks like this:

```
        ┌─────────────────────────────────────────┐
        │              Agent loop                  │
INPUT ─►│   Reason ──► Act (tool) ──► Observe ─┐  │──► OUTPUT
        │      ▲                              │  │
        │      └──────────────────────────────┘  │
        │      (model decides next iteration      │
        │       AND when to stop)                 │
        └─────────────────────────────────────────┘
```

**Strategy in plain English:** if you can enumerate the steps before runtime, write a chain. If the steps depend on what intermediate results reveal, write an agent.

### Move 2 — The layered walkthrough

#### Layer 1 — the decision rule

```
Can I enumerate the steps in advance?
       │
   ┌───┴───┐
  yes      no
   │       │
   ▼       ▼
 chain    agent
 (cheaper, (handles
  more      unknown
  predictable, paths)
  easier to
  debug)
```

**One-line test:** if you can draw the flowchart, write a chain. If the flowchart would need a `?` box ("maybe call X, or maybe call Y, depending on what step 1 says"), you have an agent.

#### Layer 2 — what each costs

- **A chain costs the latency of its longest serial path** plus N independent LLM calls. Variable cost is low — same number of calls every time. Debugging is easy — every step has a deterministic input and a deterministic place in the flow.
- **An agent costs a variable number of LLM calls per task** plus the per-call cost. Variable cost is high — three iterations on one task, twelve on another. Debugging is harder — you trace the trajectory (sequence of reason/act/observe steps), not a fixed call graph.

The variable-cost concern is the one production teams underweight. A ReAct loop that averages 4 turns can hit 20 on an edge case; without an iteration cap, that becomes a runaway. Always cap.

#### Layer 3 — the boundary cases

Two patterns hide the chain-vs-agent decision and make it look like the other one:

```
Looks like a chain, is actually an agent:
   you wrote three "if" branches that all call the LLM with different prompts.
   That's a hand-rolled router, which is a degenerate agent (the human picks
   the branch). The discipline is the same — measure costs, cap iterations.

Looks like an agent, is actually a chain:
   the model "decides" between two tools, but the decision is forced by the
   input shape (one tool for images, one for text). That's not an agent;
   that's a chain with a typed dispatch. Run it as a chain — you'll save
   tokens and gain predictability.
```

---

## Chains vs agents — diagram

```
┌─ Workflow / chain ───────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│  control flow: written by engineer                                                       │
│  model's job:   fill slots                                                               │
│  step count:    fixed                                                                    │
│  cost:          fixed (count × per-call cost)                                            │
│  debugging:     trace through a known graph                                              │
│  failure mode:  one step's prompt is wrong                                               │
│                                                                                          │
│       INPUT ──► A ──► B ──► C ──► OUTPUT                                                  │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Single-agent ───────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│  control flow: written by model at runtime                                               │
│  model's job:   reason about next step, call tool, observe result, repeat or stop        │
│  step count:    variable, bounded by iteration cap                                       │
│  cost:          variable (need budget cap)                                               │
│  debugging:     trace the trajectory                                                     │
│  failure mode:  agent picks wrong tool, loops, or fails to stop                          │
│                                                                                          │
│       INPUT ─► [Reason → Act → Observe ─┐ ─► OUTPUT                                       │
│                           ▲              │                                                │
│                           └──────────────┘  (loop, capped)                                │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Multi-agent (see SECTION C) ────────────────────────────────────────────────────────────┐
│                                                                                          │
│  control flow: coordinated across many agents                                            │
│  model's job:   each agent is a sub-task specialist; a coordinator routes                │
│  step count:    variable per agent; topology determines total                            │
│  cost:          2-5× single-agent overhead                                               │
│  debugging:     trace the conversation between agents                                    │
│  failure mode:  coordination failures (handoff loops, synthesis mismatch, cost blowup)   │
│                                                                                          │
│       Supervisor                                                                          │
│       ┌─────┬─────┐                                                                       │
│       ▼     ▼     ▼                                                                       │
│      W1    W2    W3                                                                       │
│       └─────┼─────┘                                                                       │
│             ▼                                                                             │
│        synthesis                                                                          │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case A (deterministic chain) — the pose → rep-counter pipeline.**

contrl's shipping CV pipeline is a chain. Engineer-written control flow: camera frames flow through MediaPipe pose detection on the GPU, the JS callback hands 33 landmarks per frame to a per-exercise processor that averages symmetric joints, exponentially smooths the angle, and feeds the FSM. Every step is deterministic; no LLM is in the loop. See `src/lib/pose/rep-counter.ts` (the FSM) and `src/lib/pose/exercises/*.ts` (the per-exercise processors). The chain has fixed step count, fixed cost per frame, and a known failure mode (FSM gets a noisy angle and misfires a transition).

**Case B planned — the coaching agent is the only agent.**

The Phase 4 Path C coaching agent is the only agent contrl plans to build. It's a single-agent ReAct loop with five read-only tools — `get_classifier_output`, `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues`. The model decides which tools to call based on what each reveals. The expected loop is 1-4 turns per coaching event, capped at 8 turns with a token budget ceiling. Not yet implemented — planned in `src/lib/agent/`.

The coaching task is an agent because the right tool sequence depends on what the classifier output says. A clean set might trigger one `get_progression_state` call and stop. A form-drift set might pull in `get_form_history` plus `get_exercise_cues`. A deload signal might pull in `get_recent_coaching` to avoid repeating recent feedback. You cannot enumerate the right sequence before knowing the classifier output — that's the test for agent.

---

## Elaborate

**Where this pattern comes from.** The chain/agent distinction is older than LLMs; it's the same boundary between "pre-planned execution" and "interpreter at runtime." Compilers vs scripting languages. Statically planned ETL vs autonomous workflow engines. The LLM-specific framing arrived with Yao et al.'s ReAct paper (2022) and the agent frameworks that followed (LangChain agents, AutoGPT). By 2026, the question every senior interview asks is "is this a chain or an agent, and how do you know?"

**The deeper principle.** Decisions belong with the actor that has the information. If the engineer has all the information needed to pick the next step (at code-writing time), put the decision in the engineer's hands — that's a chain. If only the model, at runtime, has the information needed to pick the next step (because it depends on intermediate results), put the decision in the model's hands — that's an agent. Putting the decision in the wrong place is the architectural mistake this concept exists to catch.

**Where this breaks down.** Two cases. First, hybrid pipelines: a chain with one agentic step in the middle (e.g., "run the agent until it converges, then post-process its output"). This is fine and common; treat the agentic step as a sub-system with its own cap. Second, "agentic chains" — orchestration frameworks that hide chains behind agent-like APIs. The framework calls them agents; the actual control flow is fixed. Read the docs; the framework's terminology may not match the architectural reality.

**What to explore next.**
- [02-react.md](./02-react.md) — the baseline agent pattern, where to start when "agent" wins
- [`.aipe/study-ai-engineering/04-agents-and-tool-use/01-agents-vs-chains.md`](../../study-ai-engineering/04-agents-and-tool-use/01-agents-vs-chains.md) — the per-call mechanics

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│ Dimension          │ Chain (engineer writes flow)     │ Agent (model writes flow)       │
├────────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ Step count         │ fixed                            │ variable, capped                │
│ Cost per task      │ fixed                            │ variable (need budget cap)      │
│ Latency            │ sum of serial calls              │ variable, capped                │
│ Debuggability      │ trace a known graph              │ trace a trajectory              │
│ When it fails      │ one step's prompt is wrong       │ wrong tool, loop, or no halt   │
│ Adapts to unknowns │ no — needs an engineer edit       │ yes — model adapts at runtime  │
│ Test surface       │ test each step independently     │ test trajectory + golden tasks │
└────────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

### Sub-block 1 — what you give up to write an agent

Predictability. A chain that averages 1.2 seconds per task will hit 1.2 seconds every time, plus or minus the LLM's per-call variance. An agent that averages 4 turns will hit 4 turns on an average task and 12 turns on a hard one — and unless you cap, occasionally hit infinity. The variable-cost concern is the real one for production; the iteration cap is the answer but it has a quality cost (you cut off the trajectory and accept a degraded answer when the cap fires).

### Sub-block 2 — what you give up to write a chain

Adaptiveness. The chain works for the inputs you anticipated when you wrote it. An input shape that didn't fit your enumeration either falls through a default branch or fails. The fix is editing the chain — a code change, a deploy. An agent handles the new input shape inside its existing loop, no code change needed. For features where the input space is genuinely open-ended (research questions, support tickets, coding tasks), the chain ages badly.

### Sub-block 3 — the breakpoint

Pick a chain by default. Cross over to agent when one of: (a) you cannot enumerate the right step sequence at code-writing time because it depends on intermediate results, (b) you can enumerate the sequence but it's so input-dependent that the chain becomes a tree with dozens of branches, (c) the feature inherently involves the model reasoning about its own observations (research, planning, recovery from failures).

For contrl's coaching agent, criterion (a) applies: the right tool sequence depends on what the classifier output says about the just-finished set, and you cannot enumerate that at code-writing time.

### Sub-block 4 — what isn't actually a tradeoff

"Agents are more flexible than chains." This phrasing makes "flexible" sound free. It isn't free — flexibility costs variable cost, variable latency, harder debugging, and a need for trajectory eval rather than per-step eval. The strong framing is "agents take a cost in predictability to buy a benefit in adaptiveness." Pick when you need the trade.

---

## Tech reference (industry pairing)

### Anthropic Messages API with `tool_use`

- **Codebase uses:** planned for `src/lib/agent/runner.ts`. The coaching agent will call `messages.create({ tools: [...], tool_choice: 'auto' })` and run a loop on the returned `tool_use` blocks.
- **Why it's here:** the API surface that makes ReAct mechanical. The model emits a `tool_use` block; your code runs the tool, feeds back `tool_result`; the model decides whether to call again or stop.
- **Leading today:** Anthropic Messages API — adoption-leading for typed tool use in production, 2026.
- **Why it leads:** explicit schema, deterministic stop conditions (`stop_reason: 'end_turn' | 'tool_use'`), strong primitives for prompt caching of the system + tools prefix.
- **Runner-up:** OpenAI Chat Completions with functions/tools — comparable shape; choice usually comes down to which model fits the task's eval results.

### LangGraph (for explicit-graph control flow)

- **Codebase uses:** not used. contrl's planned agent doesn't need a graph framework — one tool-use loop is small enough to write directly in `runner.ts` with a `while` loop.
- **Why it's here:** when an agent grows past a single loop (multi-agent, human-in-the-loop pauses, checkpointed state), an explicit-graph framework is the right tool.
- **Leading today:** LangGraph — innovation-leading for graph orchestration in TypeScript and Python, 2026.
- **Why it leads:** explicit state machine, checkpointing for human review, conditional edges; the right shape when you need to inspect or pause the loop.
- **Runner-up:** plain TypeScript with a `while` loop — what contrl's coaching agent will use; no framework dependency at small scale.

---

## Summary

### Concept recap

A chain is engineer-written control flow with the LLM filling slots; an agent is model-written control flow choosing tools at runtime. The decision rule is whether you can enumerate the right step sequence before runtime. contrl ships chains (the pose pipeline) and plans one agent (the coaching loop). The coaching task is an agent because the right tool sequence depends on what the classifier reveals about the just-finished set — and that's unknowable until the set is finished.

### Key points

- Decisions belong with the actor that has the information. Engineer at code-time → chain. Model at runtime → agent.
- Chain costs fixed; agent costs variable — always cap iteration count and token budget on an agent loop.
- contrl's pose-detection pipeline is a chain; the planned coaching agent is the only agent.
- Hybrid pipelines (chain with an agentic sub-step) are fine and common.
- "Agentic" framework APIs sometimes hide chains. Read the docs.

---

## Interview defense

### What an interviewer is really asking

When they ask "is this a chain or an agent?" they want to know whether you understand the boundary at the architectural level — not whether you can recite the definitions. The signal they're looking for is whether you can articulate the decision rule, name a concrete example of each in your codebase, and explain why one fits the problem.

### Likely questions

**[mid] What's the difference between a chain and an agent?**

A chain is control flow you wrote; an agent is control flow the model writes at runtime. In a chain you've decided what step comes next at code-writing time; in an agent the model decides at runtime based on what intermediate results reveal. The test: can you enumerate the steps before the input arrives? Yes → chain. No → agent.

```
INPUT ─► step1 ─► step2 ─► step3 ─► OUTPUT    (chain: engineer-written)

INPUT ─► [Reason → Act → Observe ─┐ ─► OUTPUT  (agent: model-written)
                  ▲                │
                  └────────────────┘
```

**[senior] In contrl, which is the coaching loop and why?**

Single-agent. The coaching task fires when a set completes. The right tool sequence — which of the five read-only tools to call, in what order, when to stop — depends on what the classifier emits for that set. A clean set might use one tool; a form-drift set pulls in form history plus exercise cues. I cannot enumerate that sequence at code-writing time, so the model decides at runtime. That's the test for agent.

The cost I'm paying is variable iteration count and variable cost per coaching event. The defenses: iteration cap (max 8 turns), token budget ceiling per run, read-only tool allowlist as a bounding box on what the loop can affect.

**[arch] When would you flip back to a chain?**

If the classifier's output became reliably bucketed into N known cases — e.g., five distinct coaching modes that map cleanly to five fixed sequences — I'd hand-route by case and run a per-case chain. That would cut variable cost and make debugging deterministic. The reason I haven't done that is the classifier doesn't exist yet (Phase 2C). Once it does and the output distribution stabilizes, the chain-vs-agent call is worth revisiting.

```
Today                        Future (post-Phase 2C, post-eval)
─────                        ────────────────────────────────
classifier output            classifier output
   │                            │
   ▼                            ▼
agent loop (4-8 tool calls,    case dispatch (5 known sequences)
model decides)                    │
                                  ▼
                                fixed chain per case
```

### The question candidates always dodge

**"Why isn't this a workflow?"**

The honest answer is sometimes "I haven't checked." The pattern an interviewer is testing for: a candidate who picks "agent" by default because it sounds more impressive. The strong move is to invert and stress-test: "Could I write this as a chain? Let me try. Step 1: read the classifier output. Step 2: ... wait, step 2 depends on step 1. And step 3 depends on step 2 in a way I can't enumerate. So it's an agent." Walking through the failed chain construction is the proof.

For contrl: I genuinely tried to chain-route the coaching task by classifier bucket before designing the agent. The reason the chain didn't work is the cross-tool dependencies — `get_recent_coaching` is only relevant if `get_form_history` shows a recent drift, and you don't know that until you've called `get_form_history`. The dependency makes the flow tree too deep for a chain.

### One-line anchors

- "If you can draw the flowchart, write a chain. If the flowchart has a `?` box, write an agent."
- "Decisions belong with the actor that has the information."
- "Agent flexibility costs variable cost and trajectory eval. Pick when you need the trade."

---

## Validate

**Level 1 — Reconstruct the diagram.** Draw the chain shape and the agent loop side by side from memory. Label each axis: who decides next step, fixed vs variable step count, cost shape.

**Level 2 — Explain in 90 seconds.** What's the chain/agent boundary, and which is contrl's coaching loop? Why?

**Level 3 — Apply.** A teammate proposes a feature: "automatically generate a weekly summary email from the user's last 7 sessions." Chain or agent? Defend the answer in three sentences. (Hint: enumerate the steps. Can you?)

**Level 4 — Defend.** The PM wants the coaching loop replaced with a fixed three-step chain to make it predictable. Walk through what you'd lose and what scenarios in the eval suite would regress.

**Quick check.**
- What's the test for "this should be an agent"? — Can't enumerate the right step sequence at code-writing time.
- What's contrl's chain example, and what's its agent example? — Pose → rep-counter pipeline (chain); planned coaching agent (agent).
- What's the cost an agent pays that a chain doesn't? — Variable iteration count, variable cost, harder debugging.
