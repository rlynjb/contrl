# Context engineering

**Industry name(s):** Context engineering · Context window management · The superset of prompt + RAG + memory
**Type:** Industry standard

> Context engineering is the discipline of curating *what fills the window for the next step*. Prompt engineering gets the first good output; context engineering keeps the thousandth one good. Most agent failures are not model failures — they are context failures (stale retrieval, lost-in-the-middle on a bloated context, no user state loaded, wrong tool outputs in the window). Bigger context windows don't solve this; they make room for more noise.

**See also:** → [`.aipe/study-ai-engineering/02-context-and-prompts/01-context-window.md`](../../study-ai-engineering/02-context-and-prompts/01-context-window.md) · → [`.aipe/study-ai-engineering/02-context-and-prompts/02-lost-in-the-middle.md`](../../study-ai-engineering/02-context-and-prompts/02-lost-in-the-middle.md) · → [02-agent-memory-tiers.md](./02-agent-memory-tiers.md)

---

## Why care

**Move 1.** Your prompt is great. Your eval scores are high on the test set. You ship the agent. Three weeks in, users hit failure modes you didn't see in eval — the agent forgets context from earlier in the session, contradicts itself across turns, pulls in outdated retrieval. None of these are prompt bugs. The prompt is fine. What's broken is *what's in the window at the moment of the failure*.

**Move 2.** That "what's actually in the window when this call happens" question is what context engineering answers. Not what the prompt says. Not what the model is good at. Just: what data flows into the context for the next step.

**Why it matters: prompt engineering's job ends at the first good prompt. Context engineering's job is everything that comes after — the live, mutable window state that determines whether each subsequent call hits.**

**Move 5.** Context engineering is to prompt engineering what database tuning is to schema design: the schema is the start; performance lives in what queries actually run against it.

---

## How it works

### Move 1 — The mental model

```
┌─ Context engineering — the superset ─────────────────────────────────────────────────┐
│                                                                                      │
│         everything the model sees at inference time                                  │
│                                                                                      │
│      ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐              │
│      │ prompt           │   │ retrieval        │   │ memory           │              │
│      │ (system + few-   │   │ (vector chunks,  │   │ (recent turns,   │              │
│      │  shot + user)    │   │  SQL rows, tool  │   │  user profile,   │              │
│      │                  │   │  outputs)        │   │  past sessions)  │              │
│      └──────────────────┘   └──────────────────┘   └──────────────────┘              │
│                                                                                      │
│      ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐              │
│      │ tool outputs     │   │ history          │   │ structured user  │              │
│      │ (the loop's      │   │ (this turn's     │   │ state            │              │
│      │  observations)   │   │  conversation)   │   │ (preferences,    │              │
│      │                  │   │                  │   │  current task)   │              │
│      └──────────────────┘   └──────────────────┘   └──────────────────┘              │
│                                                                                      │
│      All compete for window space. Context engineering decides what wins.            │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** the context window is a budget. Every byte spent on stale retrieval is a byte not spent on the current task. Curate what goes in.

### Move 2 — Three failure modes context engineering catches

#### Context bloat

```
turn 1 → small window, model attends
turn 5 → window has 5× tool returns, model attends to most
turn 12 → window has 12× tool returns, lost-in-the-middle kicks in
turn 20 → window full, model attends to top and bottom; middle is dead weight
```

The fix: prune. Drop tool returns that aren't load-bearing for the current decision. Summarize prior turns.

#### Stale retrieval

```
turn 1: agent retrieves docs about feature X
turn 8: feature X has been updated, agent still has the old retrieval in window
turn 9: agent reasons forward on stale information; output is wrong
```

The fix: re-retrieve when the task moves past the original retrieval's relevance. Don't trust retrieval across long trajectories.

#### Missing state

```
agent asks user about a preference
user replies, but the agent's next call doesn't include the reply in the context
agent asks the same question again next turn
user is confused; trust drops
```

The fix: explicit state tracking in the window. The agent's runner threads user state through every turn.

### Move 3 — The principle

The context window is the working memory of the next inference call. Treat it as a curated resource, not a buffer that accumulates everything. **In a multi-agent system, context engineering also decides which agent sees what** — the supervisor sees the user task and the worker reports; each worker sees only the slice relevant to its specialty. Context routing is context engineering applied to a topology.

---

## Context engineering — diagram

```
┌─ Curating the window for the next call ──────────────────────────────────────────────┐
│                                                                                      │
│   Window budget: X tokens (e.g., 200k for Sonnet 4)                                  │
│                                                                                      │
│   ┌──────────────────────────────────────────────────────────────────────┐           │
│   │  System prompt + tools           │ ~5k tokens     (constant prefix)  │           │
│   │  Few-shot examples (if used)     │ ~5k tokens     (cached prefix)    │           │
│   │  Recent conversation history     │ varies         (rolling window)   │           │
│   │  Retrieved chunks (if RAG)       │ varies         (curated)          │           │
│   │  Tool outputs from this run      │ varies         (pruned per turn)  │           │
│   │  User state (preferences, etc.)  │ ~1k tokens     (loaded each turn) │           │
│   │  Current user message            │ varies         (small)            │           │
│   └──────────────────────────────────────────────────────────────────────┘           │
│                                                                                      │
│   Per-turn pruning:                                                                  │
│     - prior tool outputs no longer needed → drop                                     │
│     - retrieved chunks past relevance → drop or summarize                            │
│     - long conversation → summarize older turns                                      │
│                                                                                      │
│   Per-turn loading:                                                                  │
│     - relevant user state (preferences, current task)                                │
│     - fresh tool outputs                                                             │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — the coaching agent's context shape.**

The planned coaching agent's window has a specific composition:

- **System prompt + 5 tool definitions (~5-8k tokens, cached prefix).** Stable across every call. Lives in `src/lib/agent/system.md`. Anthropic's prefix-cache picks this up on the second call onward.
- **The current set's classifier output and metadata (~500 tokens).** Loaded each call from `get_classifier_output`.
- **Recent coaching messages (~1-2k tokens).** Last 5-7 coaching messages from `get_recent_coaching`, used so the agent avoids repeating itself. The window for this is rolling — older messages drop off.
- **Recent form history (~1-2k tokens).** Last 5-10 sessions for context, from `get_form_history`.
- **Per-turn tool outputs (~variable).** Accumulate within a run; pruned at the start of the next coaching event (each event is a fresh run).

The discipline is **curate per turn, not per session.** Every turn the agent's runner re-evaluates what to keep, what to drop, what to re-load. This is what keeps the window from bloating when the user has months of history.

Planned path: `src/lib/agent/context.ts` builds the per-turn context payload.

---

## Elaborate

**Where this pattern comes from.** Context engineering crystallized as a name in 2024-2025 as production agent teams hit the wall on long-running agents. The earlier framing — "prompt engineering" — covered the prompt template but not the runtime state. The new framing makes the runtime state a first-class concern.

**The deeper principle.** Bigger context windows are not the answer. A 200k window full of irrelevant content performs worse than a 10k window full of relevant content. The lost-in-the-middle effect — empirically demonstrated across Sonnet, GPT-4, Gemini — means content in the middle of a long window gets less attention than content at the top or bottom. Curating *what goes in* matters more than *how much fits*.

**Where this breaks down.** Tasks that genuinely need a large amount of in-context content (e.g., reasoning over a long document with many cross-references). Even then, the answer is structured retrieval and summarization within the window, not "load everything."

**What to explore next.** [02-agent-memory-tiers.md](./02-agent-memory-tiers.md) for the layer below context engineering; [`.aipe/study-ai-engineering/02-context-and-prompts/02-lost-in-the-middle.md`](../../study-ai-engineering/02-context-and-prompts/02-lost-in-the-middle.md) for the attention mechanics.

---

## Tradeoffs

```
┌────────────────────┬─────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Curated context                 │ "Fill the window"                │
├────────────────────┼─────────────────────────────────┼──────────────────────────────────┤
│ Per-call cost      │ baseline                        │ proportional to window size      │
│ Quality on long    │ holds                           │ degrades (lost-in-the-middle)    │
│  trajectories      │                                 │                                  │
│ Engineering cost   │ context.ts curation logic       │ none                             │
│ Failure modes      │ pruning bugs                    │ stale retrieval, bloat, drift    │
│ Predictability      │ window stays consistent         │ window shape varies by turn      │
└────────────────────┴─────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what curated context gives up

A small engineering cost — the `context.ts` builder has to decide each turn what to include. Bugs in the pruning logic can drop content that mattered. Mitigation: explicit per-turn logs of what was included and what was dropped, surfaced in the agent's trace.

### Sub-block 2 — what filling the window costs

Quality degradation past mid-window length. Lost-in-the-middle is empirical; ignoring it is a known failure pattern. Plus per-call cost grows linearly with window size — long windows are expensive even when cached.

### Sub-block 3 — the breakpoint

Curate from version one. The "we'll deal with context bloat later" path leaves you with quality regressions that look like model drift but are actually window drift.

---

## Tech reference (industry pairing)

### Anthropic prompt caching

- **Codebase uses:** planned. The stable prefix (system + tools + cached examples) is marked for caching.
- **Why it's here:** the most cost-effective context move is keeping the prefix stable so it caches across turns.
- **Leading today:** Anthropic prompt caching — adoption-leading, 2026.

### Per-turn context builder

- **Codebase uses:** planned for `src/lib/agent/context.ts`. Pure function that takes `(runState, toolOutputs, userTask)` and returns the assembled context.
- **Why it's here:** explicit, testable, traceable curation.
- **Leading today:** hand-rolled context builders — adoption-leading for serious agent teams, 2026.

---

## Summary

### Concept recap

Context engineering is the discipline of curating what fills the window for the next call. It's the superset of prompt engineering, retrieval, memory, and tool outputs. The failures it catches — context bloat, stale retrieval, missing state — are the most common production agent failures. contrl's planned coaching agent uses a per-turn context builder that holds a stable cached prefix and loads/prunes the rest each call.

### Key points

- Bigger context windows don't solve context failures. Curation does.
- Lost-in-the-middle is empirical — content in the middle of long windows is underused.
- Stable prefix gets cached; rolling content is loaded per turn.
- contrl: planned per-turn context builder in `src/lib/agent/context.ts`.

---

## Interview defense

### Likely questions

**[mid] What's context engineering and how is it different from prompt engineering?**

Prompt engineering designs the static template (system prompt, examples, output schema). Context engineering manages the live state at the moment of inference — what's loaded from memory, what tool outputs are kept, what's been pruned, what user state is threaded through. Prompt engineering is the schema; context engineering is the query that runs against it.

**[senior] What's contrl's context shape?**

The stable prefix is the system prompt plus five tool definitions (~5-8k tokens, prefix-cached). Per call, the runner loads the current set's classifier output, recent coaching messages (rolling window of 5-7), recent form history (5-10 sessions). Tool outputs from the current run accumulate within the turn and are pruned at the start of the next coaching event. The `context.ts` module is the per-turn curator.

**[arch] What fails when context engineering is absent?**

Three things, all common in production. Context bloat — the window accumulates tool outputs across many turns and lost-in-the-middle degrades attention. Stale retrieval — the agent reasons forward on chunks that were relevant 10 turns ago but aren't now. Missing state — user replies or preferences don't make it into the next turn's window. All three look like model drift but are window drift.

### One-line anchors

- "Bigger windows don't solve context failures. Curation does."
- "Prompt engineering ends at the first good output. Context engineering keeps the thousandth one good."
- "The window is a budget. Spend it on what matters for the next call."

---

## Validate

**Level 1 — Reconstruct the diagram.** The window's composition: prefix + retrieved + memory + tools + state + user message.

**Level 2 — Explain in 90s.** What does context engineering manage that prompt engineering doesn't?

**Level 3 — Apply.** A teammate's agent works in eval but degrades in user testing. Walk through the context-engineering hypotheses you'd check.

**Level 4 — Defend.** Defend the choice to curate per-turn vs "fill the 200k window with everything." What does the latter cost?

**Quick check.**
- What's the most cost-effective context move? — Stable prefix that gets prompt-cached.
- What's lost-in-the-middle? — Attention degradation on content in the middle of long windows.
- Where does contrl's per-turn curation live? — Planned: `src/lib/agent/context.ts`.
