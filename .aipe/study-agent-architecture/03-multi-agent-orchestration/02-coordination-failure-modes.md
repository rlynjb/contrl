# Coordination failure modes

**Industry name(s):** Coordination failures · Agent runaways · Infinite handoff · Tool-call cascade · Synthesis mismatch
**Type:** Industry standard

> The failure modes that don't exist in single-call LLM systems but show up as soon as you have an autonomous loop. Some are multi-agent-only (infinite handoff, synthesis mismatch); others (tool-call cascade, cost blowup, context bloat) hit single-agent loops too. **For contrl, the relevant failure modes are tool-call cascade and cost blowup** — the planned coaching agent must defend against both with iteration caps and token budgets.

**See also:** → [01-when-not-to-go-multi-agent.md](./01-when-not-to-go-multi-agent.md) (where these failures come from) · → [04-agent-infrastructure/05-guardrails-and-control.md](../04-agent-infrastructure/05-guardrails-and-control.md) (the control envelope that defends)

---

## Why care

**Move 1.** Your single-agent passes eval. You ship. Two weeks later, you get a bill spike. One coaching event ran 18 iterations — the model kept calling tools, kept thinking, never emitted a final answer. The iteration cap wasn't set. The token budget wasn't capped. The agent burned through your monthly budget on one user's bad session.

**Move 2.** That "what failure modes exist *only* once the system is agentic" question is what this file answers. Not how to coordinate agents. Just: what fails, what it costs, what stops it.

**Why it matters: agent failure modes are not LLM failure modes. They emerge from the loop, not from any single call. Defending against them is a separate discipline.**

**Move 5.** Coordination failures are to agent systems what livelock and deadlock are to concurrent programs: emergent, hard to reproduce, expensive when they fire.

---

## How it works

### Move 1 — The mental model

```
┌─ Coordination failures and where they live ──────────────────────────────────────────────┐
│                                                                                          │
│   FAILURE MODE                  │  SINGLE-AGENT?  │  MULTI-AGENT?  │  MITIGATION         │
│   ──────────────────────────────┼─────────────────┼────────────────┼──────────────────── │
│   Infinite handoff (A→B→A→B)    │  no              │  yes           │  handoff counter,  │
│                                 │                  │                │  human escalation   │
│   Tool-call cascade             │  yes (lighter)   │  yes (heavier) │  per-agent + global │
│   (one call triggers a storm)   │                  │                │  iteration cap      │
│                                 │                  │                │                     │
│   Context bloat                 │  yes              │  yes (worse)   │  message passing /  │
│   (shared state accumulates)    │                  │                │  context routing    │
│                                 │                  │                │                     │
│   Synthesis mismatch            │  no              │  yes           │  schema-validate    │
│   (worker outputs contradict)   │                  │                │  worker outputs;    │
│                                 │                  │                │  surface conflicts  │
│                                 │                  │                │                     │
│   Cost blowup                   │  yes              │  yes (worse)   │  per-run token      │
│   (2-5× compounds silently)     │                  │                │  budget; cheap      │
│                                 │                  │                │  workers, expensive │
│                                 │                  │                │  only at supervisor │
│                                 │                  │                │                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

The first column is what you ship without thinking about. The last column is what you ship if you don't want to wake up to an incident.

### Move 2 — The four critical mitigations

#### Iteration cap (per-agent and global)

```
agent.run({
  maxIterations: 8,       // per-agent cap on the ReAct loop
  globalMaxIterations: 8, // for single-agent these are the same
  onCapHit: degrade,      // surface a degraded answer; don't fail open
})
```

The iteration cap stops the loop after K turns. Without it, an agent that fails to emit a stop condition runs until the token budget breaks. Default in production: 8-12 for general agents; 4-8 for narrow agents like contrl's coaching.

#### Token budget ceiling

```
agent.run({
  tokenBudget: 50_000,       // halt the run if total tokens cross
  onBudgetHit: degrade,
})
```

Even if iterations are capped, large prompts (long context, large tool returns) can blow the per-run cost. The token budget is the second guardrail.

#### Per-tool circuit breaker

```
// see 05-production-serving/03-per-tool-circuit-breaking.md
if (tool.failureCount > threshold) {
  return { error: 'tool_x_unavailable' }
  // agent observes the failure and routes around the tool
  // instead of retrying it every turn
}
```

Stops the "one dead tool burns the iteration budget" failure.

#### Halt conditions surfaced to the agent

```
{
  tool_result: 'classifier output stale by 2h; coaching may be inaccurate',
  meta: { recoverable: false, suggested_action: 'inform_user' }
}
```

When a tool returns "this isn't going to work for your task," the agent should observe that and stop trying to make it work. Failure-as-observation, not failure-as-exception.

### Move 3 — The principle

Every autonomous loop needs a control envelope. Iteration cap, token budget, circuit breakers, halt conditions — these aren't optional features; they're the difference between a shipped system and a bill-spike incident.

---

## The control envelope — diagram

```
┌─ The control envelope around every agent loop ───────────────────────────────────────┐
│                                                                                      │
│   INCOMING REQUEST                                                                   │
│            │                                                                         │
│            ▼                                                                         │
│   ┌───────────────────────────────────────────────────────────────────────┐         │
│   │  Input guardrail (sanitize, validate)                                  │         │
│   └────────────────────────────┬──────────────────────────────────────────┘         │
│                                ▼                                                     │
│   ┌───────────────────────────────────────────────────────────────────────┐         │
│   │  Agent loop                                                            │         │
│   │   - iteration cap (K=8)                  ← stops infinite loops        │         │
│   │   - token budget (50k/run)                ← stops cost blowup           │         │
│   │   - per-tool circuit breaker              ← stops tool-call cascade     │         │
│   │   - halt-observable failure modes         ← agent routes around dead   │         │
│   │                                             tools                        │         │
│   └────────────────────────────┬──────────────────────────────────────────┘         │
│                                ▼                                                     │
│   ┌───────────────────────────────────────────────────────────────────────┐         │
│   │  Output guardrail (schema, safety, side effects)                       │         │
│   └────────────────────────────┬──────────────────────────────────────────┘         │
│                                ▼                                                     │
│                          UI / next consumer                                          │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — the control envelope for the coaching agent.**

The planned `src/lib/agent/runner.ts` will enforce:

- **Iteration cap = 8** (the coaching agent should never need more than 4 turns; 8 is the safety ceiling)
- **Token budget per run = 50k** (typical coaching event is 3-5k tokens; 50k absorbs edge cases)
- **Per-tool circuit breakers** on all 5 read-only tools (if `get_classifier_output` errors twice in a row, the breaker opens, the agent observes "classifier unavailable" and can either ask for retry or degrade gracefully)
- **Halt-observable failures** in tool returns: if `get_classifier_output` finds no record for the set_id (race condition: the agent ran before the FSM emitted), the tool returns `{ recoverable: false, reason: 'no_classifier_output_yet' }` and the agent stops trying

Multi-agent failure modes (infinite handoff, synthesis mismatch) don't apply to contrl's single-agent shape — but tool-call cascade and cost blowup do. The control envelope above is what defends.

---

## Elaborate

**Where this pattern comes from.** Control envelopes around autonomous loops predate LLMs by decades — every batch job, every async task queue, every retry policy includes them. Production LLM agents inherited the discipline from these older shapes, often after early incidents that taught the teams the hard way.

**The deeper principle.** Autonomy without bounds is just a runaway. Every system that lets a process decide its own next step also needs a system that says when to stop. The control envelope makes autonomy productive instead of dangerous.

**Where this breaks down.** When a cap fires during a legitimate long-trajectory task and degrades the user experience without a graceful fallback. Mitigation: every cap-hit case needs a recovery path — a degraded answer, an escalation to a human, a transparent "I couldn't complete this." Capping without a recovery path makes the bound a cliff.

**What to explore next.** [04-agent-infrastructure/05-guardrails-and-control.md](../04-agent-infrastructure/05-guardrails-and-control.md) — the input/output guardrails that wrap the loop.

---

## Tradeoffs

```
┌────────────────────┬─────────────────────────────────┬─────────────────────────────────┐
│ Dimension          │ With control envelope           │ Without (uncapped loop)         │
├────────────────────┼─────────────────────────────────┼─────────────────────────────────┤
│ Worst-case cost    │ bounded by token budget         │ unbounded                       │
│ Worst-case latency │ bounded by iteration cap        │ unbounded                       │
│ Failure recovery   │ graceful degradation            │ silent failure or runaway        │
│ Bill predictability│ p99 known                       │ p99 = "depends on the input"     │
│ Engineering cost   │ ~30 lines of runner code        │ "we'll add it later"             │
└────────────────────┴─────────────────────────────────┴─────────────────────────────────┘
```

### Sub-block 1 — what the envelope gives up

Tasks that genuinely need more than the cap allows. A coaching event capped at 8 iterations means tasks that need 9 iterations fail. The fix isn't "raise the cap" — the cap is your safety net. The fix is making 8 enough, or surfacing the failure cleanly.

### Sub-block 2 — what skipping the envelope costs

The first incident. Production agents without caps eventually fire one in a way that costs real money or breaks real user experience. The discipline is "the envelope is in the first ship," not "we'll add it after the first incident."

### Sub-block 3 — the breakpoint

The control envelope is non-negotiable for any autonomous loop, period. The breakpoint isn't "when to add it" — it's "build it as part of the first version."

---

## Tech reference (industry pairing)

### Per-run token budget tracking

- **Codebase uses:** planned for `src/lib/agent/runner.ts`. Track `response.usage` per call; halt the loop if cumulative crosses the budget.
- **Why it's here:** the second guardrail after iteration cap.
- **Leading today:** Anthropic + OpenAI usage tracking — adoption-leading, 2026.

### Circuit breaker (per tool)

- **Codebase uses:** planned. A small in-memory map tracking failure counts per tool, with a TTL-based half-open state.
- **Why it's here:** stops the dead-tool-loops-the-budget failure.
- **Leading today:** hand-rolled per-tool breakers — adoption-leading, 2026.

---

## Summary

### Concept recap

Agent failure modes are not LLM failure modes — they emerge from the loop. Iteration cap, token budget, per-tool circuit breakers, and halt-observable failures are the four-corner control envelope every autonomous loop needs from the first ship. Multi-agent adds infinite handoff and synthesis mismatch on top; single-agent (contrl's case) only needs to defend against tool-call cascade, context bloat, and cost blowup.

### Key points

- Every autonomous loop needs a control envelope.
- Cap iterations. Cap tokens. Per-tool breakers. Halt-observable failures.
- Caps without a recovery path are cliffs; surface graceful degradation.
- contrl's planned `runner.ts` enforces all four; non-negotiable for the first ship.

---

## Interview defense

### Likely questions

**[mid] What failure modes do agents have that LLMs don't?**

Five: infinite handoff (multi-agent only), tool-call cascade, context bloat, synthesis mismatch (multi-agent only), and cost blowup. All emerge from the loop, not from any single call. The defenses are iteration cap, token budget, per-tool circuit breakers, and halt-observable failures in tool returns.

**[senior] What's the control envelope on contrl's coaching agent?**

Four guardrails. Iteration cap at 8 (typical task is 3-4 turns). Per-run token budget at 50k. Per-tool circuit breakers on all 5 read-only tools. Halt-observable failures in tool returns — e.g., the classifier-output tool returns `{ recoverable: false }` if there's no record yet, and the agent stops instead of looping.

**[arch] What's the cost of NOT having the control envelope?**

The first runaway. An iteration uncap means one bad classifier output can cost hundreds of dollars in a single coaching event. The fix isn't expensive — 30 lines of runner code — and the discipline is to build it from version one, not after the first incident.

### One-line anchors

- "Autonomy without bounds is just a runaway."
- "Cap iterations, cap tokens, breakers per tool, halt-observable failures."
- "The control envelope is in the first ship."

---

## Validate

**Level 1 — Reconstruct the diagram.** The control envelope around an agent loop: input guardrail → loop with 4 controls → output guardrail.

**Level 2 — Explain in 90s.** Five coordination failure modes. Which apply to single-agent? Which need multi-agent?

**Level 3 — Apply.** A teammate's agent runs 25 iterations on a hard task and burns the budget. Walk through the four mitigations you'd add.

**Level 4 — Defend.** A PM asks why we don't just "raise the iteration cap" instead of degrading the answer. Defend the cap-as-safety-net framing.

**Quick check.**
- What's contrl's iteration cap? — 8.
- What's the failure mode that *only* affects multi-agent? — Infinite handoff and synthesis mismatch.
- What's the senior tell on coordination failures? — Knowing all four guardrails belong in the first ship.
