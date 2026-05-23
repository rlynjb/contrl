## Chapter 1 — Composition refactors

Small, named, behaviour-preserving operations applied within a file or across a couple of closely related files. Highest-frequency category — most refactors in this codebase belong here. They're cheap, they're safe, and they're often the precondition for any larger structural move.

### Map of the territory

- **Extract Function / Method** — **DEEP**: per-exercise breakdown computation in `log/[category].tsx`. BRIEF elsewhere.
- **Inline Function / Inline Variable** — NOT FOUND of real value.
- **Move Function / Move Field** — BRIEF: `isHoldFromTempo` derivation duplicated in `database.ts` and `mapper.ts`.
- **Rename** — MENTION: `session.passed` field overloads "all hit target" with "gate passed."
- **Extract Variable** — NOT FOUND of real value.
- **Split Phase** — **DEEP**: `useGameState.logSession` does evaluate → persist gate → update week → clear draft in one function.
- **Replace Conditional with Polymorphism / Dispatch Table** — **DEEP**: `SetCameraOverlay`'s processor picker is a nested ternary.
- **Decompose Conditional** — BRIEF: the result-screen color/title cascade.
- **Replace Magic Number with Named Constant** — BRIEF: `>= 3` gate threshold sprinkled in three files.
- **Parameterize Function** — BRIEF: pushup, squat, and bar-pull processors are near-identical clones.
- **Remove Dead Parameter** — NOT FOUND.

### DEEP — Extract Function: per-exercise breakdown computation

**Where it shows up** (neutral)
- `app/log/[category].tsx:177–216` — `handleSave` builds an `ExerciseBreakdown[]` by walking `levelExercises` and `exerciseState[i]`, computing `earned`/`total`, the per-set `shortSets[]` (typed `'short' | 'unchecked'`), and `allHit`.
- `src/hooks/useExerciseForm.ts:136–162` — `buildSession` walks the same two arrays and computes `hitTarget` per `ExerciseEntry`, with the same loop shape: iterate `checkedSets.length`, branch on `ex.isHold`, compare `actualReps[s]`/`actualHoldSeconds[s]` against `targetReps`.

The two functions produce different shapes (one builds the UI's `ExerciseBreakdown`, the other builds the persisted `ExerciseEntry`) but compute the same fact: "did each set hit, and what was the shortfall." The cleanliness criterion (`hitTarget`) is rederived from raw inputs in both places instead of being computed once.

**Why it's like this** (neutral)
`useExerciseForm.buildSession` came first and produces the persisted shape. The breakdown computation in `handleSave` was added later to feed the result screen and chose to recompute from `exerciseState` directly because it needed `shortSets` (which `ExerciseEntry` doesn't carry). The cheapest way to add `shortSets` was to redo the loop from scratch.

**Take**
Pull the loop body into a function that takes one `(exercise, formState)` pair and returns a richer per-exercise summary — `{ entry: ExerciseEntry, breakdown: ExerciseBreakdown }`. Then `buildSession` returns `entries.map(r => r.entry)`, and the screen takes `result.breakdown` directly. The current arrangement has two readers of the same loop checking each other's correctness in human heads instead of in the type system; that's the kind of thing that quietly drifts when `targetReps` semantics change or when a third actual-value type lands.

**The tradeoff**
The cost of doing it is a new type and a slightly wider return from one of the hooks. The cost of not doing it is that any change to the cleanliness criterion (e.g. partial credit, RPE-aware scoring) requires touching two places that look unrelated until you read them. **Breakpoint:** the moment a third reader appears — a "session insights" page, a streak calculator that wants per-exercise misses — this gets done whether you scheduled it or not.

**What I'd watch for**
The two loops *look* identical but aren't quite. `buildSession` uses `state.checkedSets.length` as its loop bound and sets `hitTarget = false` if `checkedCount < ex.targetSets`. `handleSave`'s loop uses `ex.targetSets` as the bound and treats unchecked sets as `'unchecked'`-typed shortfalls. If you collapse them naively you'll lose one of those distinctions. Read both carefully before you start.

**Verdict:** Worth doing.

### DEEP — Split Phase: `logSession`

**Where it shows up** (neutral)
- `src/hooks/useGameState.ts:174–269` — `logSession` does five things in sequence: insert session, evaluate cleanliness into a `SessionResult`, advance the gate FSM (with branching for level-up), persist the gate(s), update week progress, and clear the draft. The function reads its dependencies from three `useRef`s to bypass closure staleness.

**Why it's like this** (neutral)
React Hooks reward "one function does the whole transaction" because each `setState` is async, and the function needs the *post-this-call* values to make the next decision. The refs are a workaround for that, and they're correct. The shape of the function followed the shape of the problem.

**Take**
The function works. The problem is that the gate FSM logic — `if (isClean) consecutivePasses++ else 0; if 3 then passed; if passed && current-level && < MAX_LEVEL then level up` — also lives in `src/lib/game/reconstruct.ts:32–61` in almost the same shape. That's two places that have to agree about what "clean" means, what the 3-pass threshold means, and what happens at level cap. Split `logSession` so that the *evaluate* phase produces a `SessionResult` (which it already does) and the *advance gate* phase is a pure function from `(currentGate, sessionResult, userLevel) → { nextGate, leveledUp, newLevel? }`. Then both `logSession` and `reconstructFromSessions` call the same advancer.

**The tradeoff**
Cost of doing it: one new pure function in `lib/game/`, a hook that becomes a thin orchestrator over the pure function and the writers. Cost of not doing it: the gate FSM has two sources of truth, and the next time you tweak it (RPE, partial credit, gate-decay) you'll change one and forget the other. **Breakpoint:** the moment somebody asks for a feature that touches "what counts as a clean session" — and they will.

**What I'd watch for**
The level-up branch in `logSession` mutates `userCopy` and also writes a new gate for the next level (lines 233–250). The reconstruct version does it inline in the loop (lines 51–55). When you collapse them, decide whether the advancer returns the next-level gate too or whether the caller creates it — these are the kind of decisions where "consistent with what's there" is a real constraint.

**Verdict:** Worth doing.

### DEEP — Replace Conditional with Dispatch Table: `SetCameraOverlay` processor picker

**Where it shows up** (neutral)
- `src/components/camera/SetCameraOverlay.tsx:46–53` — a nested ternary picks the pose processor for the active set:

  ```ts
  category === 'pull'
    ? createPullProcessor(exercise)
    : exercise.isHold
      ? { type: 'plank', processor: createPlankProcessor() }
      : category === 'squat'
        ? { type: 'rep', processor: createSquatProcessor() }
        : { type: 'rep', processor: createPushupProcessor() }
  ```
- `src/lib/pose/exercises/pull.ts:6–31` does the same dispatch one level deeper — but cleanly, via an `EXERCISE_CONFIGS: Record<string, PullExerciseConfig>` lookup with a `DEFAULT_CONFIG` fallback.

**Why it's like this** (neutral)
The overlay was written when there were two exercise types (rep and hold) and one category split (push vs. squat). Pull was added later and brought its own internal dispatch in `pull.ts`. The top-level overlay didn't get refactored to match the dispatch-table shape that already existed one layer down.

**Take**
The pattern is already in this codebase, one file away. Match it. A dispatch keyed on `(category, isHold)` with a fall-through to push-up gets you Open/Closed at the call site — adding a new category (e.g. legs/core) becomes a one-line addition to the map. The current ternary requires editing the chain, which is exactly the shape that produces "I added the case but forgot the else."

**The tradeoff**
Cost: ~15 lines of map construction. Cost of not doing it: every new exercise category re-edits the ternary. **Breakpoint:** the moment you add a fourth category or a second hold variant. You're already close — `pull` already has `trx-dead-hang` which is a hold variant that goes through `pull.ts`'s internal dispatch.

**What I'd watch for**
The processor objects don't share an interface — the rep processor exposes `processFrame(landmarks)` returning a `repCount`; the plank processor exposes `processFrame(landmarks, deltaMs)` returning a `holdTimeMs`. The dispatch table has to either tag the discriminator on the result (which it already does — `{ type: 'rep' | 'plank', processor }`) or you introduce a thin uniform interface. The current tagged union is fine; don't over-engineer this into a full Strategy class hierarchy.

**Verdict:** Worth doing.

### BRIEF — Move Function: `isHoldFromTempo` derivation

`src/services/database.ts:289` (`rowToExercise`) and `src/services/sync/mapper.ts:67` (`exerciseFromRemote`) both derive `isHold` with the literal expression `(r.tempo ?? '') === 'Steady'`. That's a domain rule sitting in two adapter functions.

**Take + Verdict:** Extract to `lib/game/exercise.ts` (or just `types/index.ts`) as `isHoldFromTempo(tempo: string | null | undefined): boolean`. One line each, both sites become the same line, and the magic string `'Steady'` lives in one place. Worth doing — it's a five-minute change that prevents the next variant ("Steady-Slow"? "Iso"?) from drifting between local and remote readers.

### BRIEF — Decompose Conditional: result-screen header cascade

`app/log/[category].tsx:281–297` — three parallel ternaries pick `headerColor`, `headerTitle`, and `barColor` from the same `(result.gatePassed, result.passed)` 2-bit state.

**Take + Verdict:** Three ternaries with three independent branches over the same two predicates is the textbook case for one function that returns `{ headerColor, headerTitle, barColor }`. Or, more directly: a `RESULT_STATES: Record<'gate-passed' | 'clean' | 'logged', { color, title, barColor }>` map and one `pickState(result)` function. Worth doing.

### BRIEF — Replace Magic Number: gate threshold

`>= 3` (the consecutive-passes-needed-to-pass-a-gate threshold) appears in `src/hooks/useGameState.ts:215`, `src/lib/game/reconstruct.ts:48`, and is implied across `gate-check.ts` and the UI ("3/3" displayed in `SkillTree.tsx:307`).

**Take + Verdict:** Hoist to `lib/game/constants.ts` as `GATE_PASSES_REQUIRED = 3` (or fold it into `MAX_LEVEL`'s neighborhood). It's a small thing but it's three uncoordinated `3`s right now. Worth doing — the moment you tweak the difficulty (e.g. require 5 in higher levels), you'll regret not having a name.

### BRIEF — Parameterize Function: rep-processor clones

`src/lib/pose/exercises/pushup.ts`, `squat.ts`, and `pull-bar.ts` are 48 lines each and structurally identical: a `RepCounter` with thresholds + a `smoothedAngle` state + a `processFrame(landmarks)` that picks three landmarks, computes an angle, smooths it, feeds the counter. The only differences are (a) which three landmarks, (b) the `readyAngle`/`bottomAngle` constants.

**Take + Verdict:** Parameterize into `createElbowRepProcessor({ landmarks: (lm) => [shoulder, elbow, wrist], config })` + `createKneeRepProcessor`. Or one `createAngleRepProcessor({ pickJoints, config })`. There's a real cost to over-DRYing pose math (the next exercise might want a different angle definition, or an aspect-ratio metric instead of a joint angle) — but at three identical clones you've passed the threshold where "I'll dedupe when there's a fourth" stops being honest. Worth doing.

### MENTION — line items

- Rename `session.passed` on `WorkoutSession` (`types/index.ts:65`) — it means "all entries hit target," which is what `passed` reads as on its own, but in context it shadows the gate-`passed` state. Pick one of `allTargetsHit`, `isClean`, or just `clean`. Worth a rename when you next touch the file.
- `getMessage` (`log/[category].tsx:41`) duplicates the message ladder in `getCompletionMessage` (`session-helpers.ts:44`) — but `session-helpers.ts` is dead code (see Chapter 02). Either consolidate to one helper file *and* delete the dead module, or just inline the live one. Don't dedupe into the dead file.
- `Pressable` set-row checkbox renders three icons by ternary in `log/[category].tsx:573–579`. Trivial extract to a `<SetCheckboxIcon status={...} />` once you're already in this file.
- `formatShortDate` in `app/(tabs)/history.tsx:245` is a one-liner that could live in `lib/format.ts` alongside `formatTimeSince` from `app/settings/index.tsx:11`. Both are tiny enough that combining them isn't urgent.

### Chapter close

**Take:** The composition opportunities here cluster around two facts: there's one screen file that grew too long to maintain SRP at the function level (`log/[category].tsx`), and there's one hook (`useGameState`) that consolidates an entire layer's worth of transactions into one orchestrating function. Both shapes are common in React apps that scaled from prototype to working app without a redrawing pass. The good news: every DEEP refactor in this chapter is local — none of them require renaming a domain type, changing the database schema, or moving files across module boundaries. They're the cheap ones to start with. If you want to spend an hour on this codebase, spend it here.
