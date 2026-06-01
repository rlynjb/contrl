# Deep vs shallow modules
### Deep module · classitis · interface-to-body ratio — Industry standard (APOSD ch. 4)

> The single most important primitive. A module's job is to provide functionality with the smallest possible interface. Inventory contrl's modules by depth (functionality ÷ interface size) and name the best example and the worst.

## Zoom out, then zoom in

A module is two things: an **interface** (what callers see) and an **implementation** (what it hides). Depth is the ratio. Deep = small interface, rich behaviour. Shallow = interface as big as the body.

```
  Zoom out — depth is interface area vs body

  ┌─ UI layer ──────────────────────────────────┐
  │  callers — each line is a use of an interface│
  └────────────────────┬────────────────────────┘
                       │  ← THIS LINE IS THE INTERFACE
  ┌─ Module ───────────▼────────────────────────┐
  │  body — the work the caller didn't have to  │ ★ THIS CONCEPT ★
  │  do, the cases handled, the invariants kept │
  └──────────────────────────────────────────────┘

  deep  = thin line, fat box
  shallow = fat line, thin box (= classitis)
```

Zoom in. In contrl, `rep-counter.ts` is deep: one `RepCounter` class, a tiny interface, a real state machine inside. `sync/mapper.ts` is shallow: ten near-identity functions where the interface IS most of the body.

## Structure pass

Layers, in contrl: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **interface surface area** (how many decisions does this module ask the caller to make?).

```
  Tracing interface size across modules

  module                          interface size   body size   depth
  ──────                          ──────────────   ─────────   ─────
  lib/pose/rep-counter.ts         tiny (1 class,   86 LOC      DEEP
                                  3 methods)
  lib/game/reconstruct.ts         tiny (1 pure fn) 72 LOC      DEEP
  lib/game/week-progress.ts       wide (5 utils)   65 LOC      shallow
  services/sync/mapper.ts         very wide        155 LOC     VERY SHALLOW
                                  (10 functions,                (≈ classitis)
                                  any types)
  hooks/useExercises.ts           narrow but       31 LOC      shallow
                                  exposes loading/             (pass-through)
                                  reload to caller
```

Seam: at the **mapper** seam (sync ↔ persistence) the interface is wider than what's behind it. Every caller has to know every field name and the bidirectional rule. That's the shallow boundary.

## How it works

#### Move 1 — depth as a picture

You already build with this. Compare `Array.prototype.sort()` and `Array.prototype.sortBy(key, dir, nulls, locale)`. The standard `sort()` hides a comparator decision; `sortBy` makes you make it. Same job, very different depth.

```
  Two modules, same job, different depth

  Deep                                 Shallow
  ┌─ interface ─┐                      ┌─ interface ────────────────┐
  │ sort()      │                      │ sortBy(key, dir, nulls,    │
  └──────┬──────┘                      │        locale, stable)     │
         │ hides:                       └──────┬─────────────────────┘
         ▼                                     │ hides: very little
  ┌─ body ──────────────┐                      ▼
  │  comparator picking, │              ┌─ body ──────────────────────┐
  │  null handling,      │              │  applies parameters         │
  │  stability, locale   │              │  (which the caller already  │
  └─────────────────────┘                │   computed)                 │
                                         └─────────────────────────────┘
```

The shallow version isn't *wrong* — it's just leaking decisions the module had enough information to make.

#### Move 2 — measuring depth

Three sub-steps when you audit a module:

**Step 1. Count the interface.** Public functions × parameters per function × types you have to know. Not just function count — total cognitive surface a caller faces.

```
  Interface size walk — rep-counter.ts

  class RepCounter                                    interface = ~5 things
    constructor(config)                               1. construct it
    feed(angle: number): RepEvent | null              2. feed an angle
    reset(): void                                     3. reset it
                                                      4. config type (small)
                                                      5. RepEvent type
                                                         (union: tiny)
```

**Step 2. Count the body.** Lines, branches, state owned. Specifically: what work does the caller NOT have to do because this module exists?

```
  Body walk — rep-counter.ts

  · 5-phase FSM (idle → ready → down → bottom → up)
  · hysteresis dead-zone to prevent ping-pong
  · smoothing across noisy frames
  · per-exercise threshold config
  · rep counting + event emission
  → caller writes none of this; just feeds angles
```

**Step 3. Compare them.** Five-line interface, 86-line body of real state-machine work. That's a deep module.

**Step 4 (the contrast). Run the same walk on a shallow one.**

```
  Interface vs body — sync/mapper.ts

  interface (10 exported functions):
    sessionToRemote(s)         sessionFromRemote(r: any)
    exerciseToRemote(e)        exerciseFromRemote(r: any)
    gateProgressToRemote(g)    gateProgressFromRemote(r: any)
    weekProgressToRemote(w)    weekProgressFromRemote(r: any)
    userProfileToRemote(u)     userProfileFromRemote(r: any)

  body (per function, typical):
    { id: x.id,                                  ← rename + pass through
      user_id: USER_ID,                          ← inject constant
      target_sets: x.targetSets, ...             ← rename + pass through
      created_at: x.createdAt }                  ← rename + pass through

  → the body IS the interface, just a rename pass.
    classitis: each function is "a wrapper" with nothing wrapped.
```

#### Move 2 variant — the load-bearing skeleton of "deep module"

Strip a deep module to its minimum and you find:

1. **A small interface** (the public API)
2. **An invariant the body owns** (a guarantee the caller doesn't have to maintain)
3. **State the caller never sees** (the hidden complexity)

```
  Skeleton — what makes a module deep

  ┌─ public interface (small) ──┐
  │  3-5 methods, narrow types  │
  └─────────────┬───────────────┘
                │
  ┌─ owned invariant ───────────┐
  │  "rep count is monotonic"   │ ← what would break
  │  "FSM stays in valid state" │   if you removed
  └─────────────┬───────────────┘   the module
                │
  ┌─ hidden state ──────────────┐
  │  current phase, smoothed    │ ← caller never
  │  angle, hysteresis buffer   │   touches this
  └─────────────────────────────┘
```

Drop the invariant and you have a procedure that the caller could inline. Drop the hidden state and the invariant has nowhere to live. The three together = "deep module." Two of three = a wrapper.

#### Move 3 — the principle

> Each module should provide functionality, not a 1:1 mapping over a data shape. If the function does nothing but rename fields, it isn't a module — it's a misplaced expression.

The cure for a shallow module isn't to add docs or split it up; it's to give it real work. Either it absorbs decisions the caller is currently making, or it shouldn't exist as a module.

## Primary diagram

```
  contrl's modules, plotted by depth

   body                              ┌─ rep-counter.ts ─┐
   ▲                              ★  │  deep: FSM logic  │
   │                                 │  hidden behind     │
   │                                 │  feed(angle)       │
   │              ┌─ reconstruct.ts ┐└────────────────────┘
   │           ★  │  deep: full     │
   │              │  game state      │
   │              │  rebuilt from   │
   │              │  sessions       │
   │              └─────────────────┘
   │
   │  ┌─ useExercises.ts ──────┐
   │  │ shallow: hook wrapping  │
   │  │ a getter, exposes      │
   │  │ loading + reload to    │
   │  │ caller                 │
   │  └────────────────────────┘
   │
   │  ┌─ sync/mapper.ts ──────────────────┐
   │  │ very shallow: 10 rename functions │ ← classitis
   │  │ over `any`. body == interface.    │
   │  └───────────────────────────────────┘
   ──────────────────────────────────────────────► interface size
```

## Implementation in codebase

### The deepest: `src/lib/pose/rep-counter.ts`

```ts
src/lib/pose/rep-counter.ts  (86 LOC)

export class RepCounter {
  constructor(config: RepCounterConfig) { ... }   ← tiny construction surface
  feed(angle: number): RepEvent | null { ... }    ← ONE method does the work
  reset(): void { ... }                           ← obvious

  // hidden:
  // - phase: 'idle'|'ready'|'down'|'bottom'|'up'  ← FSM state, caller never sees
  // - smoothedAngle, prevAngle                    ← noise handling
  // - hysteresis dead zone                        ← invariant
}
```

Why this is deep: callers feed angles one at a time and get a rep event when one happens. The 5-phase FSM, the smoothing, the hysteresis — none of that touches the caller. The same caller works whether you upgrade to a more elaborate detection algorithm or fix a bug in the FSM. That's depth.

### Another deep one: `src/lib/game/reconstruct.ts`

```ts
src/lib/game/reconstruct.ts  (72 LOC)

export function reconstructFromSessions(
  sessions: WorkoutSession[],                  ← input: just the sessions
  user: User
): { user: User, gates: GateProgress[] }       ← output: game state
{
  // hidden:
  // - 3-consecutive-pass logic
  // - level-up cascade
  // - per-category gate tracking
  // - "skip session > current level" rule
}
```

One pure function, two parameters, two outputs, a real game-rule engine inside. Reinstall recovery uses this. Day-to-day session logging could (and should) use this. It's the deepest module in `src/lib/game/`.

### The worst offender: `src/services/sync/mapper.ts`

```ts
src/services/sync/mapper.ts  (155 LOC, 10 functions)

export function sessionToRemote(s: WorkoutSession) {
  return {
    id: s.id,
    user_id: USER_ID,                          ← inject constant
    date: s.date,
    exercises_json: JSON.stringify(s.exercises),
    notes: s.notes ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}                                              ← ← caller decides every field

export function sessionFromRemote(r: any) {    ← any! no schema!
  return {
    id: r.id,
    date: r.date,
    exercises: JSON.parse(r.exercises_json),   ← can throw, never caught
    ...
  };
}
```

Why this is shallow: ten of these. The interface is "know every field of every type, both directions." The body is "rename them." A caller mapping a new field has to edit the mapper AND the schema AND the type — three files for one fact. That's classitis with extra steps.

Fix: derive one mapping from the schema (or generate from Supabase types) and keep one function that does the renaming for all types. The interface drops to one entry point; the body owns "this is how the local→remote convention works."

### Almost-classitis: `src/lib/game/week-progress.ts`

```ts
src/lib/game/week-progress.ts  (65 LOC)

export function getWeekStart(date: Date): string { ... }       ← 5 utility
export function getWeekEnd(date: Date): string { ... }            functions,
export function isWeekComplete(week: WeekProgress): boolean       each tiny,
export function buildWeekHistory(sessions, weeks)                 caller has
export function needsWeekReset(week, today): boolean              to compose
                                                                  them
```

Every caller has to call `getWeekStart()` and then do something with it. The module exposes the primitives; the caller assembles. The deep version would expose one `getCurrentAndPastWeeks(sessions, now)` that returns the structured result the caller actually wants, and hide the date arithmetic. (`buildWeekHistory` is close — but it still re-calls `getWeekStart` internally because the helper is exposed.)

## Elaborate

The most-quoted line from APOSD is "classes should be deep." It's deceptively simple. The point isn't that classes are good and not-classes are bad; the point is that **functionality per interface unit** is the right thing to optimize for.

Most languages and most teams default to shallow. Shallow modules feel safer ("I can see exactly what it does"). Shallow modules are easier to write the first time. Every shallow module is a deferred design decision — the caller will make the decision instead, in five different places, slightly differently each time.

The deep modules in contrl all got that way because someone resisted the urge to "just expose the helper." `RepCounter` could have been four functions (`initPhase()`, `transitionPhase()`, `countRep()`, `smooth()`). The deeper choice — one class, three methods — pays off the first time you change the FSM and nothing outside the file moves.

## Interview defense

**Q: "What's a deep module? Give me an example from your code."**

```
  the answer in three beats

  ┌─ definition ──────────────────────────────────┐
  │  small interface, rich behaviour. interface   │
  │  ÷ body is small.                              │
  └────────────────────────────────────────────────┘

  ┌─ example from contrl ─────────────────────────┐
  │  RepCounter in src/lib/pose/rep-counter.ts    │
  │                                                │
  │  interface:  new RepCounter(config)            │
  │              .feed(angle) → RepEvent | null    │
  │              .reset()                          │
  │                                                │
  │  body:       5-phase FSM, smoothing,           │
  │              hysteresis, per-exercise config   │
  └────────────────────────────────────────────────┘

  ┌─ contrast ────────────────────────────────────┐
  │  sync/mapper.ts is the inverse: 10 functions, │
  │  each renames fields. body ≈ interface.       │
  └────────────────────────────────────────────────┘
```

Anchor: "depth is body ÷ interface, and `RepCounter` is the deepest module in this codebase."

**Q: "When would you make a module shallow on purpose?"**

When the module's job genuinely is just exposure — a thin DB wrapper, a typed config reader, a public type re-export. Shallow isn't always wrong; *unintentionally* shallow is. The mapper is unintentional; it grew one function per type.

**Q: "How do you tell shallow from a clean adapter?"**

A clean adapter hides a real impedance mismatch (camelCase ↔ snake_case is one such mismatch, but you only need one function to express it, not ten). When the module's interface has the same N×M shape as the underlying systems, it's not adapting — it's re-exposing.

## Validate

1. **Reconstruct.** Draw the interface-vs-body picture for any one contrl module from memory.
2. **Explain.** Why is `RepCounter` deep and `sync/mapper.ts` shallow? Use the same words: interface size, body size, what's hidden.
3. **Apply.** Sketch a "deep" version of `sync/mapper.ts`. What's its one public function? What does it hide?
4. **Defend.** Argue that the mapper is fine because "each function does one thing well." Then rebut the argument.

## See also

- [01-complexity-in-this-codebase.md](./01-complexity-in-this-codebase.md) — depth is the cure for cognitive load
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — the mapper's shallowness is also a leak
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md) — most "layers" that don't earn their place are shallow modules
- [08-red-flags-audit.md](./08-red-flags-audit.md) — shallow-module severity ranking
