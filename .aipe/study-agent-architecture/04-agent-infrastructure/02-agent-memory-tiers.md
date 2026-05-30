# Agent memory tiers

**Industry name(s):** Memory tiers · Working / episodic / long-term · Three-tier agent memory
**Type:** Industry standard

> Agent memory has three tiers: working (in-context, the current run's window), episodic (recent runs/sessions, retrieved by relevance), and long-term (durable facts, preferences, decisions — stored in a persistent vector or relational store). The retrieval problem at the long-term tier is the load-bearing one — the tier only works if the right thing is retrieved at the right time. **For contrl, only working memory is in the planned design** — episodic and long-term tiers are Case B.

**See also:** → mechanics: [`.aipe/study-ai-engineering/04-agents-and-tool-use/05-agent-memory.md`](../../study-ai-engineering/04-agents-and-tool-use/05-agent-memory.md) · → [01-context-engineering.md](./01-context-engineering.md)

---

## Why care

**Move 1.** Your agent works fine within one task. The next time the user comes back, the agent has forgotten everything — name, preferences, past conversations. The conversation feels like starting from scratch. Multi-turn within one session works; cross-session continuity doesn't.

**Move 2.** That "how does the agent remember across runs" question is what memory tiers answer. Not how the context window works. Just: where does state live when it's not in the current window.

**Why it matters: agents that don't remember don't feel like agents.** They feel like one-shot LLM calls dressed up. The user's experience of "an agent that knows me" depends on a memory layer below the context window.

**Move 5.** Memory tiering is to agents what storage layering is to a local-first app: working memory is React state; episodic is the local DB; long-term is the cloud mirror.

---

## How it works

### Move 1 — The mental model

```
┌─ Working memory (in-context) ────────────────────────────────────────────┐
│                                                                          │
│   The current task's context window. Lives in the prompt for this run.   │
│   Gone when the run ends.                                                 │
│                                                                          │
│   Examples: current conversation, tool outputs from this run, current   │
│   user task.                                                              │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Episodic memory (recent sessions / runs) ───────────────────────────────┐
│                                                                          │
│   Summaries of recent runs. Retrieved by relevance to the current task.  │
│   Lives between runs but is bounded in size.                              │
│                                                                          │
│   Examples: "last week the user asked about pull-up form"; "user         │
│   preferred terse coaching messages in last 5 sessions."                  │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Long-term memory (persistent knowledge) ────────────────────────────────┐
│                                                                          │
│   Durable facts, decisions, preferences. Stored in a vector DB, graph,   │
│   or structured store. Unbounded growth.                                  │
│                                                                          │
│   Examples: user's training level, injury history, stated goals,         │
│   preferences for coaching tone.                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** different things belong in different tiers. Don't try to keep everything in the context window; don't dump everything into the long-term store either.

### Move 2 — The retrieval problem

The hardest part of long-term memory is the retrieval. Long-term grows unbounded; you can't put it all in the window each turn. You need a retrieval layer that surfaces the right slice at the right time. This is RAG inside the agent.

```
turn starts
     │
     ▼
┌─────────────────────────────────────────────────┐
│ What do I need from long-term for this turn?    │
│  retrieve by task relevance:                    │
│    - what user state is relevant?               │
│    - what past decisions matter?                │
│    - any prior preferences for this kind of     │
│      task?                                       │
└────────────────────┬────────────────────────────┘
                     │ retrieved facts
                     ▼
              loaded into working memory for this turn
```

The failure mode this introduces: retrieval miss. If the right long-term fact isn't surfaced, the agent acts without knowing it. Same fix as RAG generally — relevance grading, fallback paths, query rewriting.

### Move 3 — The principle

The three-tier model maps directly onto the data-storage instinct from local-first apps: working = React state (gone on unmount), episodic = local DB cache (bounded, recent), long-term = cloud mirror (unbounded, durable). The retrieval layer at the long-term tier is the load-bearing piece — it's where "the agent knows me" becomes real.

---

## Memory tiers — diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   RUN BEGINS                                                                   │
│        │                                                                       │
│        ▼                                                                       │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │ Load working memory:                                                    │  │
│   │   - relevant slice from long-term (retrieval-by-task)                   │  │
│   │   - recent episodic summaries (last N sessions)                         │  │
│   │   - current task context                                                │  │
│   └────────────────────┬───────────────────────────────────────────────────┘  │
│                        │                                                       │
│                        ▼                                                       │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │ Run the agent loop (working memory in-context)                          │  │
│   └────────────────────┬───────────────────────────────────────────────────┘  │
│                        │                                                       │
│                        ▼                                                       │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │ Write back:                                                             │  │
│   │   - summary of this run → episodic                                      │  │
│   │   - new facts / preferences → long-term                                 │  │
│   └────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Working memory: planned. Episodic and long-term: Case B.**

contrl's planned coaching agent has only working memory. Per-run, the runner loads:

- **The classifier output for the current set** (one row, very small)
- **The 5-7 most recent coaching messages** via `get_recent_coaching` (bounded, used so the agent avoids repetition)
- **The 5-10 most recent sessions** via `get_form_history` (bounded, gives the agent context on recent trends)
- **The user's current progression state** via `get_progression_state` (one row)

That's *episodic-like behavior implemented through tool calls*, not a separate memory tier. The agent fetches recent context fresh each run rather than maintaining an episodic store.

**True episodic and long-term memory would land if** the coaching agent needed cross-session continuity that the structured queries can't satisfy — e.g., remembering that the user mentioned an injury two weeks ago and adapting coaching accordingly. That would require summarizing past sessions into retrievable text and a long-term store for stated preferences. Neither is in scope today.

If/when they land: `src/services/agent-memory/` with episodic stored as summary chunks and long-term stored in a vector store or structured preference table.

---

## Elaborate

**Where this pattern comes from.** Cognitive science (Tulving's distinction between episodic and semantic memory, 1972) handed AI a clean conceptual framework. Production agent teams operationalized it in 2023-2024 as "agent memory" became a named concern.

**The deeper principle.** Different kinds of state have different lifetimes and access patterns. Mixing them — putting everything in the context window, or dumping everything into a vector store — costs you on both ends. Tier appropriately.

**Where this breaks down.** When the user expects "the agent knows me" but the long-term retrieval misses. The failure looks like the agent forgetting, but it's actually a retrieval miss. The fix is the same as RAG retrieval generally — relevance grading, fallback paths.

**What to explore next.** [`.aipe/study-ai-engineering/04-agents-and-tool-use/05-agent-memory.md`](../../study-ai-engineering/04-agents-and-tool-use/05-agent-memory.md) covers the two-layer short/long split; this file extends to three tiers.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Three-tier memory                 │ All-in-context                   │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Cross-session      │ yes                                │ no (resets each session)         │
│  continuity        │                                   │                                  │
│ Window pressure    │ low (only relevant slice loaded)  │ high (everything competes)       │
│ Engineering cost   │ retrieval layer + write-back logic│ none beyond prompt               │
│ Failure modes      │ retrieval miss                    │ "agent forgets" every session    │
│ Cost per turn      │ baseline + retrieval overhead     │ window grows linearly w/ history │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Add episodic when cross-session continuity becomes a feature requirement. Add long-term when user preferences and durable facts need to persist beyond bounded recency. For contrl's coaching agent at planned scope, neither is required — bounded tool-call returns give episodic-like behavior cheaply.

---

## Tech reference (industry pairing)

### Vector store for long-term memory

- **Codebase uses:** not used. Case B for contrl.
- **Why it's here:** the standard long-term store; semantic retrieval of stored facts/summaries.
- **Leading today:** pgvector, Qdrant, Pinecone — adoption-leading for production agent long-term memory, 2026.

### Structured preference store

- **Codebase uses:** not used. Case B.
- **Why it's here:** for facts with known schema (user prefs, settings), a relational table beats a vector store.

---

## Summary

### Concept recap

Three tiers: working (in-context), episodic (recent runs, summarized), long-term (persistent, retrieved by relevance). The retrieval layer at the long-term tier is the load-bearing piece. contrl's planned coaching agent uses tool calls over structured SQLite data for episodic-like behavior; true episodic and long-term tiers are Case B.

### Key points

- Different kinds of state have different tier homes.
- Long-term memory's hardest problem is retrieval.
- Bounded tool calls over structured data can substitute for episodic memory at small scale.
- contrl: working memory only; episodic + long-term Case B.

---

## Interview defense

### Likely questions

**[mid] What are the three memory tiers?**

Working (in-context for this run), episodic (summaries of recent runs, retrieved by relevance), long-term (durable facts and preferences, stored persistently). Each has a different lifetime and access pattern.

**[senior] Why doesn't contrl have episodic or long-term?**

The coaching task at planned scope only needs bounded recency, and that's cheaper to implement as tool calls over structured SQLite data. `get_recent_coaching` and `get_form_history` give the agent the last N items each — that's episodic-shaped behavior without the storage layer. True episodic would land if the agent needed memory beyond what bounded queries can give (e.g., "remember that the user mentioned an injury two weeks ago and adapt").

**[arch] What's the failure mode at the long-term tier?**

Retrieval miss. The right fact exists in the store but doesn't surface when the agent needs it. The failure looks like the agent forgetting, but it's actually a retrieval problem. Fix: relevance grading, query rewriting, fallback paths — same as RAG retrieval generally.

### One-line anchors

- "Different state has different tier homes."
- "Long-term memory's hardest problem is retrieval."
- "Bounded tool calls over structured data can substitute for episodic at small scale."

---

## Validate

**Level 1 — Reconstruct the diagram.** The three tiers and the load/run/write-back flow.

**Level 2 — Explain in 60s.** Why does long-term retrieval get hard?

**Level 3 — Apply.** A user says "the agent forgot what I told it last session." Walk through the diagnosis: working memory miss, episodic miss, long-term retrieval miss.

**Quick check.**
- Where does working memory live? — In the context window.
- What's the hardest part of long-term memory? — Retrieval.
- Does contrl have a long-term store? — No; Case B.
