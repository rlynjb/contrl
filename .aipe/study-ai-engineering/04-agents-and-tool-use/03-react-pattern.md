# Agent loop and termination

**Industry name(s):** Agent loop, ReAct-style loop, multi-turn LLM orchestration
**Type:** Industry standard

> An agent is a `while` loop: send context to LLM, parse response, if it's a tool call execute it and continue; if it's a final answer return it; if iteration count exceeds N, force-stop. The termination conditions are the safety net that keeps a stochastic loop bounded.

**See also:** → [01-tool-and-function-calling](./01-tool-and-function-calling.md) · → [05-error-recovery-in-agents](./05-error-recovery-in-agents.md) · → [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)

---

## Why care

A single LLM call answers questions whose context fits in the prompt. An agent loop answers questions where the LLM needs to *fetch* context first — and decide *what* to fetch. The loop is the structure that lets a stochastic model perform a deterministic multi-step task. The risk: a model that doesn't know when to stop can loop forever, racking up API costs and timeouts.

The pattern is **ReAct-style agent loop** — "reasoning + acting" — where the model alternates between thinking (text) and acting (tool calls). Same shape as Anthropic's "Building effective agents" recipe, LangChain agents, OpenAI's Assistants API. The hard part isn't writing the loop; it's deciding when to stop.

---

## How it works

The loop runs until either the model says it's done OR an external bound trips. The model signals "done" via `stop_reason: 'end_turn'`. The external bound is the iteration cap and the wall-clock timeout.

### The skeleton

```typescript
async function runAgent(userMessage: string, maxIterations = 6, timeoutMs = 30_000): Promise<string> {
  const messages = [{ role: 'user', content: userMessage }];
  const start = Date.now();

  for (let i = 0; i < maxIterations; i++) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('agent timeout');
    }

    const response = await llm.send({ messages, tools });
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      return extractText(response);
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = await Promise.all(
        response.content
          .filter(b => b.type === 'tool_use')
          .map(async (b) => {
            try {
              const result = await dispatch(b.name, b.input);
              return { tool_use_id: b.id, content: JSON.stringify(result), is_error: false };
            } catch (err) {
              return { tool_use_id: b.id, content: String(err), is_error: true };
            }
          })
      );
      messages.push({ role: 'user', content: toolResults.map(r => ({ type: 'tool_result', ...r })) });
      continue;
    }

    throw new Error(`unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error('max iterations reached');
}
```

The loop has four exits:
1. `end_turn` → return the text.
2. `tool_use` → dispatch tools, append results, continue.
3. Iteration cap → throw.
4. Timeout → throw.

### Why bounded iteration

Without a max-iteration check, a model that keeps calling tools without converging burns money. ~6 iterations is the empirical sweet spot: enough for "fetch context → reason → fetch more → answer" but bounded for cost.

Curriculum item B4C.3 specifies "termination: coaching message generated or 'no coaching needed'" — for the coaching agent specifically, the loop ends when the model produces *either* a coaching string OR an explicit "no coaching needed" output. Both are `end_turn` responses; the distinction is in the content.

### Why parallel tool dispatch

`Promise.all(...)` over `tool_use` blocks. The LLM sometimes emits multiple tool calls in a single response — "get form history AND get progression state". Dispatching them in parallel cuts latency in half (vs. serial). Each tool result includes its `tool_use_id` so the model can correlate them.

### Move 2.5 — what fires for the coaching agent

Path C's loop has fewer iterations than a general-purpose agent because the task is narrow:

1. **Iteration 1:** model gets the trigger ("user just finished a set with classifier outputs"), calls `get_form_history` and `get_progression_state` in parallel.
2. **Iteration 2:** model reads the results, may call `get_recent_coaching` to avoid repeating advice.
3. **Iteration 3:** model emits the final coaching string OR `"no coaching needed"`.

Most runs terminate in 2–3 iterations. The cap of 6 is generous defense against runaway loops.

### Move 3 — The principle

An agent is a `while` loop with three exits. Two of the exits (max-iter, timeout) are external safety nets; one (`end_turn`) is the model deciding it's done. The "agent" mystique often comes from the model's reasoning between steps, but the *structure* is just a loop with stopping conditions.

The full picture is below.

---

## Agent loop — diagram

```
                  ┌─────────────────────────┐
                  │  user message arrives   │
                  └────────────┬────────────┘
                               │
                               ▼
            ┌─────────────────────────────────────────┐
            │  messages = [ { role: user, ... } ]     │
            │  i = 0                                  │
            └─────────────────────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │   loop while i < maxIterations:                          │
   │                                                          │
   │     check timeout                                        │
   │       │ exceeded → throw                                 │
   │       ▼                                                  │
   │     response = llm.send(messages, tools)                 │
   │     append assistant message                             │
   │       │                                                  │
   │       ▼                                                  │
   │     ┌──── stop_reason ────┐                              │
   │     │                     │                              │
   │     │  end_turn ──────────┼──► return extractText        │
   │     │                     │                              │
   │     │  tool_use ──────────┼──► dispatch tools in parallel │
   │     │                     │     append tool_results       │
   │     │                     │     i++, continue            │
   │     │                     │                              │
   │     │  (other) ───────────┼──► throw 'unexpected'        │
   │     └─────────────────────┘                              │
   │                                                          │
   │   if i reaches maxIterations: throw 'max iter'           │
   │                                                          │
   └──────────────────────────────────────────────────────────┘

   Three exits:
     1. end_turn       (model says done)
     2. max iterations (external cap)
     3. timeout        (wall-clock cap)
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C of the curriculum is the planned build.

Expected path: `src/services/ai/agent.ts` — the loop, with `maxIterations`, timeout, and the dispatch logic from [01-tool-and-function-calling](./01-tool-and-function-calling.md).

The coaching trigger is gated by the rule "≥ 2 instances of same failure in session" (B4C.4), which is part of [04-tool-routing](./04-tool-routing.md) — not the loop itself.

---

## Elaborate

### Where this pattern comes from

ReAct (Yao et al., 2022) formalized the "reasoning + acting" alternation in academic agent work. Anthropic's "Building effective agents" post (2024) gave it a productionizable framing. Every modern agent framework (LangChain, AutoGPT, CrewAI) is a variant of "loop until done, with safety bounds". The pattern converges because there's no other shape — model output → action → new context → model output is the only general-purpose mechanism for "do a multi-step thing".

### The deeper principle

Bounded iteration is what makes stochastic loops production-safe. A while loop without a bound and stochastic exit conditions is a recipe for unbounded cost. Every agent that ships in production has a max-iteration cap; the value varies (6, 10, 30) but the cap is non-negotiable.

### Where this breaks down

When the task genuinely requires more iterations than the cap. A complex multi-step task might need 15 iterations; capping at 6 means the agent fails on hard tasks. The mitigation is either: raise the cap (more cost surface), let the agent restart from a checkpoint, or break the task into sub-agents.

The other breakpoint: when termination depends on something the model can't directly check. If the success condition is "the user accepted the coaching", the model has no signal for that. The fix is to bake the success criteria into the prompt and let the model emit `"no coaching needed"` when it judges the criteria as not met.

### What to explore next

- [01-tool-and-function-calling](./01-tool-and-function-calling.md) → the action half of "reasoning + acting"
- [05-error-recovery-in-agents](./05-error-recovery-in-agents.md) → what happens when tools fail
- [07-building-effective-agents-patterns](./07-building-effective-agents-patterns.md) → Anthropic's recommendations applied here

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Bounded ReAct loop (planned)     │ Single-shot prompt (alt)         │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Capability         │ Multi-step reasoning with tools  │ Limited to in-prompt context     │
│ Latency            │ N × round-trip                   │ 1 round-trip                     │
│ Cost               │ N × tokens                       │ 1 × tokens                       │
│ Reliability        │ Higher accuracy via grounding    │ Hallucinations more likely       │
│ Determinism        │ Lower (stochastic loop)          │ Higher (single output)           │
│ Debuggability      │ Trace per iteration              │ One trace, but less context      │
│ Cost ceiling       │ Bounded by iter cap              │ Bounded by prompt size           │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Latency: a coaching response with 3 iterations is ~1.5 seconds of API time at Sonnet speeds. For an end-of-set message that's fine; for live-rep coaching it would be too slow. Cost: 3 iterations × ~2000 tokens per iteration = ~$0.02 per coaching event at Sonnet pricing. Affordable for personal use, expensive at scale.

The other cost: less determinism. Two runs with identical inputs may take different paths through the loop. The mitigation is a low-temperature setting (e.g., 0.2) for the coaching prompt so the model's tool-selection is more consistent.

### Sub-block 2 — what single-shot would cost

A single-shot prompt that includes *all possibly relevant data* upfront: history, progression state, recent coaching, exercise cues. The prompt would be ~5000 tokens of context per coaching event. The model couldn't decide what to look at — it always looks at everything. Latency is one round-trip (~500ms) so it's faster, but cost per call is similar (you pay for the larger prompt), and accuracy drops because the model can't actively retrieve.

### Sub-block 3 — the breakpoint

Fine until **the loop iterations exceed the budget** (cost or latency) for the use case. Coaching at end-of-set: 3 iterations OK. Coaching live during a set: even 1 iteration is too slow. The fix at the live-rep threshold is to pre-compute candidate coaching messages offline and dispatch a lookup-style "which message?" at runtime.

### Sub-block 4 — what isn't a tradeoff

A fine-tuned model that emits coaching directly without tools wasn't a real option — the model needs current session data (just-completed reps) that no fine-tune can have. The agent loop is the only way to ground in current data.

---

## Tech reference (industry pairing)

### Bounded agent loops

- **Codebase uses:** Not yet implemented. Planned skeleton above.
- **Why it's here:** the only safe way to run a stochastic LLM in a multi-step flow.
- **Leading today:** Bounded ReAct loops — `adoption-leading` for production agents, 2026.
- **Why it leads:** survives the iteration explosion that plagued early agent attempts.
- **Runner-up:** LangGraph state machines — `innovation-leading` for complex multi-agent flows; richer than a flat loop but heavier to set up.

---

## Project exercises

### [B4C.1] Coaching agent loop

- **Exercise ID:** `[B4C.1]`
- **What to build:** The full agent loop — maxIterations 6, timeout 30s, parallel tool dispatch, structured exit conditions. Per-iteration trace logging to a local table for later debugging.
- **Why it earns its place:** the loop *is* the agent; understanding when to terminate is the senior-level signal.
- **Files to touch:** `src/services/ai/agent.ts` (new). Depends on tool dispatch from [B4C.2].
- **Done when:** an integration test with a stubbed LLM that emits 3 tool_use turns then end_turn produces the expected final message; another test caps at maxIterations and throws.
- **Estimated effort:** 1–2 days

### [B4C.3] Termination conditions documented

- **Exercise ID:** `[B4C.3]`
- **What to build:** `docs/agent-termination.md` enumerating each termination path: `end_turn` with coaching message, `end_turn` with "no coaching needed", max iterations, timeout, tool dispatch error. Each path has a defined post-condition (what the user sees, what's logged).
- **Why it earns its place:** interviews probe termination edge cases relentlessly. Having them documented turns a flailing answer into a confident one.
- **Files to touch:** `docs/agent-termination.md` (new), `src/services/ai/agent.ts` (link from comment).
- **Done when:** every code path in `agent.ts` has a corresponding section in the doc, and the unit tests cover each path.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

An agent loop is a bounded `while` loop: send messages + tools to the LLM, parse response, dispatch any tool calls, append results, repeat. Three exits: `end_turn` (model done), max iterations (external cap), wall-clock timeout. For contrl's planned Path C coaching agent, max iterations is 6 and timeout is 30s; typical coaching runs terminate in 2–3 iterations. The constraint forcing the design was the stochastic nature of LLM output — a loop without bounds is a loop that costs unbounded money. The cost is per-iteration latency.

### Key points

- An agent is a while loop with three exits.
- `end_turn` is the model's signal that it's done; everything else is external safety.
- Parallel tool dispatch cuts latency on multi-tool turns in half.
- Coaching agent typically terminates in 2–3 iterations; cap at 6 is defense.
- Bounded iteration is non-negotiable in production.

---

## Interview defense

### Likely questions

**Q: Walk me through the agent loop.  [mid]**
A: A while loop, bounded by max iterations and a wall-clock timeout. Each iteration: send the conversation + tool descriptions to the LLM; receive a response; if it's `end_turn`, return the text; if it's `tool_use`, dispatch the tool(s) in parallel, append the results as a `user`-role `tool_result` message, increment iteration counter, continue. If the loop hits max iterations or the timeout, throw. The model decides when it's done by emitting `end_turn`; the cap is the safety net.

```
   loop until end_turn or cap or timeout:
     llm.send(messages, tools)
     response.stop_reason ==
       end_turn   → return text
       tool_use   → dispatch, append tool_results, continue
     else throw
```

**Q: How do you pick maxIterations?  [senior]**
A: Empirically — measure how many iterations real production runs take, then set the cap at ~2× the 95th percentile. For a narrow agent like coaching, that's ~6 (most runs are 2–3, occasional 4–5). For a more open-ended agent (e.g., a research assistant) it might be 20+. Setting it too low means dropping legitimately-complex tasks; setting it too high means tolerating runaway loops. The honest answer is to start at 10, log iteration counts in production, adjust down once you have data.

```
   too low (e.g. 3)             │   too high (e.g. 50)
   ─────────────────────────── │ ──────────────────────────
   drops legitimate complex     │   tolerates runaway
   tasks                        │
   user sees: "agent failed"    │   user sees: "30s wait, $$$"
   right when tasks are simple  │   right when tasks are open-ended
```

**Q: What happens at 1000 concurrent agent runs?  [arch]**
A: Each run is bounded by max iterations × per-call latency. At 6 iterations × 500ms = 3s wall-clock, that's 3000 second-runs per second of compute. Each run sends ~2000 tokens; aggregate is 6M tokens/sec which exceeds Anthropic's rate limits. The fix is queue + backpressure: serialize runs, batch parallel tool dispatches across runs, and rate-limit at the queue rather than retry at the SDK. We're nowhere near this scale for contrl (single user).

```
┌─ at 1000 concurrent ─────────────────────────────────────┐
│  per-run                 6 iter × 500ms × ~2K tokens     │
│  aggregate               6M tokens/sec ←─ rate limit     │
│  fix                     queue + backpressure            │
└──────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What does the agent do if its only tool returns an empty result?**
A: It re-iterates with the empty result as context. The next assistant turn typically either (a) calls a different tool, (b) emits `end_turn` with "I don't have enough information to coach", or (c) tries the same tool with different arguments. The orchestrator doesn't make this decision — it just appends the result and loops. The behavior emerges from the prompt design. If we want a specific behavior (e.g., always fall back to a "no coaching needed" path), we add that to the system prompt.

```
   Empty tool result            │   Possible model responses
   ──────────────────────────── │ ──────────────────────────────────────
   { history: [] }              │   call get_progression_state
                                │   end_turn "no coaching needed"
                                │   call get_form_history with different args
                                │   (decided by the model, gated by prompt)
```

### One-line anchors

- Bounded while loop.
- Three exits: end_turn, iteration cap, timeout.
- The cap is the safety net; the model decides "done".
- Parallel tool dispatch cuts latency on multi-call turns.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the loop with all three exits labeled.

### Level 2 — Explain it out loud
Why is the max-iteration cap non-negotiable? Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Design a 'planning' agent that breaks a workout goal into a 4-week plan. What's the iteration cap? What's an end_turn signal?"

Reference the loop skeleton above.

### Level 4 — Defend the decision you'd change
"Would you replace the flat loop with LangGraph for the coaching agent?" When?

### Quick check — code reference test
- Is the agent loop implemented in this codebase yet?
- What's the planned max iterations?
- What's the planned timeout?

Then verify.
