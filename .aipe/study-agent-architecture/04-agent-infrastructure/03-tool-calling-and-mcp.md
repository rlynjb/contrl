# Tool calling and MCP

**Industry name(s):** Tool calling · Function calling · Model Context Protocol (MCP) · Tool registry
**Type:** Industry standard

> Tool calling is the substrate every agent pattern runs on. ReAct, agentic RAG, supervisor-worker — all of them are loops over tool calls. MCP (Model Context Protocol) standardizes how agents connect to tools and data so a tool defined once is usable across agents without per-agent integration. **For contrl, tools are direct definitions in the agent runtime (not MCP-served)** — the registry is small and lives next to the agent.

**See also:** → mechanics: [`.aipe/study-ai-engineering/04-agents-and-tool-use/02-tool-calling.md`](../../study-ai-engineering/04-agents-and-tool-use/02-tool-calling.md) · → [01-reasoning-patterns/02-react.md](../01-reasoning-patterns/02-react.md)

---

## Why care

**Move 1.** Every agent pattern in the previous sections — ReAct, agentic RAG, supervisor-worker, debate — runs on the same substrate: the model calls a tool, your code runs the tool, the model observes the result. Without tool calling there are no agents. With it, every pattern is some variation on "what tools, in what order, with what context."

**Move 2.** That "what does the model actually have to work with" question is what the tool registry answers. Not how the agent reasons. Just: what can the agent do, expressed as a typed schema.

**Why it matters: tool design is agent design.** The set of tools available to an agent determines what it can do. Designing the tool registry well — minimal, typed, side-effect-bounded — is the most leveraged work in shipping a production agent.

**Move 5.** Tool calling is to agents what the standard library is to a language: the surface area of what's reachable without writing more code.

---

## How it works

### Move 1 — The mental model

```
┌─ The tool call cycle ────────────────────────────────────────────────────────────┐
│                                                                                  │
│  Agent context includes tools: [                                                 │
│    { name: 'get_classifier_output', schema: {...}, description: '...' },         │
│    { name: 'get_form_history',      schema: {...}, description: '...' },         │
│    ...                                                                            │
│  ]                                                                                │
│                                                                                  │
│  Model emits:                                                                    │
│    tool_use {                                                                    │
│      name: 'get_form_history',                                                   │
│      input: { exercise: 'pushup', window: 5 }                                    │
│    }                                                                              │
│                                                                                  │
│  Your runner code:                                                               │
│    - validates the input matches the schema                                       │
│    - calls the actual function                                                    │
│    - returns the result                                                           │
│                                                                                  │
│  Feeds back:                                                                     │
│    tool_result {                                                                 │
│      tool_use_id: ...,                                                           │
│      content: [{ ... }]                                                          │
│    }                                                                              │
│                                                                                  │
│  Model decides: call another tool, or emit final answer                          │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** the tool registry is a typed API contract between the model and your code. The model proposes calls; your code runs them; the model observes results. Repeat until done.

### Move 2 — Tool design principles

Three design choices determine how well an agent can use the registry:

```
1. MINIMAL — fewer tools, each doing one thing
   ──────────────────────────────────────────
   contrl: 5 tools, each a single typed query.
   bad: 1 mega-tool that "does everything" with a free-form query.
   
   why: small surface = easier for the model to choose well; easier
   to evaluate; easier to debug.


2. TYPED — schemas, not free-form
   ──────────────────────────────
   contrl: each tool has Zod input + output schemas.
   bad: tools that accept and return free-form strings.
   
   why: typed I/O catches malformed calls; the schema doubles as
   documentation; failures are visible at the boundary.


3. SIDE-EFFECT-BOUNDED — read-only by default
   ──────────────────────────────────────────
   contrl: all 5 tools are read-only.
   bad: tools that write to the database, send emails, call APIs.
   
   why: read-only tools bound the blast radius of prompt injection.
   Write tools force the full four-layer injection defense and
   human approval gates.
```

### Move 3 — The principle

The tool registry IS the agent's capability boundary. A model with one bad tool can do harm; a model with five carefully-typed read-only tools is bounded. **Design the registry first, then design the agent.** The agent inherits its capabilities from the registry.

---

## Tool calling — diagram

```
┌─ contrl's planned tool registry (5 read-only tools) ─────────────────────────────────┐
│                                                                                      │
│   ┌────────────────────────────────────────────────────────────────────────────┐    │
│   │ get_classifier_output(set_id: string)                                       │    │
│   │   → { label: 'clean'|'form-drift'|..., confidence: number, features: ... } │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│   ┌────────────────────────────────────────────────────────────────────────────┐    │
│   │ get_form_history(exercise: string, window: int)                              │    │
│   │   → SessionSummary[]  (last N sessions for this exercise)                   │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│   ┌────────────────────────────────────────────────────────────────────────────┐    │
│   │ get_progression_state(category: 'push'|'pull'|'squat')                       │    │
│   │   → { level: int, consecutivePasses: 0|1|2, lastSessionDate: ISO }          │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│   ┌────────────────────────────────────────────────────────────────────────────┐    │
│   │ get_recent_coaching(window: int)                                             │    │
│   │   → CoachingMessage[]  (last N coaching messages, for de-duplication)        │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│   ┌────────────────────────────────────────────────────────────────────────────┐    │
│   │ get_exercise_cues(exercise: string, level: int)                              │    │
│   │   → { keyCues: string[], commonErrors: string[] }                            │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│   All tools: read-only, typed I/O, bounded return size, no side effects.            │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Move 2 — MCP

Model Context Protocol (released by Anthropic in 2024) standardizes how agents connect to tools and data. Instead of defining tools inline per agent, you define a tool once on an MCP server and any compatible agent can use it.

```
Without MCP:               With MCP:
─────────────              ──────────
agent A defines tool X      MCP server defines tool X
agent B defines tool X      agent A connects to MCP, uses X
agent C defines tool X      agent B connects to MCP, uses X
(N agents × M tools)        agent C connects to MCP, uses X
                            (M tools, N consumers)
```

MCP earns its place at scale (many agents, many tools, cross-team reuse). For a one-agent codebase with five tools (contrl), MCP is overhead — direct definitions in the runner code are simpler.

---

## In this codebase

**Case B planned — five read-only tools, defined directly in the runtime.**

The planned coaching agent has five tools, all read-only, all typed, all with bounded return sizes. The registry lives in `src/lib/agent/tools/`:

- `tools/getClassifierOutput.ts` — queries the planned `classifier_outputs` SQLite table for the current set
- `tools/getFormHistory.ts` — queries sessions for recent history per exercise
- `tools/getProgressionState.ts` — queries `gate_progress` and user level
- `tools/getRecentCoaching.ts` — queries the planned `coaching_messages` SQLite table
- `tools/getExerciseCues.ts` — queries the exercises seed data for per-exercise cues

Each tool exports a Zod input schema and a Zod output schema. The runner validates both ends.

**No MCP.** Five tools in one codebase is too small to justify the MCP server overhead. If the agent surface ever grew to multiple agents sharing a registry — or if contrl's tools became reusable across other projects — MCP would earn its place.

---

## Elaborate

**Where this pattern comes from.** Function calling shipped with GPT-4 in mid-2023; Anthropic's `tool_use` followed shortly after. MCP launched in late 2024 to standardize cross-agent tool reuse. By 2026, tool calling is the substrate every agent runs on.

**The deeper principle.** Tools are an extension of the model's capabilities into the engineer's controlled environment. The model "knows things" inside its training; tools let it "do things" outside. Designing the boundary between the two — what the model decides vs what your code controls — is where production agents earn or lose their reliability.

**Where this breaks down.** When tools are too generic (a "do anything" tool that takes a free-form query) or too specific (50 tiny tools that the model can't choose well from). Both extremes hurt the model's ability to pick the right call. Aim for 3-15 tools, each doing one named thing.

**What to explore next.** [`.aipe/study-ai-engineering/04-agents-and-tool-use/02-tool-calling.md`](../../study-ai-engineering/04-agents-and-tool-use/02-tool-calling.md) for the per-call mechanics.

---

## Tradeoffs

```
┌────────────────────┬─────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Direct tool definitions         │ MCP-served tools                 │
├────────────────────┼─────────────────────────────────┼──────────────────────────────────┤
│ Setup overhead     │ low (define inline)             │ medium (server + protocol)       │
│ Cross-agent reuse  │ none                            │ first-class                      │
│ Type safety        │ direct (Zod in code)            │ indirect (MCP schemas)           │
│ Debugging          │ trace into runner code          │ trace through MCP server         │
│ Earns its place at │ N=1 agent                       │ N≥3 agents or cross-team         │
└────────────────────┴─────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Direct tool definitions until you have 3+ agents sharing a registry or cross-team tool reuse. Then MCP. For contrl, direct definitions are the right call indefinitely (the agent surface is one agent, planned to stay one agent).

---

## Tech reference (industry pairing)

### Anthropic `tool_use` schema

- **Codebase uses:** planned. Each tool's Zod schema converts to JSON Schema and passes to `messages.create({ tools: [...] })`.
- **Why it's here:** the API surface that makes typed tool calling mechanical.
- **Leading today:** Anthropic tool_use — adoption-leading for typed agent tools, 2026.

### Zod for tool input/output validation

- **Codebase uses:** planned for `src/lib/agent/tools/*.ts`. Each tool exports `inputSchema` and `outputSchema`.
- **Why it's here:** TypeScript-first typed validation; converts cleanly to JSON Schema for the model.
- **Leading today:** Zod — adoption-leading for TypeScript schema validation, 2026.

---

## Summary

### Concept recap

Tool calling is the substrate every agent runs on. Design the registry first, then design the agent — the registry IS the capability boundary. Three principles: minimal, typed, side-effect-bounded. contrl's planned agent has 5 read-only tools, defined directly in `src/lib/agent/tools/`, with Zod schemas at both ends. No MCP (one-agent codebase; MCP earns its place at 3+ agents).

### Key points

- Tool design is agent design.
- Minimal + typed + side-effect-bounded.
- Read-only tools bound the blast radius of prompt injection.
- MCP at scale; direct definitions for small agent counts.

---

## Interview defense

### Likely questions

**[mid] How do tools work in agent systems?**

The agent's prompt includes a list of available tools with typed schemas. The model emits a tool_use block; your code runs the tool and feeds back tool_result; the model decides whether to call another tool or stop. The loop runs until the model emits a final answer.

**[senior] What's the principle behind contrl's tool registry?**

Five tools, all read-only, all typed, bounded return sizes. The read-only choice is the load-bearing one — it bounds the blast radius of prompt injection. If a malicious workout note made it into the context, the worst case is a wrong coaching message, not data corruption.

**[arch] When does MCP earn its place?**

At scale — multiple agents sharing tools, cross-team reuse, or third-party tool ecosystems. For a one-agent codebase with five tools, MCP is overhead. Direct definitions in the runner are simpler.

### One-line anchors

- "Tool design is agent design."
- "The registry IS the capability boundary."
- "Read-only tools bound the blast radius of prompt injection."

---

## Validate

**Level 1 — Reconstruct the diagram.** The tool_use ↔ tool_result cycle.

**Level 2 — Explain in 60s.** Why are contrl's tools read-only?

**Level 3 — Apply.** A teammate wants to add a `delete_session` tool to the agent. Walk through what changes (defenses, injection surface, eval surface).

**Quick check.**
- How many tools does contrl plan? — 5, all read-only.
- What's the side-effect rule? — Read-only by default; write tools force the full defense stack.
- Does contrl use MCP? — No; direct definitions in `src/lib/agent/tools/`.
