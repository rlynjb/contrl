# Red flags audit
### The capstone checklist — Industry standard (APOSD red-flag inventory)

> The other seven files isolated specific findings. This file is the actionable index: every red flag, marked against contrl, ranked by severity and cost-to-fix. Read this last.

## Zoom out, then zoom in

Each red flag in APOSD names a specific kind of design pain. They show up together — fixing one often fixes two. The map: which red flags fire in contrl, which don't, and which fixes have the most leverage.

```
  Zoom out — the red-flag dashboard

  ┌─ Tier 1 (fires LOAD-BEARING in contrl) ──────────────────────┐
  │   information leakage                  → file 03             │
  │   shallow module                       → file 02             │
  │   untested code-as-design-smell        → file 06 + testing   │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Tier 2 (fires NON-CRITICAL in contrl) ──────────────────────┐
  │   pass-through method                  → file 04             │
  │   pass-through variable                → file 04, 05         │
  │   avoidable config / pushed-up knob    → file 05             │
  │   try/except sprawl (fire-and-forget)  → file 06             │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Tier 3 (fires LIGHTLY in contrl) ───────────────────────────┐
  │   temporal decomposition (logSession)  → file 03             │
  │   vague names (r: any, processor.…)    → file 07             │
  │   comments that paraphrase code        → file 07             │
  │   magic numbers duplicated              → file 05             │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Doesn't fire in contrl ─────────────────────────────────────┐
  │   god class                                                   │
  │   feature envy                                                │
  │   global mutable state (except restoreInProgress)             │
  │   premature optimization                                      │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. Three tier-1 flags, four tier-2, four tier-3. The cure list collapses to **five concrete refactors** because each refactor fixes multiple flags at once.

## Structure pass

Layers across all eight concept files: UI / Hooks / Domain / Persistence / Sync.

Axis traced across the whole guide: **cognitive load** (how much you need to hold in your head to safely edit each layer).

```
  The map, viewed across the audit

  layer        red flags firing                       severity
  ─────        ────────────────                       ────────
  UI            ─                                      OK
  Hooks         pass-through (useExercises),           tier 2
                pass-through variable (dbReady),       tier 2
                temporal in useGameState.logSession    tier 3
                pushed-up knob (isHold)                tier 2
  Domain        ─                                      OK
                (rep-counter, reconstruct, gate-check
                are the codebase's strongest modules)
  Persistence   info leakage (schema ↔ types),         TIER 1
                untestable as designed (no DI seam),   TIER 1
                fire-and-forget at 8 sites             tier 2
                migrate() mixes concerns               tier 3
  Sync          shallow module (mapper, 10 fns),       TIER 1
                info leakage (mapper ↔ schema),        TIER 1
                obviousness (restoreInProgress),       tier 3
                early-return drops tables              tier 2
                r: any everywhere                      tier 3
```

Seam: every TIER-1 flag fires on the **persistence ↔ sync seam**. That's the single highest-leverage place to refactor.

## How it works

#### Move 1 — the picture of "ranked across the repo"

Most audit checklists output a flat list. The useful output ranks by (severity × cost-to-fix) so the reader knows where to start.

```
  The 2×2 — severity vs cost-to-fix

  HIGH severity          ┌─────────────────────┬────────────────────┐
                         │                     │                    │
                         │  fix NOW            │  plan & execute    │
                         │  (high payoff,      │  (high payoff,     │
                         │   low cost)         │   high cost)       │
                         │                     │                    │
                         ├─────────────────────┼────────────────────┤
                         │                     │                    │
                         │  fix when nearby    │  defer; revisit    │
                         │  (low cost,         │  (low payoff,      │
                         │   low payoff)       │   high cost)       │
                         │                     │                    │
  LOW severity           └─────────────────────┴────────────────────┘
                         LOW cost-to-fix                HIGH cost-to-fix
```

contrl's findings cluster in the top-left (fix now) and top-right (plan & execute). Below.

#### Move 2 — the ranked findings

Each finding has the same shape: red flag → location → severity → fix → file in this guide that explains it.

```
  ════════════════════════════════════════════════════════════════
   TIER 1 — fix soon, high payoff
  ════════════════════════════════════════════════════════════════

  FINDING 1.  Information leakage at the persistence ↔ sync seam
              Locations: src/services/database.ts (schema)
                         src/services/sync/mapper.ts (10 fns)
                         src/types/index.ts (TS shapes)
              Severity:  Tier 1 (3-file edit for one column)
              Fix:       Single FIELD_MAP source; mapper consumes it.
                         Or: generate Supabase types via CLI.
              Cost:      MEDIUM (1-2 day refactor)
              See:       03-information-hiding-and-leakage.md
              Fixes also: shallow mapper (file 02), r: any (file 07)

  FINDING 2.  Shallow module — sync/mapper.ts
              Location:  src/services/sync/mapper.ts (155 LOC, 10 fns)
              Severity:  Tier 1 (every column add ripples through it)
              Fix:       Collapse to one bidirectional function backed
                         by FIELD_MAP; OR generate from schema.
              Cost:      MEDIUM (same refactor as FINDING 1)
              See:       02-deep-vs-shallow-modules.md
              Fixes also: r: any readability (file 07), info leakage

  FINDING 3.  Untestable persistence + sync code (no seam to mock)
              Locations: src/services/database.ts (679 LOC)
                         src/services/sync/supabase-sync.ts
                         src/hooks/useGameState.ts (333 LOC)
              Severity:  Tier 1 (no way to verify the fixes above
                         without writing tests for them)
              Fix:       Extract pure game-rule subroutines from
                         useGameState; inject sync engine into
                         database layer.
              Cost:      LARGE (incremental, file by file)
              See:       .aipe/study-testing/03-tests-as-design-pressure.md

  ════════════════════════════════════════════════════════════════
   TIER 2 — fix when in the area, moderate payoff
  ════════════════════════════════════════════════════════════════

  FINDING 4.  Pass-through hook — useExercises
              Location:  src/hooks/useExercises.ts (31 LOC)
              Severity:  Tier 2 (works today; will break when 3+
                         components want to share the cache)
              Fix:       Convert to a Context provider with shared
                         cache + reload.
              Cost:      SMALL (couple hours)
              See:       04-layers-and-abstractions.md

  FINDING 5.  Pass-through variable — useGameStateInternal(dbReady)
              Location:  src/hooks/useGameState.ts (line ~67)
              Severity:  Tier 2 (minor cognitive load on every caller)
              Fix:       Consume useDatabase() inside; remove param.
              Cost:      TINY (one-line refactor)
              See:       05-pull-complexity-downward.md

  FINDING 6.  Pushed-up knob — updateValue(isHold)
              Location:  src/hooks/useExerciseForm.ts (~line 120)
              Severity:  Tier 2 (one extra parameter to remember)
              Fix:       Read hold-vs-reps from form state internally.
              Cost:      TINY
              See:       05-pull-complexity-downward.md

  FINDING 7.  Fire-and-forget sync at 8 call sites
              Location:  src/services/database.ts (× 8 CRUDs)
              Severity:  Tier 2 (silent failure mode in production)
              Fix:       Sync engine that aggregates retry + surfacing.
              Cost:      MEDIUM (part of the structural fix in FINDING 1)
              See:       06-errors-and-special-cases.md

  ════════════════════════════════════════════════════════════════
   TIER 3 — note now, fix when convenient
  ════════════════════════════════════════════════════════════════

  FINDING 8.  Temporal decomposition — useGameState.logSession()
              Location:  src/hooks/useGameState.ts (~100 LOC function)
              Severity:  Tier 3 today (works); Tier 1 next refactor
              Fix:       Extract pure applySessionToState; persist diff.
              Cost:      LARGE (intertwined with FINDINGS 1 and 3)
              See:       03-information-hiding-and-leakage.md

  FINDING 9.  Vague typing — r: any in mapper functions
              Location:  src/services/sync/mapper.ts (27 sites)
              Severity:  Tier 3 (slows reading; type-check escape)
              Fix:       Supabase-generated row types.
              Cost:      SMALL (part of FINDING 1)
              See:       07-readability.md

  FINDING 10. Invisible contract — restoreInProgress module-global
              Location:  src/services/sync/supabase-sync.ts (line 32)
              Severity:  Tier 3 today; Tier 2 once more callers exist
              Fix:       Sync engine state machine (part of FINDING 1);
                         interim: an interface comment.
              Cost:      SMALL (interim); MEDIUM (structural)
              See:       03-information-hiding-and-leakage.md, file 07

  FINDING 11. Magic number duplicated — landmark visibility 0.5
              Location:  src/components/camera/SetCameraOverlay.tsx
                         (~lines 69-77, two occurrences)
              Severity:  Tier 3 (small surface)
              Fix:       Single constant in src/lib/pose/landmarks.ts.
              Cost:      TINY
              See:       05-pull-complexity-downward.md

  FINDING 12. migrate() function mixes schema + backfill + re-keying
              Location:  src/services/database.ts (87-line migration)
              Severity:  Tier 3 today; will compound over time
              Fix:       Versioned migration objects with explicit
                         ordering and per-step transactions.
              Cost:      MEDIUM
              See:       01-complexity-in-this-codebase.md
```

#### Move 2 variant — the five refactors that cover most of the list

Many findings cluster into the same fix. The recommended refactor sequence:

```
  Refactor 1. Generate Supabase row types  (FIXES: 1, 2, 9)
              Run `supabase gen types typescript`; replace `any` in
              mapper.ts with the generated row types.
              Cost: SMALL. Risk: TINY.

  Refactor 2. Define ONE field-map source  (FIXES: 1, 2)
              Either FIELD_MAP constant OR derive from Supabase types.
              Mapper becomes a single bidirectional function.
              Cost: MEDIUM. Risk: SMALL (typed everywhere now).

  Refactor 3. Extract pure game-rule functions from useGameState
                                             (FIXES: 3, 8)
              applySessionToState(state, session) → newState
              persistStateDiff(old, new) → side-effect
              Cost: MEDIUM. Risk: MEDIUM (intertwined logic).

  Refactor 4. Sync engine                   (FIXES: 7, 10, partial 3)
              syncEngine.enqueueWrite + drain queue + state machine
              Replaces 8× pushChanges().catch().
              Cost: MEDIUM. Risk: MEDIUM (changes failure semantics).

  Refactor 5. useExercises → Context        (FIXES: 4)
              Shared cache + reload across consumers.
              Cost: SMALL. Risk: TINY.
```

Five refactors, ~80% of the audit cleared. Refactor 1 is free; do it tomorrow. Refactor 5 is tiny; do it when next touching the screen that uses `useExercises`. Refactors 2–4 are the structural shift — plan them together.

#### Move 3 — the principle

> The audit isn't the work; it's the prioritized to-do list. Don't fix everything at once; fix the structural items first because they take the symptoms with them.

The pattern in contrl is recognizable as healthy: the deep modules (`rep-counter`, `reconstruct`, the `lib/game/` pure functions) are clean. The weak spots cluster at one seam. That's a young codebase pattern, not a failing codebase pattern.

## Primary diagram

```
  The contrl audit dashboard

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  THE BIG REFACTOR — persistence/sync seam                              │
  │                                                                        │
  │   Refactor 1: gen Supabase row types          ★ do tomorrow            │
  │   Refactor 2: one FIELD_MAP source             ┐                       │
  │   Refactor 3: extract pure game-rules          ├─ plan together        │
  │   Refactor 4: sync engine                      ┘                       │
  │                                                                        │
  │   covers: FINDINGS 1, 2, 3, 7, 8, 9, 10        (8 of 12 findings)      │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  THE QUICK WINS — do whenever you're in the file                       │
  │                                                                        │
  │   Refactor 5: useExercises → Context           ★ do next               │
  │   useGameStateInternal: drop dbReady param                              │
  │   updateValue: drop isHold param                                        │
  │   landmark threshold: extract constant                                  │
  │                                                                        │
  │   covers: FINDINGS 4, 5, 6, 11                  (4 of 12 findings)     │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  THE LONG TAIL                                                          │
  │                                                                        │
  │   migrate() decomposition (FINDING 12) — wait until next big migration │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

This file is the index, not the deep-dive. Each finding above points to the concept file that walks the diagnostic and the fix. Use it as a roadmap:

- **Start here** for an overview of where complexity lives → file 01
- **For each refactor** open the linked concept file → files 02–07
- **As you fix** mark a finding resolved in your own notes (the audit will rerun against the next state of the code; resolved findings drop off)

## Elaborate

The strongest signal in this audit isn't any single finding — it's the *clustering*. Eight of twelve findings touch the persistence ↔ sync seam. That's a structural observation, not a list of micro-fixes. The right response is one bigger refactor, not eleven small ones.

This is the difference between an audit that names a hundred surface issues and an audit that finds the load-bearing fault. APOSD's framing is the second kind: complexity is one substance, and it accumulates at specific joints. Find the joints, fix the structure, and most of the surface issues vanish.

The audit is also honest about what's strong. The `lib/game/` and `lib/pose/` modules are textbook examples of the depth this guide preaches. The reason the persistence/sync layer reads worse isn't that the engineer slipped — it's that those modules are doing real distributed-systems work (bidirectional sync with conflict handling) without yet having grown the abstraction that work needs. That abstraction is what the proposed sync engine refactor names.

## Interview defense

**Q: "Walk me through the design audit of your codebase. What would you fix first?"**

```
  60-second answer

  ┌─ Strong modules ───────────────────────────────────────────────┐
  │  The pose pipeline (rep-counter, exercise processors) and the │
  │  game-rule layer (reconstruct, gate-check, progression) are   │
  │  the strongest parts of the codebase — deep modules, small    │
  │  interfaces, dense behaviour.                                  │
  └────────────────────────────────────────────────────────────────┘

  ┌─ Weakness clusters at one seam ────────────────────────────────┐
  │  The persistence ↔ sync seam. Eight of twelve audit findings  │
  │  touch it.                                                     │
  │                                                                │
  │  Symptoms: shallow mapper (10 rename functions),               │
  │            info leaks (3-file edit for one column),            │
  │            fire-and-forget sync at 8 call sites,               │
  │            module-global flag governs invisible behavior.      │
  │                                                                │
  │  Root cause: missing abstraction. There's no "sync engine"     │
  │  type — sync is scattered across mapper.ts + supabase-sync.ts │
  │  + 8 callers in database.ts.                                   │
  └────────────────────────────────────────────────────────────────┘

  ┌─ The refactor sequence ────────────────────────────────────────┐
  │  1. Gen Supabase row types (free, ~30 min, eliminates `any`)   │
  │  2. One field-map source (medium, fixes column-add ripple)    │
  │  3. Extract pure game-rule functions from useGameState         │
  │  4. Sync engine (medium, fixes failure model)                  │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "find the joint, fix the structure, the surface symptoms vanish."

**Q: "What's the cheap win you'd ship this week?"**

Generating Supabase types. One CLI command, eliminates `any`, makes the mapper type-checked. No structural change required, no risk. Once the rows are typed, the bigger refactor (one field-map source) becomes safe — mistakes become compile errors instead of runtime bugs.

**Q: "What would you NOT touch?"**

`src/lib/game/` and `src/lib/pose/`. They're the strongest modules; touching them risks the kind of "I'll just modernize" damage that loses real invariants. If they need to change, it'll be because the design above them changed — not because they look old.

## Validate

1. **Reconstruct.** From memory, list the five recommended refactors and which findings each fixes.
2. **Explain.** Why does Refactor 1 (gen Supabase types) sequence first? What does it unlock?
3. **Apply.** Pick any tier-2 finding. Sketch the diff (file, function, one-line summary).
4. **Defend.** Argue that the current sync code is fine because "it works in production." Then rebut.

## See also

- [01-complexity-in-this-codebase.md](./01-complexity-in-this-codebase.md) — the diagnostic that opens this guide
- [02-deep-vs-shallow-modules.md](./02-deep-vs-shallow-modules.md)
- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md)
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md)
- [05-pull-complexity-downward.md](./05-pull-complexity-downward.md)
- [06-errors-and-special-cases.md](./06-errors-and-special-cases.md)
- [07-readability.md](./07-readability.md)
- `.aipe/study-testing/` — the test plan that would have caught these
- `.aipe/study-system-design-dsa/` — the architecture context for the persistence/sync seam
