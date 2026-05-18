# Agent memory

**Industry name(s):** Short-term and long-term memory, conversation memory + external retrieval
**Type:** Industry standard

> Short-term memory is the conversation window (the messages array fed to the LLM each turn). Long-term memory is everything outside that — past sessions, prior coaching, user-specific patterns — retrieved on demand via tools.

**See also:** → [01-tool-and-function-calling](./01-tool-and-function-calling.md) · → [02-agent-loop-and-termination](./02-agent-loop-and-termination.md)

---

## Why care

An LLM forgets everything between API calls. The "memory" you see in chat apps is a trick: the entire conversation history is replayed on every turn. That works until your conversation is bigger than the context window, or until you want the agent to recall facts from sessions that happened weeks ago. At that point you need *two* memory systems — one for now, one for then.

The pattern is **two-tier memory** — short-term (in the prompt) and long-term (retrieved on demand). Same shape as React's `useState` (local) vs. a database query (persistent). The hard part is deciding what belongs in which tier and *when* to retrieve.

---

## How it works

Short-term memory is free; long-term memory has retrieval cost. The agent's job is to keep the short-term window focused and pull from long-term only when needed.

### Short-term memory — the conversation array

Every LLM call's `messages` array is the short-term memory. Each turn appends to it. For the coaching agent, it looks like:

```typescript
messages = [
  { role: 'system',    content: '<system prompt with role + tools described>' },
  { role: 'user',      content: '<trigger event: form classifier output for set just finished>' },
  { role: 'assistant', content: [ { type: 'tool_use', name: 'get_form_history', ... } ] },
  { role: 'user',      content: [ { type: 'tool_result', content: '<JSON history>' } ] },
  { role: 'assistant', content: '<final coaching text>' },
];
```

The model "remembers" everything in this array. It does not remember anything outside.

### Long-term memory — accessed via tools

Long-term facts live in:
- SQLite tables (sessions, gates, weeks, classifier outputs once Phase 2C ships)
- Supabase (sessions, exercises, gate_progress, week_progress, user_profile)
- Local files (e.g., recent coaching log)

The agent retrieves these via tool calls: `get_form_history(category)`, `get_recent_coaching()`, etc. The retrieved data becomes part of short-term memory for the duration of the conversation.

### When to retrieve vs. when to include eagerly

Two strategies:

1. **Pre-load (eager).** Include everything potentially relevant in the system prompt or first user message. Pros: no extra round-trip. Cons: bloats the context, costs tokens, the model can't decide which parts matter.

2. **Retrieve (lazy).** Let the agent call tools as needed. Pros: minimal token cost on simple cases. Cons: extra latency per retrieval.

The coaching agent uses lazy retrieval for most data because: the user's form history might be 50 sessions deep, and pre-loading all of it on every coaching event would waste tokens.

### Move 2.5 — Conversation persistence

Between two distinct coaching events (end-of-set #1, end-of-set #2 in the same workout), should the agent remember the prior coaching? Yes — but not by keeping the messages array alive across events. Instead, the *next* coaching event's tool `get_recent_coaching()` retrieves the prior coaching from the local log. This gives the same effect with cleaner boundaries: each agent run starts fresh; persistence is in the database.

### Move 3 — The principle

Two memory tiers are non-negotiable for any agent past hello-world. Pretending one tier is enough either bloats the prompt (eager-everything) or makes the agent stateless (no retrieval at all). The right design picks the boundary deliberately: what belongs in the prompt every time, what gets fetched on demand, and how the boundary changes as the agent's needs evolve.

The full picture is below.

---

## Memory tiers — diagram

```
┌─ Short-term (in the prompt) ──────────────────────────────────────────────────┐
│                                                                               │
│   system prompt: role, available tools, conventions                           │
│   user 1:        trigger event (this set's classifier outputs)                │
│   assistant 1:   thinking + tool_use(get_form_history)                        │
│   user 2:        tool_result with last 5 sessions' classifier outputs         │
│   assistant 2:   final coaching string                                        │
│                                                                               │
│   ────────────────────────────────────────────────────────────────────────   │
│   Lives only for this agent run; discarded when run ends.                     │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┬─┘
                                                                              │
                                                                              │ tool call
                                                                              ▼
┌─ Long-term (retrieved via tools) ─────────────────────────────────────────────┐
│                                                                               │
│   sessions table             (every workout, all time)                        │
│   classifier outputs         (Phase 2C — per-rep form labels)                 │
│   recent_coaching log        (what we said in last N coaching events)         │
│   user preferences           (settings, locks)                                │
│                                                                               │
│   ────────────────────────────────────────────────────────────────────────   │
│   Persists across agent runs; queried on demand via tool calls.               │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C is the planned build.

Long-term memory infrastructure already exists in the codebase as the SQLite layer (see [01-system-design/02-sqlite-as-source-of-truth](../01-system-design/02-sqlite-as-source-of-truth.md)). The new pieces are:
- `coaching_log` table (new) — what we said when, to whom
- `classifier_outputs` table (new — Phase 2C dependency)
- Tools in `src/services/ai/tools.ts` (new) that surface this data

Short-term memory is just the in-memory `messages` array in `src/services/ai/agent.ts` (new).

---

## Elaborate

### Where this pattern comes from

The two-tier memory split was formalized in the LangChain memory abstractions (2023) but it predates that — every chatbot since ELIZA distinguishes "what's in the conversation" from "what's in the lookup database". The LLM-specific twist is that "what's in the conversation" is bounded by the model's context window, so the boundary has hard physical limits.

### The deeper principle

Context is expensive (tokens cost money + latency) and finite (window size). Memory is a *budgeting problem*. Eagerly loading everything is naive; retrieving everything is slow. The middle ground is: load the minimum useful set eagerly, retrieve the rest on demand, and trust the model to decide when retrieval is worth it.

### Where this breaks down

When the conversation needs to track facts that span multiple agent runs but aren't naturally stored anywhere. Example: "the user said yesterday they were sore in the shoulder; today they ask about pull-ups". The shoulder-soreness mention wasn't recorded in any structured table; the agent doesn't know. The fix is either (a) record everything the user says in a free-text "user notes" table, (b) summarize each conversation into a fact list, or (c) just accept that the agent forgets between runs.

### What to explore next

- [01-tool-and-function-calling](./01-tool-and-function-calling.md) → how retrieval happens
- [07-building-effective-agents-patterns](./07-building-effective-agents-patterns.md) → Anthropic's memory recommendations

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Two-tier with lazy retrieval     │ Eager preload everything (alt)   │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Tokens per run     │ Minimal until tool fires         │ Always large                     │
│ Latency            │ Higher per tool call             │ One round-trip                    │
│ Model attention    │ Focused on retrieved data        │ Diluted across all data           │
│ Cost predictabilty │ Variable per run                 │ Predictable + high                │
│ Cross-run memory   │ Tool fetches from DB             │ Same                              │
│ Failure recovery   │ Tool errors handled per call     │ One-shot fail                     │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Per-coaching latency grows with retrieval count. 2–3 tool calls × ~500ms each is 1–1.5s before the model can produce coaching. For end-of-set coaching this is fine; for live-rep coaching unacceptable.

The other cost: the model has to *decide* to retrieve. If it doesn't think it needs form history (when it actually does), it'll produce coaching that ignores the history. Prompt engineering mitigates this but not perfectly.

### Sub-block 2 — what eager preload would cost

Pre-loading the last 5 sessions of form classifier outputs is ~1500 tokens. Pre-loading per coaching event = 1500 tokens of overhead even on simple cases where the agent doesn't need that data. Across many coaching events the cost compounds. Worse: the model's attention gets diluted; it might over-weight irrelevant history.

### Sub-block 3 — the breakpoint

Fine until the long-term memory grows past what a tool can return in one call. Currently the tool returns the last 5 sessions; at 50 sessions per workout × 50 workouts that's ~2500 entries, no good for in-prompt retrieval. The fix is an embedding-based "find relevant past coaching" retrieval — essentially a RAG layer (which is loopd's primary curriculum item, not contrl's).

### Sub-block 4 — what isn't a tradeoff

A vector-store-based long-term memory for contrl wasn't picked because the data is already structured (rows in SQLite with clear keys). RAG earns its place when you have unstructured text you can't address by key; here we have classifier outputs you can query by date and category.

---

## Tech reference (industry pairing)

### SQLite as long-term memory store

- **Codebase uses:** Already-existing SQLite layer; planned new tables for coaching log + classifier outputs.
- **Why it's here:** structured queries by composite key are the right shape; embeddings would be overkill.
- **Leading today:** SQLite for agent long-term memory in mobile apps — `adoption-leading`, 2026.
- **Why it leads:** ACID, indexed queries, zero infrastructure on-device.
- **Runner-up:** sqlite-vec (vector ext) — `innovation-leading` if semantic memory becomes a feature.

---

## Project exercises

### [B4C.1 + B4C.2] Memory wired into tools

- **Exercise ID:** `[B4C.1]` and `[B4C.2]` jointly
- **What to build:** The schema for `coaching_log` table + `get_recent_coaching()` tool that reads from it. After each coaching event, append a row.
- **Why it earns its place:** demonstrates the long-term-memory loop — the agent's output becomes input to a future agent's tool call.
- **Files to touch:** `src/services/database.ts` (new migration + accessors), `src/services/ai/tools.ts` (new tool), `src/services/ai/agent.ts` (log after each successful run).
- **Done when:** integration test: run agent twice, second run's `get_recent_coaching` returns the first run's output.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

The coaching agent's short-term memory is the messages array; long-term memory is everything in SQLite that gets retrieved via tools. Each new agent run starts with a fresh messages array; persistence between runs lives in the database. The constraint forcing this design was the LLM's stateless API and the bounded context window. The cost is per-tool-call latency and the requirement that the model decide to retrieve.

### Key points

- Short-term memory = the messages array in the current agent run.
- Long-term memory = SQLite rows fetched via tool calls.
- Each agent run starts fresh; persistence is in the DB.
- The boundary is a budgeting decision: tokens cost money, retrieval costs latency.

---

## Interview defense

### Likely questions

**Q: How does the agent "remember" between runs?  [mid]**
A: It doesn't — its messages array is discarded at run end. The illusion of memory comes from tools that read from a persistent log. `get_recent_coaching()` returns what was said in prior runs; after each run the orchestrator appends the new coaching to the log. So the next run has access to the prior, but only on demand.

**Q: Why not preload everything into the system prompt?  [senior]**
A: Tokens cost money and attention dilutes. A prompt with 5KB of session history makes every call expensive even when the model wouldn't use most of that history. Lazy retrieval keeps simple cases cheap and lets complex cases pay only for the data they need.

**Q: At 10 years of history per user, where does this break?  [arch]**
A: Tool return size. `get_form_history(category, limit=5)` is fine. `get_full_history()` would return MB of data; the model would truncate at context-window boundaries and the recall would be lossy. The fix is to add a "find sessions like X" retrieval (embedding-based) — turning long-term memory from "fetch by key" into "fetch by similarity". That's a RAG layer.

### One-line anchors

- Short-term = in the prompt. Long-term = in the DB.
- Lazy retrieval keeps simple cases cheap.
- Memory is a budgeting problem.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the two tiers and the tool-call link between them.

### Level 2 — Explain it out loud
Why doesn't the agent remember between runs by default? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a 'user notes' feature where the user types observations after each workout. How should the agent access them?"

Reference the planned `coaching_log`.

### Level 4 — Defend the decision you'd change
"Would you ever switch to embedding-based long-term memory?" When?

### Quick check — code reference test
- Is the coaching log implemented?
- What's the planned table name?
- Which tool reads from it?

Then verify against the curriculum.

---
Updated: 2026-05-17 — Long-term memory list: "Notion (sessions, exercises)" replaced with "Supabase (sessions, exercises, gate_progress, week_progress, user_profile)".
