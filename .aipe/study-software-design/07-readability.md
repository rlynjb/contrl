# Readability
### Names · comments · consistency · obviousness — Industry standard (APOSD ch. 12–17)

> Readability is the rest of the iceberg. Once the structure is right, the names, the comments, the consistency, and the obviousness of intent decide whether the next reader can edit safely.

## Zoom out, then zoom in

You write code once and read it twenty times. Most readability work happens before you finish — name a variable well, write the interface comment, choose the convention that matches the rest of the file. Doing it later is harder; the discipline is the same: precision over plausibility.

```
  Zoom out — the four facets of readability

  ┌─ NAMES ─────────────┐   ┌─ COMMENTS ─────────┐
  │ does the name        │   │ do they say WHY,   │
  │ predict what it      │   │ not WHAT?           │
  │ holds?               │   │                     │
  └─────────────────────┘   └─────────────────────┘

  ┌─ CONSISTENCY ───────┐   ┌─ OBVIOUSNESS ──────┐ ★ THIS CONCEPT ★
  │ same job → same     │   │ does the code do   │
  │ convention across   │   │ what a reasonable   │
  │ the codebase        │   │ reader expects?     │
  └─────────────────────┘   └─────────────────────┘
```

Zoom in. contrl is mostly clean here — but four specific issues recur often enough to name: the `r: any` row pattern in mappers (precision), inconsistent case conventions across the persistence/sync seam (consistency), the `restoreInProgress` global (obviousness), and the discriminated-result types in pose processors (obviousness).

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **does the code surface its intent without needing to read its body?**

```
  Tracing intent-visibility across the codebase

  layer            intent-visibility       where it slips
  ─────            ─────────────────       ──────────────
  Domain          HIGH (rep-counter,        ─
                  reconstruct, gate-check
                  all read like specs)
  Hooks           MEDIUM (useGameState has  large hook, refs vs state,
                  100-LOC functions with    fire-and-forget at the
                  6 concerns)               bottom
  Persistence     MEDIUM-HIGH (CRUD shape   migrate() mixes schema +
                  is clean per function)    one-shot backfills
  Sync            LOW (any types,           r: any × 27 sites;
                  restoreInProgress flag,   restoreInProgress invisible;
                  per-table near-           early-return drops tables
                  duplicate code)
```

Seam: the **sync layer reads worst**. Same primitive issue — when the structure is shallow (file 02) and the facts leak (file 03), readability follows.

## How it works

#### Move 1 — the picture

Readability has a simple test: can a reader infer the function's contract from its signature and three lines of body, without reading callers? When yes, the code is obvious. When no, the reader has to do investigation work to make even small edits.

```
  Two function signatures, same job — readability differs

  function fromRemote(r: any): Exercise         function rowToExercise(
                                                  row: SupabaseExerciseRow
                                                ): Exercise

  reader knows:                                 reader knows:
   - returns Exercise                            - returns Exercise
   - input shape: ???                            - input shape: typed
   - field map: ???                              - field map: enforced
                                                   by the type
```

The first signature passes type-check (TypeScript's `any` is a free pass). The second one teaches.

#### Move 2 — four facets, each present in contrl

**Facet 1. Names — `r: any` everywhere in the mapper.**

```ts
src/services/sync/mapper.ts (≈27 occurrences across functions)

  export function sessionFromRemote(r: any): WorkoutSession {
    return {
      id: r.id,                                ← what's r?
      date: r.date,                              a sessions row?
      exercises: JSON.parse(r.exercises_json),   a profile row?
      ...                                        reader has to check
    };                                           every field
  }

  export function exerciseFromRemote(r: any): Exercise { ... }
  export function gateProgressFromRemote(r: any): GateProgress { ... }
  // ... 7 more
```

The `r` is doubly opaque: vague name AND `any` type. The reader has no signal what shape the row should have. The fix is two moves:

```ts
  // 1. type the row
  type SupabaseSessionRow = {
    id: string;
    date: string;
    exercises_json: string;
    user_id: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };

  // 2. name it
  export function sessionFromRemote(row: SupabaseSessionRow): WorkoutSession {
    return { id: row.id, ... };
  }
```

Now the type teaches; the name reads as the thing it is.

**Facet 2. Consistency — case conventions at the persistence/sync seam.**

```
  Two conventions for one thing, repeated 10× in mapper.ts

  in database.ts:      target_sets, user_id, created_at      (snake)
  in types/index.ts:   targetSets, userId, createdAt          (camel)
  in mapper.ts:        targetSets: r.target_sets,             (both)
                       target_sets: e.targetSets, ...
```

Two conventions for one job ("name a field"). Both are right in their layer (SQL is snake_case by convention; JS/TS is camelCase by convention). The inconsistency is what mapper.ts has to *translate* between them at every call.

This isn't a thing to fix at the readability level — it's a structural leak (see [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md)). The readability fix is to ensure mapper.ts states the rule once at the top of the file ("we translate between snake_case DB columns and camelCase TS fields"), not to rename everything.

**Facet 3. Obviousness — `restoreInProgress` module-global.**

```ts
src/services/sync/supabase-sync.ts (~line 32)

  let restoreInProgress = false;

  // 196 lines later, in pushChanges:
  if (restoreInProgress) return;
```

The flag is invisible at every reader's first encounter with `pushChanges()`. The contract — "pushChanges no-ops during a restore" — lives in a module-level mutable that the reader doesn't know exists.

The readability fix is the same as the structural fix in file 03: make the state explicit (a typed sync engine with `state: 'idle' | 'restoring' | 'pushing'`) or, minimally, comment the contract at the head of `pushChanges`:

```ts
  // pushChanges: NO-OPS DURING RESTORE. The pullRestoreIfFresh
  // path clears local data; if we push during that window we'd
  // wipe the remote with stale local state. Re-entry safe.
  export async function pushChanges() {
    if (restoreInProgress) return;
    ...
  }
```

The comment isn't the right *long-term* answer (the structural fix is), but it makes the contract visible to the next reader who lands here without context.

**Facet 4. Obviousness — discriminated processor return types.**

```ts
src/lib/pose/exercises/{pushup, squat, plank}.ts

  // pushup.ts processor returns:
  type PushupFrameResult = { repCompleted: boolean; ...other... };

  // plank.ts processor returns:
  type PlankFrameResult = { isHolding: boolean; ...other... };

  // caller (src/components/camera/SetCameraOverlay.tsx)
  if (processorRef.current.type === 'pushup') {
    // result.repCompleted available
  } else if (processorRef.current.type === 'plank') {
    // result.isHolding available
  }
```

Two different shapes, dispatched by a string discriminator. The caller branches on the type string and then accesses different fields. This *can* be done cleanly with TypeScript's discriminated union, but as currently written the caller's branch isn't proven exhaustive at compile time.

The fix is a unified type:

```ts
  type FrameResult =
    | { kind: 'rep'; repCompleted: boolean; phase: RepPhase }
    | { kind: 'hold'; isHolding: boolean; holdSeconds: number };

  // caller (TS proves the switch is exhaustive)
  switch (result.kind) {
    case 'rep':  handleRep(result.repCompleted); break;
    case 'hold': handleHold(result.holdSeconds); break;
  }
```

Now the reader sees the two cases by reading the type, and the compiler enforces that both are handled.

#### Move 2 variant — load-bearing skeleton of "readable"

```
  Skeleton — three parts of readable code

  1. THE NAME PREDICTS THE THING
       reader can guess what `dirty` means from the line above
       (recently-modified rows since the watermark)

  2. THE TYPE TEACHES THE SHAPE
       no `any` where a type would do; discriminated unions where
       two shapes share a context

  3. THE COMMENT SAYS THE "WHY"
       not what the code does (the code says that), but why the
       code does it this way — the surprising constraint, the
       past incident, the contract that isn't obvious
```

Drop "comment says why" and code's correctness story is hidden in git history. Drop "type teaches shape" and the reader becomes the type-checker. Drop "name predicts the thing" and every variable demands a lookup.

#### Move 3 — the principle

> The reader cannot run the code, only trace it. The discipline is to write code that doesn't need to be run to be understood.

The best names, types, and comments shift work from the reader's head into the source. Vague names ("data," "obj," "r") demand the reader execute the function in their head; precise names demand only that they read it.

## Primary diagram

```
  contrl's readability map

  ┌─ Strong ──────────────────────────────────────────────────────┐
  │  src/lib/game/* — pure functions, precise names, small types  │
  │  src/lib/pose/rep-counter.ts — RepCounter, RepPhase, RepEvent │
  │  src/types/index.ts — full domain types named after concepts  │
  └────────────────────────────────────────────────────────────────┘

  ┌─ Mixed ───────────────────────────────────────────────────────┐
  │  src/services/database.ts                                     │
  │    + CRUD names are clear (insertSession, getExercises)       │
  │    − migrate() function is 87 lines of mixed concerns         │
  │    − inline JSON parse with no error context                  │
  └────────────────────────────────────────────────────────────────┘

  ┌─ Weak ────────────────────────────────────────────────────────┐
  │  src/services/sync/mapper.ts                                  │
  │    − r: any (27 occurrences) — name vague, type erased         │
  │    − each function reads like a typo waiting to happen        │
  │  src/services/sync/supabase-sync.ts                           │
  │    − restoreInProgress as module-global — invisible contract  │
  │    − no interface comments; pushChanges contract is unwritten │
  │  src/components/camera/SetCameraOverlay.tsx                   │
  │    − discriminated result types not unified                    │
  │    − landmark threshold magic number duplicated                │
  └────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### The `r: any` pattern

```ts
src/services/sync/mapper.ts (10 functions, each like this)

  export function sessionFromRemote(r: any): WorkoutSession {
    return {
      id: r.id,
      date: r.date,
      exercises: JSON.parse(r.exercises_json),
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
       │
       └─ reader has to know:
          - r is a Supabase row
          - shape comes from a remote upsert response
          - field names are snake_case
          - exercises_json might be malformed (no guard, see file 06)
```

The fix has two parts, applied per function:

```ts
  // type the row
  type SupabaseSessionRow = {
    id: string;
    date: string;
    exercises_json: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    user_id: string;
  };

  // name and consume
  export function sessionFromRemote(row: SupabaseSessionRow): WorkoutSession {
    return {
      id:         row.id,
      date:       row.date,
      exercises:  parseExercisesJson(row.exercises_json),
      notes:      row.notes,
      createdAt:  row.created_at,
      updatedAt:  row.updated_at,
    };
  }
```

The Supabase CLI emits these row types automatically (`supabase gen types typescript`). Wiring that into the build means the row types stay in sync with the cloud schema without manual maintenance.

### The `restoreInProgress` global

The structural fix is the engine refactor (file 03). The readability fix, until then:

```ts
  // src/services/sync/supabase-sync.ts

  /**
   * The sync layer's two operations — pushChanges and
   * pullRestoreIfFresh — must not run concurrently. Restore
   * clears local data before replaying; a concurrent push would
   * upsert the about-to-be-cleared local state to the remote,
   * destroying it.
   *
   * restoreInProgress is the lock. Read by pushChanges. Written
   * by pullRestoreIfFresh.
   */
  let restoreInProgress = false;
```

Now a reader who lands here knows what they're looking at. The comment is a placeholder until the structural fix; it earns its place because the contract is non-obvious.

### Discriminated processor types

```ts
src/lib/pose/exercises/index.ts (the unified shape)

  export type FrameResult =
    | { kind: 'rep';  repCompleted: boolean;  phase: RepPhase }
    | { kind: 'hold'; isHolding: boolean;     holdSeconds: number };

  export type ExerciseProcessor = {
    kind: 'rep' | 'hold';
    feed(landmarks: Landmark[]): FrameResult;
    reset(): void;
  };
```

The discriminator (`kind`) is consistent on both the processor and its result. Callers `switch` on `kind`; TypeScript proves exhaustiveness.

## Elaborate

The readability findings in contrl all cluster at the sync layer because the sync layer is structurally weak (shallow modules + leaked facts). Readability is the symptom; structure is the cause. The good news: fixing the structure (files 02–04) takes most of the readability findings with it.

There's a specific anti-pattern worth naming: **paraphrasing comments**. The codebase doesn't have many, but the few it has (e.g., the sync comment that says "RLS scopes by the JWT user_id claim") teach what code already says. The good interface comments — when they appear — say *why*: why this constraint, why this order, why this fallback. None of those exist for `pushChanges` today.

The right pattern: comments at module boundaries explain the *contract* (what this module promises, what callers must do, what's surprising). Comments inside functions explain *why* a specific line exists when its purpose isn't visible from the code. Comments that paraphrase code are noise.

## Interview defense

**Q: "What's the readability weakness you'd fix first?"**

```
  ┌─ Three findings, ranked ──────────────────────────────────────┐
  │                                                                │
  │  1. r: any across mapper.ts — generate row types from         │
  │     Supabase. Every function gets typed input + named         │
  │     parameter.                                                 │
  │                                                                │
  │  2. restoreInProgress contract is invisible — short term:     │
  │     interface comment. Long term: structural fix (sync         │
  │     engine).                                                   │
  │                                                                │
  │  3. Processor result types not unified — discriminated union  │
  │     with kind: 'rep' | 'hold' makes the caller's branch       │
  │     exhaustive at compile time.                                │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "names predict, types teach, comments say why."

**Q: "When IS `any` defensible?"**

When the boundary is genuinely untyped (parsing unknown JSON from an external untrusted source). Even then, the move is `unknown` + a schema validator, not `any`. `any` is "I give up on type-checking here"; `unknown` is "I'll prove the type before using it."

**Q: "Why don't more comments help?"**

Because comments rot. The code is the truth; comments are an assertion that may be wrong by next week's edit. The discipline is to comment only what the code can't say (the why, the surprising constraint, the past bug). Paraphrasing comments are negative value — they look authoritative while being silently wrong.

## Validate

1. **Reconstruct.** Pick one of the four facets and sketch how it shows up in mapper.ts.
2. **Explain.** Why is `r: any` worse than `r: unknown`? What's the principle?
3. **Apply.** Pick one mapper function and rewrite it with a typed row. What does the diff look like?
4. **Defend.** Argue that `restoreInProgress` is fine — the file's small enough. Then rebut.

## See also

- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md) — shallow modules read worse than deep ones
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — most readability issues here are structural-leak symptoms
- [06-errors-and-special-cases.md](./06-errors-and-special-cases.md) — invisible error handling is an obviousness failure
- [08-red-flags-audit.md](./08-red-flags-audit.md) — readability severity ranking
