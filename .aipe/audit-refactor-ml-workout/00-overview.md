## Chapter 00 — Overview

### The codebase in one paragraph

contrl is a single-user Android workout-progression app built with Expo SDK 55, React Native 0.83, React 19, and expo-router. It tracks bodyweight training across three categories (push, pull, squat) through a 5-level skill tree, gates progression on three consecutive clean sessions, autosaves drafts every 500ms, counts reps from on-device MediaPipe pose landmarks via a finite-state machine, and mirrors writes to a shared Supabase project (`reindb`) under a `contrl` schema. Local SQLite is the source of truth; cloud is a write-mostly mirror with a one-shot pull-restore on fresh install. About 6,800 lines of TS/TSX across ~50 files, no test files in the source tree.

### The staff engineer's overall take

**Take:** This codebase is small enough that you can hold most of it in your head, and the parts that are well-bounded are well-bounded with intent — `lib/game/` reads like a model of how to keep domain logic out of React, `services/sync/` is a textbook Adapter+Anti-Corruption-Layer pair, and `RepCounter` is a proper state machine with hysteresis. The author understands separation of concerns and reaches for it where it pays. So when something here is messy, it's not because the author doesn't know — it's because they ran out of time before they re-bound the pieces.

The pattern of weaknesses is the same pattern three times: **a screen, a service, or a hook that started small, grew, and never got resplit.** `app/log/[category].tsx` is 1,200 lines and contains the form view, the result view, motivational message logic, set-status helpers, per-exercise breakdown computation, and ~400 lines of `StyleSheet.create`. `src/services/database.ts` is 679 lines and does migrations, seeding, six entity repositories, sync metadata, and tombstone tracking. `src/hooks/useGameState.ts` is 333 lines and is simultaneously the React Context provider, the loader, the session-logger FSM, the reinstall-reconstruction trigger, and the draft accessor. Each of these files is doing one *layer's* job, not one job — and the layer is too big to be one job.

The second pattern is **shadow modules left in place.** `src/components/ExerciseForm.tsx` (296 lines), `src/components/SessionResult.tsx` (183 lines), `src/lib/session-helpers.ts` (50 lines), and `src/components/ui/GlowCard.tsx` (51 lines) are all unreferenced from the live screens. They were once the plan; they got abandoned when the giant `log/[category].tsx` happened. They still type-check, they still pass the build, and they leak into the reader's mental model of what's here. The `notion_page_id` columns on five SQLite tables are the same story at the schema level: Notion sync was removed, the columns stayed, and the mappers still produce `notionPageId: null` on every `fromRemote` call — a ghost in every row.

If I could change one thing, it would be **`app/log/[category].tsx`**. Not because it's the worst code (it isn't — most of it is straightforward), but because it's the file where the codebase's "good architecture but cluttered surface" tension is at its sharpest. The Form/Result split is already factored out in `ExerciseForm.tsx` + `SessionResult.tsx`, which means the *intent* exists in the repo already. Choose: either reconnect those components and shrink the screen to a thin router between two phases, or delete the components and accept that the screen owns it all. The current third position — both exist, neither is wired up — is the most expensive of the three.

### Reading order and chapter summaries

**Recommended order: 02 → 01 → 05 → 03 → 04.** Structure first, then composition, then the principles lens, then the patterns chapter for the cases where a named pattern would actually help, then DSA last because there's barely anything there.

- **Chapter 01 — Composition.** Overall verdict: *worth doing the named extractions; the codebase responds well to it.* The biggest take is the per-exercise breakdown computation in `handleSave` and `buildSession` — both compute the same `hitTarget`/short-set summary slightly differently. Two more DEEP sections cover the `logSession` split-phase opportunity and the SetCameraOverlay processor-picker that wants to be a dispatch table.

- **Chapter 02 — Structural.** Overall verdict: *the highest-stakes chapter; one inline-module decision (kill the shadow components) is more valuable than any other single change.* The other DEEPs are the `database.ts` migration/repository split and the fire-and-forget `pushChanges()` coupling that lives in every writer.

- **Chapter 03 — Patterns.** Overall verdict: *mostly already correct, with two places where the named pattern would clean something up.* `pull.ts`'s dispatch table is the model; SetCameraOverlay should follow it. The gate-progress FSM is implicit and scattered — making it explicit would consolidate logic that currently lives in three files.

- **Chapter 04 — DSA.** Overall verdict: *almost nothing to do; the data is too small for any of these to be load-bearing.* The codebase already uses `useMemo` conscientiously and has no quadratic loops over the user's session list. This is the chapter you read for the verdicts of "Not worth it" on speculative perf work.

- **Chapter 05 — Principles.** Overall verdict: *the most interesting chapter; the codebase honors SoC and Tell-Don't-Ask by default and strains against SRP and Principle of Least Surprise.* The DEEP sections name the same weaknesses Chapters 01 and 02 named, viewed through the principles lens — and the closing paragraph names the SRP-vs-Locality balance that the log screen is currently failing.
