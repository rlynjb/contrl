# Determinism, isolation, and flakiness
### Test isolation · flakiness causes · clock/network/ordering — Industry standard

> A test that passes sometimes and fails sometimes is worse than no test at all. It trains people to ignore red. The cure is to find the non-determinism, then either pin it (recorded fixtures, clock injection) or move it to a different test level (real DB for ordering, eval for model output).

## Zoom out, then zoom in

Flakiness comes from one of five sources: **time**, **network**, **ordering**, **shared state**, and **inherently non-deterministic inputs** (camera, model output). The cure is specific to the source. The discipline is to identify which source, then fix at the source rather than retrying the test until it passes.

```
  Zoom out — five sources of flakiness in contrl-shaped code

  ┌─ time ──────────────────────────────────────────────────────┐
  │  needsWeekReset(week, today)                                 │
  │  getCurrentDate() everywhere                                 │
  │  → cure: inject clock; test with fixed dates                 │
  └──────────────────────────────────────────────────────────────┘

  ┌─ network ───────────────────────────────────────────────────┐
  │  Supabase REST calls                                         │
  │  → cure: real test cloud OR a recorded HTTP fixture          │
  └──────────────────────────────────────────────────────────────┘

  ┌─ ordering ──────────────────────────────────────────────────┐
  │  SQLite WAL mode shared across tests                         │
  │  refs in useGameState (state-update timing)                  │
  │  → cure: fresh DB per test; flush effects before assertion   │
  └──────────────────────────────────────────────────────────────┘

  ┌─ shared state ──────────────────────────────────────────────┐
  │  restoreInProgress module-global                             │
  │  → cure: instance state (SyncEngine class) OR explicit reset │
  └──────────────────────────────────────────────────────────────┘

  ┌─ inherently non-deterministic ──────────────────────────────┐
  │  pose detection from live camera                              │
  │  LLM output (Phase 4)                                         │
  │  → cure: recorded fixture for tests; eval (separate tooling) │
  │    for accuracy                                              │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. contrl has all five sources, but **none are biting today** (no tests). The design choices to make at the harness-setup stage decide whether the future test suite is deterministic by default or fragile by default.

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **what's non-deterministic, and where does it enter the layer?**

```
  Tracing the non-determinism axis

  layer            non-determinism in this layer              cure
  ─────            ──────────────────────────                  ────
  UI               clock (for "today" displays)               inject clock
  Hooks            React state-update timing                  flush effects
                   useGameState refs                          before assert
  Domain           pure functions; none today                 ─
                   (planned: LLM output Phase 4)
  Persistence      SQLite WAL concurrent reads                fresh DB per test
                   created_at / updated_at timestamps          freeze clock
  Sync             network latency, partial responses         recorded
                                                              fixtures or
                                                              test cloud
  External         camera frames, MediaPipe inference         recorded pose
                                                              sequences
                                                              (fixtures)
```

Seam: the **clock seam** is the most pervasive. `new Date()` and `Date.now()` are sprinkled across `database.ts` (`updated_at` columns) and `lib/game/week-progress.ts`. Every one of those calls is a flakiness source unless the clock is injected.

## How it works

#### Move 1 — the picture of "deterministic test"

A deterministic test produces the same result every time given the same input. Achievable through three habits: **explicit inputs** (no environment reads), **isolated state** (no carryover between tests), **frozen externals** (clock, network, hardware all pinned).

```
  Two test designs, same logic

  flaky                                  deterministic
  ─────                                  ─────────────

  ┌─ test ──────────────────────┐        ┌─ test ──────────────────────┐
  │  insertSession({              │        │  insertSession(db, {          │
  │    date: new Date()…           │        │    date: '2026-06-01'        │
  │  })                            │        │  })                          │
  │  await pushChanges()            │        │  await engine.push()         │
  │  // talks to real Supabase     │        │  // talks to FakeSyncTarget  │
  │  // network varies               │        │  // scripted responses       │
  │  // → flake                      │        │  // → deterministic           │
  └────────────────────────────────┘        └──────────────────────────────┘
```

The flaky version mixes test inputs with environmental reads. The deterministic version makes every external dependency explicit and injectable.

#### Move 2 — the five sources, walked

**Source 1. Time — clock injection.**

```ts
  src/lib/game/week-progress.ts (current)
  export function needsWeekReset(week: WeekProgress, today?: Date): boolean {
    const t = today ?? new Date();           ← reads system clock
    return getWeekStart(t) !== week.weekStartDate;
  }
```

Already half-fixed: the function accepts an optional `today` argument. Test discipline is to always pass it:

```ts
  test('week reset triggered on Monday 2026-06-08', () => {
    const week = { weekStartDate: '2026-06-01', ... };
    const monday = new Date('2026-06-08T10:00:00Z');
    expect(needsWeekReset(week, monday)).toBe(true);
  });
```

For `database.ts` writes that set `updated_at = new Date().toISOString()`, the cleaner fix is a clock module:

```ts
  // src/lib/clock.ts (proposed)
  let nowFn = () => new Date();
  export const now = () => nowFn();
  export function setClockForTest(fn: () => Date) { nowFn = fn; }
  export function resetClockForTest() { nowFn = () => new Date(); }

  // database.ts becomes:
  import { now } from '@/lib/clock';
  await db.runAsync(
    `INSERT INTO sessions (..., updated_at) VALUES (..., ?)`,
    [..., now().toISOString()]
  );

  // tests
  beforeEach(() => setClockForTest(() => new Date('2026-06-01T10:00:00Z')));
  afterEach(() => resetClockForTest());
```

The same clock module covers all `Date()` calls. Tests run with a frozen clock; production reads the real one.

**Source 2. Network — recorded fixtures or test cloud.**

Two options, both legitimate:

```
  Option A: recorded HTTP fixtures (nock, msw)
  ────────────────────────────────────────────
  + no test infrastructure beyond local files
  + truly fast (no network round-trip)
  + reproducible across machines
  − can drift from real Supabase API over time
  − doesn't catch real schema mismatches

  Option B: real test Supabase project
  ────────────────────────────────────
  + catches actual API contract changes
  + closest to production behaviour
  − requires test project setup (one per CI environment)
  − slower (real network)
  − teardown discipline needed

  Recommended for contrl: Option B for the round-trip integration
  test (one test that proves sync works against real Supabase);
  Option A for everything else (faster, less infrastructure)
```

For Option B, the test setup creates a fresh Supabase project per CI run (or uses one shared project with truncate-between-tests). For Option A, `msw` (mock service worker) intercepts the Supabase JS client's fetch calls.

**Source 3. Ordering — fresh state per test, flushing effects.**

```ts
  // wrong: shared DB across tests
  const db = openSharedDatabase();
  test('A', async () => {
    await db.insertSession(...);
    expect(await db.getSessions()).toHaveLength(1);
  });
  test('B', async () => {
    // depends on test A's state if run in order, otherwise different
    expect(await db.getSessions()).toHaveLength(1);
  });
```

```ts
  // right: fresh DB per test
  let db: Database;
  beforeEach(async () => { db = await openTestDatabase(':memory:'); });
  afterEach(async () => { await db.close(); });

  test('A', async () => {
    await db.insertSession(...);
    expect(await db.getSessions()).toHaveLength(1);
  });
  test('B', async () => {
    // independent: db is fresh
    expect(await db.getSessions()).toHaveLength(0);
  });
```

For React hook tests, ordering shows up as state updates not having propagated. The fix is to flush:

```ts
  // testing-library: act() wraps state updates
  await act(async () => {
    await result.current.logSession(session);
  });
  expect(result.current.user.pushLevel).toBe(2);
```

**Source 4. Shared state — module globals and singletons.**

```ts
  // src/services/sync/supabase-sync.ts
  let restoreInProgress = false;
```

Across tests, this module-global keeps its value. Test A sets it true and forgets to reset; Test B's `pushChanges` silently no-ops; Test B's assertions fail mysteriously.

The clean fix is the design refactor in [03-tests-as-design-pressure.md](./03-tests-as-design-pressure.md): instance state, not module state. The pragmatic interim fix is a reset hook:

```ts
  // src/services/sync/supabase-sync.ts
  export function _resetForTest() {
    restoreInProgress = false;
  }
  // in test setup
  beforeEach(() => _resetForTest());
```

Marking the export with `_` makes its test-only intent obvious. The long-term answer is still the class refactor.

**Source 5. Inherently non-deterministic — pose frames, LLM output.**

Pose frames from a live camera are non-deterministic given the same user (lighting, microphone shake, latency variations). For tests, the cure is **recorded fixtures**:

```
  tests/fixtures/pose/
    pushup-clean.json       ← 30-frame sequence (1 sec at 30fps)
    pushup-half-rep.json     ← user starts a rep and abandons
    pushup-ping-pong.json    ← user hovers on the boundary

  Each file is a JSON array of landmark frames:
    [
      { landmarks: [{ x, y, z, visibility }, ...] },  // frame 0
      { landmarks: [...] },                              // frame 1
      ...
    ]
```

Tests load a fixture and feed each frame to the classifier + RepCounter:

```ts
  test('clean pushup sequence produces exactly 1 rep', () => {
    const frames = loadFixture('pose/pushup-clean.json');
    const counter = new RepCounter({ exerciseKind: 'pushup' });
    const processor = createPushupProcessor();
    const reps = [];
    for (const frame of frames) {
      const result = processor.feed(frame.landmarks);
      if (result.repCompleted) reps.push(result);
    }
    expect(reps.length).toBe(1);
  });
```

The MediaPipe model's accuracy (does it correctly produce a pushup landmark set?) is an **eval**, not a test. It lives in `study-ai-engineering/05-evals-and-observability/`. Tests verify the deterministic code AROUND the model; evals verify the model's behavior on representative inputs.

For Phase 4 LLM output: same shape. The agent's deterministic surface (prompt assembly, tool dispatch, output schema validation) is tested with fixture model responses. The model's actual quality is evaluated separately.

#### Move 2 variant — load-bearing skeleton of "deterministic-by-default"

```
  Skeleton — three habits applied at harness setup

  1. INJECT THE CLOCK
       no test reads `new Date()` or `Date.now()` directly.
       wrap every system-clock read in a clock module that's
       freezable in tests.

  2. ISOLATE STATE PER TEST
       fresh DB per test (:memory: SQLite is free)
       reset module globals (or refactor them away)
       avoid sharing fixtures across tests by mutation

  3. PIN INHERENT NON-DETERMINISM
       recorded fixtures for camera frames, video, audio
       recorded HTTP responses for non-round-trip tests
       real but isolated infrastructure for round-trip tests
```

Apply these three at the start. The alternative — applying them retroactively after flakes start appearing — is much more expensive.

#### Move 3 — the principle

> Flakiness is leaked non-determinism. Find the source: time, network, ordering, shared state, or inherent. Cure at the source. Retrying a flaky test until it passes is technical debt with compound interest.

## Primary diagram

```
  contrl's flakiness surface

  ┌─ Time ───────────────────────────────────────────────────────┐
  │  src/lib/game/week-progress.ts  needsWeekReset(week, today?)  │
  │  src/services/database.ts        updated_at timestamps         │
  │                                                              │
  │  cure: src/lib/clock.ts module with setClockForTest()         │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Network ────────────────────────────────────────────────────┐
  │  src/services/sync/supabase-sync.ts  all REST calls          │
  │                                                              │
  │  cure: msw (mock service worker) for unit/integration tests  │
  │  + real test Supabase for ONE round-trip integration test    │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Ordering ───────────────────────────────────────────────────┐
  │  SQLite WAL (shared file = shared state)                      │
  │  React hook state updates                                     │
  │  refs in useGameState                                         │
  │                                                              │
  │  cure: :memory: SQLite per test; act() wrappers; explicit    │
  │  await of state changes                                      │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Shared state ───────────────────────────────────────────────┐
  │  restoreInProgress module-global                              │
  │                                                              │
  │  cure (best): class refactor (file 03)                        │
  │  cure (interim): _resetForTest() export                       │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Inherent non-determinism ───────────────────────────────────┐
  │  pose detection from camera                                   │
  │  Phase 4 LLM output                                           │
  │                                                              │
  │  cure: fixtures for tests; evals for the inherent part        │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### What helps already

```ts
  src/lib/game/week-progress.ts
  export function needsWeekReset(week: WeekProgress, today?: Date) {
    const t = today ?? new Date();    ← parameter already exists
    ...
  }
```

The parameter is there. The discipline is to always pass it in tests.

### Buildable target: the clock module

```ts
  // src/lib/clock.ts (proposed)
  let getNow: () => Date = () => new Date();
  let getNowIso: () => string = () => new Date().toISOString();

  export function now(): Date { return getNow(); }
  export function nowIso(): string { return getNowIso(); }

  // test-only API
  export function setClockForTest(date: Date) {
    getNow = () => new Date(date.getTime());
    getNowIso = () => date.toISOString();
  }
  export function resetClockForTest() {
    getNow = () => new Date();
    getNowIso = () => new Date().toISOString();
  }
```

Every `new Date().toISOString()` in `database.ts` becomes `nowIso()`. Tests freeze the clock; production reads the real one. Tiny refactor, eliminates a whole class of flakiness.

### Buildable target: fixture loader

```ts
  // tests/helpers/load-fixture.ts (proposed)
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';

  export function loadFixture<T>(relative: string): T {
    const path = join(__dirname, '..', 'fixtures', relative);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  }

  // usage
  const frames = loadFixture<PoseFrame[]>('pose/pushup-clean.json');
```

### Buildable target: test database factory

```ts
  // tests/helpers/test-db.ts (proposed)
  import { openDatabaseAsync } from 'expo-sqlite';
  // ... or better-sqlite3 in Node test environment

  export async function openTestDatabase(): Promise<Database> {
    const db = await openDatabaseAsync(':memory:');
    await migrate(db);
    return db;
  }
```

`:memory:` SQLite is fully in-process — no file, no concurrency, no carryover. Every test starts clean.

### How to capture pose fixtures

The recording process (one-time work):

```ts
  // src/components/camera/PoseCamera.tsx (dev-only flag)
  if (__DEV__ && captureFixtureRef.current) {
    capturedFrames.current.push({ landmarks: result.landmarks });
    if (capturedFrames.current.length === 30) {
      // 1 second at 30fps
      console.log(JSON.stringify(capturedFrames.current));
      captureFixtureRef.current = false;
    }
  }
```

Record from real device usage, copy from console, save to `tests/fixtures/pose/`. Three or four representative sequences cover most rep-counting test cases.

## Elaborate

The cost of getting determinism wrong is asymmetric. A test suite that's deterministic from day one stays deterministic with effort proportional to changes. A test suite that has flakes from day one **trains people to ignore failures**, which is the worst possible team habit. The first flake costs one developer 10 minutes; the hundredth flake costs the team's trust in the test suite.

For contrl specifically, the prevention is cheap because the harness doesn't exist yet. Adding the clock module, the fixture loader, and the test-DB factory in the same PR that introduces the first test means determinism is the default. Tests that violate the discipline (e.g., calling `new Date()` directly) will fail at code review.

A common mistake: treating "the test passes locally" as proof it'll pass in CI. CI runs on a different machine, possibly with a different timezone, possibly with concurrent processes, possibly with a slower disk. Tests that depend on environmental coincidences pass locally and fail intermittently in CI. The cure is to remove the environmental coincidence — freeze the clock, isolate the DB, mock the network.

A note on `:memory:` SQLite vs a real file: in-memory is fast (~10× faster than file-based) and the schema is fresh per connection. The only downside is that some SQLite features behave differently (specifically, WAL mode isn't applicable to in-memory databases). For contrl's test surface, the practical difference is none — the tests don't depend on WAL behaviour, only on the schema and the SQL operations.

A note on flakiness sources you can't fix: real CI infrastructure flakiness (network blip during npm install, ephemeral runner slowness, etc.) is real but usually 1-2% of CI runs. The discipline is to make your own tests 0% flaky so that ANY flake is a CI infrastructure issue, not a code issue. That signal is preserved only if the test suite itself is rock-solid.

## Interview defense

**Q: "How do you keep tests deterministic in a codebase like this?"**

```
  ┌─ Five sources of flakiness; one cure per source ───────────────┐
  │                                                                 │
  │  1. Time → clock module (setClockForTest)                      │
  │  2. Network → msw for most tests; real test Supabase for ONE  │
  │     round-trip test                                            │
  │  3. Ordering → :memory: SQLite per test; act() for hooks      │
  │  4. Shared state → instance state (SyncEngine class) or       │
  │     _resetForTest() exports                                    │
  │  5. Inherent non-determinism → recorded fixtures for tests;   │
  │     evals (separate tooling) for accuracy                      │
  │                                                                 │
  │  All five are addressable at harness setup time. Doing it then │
  │  is cheap; retrofitting is expensive.                          │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "deterministic by default, not by retry."

**Q: "Why not just mock everything?"**

Because mocks lie. The point of an integration test is to verify that real components compose correctly. Mocking the database means you're not testing your schema, just your interface assumptions. The right tradeoff: use real components where they're cheap (SQLite is fast in-memory); mock externals where you can't control them (Supabase network); inject knobs for things that have to vary (clock).

**Q: "What's the difference between a test and an eval?"**

Determinism. A test asserts "equals the expected value." An eval asserts "didn't regress on a non-deterministic output." For pose detection, the deterministic FSM that interprets landmarks is tested. The MediaPipe model that produces landmarks is evaluated. Same conceptual seam holds for the Phase 4 LLM agent.

## Validate

1. **Reconstruct.** List the five sources of flakiness and one cure per source.
2. **Explain.** Why is "the test passes locally" not sufficient?
3. **Apply.** A test reads `new Date()` directly to verify a "today" display. Rewrite it deterministically.
4. **Defend.** Argue that one shared test database is fine because tests can be ordered alphabetically. Then rebut.

## See also

- [02-test-design-and-levels.md](./02-test-design-and-levels.md) — at which level each source bites
- [03-tests-as-design-pressure.md](./03-tests-as-design-pressure.md) — shared module state is a design smell too
- [06-testing-ai-features.md](./06-testing-ai-features.md) — the test vs eval split applied to pose + LLM
- `.aipe/study-software-design/07-readability.md` — `restoreInProgress` from a readability angle
