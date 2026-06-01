# Layers and abstractions
### Pass-through method · pass-through variable · adjacent same-shape layers — Industry standard (APOSD ch. 7)

> Each layer should provide a different abstraction. When two adjacent layers offer the same shape, one of them isn't earning its place.

## Zoom out, then zoom in

A good layer transforms. The transport layer hides "TCP is bytes"; the HTTP layer hides "messages are wrapped in headers"; the application layer hides "users have sessions." Each adds information the layer below didn't have.

```
  Zoom out — layers should transform, not echo

  ┌─ caller ──────────────────────────────────┐
  │  expects: useExercises() → list           │
  └──────────────────────┬────────────────────┘
                         │
  ┌─ hook layer ─────────▼────────────────────┐
  │  useExercises()                            │ ★ THIS CONCEPT ★
  │  ── pass-through:                          │   does it transform?
  │     getExercises() + loading + reload      │
  └──────────────────────┬────────────────────┘
                         │
  ┌─ persistence layer ──▼────────────────────┐
  │  getExercises()                            │
  │  ── reads exercises table                  │
  └────────────────────────────────────────────┘
```

Zoom in. In contrl, the hooks layer and the persistence layer offer the same shape several times. The hook adds a loading flag and a reload trigger — useful, but not a different *abstraction*. That's a pass-through layer.

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **what does this layer add that the layer below doesn't have?**

```
  Tracing "added value" up the stack

  layer                what it adds over the layer below
  ─────                ─────────────────────────────────
  UI                   visual + interaction
  Hooks (useExercises) loading flag + reload token       ← thin add
  Hooks (useGameState) orchestration + game-rule logic   ← thick add (too much)
  Domain (lib/game/)   pure rules over typed state       ← real abstraction
  Persistence          SQL + JSON parsing                ← real abstraction
  Sync                 watermarks + bidirectional map    ← real abstraction
```

Seams that flip the axis: between `useExercises()` and `getExercises()` the axis answer is "almost nothing." Between `useGameState` and `lib/game/`, it's "everything is added here" — but in a bad way (the hook is doing the domain layer's work).

## How it works

#### Move 1 — the pass-through, as a picture

A pass-through method is a layer that doesn't add anything the layer below didn't already have. The caller could have called the inner layer directly.

```
  Pass-through: the layer is invisible to value

  ┌─ caller ────────────────┐
  │  calls outer.f(x)        │
  └────────────┬─────────────┘
               │
  ┌─ outer ────▼─────────────┐
  │  function f(x) {          │   ← no work
  │    return inner.f(x);    │     done here
  │  }                        │
  └────────────┬─────────────┘
               │
  ┌─ inner ────▼─────────────┐
  │  function f(x) { ... }   │
  └──────────────────────────┘

  → if you delete outer.f, the caller can call inner.f
    with the same arguments. outer.f wasn't earning its keep.
```

You already use the inverse. `Array.prototype.filter(predicate)` doesn't pass-through to a `_filterImpl(this, predicate)`; the public method IS the work. Pass-through is the anti-pattern.

#### Move 2 — three flavors in contrl

**Flavor 1. Pass-through methods.**

```
  src/hooks/useExercises.ts  (the whole hook, ~31 LOC)

  export function useExercises() {
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
      getExercises().then(...);              ← single inner call
    }, [reloadToken]);

    const reload = () => setReloadToken(n => n + 1);
    return { exercises, loading, reload };
  }
```

What did this layer add? A loading flag and a reload trigger. That's real — but it's the same shape every consumer of `getExercises` would write inline. The hook doesn't enforce caching, doesn't deduplicate concurrent reads, doesn't transform the result. It's a thin wrapper that the caller still has to compose with their own usage.

The deep version: a Context provider that owns the exercise list and exposes `useExercises()` to any descendant, with reload + cache built in. Now multiple call sites share one fetch.

**Flavor 2. Pass-through variables.**

```
  src/hooks/useGameState.ts  (parameter signature, ~line 67)

  function useGameStateInternal(dbReady: boolean) { ... }
                                ▲
                                │
                          ┌─────┴──────────────────────────┐
                          │ dbReady is passed in, but      │
                          │ `useDatabase()` already exists. │
                          │ The hook could consume it       │
                          │ directly. Caller passes it      │
                          │ through.                        │
                          └────────────────────────────────┘
```

```
  src/hooks/useGameState.ts (the form-update site, ~line 120)

  updateValue(exIdx, setIdx, value, isHold: boolean)
                                     ▲
                                     │
                            ┌────────┴───────────────────┐
                            │ isHold is a fact the form  │
                            │ state already knows         │
                            │ (the entry has either        │
                            │ actualReps or                │
                            │ actualHoldSeconds).         │
                            │ Caller is computing it       │
                            │ and re-passing it.          │
                            └────────────────────────────┘
```

Both are variables threading through a layer that already has the information.

**Flavor 3. Adjacent same-shape layers.**

`src/services/sync/client.ts` exports the Supabase client. `src/services/sync/supabase-sync.ts` imports it and uses it. The client module is 13 lines: it instantiates `createClient(url, key)` and exports the result.

```
  Adjacent same-shape — sync/client.ts

  ┌─ client.ts (13 LOC) ────────────────┐
  │  import { createClient } from        │
  │    '@supabase/supabase-js';          │
  │  export const supabase =             │
  │    createClient(URL, KEY);           │
  └─────────────────┬───────────────────┘
                    │
  ┌─ supabase-sync.ts ─▼────────────────┐
  │  import { supabase } from './client';│
  │  // every call: supabase.from('...') │
  └──────────────────────────────────────┘
```

What does `client.ts` add? Singleton-ness. That's it. No middleware, no logging hook, no typed query helpers, no auth interception. Today this is fine — but the layer exists, named, and isn't doing the work its name implies. Either delete it (instantiate inline) or grow it into a real adapter.

#### Move 2 variant — the load-bearing skeleton of "real layer"

```
  Skeleton — a layer worth keeping has all three

  1. AN ABSTRACTION
       it expresses a different vocabulary than the layer below
       (e.g., persistence layer talks rows; domain layer talks
        WorkoutSessions)

  2. A TRANSFORMATION
       it converts inputs from one vocabulary to another
       (rows ↔ WorkoutSession; HTTP ↔ command)

  3. AN INVARIANT
       it owns a guarantee the caller doesn't have to maintain
       (e.g., "this returns a parsed Exercise[] or it throws")
```

`useExercises` has #2 weakly (adds loading state) and not #1 or #3. That's the diagnostic.

#### Move 3 — the principle

> Layers earn their place by changing the shape of the problem. If two adjacent layers have the same shape, one of them is wasted; if no layer transforms enough, callers do the work and the layers become decoration.

The fix isn't always "add more abstraction." Sometimes it's "merge." `useExercises` could become a thin Context that wraps `getExercises` once and exposes a real cache. Sometimes the right answer is to delete the layer entirely (replace `client.ts` with an inline `createClient` at the one consumer).

## Primary diagram

```
  contrl's layer stack — what each one earns

  ┌─ UI ───────────────────────────────────────────┐
  │  expo-router screens, components               │
  │  EARNS: visual + interaction                   │
  └─────────────────┬──────────────────────────────┘
                    │
  ┌─ Hooks ─────────▼──────────────────────────────┐
  │  useGameState        — over-earning (does       │
  │                        domain work it shouldn't)│
  │  useExercises        — pass-through ★            │
  │  useDatabase         — pass-through ★            │
  │  useExerciseForm     — earns (form state)        │
  └─────────────────┬──────────────────────────────┘
                    │
  ┌─ Domain ────────▼──────────────────────────────┐
  │  lib/game/{gate-check, progression,            │
  │           reconstruct, streaks,                 │
  │           week-progress}                        │
  │  lib/pose/{rep-counter, exercises/}             │
  │  EARNS: pure rules + tight invariants          │
  └─────────────────┬──────────────────────────────┘
                    │
  ┌─ Persistence ───▼──────────────────────────────┐
  │  services/database.ts                          │
  │  EARNS: SQL + JSON parse + schema invariants   │
  │  (also: leaks sync — see file 03)              │
  └─────────────────┬──────────────────────────────┘
                    │
  ┌─ Sync ──────────▼──────────────────────────────┐
  │  services/sync/{client, mapper, supabase-sync} │
  │  EARNS: bidirectional + watermarks             │
  │  client.ts: pass-through ★ (13 LOC, 0 value-add)│
  └────────────────────────────────────────────────┘
```

## Implementation in codebase

### Pass-through method: `src/hooks/useExercises.ts`

```ts
// the entire file is the example
export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {                         ← runs the inner call
    let mounted = true;
    setLoading(true);
    getExercises()                          ← persistence-layer function,
      .then(rows => mounted && setExercises(rows))  unchanged shape
      .catch(...)
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [reloadToken]);

  const reload = () => setReloadToken(n => n + 1);
  return { exercises, loading, reload };
       │
       └─ same shape as `getExercises()` returns, with loading+reload
          tacked on. caller still owns invalidation timing.
```

The fix:

```ts
// src/lib/exercises-context.tsx (sketch)
const ExerciseContext = createContext<{
  exercises: Exercise[];          ← cached
  loading: boolean;
  reload: () => Promise<void>;    ← shared across consumers
} | null>(null);

export function ExerciseProvider({ children }) {
  // one fetch, one subscription
}

export function useExercises() {
  return useContext(ExerciseContext)!;       ← now consumers share state
}
```

Now the hook layer adds something the persistence layer can't: cross-component caching, deduplication, shared loading state.

### Pass-through variable: `useGameStateInternal(dbReady)`

```ts
src/hooks/useGameState.ts (parameter signature)

  function useGameStateInternal(dbReady: boolean) {
    useEffect(() => {
      if (!dbReady) return;
      // ... load ...
    }, [dbReady]);
    ...
  }

// caller
  const { ready } = useDatabase();
  const state = useGameStateInternal(ready);   ← passes a value the
                                                  hook could fetch itself
```

The fix: consume `useDatabase()` inside the hook. Caller doesn't have to know dbReady exists.

### Adjacent same-shape: `src/services/sync/client.ts`

```ts
src/services/sync/client.ts  (entire file)

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

The fix has two flavors:

- **Delete.** Move `createClient` to the top of `supabase-sync.ts` (the only consumer). The "client" was a layer of one line, named only because the file existed.
- **Grow.** Add middleware: a logger, auth interception (when Phase 4 auth lands), per-query timing. Now `client.ts` actually adapts. The layer earns its place.

The choice depends on what's coming. If auth + RLS land soon, growing is right. If not, deleting is right.

## Elaborate

Layered architectures get praised in the abstract and overcooked in practice. The trap is that "layer" sounds like a virtue word — adding one feels like good engineering. The discipline is to ask, before adding a layer, "what abstraction does this provide that the layer below doesn't?" If you can't name it in one sentence, you're proposing a pass-through.

The opposite trap is squishing genuinely different abstractions together because they're "right next to each other." `useGameState` is an example from the other side — it covers UI/state/domain/persistence/sync, where five layers should have shared the work. Same source: the discipline is to feel where the abstraction *changes*.

Pass-through variables are the easiest to fix and the most-deferred. They look like extra explicitness ("I made the parameter visible"). They're actually leaked decomposition — the caller is making a decision the module should own.

## Interview defense

**Q: "Where in this codebase do you have a layer that isn't earning its place?"**

```
  ┌─ Three pass-throughs, ranked ─────────────────────────────────┐
  │                                                                │
  │  1. useExercises (and useDatabase) — hooks that wrap a single  │
  │     getter with loading state. Same shape both sides.          │
  │     Fix: collapse into a Context with real caching.            │
  │                                                                │
  │  2. dbReady passed into useGameStateInternal — hook could      │
  │     consume useDatabase() itself.                              │
  │                                                                │
  │  3. sync/client.ts — 13-line module that instantiates the      │
  │     Supabase client. Either delete it or grow it into a        │
  │     real adapter.                                              │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "if I delete the layer and the caller still works with one extra line, the layer wasn't earning its place."

**Q: "When is a thin layer worth keeping?"**

When it's the seam where you'll add the next abstraction. `sync/client.ts` is a candidate — auth interception belongs there when auth ships. If the layer is named after work it doesn't do yet but will, keeping it is fine. If it's named after work it doesn't do and *won't*, it's pass-through.

**Q: "Why is pass-through worse than just verbose code?"**

Because it teaches future readers that the layer matters. They'll add code to it ("the hook layer should handle X"), and now the layer has real responsibility, but with an interface that was never designed for it. The mess compounds.

## Validate

1. **Reconstruct.** Sketch the contrl layer stack from memory; mark the three pass-throughs.
2. **Explain.** What's the difference between "thin layer" and "pass-through"? Use `useGameState` and `useExercises` as opposites.
3. **Apply.** Design the Context that replaces `useExercises`. What does it own that the bare hook didn't?
4. **Defend.** Argue that `sync/client.ts` should stay (anticipating auth). Then argue that it should go (YAGNI). Which wins, and why?

## See also

- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md) — most pass-throughs are also shallow
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — temporal decomposition produces pass-through control flow
- [05-pull-complexity-downward.md](./05-pull-complexity-downward.md) — pass-through variables are complexity pushed up
- [08-red-flags-audit.md](./08-red-flags-audit.md) — pass-through severity ranking
