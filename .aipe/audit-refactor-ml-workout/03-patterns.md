## Chapter 3 — Design pattern opportunities

Named structural solutions to recurring problems. The bar for invoking a pattern is "does the diagnosis match." Patterns applied without their underlying problem are just added indirection. This codebase is small enough that most patterns don't apply — and the ones that do, often *already* apply correctly in one place but not in another.

### Map of the territory

- **Strategy** — **DEEP**: `pull.ts`'s dispatch table is right; `SetCameraOverlay`'s processor picker should match it.
- **Observer / Pub-Sub** — BRIEF: the write→sync fan-out wants to be this. Covered structurally in Chapter 02.
- **Command** — NOT FOUND.
- **Template Method** — NOT FOUND.
- **State Machine** — **DEEP**: `RepCounter` is explicit and good; the gate FSM is implicit and scattered.
- **Iterator** — NOT FOUND (modern JS idioms are used throughout).
- **Adapter** — BRIEF: `services/sync/mapper.ts` is a textbook Adapter.
- **Facade** — BRIEF: `useGameState` is one; opine on quality not existence.
- **Composite** — NOT FOUND.
- **Decorator** — BRIEF: could wrap db writers (covered in Chapter 02).
- **Proxy** — NOT FOUND.
- **Factory** — BRIEF: pose-processor factories.
- **Builder** — NOT FOUND.
- **Dependency Injection** — NOT FOUND of structural significance.

### DEEP — Strategy: the dispatch table pattern is already here, mostly

**Where it shows up** (neutral)
- `src/lib/pose/exercises/pull.ts:6–31` — `EXERCISE_CONFIGS: Record<string, PullExerciseConfig>` keyed by exercise ID, with a `DEFAULT_CONFIG` fallback, and a `createPullProcessor(exercise)` that reads the config and constructs the matching processor.
- `src/components/camera/SetCameraOverlay.tsx:46–53` — a nested ternary on `(category, exercise.isHold)` that picks among `createPushupProcessor`, `createSquatProcessor`, `createPlankProcessor`, `createPullProcessor`. (Also a Chapter 01 dispatch-table candidate — they're the same observation, viewed from two angles.)

**Why it's like this** (neutral)
The pull branch was added late, after enough exercise variants accumulated that a ternary wouldn't fit. The author wrote the dispatch table for that branch in `pull.ts`. The top-level overlay never got the same treatment because at the top level there are only four cases (pull / hold / squat / push-up), and a ternary still fit when it was added.

**Take**
This is the cleanest example of "Strategy via dispatch table" applied correctly in the codebase. The `pull.ts` pattern reads in fifteen seconds: ID → config → factory. It's open for extension (add a key to the map) and closed for modification (you never touch the existing entries). The overlay's nested ternary is the same problem one level up, and it should mirror the same pattern: `(category, isHold)` → factory map → `{ type, processor }`. Same eight lines, same scrutability, same Open/Closed property.

The trap I'd avoid: don't over-engineer this into a Strategy *class* hierarchy. The codebase is functional. The processors are factory closures, not classes. The dispatch table is a `Record`, not a registry of subclasses. Keep it boring; "Strategy" here is just a named slot in a `Record`.

**The tradeoff**
Cost: ~15 lines, one new file or ~20 lines inline. Cost of not doing it: each new category re-edits the ternary, which is exactly the case Replace-Conditional-with-Dispatch-Table exists to prevent. **Breakpoint:** the fourth category. You're already at three with the ternary, and pull already has internal dispatch — the pressure is building.

**What I'd watch for**
Two pose processors return different result shapes (`repCount` vs. `holdTimeMs`). The dispatch table doesn't need to unify them — it can return a tagged union (`{ type: 'rep' | 'plank', processor }`) and the caller branches on the tag. The current code already does this; preserve the tagged union when you migrate. Don't accidentally collapse the result shape.

**Verdict:** Worth doing.

### DEEP — State Machine: the gate FSM should be explicit

**Where it shows up** (neutral)
The "gate progression" finite-state machine has three states (`'locked' | 'in-progress' | 'passed'`) and is conceptually:
- a session arrives → if clean, `consecutivePasses += 1`; if dirty, `consecutivePasses = 0`
- if `consecutivePasses >= 3` → status becomes `passed`
- if `passed && level === userLevel && level < MAX_LEVEL` → level up, create the next-level gate

This logic lives in three places:
- `src/hooks/useGameState.ts:213–256` (`logSession`) — does the transition for a live session.
- `src/lib/game/reconstruct.ts:42–61` — does the transition while replaying historical sessions.
- `src/lib/game/progression.ts:8–16` (`getNodeState`) — derives the *display* state from gate + user level (different concern, but reads the same data).
- `src/lib/game/gate-check.ts:23–35` (`createGateProgress`) — initializes a fresh gate based on `level` vs. `userLevel`.

The transition rule itself is the same in `logSession` and `reconstruct.ts`, expressed twice.

**Why it's like this** (neutral)
`logSession` was written when the rule fit in 20 lines. `reconstruct.ts` was added later to handle the reinstall-recovery case (replay sessions to rebuild gate state). The author wrote the same transition logic both times because lifting it out would have required a pure function with a careful signature, and inlining was faster.

**Take**
The transition is a *pure function*. It has no React, no IO, no async — `(currentGate, isClean, currentLevel) → { nextGate, leveledUp, newLevel? }`. Pull it into `src/lib/game/gate-fsm.ts` (or fold into the existing `gate-check.ts`) as `advanceGate(gate, sessionResult, userLevel) → AdvanceResult`. Then both `logSession` and `reconstructFromSessions` call it. The transition logic becomes one piece of code with one set of tests (when tests arrive) and one place to change when somebody asks for "RPE-weighted passes" or "gate decay if you skip a week."

This is the same observation as Chapter 01's Split-Phase DEEP, viewed through the patterns lens. The Chapter 01 take focused on *splitting `logSession`*; this one focuses on *naming the FSM and giving it a home*. Do the work once, satisfy both takes.

**The tradeoff**
Cost: one new function, two call sites updated. The function's signature is the hardest part — `AdvanceResult` needs to carry enough information for the caller to update local state, including the "level-up happened, here's the next-level gate to create" branch. Cost of not doing it: the rule has two sources of truth that have to agree, and they do agree today — but they're held together by the author remembering, not by the code structure.

**Breakpoint:** the moment somebody asks "should sessions logged at a *lower* level count toward the *current* level's gate?" Today both implementations agree the answer is no. The next ambiguous question will land in one place and not the other.

**What I'd watch for**
The level-up branch in `logSession` does a *second* write — it creates the next-level gate with `createGateProgress(category, newLevel, newLevel)`. The reconstruct version does this inline at line 53–54. When you collapse them, decide where that responsibility lives: in the advancer's result (cleaner — the caller just persists), or in the caller (more flexible — but then both callers have to remember to do it). I'd push for the result-carries-it shape.

**Verdict:** Worth doing.

### BRIEF — Adapter: `services/sync/mapper.ts`

`src/services/sync/mapper.ts` is the cleanest pattern instance in the codebase. Five pairs of `toRemote`/`fromRemote` functions, one per entity. snake_case lives only in this file. The legacy `notionPageId` ghost is absorbed here too (lines 38, 73, 100, 126, 153 — always `null` on the way back).

**Take + Verdict:** Don't change it. Use it as the reference for what a boundary file should look like. The one critique — the `r: any` parameter types on the `fromRemote` functions — is small enough to be a Chapter 01 Extract-Type and not worth promoting here.

### BRIEF — Facade: `useGameState`

`src/hooks/useGameState.ts` exposes one return shape (`UseGameStateReturn`) that 14 unrelated callers (every screen, every set-row in the log screen) use. Under the hood, it composes `database.ts`, `lib/game/gate-check`, `lib/game/progression`, `lib/game/reconstruct`, `lib/game/streaks`, and `lib/game/week-progress`. That's a Facade — one surface, many subsystems.

**Take + Verdict:** Good Facade. The one weakness is that the interface is wide (14 properties) and not segregated by use case — every screen takes the full object, ignores most of it, and depends on the whole. Chapter 05 picks up that thread under Interface Segregation. Worth keeping; not worth restructuring as a pattern question.

### BRIEF — Factory: pose-processor factories

`createPushupProcessor`, `createSquatProcessor`, `createPlankProcessor`, `createPullProcessor`, `createBarPullProcessor`, `createTrxRepProcessor`, `createTrxHoldProcessor` — all factories returning closure-state objects. Clean functional idiom; no class soup.

**Take + Verdict:** Good. The Chapter 01 Parameterize-Function take (`createElbowRepProcessor` / `createKneeRepProcessor`) would consolidate three of these without breaking the factory shape — they'd still be factories, just one factory parameterized instead of three near-clones.

### BRIEF — Observer / Pub-Sub: the write→sync fan-out

`pushChanges().catch(() => {})` after every db write is a hand-rolled "every writer publishes to every subscriber" pattern, expressed by having each writer do the publish inline. It's Observer-shaped without the indirection.

**Take + Verdict:** Worth converting to a real one-event-many-subscribers bus when a second consumer of writes appears (analytics, conflict detection, optimistic-UI invalidation). Until then, it's a structural problem (Chapter 02) more than a patterns problem. Don't introduce Observer for its own sake.

### Chapter close

**Take:** Patterns in this codebase are mostly the right ones already, applied in mostly the right places. The two DEEP opportunities — uniform dispatch-table for processor picking, and an explicit gate FSM — are both cases where the *pattern* already exists in the codebase but isn't applied uniformly. That's a much better problem to have than "we picked the wrong pattern." The codebase's overall taste in patterns is good: Strategy when it earns its keep, Adapter as the boundary file, Factory closures instead of class hierarchies, no premature DI, no Builder for two-parameter objects. If anything, the codebase under-uses patterns relative to its size — and that's the correct posture for an app of this scale.
