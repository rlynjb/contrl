# 6. Reliability and error handling

This is the area I'm weakest on, and pretending otherwise would be the wrong answer in an interview. The honest assessment, lifted from `AUDIT.md`:

- Home: `status === 'error'` renders null. The user sees a blank screen.
- Log workout: a database query failure shows infinite loading.
- History: no error path if session retrieval fails.
- Settings: sync errors are shown but there's no retry mechanism.

That said, the parts of the system that *are* defended against failure are defended deliberately:

```
Sync error model

      pull exercises ─── fails ──▶ leave exercises stale, continue
              │
              ▼
       pull sessions ─── fails ──▶ abort sync, surface error in Settings
              │                    (don't risk pushing local with stale base)
              ▼
       push sessions ─── 5xx ────▶ exponential backoff, 3 retries
              │           429 ───▶ respect Retry-After
              │           4xx ───▶ surface, mark session unsynced, continue
              ▼
     process deletions ─── fails ──▶ leave tombstones, retry next sync
              │
              ▼
       bump syncVersion (only on success)
```

The two important properties of that flow: (1) failure to push doesn't corrupt local state, and (2) `syncVersion` only bumps on full success, so a partial failure doesn't trigger a downstream `load()` that would observe inconsistent state.

## Interview questions

**[mid] What happens if the user kills the app mid-save?**

> The draft auto-save fires every 500ms while the form is dirty, so up to 500ms of work is lost. The save operation itself is a single SQLite transaction in `services/database.ts`'s `insertSession()` — either the row is inserted and the gate is updated, or neither is, because both writes are inside the same transaction. The case I had to think about: what if the gate update succeeds but the sync push fails on app relaunch? That's fine, because the session is marked unsynced (`notionPageId` is null) and the next sync picks it up. The failure mode I *didn't* fully solve: if the user kills the app between the gate update and the level-up navigation, the result screen never renders. The session is saved correctly but the user doesn't see the celebration. That's a UX bug, not a data bug.

**[senior] You retry on 5xx but not on 4xx. Why?**

> 4xx is a client error — the request itself is malformed or unauthorised, retrying won't change that. The only 4xx I retry is 429 because that's a rate-limit signal that explicitly says "try again later," and I respect the Retry-After header. 5xx is a server error and is by definition transient; the spec says "the server failed, the request might still work." So the policy is: retry on transient errors (5xx, 429) with exponential backoff capped at 3 attempts, fail fast on permanent errors (4xx other than 429), and never retry on 2xx because that's success. The cap exists because Notion's 350ms throttle means a 4th retry is 5+ seconds in, and at that point the user is staring at a spinner and would rather see an error.

**[arch] How would you know your sync is correct?**

> I wouldn't, currently — there's no end-to-end test that exercises the sync against a Notion-shaped fake. What I *would* build, given more time: a deterministic test harness that mocks Notion's API as a stateful in-memory store, then runs property-based tests where I generate sequences of (local edit, remote edit, conflict, deletion) operations and assert that local + remote converge to the same state regardless of order. That's the only way to actually catch last-edit-wins-edge-cases. Today, the safety net is that the sync touches sessions in a specific order (pull, then push, then deletions) and `syncVersion` only bumps on full success — so a partial failure leaves the system in a *known* state, not an unknown one. That's lower-quality assurance than tests, but it's the floor below which the system can't fall.

## The hard question

**"Your error UI is bad. Why ship?"**

> Because the offline path works, the data path is correct, and the failure modes I haven't UI'd are recoverable on retry. The Home screen rendering null on error is a real bug — a user who hits it sees a blank app and doesn't know why — but it's not a data-loss bug, and the next foreground will retry. Shipping with that gap was a deliberate trade against not shipping at all. The right next move (see chapter 12) is an `<ErrorBoundary>` that catches at the screen level and surfaces a "couldn't load — tap to retry" UI. That's a half-day of work I deferred. I'd rather defend the deferral honestly than dress it up — the bar I held was "no silent data loss", and the bar I missed was "every error path has a UI". Knowing that distinction is the thing I'd want a senior candidate to articulate.
