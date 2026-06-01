# Edge cases and error paths
### Boundary values · happy path vs error branches — Industry standard

> The happy path is usually tested first and best. The error branches — empty arrays, null values, network failures, malformed JSON, force-quit mid-write — are where bugs live and tests don't reach. This file enumerates the untested branches in contrl and names the assertion each one wants.

## Zoom out, then zoom in

Most production bugs aren't "the logic was wrong on common input." They're "the function didn't handle the empty case" or "the network failed at exactly the wrong moment." Edge cases are where assumptions live unexamined. A test that only covers the happy path proves the function works when nothing surprising happens; it proves nothing about the rest of reality.

```
  Zoom out — three classes of edge to cover

  ┌─ boundary values ───────────────────────────────────────────┐
  │  zero, one, exactly-N, N-1, N+1                              │
  │  empty list, single-element list                             │
  │  null, undefined, ""                                         │
  │  date on Sunday vs Monday, year boundary                     │
  └──────────────────────────────────────────────────────────────┘

  ┌─ error branches ────────────────────────────────────────────┐
  │  Network failure mid-call                                    │
  │  Malformed input (JSON parse, schema mismatch)               │
  │  DB locked, disk full, corrupted file                         │
  │  Race conditions (concurrent writes, force-quit)             │
  └──────────────────────────────────────────────────────────────┘

  ┌─ state-machine corners ─────────────────────────────────────┐
  │  Transitions that don't fire from the obvious path           │
  │  States reached only by error recovery                       │
  │  States the FSM should refuse                                │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. contrl's untested edge cases cluster in four areas: **empty/null inputs** in domain logic, **malformed Supabase responses**, **network failure mid-sync**, and **FSM boundaries** in the rep counter.

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **what could the layer receive that it doesn't expect?**

```
  Tracing the unexpected-input axis

  layer        unexpected inputs                              tests today
  ─────        ─────────────────                              ───────────
  Domain       empty session.exercises (0-length array)       0
                null landmark, NaN angle
                date crossing week boundary
                level at MAX_LEVEL (no further promotion)
  Persistence  JSON.parse on malformed exercises_json         0
                disk full, file locked, corruption
                migration step fails mid-batch
  Sync         network timeout mid-push                       0
                Supabase 5xx, schema mismatch
                force-quit during pullRestore
                concurrent writes from two devices
  Hooks        ref reads stale state                          0
                logSession called before dbReady
```

Seam: every row in this table is a place where today's code has *some* behavior but nobody has verified what it is. The fix is to write the test that exercises the corner; the test forces you to either confirm the behavior or correct it.

## How it works

#### Move 1 — picture of "edge enumeration"

You already do this when you write a function — you think "what if it's empty? what if it's null?" The edge enumeration formalizes the habit: for each input, list the boundary values; for each side effect, list the failure modes; for each state machine, list the transitions that don't fire from common input.

```
  The mental checklist before writing a function — applied to a
  test plan

  inputs:        empty / single / many / max / zero / negative /
                 null / undefined / wrong type / wrong shape

  side effects:  success / network failure / partial success /
                 retry exhausted / concurrent write

  state:         starting state matters / order of operations /
                 mid-flight cancellation

  invariants:    what must hold after this returns / what must
                 hold before / what should never be true
```

For each entry, ask: "is the behavior verified by a test, or is it hope?"

#### Move 2 — eight edge cases in contrl, each with the test it wants

**Edge 1. Empty exercise list in `logSession()`.**

```ts
  src/hooks/useGameState.ts (~line 184)

  async function logSession(session: WorkoutSession) {
    const isClean = session.exercises.length > 0
                  && session.exercises.every(e => e.actualSets >= e.targetSets);
                          ▲
                          │
              if exercises.length === 0:
                isClean = false && [].every(...) = false && true = false
                completionPct = 0
                → session counts as a dirty set
                → no gate advances
                → no level-up
                Question: is this the intended behavior?
                Test that exercises the case forces an answer.
```

```ts
  test('logSession with empty exercises does not crash and counts as dirty', async () => {
    const result = await result.current.logSession({
      ...validSessionShape(),
      exercises: []
    });
    expect(result.didAdvanceGate).toBe(false);
    expect(result.user.pushLevel).toBe(initialState.user.pushLevel);
    // crucially: no crash, no undefined assignment to gate fields
  });
```

**Edge 2. Null pose result downstream of MediaPipe.**

```ts
  src/components/camera/PoseCamera.tsx (~line 44-61, abstracted)
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const result = poseDetector.detectFor(frame);
    if (result.results.length > 0) {              ← guards length
      runOnJS(onLandmarks)(result.results[0].landmarks);
    }
    // else: nothing happens — onLandmarks never fires
  });
```

What happens downstream when `onLandmarks` never fires for 5 seconds? The `RepCounter` sees no input — its `prevAngle` stays at whatever it was. If a new set starts and the FIRST visible landmark is mid-rep (e.g., user is already in the bottom position), the FSM might count a phantom rep.

```ts
  test('RepCounter handles gap then mid-rep start without phantom rep', () => {
    const rc = new RepCounter({ exerciseKind: 'pushup' });
    rc.feed(170);                  // initial extension
    // long gap (no feeds simulate "no landmarks detected")
    rc.feed(80);                   // user is already at the bottom
                                    // when next visible frame arrives
    rc.feed(100);
    rc.feed(170);
    // expect: no rep counted, because the FSM should require a
    // proper down-then-up cycle starting from a known phase
    const reps = /* extracted from rc */;
    expect(reps).toBe(0);
  });
```

The test FORCES a decision about what the FSM should do in this case. Today's behavior may or may not be correct; the test verifies AND documents it.

**Edge 3. Malformed JSON in `exercises_json`.**

```ts
  src/services/database.ts (~line 424)
  exercises: JSON.parse(row.exercises_json),    ← unguarded
```

If a session row has malformed JSON (rare; possible after partial sync, schema migration bug, or an attacker write to Supabase before RLS deployed), the parse throws. The throw propagates up through `getSessions()`, through the hook, into a React error boundary.

```ts
  test('getSessions returns sessions even when one row has malformed JSON', async () => {
    const db = await openTestDatabase();
    // arrange: one valid row, one with garbage JSON
    await db.runAsync(
      `INSERT INTO sessions (id, date, exercises_json, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['s1', '2026-06-01', '[{"valid":true}]', USER_ID, '2026-06-01', '2026-06-01']
    );
    await db.runAsync(
      `INSERT INTO sessions (id, date, exercises_json, ...) VALUES (?, ?, ?, ...)`,
      ['s2', '2026-06-02', '{this is not json', USER_ID, ...]
    );

    // act
    const sessions = await getSessions(db);

    // assert: s1 returned with parsed exercises; s2 either returned
    // with empty exercises (degraded) or skipped (logged)
    expect(sessions.find(s => s.id === 's1')).toBeDefined();
    // and crucially: no throw
  });
```

The test exposes that today's code throws. The fix is in `study-software-design/06-errors-and-special-cases.md` (the JSON.parse guard); the test is what catches the regression once the fix lands.

**Edge 4. Network failure mid-push.**

```ts
  src/services/sync/supabase-sync.ts (~line 47-area)
  // current: early-return on first error
  if (error) { logErr(error); return; }
```

```ts
  test('push of failing table N does not block tables N+1 to end', async () => {
    const target = new FakeSyncTarget({
      user_profile:  { ok: true },
      exercises:     { ok: false, error: 'network timeout' },
      sessions:      { ok: true },
      gate_progress: { ok: true },
      week_progress: { ok: true },
    });
    const engine = new SyncEngine(target, db);

    const result = await engine.push();

    expect(result.succeeded).toEqual([
      'user_profile', 'sessions', 'gate_progress', 'week_progress'
    ]);
    expect(result.failed.map(f => f.table)).toEqual(['exercises']);
    // watermark advances ONLY for succeeded tables
  });
```

This is the test that proves the file-06 refactor (accumulate, don't early-return) is doing the right thing. Today's behavior fails this test; the fix makes it pass.

**Edge 5. Force-quit during a pull-restore.**

```ts
  src/services/sync/supabase-sync.ts (pullRestoreIfFresh, ~line 150-200)
  restoreInProgress = true;
  // clear local data
  await db.runAsync(`DELETE FROM sessions`);
  // pull from cloud
  const sessions = await supabase.from('sessions').select('*');
  // replay into local
  for (const r of sessions.data) {
    await db.runAsync(`INSERT INTO sessions ...`);
  }
  restoreInProgress = false;
```

If force-quit happens between "clear" and "replay complete," next launch finds local sessions empty and the cloud has them. If a force-quit happens between "replay started" and "complete," some sessions are present locally, others aren't.

```ts
  test('after pull-restore interruption mid-replay, retrying produces full restore', async () => {
    const db = await openTestDatabase();
    const cloud = makeTestCloud(50 /* sessions */);

    // simulate: restore aborted after replaying 25 sessions
    await partialRestore(db, cloud, { stopAfter: 25 });
    expect(await db.countSessions()).toBe(25);

    // act: retry restore
    await pullRestoreIfFresh(db, cloud);

    // assert: full set restored, no duplicates
    expect(await db.countSessions()).toBe(50);
  });
```

The test exposes whether replay is idempotent. If `INSERT` doesn't tolerate the existing 25 rows (e.g., violates unique constraint), the second restore fails differently than expected.

**Edge 6. Concurrent writes from two devices (one user, two devices, both online).**

This is the hardest edge in the sync model. Device A logs a session at 10:00:05. Device B logs a session at 10:00:06. Both push. The watermark logic must decide: did A's push see B's session? If not, B's push will create the session in cloud; A's next pull will receive it. Eventual consistency.

```ts
  test('two devices writing concurrently both reach eventual consistency', async () => {
    const cloud = makeTestCloud();
    const dbA = await openTestDatabase();
    const dbB = await openTestDatabase();

    const sessionA = makeSession({ id: 'sa', date: '2026-06-01T10:00:05Z' });
    const sessionB = makeSession({ id: 'sb', date: '2026-06-01T10:00:06Z' });

    await dbA.insertSession(sessionA);
    await dbB.insertSession(sessionB);

    // both push at "the same time"
    await Promise.all([
      pushChanges(dbA, cloud),
      pushChanges(dbB, cloud),
    ]);

    // both pull
    await pullChanges(dbA, cloud);
    await pullChanges(dbB, cloud);

    // assert: both devices now know about both sessions
    expect(await dbA.countSessions()).toBe(2);
    expect(await dbB.countSessions()).toBe(2);
  });
```

This test will likely fail with today's design (watermark scheme assumes single writer). That's a feature of the test: it forces awareness of the limitation.

**Edge 7. Level-up at MAX_LEVEL.**

```ts
  src/lib/game/progression.ts (line ~27)
  if (currentLevel < MAX_LEVEL) {
    return currentLevel + 1;
  }
  return currentLevel;
```

```ts
  test('user at MAX_LEVEL passing the gate does not level up beyond MAX_LEVEL', () => {
    const user = makeUser({ pushLevel: MAX_LEVEL });
    const gates = [makeGate({ category: 'push', level: MAX_LEVEL, status: 'passed' })];
    const result = checkCategoryLevelUp(user, gates);
    expect(result.pushLevel).toBe(MAX_LEVEL);
  });
```

Cheap test, names an invariant: the level never increments past MAX. If someone refactors and accidentally removes the guard, this test fires.

**Edge 8. Week boundary on a date that crosses Sunday→Monday.**

```ts
  test('Sunday is the last day of the prior week', () => {
    // Sunday Jun 7 2026
    const sun = new Date('2026-06-07T15:00:00Z');
    expect(getWeekStart(sun)).toBe('2026-06-01');  // Monday of that week
  });

  test('Monday is the first day of the new week', () => {
    // Monday Jun 8 2026
    const mon = new Date('2026-06-08T03:00:00Z');
    expect(getWeekStart(mon)).toBe('2026-06-08');
  });

  test('year boundary handled correctly', () => {
    // Dec 31 2025 was a Wednesday; week starts Mon Dec 29 2025
    const newYearsEve = new Date('2025-12-31T12:00:00Z');
    expect(getWeekStart(newYearsEve)).toBe('2025-12-29');
  });
```

The Sunday/Monday boundary was the subject of a past migration (per `database.ts`'s migrate function). The test pins the behavior going forward.

#### Move 2 variant — load-bearing skeleton of "edge enumeration"

```
  Skeleton — four questions per function being tested

  1. WHAT INPUTS ARE POSSIBLE?
       happy: typical valid case
       boundary: zero, one, max, min
       degenerate: empty, null, undefined
       wrong: type mismatch, schema violation

  2. WHAT EXTERNAL FAILURES ARE POSSIBLE?
       network: timeout, 5xx, partial response
       disk: full, locked, corrupt
       process: killed mid-execution

  3. WHAT STATE ENTRIES MATTER?
       starting state variations
       prior calls that change behavior
       module-level mutable state

  4. WHAT INVARIANTS ARE LOAD-BEARING?
       must hold AFTER the call
       must hold BEFORE the call
       must never hold
```

Apply the four-question scan to each function before writing its test. The test count grows, but the count is the right one — exhaustive without padding.

#### Move 3 — the principle

> The happy path is the easy half. The hard half is everything else — empty inputs, network failures, race conditions, state-machine corners. Tests that don't cover the hard half don't prove much. The enumeration is mechanical; the discipline is to do it.

## Primary diagram

```
  contrl's edge-case map

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Domain logic edges (write unit tests)                        ║
  ╚═══════════════════════════════════════════════════════════════╝
       empty session.exercises                  → logSession edge
       MAX_LEVEL ceiling                         → progression edge
       Sunday ↔ Monday week boundary             → week-progress edge
       year boundary (Dec 31 → Jan 1)            → week-progress edge
       hysteresis boundary in RepCounter         → rep-counter edge
       gap-then-mid-rep landmark sequence        → rep-counter edge
       3rd consecutive clean → passed            → gate-check edge
       mixed clean/dirty session sequence        → reconstruct edge

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Persistence edges (write integration tests)                   ║
  ╚═══════════════════════════════════════════════════════════════╝
       JSON.parse on malformed exercises_json    → getSessions edge
       INSERT with duplicate ID (race)            → insertSession edge
       UPDATE on non-existent row                → updateUserLevel edge
       migration step fails mid-batch            → migrate edge

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Sync edges (write integration tests with FakeSyncTarget)      ║
  ╚═══════════════════════════════════════════════════════════════╝
       network timeout on table N (N+1..end?)    → push edge
       force-quit during pull-restore             → pullRestore edge
       concurrent two-device write                → push+pull race
       Supabase 5xx response                      → push edge
       schema mismatch in remote row              → mapper edge
```

## Implementation in codebase

### What to write first

The five tests that catch the most edges per unit of effort:

1. **`logSession with empty exercises`** — exposes whether the function crashes or degrades; takes one minute to write
2. **`RepCounter hysteresis boundary`** — names the contract (no rep on boundary ping-pong); one of the load-bearing FSM invariants
3. **`Week boundary Sunday/Monday`** — three test cases (Sun, Mon, year boundary); pins the migration's intent
4. **`getSessions with malformed JSON row`** — exposes the unguarded parse; will fail today, fix per file 06
5. **`push partial failure preserves succeeded tables`** — exposes the early-return; will fail today, fix per file 06

Each is a high-information-density test: it catches a real bug OR it forces a real decision about behavior. Both outcomes are valuable.

### What can wait

The concurrent-two-device test (edge 6) is the most realistic at scale but requires the most infrastructure. Defer until multi-device is on the roadmap.

### Where to look in the codebase for each edge

```
  edge                              location of the code to exercise
  ────                              ────────────────────────────────
  empty exercises                    src/hooks/useGameState.ts        ~line 184
  null landmark / NaN angle          src/lib/pose/angles.ts          all
  malformed exercises_json           src/services/database.ts        ~line 424
  network failure mid-push           src/services/sync/supabase-sync.ts ~line 47
  force-quit during restore          src/services/sync/supabase-sync.ts ~line 150
  level-up at MAX                    src/lib/game/progression.ts     ~line 27
  Sunday→Monday boundary             src/lib/game/week-progress.ts   all
  hysteresis ping-pong                src/lib/pose/rep-counter.ts     all
```

## Elaborate

The argument for edge-case discipline is that bugs cluster at edges. A function's middle behavior is usually fine — the developer thought about the typical case and wrote it correctly. The edges are where the developer's thinking ran out: "I'll handle that later," "that can't happen," "it'll just fail loudly." Edges are where the code says one thing and reality says another.

The test for an edge case is also documentation. `test('logSession with empty exercises does not crash')` tells the next maintainer that this case has been considered. Without it, the next maintainer has to either rediscover the case (probably in production) or grep for empty-handling patterns and verify they exist.

There's a specific category worth highlighting: **state-machine corners** in `RepCounter`. The FSM has five phases and explicit transitions. The corners are:

- transition from `idle` directly to `up` (no down)
- transition from `down` directly to `up` (no bottom)
- staying in `bottom` for many frames (legitimate at slow tempo)
- staying in `ready` with no transition (long rest between reps)
- entering with a mid-rep landmark (the gap-then-mid-rep edge)

Each corner deserves a test. The cost: maybe a day of writing them all. The payoff: a refactor of the hysteresis logic six months from now ships safely because the corners have explicit verifications.

A note on what tests can't catch: tests can't tell you that the right edges were enumerated. The discipline is human — apply the four-question scan, look at each input parameter, ask what's possible. Tests verify the enumeration; they don't generate it.

## Interview defense

**Q: "How do you think about edge-case coverage?"**

```
  ┌─ Mechanical enumeration ───────────────────────────────────────┐
  │  For each function:                                            │
  │  1. boundary values (zero, one, max, empty, null)              │
  │  2. external failures (network, disk, force-quit)              │
  │  3. starting-state variations (prior calls, module state)      │
  │  4. invariants (must hold, must never hold)                    │
  │                                                                 │
  │  Each entry is one test or one decision. Mechanical;           │
  │  rewards being thorough.                                       │
  └─────────────────────────────────────────────────────────────────┘
```

```
  ┌─ The five highest-payoff tests for contrl ─────────────────────┐
  │  1. empty session.exercises                                    │
  │  2. RepCounter hysteresis boundary                             │
  │  3. week boundary (Sun/Mon/year)                                │
  │  4. malformed JSON in getSessions                              │
  │  5. partial sync failure preserves succeeded tables            │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "the happy path is the easy half — tests prove little until they cover the hard half."

**Q: "What's a corner test you wouldn't write?"**

The truly unreachable case. If TypeScript's type system rules out an input, the test for that input is testing the type checker. If the schema constraint makes a state unreachable, testing the unreachable state is busy-work. The discipline is to enumerate what's *possible*, not what's *imaginable*.

**Q: "What's the test that exposes the biggest current bug?"**

The partial-sync-failure test (edge 5). It exposes that today's `pushChanges` drops every table after the first failure — silently. The user loses data and nobody knows. The test forces the accumulate-results fix from `study-software-design/06`.

## Validate

1. **Reconstruct.** List the four-question edge-enumeration checklist.
2. **Explain.** Why are state-machine corners often the highest-information-density test target?
3. **Apply.** Pick a function in `src/lib/game/`. Enumerate its edges using the four-question checklist.
4. **Defend.** Argue that edge-case enumeration is over-investment for an MVP. Then rebut.

## See also

- [01-what-is-tested-and-what-isnt.md](./01-what-is-tested-and-what-isnt.md) — the risk-weighted view of which edges matter most
- [02-test-design-and-levels.md](./02-test-design-and-levels.md) — which level each edge wants
- [04-determinism-isolation-and-flakiness.md](./04-determinism-isolation-and-flakiness.md) — clock injection enables the date-boundary tests
- `.aipe/study-software-design/06-errors-and-special-cases.md` — same JSON.parse and early-return findings, design view
- [07-testing-red-flags-audit.md](./07-testing-red-flags-audit.md) — the buildable-target ranking
