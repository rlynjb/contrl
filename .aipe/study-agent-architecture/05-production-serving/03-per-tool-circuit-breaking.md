# Per-tool circuit breaking

**Industry name(s):** Per-tool circuit breaker · Tool-level breaker · Open-circuit observation
**Type:** Industry standard

> Single-call retry handles one flaky request. An agent loop can call the *same flaky tool* on every turn — retrying a dead tool inside a loop multiplies the failure by the iteration count and burns the whole budget on a tool that isn't coming back. Per-tool circuit breakers stop the loop from re-calling a known-broken tool, and feed the open-circuit state back to the agent as an observation so it routes around. **Required for contrl's planned coaching agent.**

**See also:** → single-call retry: [`.aipe/study-ai-engineering/06-production-serving/05-retry-circuit-breaker.md`](../../study-ai-engineering/06-production-serving/05-retry-circuit-breaker.md) · → coordination failures: [03-multi-agent-orchestration/02-coordination-failure-modes.md](../03-multi-agent-orchestration/02-coordination-failure-modes.md)

---

## Why care

**Move 1.** Your agent calls `get_classifier_output`. The tool fails. The agent retries inside the loop. The tool fails again. The agent retries. After eight turns, you've spent the iteration budget retrying the same dead tool. The coaching message that should have shipped never does.

**Move 2.** That "how do I stop the loop from re-calling a known-broken tool" question is what per-tool circuit breaking answers. Not how to handle one failure. Just: how to escalate a recurring tool failure into the agent's awareness.

**Why it matters: an agent loop multiplies a flaky tool's cost by the iteration count.** Without a breaker, one dead tool burns the whole budget. With one, the agent observes the failure and routes around.

**Move 5.** The agent-version of a circuit breaker is the same shape as the web-service version — fail fast on known-broken — plus an extra step: tell the consumer (the agent) so it can adapt.

---

## How it works

### Move 1 — The mental model

```
┌─ Per-tool circuit breaker ───────────────────────────────────────────────────────────┐
│                                                                                      │
│   For each tool, track:                                                              │
│     - state: CLOSED | OPEN | HALF_OPEN                                               │
│     - consecutive_failures                                                           │
│     - opened_at: timestamp                                                            │
│                                                                                      │
│   CLOSED:                                                                            │
│     calls pass through                                                               │
│     on failure: increment consecutive_failures                                       │
│     on threshold (e.g., 3 in a row): transition to OPEN                              │
│                                                                                      │
│   OPEN:                                                                              │
│     calls fail fast — return { error: 'tool_unavailable', tool: 'X' }                │
│     don't call the actual tool                                                       │
│     after cooldown T (e.g., 30s): transition to HALF_OPEN                            │
│                                                                                      │
│   HALF_OPEN:                                                                         │
│     allow one call through                                                           │
│     success → CLOSED                                                                 │
│     failure → OPEN (reset cooldown)                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** the breaker rate-limits failure. Three consecutive fails → open the circuit; for 30 seconds, return failure-as-data instead of calling the dead tool.

### Move 2 — The agent-specific addition: failure-as-observation

This is the part that's *different* from a generic web-service circuit breaker. In a web service, the breaker just fails fast. In an agent, the breaker also tells the agent — so the agent can route around.

```
without observation feedback:
   tool X open → return error → agent retries → cap fires → degraded output

with observation feedback:
   tool X open → return { error, recoverable: false, suggested_action: 'use Y instead' }
              → agent reasons: "X is unavailable; can I use Y?"
              → agent calls Y; trajectory continues normally
```

The difference is the agent's reasoning. Surface the open-circuit state as an observation, not just an error. Include in the failure return: which tool, why, suggested alternative if any.

### Move 3 — The principle

Failure-as-observation, not failure-as-exception. The breaker stops the immediate cost (re-calling a dead tool) and gives the agent the information needed to route around. Without the observation, you've just made the failure cheaper without making it useful.

---

## Per-tool circuit breaker — diagram

```
┌─ Tool X over time, with breaker ─────────────────────────────────────────────────────┐
│                                                                                      │
│   t=0   call X → success           state: CLOSED                                     │
│   t=1   call X → success           state: CLOSED                                     │
│   t=2   call X → FAILURE           state: CLOSED, fails=1                            │
│   t=3   call X → FAILURE           state: CLOSED, fails=2                            │
│   t=4   call X → FAILURE           state: OPEN (threshold 3 hit)                     │
│                                                                                      │
│   t=5   call X → FAIL FAST          state: OPEN — no actual call                     │
│         agent observes: { error, recoverable: false }                                │
│         agent reasons: "Use tool Y instead"                                          │
│         agent calls Y → success                                                      │
│         trajectory continues normally                                                │
│                                                                                      │
│   t=30  cooldown elapses           state: HALF_OPEN                                  │
│   t=31  call X → success            state: CLOSED, fails=0                            │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — required for the coaching agent.**

The planned `src/lib/agent/runner.ts` will maintain a per-tool breaker map. Each of the 5 read-only tools has its own state, consecutive-failure count, and cooldown timer. On the third consecutive failure, the breaker opens for 30 seconds; the tool returns `{ error: 'tool_unavailable', recoverable: false }` instead of being called.

Specific failure modes the breaker defends against in contrl:

- **`get_classifier_output` race**: the agent runs before the FSM has emitted a classifier output. The breaker opens after 3 misses; the agent observes "classifier not yet emitted" and degrades gracefully (emits a canned "encourage" message instead of personalized coaching).
- **`get_form_history` query timeout**: if a SQLite query stalls (shouldn't happen at scale but defended against), the breaker prevents retries from compounding.
- **`get_recent_coaching` schema mismatch**: if the table is mid-migration, the breaker isolates the failure to that tool.

The map lives in module scope in `runner.ts` (in-memory state per app instance). For a multi-user / multi-instance deployment, the state would need to be coordinated — but at contrl's solo scale, in-memory is fine.

---

## Elaborate

**Where this pattern comes from.** Circuit breakers were named by Michael Nygard in *Release It!* (2007), borrowed from electrical engineering. The agent version adds the observation-feedback half — without that, you've stopped the immediate cost but haven't given the agent the information to do better.

**The deeper principle.** Failure compounds in loops. A single retry on a single call is cheap; a retry on every turn of an agent loop is N× as expensive. The breaker is the rate limiter on failure.

**Where this breaks down.** When the failure is genuinely transient and the breaker opens too aggressively — three consecutive fails on what was a one-second blip means 30 seconds of fail-fast on a recovered tool. Mitigation: tune the threshold and cooldown to the actual failure shape; transient blips need a higher threshold or no breaker at all.

**What to explore next.** [`.aipe/study-ai-engineering/06-production-serving/05-retry-circuit-breaker.md`](../../study-ai-engineering/06-production-serving/05-retry-circuit-breaker.md) for the single-call primitives.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Per-tool breaker + observation    │ Naive retry                      │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Dead-tool cost     │ bounded (~3 calls until open)     │ unbounded (every loop turn)      │
│ Agent reasoning    │ routes around dead tool           │ retries until budget exhausts    │
│ Engineering cost   │ ~30 lines per breaker             │ none                             │
│ Recovery detection │ HALF_OPEN probe                   │ none (or full retry on every call)│
│ Tuning needed      │ threshold + cooldown per tool     │ none                             │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Required for any agent with tools. Even at solo scale, the budget-blowout-from-a-dead-tool failure is a real production incident. The engineering cost is small; the avoided incident is large.

---

## Tech reference (industry pairing)

### In-memory breaker map

- **Codebase uses:** planned. Module-scope `Map<toolName, BreakerState>` in `runner.ts`.
- **Why it's here:** simplest implementation; no external dependency.
- **Leading today:** hand-rolled breakers — adoption-leading at small scale, 2026.

### Distributed circuit breaker (Redis-backed)

- **Codebase uses:** not used. Case B at contrl's scale (single app instance).
- **Why it's here:** when multiple agent instances need shared breaker state, a Redis-backed implementation coordinates.

---

## Summary

### Concept recap

Per-tool circuit breakers stop the loop from re-calling a known-broken tool. The agent-specific addition: failure-as-observation. The breaker doesn't just fail fast; it tells the agent "tool X is unavailable, consider alternative." contrl's planned coaching agent has breakers on all 5 tools — required to defend against budget blowout from a dead-tool retry spiral.

### Key points

- An agent loop multiplies one dead tool's cost by the iteration count.
- Failure-as-observation, not failure-as-exception.
- Three states: CLOSED, OPEN, HALF_OPEN.
- Required for any agent with tools, even at solo scale.

---

## Interview defense

### Likely questions

**[mid] What's a per-tool circuit breaker in an agent context?**

Same shape as a web-service breaker — three consecutive failures, open the circuit, cooldown, half-open probe — plus an agent-specific addition: the failure return is a structured observation the agent can reason on. The agent sees "tool X unavailable, use Y instead" and routes around.

**[senior] Why is this required even at solo scale for contrl?**

One dead tool in an agent loop equals the entire iteration budget spent on retries. At solo scale that's not a billing problem, but it's a degraded-output problem: the user gets nothing instead of degraded coaching. The breaker isolates the failure, lets the agent route around, and produces a graceful degraded output instead of a budget-exhausted failure.

**[arch] What's the senior signal?**

The observation-feedback half. A breaker that just fails fast is half the pattern; a breaker that tells the agent which tool is down and why is the complete pattern. Without feedback, the agent retries blindly or hits the cap — neither is as good as routing around to a working alternative.

### One-line anchors

- "An agent loop multiplies a dead tool's cost by the iteration count."
- "Failure-as-observation, not failure-as-exception."
- "Breaker plus feedback is the complete pattern."

---

## Validate

**Level 1 — Reconstruct the diagram.** CLOSED → OPEN → HALF_OPEN state machine for a tool over time.

**Level 2 — Explain in 60s.** What makes the agent version different from a web-service circuit breaker?

**Level 3 — Apply.** A teammate's agent burns 8 turns retrying a dead retrieval tool. Walk through the fix.

**Quick check.**
- What's the threshold for opening contrl's planned breakers? — 3 consecutive failures.
- What's the cooldown? — 30 seconds.
- Why is failure-as-observation the senior touch? — The agent can route around instead of retrying blindly.
