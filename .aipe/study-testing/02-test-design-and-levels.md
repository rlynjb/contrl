# Test design and levels
### Test pyramid · unit/integration/e2e — Industry standard

> The pyramid (lots of unit tests, fewer integration, fewest E2E) is the right default. contrl has no tests today, so this file maps each surface to the right LEVEL — and names the trap of mocking the database, which would invert the pyramid quietly.

## Zoom out, then zoom in

The pyramid is a defaults guide, not a rule. Many unit tests at the bottom because they're cheap to write and fast to run. Fewer integration tests in the middle because they're slower and require setup. Very few E2E tests at the top because they're slow, flaky, and hardware-dependent. For each surface you ask: which level is cheapest and most informative for what could break here?

```
  Zoom out — the pyramid for contrl

                  ▲   E2E (very few)
                 ─┴─  ─ device + camera + pose pipeline
                ─────  ─ ~1-2 happy paths
                  ▲
                 ─┴─   INTEGRATION (some)
                ─────  ─ SQLite migrations against real DB
              ─────────  ─ sync round-trip (local ↔ test cloud)
                          ─ DB CRUD per table
                  ▲
                 ─┴─   UNIT (lots)
            ─────────────  ─ rep-counter FSM
           ──────────────── ─ angle math
          ──────────────────  ─ game-rule pure functions (reconstruct,
                                gate-check, progression)
                              ─ exercise classifier processors
```

Zoom in. Most of contrl's domain logic is **pure functions** (`src/lib/game/`, `src/lib/pose/angles.ts`, FSM in `src/lib/pose/rep-counter.ts`). Pure functions are perfect unit-test targets — easy to write, fast to run, exhaustive to enumerate. The codebase shape is unusually pyramid-friendly.

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **which level catches each class of bug?**

```
  Tracing the right-level axis

  bug class                       level that catches it      surface
  ─────────                       ──────────────────────     ───────
  arithmetic off-by-one           unit                       angles, week math
  state-machine miscount          unit (with fixture seq)    rep-counter
  game-rule logic error           unit                       gate-check,
                                                              progression
  classifier misclassification    unit (with pose fixture)   exercises/*
  schema migration bug            integration                migrations
  SQLite CRUD wrong column        integration                database.ts CRUD
  sync watermark wrong            integration                push/pull paths
  reconstruct after reinstall     integration                reconstruct
                                                              + db round-trip
  whole pipeline live with        E2E (device only)          full app
   camera
```

Seam: the **unit / integration** seam is where the pyramid breaks if you mock the database. Mocking SQLite means your "integration" tests degrade to unit tests with extra ceremony. The discipline is to test against real SQLite.

## How it works

#### Move 1 — picture of the levels

You already know the difference between `fn(input)` returns `output` (unit) and "did the request reach the right endpoint, did the DB row get inserted, did the next read return it" (integration). The pyramid says you should have many of the first and a few of the second — because the second is slow and hard.

```
  Three levels, three tradeoffs

  unit                         integration                   E2E
  ────                         ───────────                   ───
  ┌─ pure fn ──────┐           ┌─ multiple modules ──┐       ┌─ whole app ┐
  │ in: data       │           │ DB + sync + mapper  │       │ on device │
  │ out: data      │           │ together             │       │ + camera  │
  │ no I/O         │           │ real SQLite          │       │ + pose    │
  └────────────────┘           │ real test Supabase   │       │ + UI       │
                               └──────────────────────┘       └────────────┘

  cost: ~ms                    cost: ~100ms-1s               cost: seconds
  flake: ~0                    flake: low (with real DB)     flake: high
  feedback: instant            feedback: still fast           feedback: slow
  count: many (hundreds)       count: some (dozens)          count: handful
```

The numbers matter: a unit test that takes 1ms can run 10,000× in 10 seconds. An E2E test that takes 5 seconds means a single test run is a coffee break.

#### Move 2 — three test designs, walked through contrl

**Design 1. Unit test — RepCounter FSM.**

```ts
  // tests/unit/pose/rep-counter.test.ts (proposed)
  import { RepCounter } from '@/lib/pose/rep-counter';

  describe('RepCounter — pushup angle sequences', () => {
    test('counts one rep on a clean down-up cycle', () => {
      const rc = new RepCounter({ exerciseKind: 'pushup' });
      const angles = [
        170, 170, 165, 160, 140, 120, 100, 80, 70, 65,    // going down
        65,  70,  90,  110, 130, 150, 165, 168, 170, 170   // coming up
      ];
      const events = angles.map(a => rc.feed(a)).filter(Boolean);
      const repCompleted = events.filter(e => e.kind === 'rep').length;
      expect(repCompleted).toBe(1);
    });

    test('hysteresis dead zone prevents ping-pong', () => {
      const rc = new RepCounter({ exerciseKind: 'pushup' });
      const angles = [159, 161, 159, 161, 159, 161];     // bouncing on
                                                          // the boundary
      const events = angles.map(a => rc.feed(a)).filter(Boolean);
      // expect no rep completed because we never reach bottom
      expect(events.filter(e => e.kind === 'rep')).toEqual([]);
    });

    test('reset() returns to idle phase', () => {
      const rc = new RepCounter({ exerciseKind: 'pushup' });
      rc.feed(170);
      rc.feed(100);
      rc.reset();
      // assert: state is idle (use a phase accessor or feed
      // a known sequence and observe behaviour)
    });
  });
```

The unit test owns: deterministic input, deterministic output, no I/O. Three failure modes for `RepCounter` are covered (clean cycle, boundary ping-pong, reset). Total test execution time: milliseconds.

**Design 2. Integration test — sync round-trip.**

```ts
  // tests/integration/sync/round-trip.test.ts (proposed)
  describe('sync preserves all data through reinstall', () => {
    let db: TestDatabase;
    let cloud: TestSupabaseClient;

    beforeEach(async () => {
      cloud = await createTestSupabase();    // ephemeral schema
      db = await openTestDatabase();
    });

    afterEach(async () => {
      await db.close();
      await cloud.teardown();
    });

    test('local→cloud→fresh device→local restores everything', async () => {
      // arrange — populate local
      const sessions = makeSessionFixtures(50);
      for (const s of sessions) await db.insertSession(s);

      // act 1 — push
      await pushChanges();
      const remote = await cloud.fetch('sessions');
      expect(remote.length).toBe(50);

      // act 2 — fresh install
      await db.deleteFile();
      const freshDb = await openFreshTestDatabase();
      await pullRestoreIfFresh();

      // assert
      const restored = await freshDb.getSessions();
      expect(restored).toEqual(sessions);    // modulo timestamps
    });
  });
```

The integration test owns: multiple modules, real SQLite, real (test) Supabase. Slower (~1-2 seconds per test) but it catches the bugs that unit tests can't see.

**Design 3. E2E test — pose-to-rep on device.**

```ts
  // tests/e2e/pushup-flow.test.ts (sketch — would use Detox or similar)
  describe('full pushup set on device', () => {
    test('user starts set, completes 5 reps, set is logged', async () => {
      // arrange: launch the app on a connected device
      await device.launchApp();
      await element(by.id('start-set-button')).tap();

      // act: stream a recorded video fixture into the camera
      // (Detox supports media replacement; cumbersome but works)
      await replayFixture('fixtures/video/5-clean-pushups.mp4');

      // assert: the screen shows "5 reps" and the set is logged
      await expect(element(by.id('rep-counter'))).toHaveText('5');
      await element(by.id('finish-set')).tap();
      const sessions = await getSessionsFromDB();
      expect(sessions[0].exercises[0].sets[0].actualReps).toBe(5);
    });
  });
```

The E2E test owns: the whole stack. Slow, fragile, hardware-dependent. Worth it for one or two happy paths; ruinous if you have hundreds.

#### Move 2 variant — load-bearing skeleton of "right-level test design"

```
  Skeleton — three questions to pick the level

  1. WHAT'S THE FAILURE MODE?
       arithmetic / pure logic        → unit
       module interaction              → integration
       end-to-end behaviour            → E2E

  2. CAN I REPRODUCE IT DETERMINISTICALLY AT THE LOWEST LEVEL?
       yes, with a fixture    → push it down to unit
       no, needs real DB       → integration
       no, needs real device  → E2E

  3. WILL MOCKING MAKE THE TEST FASTER WITHOUT MAKING IT MEANINGLESS?
       yes (well-typed boundary, simple) → mock at unit boundary
       no (schema, behaviour deep)        → don't mock; integration

  The trap: mocking the database to make integration tests "faster."
  You end up testing the mock, not the schema. Real SQLite is fast
  enough for hundreds of tests; use it.
```

#### Move 3 — the principle

> Pick the LOWEST level that can catch the failure. The pyramid emerges naturally: most bugs live at the unit level because most code is pure logic; the rest live at the integration level. E2E is for proving the whole thing works, not for catching individual bugs.

## Primary diagram

```
  contrl's surface mapped to the pyramid

  ╔═══════════════════════════════════════════════════════════════╗
  ║  UNIT (lots — pure functions, fast)                           ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/lib/pose/angles.ts            calculateAngle, smooth, avg
       src/lib/pose/rep-counter.ts       FSM transitions
       src/lib/pose/exercises/*.ts        per-exercise classifiers
       src/lib/game/gate-check.ts        gate status transitions
       src/lib/game/progression.ts       level-up logic
       src/lib/game/reconstruct.ts       full reconstruction
       src/lib/game/week-progress.ts     date math
       src/lib/game/streaks.ts           streak calc
       src/services/sync/mapper.ts        local ↔ remote shape

  ╔═══════════════════════════════════════════════════════════════╗
  ║  INTEGRATION (some — multi-module, real DB)                    ║
  ╚═══════════════════════════════════════════════════════════════╝
       database.ts migrations             run against real SQLite
       database.ts CRUD round-trips       insert → select → assert
       sync push (partial failure)        verify watermark behaviour
       sync pull-restore                   verify state after restore
       reconstruct + DB                    rebuild from sessions table

  ╔═══════════════════════════════════════════════════════════════╗
  ║  E2E (few — device, camera, full stack)                        ║
  ╚═══════════════════════════════════════════════════════════════╝
       full pushup set with video fixture
       full session log + sync round-trip on device
       (optionally) reinstall flow with restore

  ╔═══════════════════════════════════════════════════════════════╗
  ║  THE TRAP — never do this                                      ║
  ╚═══════════════════════════════════════════════════════════════╝
       mock expo-sqlite for "fast" tests of database.ts
       → tests pass; real schema bugs ship to production
       → real migration ordering issues stay hidden
       use real SQLite (file: or :memory:) — it IS fast enough
```

## Implementation in codebase

### Today

```
  $ cat package.json | jq '.devDependencies'
  { "@types/react": "~19.2.2", "typescript": "~5.9.2" }

  $ find . -name '*.test.*' -not -path '*/node_modules/*' | wc -l
  0
```

No test framework, no test files, no fixtures.

### Buildable target — the harness

```
  Phase 1 (test framework + first tests)

  devDeps:
    vitest                       fast unit + integration runner
    @vitest/coverage-v8          coverage reporting
    better-sqlite3 (test-only)   alt to expo-sqlite for tests
                                 (or use expo-sqlite/legacy for
                                  Node test environment)

  scripts:
    "test":         "vitest run",
    "test:watch":   "vitest",
    "test:coverage": "vitest run --coverage"

  directory:
    tests/
      unit/         tier-3 + tier-2 tests
      integration/  tier-1 tests (real SQLite)
      fixtures/     recorded pose sequences, sample sessions
      helpers/      test database setup, fixture loaders
```

### Sketches of the first three tests to write

**Test 1 — angle math (Tier 3, cheap warm-up):**

```ts
  // tests/unit/pose/angles.test.ts
  import { calculateAngle, smoothAngle } from '@/lib/pose/angles';

  test('right-angle landmarks produce 90 degrees', () => {
    const result = calculateAngle(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },         // vertex
      { x: 1, y: 1, z: 0 }
    );
    expect(result).toBeCloseTo(90, 1);
  });

  test('zero-magnitude vector returns 0 (not NaN)', () => {
    const result = calculateAngle(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },         // collinear
      { x: 1, y: 0, z: 0 }
    );
    expect(result).toBe(0);          // current behaviour;
                                      // verify against impl
  });

  test('smoothAngle interpolates toward target', () => {
    const result = smoothAngle(100, 200, 0.5);    // alpha = 0.5
    expect(result).toBe(150);
  });
```

**Test 2 — gate transitions (Tier 2):**

```ts
  // tests/unit/game/gate-check.test.ts
  import { applyGatePassCheck } from '@/lib/game/gate-check';

  test('three consecutive clean passes promote gate to passed', () => {
    let gate = newGate('push', 1);
    gate = applyGatePassCheck(gate, { isClean: true });
    gate = applyGatePassCheck(gate, { isClean: true });
    expect(gate.status).toBe('in-progress');
    expect(gate.consecutivePasses).toBe(2);
    gate = applyGatePassCheck(gate, { isClean: true });
    expect(gate.status).toBe('passed');
  });

  test('one dirty session resets consecutive-pass counter', () => {
    let gate = newGate('push', 1);
    gate = applyGatePassCheck(gate, { isClean: true });
    gate = applyGatePassCheck(gate, { isClean: true });
    gate = applyGatePassCheck(gate, { isClean: false });
    expect(gate.consecutivePasses).toBe(0);
    expect(gate.status).toBe('in-progress');
  });
```

**Test 3 — first integration: SQLite migration (Tier 1):**

```ts
  // tests/integration/db/migrations.test.ts
  test('migrate against an empty database creates all 9 tables', async () => {
    const db = await openTestDatabase(':memory:');
    await migrate(db);
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    expect(tables.map(t => t.name)).toEqual([
      'drafts', 'exercises', 'gate_progress', 'sessions',
      'sync_deletions', 'sync_meta', 'sync_state',
      'user_profile', 'week_progress',
    ]);
  });

  test('migrate is idempotent (re-running has no effect)', async () => {
    const db = await openTestDatabase(':memory:');
    await migrate(db);
    await migrate(db);                  // should not throw, no dupes
    // assert: schema unchanged after second run
  });

  test('migrate from schema-v1 → current preserves data', async () => {
    const db = await openTestDatabase(':memory:');
    await applyV1Schema(db);
    await db.runAsync(`INSERT INTO sessions ... VALUES (...)`);
    await migrate(db);                  // runs the diff up to current
    const rows = await db.getAllAsync(`SELECT * FROM sessions`);
    expect(rows).toHaveLength(1);
  });
```

The migration test is THE test that catches "I dropped a column in migrate() but forgot to add the data-recovery path." Worth its weight.

## Elaborate

The pyramid is a defaults guide because the actual right shape depends on the codebase. A codebase that's mostly orchestration of external services (a "thin API server" pattern) needs more integration tests, fewer unit tests. A codebase that's mostly pure domain logic (compilers, financial calc, game engines) is naturally pyramid-shaped. contrl is the second kind. The `lib/game/` and `lib/pose/` directories are pure functions; the FSM is closed; the date math is deterministic. The pyramid fits.

The mocking-the-database trap deserves emphasis because it's seductive. Devs hear "tests should be fast" and reach for mocks. Mocking SQLite turns your "I tested the migration" test into "I tested that my mock matches my migration." The two diverge silently; the first hint is a production migration that worked in test and broke on devices.

The fix is `expo-sqlite/legacy` or `better-sqlite3` in Node. Both let you run real SQLite in tests. A single test takes ~5-50ms with real SQLite (in-memory mode); hundreds of tests run in seconds. The "fast tests need mocks" argument was true in 2010; it isn't true now.

A note on the AI-eval seam: `src/lib/pose/exercises/*.ts` produces classifications. The classification itself is the *output of MediaPipe inference*, which is non-deterministic only at the model level (and contrl uses a bundled deterministic model file, so it IS deterministic given the same input). The *FSM and the classifier dispatch* are pure code. They belong in unit tests with recorded landmark sequences as fixtures. The accuracy of the model against ground truth (does MediaPipe correctly identify a pushup pose?) is an eval, belongs in `study-ai-engineering`.

## Interview defense

**Q: "What's your testing strategy for this app?"**

```
  ┌─ The pyramid maps cleanly ─────────────────────────────────────┐
  │                                                                 │
  │  UNIT (lots):                                                  │
  │    pure functions in src/lib/game/ and src/lib/pose/ —         │
  │    rep-counter FSM, angle math, gate-check logic, classifier  │
  │    dispatch. Fixture inputs, assertion on output.              │
  │                                                                 │
  │  INTEGRATION (some):                                           │
  │    SQLite migrations against real DB. Sync round-trip with    │
  │    test Supabase. CRUD per table.                              │
  │                                                                 │
  │  E2E (few):                                                    │
  │    one or two happy paths on a device — full pushup set,      │
  │    full reinstall+restore flow.                                │
  │                                                                 │
  │  The trap to avoid: mocking SQLite. Real SQLite in tests is   │
  │  fast enough; mocking it means the integration tests test the │
  │  mock instead of the schema.                                   │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "pick the lowest level that catches the bug."

**Q: "Why is the pyramid the default shape?"**

Because cost scales steeply up the levels. A unit test runs in 1ms; an integration test in 100ms+; an E2E test in seconds. A test suite that's mostly E2E takes hours to run; a suite that's mostly unit runs in seconds. Fast feedback is the difference between "tests run on every save" and "tests run on CI when I remember."

**Q: "Why is the lib/game directory unusually test-friendly?"**

Because it's pure functions over typed state. No I/O, no globals, no React hooks. `applyGatePassCheck(gate, sessionResult)` returns a new `gate`. That's exactly the shape that's easy to write tests for and easy to enumerate edge cases on.

## Validate

1. **Reconstruct.** Draw the pyramid with contrl's surfaces in each level.
2. **Explain.** Why does mocking SQLite invert the pyramid silently?
3. **Apply.** Pick one tier-2 file. Sketch three unit tests for it (a happy path, a boundary, an error).
4. **Defend.** Argue that E2E is the only test that "really matters" because users only see the whole stack. Then rebut.

## See also

- [01-what-is-tested-and-what-isnt.md](./01-what-is-tested-and-what-isnt.md) — the risk map that prioritizes which level to invest in first
- [03-tests-as-design-pressure.md](./03-tests-as-design-pressure.md) — why some surfaces resist clean unit testing
- [04-determinism-isolation-and-flakiness.md](./04-determinism-isolation-and-flakiness.md) — how to keep unit tests deterministic and integration tests reliable
- [07-testing-red-flags-audit.md](./07-testing-red-flags-audit.md) — the build-order ranking
