# Pull complexity downward
### Avoidable configuration · over-parameterization — Industry standard (APOSD ch. 8)

> When a module has enough information to make a decision itself, but exposes it to the caller as a parameter, complexity has been pushed in the wrong direction. The cure is to absorb the knob.

## Zoom out, then zoom in

Imagine `Array.prototype.sort()` exposing every choice it could make: stable vs unstable, locale-aware vs binary, null-first vs null-last, in-place vs copy. The caller would have to make every decision every time. The actual `sort()` picks sane defaults and hides them. That's complexity pulled downward.

```
  Zoom out — direction of complexity

  ┌─ caller ────────────────────────────────┐
  │  decides:  knob1, knob2, knob3, knob4   │  ← LOTS of context
  └─────────────┬───────────────────────────┘     for the caller
                │ passes all knobs
  ┌─ module ────▼───────────────────────────┐
  │  applies knobs                           │  ← no decision-making here
  └─────────────────────────────────────────┘

  vs.

  ┌─ caller ────────────────────────────────┐
  │  decides:  just the input data           │  ← simple call
  └─────────────┬───────────────────────────┘
                │ passes data
  ┌─ module ────▼───────────────────────────┐  ★ THIS CONCEPT ★
  │  decides everything it can decide        │  ← absorbs the knobs
  │  from the data                           │
  └─────────────────────────────────────────┘
```

Zoom in. In contrl, `useExerciseForm.updateValue(exIdx, setIdx, value, isHold)` exposes an `isHold` boolean the module could read from its own state. That's a knob pushed up.

## Structure pass

Layers: UI / Hooks / Domain / Persistence.

Axis to trace: **does this decision need to live at this layer, or could the layer below decide?**

```
  Tracing the decision-location axis through contrl

  decision                          where it's made     where it COULD live
  ────────                          ────────────────    ──────────────────
  "is this set a hold (vs reps)?"   caller computes it  the form state
                                    + passes isHold      already knows
                                                         (5-3 finding)
  "which processor for this         caller picks         the exercise.category
   exercise category?"              createXProcessor     can dispatch (5-4)
  "is the database ready yet?"      caller passes        useDatabase() exists
                                    dbReady              and the hook can
                                                         consume it (5-2)
  "what's the landmark              hardcoded magic      a single config
   confidence threshold?"           number (0.5) in      constant per file
                                    two places           (5-5)
```

Seams: every push-up here happens at a layer boundary. The form layer pushes a hold/reps decision to the hook layer; the camera layer pushes processor selection to the screen layer; the hook layer pushes db-readiness to the screen layer. Same shape every time.

## How it works

#### Move 1 — the picture

The mental model is direction-of-information. Look at every parameter a module exposes and ask: "could the module have computed this from data it already has?"

```
  Pulling a knob downward, one move at a time

  before                              after
  ──────                              ─────
  updateValue(                        updateValue(
    exIdx,  ← needed                    exIdx,  ← needed
    setIdx, ← needed                    setIdx, ← needed
    value,  ← needed                    value   ← needed
    isHold  ← caller computes,          )
  )            but module knows
              from state[exIdx]         module reads isHold from its
                                        own form state — no caller input
```

The trick is that "the module already knows" usually means "the module's existing data answers the question." `useExerciseForm` already stores the per-exercise template (which says hold vs reps). The caller is re-deriving the answer from a worse source.

#### Move 2 — three pull-down opportunities in contrl

**Opportunity 1. `updateValue(isHold)` — the cleanest example.**

```
  src/hooks/useExerciseForm.ts (~line 120)

  // current
  function updateValue(
    exerciseIndex: number,
    setIndex: number,
    value: number,
    isHold: boolean,                ← passed in
  ) {
    if (isHold) {
      // update actualHoldSeconds
    } else {
      // update actualReps
    }
  }

  // caller (in a form component)
  const isHold = exerciseState[exIdx].actualHoldSeconds !== undefined;
  updateValue(exIdx, setIdx, value, isHold);
                                    ▲
                                    │
                          ┌─────────┴──────────────────────────┐
                          │ caller computes from form state.   │
                          │ but the hook OWNS the form state.   │
                          │ it could read it directly.         │
                          └────────────────────────────────────┘
```

The fix:

```
  // pulled down
  function updateValue(
    exerciseIndex: number,
    setIndex: number,
    value: number,
  ) {
    const entry = state[exerciseIndex];
    if (entry.actualHoldSeconds !== undefined) {
      // hold update
    } else {
      // rep update
    }
  }

  // caller
  updateValue(exIdx, setIdx, value);     ← one fewer thing to know
```

**Opportunity 2. `useGameStateInternal(dbReady)` — the parameter that vanishes.**

```
  src/hooks/useGameState.ts (~line 67)

  function useGameStateInternal(dbReady: boolean) { ... }

  // every caller
  const { ready } = useDatabase();
  const state = useGameStateInternal(ready);
                                    ▲
                                    │
                          ┌─────────┴──────────────────────────┐
                          │ dbReady is a hook-resolvable value.│
                          │ inner hook can call useDatabase()  │
                          │ itself.                            │
                          └────────────────────────────────────┘
```

The fix is to call `useDatabase()` inside `useGameStateInternal`. Now no caller has to know the dependency exists.

**Opportunity 3. Processor selection in the camera overlay.**

```
  src/components/camera/SetCameraOverlay.tsx (~lines 45-53)

  // the screen knows the exercise category and picks the processor
  const processor = useMemo(() => {
    if (exercise.category === 'push') return createPushupProcessor();
    if (exercise.category === 'squat') return createSquatProcessor();
    if (exercise.category === 'plank') return createPlankProcessor();
    ...
  }, [exercise.category]);
```

Two problems: the dispatch is in the screen layer (UI knows about processors), and the same dispatch will reappear anywhere else that creates a processor.

The fix:

```
  // src/lib/pose/exercises/index.ts
  export function createProcessorFor(exercise: Exercise): ExerciseProcessor {
    switch (exercise.category) {
      case 'push':  return createPushupProcessor();
      case 'squat': return createSquatProcessor();
      case 'plank': return createPlankProcessor();
      // ... TS exhaustiveness check
    }
  }

  // caller
  const processor = useMemo(
    () => createProcessorFor(exercise),
    [exercise.category]
  );
```

Now the screen layer passes the data (`exercise`), and the domain layer makes the decision.

#### Move 2 variant — the load-bearing skeleton of "pulling complexity down"

```
  Skeleton — the three parts

  1. THE DECISION
       a binary or N-way choice (which strategy? which field?
       what threshold?)

  2. THE DATA THAT ANSWERS IT
       a field on the module's owned state, OR an input
       it already receives, OR a constant that should be
       internal

  3. THE CALLER'S CURRENT BURDEN
       what the caller has to know or compute to make
       the choice
```

When all three exist and the data is already inside the module, the knob should be pulled down. When the data genuinely lives outside, the knob legitimately lives on the interface (e.g., `fetch(url, { method, body })` — the method is the caller's call).

#### Move 3 — the principle

> A module's job is to absorb decisions, not to expose them. Every parameter is a question the caller now has to answer. Pulling complexity downward means the module answers the questions it can answer from data it already has.

The misuse of this principle is over-pull — making the module configurable internally when callers genuinely have different needs. The discipline is "if all callers compute the parameter the same way from data the module already sees, pull it down. If callers compute it differently, leave it up."

## Primary diagram

```
  contrl's pushed-up knobs

  ┌─ caller side ─────────────────────────────────────────────────┐
  │                                                                │
  │  updateValue(exIdx, setIdx, value, ★isHold)                   │
  │                          ┌─────────▲──────────────┐            │
  │                          │ pushed up: form state    │           │
  │                          │ already says hold/reps   │           │
  │                          └──────────────────────────┘           │
  │                                                                 │
  │  useGameStateInternal(★dbReady)                                │
  │                       ┌──▲─────────────────────────┐           │
  │                       │ pushed up: hook could call  │           │
  │                       │ useDatabase() itself        │           │
  │                       └──────────────────────────────┘          │
  │                                                                 │
  │  createXProcessor() — picked by ★category dispatch in screen   │
  │                            ┌──▲─────────────────────┐           │
  │                            │ pushed up: belongs in    │          │
  │                            │ lib/pose/exercises/      │          │
  │                            └──────────────────────────┘         │
  │                                                                 │
  └───────────────────────────┬───────────────────────────────────┘
                              │
                              │  PULL DOWNWARD
                              ▼
  ┌─ module side ─────────────────────────────────────────────────┐
  │  module reads what it needs from its own state and constants  │
  │  caller passes only the actual input (the user's value, the   │
  │  exercise object)                                              │
  └────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### The hold/reps knob

```ts
src/hooks/useExerciseForm.ts (~line 120)

  // current
  function updateValue(
    exerciseIndex: number,
    setIndex: number,
    value: number,
    isHold: boolean,                       ← knob
  ) {
    setExerciseState(prev => {
      const next = [...prev];
      const entry = { ...next[exerciseIndex] };
      const sets = [...entry.sets];
      if (isHold) {
        sets[setIndex] = { ...sets[setIndex],
                           actualHoldSeconds: value };
      } else {
        sets[setIndex] = { ...sets[setIndex],
                           actualReps: value };
      }
      ...
    });
  }
```

The data that already answers `isHold`: `exerciseState[exerciseIndex].sets[setIndex]` has either `actualReps` or `actualHoldSeconds` defined on the template (the exercise's `targetReps` vs `targetHoldSeconds` config decides which). The form is initialized with one or the other. The caller is re-deriving a fact the hook already knows.

### The dbReady knob

```ts
src/hooks/useGameState.ts (~line 67)

  function useGameStateInternal(dbReady: boolean) {
    useEffect(() => {
      if (!dbReady) return;
      // load all the things
    }, [dbReady]);
    ...
  }

  // caller (likely in app/_layout.tsx or a screen)
  const { ready: dbReady } = useDatabase();
  const game = useGameStateInternal(dbReady);
```

The fix: the inner hook calls `useDatabase()` directly. The caller calls `useGameStateInternal()` with no arguments. The "is the DB ready" question is now answered where it can be answered — inside the hook that needs it.

### The processor-selection knob

```ts
src/components/camera/SetCameraOverlay.tsx (~lines 45-53, paraphrased)

  // current — screen-level dispatch
  const processor = useMemo(() => {
    switch (exercise.category) {
      case 'push':  return createPushupProcessor();
      case 'squat': return createSquatProcessor();
      case 'plank': return createPlankProcessor();
      case 'pull':  return createPullupProcessor();
    }
  }, [exercise.category]);
```

The caller is choosing among siblings. The siblings know which exercise they handle. The dispatch belongs alongside the siblings.

### Magic numbers as pushed-up knobs

```ts
src/components/camera/SetCameraOverlay.tsx (~lines 69-77, paraphrased)

  // confidence threshold repeated in two checks
  const validLandmarks = landmarks.filter(l => l.visibility >= 0.5);
  if (validLandmarks.length < REQUIRED_FOR_PUSH) return;
  // ...
  if (someOtherCheck.visibility >= 0.5) ...
```

Two sites, same magic number. The "what counts as a visible landmark?" decision is duplicated. Pull it down:

```ts
// src/lib/pose/landmarks.ts
export const LANDMARK_VISIBILITY_THRESHOLD = 0.5;
export function isVisible(l: Landmark): boolean {
  return l.visibility >= LANDMARK_VISIBILITY_THRESHOLD;
}
```

Now changing the threshold is one edit. Better still, the `isVisible` predicate is what most callers actually want — they don't care about the number.

## Elaborate

There are two common over-corrections to this primitive:

- **The "make it configurable" instinct.** When you anticipate a future use case ("what if someone wants a different threshold?"), you turn an internal constant into a parameter. Usually the use case never arrives. The caller is now asking "what threshold should I pass?" — a question they shouldn't have to answer.
- **The "explicit is better than implicit" reflex.** Pulling complexity down can look like hiding behavior. It is — that's the point. APOSD argues directly against the "explicit is better" framing for module interfaces: explicit at the call site means duplicated decisions across call sites, which means inconsistency.

The principle's strength is recognizing **which decisions a module is qualified to make.** A module is qualified when (a) it sees the data the decision depends on, and (b) it can keep the decision consistent across calls. When both hold, pull down. When only one holds, leave the knob up.

The `isHold` parameter in `useExerciseForm` is a perfect candidate because the hook already owns the form state. The "threshold" magic number in `SetCameraOverlay` is a perfect candidate because no caller actually has an opinion on what the right threshold is — it's an internal tuning parameter that happened to be inlined.

## Interview defense

**Q: "Where in this code is complexity pushed in the wrong direction?"**

```
  ┌─ Three knobs, ranked by pulldown payoff ──────────────────────┐
  │                                                                │
  │  1. updateValue(isHold)  — hook already owns the answer       │
  │  2. useGameStateInternal(dbReady) — hook can consume its own  │
  │     dependency                                                 │
  │  3. processor selection in the camera screen — belongs at     │
  │     lib/pose/exercises level                                   │
  │                                                                │
  │  Pattern: every one is "caller computed something the         │
  │  module already had data to compute."                          │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "the caller shouldn't be doing the module's homework."

**Q: "When is exposing a knob the right call?"**

When different callers genuinely have different needs. `fetch(url, { method })` is right because POST and GET are caller intent, not module business. The test is: do callers actually compute the parameter, or do they all pass the same value derived the same way?

**Q: "Why is it dangerous to over-pull?"**

You can make a module non-configurable for a real use case that emerges later. The discipline is to pull what callers compute identically; leave alone what callers compute differently. When in doubt, leave the knob — adding a default is easier than retracting a parameter.

## Validate

1. **Reconstruct.** Sketch one example of a pulled-up knob in contrl from memory.
2. **Explain.** Why is `isHold` a pull-down candidate but `method` in `fetch(url, { method })` is not?
3. **Apply.** Rewrite `updateValue` with `isHold` pulled down. Where does the hook read the answer from?
4. **Defend.** Argue that explicit `isHold` is clearer and you should keep it. Then rebut.

## See also

- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md) — pull-down is one of the moves that makes a module deeper
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md) — pass-through variables are knobs pushed through a layer
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — pulled-up knobs leak the module's internal decisions
- [08-red-flags-audit.md](./08-red-flags-audit.md) — knob severity ranking
