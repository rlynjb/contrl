# Error recovery in agents

**Industry name(s):** Agent error recovery, tool failure handling, graceful degradation
**Type:** Industry standard

> Tools fail: the DB query throws, the schema mismatch happens, the model emits malformed input. The agent has to decide whether to retry the tool, try a different tool, or give up gracefully. Failure modes are part of the agent design, not an afterthought.

**See also:** → [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) · → [01-tool-and-function-calling](./01-tool-and-function-calling.md) · → [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)

---

## Why care

In normal code, an unhandled exception bubbles up and the program dies. In an agent loop, an unhandled exception could be silent (the model never sees it) or catastrophic (the model loops trying the same broken tool). Recovery isn't a side concern; it's load-bearing. Without it, your agent is exactly as reliable as your shakiest dependency.

The pattern is **graceful tool failure with feedback** — when a tool fails, surface a structured error to the model and let it try again or give up. Same shape as well-designed REST APIs (4xx errors with structured bodies the client can interpret).

---

## How it works

Three failure modes, three recovery paths.

### Failure mode 1 — Tool throws

Most common: the database is locked, a row doesn't exist, an unexpected null. Wrap the dispatch in try/catch; return an error `tool_result` instead of letting the throw escape.

```typescript
try {
  const result = await dispatch(b.name, b.input);
  return { tool_use_id: b.id, content: JSON.stringify(result), is_error: false };
} catch (err) {
  return {
    tool_use_id: b.id,
    content: `Error: ${err instanceof Error ? err.message : String(err)}`,
    is_error: true,
  };
}
```

The model now sees the error message in the next turn's context. Typically it either:
1. Tries a different tool (smart recovery).
2. Apologizes and asks the user for more info (graceful degradation).
3. Loops trying the same broken tool (need iteration cap to escape).

### Failure mode 2 — Schema validation fails

The model emits `input` that doesn't match the tool's schema. Same pattern: validate before dispatch, return a structured error if validation fails.

```typescript
const parsed = toolSchemas[b.name].safeParse(b.input);
if (!parsed.success) {
  return {
    tool_use_id: b.id,
    content: `Invalid input: ${parsed.error.message}`,
    is_error: true,
  };
}
const result = await dispatch(b.name, parsed.data);
```

This often self-corrects on the next turn — the model reads its own validation error and emits cleaner input.

### Failure mode 3 — Provider call fails

The LLM API returns 5xx, 429, or times out. Handled at the outer agent loop with the same retry-with-backoff pattern as [01-system-design/08-rate-limiting-and-backoff](../01-system-design/08-rate-limiting-and-backoff.md). After N retries, throw out to the caller — the user sees "coaching unavailable, try again later".

### Move 2.5 — What contrl-mo's planned failures look like (B4C.5)

Curriculum item B4C.5 names three specific failure modes for the coaching agent:

| Failure | Cause | Recovery |
|---|---|---|
| Stale form data | Classifier model deprecated, outputs unparseable | Tool returns error; agent apologizes |
| Contradictory cues | Different exercise cues conflict | Agent picks the "most recent" cue or asks user |
| Coaching fatigue | User has dismissed same coaching 3× | Heuristic check before dispatch (don't run agent) |

The "coaching fatigue" check belongs in [04-tool-routing](./04-tool-routing.md) — outer gate — but the other two are inner-loop failures.

### Move 3 — The principle

Recovery is a contract. The orchestrator promises the model: "if a tool fails, you'll see why, and you can decide what to do next". This pushes intelligence to the model (which can reason about the failure) and keeps the orchestrator's role narrow (translate failures to structured feedback). Without this contract, agents become brittle.

The full picture is below.

---

## Error recovery — diagram

```
┌─ Agent loop iteration ───────────────────────────────────────────────────────┐
│                                                                              │
│   tool_use parsed                                                            │
│      │                                                                       │
│      ▼                                                                       │
│   schema.safeParse(input)                                                    │
│      │                                                                       │
│      ├── invalid ──► tool_result { is_error: true, content: "Invalid: ..." } │
│      │                continue loop (model may self-correct)                 │
│      │                                                                       │
│      └── valid ──► try { dispatch(...) }                                     │
│                       │                                                      │
│                       ├── success ──► tool_result { is_error: false, ... }   │
│                       │                                                      │
│                       └── throws ──► tool_result { is_error: true,           │
│                                                    content: "Error: ..." }   │
│                                                                              │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
                        next LLM turn
                                │
                                ├── another tool_use (often a different tool)
                                ├── end_turn ("can't complete the request because...")
                                └── repeats same broken tool → iteration cap catches
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C.

Expected paths:
- `src/services/ai/agent.ts` (new) — try/catch around `dispatch`
- `src/services/ai/tools.ts` (new) — Zod schemas for inputs
- Provider-level retry (5xx, 429) — pattern from [01-system-design/08-rate-limiting-and-backoff](../01-system-design/08-rate-limiting-and-backoff.md) applied to LLM calls

---

## Elaborate

### Where this pattern comes from

Structured error feedback to LLMs was formalized by Anthropic's tool-use guidelines (2024). The `is_error: true` field in `tool_result` is the protocol's escape hatch — it tells the model "this didn't work, here's why". Before this protocol, error handling was ad hoc: each agent framework had its own way of telling the model that things had failed.

### The deeper principle

Failure is a first-class signal. Treating exceptions as silent failures (catch + ignore) makes agents flaky in ways that are hard to debug. Treating them as feedback to the model makes the agent's resilience emerge from the model's reasoning — which works because the model is *good* at "given an error message, figure out what else to try".

### Where this breaks down

When the model loops on the same broken tool. If `get_form_history` throws every time (e.g., the DB is corrupted), the model might keep calling it. The iteration cap catches this, but the iteration cap is a blunt instrument — the user sees "agent timed out" with no useful diagnostics. A subtler fix: track which tools have failed in this run, and surface that in a system-prompt addendum on retries.

The other breakpoint: when a tool succeeds *silently incorrectly*. The model doesn't know the result is wrong; it uses the wrong data. No recovery possible from the agent layer; needs upstream data quality checks.

### What to explore next

- [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) → the loop that catches runaway-retry loops
- [01-system-design/08-rate-limiting-and-backoff](../01-system-design/08-rate-limiting-and-backoff.md) → provider-level retry pattern

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Surface errors to model (taken)  │ Hide errors / throw silently     │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Reliability        │ Model can self-recover           │ Agent dies on first failure      │
│ Debugging          │ Errors visible in trace          │ Silent failures, hard to debug   │
│ Loop safety        │ Needs iteration cap              │ Same (or worse)                  │
│ Per-iter cost      │ Includes error message in prompt │ Slightly lower (no err in prompt)│
│ Hallucination risk │ Model sees real error            │ Model invents plausible failure  │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Error messages take prompt tokens. A 200-char error message is ~50 tokens — not free but bounded.

The other cost: occasionally the model misreads the error and tries a worse path. Rare with frontier models; would be more common with smaller ones.

### Sub-block 2 — what hiding errors would cost

A `try/catch` that swallows the error and returns an empty `{}` would put the model in "I got data" mode when it didn't. The model would coach based on `{}` and produce confidently-wrong output. Much worse than surfacing the error.

### Sub-block 3 — the breakpoint

Fine until error rates climb past a few percent per agent run. If 10% of coaching runs hit errors, the user-facing reliability drops below acceptable; the fix is upstream (make the underlying tools more robust) not in the agent.

### Sub-block 4 — what isn't a tradeoff

A retry-with-backoff *inside* the tool dispatch wasn't picked because the model's next-turn decision is usually better than a blind retry. Retries happen at the provider level (5xx, 429) where the failure is genuinely transient.

---

## Tech reference (industry pairing)

### Structured error feedback

- **Codebase uses:** Not yet implemented. Planned via `is_error: true` field on `tool_result` blocks.
- **Why it's here:** the protocol-level mechanism to tell the model "this didn't work".
- **Leading today:** Anthropic / OpenAI / Google all support structured tool errors — `adoption-leading`, 2026.
- **Why it leads:** native to every major tool-calling protocol; no abstraction needed.
- **Runner-up:** Custom error encoding in `content` (e.g., `"ERROR: ..."`) — works but less reliable; the model has to parse the convention.

---

## Project exercises

### [B4C.5] Failure modes documented + handled

- **Exercise ID:** `[B4C.5]`
- **What to build:** `docs/agent-failure-modes.md` enumerating the three named failures (stale form data, contradictory cues, coaching fatigue) plus the catch-all (any thrown error from a tool). For each: cause, detection point, recovery path. Wire the `try/catch` + Zod validation pattern into `src/services/ai/agent.ts`.
- **Why it earns its place:** interviews probe failure modes hard. A documented enumeration with code links is the difference between "I thought about it" and "I implemented it".
- **Files to touch:** `src/services/ai/agent.ts` (new), `docs/agent-failure-modes.md` (new).
- **Done when:** integration tests cover each failure path; the doc enumerates them with file-and-line references.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

When a tool throws, the orchestrator catches and returns a structured error in `tool_result` with `is_error: true`. The next LLM turn sees the error and decides what to do — usually try a different tool, sometimes give up gracefully. Schema validation failures follow the same pattern. Provider-level errors (429, 5xx) are handled with retry+backoff outside the agent loop. The constraint forcing this design was the model's stochastic nature paired with brittle downstream tools — without feedback, agents stop being useful on the first hiccup. The cost is per-iteration prompt tokens for error messages.

### Key points

- Errors flow back to the model as feedback, not as silent failures.
- Schema validation catches malformed `input` before dispatch.
- Provider-level retries handle transient API errors.
- Iteration cap is the safety net against retry-loops on the same broken tool.

---

## Interview defense

### Likely questions

**Q: What happens when a tool throws?  [mid]**
A: The orchestrator catches the exception, wraps the error message into a `tool_result` with `is_error: true`, and includes it in the next turn's context. The model reads the error and decides: try a different tool, change arguments, or end the turn with a graceful "I couldn't complete this". The iteration cap protects against the model just retrying the broken tool forever.

**Q: Why surface errors instead of retrying silently?  [senior]**
A: Silent retries assume the failure is transient. If the failure is permanent (DB locked, schema mismatch), silent retries just delay the inevitable. Surfacing the error to the model lets it adapt: pick a different tool, explain to the user, or abort with context. The model is better at "given this error, what's the next step?" than a hand-coded retry policy would be.

**Q: At 10% error rate per tool, where does this break?  [arch]**
A: With 6 max iterations and 10% per-tool error rate, the per-run failure rate is roughly `1 - (1 - 0.1)^6 ≈ 47%` chance the agent hits *some* error in a run. The agent usually recovers, but UX degrades — each error adds a round-trip. The fix at this rate is upstream: improve tool reliability rather than handle errors more cleverly.

### One-line anchors

- Errors are feedback, not failures.
- Validate input; catch exceptions; surface both.
- Iteration cap protects against retry loops.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the three failure paths and their recovery.

### Level 2 — Explain it out loud
Why surface errors to the model? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"A tool returns valid data but the data is *contradictory*. What does the agent do?"

Reference B4C.5's "contradictory cues" failure mode.

### Level 4 — Defend the decision you'd change
"Would you retry tools transparently?" When?

### Quick check — code reference test
- Where do tool errors get wrapped?
- What's the `is_error` field for?
- What's the planned doc file for failure modes?

Then verify.
