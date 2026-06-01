# Complexity in this codebase
### Change amplification · cognitive load · unknown unknowns — Industry standard (APOSD ch. 2)

> The zoom-out for the guide. Before naming individual smells, locate where complexity actually lives in this repo — the modules where a single change ripples across many files, the modules nobody wants to touch, and the spots where you can't predict what your edit will break.

## Zoom out, then zoom in

contrl is a local-first React Native app: SQLite is the source of truth, Supabase is a mirror, MediaPipe runs the pose pipeline on-device. The interesting complexity isn't in any one of those pieces — it's at the **joins** between them.

```
  Zoom out — where complexity lives in contrl

  ┌─ UI layer (app/, src/components/) ───────────────┐
  │  expo-router screens · camera overlay · forms     │
  └──────────────────────┬───────────────────────────┘
                         │ React hooks
  ┌─ Hooks layer (src/hooks/) ──────────────────────┐
  │  ★ useGameState (333 LOC orchestrator)          │ ← we are here
  └──────────────────────┬───────────────────────────┘
                         │ function calls
  ┌─ Domain + persistence (src/lib/, src/services/) ─┐
  │  game/ · pose/ · database.ts ↔ sync/             │
  └──────────────────────┬───────────────────────────┘
                         │ async REST + SQLite
  ┌─ Storage layer ──────▼───────────────────────────┐
  │  expo-sqlite (WAL) ←--mirror--→ Supabase REST    │
  └──────────────────────────────────────────────────┘
```

Zoom in. Ousterhout names complexity by its **symptoms**, not its causes:

- **Change amplification** — one logical change touches many files
- **Cognitive load** — how much you need to hold in your head to make a safe edit
- **Unknown unknowns** — places where you can't tell what depends on what without reading every caller

The rest of this file locates each symptom by file path.

## Structure pass

Layers, in this codebase: UI → Hooks → Domain (`src/lib/game/`, `src/lib/pose/`) → Persistence (`src/services/database.ts`) → Sync (`src/services/sync/`) → Storage (SQLite + Supabase).

Axis to trace: **cognitive load — how much do I need in my head to safely edit each layer?**

```
  Tracing the cognitive-load axis down the stack

  layer            what you need to hold      load
  ─────            ─────────────────────      ────
  UI               just the prop shape         low
  Hooks            game state + 6 setters +    HIGH
                   3 refs + sync timing
  Domain           the function's inputs       low
  Persistence      schema + migration order +  HIGH
                   sync side-effects
  Sync             watermarks + restore flag + HIGH
                   per-table mapping
```

Seams that matter (axis flips):

- **Hook ↔ domain seam.** `useGameState.logSession()` calls six pure functions from `src/lib/game/` — but the hook owns timing, refs, and the order of side effects. The functions are easy; the orchestration isn't.
- **Persistence ↔ sync seam.** Every write to `database.ts` fires `pushChanges()` on the side (8 call sites). The DB layer pretends sync doesn't exist; the sync layer pretends transactions do. Both are wrong.
- **Schema ↔ mapper seam.** `database.ts` knows `target_sets`; `sync/mapper.ts` knows `targetSets`. Two sources of truth for one fact.

These three seams generate most of the file's findings.

## How it works

#### Move 1 — the three symptoms

You already use the symptoms when you say "ugh, I don't want to touch that." Ousterhout just names them.

```
  The three symptoms of complexity

  ┌─ change amplification ────┐
  │  one logical change       │  edit one thing, touch many files
  │  ───►  many file edits    │
  └───────────────────────────┘

  ┌─ cognitive load ──────────┐
  │  reading the code         │  how much you need to hold
  │  ───►  full mental model  │  in your head to edit safely
  └───────────────────────────┘

  ┌─ unknown unknowns ────────┐
  │  the edit               ┐ │  you can't tell what
  │  ───► breaks   ?  ?  ?  │ │  depends on it without
  │  something elsewhere    ┘ │  reading every caller
  └───────────────────────────┘
```

Symptom 1 you can measure (count files touched). Symptom 2 you can feel. Symptom 3 you can't see until it bites you in code review or production.

#### Move 2 — locating each symptom in contrl

**Change amplification: adding a column to `sessions`.**

```
  Adding `sessions.intensity` — files that change

  src/services/database.ts          + schema + migration step + insert + update + read
  src/services/sync/mapper.ts       + remote→local + local→remote
  src/types/index.ts                + ExerciseEntry / WorkoutSession field
  src/hooks/useGameState.ts         + logSession() passes the field through
  app/log/...                       + form input + render
```

Five files for one field. The root cause: the schema lives in `database.ts`, the mapping lives in `mapper.ts`, the type lives in `types/index.ts` — three files that **all encode the same fact** ("a session has a target_sets/targetSets column called X"). [See 03-information-hiding-and-leakage.md.](./03-information-hiding-and-leakage.md)

**Cognitive load: editing `useGameState.logSession()` (333-line file; logSession alone is ~100 lines).**

What you need in your head to safely change one line of `logSession`:

- the session evaluation rule (was the set clean?)
- which gate to advance, and whether 3-consecutive-pass triggers a level-up
- whether `weekProgressRef.current` reflects this session yet (the ref is updated *after* the DB write, so timing matters)
- whether the fire-and-forget `pushChanges().catch()` at the bottom can be skipped
- whether you're inside a restore (the global `restoreInProgress` flag changes everything)

That's five concerns held at once. The function should hold one.

**Unknown unknowns: editing `pushChanges()` in `supabase-sync.ts`.**

It returns early on the first table that errors (line 47-area). That's the symptom. The unknown unknown: nobody catches the error because all 8 callers use `.catch(() => {})`. A breaking change here looks fine until users notice their data didn't sync.

#### Move 3 — the principle

> Complexity is incremental. No single edit broke the codebase; thirty edits each "just one more thing" did. The discipline is to push back at each one — not the thirtieth.

When you feel "I'll just add this parameter," that's the moment. Ask: is this complexity moving up (caller has to know about it) or down (module absorbs it)?

## Primary diagram

```
  The complexity map for this repo

  ┌─ UI ────────────────────────────────┐
  │  screens · components · forms        │   cognitive load: LOW
  └──────────────────┬───────────────────┘
                     │ uses
  ┌─ Hooks ──────────▼───────────────────┐
  │  ★ useGameState.ts (HOTSPOT #1)      │   cognitive load: HIGH
  │  · 6 state slices + 3 refs            │   change amplification: HIGH
  │  · logSession() is 100 LOC of        │   unknown-unknowns: HIGH
  │    orchestration + game-rule logic   │
  └──────────────────┬───────────────────┘
                     │ calls
  ┌─ Domain ─────────▼───────────────────┐
  │  game/{gate-check, progression,      │   cognitive load: LOW
  │  reconstruct, streaks, week-progress}│   (deep modules — see 02)
  │  pose/{rep-counter, angles,          │
  │  exercises/}                          │
  └──────────────────┬───────────────────┘
                     │
  ┌─ Persistence ────▼───────────────────┐
  │  ★ database.ts (HOTSPOT #2)          │   cognitive load: HIGH
  │  · 679 LOC, 9 migration steps        │   info leakage to sync: HIGH
  │  · fires sync side-effects from      │
  │    8 call sites                       │
  └──────────────────┬───────────────────┘
                     │
  ┌─ Sync ───────────▼───────────────────┐
  │  ★ supabase-sync.ts (HOTSPOT #3)     │   unknown unknowns: HIGH
  │  · restoreInProgress global flag     │   info leakage: HIGH (mapper)
  │  · early-return on first error        │
  │  · watermark ↔ mapper ↔ database     │
  └──────────────────────────────────────┘
```

Three hotspots, ranked. The rest of this guide attacks them with the right primitive.

## Implementation in codebase

**Use cases.** "Where do I go when contrl feels heavy?" Three places.

### Hotspot #1 — `src/hooks/useGameState.ts`

```ts
src/hooks/useGameState.ts  (the file as a whole, 333 LOC)

useGameStateInternal(dbReady)              ← orchestrator hook
  ├─ state: user, week, gates, sessions,    ← 6 slices in one hook
  │         streak, draft
  ├─ refs:  userRef, gateProgressRef,       ← 3 refs for stale-closure
  │         weekProgressRef                    workaround
  ├─ effect: load on dbReady                 ← phase 1
  ├─ effect: sync refs to state              ← phase 2 (race window)
  └─ logSession(session)                     ← 100 LOC of side effects
       │
       ├─ evaluate session                   } domain logic
       ├─ update gate                        } that should live
       ├─ check level-up                     } in src/lib/game/
       ├─ update week                        } not here
       ├─ insert session row                 } persistence
       └─ pushChanges().catch(...)           } fire-and-forget sync
```

What breaks if you edit naively: a setState inside an async function that already ran, an updated ref that hasn't propagated yet, or a `pushChanges()` that fires before the local write committed. All three have bitten this file before — the refs are the evidence.

### Hotspot #2 — `src/services/database.ts`

```ts
src/services/database.ts  (679 LOC)

migrate()                                    ← 87-line top-level migration
  ├─ CREATE TABLE … (9 tables)               ← schema-as-code
  ├─ ALTER TABLE legacy columns              ← ad-hoc backfill
  └─ re-key week_progress Sunday→Monday      ← temporal logic from
                                                a specific refactor,
                                                lives here forever

CRUD functions × 9 tables                    ← consistent shape, but
  insertX → runAsync → pushChanges().catch() ← every write fires sync
  updateX → runAsync → pushChanges().catch() ← side-effect (8 sites)
  deleteX → runAsync → pushChanges().catch()
```

The migration accumulates. Every refactor like the Sunday→Monday week change adds a permanent block of one-shot logic. The fire-and-forget pattern hides sync coupling at every call site.

### Hotspot #3 — `src/services/sync/supabase-sync.ts`

```ts
src/services/sync/supabase-sync.ts  (~196 LOC)

let restoreInProgress = false                ← module-global flag

pushChanges()                                ← 5 tables, sequential
  for each table:
    fetch dirty rows (watermark)             ← cognitive: per-table
    map to remote shape                      ← per-table mapper call
    upsert                                   ← per-table REST call
    if error: return                         ← EARLY RETURN — leaves
                                                later tables unpushed
  advance watermark                          ← only on full success

pullRestoreIfFresh()
  restoreInProgress = true                   ← guards push during restore
  …
  restoreInProgress = false
```

The module-global flag IS the contract for "don't push during a restore." It's invisible at every push call site. You can't tell `pushChanges()` will silently skip from reading any caller.

## Elaborate

Ousterhout's framing in *A Philosophy of Software Design* is that complexity is **what makes a system hard to modify**, full stop. Not bytes of code, not number of features. The symptoms are the diagnostic; the cure is always the same primitive applied differently — push the complexity inward, into modules with small interfaces.

The pattern in contrl is recognizable: a young codebase that grew feature-first, where the load-bearing modules absorbed the orchestration that *should* have lived behind small interfaces. The hooks layer is doing domain work because the domain layer's surface is too granular to feel useful. The persistence layer is firing side effects because there's no "transaction with sync" abstraction to call instead.

The fix isn't a rewrite. It's three or four specific extractions, each driven by one of the primitives in this guide:

- `02-deep-vs-shallow-modules.md` says: make `sync/mapper.ts` deep (currently 10 near-identity functions over `any`)
- `03-information-hiding-and-leakage.md` says: emit DB schema once, derive mappers
- `04-layers-and-abstractions.md` says: collapse `useExercises` / `useDatabase` into a Context
- `06-errors-and-special-cases.md` says: replace early-return-on-first-error with accumulated results

Read those next.

## Interview defense

**Q: "Walk me through where complexity lives in this app and how you'd think about reducing it."**

```
  the 60-second whiteboard answer

  ┌─ Three hotspots, ranked by cost ─────────────────┐
  │                                                  │
  │  1. useGameState.ts  — hook owns domain logic    │
  │  2. database.ts      — migration + sync coupling │
  │  3. supabase-sync.ts — global flag + early-return│
  │                                                  │
  └──────────────────────────────────────────────────┘

  Common root cause: complexity pushed UP into callers
  instead of absorbed DOWN into modules.

  My move: extract the game-rule subroutines into
  src/lib/game/ pure functions, give sync a real
  "transaction" abstraction, derive mappers from one
  schema source.
```

Anchor: name the symptom in their terms. "useGameState is the cognitive-load hotspot; database↔sync coupling is the change-amplification hotspot."

**Q: "Why isn't this just normal growing pains?"**

It is normal growing pains. The discipline is to **notice the symptoms early**, not to never accumulate complexity. The interview answer is honest: "It hasn't broken me yet; here are the three places I'd refactor before they do, and the order I'd do them in."

**Q: "What would you NOT touch?"**

The deep modules — `rep-counter.ts`, `reconstruct.ts`, the `lib/game/` pure functions, the per-exercise pose processors. They're working, their interfaces are small, their bodies are dense. The temptation to "modernize" them is the trap.

## Validate

1. **Reconstruct.** Sketch the layer diagram from memory; mark the three hotspots with a star.
2. **Explain.** What's the difference between change amplification, cognitive load, and unknown unknowns? Give one example of each from contrl.
3. **Apply.** A teammate proposes adding `sessions.heart_rate_bpm`. List the files that would change and identify the change-amplification driver.
4. **Defend.** Argue against splitting `useGameState` into 6 smaller hooks. Then argue for it. Which argument is stronger?

## See also

- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md) — the primary cure for cognitive load
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — the primary cure for change amplification
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md) — the cure for pass-through cognitive load
- [08-red-flags-audit.md](./08-red-flags-audit.md) — the ranked fix list across all primitives
- `.aipe/study-system-design-dsa/01-system-design/` — the architecture this layer sits on
