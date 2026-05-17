# Tool and function calling

**Industry name(s):** Tool calling, function calling, structured tool invocation
**Type:** Industry standard

> The LLM doesn't run code; it produces a JSON object describing *which tool to call and with what arguments*. The orchestration layer parses that JSON, runs the corresponding function, and feeds the result back to the LLM in a follow-up turn. This is how an "agent" reaches outside its context window.

**See also:** → [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) · → [04-tool-routing](./04-tool-routing.md) · → [08-ml-in-the-loop-agents](./08-ml-in-the-loop-agents.md)

---

## Why care

An LLM that can only generate text is a thesaurus with a personality. An LLM that can *do things* — query a database, send an email, call your trained ML model — is something else entirely. The bridge between "generates text" and "does things" is a contract: the LLM emits a structured request, your code interprets it, your code does the work, the result goes back into the conversation.

The pattern is **tool calling** (sometimes called **function calling** — same thing, different vendor's preferred name). It belongs to the same family as RPC, REST handlers, and any "structured intent" pattern in NLU. The hard parts are: defining the tool schema, validating the LLM's output, deciding what to do when the LLM picks a tool that doesn't exist or sends bad arguments. Here's the shape of the concept and where it fits in contrl's planned coaching agent.

---

## How it works

A tool call is a contract. The agent's job is to pick the right tool and produce arguments that satisfy the schema. Your job is to expose tools, parse the call, run the function, and feed back the result.

### The tool schema

A tool is declared with three parts: name, description, and a JSON Schema for its parameters.

```typescript
const tools = [
  {
    name: 'get_form_history',
    description: 'Returns the user\'s last N sessions of a given category with form-classifier outputs.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['push', 'pull', 'squat'] },
        limit:    { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['category'],
    },
  },
  // ...more tools
];
```

The `description` is the *only* thing the LLM uses to decide whether this tool is relevant — write it like a docstring for the LLM, not for a human. The `input_schema` is the contract the model has to fill in correctly.

### A tool call response

```json
{
  "stop_reason": "tool_use",
  "content": [
    { "type": "text", "text": "Let me check the user's pushup history." },
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "get_form_history",
      "input": { "category": "push", "limit": 5 }
    }
  ]
}
```

The model can also emit text alongside the tool call. The orchestration layer:
1. Parses the response.
2. Finds the `tool_use` block.
3. Validates `input` against the schema (Zod or similar).
4. Calls the JS function `getFormHistory({ category, limit })`.
5. Wraps the result in a `tool_result` message and continues the conversation.

### The follow-up turn

```json
[
  { "role": "user", "content": "Why did I miss depth on pushups today?" },
  { "role": "assistant", "content": [ ...tool_use as above ] },
  { "role": "user", "content": [
    { "type": "tool_result", "tool_use_id": "toolu_01...",
      "content": JSON.stringify(history) }
  ]},
  // assistant's next turn now has the data and can answer
]
```

The model now has the function output in context. It uses that to produce the actual user-facing answer.

### Move 2.5 — Where this lives in contrl's planned agent

For Path C (coaching agent), the tool set will be small and specific to the workout domain. Curriculum item B4C.2 names the expected tools:

- `get_form_history(category)` — recent classifier outputs
- `get_progression_state(category)` — current level + gate state
- `get_recent_coaching()` — what the agent told the user recently (avoid repeating advice)
- `get_exercise_cues(exerciseId)` — canonical cues for a specific exercise

These are all read-only. No "execute_workout" tool because the agent shouldn't take destructive actions on the user's behalf without a confirmation step.

### Move 3 — The principle

Tool calling is how an LLM gets out of its own head. Without tools, it can only reason about what's in its context window. With tools, every database row, every trained-model prediction, every API in your system becomes part of the surface it can reason over. The pattern is universal across vendors (OpenAI, Anthropic, Google, Mistral) because it's the only way to make stochastic text generators useful in a deterministic system.

The full picture is below.

---

## Tool calling — diagram

```
┌─ Turn 1: user → assistant ────────────────────────────────────────────────────┐
│                                                                               │
│   user: "Why did I miss depth on pushups today?"                              │
│                                                                               │
│   tools advertised: [ get_form_history, get_progression_state, ... ]          │
│                                                                               │
│         │                                                                     │
│         ▼  POST to LLM with messages + tools                                  │
│                                                                               │
│   assistant response:                                                          │
│     stop_reason: 'tool_use'                                                   │
│     tool_use { name: 'get_form_history', input: {category: 'push', limit: 5} }│
│                                                                               │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  │
                  ▼  orchestrator parses tool_use, validates schema
┌─ Turn 2: orchestrator → tool function ────────────────────────────────────────┐
│                                                                               │
│   getFormHistory({ category: 'push', limit: 5 })                              │
│     → reads from local SQLite                                                 │
│     → returns [ { date, classifier_outputs, ... }, ... ]                      │
│                                                                               │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  │
                  ▼  result wrapped as tool_result message
┌─ Turn 3: assistant generates final answer ────────────────────────────────────┐
│                                                                               │
│   messages now include:                                                       │
│     user: original question                                                   │
│     assistant: tool_use                                                       │
│     user: tool_result with history JSON                                       │
│                                                                               │
│   assistant final turn:                                                       │
│     stop_reason: 'end_turn'                                                   │
│     "Looking at your last 5 pushup sessions: 3 of them show your elbow        │
│      angle stopped around 110° — try slowing the descent..."                  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C of the curriculum is the planned build. No code in contrl today uses an LLM, has a tool registry, or implements tool-calling orchestration.

Expected paths when implemented:
- `src/services/ai/tools.ts` — tool registry + schema definitions
- `src/services/ai/agent.ts` — orchestration loop (parse tool_use, validate, dispatch, wrap result)
- `src/services/ai/providers/anthropic.ts` — provider-specific call shape

The classifier outputs that feed `get_form_history` depend on Phase 2C work in [04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md) being live.

---

## Elaborate

### Where this pattern comes from

OpenAI shipped function calling in mid-2023; Anthropic followed with tool use; Google with Gemini's function calling; Mistral with tool calling. The shape converged across vendors because it's the only sensible structure: the model outputs a structured request, the orchestrator executes, the result feeds back. JSON Schema as the contract is also universal because every language has a JSON parser and most have schema validators.

### The deeper principle

LLMs are great at *deciding* what to do and terrible at *doing* it deterministically. Tool calling acknowledges this: the LLM decides; deterministic code executes. The model's stochastic output is constrained to a small set of pre-vetted actions, each of which has its own correctness guarantees. The system as a whole gets reliability without sacrificing the model's reasoning.

### Where this breaks down

When tools have side effects you can't undo. An LLM that hallucinates `delete_session('all')` will happily call it if the orchestrator obeys without confirmation. The fix is to gate destructive tools behind user confirmation, or to mark some tools as read-only and force write actions to require explicit user approval. Curriculum item B4C.5 ("failure modes documented") covers this.

The other breakpoint: when the tool count grows past ~20. The LLM's accuracy at picking the right tool degrades; latency grows because every tool's description is in the prompt. The fix is hierarchical tool routing — first call picks a category, second call picks a tool within it.

### What to explore next

- [02-agent-loop-and-termination](./02-agent-loop-and-termination.md) → how the orchestrator decides when to stop calling tools
- [04-tool-routing](./04-tool-routing.md) → when to invoke the LLM vs. invoke a tool directly
- [08-ml-in-the-loop-agents](./08-ml-in-the-loop-agents.md) → the unique contrl twist

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ LLM tool calling (taken plan)    │ LLM + free-text only (alt)       │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Reliability        │ JSON schema enforces structure   │ Free text needs custom parsing   │
│ Validation         │ Standard (Zod / JSON Schema)     │ Regex + heuristics, fragile      │
│ Discoverability    │ Model "sees" tool list           │ Model has to know tools exist     │
│ Latency            │ One extra round-trip per tool    │ Sometimes faster, less reliable   │
│ Cost               │ Tokens per tool description       │ Lower per call, more retries     │
│ Vendor lock        │ All major vendors support it     │ Custom parsing per provider      │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

The cost is *latency per tool*. Each tool call is a round-trip through the LLM API, ~300ms+. A multi-step plan (e.g., "fetch history, then check progression, then generate coaching") is 3+ round-trips, sub-second to multi-second. For contrl's planned coaching flow this is fine; for real-time interaction it would be unacceptable.

The other cost: prompt-token budget. Every tool's schema + description is in every prompt. With 4 tools at ~200 tokens each, that's 800 tokens per request — ~$2/1000 requests at current Claude Sonnet pricing.

### Sub-block 2 — what free-text-only would have cost

Without tool calling, we'd parse the LLM's free-text output to detect intent ("the user wants form history") and hand-code regex / heuristics to extract the parameters. This was the standard approach pre-2023 and is fragile: every prompt variant produces a slightly different output, every parsing rule has edge cases, and adding a new tool means writing more parsing code. Tool calling moves the parsing burden into the model.

### Sub-block 3 — the breakpoint

Fine until **the tool count grows past ~20** OR **real-time interaction becomes a feature** (e.g., live coaching during a set). At that point hierarchical routing OR direct heuristic dispatching (no LLM in the hot path) becomes necessary.

### Sub-block 4 — what isn't actually a tradeoff

Fine-tuning a custom model to emit structured outputs without tool calling was not a real option — the engineering cost of maintaining a fine-tuned model massively exceeds the cost of using a frontier model's tool-calling feature.

---

## Tech reference (industry pairing)

### Anthropic tool use

- **Codebase uses:** Not implemented yet. Planned via `@anthropic-ai/sdk` per Phase 4 design.
- **Why it's here:** the cleanest tool-calling API among major vendors as of 2026; `stop_reason: 'tool_use'` model output is unambiguous.
- **Leading today:** Anthropic tool use — `adoption-leading` for production LLM applications, 2026.
- **Why it leads:** robust tool selection accuracy on Claude 4.7+; strong default of returning structured `tool_use` blocks rather than free text.
- **Runner-up:** OpenAI function calling — `adoption-leading` alternative; same shape, slightly different protocol; equally viable.

### Zod for tool-input validation

- **Codebase uses:** Already in `package.json` for non-AI use. Planned for tool input schemas.
- **Why it's here:** the LLM-emitted `input` JSON object is untrusted; Zod's `safeParse` is the boundary check.
- **Leading today:** Zod — `adoption-leading` for TypeScript runtime validation, 2026.
- **Why it leads:** typed inference, mature, ergonomic; the de facto standard.
- **Runner-up:** ArkType — `innovation-leading` for performance-critical paths; faster but smaller ecosystem.

---

## Project exercises

### [B4C.2] Tools for coaching agent

- **Exercise ID:** `[B4C.2]`
- **What to build:** Define the tool registry for the coaching agent: `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues`. Each tool has a name, description, and input_schema (JSON Schema or Zod). The dispatcher in `src/services/ai/agent.ts` maps `tool_use.name` to the corresponding JS function.
- **Why it earns its place:** the interview signal is "I've designed an agent's tool surface". The choice of *which* tools to expose (and which not to) is the architecture decision.
- **Files to touch:** `src/services/ai/tools.ts` (new), `src/services/ai/agent.ts` (new). Depends on classifier outputs from [04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md) being available.
- **Done when:** running `pnpm test tools` validates each tool's schema; an integration test feeds a mock `tool_use` and verifies the right JS function runs with the right args.
- **Estimated effort:** 1–2 days

### [B4C.1] Coaching agent loop

- **Exercise ID:** `[B4C.1]`
- **What to build:** The orchestration loop that takes a user message, calls the LLM with tools advertised, parses `tool_use` blocks, dispatches to JS, wraps results, and continues until `stop_reason: 'end_turn'`.
- **Why it earns its place:** the loop is the agent. Understanding when to terminate, how to handle malformed tool inputs, and how to bound iteration count are the senior-level concerns.
- **Files to touch:** `src/services/ai/agent.ts` (new)
- **Done when:** an integration test runs the full flow with a stubbed LLM that emits one tool_use; the agent dispatches, gets a result, and returns the final answer.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Tool calling lets an LLM decide which JavaScript function to call and what arguments to pass; the orchestration layer executes the function and feeds the result back into the conversation. For contrl's planned coaching agent (Phase 4 Path C), tools will be read-only accessors over the local data: form history, progression state, recent coaching, exercise cues. The constraint forcing this design is the LLM's stochastic output — structured tool calls give the surrounding deterministic system a contract to validate against. The cost is per-tool latency (one round-trip each) and prompt-token budget for tool schemas.

### Key points

- The LLM emits a JSON object naming a tool and its args; deterministic code executes it.
- Tool descriptions are docstrings for the model — write them to be picked correctly.
- Read-only tools are safe by default; write tools need explicit user confirmation.
- Tool count past ~20 starts to degrade selection accuracy; hierarchical routing is the fix.
- Schemas are the contract — validate every LLM-emitted `input` before dispatch.

---

## Interview defense

### What an interviewer is really asking

Behind "explain tool calling" is "do you understand the boundary between LLM-decided and code-executed, and have you thought about what happens when that boundary is wrong?" The signal is whether you can name validation, malformed-input handling, and the read-only-by-default principle.

### Likely questions

**Q: What's tool calling in one sentence?  [mid]**
A: It's how an LLM tells your code "call this function with these arguments" — the model emits a structured JSON object naming a tool and its input parameters, your orchestrator validates the input, runs the corresponding function, and feeds the result back into the conversation so the model can incorporate it into its next response.

```
   LLM produces      →   orchestrator validates   →   JS runs   →   result back to LLM
   {name, input}         (schema check)              tool fn        (continues turn)
```

**Q: What if the LLM emits bad arguments?  [senior]**
A: Validate every `input` with Zod or JSON Schema before dispatch. If validation fails, you have two options: (a) return an error to the LLM as a `tool_result` and let it try again (often it self-corrects on the next turn), or (b) abort the agent loop and surface the error to the user. Path C's planned default is (a) for argument errors and (b) for repeated failures — see B4C.5 in the curriculum.

```
   LLM tool_use         ┐
        │                ├── valid input?  ── no ──► error in tool_result ──► next LLM turn
        ▼                │
   Zod.safeParse(input) ─┘── valid ──► dispatch JS function ──► result ──► next LLM turn
```

**Q: How does the tool count affect latency and cost?  [arch]**
A: Every tool's description and schema goes into every prompt. At ~200 tokens per tool, 4 tools is ~800 tokens of overhead per request — small. At 50 tools it's ~10K tokens, which costs $.03/request at Sonnet pricing and adds 100–200ms of TTFT (time to first token). The fix at scale is hierarchical routing: a top-level tool `find_tool(intent)` that returns the name of the actual tool to call. Trade: more round-trips, fewer per-prompt tokens.

```
┌─ at 50 tools ──────────────────────────────────────────────┐
│  prompt overhead     ~10K tokens                           │
│  cost per request    ~$0.03                                │
│  TTFT                +100–200ms                            │
│  fix: hierarchical routing or fine-tuned tool-picker model │
└────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: Why not let the LLM call tools directly, no validation, since you trust the model?**
A: Because the LLM is stochastic. Even Claude 4.7 occasionally hallucinates field names that don't exist or types that don't match. Without validation, a malformed input crashes the dispatch or — worse — silently produces wrong behavior. Schemas turn "LLM might be wrong" into "LLM was wrong; let it try again with feedback". The validation is *not* defensive programming against malice; it's defensive programming against the model's own occasional confusion.

```
   No validation               │   With Zod validation
   ──────────────────────────  │   ──────────────────────────
   tool_use input → run fn     │   tool_use input → Zod check
   bad arg → crash             │   bad arg → tool_result error
   wrong type → silent bug     │   wrong type → caught
```

### One-line anchors

- The model decides; deterministic code executes.
- The schema is the contract.
- Read-only by default; write needs confirmation.
- Validate every input — the model is fallible.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the 3-turn flow: user → assistant (tool_use) → tool_result → assistant (final).

### Level 2 — Explain it out loud
Explain to a backend engineer who's never used an LLM. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Design tools for an agent that helps the user schedule rest days. What tools would you expose? Which would be read-only vs. write?"

Reference the planned tools in B4C.2.

### Level 4 — Defend the decision you'd change
"Would you use OpenAI function calling instead of Anthropic tool use?" Walk through the cost-benefit table.

### Quick check — code reference test
- Is tool calling implemented in this codebase yet?
- What's the curriculum ID for the planned tool design?
- What library is planned for input validation?

Then verify against the curriculum file.
