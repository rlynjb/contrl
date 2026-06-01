# What is tested and what isn't
### Risk-weighted coverage map — Industry standard

> Coverage % is the wrong metric for an early-stage codebase — it averages away the bits that matter. The right metric is a RISK map: which critical paths would hurt most if they broke silently? In contrl that map has 100% coverage gaps; this file ranks them.

## Zoom out, then zoom in

A risk map identifies the paths that **carry consequences** when they break. Not "lines covered" but "what hurts if this code lies to the user." Sync that drops writes is high cost. A button label refactor is low cost. The map weighs by consequence, not by code volume.

```
  Zoom out — risk vs blast radius

  ┌─ HIGHEST CONSEQUENCE if broken ──────────────────────────────┐
  │  sync (SQLite ↔ Supabase): silent data loss                  │
  │  migrations: corrupt schema on existing devices              │
  │  game-state reconstruction (reinstall recovery)              │
  │  rep-counter FSM (off-by-one on rep counts)                  │
  └──────────────────────────────────────────────────────────────┘

  ┌─ MEDIUM CONSEQUENCE ─────────────────────────────────────────┐
  │  mapper (JSON round-trips): partial data on pull              │
  │  gate-check / progression logic: wrong level transitions      │
  │  per-exercise pose processors: wrong rep classification       │
  └──────────────────────────────────────────────────────────────┘

  ┌─ LOW CONSEQUENCE ────────────────────────────────────────────┐
  │  UI rendering: bug is visible, user can refresh               │
  │  pure utilities (week math, streaks)                          │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. Every box above currently has **zero tests**. The "high consequence + zero tests" intersection is the buildable target list.

## Structure pass

Layers: UI / Hooks / Domain (lib/game, lib/pose) / Persistence (database.ts) / Sync (sync/).

Axis to trace: **silence on failure** — does a broken module fail loudly (crash, error visible to user) or silently (wrong data, eventual consistency)?

```
  Tracing the silent-failure axis

  layer          failure mode                  silence risk
  ─────          ────────────                  ────────────
  UI             crash → user sees it          LOW
                 wrong text → user sees it
  Hooks          mostly UI-coupled             LOW
  Domain         pure fns; wrong output is     MEDIUM
                 silently wrong (off-by-one)
  Persistence    migration fail = crash on     MEDIUM
                 next launch (loud);
                 silent SQL bug = wrong data
                 (silent)                       HIGH
  Sync           silent data loss is THE       HIGHEST
                 failure mode (early-return
                 on first error)
```

Seam where silence becomes invisible: the **sync seam**. A break here doesn't crash, doesn't error visibly — it just stops syncing. The user finds out when they reinstall and discover data is missing.

## How it works

#### Move 1 — risk-weighted coverage, as a picture

You already do this informally. When you write production code, you mentally weight "if I'm wrong about this line, what happens?" A risk-weighted test plan formalizes the weight.

```
  Two coverage views, same codebase

  by lines covered                    by risk weighted

  ┌───────────────────────┐           ┌───────────────────────┐
  │ ▓▓▓▓▓░░░░░ 50%       │           │ ★★★★★★★★★ HIGH RISK   │
  │ (all areas equal)    │           │ ─────────             │
  │                       │           │ ✗ sync                │
  │                       │           │ ✗ migrations          │
  │                       │           │ ★★★★★ MED            │
  │                       │           │ ─────                 │
  │                       │           │ ✗ pose processors     │
  │                       │           │ ★★ LOW                │
  │                       │           │ ──                    │
  │                       │           │ ✗ week math           │
  └───────────────────────┘           └───────────────────────┘

  "we're 50% covered"                 "the high-risk parts
  → uninformative                       have 0% coverage"
                                      → actionable
```

The second view tells you where to start. The first view tells you nothing.

#### Move 2 — walking the risk map

**Tier 1 — silent data loss risk.**

```
  Tier 1 surfaces and their failure modes

  ── src/services/sync/supabase-sync.ts ──
     pushChanges()             early-return on first table error;
                               subsequent tables left unsynced.
                               WATERMARK doesn't advance.
                               failure: silent data divergence over time.

     pullRestoreIfFresh()      conditionally clears local data (the
                               "this device is empty" path); if pull
                               then errors partway, local state is now
                               in a half-restored shape.
                               failure: silent corruption after reinstall.

     restoreInProgress flag    module-global; if pushChanges runs while
                               flag is true, it silently no-ops at every
                               caller.
                               failure: a refactor that misuses the
                               flag breaks the sync model invisibly.

  ── src/services/database.ts ──
     migrate()                 9 SQL operations; each independent;
                               no transaction wrapping. If step 3 fails,
                               steps 1-2 persist; next launch may
                               re-attempt step 3 against partial state.
                               failure: subset of devices ends up with
                               a corrupted schema.

  Tests that would catch these:
   - sync round-trip integration test (local → cloud → fresh DB →
     local; assert equality)
   - migration test that runs against every prior schema version
   - watermark advance test (cause failure on table N; assert tables
     1..N-1 succeed; tables N..end remain dirty)
```

**Tier 2 — wrong-result risk.**

```
  Tier 2 surfaces

  ── src/lib/pose/rep-counter.ts ──
     RepCounter FSM           5 phases: idle → ready → down → bottom
                              → up. Hysteresis dead zone.
                              failure: at angles near the hysteresis
                              boundary, may ping-pong or miss a rep.

  ── src/lib/game/reconstruct.ts ──
     reconstructFromSessions  rebuilds gates + level from session
                              history. Skips sessions > current
                              level (line ~37); resets consecutive
                              passes on non-clean (line ~58) but
                              never resets gate.status to
                              'in-progress' if mixed clean/dirty
                              after pass.
                              failure: incorrect state after
                              reinstall.

  ── src/lib/pose/exercises/{pushup,squat,plank}.ts ──
     each classifier          smoothing factor hardcoded 0.4;
                              landmark visibility threshold 0.5
                              checked but no guard against
                              zero-magnitude vectors.
                              failure: bad-form set classified as
                              clean, or vice versa.

  Tests that would catch these:
   - FSM unit tests: feed an angle sequence, assert phase
     transitions + rep count
   - reconstruct unit tests: build session histories, assert the
     reconstructed user.levels and gate.status
   - per-exercise processor tests with fixture landmark sequences
```

**Tier 3 — visible-failure surfaces (lower test priority).**

```
  Tier 3 surfaces

  ── pure math utilities ──
     src/lib/pose/angles.ts       calculateAngle, smoothAngle,
                                  averageLandmarks. Pure. Easy to
                                  test. Failures visible (NaN, 0,
                                  unexpected behaviour).

     src/lib/game/week-progress.ts getWeekStart, isWeekComplete,
                                  needsWeekReset.
                                  failure visible (wrong week boundary)

     src/lib/game/streaks.ts       streak from week history.

  These are cheap to test; useful as the foundation layer of the
  test pyramid. Build them first because they're easy, then ratchet
  up to integration tests.
```

#### Move 2 variant — load-bearing skeleton of "risk-weighted test plan"

```
  Skeleton — four parts of a useful test plan

  1. RANK BY CONSEQUENCE
       what hurts most if this is silently wrong? not
       "what's hardest to test" — what costs most to be wrong about

  2. WEIGHT BY DETECTABILITY
       failures that crash get noticed; failures that lie get
       carried. Loud > silent for "do I need a test?"

  3. PICK THE LEVEL
       Tier 1 surfaces usually need INTEGRATION tests (multi-
       component round trips). Tier 2 need UNIT tests (pure fn,
       isolated FSM). Tier 3 are nice-to-have unit tests.

  4. WRITE FIXTURES, NOT MOCKS
       for inherently-flaky inputs (pose frames, network calls),
       capture real recordings and replay them. Mocking the
       database gives you false confidence; testing against real
       SQLite catches schema bugs.
```

#### Move 3 — the principle

> Test what hurts to be wrong about. Coverage % treats every line as equal; risk-weighted coverage treats consequences as the unit. A high-percentage-but-no-tier-1-coverage suite is decoration. A low-percentage suite that ONLY covers tier-1 is real protection.

## Primary diagram

```
  contrl's risk-weighted coverage map

  ╔═══════════════════════════════════════════════════════════════╗
  ║  TIER 1 — silent failure risk; 0% covered today               ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/services/sync/supabase-sync.ts
       src/services/database.ts                    (migrations)
       src/lib/game/reconstruct.ts

  ╔═══════════════════════════════════════════════════════════════╗
  ║  TIER 2 — wrong-result risk; 0% covered today                  ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/lib/pose/rep-counter.ts
       src/lib/pose/exercises/{pushup,squat,plank}.ts
       src/lib/game/{gate-check, progression}.ts
       src/services/sync/mapper.ts

  ╔═══════════════════════════════════════════════════════════════╗
  ║  TIER 3 — easy targets, low risk; 0% covered today             ║
  ╚═══════════════════════════════════════════════════════════════╝
       src/lib/pose/angles.ts
       src/lib/game/week-progress.ts
       src/lib/game/streaks.ts

  ╔═══════════════════════════════════════════════════════════════╗
  ║  NOT IN SCOPE for deterministic tests                          ║
  ╚═══════════════════════════════════════════════════════════════╝
       MediaPipe inference accuracy   → eval, not test
       LLM coaching quality (Phase 4) → eval, not test

  ─── recommended build order ───
   1. tier-3 unit tests   (fast wins; build the harness)
   2. tier-2 unit tests   (lib/pose FSM, lib/game logic)
   3. tier-1 integration  (migrations, sync round-trip, reconstruct)
```

## Implementation in codebase

### What exists today

```
  $ find /Users/rein/Public/contrl \( -name '*.test.*' -o -name '*.spec.*' \) \
         -not -path '*/node_modules/*'
  (no matches)

  $ ls /Users/rein/Public/contrl/tests/ 2>/dev/null
  (no such directory)

  $ jq '.devDependencies | keys' /Users/rein/Public/contrl/package.json
  ["@types/react", "typescript"]
```

No test files, no test framework, no fixtures. The test surface is the codebase as-is.

### Buildable target: scaffold the harness

```
  Phase 1 setup (proposed)

  devDependencies + scripts
  ─────────────────────────
    "vitest": "^1.6.0"           ← fast; native ESM; works with TS
    "@vitest/coverage-v8": ...
    "jsdom": ...                  ← for any DOM-touching tests

  package.json scripts
  ────────────────────
    "test": "vitest run",
    "test:watch": "vitest"

  test directory layout
  ─────────────────────
    tests/
      unit/
        pose/
          angles.test.ts          ← TIER 3 — start here
          rep-counter.test.ts     ← TIER 2
          exercises/
            pushup.test.ts
            squat.test.ts
        game/
          gate-check.test.ts      ← TIER 2
          progression.test.ts
          reconstruct.test.ts     ← TIER 1
          week-progress.test.ts   ← TIER 3
      integration/
        db/
          migrations.test.ts      ← TIER 1 — run against real SQLite
          crud.test.ts
        sync/
          round-trip.test.ts      ← TIER 1 — local→cloud→fresh→local
          partial-failure.test.ts ← TIER 1 — table N fails; verify
                                     watermark behaviour
      fixtures/
        pose/
          pushup-clean.json       ← recorded 10-frame sequence
          squat-half-rep.json
        sync/
          schema-v1.sql           ← every prior schema state
          schema-v2.sql
```

### Tier-1 integration test sketch

The single most valuable test in this whole codebase, paraphrased:

```ts
  // tests/integration/sync/round-trip.test.ts (proposed)
  describe('sync round-trip preserves all data', () => {
    test('local writes → cloud → fresh device → local matches', async () => {
      const db = await openTestDatabase();
      const sessions = makeSessionFixtures(50);
      for (const s of sessions) await db.insertSession(s);

      await pushChanges();                        // push to test cloud
      await db.close();

      const freshDb = await openFreshTestDatabase();
      await pullRestoreIfFresh();                  // restore from cloud

      const restored = await freshDb.getSessions();
      expect(restored).toEqual(sessions);          // assert byte-equal
                                                    // (modulo timestamps)
    });
  });
```

This single test catches: mapper renaming bugs, JSON.parse failures, missing fields, watermark mishandling, restore-skip logic mistakes, and migration ordering issues. It's also the hardest to set up (real test cloud, fresh DB factory). Worth it.

## Elaborate

The seductive thing about coverage % is that it's easy to measure. The unseductive thing is that it's nearly useless for prioritization. A codebase with 80% coverage that leaves the sync layer untested is more dangerous than a codebase with 30% coverage focused on the sync layer.

Risk-weighted prioritization comes from understanding the **failure mode**. A bug in `week-progress.ts` shows up as "the current week's number is off by one" — a user sees it, they file a ticket, you fix it. A bug in `supabase-sync.ts` shows up six months later as "I uninstalled the app and reinstalled and lost three months of sessions." The second bug is unrecoverable (the data is gone from the device that wrote it; the cloud didn't keep it). That's the asymmetry that risk-weighting captures.

contrl is well-positioned to add tests in the right order. Most of the tier-3 targets (`angles.ts`, `week-progress.ts`, `streaks.ts`) are pure functions with no external dependencies. Building those tests pays back as practice — they're cheap, they teach the harness, and they catch real bugs (pure functions with arithmetic are easier to get subtly wrong than people remember). Then tier-2 (FSM, classifiers) needs fixture infrastructure. Then tier-1 (sync, migrations) needs the real SQLite + test cloud setup.

A note on coverage tools: Vitest's `--coverage` reporter gives you the standard % per-file. Useful as a sanity check ("did the test I just wrote actually exercise the function?"), useless as a goal ("we'll get to 80%"). The discipline: write tests by risk, then use coverage to verify they hit what you intended.

## Interview defense

**Q: "How do you think about test coverage in this codebase?"**

```
  ┌─ Risk-weighted, not line-weighted ─────────────────────────────┐
  │  Coverage % averages away the bits that matter. The right     │
  │  metric is RISK: which paths would hurt most if they broke    │
  │  silently?                                                     │
  │                                                                │
  │  Today's risk map:                                             │
  │                                                                │
  │  Tier 1 (silent data loss):                                   │
  │    sync, migrations, reconstruct                              │
  │                                                                │
  │  Tier 2 (wrong result):                                       │
  │    rep-counter FSM, pose processors, game logic               │
  │                                                                │
  │  Tier 3 (visible failure, easy targets):                      │
  │    angles math, week math, streaks                            │
  │                                                                │
  │  All three tiers have 0% coverage today. The build order is   │
  │  Tier 3 → Tier 2 → Tier 1, because the harness needs to       │
  │  exist before the integration tests are tractable.            │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "test what hurts to be wrong about."

**Q: "Why not just chase 80% coverage?"**

Because 80% coverage of the UI and the pure utilities still leaves the sync layer untested. The 80% looks safe and isn't. A focused 30% on the tier-1 risks is more protective than a uniform 80% that includes everything cheap.

**Q: "If you could write only ONE test, which would it be?"**

The sync round-trip: local DB writes → push to test cloud → fresh DB → pull-restore → assert byte-equal (modulo timestamps). That single test exercises the mapper, the watermark, the restore logic, and the schema definitions all at once. Hard to set up, very high payoff.

## Validate

1. **Reconstruct.** From memory, list the three tiers and at least one file in each.
2. **Explain.** Why is "silent data loss" higher priority than "visible bug" for testing prioritization?
3. **Apply.** Pick a Tier 2 file. Sketch the unit test for it — what fixture inputs, what assertions?
4. **Defend.** Argue that the round-trip test is over-engineered for an MVP. Then rebut.

## See also

- [02-test-design-and-levels.md](./02-test-design-and-levels.md) — at which level (unit/integration/E2E) each tier belongs
- [03-tests-as-design-pressure.md](./03-tests-as-design-pressure.md) — why some tier-1 code is hard to test
- [04-determinism-isolation-and-flakiness.md](./04-determinism-isolation-and-flakiness.md) — how to handle pose frames and clock-dependent code
- [07-testing-red-flags-audit.md](./07-testing-red-flags-audit.md) — the ranked buildable-target list
- `.aipe/study-software-design/01-complexity-in-this-codebase.md` — the silent-failure surfaces also appear there
