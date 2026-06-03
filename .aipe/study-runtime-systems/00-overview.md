# 00 — Overview

The repo's execution model in one frame.

## Verdict first

contrl runs on **one JS thread driving everything that is not pixels or camera frames**. Hermes JavaScript engine executes the React tree, the SQLite calls, the Supabase HTTP calls, the rep-counter math — all of it on a single event loop. The UI thread is RN's, owned by the platform. The vision-camera frame processor runs on a separate worker thread (via `react-native-mediapipe-posedetection`'s internal worklet) and hops back to the JS thread on every pose result.

The most consequential runtime fact: **there is no bounded work anywhere**. Every write in `src/services/database.ts` ends with `pushChanges().catch(() => {})` — fire-and-forget, no queue, no retry budget, no cancellation. That's not a small detail. It's the runtime story.

## The runtime in one picture

```
  contrl on-device runtime — three threads, one event loop

  ┌─ Device process (Hermes RN runtime) ────────────────────────────────┐
  │                                                                      │
  │  ┌─ JS thread (single event loop) ──────────────────────────────┐   │
  │  │                                                               │   │
  │  │   React render tree                                           │   │
  │  │      │                                                        │   │
  │  │      ├─► useState / useRef / useEffect                        │   │
  │  │      ├─► expo-sqlite Promise calls   ──┐                      │   │
  │  │      ├─► supabase fetch() Promise   ──┤                       │   │
  │  │      └─► setTimeout (500ms draft)   ──┤                       │   │
  │  │                                       ▼                       │   │
  │  │                            microtask + timer queues           │   │
  │  └────────────────▲──────────────────────────────────────────────┘   │
  │                   │  runOnJS callback                                 │
  │                   │  (one per pose result)                            │
  │  ┌─ Worker thread (worklets-core) ───────────┐                       │
  │  │   MediaPipe frame processor (GPU)         │                       │
  │  │   pose_landmarker_lite.task               │                       │
  │  │   ~30 fps frames in, landmark array out   │                       │
  │  └────────────────────────────────────────────┘                       │
  │                                                                       │
  │  ┌─ UI thread (RN platform) ─────────────────┐                       │
  │  │   layout, animations, native views        │                       │
  │  └────────────────────────────────────────────┘                       │
  │                                                                       │
  │         ┌──── shared resources ─────┐                                │
  │         │  contrl.db (SQLite WAL)   │  ← single file descriptor      │
  │         │  AsyncStorage (none used) │                                │
  │         │  Hermes managed heap      │  ← GC by Hermes, no tuning     │
  │         └────────────────────────────┘                                │
  └───────────────────────────────────────────────────────────────────────┘
                                  │  HTTPS (fetch)
                                  ▼
                          Supabase (reindb, contrl schema)
```

Three threads on-device. One DB file. One event loop. One process. That's the whole runtime.

## Ranked findings — what to look at first

Ordered by consequence, not severity. The top one is the one you'd surface in an interview as "what I'd fix first."

```
  1. fire-and-forget sync                            (07, 08)
     8 sites in database.ts call pushChanges().catch(()=>{}). No queue,
     no retry, no backoff, no cancellation. Network hiccup = silent
     data drift between local and Supabase.

  2. stale-closure workaround via refs               (04)
     useGameState mirrors user / gateProgress / weekProgress into refs
     to make logSession see "latest" state. Works, but the pattern
     leaks — every new piece of state owned by this hook will need
     the same mirror or the next bug recurs.

  3. restoreInProgress module flag                   (04)
     Coarse cross-call guard inside supabase-sync.ts. Acts as a
     non-reentrant lock for the pull-restore. Fine for a single
     restore, but it's a singleton — if a second pull ever races
     in (e.g. background refresh), the flag pattern silently fails.

  4. unbounded session/exercise scans on every push  (07)
     pushChanges() loads ALL sessions, ALL exercises, ALL gates,
     ALL weeks every call, then JS-filters by updated_at. At small
     N this is fine; the cost rises linearly with session history
     and the read sits on the JS thread.

  5. no cancellation in the camera pipeline          (07)
     onLandmarks fires roughly per frame. There's no AbortController,
     no "stop draining this set." Closing the modal relies on React
     unmounting PoseCamera; in-flight callbacks for one more frame
     after unmount are tolerated by the codebase.

  6. setTimeout-based draft autosave                 (03, 07)
     useExerciseForm runs a 500ms setTimeout debounce. No cleanup
     race today, but the timer holds a captured saveDraftRef and
     onSaveDraft closure. If onSaveDraft started doing real work
     it'd contend with the same JS thread as the rep counter.

  7. SQLite handle as module-level singleton         (06)
     let db: SQLiteDatabase | null in database.ts. Opened once,
     never closed. Fine on iOS/Android; would leak in the web
     build that contrl doesn't ship anyway.
```

Each gets a full walkthrough in its chapter; the audit (`08-...`) puts them in one place.

## Reading order

```
  00 ← you are here

  01  runtime-map                              the picture, with file refs
  ───
  02  processes-threads-and-tasks              who runs where
  03  event-loop-and-async-io                  the microtask story
  04  shared-state-races-and-synchronization   the ref pattern, restoreInProgress
  05  memory-stack-heap-gc-and-lifetimes       heap, retained closures
  06  filesystem-streams-and-resource-lifecycle the SQLite handle
  07  backpressure-bounded-work-and-cancellation the missing pieces
  ───
  08  runtime-systems-red-flags-audit          ranked risks with file:line
```

Each file uses the full `format.md` template — Zoom out, Structure pass, How it works (3 moves), Primary diagram, Implementation in codebase, Elaborate, Interview defense, Validate, See also.

## Not yet exercised

The eight things this codebase does NOT exercise — call them out, don't pretend they're there:

```
  ┌─────────────────────────────────────┬─────────────────────────────┐
  │ topic                               │ when it becomes relevant     │
  ├─────────────────────────────────────┼─────────────────────────────┤
  │ multiple application JS threads     │ if you offload heavy compute │
  │   (Worker, JSI background runtime)  │ (e.g. video encoding)        │
  │ AbortController for fetch / promise │ when sync calls grow         │
  │   cancellation                       │ retries with timeouts        │
  │ bounded concurrency / semaphore     │ when N parallel uploads      │
  │ explicit retry budget / circuit    │ when network gets flaky      │
  │   breaker                            │                              │
  │ streaming reads (createReadStream)  │ if you ever read large files │
  │ child_process / native subprocess   │ Expo managed; never          │
  │ GC tuning, --max-old-space-size     │ Hermes manages itself        │
  │ pre-allocated object pools          │ if rep counter ever GCs mid- │
  │                                      │ set (it doesn't today)       │
  └─────────────────────────────────────┴─────────────────────────────┘
```

Honest absence is the right move. The next sections explain *why* each is fine for now, and *what trigger* would change that.

## See also

- `01-runtime-map.md` — the same picture, but annotated against `package.json` and the real file tree
- `../study-system-design-dsa/` — where the boxes live (network boundary, storage boundary)
- `../study-database-systems/` — what's inside `contrl.db`
- `../study-testing/` — every claim here is currently unverified by automated tests
