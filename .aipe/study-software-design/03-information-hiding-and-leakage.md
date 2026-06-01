# Information hiding and leakage
### Information leakage · temporal decomposition — Industry standard (APOSD ch. 5)

> A fact is *leaked* when two modules each know it independently and have to be edited together. Find every leak in contrl, name both ends of it, and ask: which module owns this, really?

## Zoom out, then zoom in

In a well-hidden system, each fact has one home. A field name, a constraint, a control-flow rule — somebody owns it; everyone else asks. Leakage is the opposite: the fact is duplicated across modules, and every change has to keep the copies in sync.

```
  Zoom out — what a leak looks like

  ┌─ Module A ────────────┐       ┌─ Module B ────────────┐
  │  knows fact X         │       │  also knows fact X    │
  │  ("target_sets")      │       │  ("targetSets")       │
  └────────┬──────────────┘       └────────┬──────────────┘
           │                                │
           └───── ★ THIS IS THE LEAK ★ ─────┘
                  edit one, must edit the other

  Cure: pick one home for X; have the other module derive it.
```

Zoom in. In contrl, the load-bearing leak is between **`database.ts`** (knows snake_case column names) and **`sync/mapper.ts`** (knows the camelCase ↔ snake_case rename). Add a column → edit both. That's the canonical APOSD example.

## Structure pass

Layers, in contrl: Persistence (`database.ts`) ↔ Sync (`mapper.ts` + `supabase-sync.ts`) ↔ Types (`src/types/index.ts`) ↔ UI/Hooks.

Axis to trace: **who owns this fact?**

```
  Tracing fact-ownership across the persistence-sync seam

  fact                     ↓ who knows ↓
  ─────                    ────────────
  "sessions has a          database.ts (CREATE TABLE)
   column called           mapper.ts (target_sets ↔ targetSets)
   target_sets"            types/index.ts (TargetExercise.targetSets)
                          → THREE places. Same fact. Edit all three.

  "watermark advances      supabase-sync.ts owns lastPushedAt
   only after a full        + every CRUD in database.ts fires
   successful push"         pushChanges().catch() with no awareness
                          → leaked control rule.

  "restoreInProgress       module-global mutable in supabase-sync.ts
   suppresses pushes"       used by 2 caller sites; affects 8 push
                            sites invisibly
                          → leaked behavioural state.
```

Seams: every leak in this codebase sits on one seam — the **persistence ↔ sync** boundary. That's the load-bearing finding.

## How it works

#### Move 1 — leaks vs hiding, as a picture

You already understand hiding from `URL.searchParams`. The URL knows the parsing rules; you ask `params.get('q')`. The leak version is what early jQuery code did — every caller re-parses the URL string and knows the format.

```
  Hiding vs leaking, side by side

  Hidden                              Leaked
  ┌────────────────┐                  ┌──────────────┐    ┌──────────────┐
  │ caller         │                  │ caller A     │    │ caller B     │
  │  url.params    │                  │  parses url  │    │  parses url  │
  │  .get('q')     │                  │  (its way)   │    │  (its way)   │
  └───────┬────────┘                  └──────┬───────┘    └──────┬───────┘
          │                                  │                   │
  ┌───────▼────────┐                  edit URL format → must edit both
  │ URL module     │
  │  knows format  │
  │  in one place  │
  └────────────────┘
```

Hiding shrinks the diff at change time; leaking multiplies it.

#### Move 2 — three flavors of leak, each present in contrl

**Flavor 1. The same fact, encoded twice (the classic).**

```
  Field-name leak — database.ts ↔ mapper.ts

  ┌─ database.ts ─────────────────────────────────────┐
  │  CREATE TABLE exercises (                          │
  │    target_sets INTEGER,           ← fact: column   │
  │    target_reps INTEGER,             names are      │
  │    target_hold_seconds INTEGER   ); snake_case     │
  └────────────────────────────────────────────────────┘

  ┌─ sync/mapper.ts ──────────────────────────────────┐
  │  exerciseToRemote: { target_sets: e.targetSets, ...│
  │  exerciseFromRemote: { targetSets: r.target_sets,..│ ← same fact,
  │  (10× for each of 5 tables, both directions)       │   restated
  └────────────────────────────────────────────────────┘
```

Cure: define the field map once. Either a constant `FIELD_MAP[table][local] = remote` that both modules read, or a stricter approach — generate the mapper from the schema.

**Flavor 2. Temporal decomposition — modules carved by "when," not by "what."**

```
  Temporal leak — useGameState.logSession()

  the function is shaped by ORDER OF EVENTS, not by responsibility:

  step 1. evaluate session                 ← game rule
  step 2. update gate progress             ← game rule + persistence
  step 3. check level-up                   ← game rule + persistence
  step 4. update week progress             ← game rule + persistence
  step 5. insert session row               ← persistence
  step 6. fire push                        ← sync

  → each step knows the order matters and what happens after.
    a new step has to be slotted in correctly. order is the contract.
```

Cure: rewrite as `evaluateSessionAndUpdate(state, session) → newState` plus one persistence call to save `newState`. The new shape is "compute, then persist" — order becomes obvious.

**Flavor 3. Behavioural state leaked through a module-global.**

```
  Behavioural leak — restoreInProgress

  src/services/sync/supabase-sync.ts:
    let restoreInProgress = false;        ← module-global mutable

  pullRestoreIfFresh():
    restoreInProgress = true              ← writer 1
    ...
    restoreInProgress = false

  pushChanges():
    if (restoreInProgress) return;        ← reader, invisible at call site

  caller side (database.ts × 8):
    pushChanges().catch(() => {});        ← no caller knows this can no-op
```

The contract "don't push during a restore" lives in a flag with no type, no boundary, no test. The eight callers can't tell if their call did anything.

Cure: parameterize. `pushChanges({ skipDuringRestore: false })` or — better — the sync module owns a single state machine and the flag is its internal field, not module-global. Better still: pull and push share a queue; the queue refuses pushes while a restore drains.

#### Move 2 variant — the load-bearing skeleton of a leak

Three parts you can name, applied to the field-name leak:

```
  Skeleton — what makes "leakage"

  1. THE FACT
       "exercises has a column for target sets,
        snake_case in DB, camelCase in JS"

  2. TWO HOMES
       database.ts knows the SQL column name.
       mapper.ts knows both names + the rename rule.

  3. THE COST
       adding a column → 3-file edit (DB + mapper + type)
       renaming → easy to miss one
       removing → mapper silently maps to undefined
```

Drop "two homes" and the leak is gone (one fact, one place). Drop "the cost" and you've found a leak that doesn't matter — it exists but isn't load-bearing. The interview move is to find leaks that ARE costing you, not all leaks.

#### Move 3 — the principle

> Modules should be organized around the *secrets* they keep, not the order in which they run.

Temporal decomposition is the deepest version of leakage: the module's structure encodes "what happens next" rather than "what's true." When the schedule changes, the modules shatter. When you organize around facts (this module owns the rep-counter state; this one owns the schema; this one owns the sync queue), the schedule becomes a coordination concern at one level, not a leaked rule at every level.

## Primary diagram

```
  Where facts leak in contrl

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Persistence / Sync seam — the load-bearing leak              ║
  ╚═══════════════════════════════════════════════════════════════╝

  ┌─ database.ts ────────────┐                ┌─ sync/mapper.ts ──┐
  │  CREATE TABLE statements │ ◄─── leak ───► │  to/from for      │
  │  (snake_case names)      │   field names  │  5 tables × 2     │
  └──────────────────────────┘                │  directions       │
                                              └───────────────────┘
  ┌─ types/index.ts ─────────┐                       ▲
  │  TS shapes               │ ◄─── leak ────────────┘
  │  (camelCase fields)      │   field shape
  └──────────────────────────┘

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Sync internal — the behavioural leak                          ║
  ╚═══════════════════════════════════════════════════════════════╝

  ┌─ supabase-sync.ts ──────────────────────────────────────────┐
  │  let restoreInProgress = false      ← module-global mutable │
  │      ▲                ▲                                      │
  │      │                │ writer (pullRestoreIfFresh)         │
  │      │ reader (pushChanges)                                  │
  └──────┼──────────────────────────────────────────────────────┘
         │
         │ ← invisible to:
  ┌──────▼──────────────────────────────────────────────────────┐
  │  database.ts × 8 call sites: pushChanges().catch(...)       │
  │  no caller can tell their push is being skipped              │
  └──────────────────────────────────────────────────────────────┘

  ╔═══════════════════════════════════════════════════════════════╗
  ║  useGameState — the temporal leak                              ║
  ╚═══════════════════════════════════════════════════════════════╝

  logSession()  step 1  →  step 2  →  step 3  →  step 4  →  step 5
                game     gate +     level +     week +     persist +
                rule     persist    persist     persist    sync
                                                              │
                          → order IS the contract             │
                          → adding a step requires            │
                            understanding all 5               ▼
```

## Implementation in codebase

### The field-name leak (worst offender)

```ts
src/services/database.ts  (schema, lines ~25-115)
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    target_sets INTEGER NOT NULL,           ← fact: column = snake_case
    target_reps INTEGER,
    target_hold_seconds INTEGER,
    ...
  );

src/services/sync/mapper.ts  (the same fact, restated)
  export function exerciseFromRemote(r: any): Exercise {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      targetSets: r.target_sets,            ← rename: snake → camel
      targetReps: r.target_reps ?? null,
      targetHoldSeconds: r.target_hold_seconds ?? null,
      ...
    };
  }

src/types/index.ts  (the third home)
  export type Exercise = {
    id: string;
    name: string;
    category: Category;
    targetSets: number;                     ← camelCase, again
    ...
  };
```

Add a column `default_rest_seconds`: three files change. Today, a developer reads zero of them before adding it — they have to find all three.

**The fix:** define field shape once. Options ranked by effort:

- Cheapest: a single constant `FIELD_MAP` keyed by table that both `database.ts` and `mapper.ts` import. Now there's one fact in one file.
- Medium: generate `mapper.ts` from Supabase's TypeScript types (Supabase CLI emits them).
- Hardest: derive both the SQL schema and the mapper from a single source (Zod schema with column-name decorations, for instance).

### The behavioural leak: `restoreInProgress`

```ts
src/services/sync/supabase-sync.ts  (module-level)
  let restoreInProgress = false;          // mutable across calls

  export async function pullRestoreIfFresh() {
    restoreInProgress = true;
    // ... clear local, pull from remote, replay ...
    restoreInProgress = false;
  }

  export async function pushChanges() {
    if (restoreInProgress) return;         // ← invisible at call site
    // ... per-table push ...
  }
```

```ts
src/services/database.ts  (× 8 call sites)
  await runAsync(...);
  pushChanges().catch(err => console.warn(err));   // no-op during restore
                                                    // but caller can't tell
```

The fix is to give the sync module a real interface and a real internal state machine:

```
  Skeleton of the fix

  syncEngine = {
    state: 'idle' | 'pushing' | 'restoring',
    enqueueWrite(table, row),
    requestRestore(),
  }

  callers don't call pushChanges(); they enqueueWrite() and
  the engine decides when to drain. The "don't push during
  restore" rule is now an internal transition, not a
  module-global.
```

### The temporal leak: `useGameState.logSession()`

```ts
src/hooks/useGameState.ts  (the structure of logSession, ~100 LOC)

  logSession(session) {
    // step 1: evaluate the session
    const isClean = ...
    // step 2: pick gate, decide whether to advance
    const newGate = ...
    // step 3: maybe level up
    const newUser = checkCategoryLevelUp(...)
    // step 4: update week
    const newWeek = ...
    // step 5: write all the rows
    await insertSession(session);
    await updateGate(newGate);
    await updateWeek(newWeek);
    if (newUser !== user) await updateUserLevel(...);
    // step 6: fire push
    pushChanges().catch(...);
  }
```

Six steps, each implicitly assumes the prior step ran. Refactoring this is the highest-leverage move in the codebase. The shape it wants:

```ts
  // pure: takes current state and a session, returns new state
  const next = applySessionToState(currentState, session);

  // persistence: save the diff
  await persistStateDiff(currentState, next);

  // sync handled by the engine, not at every call site
```

## Elaborate

Ousterhout calls leaks "the most important indicator of a design problem." The reason is that leaks resist local fixes. You can refactor `useGameState` into 6 hooks; you still have to wire them together in the right order. The temporal decomposition is structural. Only re-organizing around *what's true* instead of *what happens next* removes the leak.

The field-name leak is the easiest to fix and the most-deferred fix in young codebases. It's easy because it's mechanical. It's deferred because each individual edit is small — adding one column is a 3-file diff that takes 5 minutes. The cost shows up at the 20th column, when nobody remembers all the places to edit.

The behavioural leak (`restoreInProgress`) is the most dangerous because it's silent. A wrong refactor doesn't crash; it just stops syncing. Tests would catch it (the eight callers should each verify their write reached the remote), but there are no tests. See `study-testing/03-tests-as-design-pressure.md`.

## Interview defense

**Q: "Where does information leak in this codebase?"**

```
  ┌─ One-minute answer ───────────────────────────────────────────┐
  │                                                                │
  │  Three places. Ranked by cost:                                 │
  │                                                                │
  │  1. Field names leak between DB schema, mapper, and types.    │
  │     Adding a column is a 3-file diff. Cure: one FIELD_MAP.    │
  │                                                                │
  │  2. logSession() is temporally decomposed — its structure is  │
  │     "step 1 then step 2 then…". Cure: split into pure         │
  │     state-transition + persistence-of-diff.                    │
  │                                                                │
  │  3. restoreInProgress is a module-global that gates 8         │
  │     callers invisibly. Cure: real sync state machine.         │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "the worst leak in contrl is between `database.ts` and `mapper.ts` — three homes for one fact."

**Q: "How do you tell a leak from a legitimate adapter?"**

An adapter has work to do (resolve an impedance mismatch — REST↔SQLite is real impedance). A leak has no work to do — both sides know the same fact and the adapter just rephrases it. The mapper today is mostly leakage with a few legitimate adapter calls (JSON-stringify-the-exercises) sprinkled in.

**Q: "Why is temporal decomposition worse than other leaks?"**

Because the leak isn't in the data, it's in the *control flow*. You can't fix it by sharing a constant; you have to re-shape the function. Field leaks are tactical; temporal leaks are structural.

## Validate

1. **Reconstruct.** Sketch the three-file leak (database / mapper / types) from memory; show one new column needing to be added.
2. **Explain.** What's "temporal decomposition," and why is `logSession` an example?
3. **Apply.** Design the `FIELD_MAP` fix. Where does it live? How do `database.ts` and `mapper.ts` consume it?
4. **Defend.** Argue that the mapper is fine because "explicit beats implicit." Rebut the argument.

## See also

- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md) — leaks are shallow modules from the other side
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md) — temporal decomposition shows up as pass-through layers
- [06-errors-and-special-cases.md](./06-errors-and-special-cases.md) — `restoreInProgress` is also a special case that should be defined out
- [08-red-flags-audit.md](./08-red-flags-audit.md) — the leakage findings are tier-1 severity
