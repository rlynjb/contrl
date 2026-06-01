# Testing red flags audit
### The capstone checklist — Industry standard

> The other six files isolated findings. This file is the ranked build-order: which tests to write first, in what order, at what level, to get the most safety for the least effort. With zero tests today, the audit is fully a buildable-target plan.

## Zoom out, then zoom in

contrl has no test infrastructure. That's both the biggest finding and the biggest opportunity — the build-order is yours to choose, and the right order produces a usable safety net within a week or two of focused work, not months.

```
  Zoom out — the test build, ranked by payoff/effort

  ┌─ Day 1 (harness + first 10 tests) ───────────────────────────┐
  │   ★ scaffold: vitest + clock module + test-DB factory        │
  │   ★ tier-3 unit tests: angles, week-progress, streaks         │
  │   payoff: warm up the team on the harness, catch easy bugs   │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Day 2-3 (tier-2 unit tests) ────────────────────────────────┐
  │   ★ rep-counter FSM with pose fixtures                       │
  │   ★ gate-check + progression (game rule corners)             │
  │   ★ reconstruct against synthesized session histories         │
  │   ★ per-exercise classifier processors                       │
  │   payoff: the load-bearing game logic is verifiable          │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Day 4-5 (tier-1 integration tests) ─────────────────────────┐
  │   ★ SQLite migrations against real :memory: DB               │
  │   ★ sync round-trip (local → push → fresh DB → pull)         │
  │   ★ sync partial-failure (table N fails, N+1..end succeed)    │
  │   payoff: the highest-cost-of-failure paths are covered      │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Day 6 (CI + watch loop) ────────────────────────────────────┐
  │   ★ GitHub Actions runs `vitest run` on every push           │
  │   ★ failures block merge                                     │
  │   payoff: discipline is enforced; flake-zero from day one    │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. The build-order is dense at the start (lots of cheap unit tests) and tapers (a few high-value integration tests). The pyramid emerges naturally from the priority order, not because we deliberately shape it.

## Structure pass

Layers across all seven files: UI / Hooks / Domain / Persistence / Sync / external (model, cloud).

Axis traced across the whole guide: **silent failure** — does this surface break in a way users notice, or in a way that lies for weeks?

```
  The map, viewed across the audit

  layer            highest-priority test                        level
  ─────            ─────────────────────                        ─────
  Domain           rep-counter FSM, gate-check, progression,    unit
  (testable)       reconstruct, angles, week-progress, streaks
  Persistence      migrations, CRUD round-trips per table       integration
                   (real SQLite, :memory:)
  Sync             partial failure handling,                     integration
                   round-trip preserves data                     (real test
                                                                  Supabase or
                                                                  FakeTarget)
  Hooks            useGameState (after pure extraction)          integration
                                                                  (testing-
                                                                  library)
  External         pose detection on labeled videos              EVAL (not test)
                   LLM coaching agent on adversarial corpus      EVAL (not test)
```

Seam: every test in this list crosses a clean layer boundary. The dependencies are explicit, the inputs are deterministic, the assertions are exact. That's because the code is mostly well-shaped — the testing problem is the absence of tests, not the absence of testability (with the three caveats from file 03).

## How it works

#### Move 1 — the picture of "test build, ranked"

You already do this when triaging. Triage says: what hurts most if I'm wrong, and how cheaply can I fix it? The test triage is the same shape: which test would have caught the biggest bug for the smallest effort?

```
  The 2×2 — payoff vs effort

  HIGH payoff           ┌─────────────────────┬────────────────────┐
                        │                     │                    │
                        │  WRITE FIRST        │  plan the time     │
                        │  (high catch rate,  │  (high catch,      │
                        │   low effort)       │   high effort)     │
                        │                     │                    │
                        ├─────────────────────┼────────────────────┤
                        │                     │                    │
                        │  write when         │  defer (low ROI)   │
                        │  in the area        │                    │
                        │  (low effort,       │                    │
                        │   low catch)        │                    │
  LOW payoff            └─────────────────────┴────────────────────┘
                        LOW effort                       HIGH effort
```

contrl's tier-3 tests are top-left (cheap, decent catch rate). Tier-2 are top-left or top-right (depending on fixture cost). Tier-1 are top-right (high catch, high effort). E2E are top-right (highest effort, but distinct value).

#### Move 2 — the ranked findings

Each finding has the same shape: red flag → location → why it matters → fix → time to write.

```
  ════════════════════════════════════════════════════════════════
   TIER 1 — silent-failure risk, write integration tests
  ════════════════════════════════════════════════════════════════

  FINDING 1.  No test for SQLite migrations
              Location:    src/services/database.ts migrate() (87 LOC,
                           9 ops, no transaction wrapping)
              Catches:     schema corruption, missing backfill, idempotency
                           bugs, ordering errors
              Test type:   integration, real :memory: SQLite
              Suite size:  3-5 tests (fresh, idempotent, from-v1)
              Time:        half day (write harness + tests)
              See:         file 01, file 02

  FINDING 2.  No test for sync round-trip
              Location:    src/services/sync/supabase-sync.ts +
                           src/services/sync/mapper.ts
              Catches:     mapper bugs, watermark bugs, JSON parse
                           bugs, restore-flow bugs (the single highest-
                           value test in the codebase)
              Test type:   integration, real test Supabase OR
                           FakeSyncTarget
              Suite size:  2-3 tests (happy path, partial failure,
                           reinstall)
              Time:        1 day (most of it is test-cloud or fake
                           target setup)
              See:         file 01, file 02, file 05

  FINDING 3.  No test for reconstruct after reinstall
              Location:    src/lib/game/reconstruct.ts
              Catches:     mixed-clean/dirty session sequence bugs
                           (the file's known gate.status edge), level-up
                           cascade bugs, future-session-skip rule
              Test type:   unit (pure function)
              Suite size:  5-8 tests (various session histories)
              Time:        2-3 hours
              See:         file 01, file 05

  ════════════════════════════════════════════════════════════════
   TIER 2 — wrong-result risk, write unit tests
  ════════════════════════════════════════════════════════════════

  FINDING 4.  No test for rep-counter FSM
              Location:    src/lib/pose/rep-counter.ts
              Catches:     hysteresis ping-pong, phantom reps from gap+
                           mid-rep landmarks, phase transition edges
              Test type:   unit with angle fixtures (no pose needed)
              Suite size:  6-10 tests
              Time:        2-3 hours
              See:         file 02, file 04, file 05

  FINDING 5.  No test for gate-check + progression
              Location:    src/lib/game/gate-check.ts, progression.ts
              Catches:     3-consecutive-pass rule, MAX_LEVEL ceiling,
                           gate transition corner cases
              Test type:   unit
              Suite size:  8-12 tests
              Time:        half day
              See:         file 02, file 05

  FINDING 6.  No test for per-exercise pose processors
              Location:    src/lib/pose/exercises/{pushup,squat,plank}.ts
              Catches:     visibility threshold, smoothing factor edge,
                           zero-magnitude vector handling
              Test type:   unit with recorded landmark fixtures
              Suite size:  3-5 tests per exercise = ~10 total
              Time:        half day (most cost is recording the
                           fixtures, one-time work)
              See:         file 02, file 06

  FINDING 7.  No test for sync/mapper.ts
              Location:    src/services/sync/mapper.ts
              Catches:     field rename bugs, JSON serialize/deserialize
                           round-trip, malformed input handling
              Test type:   unit
              Suite size:  10 functions × 2-3 tests each = 20-30 tests
                           (or, after Zod schema refactor, far fewer
                            because the schema is the test)
              Time:        half day
              See:         file 02, file 05

  ════════════════════════════════════════════════════════════════
   TIER 3 — cheap warm-up tests
  ════════════════════════════════════════════════════════════════

  FINDING 8.  No test for angle math
              Location:    src/lib/pose/angles.ts (calculateAngle,
                           smoothAngle, averageLandmarks)
              Catches:     arithmetic bugs, zero-magnitude vector,
                           interpolation edges
              Test type:   unit, pure math
              Suite size:  ~10 tests
              Time:        1-2 hours
              See:         file 01, file 02

  FINDING 9.  No test for week-progress utilities
              Location:    src/lib/game/week-progress.ts
              Catches:     Sun/Mon boundary, year boundary, week-reset
                           detection edges
              Test type:   unit, pure date logic
              Suite size:  5-8 tests
              Time:        1-2 hours
              See:         file 01, file 05

  FINDING 10. No test for streak calculation
              Location:    src/lib/game/streaks.ts
              Catches:     consecutive-week counting, gap detection
              Test type:   unit
              Suite size:  3-5 tests
              Time:        1 hour

  ════════════════════════════════════════════════════════════════
   META — infrastructure findings
  ════════════════════════════════════════════════════════════════

  FINDING M1. No test framework installed
              Fix:         add vitest, @vitest/coverage-v8 to devDeps
              Time:        15 minutes

  FINDING M2. No clock injection
              Fix:         src/lib/clock.ts module with now()/nowIso()
                           plus setClockForTest()
              Time:        1-2 hours (write module + refactor all
                           new Date() / Date.now() callers in
                           database.ts and game logic)
              See:         file 04

  FINDING M3. No fixture infrastructure
              Fix:         tests/helpers/load-fixture.ts +
                           tests/helpers/test-db.ts + first pose fixture
              Time:        1-2 hours
              See:         file 04, file 06

  FINDING M4. No CI test step
              Fix:         .github/workflows/test.yml runs `vitest run`
                           on every push; blocks merge on failure
              Time:        30 minutes
              See:         file 04

  FINDING M5. Code under test is intertwined with side effects
              Fix:         extract pure subroutines from
                           useGameState.logSession (see study-software-
                           design's recommended refactor)
              Time:        1-2 days (this is the design fix that
                           unlocks the testing fix)
              See:         file 03
```

#### Move 2 variant — the four-bucket plan

```
  Bucket A — Day 1 setup + Tier 3 tests (cheap warm-up)
            M1, M2, M3, M4: harness scaffold
            8, 9, 10: angle math, week-progress, streaks
            total: ~1 day for everything in this bucket

  Bucket B — Day 2-3 Tier 2 unit tests (load-bearing logic)
            4, 5, 6, 7: FSM, game-rule, per-exercise, mapper
            total: ~2 days

  Bucket C — Day 4-5 Tier 1 integration tests
            1, 2, 3: migrations, sync round-trip, reconstruct
            total: ~1.5-2 days (most cost is test-cloud/fake-target
                                setup)

  Bucket D — When the design refactor lands
            M5: useGameState extraction → enables hook integration
                tests via testing-library/react
            total: ~half day after the design refactor
```

A week of focused work moves contrl from "zero tests" to "the highest-risk paths are covered, with a CI that blocks regressions." That's the right week to invest.

#### Move 3 — the principle

> Build the suite in priority order. Cheap warm-up tests teach the harness; tier-2 unit tests cover the most-changed logic; tier-1 integration tests catch the silent-failure paths; CI enforces from day one. Don't aim for "complete" — aim for "the bugs that hurt are caught."

## Primary diagram

```
  The contrl test build-order

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  DAY 1 — Bucket A (harness + cheap warm-up)                            │
  │                                                                        │
  │   ▸ vitest + @vitest/coverage-v8 installed                             │
  │   ▸ src/lib/clock.ts module (clock injection)                          │
  │   ▸ tests/helpers/{load-fixture, test-db}.ts                           │
  │   ▸ tests/unit/pose/angles.test.ts          (~10 tests)                │
  │   ▸ tests/unit/game/week-progress.test.ts   (~8 tests)                 │
  │   ▸ tests/unit/game/streaks.test.ts         (~5 tests)                 │
  │   ▸ .github/workflows/test.yml              (CI block on failure)      │
  │                                                                        │
  │   ★ FOUNDATION LAID — flake-zero policy is the default                 │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  DAY 2-3 — Bucket B (tier-2 unit tests)                                │
  │                                                                        │
  │   ▸ tests/fixtures/pose/{pushup-clean,squat-clean,plank}.json          │
  │     (one-time recording, takes an hour)                                │
  │   ▸ tests/unit/pose/rep-counter.test.ts       (~10 tests)              │
  │   ▸ tests/unit/pose/exercises/{pushup,squat,plank}.test.ts (~10 tests) │
  │   ▸ tests/unit/game/gate-check.test.ts        (~8 tests)               │
  │   ▸ tests/unit/game/progression.test.ts       (~6 tests)               │
  │   ▸ tests/unit/sync/mapper.test.ts            (~15 tests, or far       │
  │                                                  fewer with Zod)       │
  │                                                                        │
  │   ★ LOAD-BEARING DOMAIN LOGIC VERIFIABLE                              │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  DAY 4-5 — Bucket C (tier-1 integration tests)                         │
  │                                                                        │
  │   ▸ tests/integration/db/migrations.test.ts                            │
  │     ─ fresh, idempotent, from-v1 (3 tests)                             │
  │   ▸ tests/integration/db/crud.test.ts                                  │
  │     ─ each table: insert + select + update + delete (~12 tests)        │
  │   ▸ tests/integration/sync/round-trip.test.ts                          │
  │     ─ THE single highest-value test in the suite                       │
  │   ▸ tests/integration/sync/partial-failure.test.ts                     │
  │     ─ verify accumulate-results model (requires file-06 refactor)      │
  │                                                                        │
  │   ★ SILENT-FAILURE PATHS COVERED                                       │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │  WHEN THE STRUCTURAL REFACTOR LANDS — Bucket D                         │
  │                                                                        │
  │   ▸ extract applySessionToState from useGameState (design fix)         │
  │   ▸ tests/unit/game/apply-session.test.ts                              │
  │   ▸ tests/integration/hooks/use-game-state.test.tsx (testing-library)  │
  │                                                                        │
  │   ★ THE MOST-CHANGED CODE IS TESTABLE WITHOUT MOCKING THE WORLD       │
  └────────────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

This file is the index. Each finding above points to the concept file that walks the diagnostic and the build target. Use it as the build-order checklist.

The honest framing: **contrl ships acceptably without tests today** (single user, MVP scope, deterministic pose pipeline, deferred LLM). The cost of zero tests rises sharply at three transitions:

1. **The next nontrivial refactor** (sync engine, useGameState extraction) — without tests, the refactor risks silent regression
2. **The Phase 4 agent surface** — adversarial tests are the only proof the defense envelope works
3. **The first multi-user release** — sync correctness becomes critical (data loss for one user is now data loss across many)

Building the suite before those transitions buys safety at every transition. The order above is the cheapest path.

## Elaborate

The "you should have written tests from day one" advice is true and useless — the codebase exists; the question is what to do now. The answer: write them in priority order, starting with the cheapest. The pyramid emerges naturally because Tier 3 is fastest, Tier 2 is medium, Tier 1 takes the most setup. Building bottom-up is exactly building shallowest-first, which is the recommended order for any test suite.

The single most-valuable test in the suite is `tests/integration/sync/round-trip.test.ts`: local → push → fresh DB → pull → assert byte-equal. It exercises the mapper, the schema, the watermark, the restore-flow, and the JSON round-trip in one test. It's the hardest to set up. It's worth more than every Tier 2 test combined.

A note on the M5 finding (testability blocked by design): the testing problem and the design problem are the same problem viewed from different angles. The proposed refactor in `study-software-design/03-information-hiding-and-leakage.md` (extract pure game-rule subroutines from `useGameState`) is the design fix. It's also the testing fix. Doing one without the other is wasted effort. The discipline is to recognize that "this hook is hard to test" and "this hook is hard to change" are the same observation.

A note on the cost of zero tests: the cost shows up as **fear of refactoring**. Without tests, every change risks silent regression. Devs avoid risky changes; the codebase calcifies; eventually a refactor that would have been a one-day fix becomes a one-week rewrite because nobody's sure what depends on what. The tests are insurance against that calcification.

A note on what NOT to build first: e2e tests with the camera. The setup cost is enormous (Detox, simulator orchestration, video fixture replacement). The payoff is small until the rest of the suite is in place. Defer until Tier 2 unit tests are complete and the harness is mature.

## Interview defense

**Q: "You don't have tests. What's your plan?"**

```
  ┌─ One week, ranked by payoff/effort ────────────────────────────┐
  │                                                                 │
  │  Day 1: Harness + Tier 3 tests                                 │
  │    Vitest, clock module, test-DB factory, CI.                  │
  │    Angle math + week math + streaks unit tests.                │
  │    → flake-zero from day one                                   │
  │                                                                 │
  │  Day 2-3: Tier 2 unit tests                                    │
  │    Rep-counter FSM with recorded landmark fixtures.            │
  │    Gate-check + progression. Per-exercise classifier.          │
  │    Mapper (helped by Zod schemas).                             │
  │    → the load-bearing domain logic is verifiable               │
  │                                                                 │
  │  Day 4-5: Tier 1 integration tests                             │
  │    Migrations against real :memory: SQLite.                    │
  │    Sync round-trip — THE highest-value test in the suite.     │
  │    Partial-sync-failure test.                                  │
  │    → the silent-failure paths are covered                      │
  │                                                                 │
  │  Total: ~5 days. Buys safety at every future transition         │
  │  (refactor, multi-user, agent surface).                         │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "build the suite in priority order, not in completeness order."

**Q: "Why is the sync round-trip the highest-value test?"**

Because it exercises the mapper, the schema, the watermark logic, the JSON round-trip, the restore flow, and the partial-failure path — all in one test. A pass means the full data-lifecycle works. A fail tells you exactly which layer broke. The setup cost is high; the per-test payoff is the highest in the suite.

**Q: "What's the cost of skipping the testing build entirely?"**

Fear of refactoring. Every change becomes "did I break something?" The answer is "you don't know," which means safe-by-default behavior wins, which means the code calcifies. The sync layer and `useGameState` are already harder to change than they need to be; without tests, they get harder. A week of test-building today saves multiple weeks of refactor-anxiety over the next year.

## Validate

1. **Reconstruct.** From memory, list the four buckets and what each one delivers.
2. **Explain.** Why is the sync round-trip the highest-value test in the suite?
3. **Apply.** You have one day. Which tests would you write? In what order?
4. **Defend.** Argue that testing should wait until Phase 4 ships. Then rebut.

## See also

- [01-what-is-tested-and-what-isnt.md](./01-what-is-tested-and-what-isnt.md)
- [02-test-design-and-levels.md](./02-test-design-and-levels.md)
- [03-tests-as-design-pressure.md](./03-tests-as-design-pressure.md)
- [04-determinism-isolation-and-flakiness.md](./04-determinism-isolation-and-flakiness.md)
- [05-edge-cases-and-error-paths.md](./05-edge-cases-and-error-paths.md)
- [06-testing-ai-features.md](./06-testing-ai-features.md)
- `.aipe/study-software-design/08-red-flags-audit.md` — the design refactors that unlock M5
- `.aipe/study-security/08-security-red-flags-audit.md` — the Phase 4 adversarial-eval gap
