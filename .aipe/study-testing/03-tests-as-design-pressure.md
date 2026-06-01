# Tests as design pressure
### Testability as a design smell — Industry standard

> "Hard to test" almost always means "tangled to use." When a function needs elaborate setup to reach, when a hook owns six concerns at once, when a module has a global flag that affects callers invisibly — those are design smells before they're test problems. Testability is the X-ray of design quality.

## Zoom out, then zoom in

Testability and good design are the same property viewed from two angles. A function that's hard to test usually has at least one of: hidden dependencies, mutable shared state, side effects mixed with logic, or a sprawling interface. A function that's easy to test usually has none of those. The discipline isn't "make it testable so we can test it"; the discipline is "make it testable so it's good code."

```
  Zoom out — testability mirrors design

  ┌─ easy to test ──────────────┐    ┌─ easy to use ──────────────┐
  │  pure function               │    │  small interface            │
  │  explicit deps                │    │  explicit deps              │
  │  no side effects in logic    │    │  side effects isolated      │
  │  no global state              │    │  no shared mutable state    │
  └──────────────────────────────┘    └────────────────────────────┘

  These are the same set of properties. Testability is the test
  for design — code that's painful to test is painful to extend.
```

Zoom in. The three places in contrl where "hard to test" reads as "hard to change safely": **`useGameState.ts`** (one hook owns six concerns), **`supabase-sync.ts`** (module-global flag invisible to callers), and **`database.ts`** (CRUD writes coupled to sync fire-and-forget).

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **what would you need to set up to call this function in isolation?**

```
  Tracing the setup-cost axis

  surface                          setup needed                   testable?
  ───────                          ────────────                   ─────────
  src/lib/pose/angles.ts           nothing                        EASY
  src/lib/pose/rep-counter.ts      construct with config          EASY
  src/lib/game/reconstruct.ts      nothing (pure function)        EASY
  src/services/database.ts          real SQLite + maybe sync       MEDIUM
                                   side effects to suppress
  src/services/sync/supabase-sync   test Supabase + mock the       HARD
                                   restoreInProgress global +     (module
                                   stub HTTP                       coupling)
  src/hooks/useGameState           React testing setup +          VERY HARD
                                   useDatabase mock +             (hook +
                                   sync mocks + ref behavior      multiple
                                                                   concerns +
                                                                   timing)
```

Seam: the **hook ↔ domain seam**. The `lib/game/` functions are easy to test alone. `useGameState` is hard because it bundles them with persistence, sync, and refs. Separating the bundle is the design fix and the testability fix.

## How it works

#### Move 1 — picture of "test-pressure as design-pressure"

The mental exercise: imagine writing a test for the function. If you're listing five mocks and a setup helper before you can write the assertion, the function isn't hard to test — it's tangled to use.

```
  Two ways to feel "hard to test"

  hard because the LOGIC is complex            hard because the CODE is tangled
  ────────────────────────────────             ────────────────────────────────

  many edge cases to enumerate                 many dependencies to wire up
  → write more tests                           → ★ refactor the code, then test
                                                  the simpler version

  fundamental nature of the problem            accidental coupling
  → accept it                                  → reject it
```

The second class is the one to attack. Testability says "this code is doing too much at once" — the test is the canary.

#### Move 2 — three places in contrl where the canary sings

**Place 1. `useGameState.ts` — six concerns in one hook.**

```ts
  src/hooks/useGameState.ts (header view, ~lines 60-100)

  function useGameStateInternal(dbReady: boolean) {
    const [user, setUser] = useState<User|null>(null);
    const [week, setWeek] = useState<WeekProgress|null>(null);
    const [gates, setGates] = useState<GateProgress[]>([]);
    const [sessions, setSessions] = useState<WorkoutSession[]>([]);
    const [streak, setStreak] = useState<StreakInfo>({...});
    const [draft, setDraft] = useState<Draft|null>(null);

    const userRef = useRef(user);                         ← ref pattern
    const gateProgressRef = useRef(gates);                  for stale-
    const weekProgressRef = useRef(week);                   closure
                                                            workaround

    useEffect(() => { /* phase 1: load on dbReady */ }, [dbReady]);
    useEffect(() => { /* phase 2: sync refs to state */ }, [user, week]);

    async function logSession(session: WorkoutSession) {
      // 100-LOC subroutine: 6 sequential mutations, ref reads,
      // setState calls, fire-and-forget pushChanges()
    }

    // ... return { user, week, gates, ..., logSession }
  }
```

To unit-test `logSession()` you'd need: a React renderer (it's a hook), the database mocked (insertSession, updateGate, updateUserLevel, updateWeek), the sync mocked (pushChanges).catch()), the refs hydrated (otherwise the function reads stale state), and the prior state arranged. That's six dependencies before you can call the function.

The design smell IS the testing pain. The fix (also the design fix):

```ts
  // extract pure game-rule subroutines from logSession

  // src/lib/game/apply-session.ts (proposed)
  export function applySessionToState(
    state: GameState,                            ← in: snapshot
    session: WorkoutSession
  ): GameState {                                  ← out: new snapshot
    const isClean = evaluateSession(session);
    const newGates = state.gates.map(g => g.category === session.category
      ? applyGatePassCheck(g, { isClean })
      : g);
    const newUser = checkCategoryLevelUp(state.user, newGates);
    const newWeek = updateWeekFromSession(state.week, session);
    return { user: newUser, week: newWeek, gates: newGates,
             sessions: [session, ...state.sessions] };
  }

  // src/lib/game/persist-game-diff.ts (proposed)
  export async function persistGameDiff(
    db: Database,                                ← explicit dep
    sync: SyncEngine,                            ← explicit dep
    prev: GameState,
    next: GameState
  ): Promise<void> {
    // diff and write only what changed
    await db.insertSession(next.sessions[0]);
    await db.updateGate(diffGate(prev.gates, next.gates));
    if (next.user !== prev.user)
      await db.updateUser(next.user);
    await db.updateWeek(next.week);
    await sync.enqueue();  // proper sync engine, not fire-and-forget
  }
```

Now `applySessionToState` is a pure function: unit-testable with zero setup. `persistGameDiff` takes explicit dependencies: testable with two test fakes. The hook becomes the orchestration — `state → applySessionToState → persistGameDiff` — and stays focused on React.

**Place 2. `supabase-sync.ts` — module-global flag governs invisible behavior.**

```ts
  src/services/sync/supabase-sync.ts (~line 32)
  let restoreInProgress = false;

  export async function pushChanges() {
    if (restoreInProgress) return;
    // ... per-table push ...
  }
```

To unit-test `pushChanges`, you have to also control `restoreInProgress`. There's no parameter to set; you have to either: (a) import the module fresh each test, (b) reach into the module's internals (most test runners hate this), or (c) call `pullRestoreIfFresh` in setup to engineer the flag state.

All three are awkward. The design fix (also the testing fix):

```ts
  // src/services/sync/engine.ts (proposed)
  export class SyncEngine {
    private state: 'idle' | 'pushing' | 'restoring' = 'idle';

    constructor(private supabase: SupabaseClient, private db: Database) {}

    async push(): Promise<PushResult> {
      if (this.state === 'restoring')
        return { skipped: 'restore-in-progress' };
      this.state = 'pushing';
      try { /* ... */ }
      finally { this.state = 'idle'; }
    }

    async restoreIfFresh(): Promise<RestoreResult> {
      this.state = 'restoring';
      try { /* ... */ }
      finally { this.state = 'idle'; }
    }
  }
```

Now state is owned by the instance. Tests construct a `new SyncEngine(testClient, testDb)`, manipulate state via methods, assert on outputs. The "don't push during restore" rule is internal to the class — invisible at every call site is now expected and clean.

**Place 3. `database.ts` — fire-and-forget sync at every write.**

```ts
  src/services/database.ts (every CRUD function)

  export async function insertSession(s: WorkoutSession) {
    await db.runAsync(`INSERT INTO sessions ...`, [...]);
    pushChanges().catch(err => console.warn(err));     ← side effect
  }
```

To unit-test `insertSession`, you have to suppress `pushChanges` (or it tries to hit Supabase). That means mocking the sync module — which means you're testing the persistence layer with a mock of the layer it shouldn't depend on at all.

The design fix (also the testing fix):

```ts
  // src/services/database.ts becomes pure persistence
  export async function insertSession(db: Database, s: WorkoutSession) {
    await db.runAsync(`INSERT INTO sessions ...`, [...]);
    // ★ no pushChanges call. side effects live elsewhere.
  }

  // someone above (a hook, a use-case function) calls:
  //   await db.insertSession(s);
  //   await syncEngine.enqueue();
```

Now `database.ts` has no sync dependency. Tests against real SQLite are clean. Sync is a separate concern, tested separately.

#### Move 2 variant — load-bearing skeleton of "testability as X-ray"

```
  Skeleton — four signs your code is failing the X-ray

  1. CALLING THE FUNCTION REQUIRES MOCKING SOMETHING
       that the function's responsibility didn't suggest it needed
       (database mock for a hook? sync mock for persistence?)

  2. THE TEST SETUP IS LONGER THAN THE ASSERTION
       you're standing up infrastructure to call one method

  3. CHANGING ONE INPUT CHANGES MULTIPLE OUTPUTS
       (the function does more than one thing)

  4. THE FUNCTION TOUCHES SHARED STATE THAT WASN'T A PARAMETER
       (refs, module globals, singletons read inside the body)
```

All four hit `useGameState.logSession`. Two hit `supabase-sync.pushChanges`. One hits every database.ts CRUD function. The fix is the same in all three places: extract pure logic, make dependencies explicit, isolate side effects.

#### Move 3 — the principle

> Test pain is design pain. When code resists testing, the first move isn't "skip the test" or "add a mock" — it's to ask "why is this function hard to call in isolation?" The answer is almost always "it's doing too many things."

## Primary diagram

```
  contrl's testability map — what the X-ray shows

  ╔═══════════════════════════════════════════════════════════════╗
  ║  EASY (X-ray shows clean structure)                           ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/lib/pose/angles.ts            pure math
       src/lib/pose/rep-counter.ts       closed FSM
       src/lib/game/{gate-check,         pure functions over typed
                     progression,        state
                     reconstruct,
                     week-progress,
                     streaks}.ts

  ╔═══════════════════════════════════════════════════════════════╗
  ║  MEDIUM (testable with real SQLite + a bit of setup)           ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/services/database.ts (CRUD)   testable against real DB,
                                          but the fire-and-forget sync
                                          coupling forces sync mocks

  ╔═══════════════════════════════════════════════════════════════╗
  ║  HARD (X-ray shows tangled structure → refactor first)         ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/services/sync/supabase-sync   module-global flag, early-
       .ts                                return on first error,
                                          no explicit state

       src/hooks/useGameState.ts          six concerns, refs as
                                          state-sync workaround,
                                          100-LOC orchestration
                                          function

  ─── recommended refactor sequence ────────────────────────────
  1. Extract pure game-rule subroutines from useGameState
     → enables unit tests for the most-changed logic in the app
  2. Introduce SyncEngine class; replace restoreInProgress global
     → enables sync tests
  3. Remove fire-and-forget pushChanges from database.ts CRUDs
     → cleans the persistence layer's test surface
```

## Implementation in codebase

### The three offenders, located

```
  src/hooks/useGameState.ts            333 LOC, 100-LOC logSession
  src/services/sync/supabase-sync.ts   ~196 LOC, module-global flag
  src/services/database.ts             679 LOC, sync coupling at 8 sites
```

Each is named in `study-software-design/` as a tier-1 finding. The testing perspective reinforces the same conclusion from a different angle.

### The proposed shape of the extracted layer

```ts
  // src/lib/game/apply-session.ts (proposed)
  export function applySessionToState(
    state: GameState,
    session: WorkoutSession
  ): GameState { /* pure */ }

  // tests/unit/game/apply-session.test.ts (proposed)
  test('clean session advances gate by one consecutive pass', () => {
    const state = makeState({ pushLevel: 1, consecutivePasses: 1 });
    const session = makeCleanSession('push', 1);
    const next = applySessionToState(state, session);
    expect(next.gates.find(g => g.category === 'push')!.consecutivePasses)
      .toBe(2);
  });

  test('three consecutive passes flip gate to passed', () => {
    let state = makeState({ pushLevel: 1, consecutivePasses: 2 });
    const session = makeCleanSession('push', 1);
    state = applySessionToState(state, session);
    expect(state.gates.find(g => g.category === 'push')!.status).toBe('passed');
  });

  test('passing gate level 1 triggers level-up to 2', () => {
    let state = makeState({ pushLevel: 1, consecutivePasses: 2 });
    const session = makeCleanSession('push', 1);
    state = applySessionToState(state, session);
    expect(state.user.pushLevel).toBe(2);
  });
```

This is the kind of test that should exist for the game-rule logic. It exists *as soon as* the logic is extracted from the hook.

### The dependency-injection sketch

```ts
  // src/services/sync/engine.ts (proposed)
  export interface SyncTarget {
    push(table: TableName, rows: any[]): Promise<{ ok: boolean }>;
    pullAll(table: TableName): Promise<any[]>;
  }

  export class SyncEngine {
    constructor(
      private target: SyncTarget,                   ← test fake here
      private localDb: Database,                    ← test SQLite here
    ) {}
    /* ... */
  }

  // tests/unit/sync/engine.test.ts
  test('push of failing first table does not block subsequent tables', async () => {
    const target = new FakeSyncTarget({
      'user_profile': { ok: false, error: 'rls denial' },
      'exercises':    { ok: true },
      'sessions':     { ok: true },
    });
    const db = makeTestDatabase();
    const engine = new SyncEngine(target, db);
    const result = await engine.push();
    expect(result.failed).toContain('user_profile');
    expect(result.succeeded).toContain('exercises');
    expect(result.succeeded).toContain('sessions');
  });
```

A `FakeSyncTarget` with scripted responses replaces "mock the supabase library." The test exercises the engine's actual logic.

## Elaborate

The strongest argument for treating testability as design pressure is what happens when you skip it. A codebase that's hard to test accumulates "let me just add a mock here" patches. Each patch is innocent; the cumulative effect is tests that test mocks instead of code, plus code shapes that calcify around the mocks. Refactoring becomes risky because the test suite passes regardless. You're shipping behaviour the tests don't cover.

contrl is early enough that this hasn't compounded yet. The hard-to-test parts (`useGameState`, `supabase-sync`, sync coupling in `database.ts`) are exactly the parts that `study-software-design/` identifies as the load-bearing refactors. The refactors are the same. The framing is different: from the design view, "extract pure logic" is about complexity; from the testing view, it's about being able to verify correctness. Both views are right.

A note on hooks: React hooks are inherently semi-testable. They need a renderer (testing-library/react-hooks or @testing-library/react with renderHook). The tooling has improved, but hook tests are slower and noisier than pure-function tests. The discipline is to keep hooks **thin** — they orchestrate but don't compute. The logic moves to pure functions, the hook becomes a wrapper, the wrapper is integration-tested in light scenarios, and the logic gets exhaustive unit tests independently.

A note on the alternative path — "just don't test the hard parts." That's a valid local optimization for a one-person codebase that ships rarely. It's a terrible global decision because the hard-to-test parts ARE the high-risk parts (`study-testing/01-what-is-tested-and-what-isnt.md` puts sync and reconstruct in Tier 1). Not testing them means hoping they work — at the same scale at which a single missed bug costs a user's data.

## Interview defense

**Q: "How does test design pressure show up in your codebase?"**

```
  ┌─ Three places, same root cause ────────────────────────────────┐
  │                                                                 │
  │  1. useGameState.ts: one hook owns six concerns. To unit-test │
  │     logSession() you'd need React + 4 module mocks + refs +    │
  │     prior state. That's the design smell.                      │
  │                                                                 │
  │  2. supabase-sync.ts: a module-global flag governs caller      │
  │     behavior invisibly. You can't test pushChanges() without  │
  │     also controlling restoreInProgress.                        │
  │                                                                 │
  │  3. database.ts: every CRUD fires push(). catch() — coupling   │
  │     persistence to sync. Persistence tests must mock sync.    │
  │                                                                 │
  │  All three are also the highest-leverage refactors from the   │
  │  design audit. Test pain = design pain; the refactor is the   │
  │  same in both views.                                           │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "if you'd refactor for testability, you'd refactor for design — they're the same property."

**Q: "Why not just mock the database and move on?"**

Because mocks let bad designs persist. The harder I make it for a future me to mock, the more my code has to be honestly testable — which means the responsibilities are clear, the dependencies are explicit, the side effects are isolated. Mocking is a shortcut around design discipline; over time it costs more than it saves.

**Q: "Where would you start the refactor?"**

The pure extraction from `useGameState.logSession`: pull out `applySessionToState(state, session) → newState` as a pure function. It's a one-day refactor; it makes the most-changed logic in the app unit-testable; it sets the precedent for the other two refactors (SyncEngine, decoupling persistence from sync).

## Validate

1. **Reconstruct.** Draw the testability map: which contrl modules are easy, medium, and hard, and why?
2. **Explain.** Give two of the four signs that code is failing the testability X-ray. What do they have in common?
3. **Apply.** Sketch the pure-function extraction from `useGameState.logSession`. What stays in the hook, what moves out?
4. **Defend.** Argue that the testing concern is independent of the design concern. Then rebut.

## See also

- [01-what-is-tested-and-what-isnt.md](./01-what-is-tested-and-what-isnt.md) — these "hard to test" surfaces are ALSO the tier-1 risk surfaces
- [02-test-design-and-levels.md](./02-test-design-and-levels.md) — once extracted, the logic moves down the pyramid to unit tests
- `.aipe/study-software-design/03-information-hiding-and-leakage.md` — same finding, design view
- `.aipe/study-software-design/06-errors-and-special-cases.md` — fire-and-forget pattern from error-handling angle
- [07-testing-red-flags-audit.md](./07-testing-red-flags-audit.md) — buildable-target ranking
