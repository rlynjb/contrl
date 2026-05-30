# Chapter 5 — The failure story

The scale story is forward-looking. The failure story is operational. The question they're asking under "what happens when X fails" is: have you thought about the bad path, or only the happy path? Junior engineers describe what happens when everything works. Senior engineers describe what happens when the user is in airplane mode and the OS killed the app mid-write and the Supabase free tier is having a quiet outage.

contrl's local-first architecture inverts most of the standard failure surface. Network failures aren't failures — they're the default offline mode. The interesting failures are the ones that survive the local-first design: pose detection glitches, the pull-restore race, malformed input on rehydrate, partial writes from a force-quit. This chapter walks each one.

```
┌─ contrl's failure surfaces, with the system's response ──────────────────────────────────────┐
│                                                                                              │
│                                                                                              │
│   Network failure (push)                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  pushChanges() can't reach Supabase (airplane mode, weak cell, outage)    │    │
│   │ Response: logErr + return; local write stays committed; watermark NOT advanced     │    │
│   │ Recovery: next successful pushChanges() picks up everything since last watermark   │    │
│   │ User:     no visible impact; sync-status in Settings shows the gap                 │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
│   Pose detection glitch (low confidence / occluded joint)                                    │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  MediaPipe returns landmarks with low visibility (occlusion, bad lighting)│    │
│   │ Response: KNOWN GAP — FSM doesn't currently filter on visibility; angle is noisy  │    │
│   │ Recovery: exponential smoothing (α=0.4) absorbs single-frame noise; hysteresis     │    │
│   │           (10° on edges) prevents threshold flicker                                │    │
│   │ User:     occasional miscount on a half-occluded set; ground truth in debug HUD    │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
│   Pull-restore race (the race we already fixed)                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  pullRestoreIfFresh's per-row upserts trigger pushChanges (fire-and-      │    │
│   │           forget) before the watermark advances → re-push everything as old USER_ID│    │
│   │ Response: restoreInProgress flag at module scope blocks pushChanges during restore │    │
│   │           Watermarks set INSIDE try-finally BEFORE the flag clears                 │    │
│   │ Recovery: deterministic — next push after restore sees since=now, no re-push       │    │
│   │ User:     no visible impact; the bug used to duplicate rows under stale USER_ID    │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
│   Malformed sessions.exercises_json (corrupted on rehydrate)                                 │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  exercises_json column contains invalid JSON (manual edit, partial write) │    │
│   │ Response: KNOWN GAP — JSON.parse throws in rowToSession; not currently caught     │    │
│   │ Recovery: app crash on getSessions(); no graceful degrade                          │    │
│   │ User:     app fails to open until the corrupted row is removed manually            │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
│   Force-quit mid-write (partial write to drafts)                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  User swipes app away during a debounced autosave timer                   │    │
│   │ Response: Cleanup function fires (clearTimeout); the in-flight save is cancelled   │    │
│   │ Recovery: Up to 500ms of typed input is lost; the prior save is on disk            │    │
│   │ User:     occasionally re-types the last 5 reps from memory; acceptable trade      │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
│   Concurrent writes from a second device (Phase A: NOT designed for)                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│   │ Trigger:  Same USER_ID, two physical devices, both push concurrently               │    │
│   │ Response: Watermark-based last-writer-wins on (user_id, id) rows in Supabase       │    │
│   │ Recovery: One device's writes overwrite the other's for any row touched by both    │    │
│   │ User:     SILENT DATA LOSS — known limitation, Phase A is one-device-per-user      │    │
│   └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Six failure surfaces, six responses. Some are designed (network failure, force-quit, restore race). Two are known gaps the app currently doesn't handle (pose confidence, malformed JSON). One is a deliberate Phase-A non-feature (concurrent device writes). Be ready to talk about all three categories — the senior signal is being honest about which is which.

---

## 5.1 — What happens with no internet?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What happens when the user is offline?"                                      │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is the easiest local-first question; if you can't answer this cleanly,  │
│   the rest of the architecture defense is undermined. Strong answer: nothing    │
│   interesting happens. The app works. That's the whole point.                   │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Nothing visible happens. The app is fully functional offline because SQLite is the source of truth and Supabase isn't on the read path. Every screen renders, every write commits. The only thing that doesn't happen is `pushChanges` — it calls Supabase, catches the network error, logs it, and returns. The local write stays committed. The watermark — `last_pushed_at` in `sync_state` — doesn't advance. The next time the network comes back and `pushChanges` runs successfully, it picks up everything since the last watermark and pushes it in one batch. The UPSERT semantics on Supabase make this idempotent — re-pushing a row that was already pushed is a no-op.
>
> "The user sees nothing in the foreground. In Settings, there's a sync-status indicator that surfaces the `last_pushed_at` timestamp, so they can see the gap if they care to look. There's also a 'Sync now' button that calls `pushChanges` directly."

```
"What happens offline?"
        │
        ▼
Nothing visible; local writes commit; watermark holds; sync catches up on reconnect.
        │
        ├─► IF THEY ASK ABOUT WRITE LOSS
        │     "No write loss. Local SQLite commits are durable on disk
        │      via WAL — fsync at journal-commit time. The only data
        │      that could be lost is the last debounced-autosave-in-
        │      flight on a force-quit (up to 500ms of typed input).
        │      Sessions, gates, week progress — all durable."
        │
        ├─► IF THEY ASK ABOUT QUEUE BACKPRESSURE
        │     "No queue. Each pushChanges call is stateless — read the
        │      watermark, filter dirty rows, push, advance the
        │      watermark. There's no in-memory pending-writes queue
        │      to overflow. If the user is offline for a month, the
        │      next push reads `updated_at > last_pushed_at` and
        │      pushes a month of writes in one batch."
        │
        └─► IF THEY ASK ABOUT BATCH SIZE LIMITS
              "I haven't tested with thousands of pending writes.
               Supabase's REST API has a row limit per request. If
               that became a problem, the fix is paginating the push
               into chunks. Not currently necessary — single user,
               small session counts."
```

▸ "Nothing happens" is a feature, not a hedge. Local-first means offline isn't a failure mode; it's the default mode.

---

## 5.2 — What if MediaPipe glitches?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What happens when the pose detection is wrong — bad lighting, the user's    │
│    elbow is occluded?"                                                          │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand the failure modes of the CV pipeline you built? Are you     │
│   honest about the gaps you haven't closed?                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Two layers of defense plus a known gap. The first defense is exponential smoothing with α=0.4 on the angle — single-frame noise gets absorbed because the smoothed value only moves 40% of the way toward each new sample. The second defense is hysteresis: every FSM transition requires the angle to commit past the threshold by 10°. A jittery angle hovering at the boundary doesn't flicker transitions; it requires real commitment.
>
> "The known gap is that the FSM doesn't filter on confidence. MediaPipe returns a `visibility` field per landmark, 0 to 1. If a joint is occluded — your phone's at an angle, the elbow is behind your torso — visibility drops to ~0.3 and the angle calculation is essentially noise on a bad guess. The smoother absorbs some of it, but a persistently low-confidence joint produces a steady wrong angle, which can trigger transitions at the wrong moments.
>
> "I haven't fixed this yet. The fix is a one-liner: at the FSM input, check the average visibility of the relevant joints; if it's below 0.5, skip the update and keep the last smoothed angle. The reason it isn't in yet is that on visible joints in normal lighting, the smoother + hysteresis combination is good enough for the test setups I've used. I'd add the confidence gate before shipping to users who don't know to position their phone carefully.
>
> "Past that: persistently bad lighting would still degrade. The fix there isn't software — it's the user, and the debug HUD on screen during a workout surfaces the average visibility so the user can adjust the camera angle."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "The smoothing handles  │ "Two designed defenses          │
│ noise, and there's      │ (smoothing α=0.4, hysteresis    │
│ hysteresis on the rep   │ 10°) absorb most jitter. Known  │
│ counter so it doesn't   │ gap: FSM doesn't filter on the  │
│ flicker. It's pretty    │ MediaPipe visibility field —    │
│ robust."                │ low-confidence joints produce   │
│                         │ steady wrong angles. Fix is a   │
│                         │ one-line guard at FSM input.    │
│                         │ Not in yet because visible      │
│                         │ joints work in test conditions; │
│                         │ would add before user release." │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Pretty robust" is the  │ Specific defenses with specific │
│ marketing tell. Names   │ values (α=0.4, 10°). Names the  │
│ defenses but no values. │ exact gap (visibility field).   │
│ Doesn't acknowledge any │ Owns the gap and the fix.       │
│ gap. A senior            │ Names *why* the gap is open    │
│ interviewer hears       │ (works in test conditions) —    │
│ "candidate hasn't       │ not "we forgot."                │
│ thought about failure." │                                 │
└─────────────────────────┴─────────────────────────────────┘

▸ Owning a known gap is a senior signal. Pretending one doesn't exist is the failure pattern.

---

## 5.3 — Two devices, same user — what wins?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Two devices, same user, both online, both editing the same session.         │
│    Which one wins?"                                                              │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Did you design for multi-device, or did you only think about one user one    │
│   device? Are you honest about which? This is the question that catches         │
│   candidates who claim "local-first" without thinking through the CRDT problem.│
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Last-writer-wins at the row level, and Phase A is explicitly designed for one device per user. That's a deliberate scope, not a bug — but I should walk through what actually happens, not pretend it can't.
>
> "The watermark-based push uses `(user_id, id)` as the conflict key. Both devices stamp the same USER_ID; if both write to session-`abc` with different `updated_at` timestamps, the later one wins on Supabase. The earlier write's local row stays locally on its device until the next pull-restore, but pulls only fire on a fresh install — so the earlier device just diverges from Supabase silently. There is no merge.
>
> "This is silent data loss in the multi-device case. I know that. The Phase A scope is one device per user, and I'm explicit about it. Phase B's multi-device work is a different design — CRDTs or per-row vector clocks for true convergence, or last-writer-wins with explicit user-visible conflict UI for the rare collision case. Not started, not designed in detail, scoped only at the level of 'I know what the work would be.'
>
> "What I'd build first, if multi-device became a feature: per-record vector clocks on the synced tables. Each device increments its clock for each write; pulls reconcile by clock-vector comparison. The schema would need a vector field per row; the merge logic would live in the sync engine, not in the writers."

```
"Two devices, same user — what wins?"
        │
        ▼
Last-writer-wins via watermark. Phase A is one-device-per-user. Silent data loss in collisions.
        │
        ├─► IF THEY PRESS ON DESIGN INTENT
        │     "Phase A scope was explicit: single user, single device,
        │      no auth. The full design — auth + RLS + multi-device
        │      reconciliation — is Phase B / Phase C work. I'm not
        │      pretending the current code handles multi-device; I'm
        │      saying the scope didn't include it."
        │
        ├─► IF THEY ASK ABOUT CRDTs
        │     "I haven't implemented CRDTs in production. The shape I
        │      know is: per-record vector clocks, merge by clock
        │      comparison, conflict resolution per data type — append-
        │      only sets are easy (just union), counters are easy
        │      (sum the deltas), arbitrary records are hard. Sessions
        │      would be append-only-ish; gate_progress would need a
        │      deliberate merge policy."
        │
        └─► IF THEY ASK "WOULD YOU HAVE DONE IT DIFFERENTLY"
              "No for Phase A. Multi-device would have been the
               majority of Phase A's engineering work for a feature I
               wasn't shipping. The Phase B migration path is clear:
               schema is multi-tenant-ready, the sync engine is the
               file that changes."
```

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They drill into CRDT semantics: "Walk me through how you'd merge            ║
║   two divergent gate_progress states. State the merge function."              ║
║                                                                               ║
║   You have not designed this. The Phase B handoff is "vector clocks,         ║
║   merge per data type" — you do not have the merge function for                ║
║   gate_progress specifically.                                                  ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't designed the gate_progress merge specifically. The              ║
║    shape I'd start with: gate_progress is derivable from sessions, so         ║
║    the merge function for it can be 'take the union of contributing           ║
║    sessions, replay through the gate evaluation, write the result.'           ║
║    That avoids merging the derived state directly — I merge the              ║
║    inputs and re-derive. But I haven't worked through the edge cases          ║
║    where two devices have different consecutivePasses values. Want to         ║
║    work through it together?"                                                 ║
║                                                                               ║
║   What this signals:                                                          ║
║   - you have a starting move (merge the inputs, re-derive),                   ║
║   - you've named the edge case you don't have a clean answer for,             ║
║   - you invite collaborative problem-solving instead of bluffing.             ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Yeah, you'd probably do like a... merge based on timestamps and             ║
║    take the highest one? Or maybe combine them somehow."                      ║
║   Half-designed CRDT semantics on the spot is the surest way to                ║
║   signal "I'm guessing at this level."                                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ "Silent data loss in this case, deliberately out of Phase A scope" is the senior answer. "It probably works somehow" is the failure.

---

## 5.4 — The pull-restore race (the bug you actually fixed)

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What's the worst bug you fixed in this codebase?"                            │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you have a real story? Can you walk through the symptoms, the cause,      │
│   and the fix at the right level of detail? Chapter 6 covers this more         │
│   broadly; this section is the failure-story angle of the same bug.            │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The pull-restore race. Symptoms: on a reinstall, the user's data appeared correctly for a moment, then duplicated under a stale USER_ID. I'd reinstall the app, watch `pullRestoreIfFresh` populate SQLite from Supabase, see the home screen render correctly — and then notice extra rows in Supabase tagged with the *old* USER_ID after the next push cycle.
>
> "The cause was an order-of-operations bug. `pullRestoreIfFresh` calls `db.upsertExercise`, `db.insertSession`, etc., to write the pulled rows into local SQLite. Every one of those writers has a fire-and-forget `pushChanges().catch(() => {})` at the end. So as the restore wrote rows to SQLite, each write triggered a `pushChanges` — and that `pushChanges` ran with `since = null` because the `last_pushed_at` watermark hadn't been advanced yet. The result was N concurrent pushes, each pushing 'everything since null' under whatever USER_ID was current.
>
> "The fix is two-part. First, a module-scope `restoreInProgress` flag in `supabase-sync.ts`. `pushChanges` checks the flag at the top and returns immediately if set. Second, the watermark calls — `setLastPulledAt(now)` and `setLastPushedAt(now)` — happen *inside* the try block, *before* the `finally` clears the flag. So when the flag clears and normal pushes resume, the watermark is already set to `now`, and the restore-written rows are older than `now` — they don't qualify for push.
>
> "What I'd do differently: I'd decouple the writers from the sync engine. Today every writer in `database.ts` knows about `pushChanges` and calls it. A cleaner shape is: writers emit events to a queue; the sync engine subscribes to the queue and can be paused during restore. Then the flag isn't needed — pausing the queue is the same mechanism. I left it as-is because the flag works and the refactor is real scope. But it's on the list."

▸ The bug that taught the architecture is the bug you can defend with the most specificity.

---

## What you'd change

If you were re-doing the failure-handling story from scratch today, the change that matters most is **gating malformed JSON in `rowToSession`**. Today, if `exercises_json` contains invalid JSON for any reason — a partial write, a manual edit, an OS-level filesystem hiccup — `JSON.parse` throws inside `rowToSession`, and the throw propagates through `getSessions` and crashes the app on open. There is no graceful degrade.

The fix is a try-catch around the parse: on parse failure, log the corrupt row's ID, skip it from the returned array, and continue. The user sees one missing session in their history; the app still opens. That's the strictly better failure mode.

This and the pose-confidence gating are the two known gaps. Both are one-liner fixes; both have stayed open because they haven't been triggered in test. They go in before any public ship.

▸ Two one-line fixes are open. They're known. They go in before user release.

---

## One-page summary

**Core claim:** Local-first inverts the standard failure surface — network failure is the default mode, not the bad case. The interesting failures are the ones that survive local-first: pose-detection glitches, the pull-restore race (fixed), malformed JSON (known gap), force-quit during autosave (designed), concurrent device writes (deliberate Phase A non-feature).

**Questions covered:**
- "What happens offline?" → Nothing visible. Local writes commit; watermark holds; sync catches up on reconnect; idempotent UPSERTs make replay safe.
- "What if pose detection glitches?" → Smoothing + hysteresis catch most jitter; known gap is no confidence filter at FSM input; one-line fix.
- "Two devices, same user?" → Last-writer-wins, silent data loss on collision, Phase A is one-device-per-user by design. Phase B needs CRDTs.
- "What's the worst bug?" → The pull-restore race. Concurrent pushes during restore wrote rows under stale USER_ID. Fixed with `restoreInProgress` flag + watermark-inside-try.
- "What about the CRDT merge semantics?" → "I haven't designed gate_progress merge specifically; my starting move is merge-the-inputs-re-derive. Want to work through it together?"

**Pull quotes:**
- "'Nothing happens' is a feature, not a hedge. Local-first means offline isn't a failure mode; it's the default mode."
- "Owning a known gap is a senior signal. Pretending one doesn't exist is the failure pattern."
- "The bug that taught the architecture is the bug you can defend with the most specificity."
- "Two one-line fixes are open. They're known. They go in before user release."

**What you'd change:** Add a try-catch around `JSON.parse` in `rowToSession` (graceful degrade on corrupt `exercises_json`), and the confidence gate at the FSM input. Both one-liners, both shipping before any user release.
