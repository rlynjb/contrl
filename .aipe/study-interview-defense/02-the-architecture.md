# Chapter 2 — The architecture

After the pitch, the next thing every senior interviewer asks is "walk me through the system." This chapter is about drawing contrl on a whiteboard from scratch, in ninety seconds, with confidence, with the labeling correct, and with the request flow walked end-to-end. The diagram is the spine. Every defense in the next six chapters returns to a slice of it.

You will get interrupted. Plan for it. The good interviewer won't let you finish the diagram before they start probing. This chapter teaches you both the canonical walk *and* the interrupt pattern — what to say when they jump in early.

```
┌─ The contrl architecture you draw on the whiteboard ─────────────────────────────────────────┐
│                                                                                              │
│  ┌─ UI layer — React Native + Expo (SDK 55), expo-router file-based routing ───────────────┐ │
│  │                                                                                          │ │
│  │   app/_layout.tsx  ──►  GameStateContext  ──►  hooks (useGameState, useExerciseForm)     │ │
│  │   app/(tabs)/index.tsx      home / skill tree                                            │ │
│  │   app/log/[category]/...    log-workout flow                                             │ │
│  │   app/settings/             sync status + manual sync                                    │ │
│  └────────────────────┬─────────────────────────────────────────────────────────────────────┘ │
│                       │  reads + writes through hooks                                          │
│                       ▼                                                                        │
│  ┌─ Domain layer — pure functions, no I/O ──────────────────────────────────────────────────┐ │
│  │                                                                                          │ │
│  │   src/lib/game/                                                                          │ │
│  │     gate-check.ts        was this session clean? did the gate pass?                      │ │
│  │     progression.ts       level-up check, MAX_LEVEL = 5                                    │ │
│  │     reconstruct.ts       idempotent replay of session history                            │ │
│  │     week-progress.ts     Monday-start week derivation                                     │ │
│  │     streaks.ts           fold-with-reset over week history                                │ │
│  │                                                                                          │ │
│  │   src/hooks/useGameState.ts  orchestrates load → reconstruct (if fingerprint) → state    │ │
│  └────────────────────┬─────────────────────────────────────────────────────────────────────┘ │
│                       │                                                                        │
│                       ▼                                                                        │
│  ┌─ Storage layer — SQLite, WAL mode, source of truth ──────────────────────────────────────┐ │
│  │                                                                                          │ │
│  │   src/services/database.ts                                                               │ │
│  │     getDatabase()  L17  · migrate()  L25  · seedExercisesIfEmpty()  L214                  │ │
│  │                                                                                          │ │
│  │   tables (9):                                                                            │ │
│  │     user_profile · exercises · sessions · gate_progress · week_progress                  │ │
│  │     drafts · sync_deletions · sync_state · sync_meta                                     │ │
│  │           5 synced ──────────────────┘  └──── 4 local-only ────────────                  │ │
│  └────────────────────┬─────────────────────────────────────────────────────────────────────┘ │
│                       │  pushChanges() fires on every write (fire-and-forget)                  │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                    Network boundary (HTTPS, optional)                                          │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                       ▼                                                                        │
│  ┌─ Cloud mirror — Supabase Postgres (reindb project, contrl schema) ─────────────────────┐  │
│  │                                                                                         │  │
│  │   src/services/sync/                                                                    │  │
│  │     client.ts       anon-key client, db: { schema: 'contrl' }                           │  │
│  │     supabase-sync.ts                                                                    │  │
│  │       pushChanges()        L34   watermark push: updated_at > last_pushed_at            │  │
│  │       pullRestoreIfFresh() L130  one-shot restore on fresh install                      │  │
│  │     mapper.ts       row ↔ domain shape                                                  │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│   ──────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│  ┌─ Capture pipeline — parallel, on-device, no network ────────────────────────────────────┐ │
│  │                                                                                          │ │
│  │   Camera ──► MediaPipe (GPU)  ──► JS callback  ──► per-exercise processor ──► FSM        │ │
│  │   30 fps   pose_landmarker_      33 landmarks/    average + smooth(α=0.4)    rep count++ │ │
│  │            lite.task              frame, ~528B    hysteresis 10° on edges                │ │
│  │                                                                                          │ │
│  │   src/components/camera/PoseCamera.tsx · src/lib/pose/{angles,rep-counter,exercises}     │ │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

That is the whole machine in one picture. Five layers (UI, domain, storage, network, cloud) plus a parallel capture pipeline that bypasses the network entirely. When you draw this on a whiteboard you draw the five-layer stack first; the capture pipeline goes as a parallel side-arm because it's structurally separate from the data layer.

---

## The 90-second walk

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Walk me through the architecture."                                           │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Can you talk about layers, boundaries, and request flow with the right        │
│   level of abstraction — or do you list components? A senior candidate names    │
│   each layer's *job* (UI renders; domain decides; storage persists; cloud       │
│   mirrors) and the data flow between them. A junior candidate lists files.      │
└─────────────────────────────────────────────────────────────────────────────────┘

Say (drawing as you go):

> "Five layers, plus a parallel capture pipeline.
>
> "The **UI layer** is React Native with Expo and file-based routing through expo-router. The screens read state from a `GameStateContext` and write through hooks like `useGameState` and `useExerciseForm`.
>
> "The **domain layer** is pure functions in `src/lib/game/` — gate checks, progression, week derivation, streak folds. The hub is `useGameState`, which orchestrates the load: read from SQLite, detect a reinstall fingerprint, and replay history through `reconstructFromSessions` if needed. None of this is async with anything outside the device.
>
> "The **storage layer** is SQLite in WAL mode. Nine tables — five entity tables that sync (user_profile, exercises, sessions, gate_progress, week_progress) and four local-only ones (drafts, sync_deletions, sync_state, sync_meta). SQLite is the source of truth. Every read in the app goes here. Writes commit here first.
>
> "Below the **network boundary**, the **cloud mirror** is Supabase Postgres. The sync engine in `src/services/sync/supabase-sync.ts` has two functions: `pushChanges` runs on every write, watermark-based, fire-and-forget; `pullRestoreIfFresh` runs once per install lifetime, only when the local DB is empty.
>
> "And then **the parallel capture pipeline** — completely separate from the data layer. `react-native-vision-camera` captures frames; the `react-native-mediapipe-posedetection` wrapper runs `pose_landmarker_lite` on the GPU at about 30 fps; the JS callback hands 33 landmarks per frame to a per-exercise processor that averages symmetric joints, exponentially smooths the angle, and feeds it to a five-state FSM with 10° hysteresis. That FSM emits the rep count. Nothing in this pipeline ever crosses the network."

That's ~250 words, 90 seconds spoken. The shape is the diagram — every layer named, every layer's *job* named, every data-flow direction named. You should be able to deliver it while drawing five labeled boxes plus a side-arm, and the diagram should match the script.

---

## Where they'll interrupt

```
You're drawing the storage layer (clause three).
        │
        ▼
They interrupt with one of these — be ready for each:
        │
        ├─► "Why SQLite as the source of truth?"
        │     Pivot to Chapter 3 → "Why SQLite-as-source-of-truth?" section.
        │     90 seconds. End with "want to dig into sync, or back to the
        │     diagram?"
        │
        ├─► "What's WAL mode?"
        │     Short tactical answer. "Write-ahead-log. Writers append to a
        │     log; readers see the last committed snapshot. Mobile-critical
        │     because the UI thread is constantly reading; without WAL the
        │     skill tree would stutter on every write."
        │     Then: "It's a one-line PRAGMA at migration time —
        │     `PRAGMA journal_mode = WAL` at `database.ts` L27."
        │
        ├─► "Wait — Supabase is your backend?"
        │     Correct framing immediately: "Supabase is the cloud *mirror*,
        │     not the backend. The app has no backend, and Supabase isn't
        │     on the read path. SQLite is the source of truth; Supabase
        │     receives writes for restore-on-reinstall." Pivot to the sync
        │     engine briefly, then offer to dig in.
        │
        └─► "Why no auth?"
              Phase A is single-tenant by design. Hardcoded USER_ID.
              "Phase A is a single-user MVP. The schema is already
              multi-tenant-ready — composite (user_id, id) primary keys
              everywhere — but RLS is off and the USER_ID is a constant.
              Phase B work is real auth + RLS, not a schema change."
              Don't apologize for this. It's a deliberate tradeoff.
```

The interrupt pattern is the same every time: **answer fully, then offer two paths forward**. Never let them lead you out of the architecture before you've offered to come back to it. That's the senior move — you stay on your feet, you stay in conversation, you don't lose track of where you were.

▸ The 90-second walk is a path through the diagram. Interrupts are detours. Always offer the way back to the path.

---

## The "show me the request flow" follow-up

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Walk me through what happens when the user logs a workout."                  │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Can you trace a single request end-to-end? Do you know what happens at        │
│   each layer? Where are the side effects? This is the system-design version     │
│   of "what does this code do" — they want the answer at the abstraction         │
│   level of the diagram, not "well I have this useState that..."                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "User taps a checkbox on the log screen. Three things happen, in order:
>
> "**One — the UI updates optimistically.** `useExerciseForm` updates its React state, the form re-renders, the checkbox shows checked. This is the optimistic-UI half-millisecond.
>
> "**Two — the autosave timer fires.** `useExerciseForm` has a 500ms-debounced effect that calls `saveDraft` on the `drafts` table. Every keystroke schedules a `setTimeout`; the previous timer is cleared on each new change, so only the last typed change in any 500ms window writes to disk. The draft table is keyed by `draft:${category}:${level}` — one draft per active log flow.
>
> "**Three — when the user hits Save** at the end of the workout, `logSession` runs end-to-end: insert the row into `sessions`, update `gate_progress` in place (increment `consecutivePasses` if the session was clean, reset to zero if not), check whether the gate has hit three consecutive passes and advance the level if so, update `week_progress` for the current Monday-anchored week, delete the draft, and fire-and-forget `pushChanges` to Supabase.
>
> "The pushChanges call doesn't block. It runs in the background. If the network is gone, the local write is committed; the next successful push will catch up via the `last_pushed_at` watermark."

That's the request flow at the right altitude. Five sentences, three layers crossed, every side effect named. The interviewer can drill into any of them; you're prepared because you've walked each in the chapters that follow.

┌─────────────────────────┬─────────────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                           │
├─────────────────────────┼─────────────────────────────────────────┤
│ "So when you tap the    │ "Three things happen in order: optim-   │
│ checkbox the state      │ istic UI update, a 500ms-debounced      │
│ updates and there's     │ autosave to the `drafts` table, then    │
│ also like an autosave   │ at Save time the full pipeline —        │
│ thing that saves it,    │ insert into sessions, update gate_      │
│ and then when you save  │ progress in place, level-up check,      │
│ the workout it gets     │ update week_progress, delete the draft, │
│ added to the database   │ fire-and-forget push to Supabase. The   │
│ and synced to the cloud │ push doesn't block; offline writes      │
│ if it's online."        │ catch up on the next successful sync."  │
├─────────────────────────┼─────────────────────────────────────────┤
│ Why it's weak:          │ Why it works:                           │
│ "Like an autosave thing │ Numbered steps. Each step names the     │
│ that saves it" — three  │ side effect at a single table. Every    │
│ words of filler signal  │ noun is a real thing in the codebase.   │
│ you don't remember the  │ The "doesn't block / catches up" line   │
│ debounce. "Gets added"  │ is the senior-level concern — it shows  │
│ is passive — what does  │ you thought about failure modes.        │
│ the adding. "If it's    │                                         │
│ online" hides the       │                                         │
│ watermark mechanism.    │                                         │
└─────────────────────────┴─────────────────────────────────────────┘

Two patterns separate the strong from the weak. First, **enumerated steps with verbs** — "insert into sessions, update gate_progress, level-up check, update week_progress, delete the draft, push." Each verb is doing something specific. Second, **the senior tell at the end** — "doesn't block; offline writes catch up on the next successful sync." That sentence costs you nothing to add and signals you thought about the failure path.

┃ "Every defense names the side effect at the smallest scope that's true."

---

## The "where does state live" follow-up

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Where does state live? Is it in React, in SQLite, in Supabase?"              │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is the cleanest probe for the single-source-of-truth question. The      │
│   strong answer names the rule, names the exceptions honestly, and names        │
│   what's derived. The weak answer says "uh, kinda everywhere."                  │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "SQLite is the source of truth. Every read in the app reads from SQLite. Writes commit to SQLite first.
>
> "React state is a render-time projection — `useGameState` reads from SQLite, holds the result in React state, and re-reads after every sync or save. The React state is *never* authoritative; it's a cache.
>
> "Supabase holds a mirror of five entity tables. It receives writes via pushChanges but the app never reads from Supabase except in one scenario: a fresh install. On a fresh install, `pullRestoreIfFresh` selects from all five tables once and writes the results to local SQLite. After that one-shot pull, Supabase is read-only from the app's perspective.
>
> "Derived state — gate progress, week progress, streaks — is also pushed to Supabase, but only as a convenience for restore. The recompute path lives in `reconstructFromSessions` and runs as a fallback if Supabase is unreachable on first install. So gates are technically derivable from sessions; we just store the derivation locally and mirror it for restore-speed."

That's the whole answer in four short paragraphs. The first sentence is the rule. The next three are the honest exceptions (React state is a cache; Supabase is read-once-on-install; derived state is mirrored as convenience). No hedging. No "kind of."

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They probe into MediaPipe internals: "How does pose_landmarker_lite         ║
║   actually work? What's the model architecture?"                              ║
║                                                                               ║
║   You haven't read the BlazePose paper. You picked the lite variant           ║
║   on the operational defaults: small file, GPU-delegate-friendly,             ║
║   30 fps in practice.                                                         ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't gone deep into the model architecture — pose_landmarker_         ║
║    lite is the production-ready MediaPipe BlazePose variant, around 5 MB,    ║
║    GPU-delegate-friendly. I picked it because it hit 30 fps on a              ║
║    mid-range Android with the GPU delegate, and that's the constraint        ║
║    that drove the choice. If you want to dig into the model side, can         ║
║    you start me off?"                                                         ║
║                                                                               ║
║   What this signals:                                                          ║
║   - clear about what drove the choice (operational defaults at the           ║
║     latency budget),                                                          ║
║   - clear about the scope of your own knowledge (didn't read the              ║
║     paper),                                                                   ║
║   - invites collaborative dig-in rather than freezing.                        ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "It's a deep learning model, I think it uses some kind of regression       ║
║    on the keypoints, with like a heatmap or something..."                     ║
║   Hedging in someone else's territory is a hard fail.                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝

The right answer here is precise about *your* layer (the operational defaults that drove the choice) and explicit that you didn't go deeper. Engineers who can name their own layer's depth correctly are senior signals; engineers who pretend to know neighboring layers fail fast.

---

## What you'd change

If you were redrawing the architecture from scratch today, the one structural choice you'd revisit is **whether to colocate the sync engine with the database module**. Right now, `src/services/database.ts` and `src/services/sync/supabase-sync.ts` are siblings — both at the same level — and database.ts has fire-and-forget calls into the sync module at the bottom of every writer. That coupling is what required the `restoreInProgress` flag in supabase-sync.ts (the writers fire pushChanges during restore, which has to be gated). A cleaner shape would be: database.ts emits write events to a queue; the sync engine subscribes to the queue. The restore race would then be naturally gated by pausing the queue during restore, instead of by a module-scope flag.

You wouldn't change the *layers*. The five-layer architecture is correct for the project. You'd change one internal coupling.

▸ The architecture is right. The sync coupling is the part that has scar tissue.

---

## One-page summary

**Core claim:** contrl is five layers (UI, domain, storage, network, cloud) plus a parallel capture pipeline that bypasses the network. SQLite is the source of truth; Supabase is a write-mostly mirror; React state is a cache. The capture pipeline runs entirely on-device.

**Questions covered:**
- "Walk me through the architecture." → 90-second walk, five layers + the side-arm capture pipeline.
- "What's WAL mode?" → Write-ahead log; readers don't block on writers; PRAGMA at L27 of migrate().
- "Wait, Supabase is your backend?" → Correct the framing: cloud *mirror*, not backend; one-shot pull on install only.
- "Walk me through what happens when the user logs a workout." → Optimistic UI → 500ms debounced autosave → at Save: full pipeline + fire-and-forget push.
- "Where does state live?" → SQLite is the source of truth; React state is a render cache; Supabase is a mirror.
- "How does pose_landmarker_lite work?" → "I haven't gone deep; picked on operational defaults at the latency budget. Want to dig in?"

**Pull quotes:**
- "The 90-second walk is a path through the diagram. Interrupts are detours. Always offer the way back to the path."
- "Every defense names the side effect at the smallest scope that's true."
- "The architecture is right. The sync coupling is the part that has scar tissue."

**What you'd change:** Decouple the sync engine from the database module — have writes emit events to a queue that the sync engine subscribes to, instead of fire-and-forget calls at the bottom of every writer. Would remove the need for the `restoreInProgress` flag.
