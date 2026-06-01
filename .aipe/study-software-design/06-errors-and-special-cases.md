# Errors and special cases
### Exception handling · define-errors-out — Industry standard (APOSD ch. 10)

> Exception handling is one of the worst sources of complexity. The right move is usually to define the error out of existence — make the situation impossible, or aggregate the handling somewhere the caller doesn't have to think about it.

## Zoom out, then zoom in

Most exception handling reads like "I don't know what to do, but the caller above me probably doesn't either." That's how exception handling spreads — each layer rethrows, transforms, or swallows, and the actual recovery happens in five places, badly.

```
  Zoom out — the error-handling antipattern

  ┌─ caller ────────────────────────────────────┐
  │  try { ... } catch (e) { rethrow / swallow }│  ← layer 1
  └─────────────────┬───────────────────────────┘
                    │
  ┌─ middle ────────▼───────────────────────────┐
  │  try { ... } catch (e) { wrap and rethrow } │  ← layer 2
  └─────────────────┬───────────────────────────┘
                    │
  ┌─ inner ─────────▼───────────────────────────┐
  │  throw new Error("...")                      │  ← layer 3
  └──────────────────────────────────────────────┘

  problem: every layer has to do something with the error.
  most layers don't know what. so they do nothing useful,
  but loudly.
```

Zoom in. contrl has three error patterns worth fixing: **fire-and-forget sync errors** (silently swallowed at 8 sites), **JSON.parse with no guard** (rare but unrecoverable when it hits), and **early-return-on-first-error in `pushChanges`** (subsequent tables are left unsynced with no surfacing).

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync.

Axis to trace: **failure** (where does an error originate, propagate, get contained?).

```
  Tracing failure across the persistence-sync seam

  failure point                  origin            containment
  ─────────────                  ──────            ───────────
  Supabase POST returns 500      sync layer        early-return in
                                                   pushChanges (drops
                                                   subsequent tables);
                                                   .catch(()=>{}) at
                                                   8 caller sites
  JSON.parse(exercises_json)     persistence       no try/catch; throws
   fails on malformed row                          out to React error
                                                   boundary
  network failure mid-sync       sync layer        early-return; no
                                                   retry, no queue,
                                                   no surfacing
  SQLite locked / corrupt        persistence       throws into the
                                                   nearest catch (the
                                                   hook, the screen)
```

Seam where failure containment changes: **persistence → sync**. Within persistence, errors throw cleanly (rollback semantics OK). At the sync seam, errors get swallowed by `.catch(() => {})`. That's the load-bearing failure boundary.

## How it works

#### Move 1 — the picture of "define it out"

You've already seen this. `Array.prototype.slice(start, end)` doesn't throw on out-of-range indices; it clamps them. The "error" of negative indices is *defined out* — there's no exception to handle, just a sensible answer for every input.

```
  Two ways to handle "edge case input"

  define it out                       handle the exception
  ─────────────                       ────────────────────
  slice(-100, 100) → first elements   slice(-100, 100) → throw

  the caller never thinks             every caller wraps in
  about the edge case                 try/catch and decides
                                       what to do
```

The cheapest exception to handle is the one you don't throw.

#### Move 2 — three patterns in contrl

**Pattern 1. Fire-and-forget — `.catch(() => {})` at 8 sites.**

```ts
src/services/database.ts (× 8 occurrences)

  await runAsync(`INSERT INTO sessions ...`, [...]);
  pushChanges().catch(err => console.warn('push failed', err));
                       ▲
                       │
              ┌────────┴───────────────────────────┐
              │ caller "handles" the error by      │
              │ logging it. user has no idea       │
              │ their data didn't reach the cloud. │
              └────────────────────────────────────┘
```

The mistake isn't catching — it's the absence of a recovery model. The error is real and the caller can't recover, so it does the worst thing: pretends it succeeded.

The fix is to **aggregate**. Move sync coordination into a queue/engine that owns retry + surfacing + backoff:

```
  Skeleton — aggregated sync error model

  ┌─ syncEngine ────────────────────────────────────┐
  │  state: idle | pushing | failing                 │
  │  queue: pending writes                           │
  │                                                  │
  │  enqueueWrite(table, row) → void                 │
  │    ─ writes are durable in SQLite already        │
  │    ─ engine drains queue when online             │
  │                                                  │
  │  on push failure:                                │
  │    ─ exponential backoff                         │
  │    ─ surface state to UI ("offline" pill)        │
  │    ─ never silently drop                         │
  └──────────────────────────────────────────────────┘
```

Now there's ONE place that handles sync failure, not eight. Callers don't see the error and don't pretend they did.

**Pattern 2. JSON.parse with no guard.**

```ts
src/services/database.ts (~line 424, ~line 578)

  function rowToSession(row: any): WorkoutSession {
    return {
      id: row.id,
      date: row.date,
      exercises: JSON.parse(row.exercises_json),    ← can throw
      ...
    };
  }
```

If a session's `exercises_json` is ever malformed (rare today; possible if Supabase ever returns a partially-written row), this throws. There's no caller-side handler — it bubbles up to React's error boundary.

There are two cures depending on whether the error is recoverable:

```ts
// option A: define it out (acceptable if loss is OK)
exercises: tryParseOrDefault(row.exercises_json, []) as ExerciseEntry[],

function tryParseOrDefault<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); }
  catch { return fallback; }   ← session opens with no exercises
                                 (better than crashing the screen)
}

// option B: validate the shape (better, more work)
const result = SessionExercisesSchema.safeParse(parsed);
if (!result.success) return logAndSkip(row.id, result.error);
exercises: result.data,
```

Option A is the cheap pull-down. Option B is the right answer once Zod is wired in (Zod is already in dependencies indirectly).

**Pattern 3. Early-return on first error in `pushChanges`.**

```ts
src/services/sync/supabase-sync.ts (~line 47-area, abstracted)

  async function pushChanges() {
    // table 1
    const { error: e1 } = await supabase.from('user_profile').upsert(...);
    if (e1) { logErr(e1); return; }        ← stop everything

    // table 2 — never reached if table 1 failed
    const { error: e2 } = await supabase.from('exercises').upsert(...);
    if (e2) { logErr(e2); return; }
    ...
  }
```

If `user_profile` fails (anything: transient network, RLS rejection once auth lands, schema mismatch), no other table pushes. The watermark also doesn't advance, so the next call retries from the same starting point — but it'll fail on the same table first, again, forever.

The fix is to **accumulate**:

```ts
  async function pushChanges() {
    const results = {
      succeeded: [] as TableName[],
      failed: [] as { table: TableName, error: unknown }[],
    };

    for (const table of TABLES) {
      const r = await pushTable(table);
      if (r.ok) results.succeeded.push(table);
      else      results.failed.push({ table, error: r.error });
    }

    // advance watermark only for tables that succeeded
    advanceWatermarks(results.succeeded);

    return results;
  }
```

Now one table failing doesn't block the others. The caller (sync engine) can decide what to do with `results.failed` — retry, surface, defer.

#### Move 2 variant — load-bearing skeleton of "define-it-out"

```
  Skeleton — three parts of a defined-out error

  1. THE INPUT THAT WOULD HAVE THROWN
       null, malformed, out-of-range, partial...

  2. THE SENSIBLE ANSWER
       empty array, clamped value, default object,
       "do nothing" success

  3. THE INVARIANT THAT STILL HOLDS
       the function's contract is unchanged from the
       caller's view — they still get a session, just
       one with no exercises in this edge case
```

The lesson: defining it out is *cheap* when there's a sensible answer. It's *wrong* when the sensible answer would hide a bug. JSON.parse failing on `exercises_json` could go either way — if the row was corrupted, returning empty might mask a sync bug. The middle path (option B above) is to log + fallback, not silent fallback.

#### Move 3 — the principle

> Each error case the caller has to handle is a knob pushed up. Define the error out where the sensible answer is obvious; aggregate the handling where it isn't; never let "I caught it" replace "I handled it."

Silent catches train future you to ignore the warning. The pattern in contrl (eight `.catch(() => {})` calls) makes it impossible to distinguish "everything is fine" from "everything has been failing silently for a week."

## Primary diagram

```
  contrl's three error patterns and their fixes

  ╔═══════════════════════════════════════════════════════════════╗
  ║ Pattern 1 — fire-and-forget sync (8 caller sites)              ║
  ╚═══════════════════════════════════════════════════════════════╝
       caller: pushChanges().catch(() => {})    ← swallowed
       fix:    syncEngine.enqueue(write)        ← aggregated
                  └─ retry, backoff, surface as state

  ╔═══════════════════════════════════════════════════════════════╗
  ║ Pattern 2 — JSON.parse with no guard (2 sites)                 ║
  ╚═══════════════════════════════════════════════════════════════╝
       caller: JSON.parse(row.exercises_json)   ← can throw
       fix A:  tryParseOrDefault(...) — define it out
       fix B:  schema.safeParse(...)   — validate + log

  ╔═══════════════════════════════════════════════════════════════╗
  ║ Pattern 3 — early-return in pushChanges                        ║
  ╚═══════════════════════════════════════════════════════════════╝
       current:  if (e1) { logErr(e1); return; }  ← drops tables 2-5
       fix:      accumulate { succeeded, failed } across tables
                 advance watermark only for succeeded
                 caller (engine) decides on failed

  COMMON THREAD:
  ─────────────
  - errors live at the persistence ↔ sync seam
  - the cheap fix is to define them out where sensible
  - the right fix is to give sync one place that handles them
```

## Implementation in codebase

### Fire-and-forget sites

```
  src/services/database.ts — every CRUD function has this shape

  export async function insertSession(session: WorkoutSession) {
    await runAsync(`INSERT INTO sessions ...`, [...]);
    pushChanges().catch(err => console.warn('push failed', err));
            │
            └─ 8 such sites: insert/update/delete × sessions,
               exercises, gate_progress, week_progress, user_profile
  }
```

The fix is structural — see [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) for the sync-engine refactor. The error handling and the leakage are two sides of the same problem.

### JSON.parse sites

```ts
src/services/database.ts (~line 424)

  export async function getSessions(): Promise<WorkoutSession[]> {
    const rows = await db.getAllAsync<any>(`SELECT ... FROM sessions ORDER BY date DESC`);
    return rows.map(row => ({
      id: row.id,
      date: row.date,
      exercises: JSON.parse(row.exercises_json),    ← can throw on malformed
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

src/services/database.ts (~line 578)
  // same pattern in another reader
```

The cheap fix:

```ts
  function parseExercisesJson(s: string | null): ExerciseEntry[] {
    if (!s) return [];
    try { return JSON.parse(s) as ExerciseEntry[]; }
    catch (e) {
      console.warn('malformed exercises_json, returning empty', { e });
      return [];
    }
  }
  // ...
  exercises: parseExercisesJson(row.exercises_json),
```

The user sees an empty session instead of a white-screen crash. The log surfaces the bug.

### Early-return in `pushChanges`

```ts
src/services/sync/supabase-sync.ts (~line 47, abstracted)

  export async function pushChanges() {
    if (restoreInProgress) return;

    const since = await getLastPushedAt();

    // user_profile
    const profileDirty = await db.getDirty('user_profile', since);
    if (profileDirty.length) {
      const { error } = await supabase
        .from('user_profile')
        .upsert(profileDirty.map(userProfileToRemote));
      if (error) { logErr(error); return; }        ← drops everything below
    }

    // exercises — never reached on profile failure
    // sessions — never reached
    // gate_progress — never reached
    // week_progress — never reached
  }
```

Fix shape:

```ts
  type PushResult = { succeeded: TableName[]; failed: PushFailure[] };

  export async function pushChanges(): Promise<PushResult> {
    if (restoreInProgress) return { succeeded: [], failed: [] };

    const since = await getLastPushedAt();
    const result: PushResult = { succeeded: [], failed: [] };

    for (const table of TABLES) {
      const dirty = await db.getDirty(table, since);
      if (!dirty.length) continue;
      const r = await pushTable(table, dirty);
      if (r.ok) result.succeeded.push(table);
      else      result.failed.push({ table, error: r.error });
    }

    if (result.succeeded.length) await advancePushWatermark();
    return result;
  }
```

The behavior changes in three ways. First, table 5 succeeds even when table 1 fails. Second, the watermark advances only when something succeeded. Third, the caller (the sync engine) can act on `failed` — surface it, retry, alert.

## Elaborate

The deepest lesson in this primitive is that **error handling is not a separate concern from API design**. The shape of an error a function can return shapes the function's interface. A function that returns `T | null` is teaching every caller to handle null. A function that returns `T` and throws is teaching every caller to wrap in try/catch. A function that returns `Result<T, E>` is teaching every caller to discriminate the union.

contrl's current shape (mostly throw + catch-and-swallow) is the worst of three options for the sync path. Throwing makes the error real; the catch-and-swallow makes it invisible. The result is "errors are loud where I write the catch, silent everywhere else."

The fix isn't to change the type signature of every call — that's overkill. The fix is to **own the error at one layer**. The sync engine owns sync errors. The persistence layer owns SQLite errors (and throws them cleanly so the engine can catch). Everyone else stays unaware.

This is the same primitive as "deep modules" applied to errors — pull the handling down into one module that absorbs the decision, instead of pushing handlers up into every caller.

## Interview defense

**Q: "Where would you start cleaning up error handling in this app?"**

```
  ┌─ Three patterns, ranked by silent-failure risk ────────────────┐
  │                                                                 │
  │  1. Fire-and-forget sync at 8 sites — silently drops user data │
  │     Fix: aggregate into a sync engine that retries + surfaces. │
  │                                                                 │
  │  2. JSON.parse with no guard — rare crash, terrible UX         │
  │     Fix: tryParseOrDefault for cheap path; Zod for right path. │
  │                                                                 │
  │  3. Early-return in pushChanges — one bad table drops 4 others │
  │     Fix: accumulate results across tables; advance watermark   │
  │     for only succeeded tables.                                 │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "define the error out where you can, aggregate where you can't, never catch-and-swallow."

**Q: "When IS `catch (e) { ... }` the right move?"**

When the catch *recovers*. A retry loop catches in service of retrying. A boundary handler catches in service of showing a UI fallback. A graceful-degrade path catches in service of returning a sensible default. None of those describe the eight sync sites — they catch because the caller can't recover, then pretend nothing happened.

**Q: "Why is early-return-on-first-error a smell?"**

Because it tightly couples the order of operations to the error model. Table 2's success depends on table 1's, even though they're logically independent. The right model says "five independent operations; report what happened with each." Accumulation respects independence.

## Validate

1. **Reconstruct.** Sketch the three error patterns and their fixes from memory.
2. **Explain.** What's the difference between "catching" and "handling"? Which one does `.catch(() => {})` do?
3. **Apply.** Rewrite `pushChanges` to accumulate. What does the return type become, and what's the caller now responsible for?
4. **Defend.** Argue that the JSON.parse should NOT be wrapped (let it crash, fix the root cause). Then rebut.

## See also

- [03-information-hiding-and-leakage.md](./03-information-hiding-and-leakage.md) — `restoreInProgress` is also an error-related leak
- [04-layers-and-abstractions.md](./04-layers-and-abstractions.md) — aggregated error handling is a real layer earning its place
- `.aipe/study-testing/05-edge-cases-and-error-paths.md` — what tests would have caught these failures
- [08-red-flags-audit.md](./08-red-flags-audit.md) — error severity ranking
