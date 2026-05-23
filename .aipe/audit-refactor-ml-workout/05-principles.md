## Chapter 5 — Principles

Walks the ten principles from `refactor.md` Section 5. Cross-references back to the techniques discussed in earlier chapters where they'd apply. This chapter's job is to name the *why* behind the refactors — sometimes the same fact is a Chapter 02 Extract Module observation and a Chapter 05 SRP violation. Same fact, two angles.

### Map of the territory

- **Single Responsibility** — **DEEP**: three files (`log/[category].tsx`, `database.ts`, `useGameState.ts`) each take on an entire layer.
- **DRY (with care)** — **DEEP**: `getMessage` vs. `getCompletionMessage`, `tempo === 'Steady'`, fire-and-forget sync boilerplate.
- **Separation of Concerns** — BRIEF: honored in `lib/`, broken in `app/log/`.
- **Dependency Inversion** — BRIEF: `database` ↔ `sync` near-cycle.
- **Open/Closed** — BRIEF: `pull.ts` ✓; `SetCameraOverlay` ✗.
- **Liskov Substitution** — NOT FOUND (no class hierarchies to violate).
- **Interface Segregation** — BRIEF: `UseGameStateReturn` is one wide interface for fourteen callers.
- **Locality of Behaviour** — **DEEP**: `log/[category].tsx` is the textbook example of where locality stops being a win.
- **Principle of Least Surprise** — **DEEP**: `notion_page_id` ghost columns, the dead Form/Result modules, `session.passed` naming.
- **Tell, Don't Ask** — BRIEF: well-honored throughout.

### DEEP — Single Responsibility

**Where it's violated** (neutral)
- `app/log/[category].tsx` (1,200 lines): screen routing, form rendering, set-status helpers, save handler, result rendering, motivational messages, breakdown computation, ~400 lines of `StyleSheet.create`. Multiple reasons to change: any UI tweak, any cleanliness-rule tweak, any pose-camera integration tweak.
- `src/services/database.ts` (679 lines): migrations, seeding, six entity repositories, sync state, tombstone tracking, sync metadata. Multiple reasons to change: any schema change, any entity addition, any sync-protocol tweak.
- `src/hooks/useGameState.ts` (333 lines): React Context provider, data loader, reinstall reconstructor, session-logger FSM, week-progress recomputer, draft accessor. Multiple reasons to change: any progression rule, any draft semantics tweak, any reload trigger.

**Why it matters here** (staff engineer)
SRP isn't about file size — it's about *number of reasons a file changes*. By that test, all three are doing more than one job. The log screen changes when the cleanliness rule changes, when the result screen design changes, *and* when the camera integration changes. The database file changes when the schema evolves *and* when a new entity is added *and* when sync needs new metadata. The hook changes when progression rules change *and* when the React data-loading shape changes. In practice this means PRs touching unrelated concerns hit the same files — review friction increases, merge conflicts increase, and the file becomes a coordination point instead of a unit of work.

**Is it worth fixing?**
Yes for the log screen and the database file. The hook is the closest call — its three jobs are tightly bound by the React lifecycle, and splitting it across multiple hooks would just move the coordination into the screens that consume it. I'd let `useGameState` stay one hook and only split `logSession` into a pure advancer (Chapter 03's State Machine take) so the gate-FSM piece can be tested in isolation.

**Which techniques would address it**
- Log screen: kill the shadow components OR reconnect them (Chapter 02 Inline Module / Extract Module). The split already exists; the question is which side of the split is the live one.
- Database: extract `migrations.ts` first; defer per-entity split (Chapter 02 Extract Module).
- `useGameState`: extract `advanceGate()` pure function (Chapter 03 State Machine; Chapter 01 Split Phase).

### DEEP — DRY (with care)

**Where it's violated** (neutral)

Two real duplications, one false friend:

(a) **Real, low-stakes** — `(tempo ?? '') === 'Steady'` lives in `src/services/database.ts:289` (`rowToExercise`) and `src/services/sync/mapper.ts:67` (`exerciseFromRemote`). Same rule, two places.

(b) **Real, higher-stakes** — the message-ladder duplication. `getMessage` in `app/log/[category].tsx:41` and `getCompletionMessage` in `src/lib/session-helpers.ts:44` both map a completion percentage to a motivational string. Almost the same thresholds, slightly different phrasings.

(c) **False friend** — the per-exercise hit-target computation in `useExerciseForm.buildSession` and the breakdown loop in `handleSave` (Chapter 01 DEEP). These look like duplicates but produce different output shapes. The shared piece (the `hitTarget` decision) is the duplicate; the divergent piece (one returns `ExerciseEntry`, the other returns `ExerciseBreakdown`) is honest difference. DRY the shared piece; don't DRY the whole loop.

**Why it matters here** (staff engineer)
DRY violations cost in two ways: drift cost (the two copies say slightly different things and don't agree any more) and discovery cost (a reader doesn't know which one is the source). The `isHold` derivation is mostly a drift risk — when somebody adds a `"Steady-Slow"` tempo for hold-with-pulses, one site will get updated and the other won't. The message ladder is a discovery risk — a reader who finds `getMessage` doesn't know `getCompletionMessage` exists, and a reader who finds `getCompletionMessage` might wonder why the live screen doesn't import it (answer: it's in a dead module).

**Is it worth fixing?**
(a) Yes — five-minute extract, prevents real drift. (b) Yes, but resolve the *direction* first: `session-helpers.ts` is dead code (Chapter 02). Either delete it (and use `getMessage` only), or revive it and delete `getMessage`. Don't dedupe into the dead file. (c) Yes, but as one Chapter 01 Extract-Function, not as a "dedupe the loops" move.

**Which techniques would address it**
- (a): Move Function (Chapter 01 BRIEF).
- (b): Inline Module + Rename (Chapter 02 DEEP + Chapter 01 MENTION).
- (c): Extract Function (Chapter 01 DEEP).

### DEEP — Locality of Behaviour

**Where it's violated** (neutral)
`app/log/[category].tsx` is 1,200 lines. The whole file sits at one logical level: a screen that, when opened, shows a form, and when the user taps save, shows a result. The author put all of it in one file *on purpose* — locality of behaviour says code that changes together should live together, and a screen's form view and result view do change together when the screen's flow changes.

**Why it matters here** (staff engineer)
Locality is a real principle and the codebase's instinct to honor it isn't wrong. The problem is the breakpoint. At 200 lines, locality wins — you read top-to-bottom, you find everything you need, no jumping. At 600 lines, locality and "fits in head" start trading off. At 1,200 lines, you've passed the point where the file can serve its locality goal: nobody reads it top-to-bottom; everybody navigates by Cmd-F. The locality benefit decays past a length you can hold in working memory, and the SRP cost (multiple reasons to change one file → merge conflicts, large diffs, review fatigue) compounds.

The codebase's other files are mostly the right size: `lib/game/*.ts` files average ~50 lines, focused. `lib/pose/exercises/*.ts` files are ~50 lines, focused. `services/sync/*.ts` files are ~150 lines max, focused. The log screen is the outlier. So the principle here isn't "this codebase doesn't believe in locality" — it does. It's "one file misjudged where the breakpoint was."

**Is it worth fixing?**
Yes. But the fix is *which split to take*, not *whether to split.* The split already exists in the repo as the dead `ExerciseForm.tsx` and `SessionResult.tsx`. The Chapter 02 DEEP on those is also the answer here. If you delete those and live with the big screen, you're choosing locality and accepting the size. If you reconnect them and shrink the screen, you're choosing SRP. Either is defensible. The current "both exist, neither is wired up" state is the worst of both worlds because it neither has SRP nor honors locality (the reader has to know about all three files to understand what's actually live).

**Which techniques would address it**
- Extract Function for the local helpers (Chapter 01 DEEP — breakdown computation).
- Inline Module (delete the shadow components) OR Extract Module (reconnect them) — Chapter 02 DEEP.

### DEEP — Principle of Least Surprise

**Where it's violated** (neutral)
Three places, each with a different surprise shape:

(a) **`notion_page_id` ghost columns.** The Notion-sync feature was removed (per `context.md:8`), but `notion_page_id TEXT` columns survive on `user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress`, and `sync_deletions`. Five indexes (`idx_*_notion`) are still created (`database.ts:178–184`). Every `fromRemote` mapper sets `notionPageId: null` (`mapper.ts:38, 73, 100, 126, 153`). The domain types still carry `notionPageId?: string | null` (`types/index.ts:30, 41, 67, 90, 110`).

(b) **Dead modules that look live.** `ExerciseForm.tsx`, `SessionResult.tsx`, `session-helpers.ts`, `GlowCard.tsx` look like normal components. They aren't imported. A reader takes them for live.

(c) **`session.passed` is overloaded.** It means "all entries hit target" (computed in `useExerciseForm.buildSession`). In context next to `gate.status === 'passed'`, a reader is invited to conflate the two. They aren't the same — `session.passed` is the input to the gate-FSM, not its output.

**Why it matters here** (staff engineer)
Least Surprise is a slow tax. Each surprise costs a few seconds the first time a reader hits it, plus the lingering distrust that comes from "this codebase says one thing and means another." (a) makes every reader of the schema or the types ask "what's this Notion thing?" — and the answer is "nothing, ignore it, but don't delete it because the migrations would have to handle the column drop." (b) makes every reader of `src/components/` wonder which components are live. (c) is the lightest of the three — a careful reader figures it out, but the cognitive cost is paid on every read.

**Is it worth fixing?**
- (a) Mostly yes. Drop the `notionPageId` field from the *domain types* (`types/index.ts`) — there's no consumer. Stop emitting `notionPageId: null` in the mappers. Leave the SQLite columns alone for now (the cost of an ALTER TABLE migration outweighs the storage of a NULL column per row, especially with no indexes on them when you drop those next). When you next have a migrations PR open, drop the columns and the legacy indexes. This is a multi-pass cleanup.
- (b) Yes — Chapter 02 DEEP covers it.
- (c) Worth a rename when you're already touching the file — `session.passed` → `session.allTargetsHit` or `session.isClean`. Don't make it a standalone PR; bundle it with the next session-related change.

**Which techniques would address it**
- (a): Remove Dead Parameter (in this case Remove Dead Field) on the domain types (Chapter 01); plus a future Chapter 02 migration to drop the columns.
- (b): Inline Module / Module Cull (Chapter 02 DEEP).
- (c): Rename (Chapter 01 MENTION).

### BRIEF — Separation of Concerns

Honored where it counts: `lib/game/*` has no React imports, `lib/pose/*` has no React imports, `services/sync/*` has no UI imports. Broken in `app/log/[category].tsx`, which mixes presentation (the StyleSheet, the JSX), business logic (the breakdown computation, the cleanliness eval), and integration (the camera overlay coordination, the navigation call after save).

**Take + Verdict:** The chapter on SRP and the chapter on Locality already named the same fact. Don't refactor for SoC as a standalone goal; the underlying refactor (splitting the screen, or culling the shadow modules) achieves it.

### BRIEF — Dependency Inversion

`database.ts` imports `pushChanges` from `./sync`. `services/sync/*` imports `* as db` from `../database`. This isn't a hard cycle (resolved at call-time, not module-init time) but the two layers know about each other. Pure DI would have neither file aware of the other — they'd both depend on a bus.

**Take + Verdict:** Worth fixing as part of the Chapter 02 "Separate Pure from Effectful" work via the pub/sub bus model. Not worth doing as a standalone DI refactor.

### BRIEF — Open/Closed

`pull.ts:6–17` honors O/C cleanly — adding a new pull variant is one line in `EXERCISE_CONFIGS`. `SetCameraOverlay.tsx:46–52` does not — adding a new category requires editing the existing ternary cases. Same problem at two levels of nesting.

**Take + Verdict:** The dispatch table at the overlay level (Chapter 01 DEEP / Chapter 03 DEEP) is the fix. Worth doing.

### BRIEF — Interface Segregation

`UseGameStateReturn` (`useGameState.ts:37–53`) exposes 14 properties. Every consumer takes the full object via `useGameState()` and uses 1–4 of them. The home screen uses `status, error, user, sessions, reload`. The log screen uses `status, error, user, sessions, logSession, getGateForCategory, saveDraft, loadDraft`. The history screen uses `status, error, sessions, reload`.

**Take + Verdict:** ISO violations on a Context-shaped Facade rarely matter in React — every consumer rebinds via destructuring, and unused properties don't force re-renders the way unused props on a child component would. Don't split the Facade for principle's sake. If the wide interface ever becomes a *testing* problem (mocking 14 things to test a screen that uses 4), that's the moment to consider splitting `useGameState` into smaller hooks (`useUser`, `useSessions`, `useGate`). Not before.

### BRIEF — Tell, Don't Ask

Well-honored throughout. `getNodeState` in `progression.ts:8–16` derives state from data instead of asking the data for its state. `createGateProgress` in `gate-check.ts:23–35` derives initial status from level comparison. `isWeekComplete`, `completedCount`, `needsWeekReset` in `week-progress.ts` all follow the same shape: pure functions that *tell* the caller a fact derived from the data, rather than the caller asking for individual fields and recomputing.

**Take + Verdict:** Good. No refactor recommended; cite as a strength.

### Chapter close

**Take:** The principles this codebase honors by default are **Separation of Concerns** (the `lib/` directory is a small monument to it), **Tell-Don't-Ask** (the game-logic pure functions consistently make the right call), and **idempotence** (reconstruct-from-sessions, the migrations, the `INSERT OR IGNORE` seeding — the codebase repeatedly invests in operations that survive replay). These are the principles that pay the most in a single-user offline-first app, and the author reached for them on purpose.

The principles this codebase strains against are **Single Responsibility** at the file level (three files own an entire layer each), **Principle of Least Surprise** (the Notion ghosts, the dead modules), and the **Locality-vs-SRP balance** at one specific spot — the log screen, which mis-sized its locality boundary. None of these are crises. All of them have a specific, scoped fix named in Chapters 01 and 02.

The most interesting tension in this codebase is the Locality-vs-SRP one at `app/log/[category].tsx`. It's interesting because the author actually has the right instinct — *some* file is going to own the workout-logging flow end-to-end, and locality says that ownership should be visible in one place. But the chosen file got too big to be that one place. The fix isn't "abandon locality"; it's "pick a smaller unit to be local at." The form view and the result view, each one local, sharing a thin router file. That's the principle correctly applied at the right granularity. Whether to do it now or not depends on whether you expect the logging flow to keep growing — and you'd know that better than I would.
