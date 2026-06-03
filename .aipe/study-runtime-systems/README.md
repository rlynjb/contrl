# Study — Runtime Systems

The execution model inside contrl: where work runs, what resources it owns, and what breaks under concurrency or overload. This is the guide that explains *the machine the code runs on* — Hermes, the JS thread, the UI thread, the vision-camera worker thread, the event loop, the SQLite handle, the React heap.

If `study-system-design` is "where the boxes live" and `study-database-systems` is "what's inside the storage box," this guide is "how a single CPU plus a single JS thread actually executes the code those boxes describe."

## Reading order

```
  ┌─ orient ─────────────────────────────────────────────────────┐
  │  00-overview.md                ← repo runtime in one diagram │
  │  01-runtime-map.md             ← who runs what, on which thread│
  └──────────────────────────────────────────────────────────────┘
  ┌─ understand ─────────────────────────────────────────────────┐
  │  02-processes-threads-and-tasks.md     ← JS/UI/worker layout │
  │  03-event-loop-and-async-io.md         ← microtasks + I/O    │
  │  04-shared-state-races-and-synchronization.md ← stale closures│
  │  05-memory-stack-heap-gc-and-lifetimes.md ← Hermes heap + refs│
  │  06-filesystem-streams-and-resource-lifecycle.md ← sqlite handle│
  │  07-backpressure-bounded-work-and-cancellation.md ← red zone │
  └──────────────────────────────────────────────────────────────┘
  ┌─ defend ─────────────────────────────────────────────────────┐
  │  08-runtime-systems-red-flags-audit.md ← ranked risks        │
  └──────────────────────────────────────────────────────────────┘
```

Read 00 → 01 for the map. Then the six concept files in order — each one earns its place against real files in `src/`. Finish on the audit; the audit only lands once you've seen the mechanism walks.

## What this guide is anchored to

Concrete file evidence, every claim:

- `src/services/database.ts` (679 LOC) — the SQLite handle, 9 tables, the 8 fire-and-forget `pushChanges()` sites
- `src/components/camera/PoseCamera.tsx` (225 LOC) — `MediapipeCamera` from `react-native-mediapipe-posedetection`, which runs the frame processor as a worklet on a separate worker thread and hands results back to the JS thread via `onResults`
- `src/components/camera/SetCameraOverlay.tsx` — the frame consumer; uses `useRef` and `performance.now()` for per-frame timing
- `src/hooks/useGameState.ts` (333 LOC) — three `useRef` mirrors (`userRef`, `gateProgressRef`, `weekProgressRef`) used to dodge React's stale-closure trap inside `logSession`
- `src/services/sync/supabase-sync.ts` (196 LOC) — module-scoped `restoreInProgress` boolean used as a coarse lock around `pullRestoreIfFresh`
- `src/hooks/useExerciseForm.ts` (187 LOC) — 500 ms `setTimeout` debounce for the draft autosave
- `app/_layout.tsx` — `pullRestoreIfFresh().then(pushChanges)` chain on app ready

## Not yet exercised — honestly named

```
  ┌──────────────────────────────┬────────────────────────────────┐
  │ topic                        │ status in contrl                │
  ├──────────────────────────────┼────────────────────────────────┤
  │ multiple JS threads / Workers│ not yet exercised (1 JS thread) │
  │ AbortController / signals    │ not yet exercised (0 usages)    │
  │ bounded queues / semaphores  │ not yet exercised (fire-and-    │
  │                              │ forget everywhere)              │
  │ explicit GC tuning           │ not yet exercised (Hermes mgmt) │
  │ streaming filesystem I/O     │ not yet exercised (no fs reads) │
  │ child processes / native     │ not yet exercised (Expo managed)│
  │   subprocess control          │                                │
  │ retry budget / circuit break │ not yet exercised               │
  └──────────────────────────────┴────────────────────────────────┘
```

Each absence becomes relevant the moment something specific in the product needs it. The audit (`08-runtime-systems-red-flags-audit.md`) ranks which absences are already costing you.

## Cross-links

This guide leans on its siblings instead of restating them:

- `../study-database-systems/` — what `expo-sqlite` is doing *inside* the handle; WAL semantics, the actual SQL plans. Runtime systems just owns "this thread holds an open file descriptor and serializes async calls through it."
- `../study-system-design-dsa/` — where the boxes live and which one talks to which. Runtime systems covers what each box runs *as* on the device.
- `../study-networking/` — the Supabase HTTP layer's retry, timeout, and pooling story. Runtime systems just owns "the request comes from a Promise on the JS thread, fire-and-forget, no cancellation token."
- `../study-testing/` — none of the runtime behavior described here has a test asserting it. Every "this races" claim in this guide is currently load-bearing on manual QA.

## The single question that ties it all together

```
                 ┌─────────────────────────────────────────┐
                 │ where does work execute, what resources │
                 │ does it own, and what breaks under      │
                 │ concurrency or overload?                │
                 └─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       what runs where      what's shared           what's bounded
       (threads, tasks)     (state, handles)        (queues, signals)
              │                     │                     │
        chap 02, 03            chap 04, 05, 06       chap 07
```

Hold that question still as you read. Every concept file answers one slice of it.
