# 01 — Agentic AI

> **This codebase has no LLM, no agent loop, no tool calling, and no prompt orchestration.** That is itself worth studying — most "AI apps" today are LLM-shaped, and the muscle of recognising what is *not* agentic is as important as building agents.

This chapter does two things:

1. Names the agentic-AI concepts contrl could have used and explicitly didn't, with the reasons.
2. Maps the closest deterministic analog in the code, so the agentic concepts have something to compare against.

If you're studying agentic AI specifically, treat this chapter as a contrast set, then build the agentic version yourself in another project — the gap *is* the lesson.

---

## 1.1 — Deterministic perception vs. agentic perception 🟡

**What it is.** An agent perceives its environment and acts on it through tools. In agentic AI, perception is usually mediated by an LLM that ingests text/multimodal inputs and chooses an action. Deterministic perception, by contrast, runs a fixed pipeline (sensors → features → state → decision) with no probabilistic policy in the loop.

**Where it lives.** `src/lib/pose/rep-counter.ts:21` — `RepCounter` is a 5-state FSM (`idle → ready → down → bottom → up`) driven by joint angles. There is no "should I count this rep?" reasoning step. The decision is `if (angle >= readyAngle - hysteresis)`.

**Why it exists.** A user is mid-pushup at 30 fps. Calling an LLM here would be (a) too slow, (b) too expensive, (c) non-deterministic, and (d) unnecessary — the problem is well-defined enough to encode as a state machine. Agentic AI is for *fuzzy* problems. Counting reps from joint angles is not fuzzy.

**General rule.** *Reach for an agent only when the problem is genuinely open-ended.* A lot of "AI" can be a state machine, a lookup table, or a regex. Use the cheapest tool that solves the problem.

---

## 1.2 — Tool calling (absent) 🟢

**What it is.** Tool calling is when an LLM decides it needs to invoke an external function (search, calculator, API) and the runtime executes it and returns the result to the model. It's the bridge between the model and the world.

**Where it lives.** Nowhere in this codebase. The closest analog is the Notion API client at `src/services/notion/api.ts` — a normal RPC client called by deterministic code, not by a model.

**Why it exists (here, as absence).** The app's outputs are entirely structured (a session, a level, a gate). You don't need a model to decide *whether* to push a session to Notion — `pushSessions` at `src/services/notion/sync.ts:213` does it unconditionally for unsynced rows. There's no decision worth delegating.

**General rule.** *Tool calling buys non-determinism in exchange for flexibility.* If your decision tree is small enough to write down, write it down. If it's an open set ("answer any question about the user's data"), then tools earn their cost.

**Go deeper.** If you want to add an agentic feature here, the natural shape is a coaching agent: "given this session, suggest a regression." That would warrant tool calls (read sessions, read exercises, read user level). The infrastructure is already there — `getSessions`, `getExercises`, `getUserLevels` — they would become the tool surface.

---

## 1.3 — ReAct loop (absent) 🟡

**What it is.** ReAct = Reason + Act. The model generates a thought, picks an action, observes the result, and loops. It's the canonical agent control flow.

**Where it lives.** Closest analog: `RepCounter.update()` at `rep-counter.ts:31`. Each frame: observe (angle), reason (which transition is enabled?), act (advance phase, maybe count). The loop exists — what's missing is the *language model* that decides reasoning steps. Here the reasoning is hardcoded in the `switch` statement.

**Why it exists (the analog).** Real-time pose detection cannot afford a generative reasoning step per frame. The "reasoning" is compiled into the FSM by the engineer.

**General rule.** *Every agent loop is some variant of: observe → decide → act → repeat.* The interesting question is always: who decides? A model? A heuristic? A state machine? The answer should depend on how often you're surprised by the input.

---

## 1.4 — Memory patterns (absent) 🟡

**What it is.** Agents need memory because LLMs don't have it. Patterns include: short-term scratchpads, vector recall, summary buffers, fact stores, and externalised "memory banks" that persist across sessions.

**Where it lives.** Closest analog: the SQLite `sessions` table + `reconstructFromSessions` (`src/lib/game/reconstruct.ts:13`). All "memory" of the user's progression is stored as an event log (sessions) and reconstructed on demand. Derived state (gates, levels) is *cache*, not memory.

**Why it exists.** The reinstall scenario forces this design. If derived state were the memory, reinstalling would lose everything. Treating sessions as the memory of record means progression is recoverable from one source: Notion.

**General rule.** *In any system with memory, distinguish the log from the cache.* Logs are durable, append-only, and the source of truth. Caches are optimisations and must be reconstructable. This separation is also the foundation of event sourcing (see §2.5).

---

## 1.5 — Orchestration (absent for AI; present for sync) 🟢

**What it is.** Orchestration is the coordination layer that decides what runs in what order. In agentic AI, an orchestrator decides which model, which tool, which fallback. In a sync engine, the orchestrator decides pull-then-push, deletion order, retry policy.

**Where it lives.** `src/services/notion/sync.ts:33` — `syncAll()` is a deliberate, sequential orchestrator: pull exercises → pull sessions → push sessions → process deletions → bump timestamp.

**Why it exists.** Order matters here for correctness. Pulling exercises before sessions means session-to-exercise relations resolve. Processing deletions last means a deleted session that races with a push doesn't resurrect.

**General rule.** *Orchestration is where ordering bugs hide.* Every step in the orchestrator is a decision about what could go wrong if you did it later or earlier. Read orchestrators with that question in mind.

---

## 1.6 — Prompt chaining (absent) 🔴

**What it is.** Decomposing a fuzzy task into a sequence of single-purpose LLM calls, each with focused context, instead of cramming everything into one prompt.

**Where it lives.** Nowhere — there are no prompts. The structural analog is the per-exercise pose pipeline: `src/lib/pose/exercises/pull.ts:21` dispatches by exercise config (TRX vs. bar, hold vs. rep) to a *specialised* processor. Each processor does one thing. `createPullProcessor` is the chain head; `createTrxHoldProcessor` and `createBarPullProcessor` are the chain links.

**Why it exists (the analog).** A "general pull rep counter" would have to handle TRX angle vs. bar angle vs. hold time vs. rep cadence. Splitting it by config keeps each processor small and inspectable.

**General rule.** *One prompt, one job — and the same applies to functions.* When a function has too many `if` branches based on input shape, the branches usually want to be separate functions selected by a small dispatcher.

---

## What's missing — and what you'd build to learn agentic AI here

If you wanted to grow contrl into a project that teaches agentic AI, the natural shape is:

- **Form-coach agent.** Reads the last 3 sessions for a category, identifies the weak exercise, suggests a regression or a tempo tweak. Tool surface: `getSessions`, `getExercises`. Memory pattern: pre-summarise old sessions to fit context.
- **Voice rep counter.** Replace (or augment) the FSM with a multimodal model that watches a clip and counts. Compare cost, latency, and accuracy. Decide which is the right tool for the job — and feel why agentic AI is *not* the right tool here.

Both are out of scope for the current codebase, which is the point: this codebase honestly says "I don't need an agent." That's a design skill in itself.
