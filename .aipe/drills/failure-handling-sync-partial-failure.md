# Drill — sync partial-failure tolerance

```
  competency:   failure handling / partial-failure tolerance        raises: L0 → L2
  curriculum:   (no Bx.y today — contrl's curriculum doesn't enumerate
                 a sync-partial-failure Build item; closest concepts are
                 distributed-systems delivery semantics + idempotency)
  study ref:    .aipe/study-software-design/06-errors-and-special-cases.md
                .aipe/study-software-design/03-information-hiding-and-leakage.md
                (future) .aipe/study-distributed-systems/02-partial-failure-
                          timeouts-and-retries.md (scaffold only today)
  context:      ★ recon Move 2. The fire-and-forget pattern at 8 sites in
                database.ts + the early-return in pushChanges is the audit's
                tier-1 finding from both study-software-design and study-
                security. Closing it produces a real distributed-systems
                war story.
  triggered by: .aipe/audits/recon-2026-06-04.md → TRACK Move 2
                (originally queued in .aipe/audits/recon-2026-06-03.md)
```

> A drill is not a tutorial. The assignment is to make the sync layer lie to you on purpose, watch it lie, then ship the smallest fix that stops the lie. The interview signal lives in step 3 (diagnose), not step 4 (the patch).

The six steps walk one competency up the ladder. Each step is a real action in the editor — fault injection, not whiteboard.

---

## 1. BUILD — the naive happy-path that already exists

You didn't build this one today; you inherited it from feature-first growth. The naive shape is in `src/services/sync/supabase-sync.ts` and at 8 call sites in `src/services/database.ts`.

**The shape of the lie (in pseudocode — match against the real file):**

```
  src/services/sync/supabase-sync.ts  pushChanges()

  for each table in [user_profile, exercises, sessions, gate_progress, week_progress]:
    dirty = getDirty(table, since=lastPushedAt)
    if dirty is empty: continue
    error = await supabase.from(table).upsert(dirty.map(toRemote))
    if error:
      logErr(error)
      return               ← ★ THE LIE: drops every table after this one
  advanceWatermark()       ← runs only on full success

  src/services/database.ts  (8 sites — one per CRUD)

  await db.runAsync(`INSERT INTO sessions ...`, [...])
  pushChanges().catch(err => console.warn('push failed', err))
                           ← ★ THE LIE COMPOUNDS: caller can't tell
                              the push was a no-op
```

**File:line cites:**
- `src/services/sync/supabase-sync.ts` — `pushChanges()` and the early-return on each table's error
- `src/services/database.ts` — every CRUD function ends with `pushChanges().catch(...)`
- 8 call sites for the fire-and-forget pattern (insert/update/delete × sessions, exercises, gate_progress, week_progress, user_profile — verify exact count with `grep -n 'pushChanges().catch' src/services/database.ts`)

**Done when:** you've read the actual code (not this writeup's paraphrase) and can point at the exact line where pushChanges returns early. Don't fix anything yet. You're observing.

---

## 2. INDUCE — force the failure

**The assignment is to make tables 3, 4, 5 silently disappear.** A drill with no induced failure is a tutorial.

**The minimum setup:**

```
  1. Test Supabase project (free tier, fresh schema mirroring contrl's
     5 sync tables). Or: a FakeSyncTarget class in a test file that
     implements the same interface as the supabase JS client's .from(t).upsert()
     and returns scripted responses. The fake is faster and doesn't
     burn quota — recommended.

  2. A test scaffold: tests/integration/sync/partial-failure.test.ts
     (you'll need vitest or jest installed — neither is in package.json
     today; install vitest as part of this drill, since the
     study-testing red-flags-audit already flagged "no test framework"
     as Tier 1).

  3. Seed the local DB with dirty rows in all 5 tables:
      - 1 dirty user_profile row
      - 2 dirty exercises
      - 3 dirty sessions
      - 1 dirty gate_progress
      - 1 dirty week_progress
```

**The induced fault — the FakeSyncTarget script:**

```
  scripted responses (in fixture order):
    user_profile   → { ok: true }                    ← passes
    exercises      → { ok: false, error: '5xx' }     ← FAILS HERE
    sessions       → not reached today (the lie)
    gate_progress  → not reached today (the lie)
    week_progress  → not reached today (the lie)
```

**Run the test. Observe.**

```
  expected (today's behavior):
    - exercises returns error
    - logErr fires once: "exercises push failed"
    - pushChanges() returns early
    - sessions, gate_progress, week_progress: never attempted
    - watermark: not advanced (because no full-success)
    - the 3 dirty sessions stay dirty in sync_state
    - NEXT push attempt will retry from user_profile again
    - and FAIL on exercises again
    - forever, silently
```

**Done when:** the test prints the actual sequence of attempts (user_profile ✓, exercises ✗, then nothing) AND you can articulate the user-visible symptom: *"the user logs three new workout sessions; the next time they open the app on another device, none of them are there."*

The user does not see an error. They see missing data. **That is the lie.**

If your test passes with all 5 tables succeeding even though exercises is scripted to fail, **you wired the fake wrong**. Push harder.

---

## 3. DIAGNOSE — symptom → hypotheses → isolated cause

**This is where L2 signal lives.** The diagnosis is mechanical, but writing it down forces the rep.

```
  STEP A. State the symptom precisely.
           "When pushChanges() encounters an error on table N, tables
            N+1 through end are not attempted. The watermark does not
            advance. On retry, the same failure recurs on table N, and
            tables N+1+ never push. Data divergence is permanent for
            those tables until the table-N failure is fixed externally."

  STEP B. List 3-4 hypotheses BEFORE testing any.
           h1. The early-return is a deliberate choice — maybe ordering
                matters; pushing sessions before exercises is unsafe.
           h2. The early-return is a defensive copy of a "fail fast"
                pattern; the assumption was that any error indicates
                a systemic problem (auth, network down), so trying
                more tables is wasted.
           h3. The 8 callers using .catch(() => {}) compound the lie —
                even if pushChanges returned a structured result, the
                callers would still ignore it.
           h4. The watermark scheme assumes all-or-nothing semantics;
                advancing per-table requires per-table watermarks,
                which sync_meta already has (last_pushed_at per
                table_name) but pushChanges doesn't use them.

  STEP C. Eliminate hypotheses with EVIDENCE, not intuition.

           h1 (ordering matters): read the FK constraints in
              database.ts migrations. CHECK — there are no FKs.
              user_profile, exercises, sessions, gate_progress,
              week_progress are independent. The 5 tables can push
              in any order or even concurrently without violating
              local invariants. → h1 REJECTED.

           h2 (fail-fast deliberate): grep the commit log for
              pushChanges, look for the original intent. Likely
              evidence: the function was written before the watermark-
              per-table refactor; early-return reflected the original
              all-or-nothing model. → h2 PARTIALLY: the choice was
              consistent with the design at the time it was written;
              it's outdated, not malicious.

           h3 (callers compound): grep for `pushChanges().catch`
              — confirm the 8 sites. The callers can't act on
              structured failure today because pushChanges returns
              void. → h3 CONFIRMED as compound issue, but not the
              ROOT cause; the root is in pushChanges itself.

           h4 (watermarks already per-table): inspect sync_meta
              schema. It has table_name + last_pushed_at columns
              — built for per-table advancement. pushChanges
              advances them all-or-nothing anyway. → h4 CONFIRMED:
              the schema supports the correct behavior; the code
              doesn't use it.

  STEP D. Name the isolated cause in ONE sentence.
           "pushChanges drops tables N+1+ on the first table-N
            failure because its loop uses an all-or-nothing
            return semantics that contradicts the per-table
            watermark schema in sync_meta — fixing the loop
            to accumulate { succeeded, failed } per table and
            advance per-table watermarks honors a design
            already in the data model."
```

**Done when:** the diagnose section has a one-sentence isolated cause backed by 4 hypotheses tested with evidence. Save it in your test file as a top-level comment — this is the future-you note.

**The interview test:** can you say the cause in 30 seconds without saying "I think" or "probably"? If yes, this rep earned L2.

---

## 4. FIX + REJECT — the fix shipped, AND the rejected alternatives

```
  FIX:    rewrite pushChanges to accumulate { succeeded, failed }
          per table; advance per-table watermark for succeeded
          tables; return the structured result.

          // src/services/sync/supabase-sync.ts
          export async function pushChanges(): Promise<PushResult> {
            if (restoreInProgress) return { succeeded: [], failed: [] };
            const result: PushResult = { succeeded: [], failed: [] };
            for (const table of TABLES) {
              const since = await getWatermark(table);
              const dirty = await getDirty(table, since);
              if (!dirty.length) continue;
              const r = await pushTable(table, dirty);
              if (r.ok) {
                await advanceWatermark(table);
                result.succeeded.push(table);
              } else {
                result.failed.push({ table, error: r.error });
              }
            }
            return result;
          }

  REJECT 1: retry-with-backoff inside pushChanges.
           why rejected: turns a sync function into a coordination
           engine. The 8 caller sites today fire pushChanges
           opportunistically (after every write); a retry loop would
           layer compound retries on top, with no global rate budget.
           The retry belongs ABOVE pushChanges, in a future sync engine
           (already documented in study-software-design's recommended
           refactor). Don't conflate the two.

  REJECT 2: throw on first failure; let the caller decide.
           why rejected: the 8 callers all use .catch(() => {}) today.
           Switching to throw would compound the lie, not fix it —
           the callers still ignore the throw. The fix has to live
           where it can't be ignored by the existing call sites:
           the structured return guarantees that EITHER the caller
           checks the result (correct), OR it ignores the result
           (same as today — but at least the data model now reflects
           reality, and tables 3-5 succeed even when table 2 fails).

  REJECT 3: parallel push of all tables (Promise.all).
           why rejected: Supabase JS rate-limits per project. Parallel
           push of 5 small tables would arrive within 50ms and trigger
           the rate limiter; the resulting 429s would look like
           partial failure on tables you ALSO have to handle. The
           sequential serial path is fine for 5 tables at single-user
           scale. Parallel becomes worth it at >20 tables or >10x QPS.
```

**Done when:** the fix is in `src/services/sync/supabase-sync.ts`, the function signature returns `Promise<PushResult>`, AND the test from step 2 now shows tables 3-5 succeed when table 2 fails. The 8 callers in database.ts can stay on `.catch(() => {})` for this drill — they're a separate refactor (the sync-engine extraction).

---

## 5. EVAL — prove the fix; cap the regression

The eval has two parts: prove the fix on the induced case, prove no regression on the happy path.

**Test 1 — the induced case (must pass after fix; must fail before):**

```
  // tests/integration/sync/partial-failure.test.ts

  test('table N failure does not block tables N+1 through end', async () => {
    const target = new FakeSyncTarget({
      user_profile:  { ok: true },
      exercises:     { ok: false, error: 'simulated 5xx' },
      sessions:      { ok: true },
      gate_progress: { ok: true },
      week_progress: { ok: true },
    });
    const engine = new SyncEngine(target, testDb);

    const result = await engine.push();

    expect(result.succeeded).toContain('user_profile');
    expect(result.succeeded).toContain('sessions');
    expect(result.succeeded).toContain('gate_progress');
    expect(result.succeeded).toContain('week_progress');
    expect(result.failed.map(f => f.table)).toEqual(['exercises']);
  });

  test('watermarks advance only for succeeded tables', async () => {
    // ... same setup ...
    const before = await readAllWatermarks();
    await engine.push();
    const after = await readAllWatermarks();
    expect(after.exercises).toBe(before.exercises);          // unchanged
    expect(after.sessions).toBeGreaterThan(before.sessions); // advanced
  });
```

**Test 2 — the happy path (must pass before and after):**

```
  test('all-success push advances all watermarks', async () => {
    const target = new FakeSyncTarget(/* all ok */);
    const engine = new SyncEngine(target, testDb);
    const result = await engine.push();
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(5);
    // every watermark advanced
  });
```

**The pre/post numbers (`report.md` in the drill folder):**

```
  ┌──────────────────────────────────────────┬──────┬──────────┐
  │ scenario                                  │ pre  │ post     │
  ├──────────────────────────────────────────┼──────┼──────────┤
  │ all 5 tables succeed                       │  ✓   │   ✓      │
  │ table 2 (exercises) fails                  │      │          │
  │   - user_profile pushed?                   │  ✓   │   ✓      │
  │   - exercises pushed?                      │  ✗   │   ✗      │
  │   - sessions pushed?                       │  ✗   │   ✓ ★    │ ← the win
  │   - gate_progress pushed?                  │  ✗   │   ✓ ★    │
  │   - week_progress pushed?                  │  ✗   │   ✓ ★    │
  │   - exercises watermark advanced?          │  ✗   │   ✗      │
  │   - sessions watermark advanced?           │  ✗   │   ✓ ★    │
  └──────────────────────────────────────────┴──────┴──────────┘

  data-loss eliminated for 3 of 5 tables when 1 table fails.
  retry behavior on next push: exercises still attempted (correct);
  other 4 tables don't re-push the same data (idempotent; correct).
```

**Done when:** both tests pass in the current commit; the report table is in `report.md`; the regression test stays in the suite so a future "let me simplify pushChanges" PR fails fast.

---

## 6. WAR STORY — the sentence you can now say in a room

> "Our local-first app syncs to Supabase by walking five tables in order. The original push function returned early on the first table's failure — which made sense at the time, but the data model already supported per-table watermarks, so the return was throwing away work the schema knew how to track. The user-visible symptom was silent: log three workout sessions, fail to push exercises, the sessions never reach the cloud and the user finds out when they reinstall. I wrote a fault-injection test that scripts a failure on table 2, watched it drop tables 3-5, then refactored push to accumulate succeeded/failed results and advance per-table watermarks for what landed. Tables 3-5 now make it through when table 2 fails, and table 2's retry behavior is preserved. The 8 fire-and-forget callers are a separate refactor — a real sync engine that handles the retry budget — but the lowest-level loop now tells the truth."

**Push-back you should expect:**

- *"Why not just retry table 2?"* — "Because the retry policy belongs above pushChanges, not inside it. Today the 8 callers fire pushChanges opportunistically; layering retries here would compound. The fix that closes my failure isn't 'retry table 2,' it's 'don't let table 2's failure cost me tables 3-5.' That's a smaller, safer change with the same data-loss reduction."

- *"How do you know the sessions table doesn't depend on exercises being synced first?"* — "I checked the schema. No FKs. Each table has user_id but they're independent rows. If exercises hasn't reached the cloud, a session that references one of its exercise IDs still pushes successfully — the FK check happens locally before insert, and Supabase doesn't enforce cross-table referential integrity client-side. If we add FKs in Postgres later, this assumption changes and I'd revisit the ordering."

- *"Why didn't you fix the .catch(() => {}) at the 8 call sites?"* — "Different competency, different drill. Those need a sync engine above pushChanges that owns the retry budget, the queue, and the surface area to the UI. Today's change is the smallest fix that stops table-2 failure from dropping tables 3-5. I'd queue the sync-engine refactor as the next drill on the failure-handling track."

- *"Is this a single-writer assumption?"* — "Yes. Single user, single device, hardcoded USER_ID at Phase 2A. If two devices write concurrently before Phase 4 auth lands, the watermark scheme races. That's documented in study-distributed-systems as 'not yet exercised' — I'd address it when multi-device becomes a real surface."

**The L3 finish line:** you can hold the answer without retreating to "I think" or "I'd want to look at." If the question lands inside the scope you fixed, you defend it. If it lands outside, you name *why* it's outside and what the next-drill answer looks like.

---

**Done.** Commit message: `fix(sync): pushChanges accumulates per-table results; advance per-table watermarks; cover with fault-injection test`. The commit is the artifact that backs the war story.

---

*Next drill candidate in the failure-handling track: the sync engine refactor (own the 8 fire-and-forget call sites; introduce a queue with retry budget + UI-visible status). That drill earns "designed and shipped a distributed-systems pattern" — L3 on failure handling, which is the second L3 contrl can produce.*
