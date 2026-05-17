# 04 — AI product engineering

This category is intentionally light in this codebase — there's no LLM in the runtime. But "AI product engineering" extends to *how the product is built using AI*, and that's where contrl is unusually deliberate. The `.aipe/` directory is itself an AI product engineering artefact: an externalised memory bank that any AI agent (Claude, Codex, etc.) reads as the project's source of truth.

If you've never thought of "how I work with my AI tools" as a system, this chapter is the introduction.

---

## 4.1 — Spec-driven development 🟢

**What it is.** Before code, write the spec. Before features, write the requirements. The spec is the authoritative description of what the system does; the code is its implementation.

**Where it lives.** The `.aipe/` directory:

```
.aipe/
  project/
    context.md          ← the project's running spec (5KB, dense)
  specs/
    curriculum/         ← per-task generated specs
    interview/
```

`.aipe/project/context.md` is structured: stack, data model, file structure, key algorithms, **what must not change**. The "what must not change" section (lines 64-71) is particularly disciplined — it lists invariants the codebase guarantees, so future changes can be evaluated against them.

**Why it exists.** When you're working with an AI agent, the spec *is* the prompt. A vague spec produces vague code. A spec with explicit invariants ("Notion remains source of truth for exercises") makes the agent push back on changes that would violate them. This is leverage.

**General rule.** *In any AI-assisted workflow, the spec is the unit of leverage — not the code.* Time spent making the spec sharper compounds. Time spent re-explaining the same constraint every session is waste.

---

## 4.2 — Memory bank pattern (externalised context) 🟡

**What it is.** AI agents (LLMs) have no persistent memory across sessions. The "memory bank" pattern fixes this by writing the context the agent needs to a known location it reads on startup.

**Where it lives.** Two places, layered:

- `.aipe/project/context.md` — the project memory bank. Read by AI agents on session start.
- `~/.claude/projects/-Users-rein-Public-contrl/memory/MEMORY.md` — per-tool, per-user persistent memory (mentioned in this very session's CLAUDE.md context). Holds longer-lived facts like "Galaxy S23 Ultra; Auto Blocker blocks adb until disabled."

These layer cleanly: project memory belongs in the repo (it's about the code), tool memory belongs in the user's tool config (it's about how *this user* works with this tool).

**Why it exists.** Without a memory bank, every conversation with an AI agent starts at zero. With one, the agent walks in already knowing the stack, the data model, the invariants. The session is then about *the work*, not about re-establishing context.

**General rule.** *When a tool has no memory, you build the memory layer yourself.* The split between project-memory (in repo) and user-memory (in tool) is the same split you'd make for any team-vs-individual context.

**Go deeper.** Read the `aipe` repo (the source of `.aipe/specs/curriculum.md` template you're using right now) to see how the pattern is generalised. The README of that template (`/Users/rein/.claude/plugins/cache/rlynjb-aipe/aipe/1.3.0/specs/README.md`) lists the other spec types.

---

## 4.3 — Context window management (by file structure) 🟡

**What it is.** LLM context windows are finite. The way you organise files shapes which files an agent can fit in context for a given task. Tight, thematic files = fewer tokens for the same understanding.

**Where it lives.** The codebase practices this:
- `src/lib/game/` — five files, each ~50–100 lines, one concept each (`gate-check`, `progression`, `reconstruct`, `streaks`, `week-progress`). An agent can hold all of `lib/game` in context cheaply.
- `src/lib/pose/exercises/` — per-exercise processors (`pushup.ts`, `squat.ts`, `plank.ts`, `pull.ts`, `pull-bar.ts`, `pull-trx.ts`). Adding a new exercise means adding one file, not editing a switch in five places.
- `src/services/notion/` — split into `api.ts` (transport), `config.ts` (secrets), `mapper.ts` (translation), `sync.ts` (orchestration). Each file is one job.

Compare to a hypothetical alternative: a single `gameLogic.ts` with all of progression, gates, weeks, streaks crammed in. Same code, but the agent now has to load the whole thing to reason about any one piece.

**Why it exists.** Small focused files are easier to reason about, period — for humans and for agents. The constraint is sharper for agents because they pay tokens for it; that pressure tends to produce cleaner factoring.

**General rule.** *Organise code so that each task can be reasoned about by reading a small, contiguous slice.* This is just good engineering, but AI tooling makes the cost of bad factoring visible (tokens, latency).

---

## 4.4 — Cost vs. capability tradeoffs (the absent LLM) 🟡

**What it is.** An LLM call is an order of magnitude slower and more expensive than a function call. The choice to *not* use an LLM is itself a product engineering decision.

**Where it lives.** Several deliberate non-LLM decisions in this app:

- Rep counting uses a 5-state FSM, not a model. Cost: $0/inference. Latency: <1ms. Capability: slightly worse on edge cases than a model would be — but counting reps is well-defined enough that the FSM's deterministic behaviour is preferable to a model's non-determinism.
- Conflict resolution is last-edit-wins with bias, not a "merge agent." Cost: $0. Latency: 0. Capability: lower than a model that could *understand* what changed — but the bias is a good enough heuristic for a single user.
- Exercise progression suggestions (regressions/scaling) live in the static `notes` field on each Exercise, not generated. Cost: $0. Capability: lower than a personalised coach — but the trade is acceptable.

**Why it exists.** Every one of these *could* be an LLM. The product is better because none of them is. Latency, offline-readiness, deterministic UX, and zero variable cost matter more here than the marginal capability uplift.

**General rule.** *Pick the cheapest tool that solves the problem; LLMs are not free.* The instinct in 2026 is to reach for a model first; the discipline is to ask whether the problem actually needs one. Most don't.

---

## 4.5 — Evaluation (mostly absent — and what would change if added) 🔴

**What it is.** Systematic measurement of model output quality against a held-out set of cases. Eval sets are how you ship LLM features without regression.

**Where it lives.** Not present in this codebase, because there's no model output to evaluate. The closest analog is the rep-counter pipeline: it would benefit from a labeled set of recorded sessions ("this video has 12 pushups, the counter said 11 — diff") to detect regressions when you tune `hysteresis` or change exercise configs.

**Why this is the gap to close.** If you wanted to learn evaluation in this codebase, the exercise is: record ~20 short videos with known ground-truth rep counts. Run the rep counter against them headlessly. Track per-exercise accuracy. Now any change to `rep-counter.ts` or `angles.ts` has a regression signal.

**General rule.** *Anything you can't measure, you'll regress.* This is true for LLM output, for ML model accuracy, and for anything that depends on a tunable threshold (like `hysteresis = 10°`). Build the eval set early; it pays back the moment you change the algorithm.

---

## 4.6 — Spec → AI-agent execution loop 🔴

**What it is.** The full loop: human writes a spec → agent reads spec + repo context → agent proposes changes → human reviews → spec updated to reflect new invariants. The spec is the closed-loop memory across sessions.

**Where it lives.** Implicit in how `.aipe/specs/` is used. The `aipe:feature`, `aipe:refactor`, `aipe:debugging` skills (visible in the available-skills list) all consume `.aipe/project/context.md` and emit specs into `.aipe/specs/`. Each spec is a turn of the loop.

**Why it exists.** Without the loop being explicit, "AI-assisted development" devolves into *ad hoc* prompting. With it, you have a repeatable workflow whose artefacts (specs) accumulate as the project's design history.

**General rule.** *Treat AI-assisted development as a workflow, not a vibe.* Name the steps, save the artefacts, and let the artefacts compound. The investment in `context.md` pays back every session.
