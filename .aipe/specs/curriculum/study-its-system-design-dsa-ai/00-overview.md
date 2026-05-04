# 00 — Overview

> **Intent:** Study contrl's system design, data structures & algorithms, and AI through its own code.

## Why this curriculum exists for THIS codebase

contrl is a deceptively small app. On the surface it is "log a set, sync to Notion." Underneath it has the shape of three different systems stitched together:

1. **A bidirectional sync engine** with a real-world conflict-resolution policy, rate limiting, retries, soft deletes, and a deliberate split between authoritative and derived state.
2. **A finite-state machine** that interprets a noisy, real-time signal (pose landmarks at 30+ fps) and produces a discrete count of reps — a classic streaming/online-algorithm problem.
3. **A progression engine** that reconstructs derived state from an event log (sessions). This is event-sourcing in miniature, with idempotency as a hard requirement.

Most curricula teach those three things from toy examples. Studying them here teaches them as *one system that has to coexist*. The interesting decisions are at the seams:

- Why are gates and levels never synced, but sessions are?
- Why is reconstruction triggered by `syncVersion` bump and not on initial DB-ready load?
- Why does a TRX hold use the `'plank'` processor type even though the muscle is "pull"?

Those are not implementation details — they are the *design*. This curriculum surfaces them.

## What this codebase has — and doesn't

A blunt mapping against the five categories:

| Category | Surface area in contrl |
|---|---|
| **Agentic AI** | None. There is no LLM. The "AI" here is a CV pipeline + state machine. The closest analog is `RepCounter` as a deterministic perception loop. We use this gap to contrast agentic AI with deterministic AI. |
| **Systems thinking** | Heavy. Sync ordering, last-edit-wins with bias, idempotent reconstruction, additive migrations, soft delete via `sync_deletions`. |
| **Thinking in code** | Heavy. Discriminated unions for processor types, schema-first storage, derived-vs-stored separation, error classification in `notionFetch`, draft autosave / optimistic UI. |
| **AI product engineering** | Light but real — through the `.aipe/` directory itself: spec-driven dev, externalised memory bank, context.md as the source of truth fed to AI agents. No LLM-runtime concerns. |
| **Language-agnostic** | Strong. State machines, event sourcing, CRDT-adjacent conflict rules, rate limiting with Retry-After, additive migrations — all transfer across stacks. |

## How to study this

The trap with a curriculum is reading it. The point is to *do something with it*. For each concept:

1. **Read** the explanation (what it is, why it exists).
2. **Find** the file or function it points at — open it. Don't just trust the link.
3. **Explain it back** without looking. If you can't, you don't know it yet.
4. **Mutate it.** What would break if you removed the 2-min remote bias? What would break if reconstruction wasn't idempotent? Run the thought experiment, or actually try it on a branch.

Difficulty markers:

- 🟢 **foundational** — read first; everything else assumes this.
- 🟡 **intermediate** — read after foundations, before the deep dives.
- 🔴 **advanced** — subtle, surprising, or only fully appreciated once you've understood the system as a whole.

The ordered learning path lives in `06-curriculum-path.md`. Use it as the spine; the per-category chapters are the reference material it links into.

## Suggested first reads (before any chapter)

- `src/types/index.ts` — the domain in 130 lines. Every other file is downstream of these types.
- `src/services/notion/sync.ts` — the orchestrator. Five steps. Read the comments at lines 46–65; everything else in the codebase exists to serve those five steps.
- `src/lib/game/reconstruct.ts` — 72 lines, but it encodes the entire progression policy. Read it twice.

If those three files make sense as a cluster, you are ready for the rest.
