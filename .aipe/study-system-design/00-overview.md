# 00 — Architecture map

The whole system in one frame. Components, what each owns, what it talks to. The reader who skims only this file knows what contrl is.

```
  contrl — local-first fitness app, single user, on-device ML

  ╔════════════════════════════════════════════════════════════════════════╗
  ║  UI layer — expo-router + React Native (Hermes, Fabric)                ║
  ║  app/_layout.tsx · app/(tabs)/* · app/log/* · app/settings/*           ║
  ║  src/components/ui/* · src/components/camera/*                          ║
  ║  styling: nativewind + tailwindcss                                      ║
  ╚════════════════════════╤═══════════════════════════════════════════════╝
                           │  uses
  ╔════════════════════════▼═══════════════════════════════════════════════╗
  ║  Hooks layer — orchestration                                            ║
  ║                                                                          ║
  ║  src/hooks/useDatabase.ts        DB readiness                            ║
  ║  src/hooks/useExercises.ts       exercise catalog (one-shot fetch)       ║
  ║  src/hooks/useExerciseForm.ts    in-progress session draft               ║
  ║  src/hooks/useGameState.ts ★     6 state slices + 3 refs; logSession()  ║
  ║                                                                          ║
  ╚════════════════════════╤═══════════════════════════════════════════════╝
                           │  calls
  ╔════════════════════════▼═══════════════════════════════════════════════╗
  ║  Domain layer — pure functions over typed state                         ║
  ║                                                                          ║
  ║  src/lib/game/                  src/lib/pose/                            ║
  ║    gate-check.ts                  angles.ts (calculateAngle, smoothAngle)║
  ║    progression.ts                 rep-counter.ts (5-phase FSM)           ║
  ║    reconstruct.ts                 landmarks.ts                            ║
  ║    streaks.ts                     exercises/{pushup,squat,plank,...}.ts  ║
  ║    week-progress.ts                                                       ║
  ║                                                                          ║
  ╚════════════════════════╤═══════════════════════════════════════════════╝
                           │  reads / writes through
  ╔════════════════════════▼═══════════════════════════════════════════════╗
  ║  Persistence layer — SQLite (source of truth)                          ║
  ║                                                                          ║
  ║  src/services/database.ts (679 LOC)                                     ║
  ║    PRAGMA journal_mode=WAL                                              ║
  ║    9 tables: user_profile, exercises, sessions, gate_progress,          ║
  ║              week_progress, drafts, sync_deletions, sync_state, sync_meta║
  ║    migrate() — 9 sequential ops, no transaction wrapping                 ║
  ║    CRUD per table; every write fires pushChanges().catch() (8 sites)    ║
  ║                                                                          ║
  ╚═════════════╤══════════════════════════════════════════════════════════╝
                │ mirrors to (eventual, fire-and-forget today)
  ╔═════════════▼══════════════════════════════════════════════════════════╗
  ║  Sync layer — Supabase mirror                                           ║
  ║                                                                          ║
  ║  src/services/sync/                                                     ║
  ║    client.ts        createClient(URL, anon_key)                          ║
  ║    config.ts        env vars + hardcoded USER_ID (Phase 2A)              ║
  ║    mapper.ts        local ↔ remote field renames (10 functions, any)    ║
  ║    supabase-sync.ts pushChanges() + pullRestoreIfFresh()                 ║
  ║                     restoreInProgress module-global flag                  ║
  ║                                                                          ║
  ╚═════════════╤══════════════════════════════════════════════════════════╝
                │ HTTPS REST (no Realtime, no WebSocket today)
  ╔═════════════▼══════════════════════════════════════════════════════════╗
  ║  Supabase — Postgres + REST + (planned) Auth + RLS                     ║
  ║                                                                          ║
  ║  Today: anon key in client bundle, NO RLS deployed (single user)        ║
  ║  Phase 4 (planned): Supabase Auth + JWT + RLS on every table            ║
  ║                                                                          ║
  ╚════════════════════════════════════════════════════════════════════════╝

  ╔════════════════════════════════════════════════════════════════════════╗
  ║  Pose pipeline — runs IN PARALLEL with the layer stack above            ║
  ║                                                                          ║
  ║  Camera (vision-camera) — UI thread                                     ║
  ║       │ frame                                                            ║
  ║  ┌────▼───────────────────────────────────┐                              ║
  ║  │ Frame processor worklet                 │ worklet thread             ║
  ║  │ (react-native-worklets-core)            │                              ║
  ║  │ src/components/camera/PoseCamera.tsx   │                              ║
  ║  │   ─ MediaPipe pose detector             │                              ║
  ║  │     (bundled model file, no remote fetch)│                              ║
  ║  │   ─ landmarks → runOnJS(onLandmarks)    │                              ║
  ║  └────┬───────────────────────────────────┘                              ║
  ║       │ landmarks (numeric tuples)                                       ║
  ║  ┌────▼───────────────────────────────────┐                              ║
  ║  │ src/lib/pose/exercises/<exercise>.ts   │ JS thread                   ║
  ║  │   ─ extract relevant angles             │                              ║
  ║  │   ─ smooth (EMA alpha ~0.4)             │                              ║
  ║  │ src/lib/pose/rep-counter.ts             │                              ║
  ║  │   ─ FSM: idle→ready→down→bottom→up      │                              ║
  ║  │   ─ hysteresis                          │                              ║
  ║  └────┬───────────────────────────────────┘                              ║
  ║       │ RepEvent                                                         ║
  ║  ┌────▼───────────────────────────────────┐                              ║
  ║  │ SetCameraOverlay → SetCameraHUD         │ JS thread                   ║
  ║  │   ─ visible rep counter                 │                              ║
  ║  │   ─ emits set completion → useGameState │                              ║
  ║  └─────────────────────────────────────────┘                              ║
  ║                                                                          ║
  ║  FRAMES NEVER LEAVE THE DEVICE.                                          ║
  ║  Model file is bundled in the build.                                     ║
  ║                                                                          ║
  ╚════════════════════════════════════════════════════════════════════════╝

  ╔════════════════════════════════════════════════════════════════════════╗
  ║  Planned (NOT BUILT) — Phase 4 coaching agent                          ║
  ║                                                                          ║
  ║  src/lib/agent/  — does not exist on disk yet                           ║
  ║    runner.ts   (iteration cap K=8, token budget 50k, circuit breakers) ║
  ║    sanitize.ts (wrap user notes in <exercise_notes>)                    ║
  ║    schemas.ts  (Zod output schema)                                       ║
  ║    tools/      (5 read-only tools; no write surface)                     ║
  ║                                                                          ║
  ║  Single ReAct loop. Anthropic Sonnet. Heuristic gate skips it on        ║
  ║  high-confidence clean sets. Design documented in                       ║
  ║  .aipe/study-agent-architecture/.                                        ║
  ╚════════════════════════════════════════════════════════════════════════╝
```

## What each component owns

| Component | Owns | Talks to |
|---|---|---|
| UI layer | render + interaction | hooks layer |
| Hooks layer | orchestration + React state | domain + persistence |
| Domain (lib/game) | game rules: gates, levels, weeks, streaks | (pure — no I/O) |
| Domain (lib/pose) | rep counting: angle math + FSM | (pure — fed by camera) |
| Persistence (database.ts) | schema, migrations, local CRUD | SQLite (WAL); fire-and-forget to sync layer |
| Sync layer | local ↔ remote mapping, watermarks, restore | Supabase REST; reads/writes via persistence |
| Supabase | cloud mirror; (planned) auth + RLS | persistence via REST |
| Pose pipeline | rep detection from camera frames | UI overlay → hook layer at set boundaries |

## What contrl is NOT

- **Not an LLM application yet.** No `@anthropic-ai/sdk` or `openai` in `package.json`. Phase 4 ReAct agent is designed (`.aipe/study-agent-architecture/`) but unimplemented.
- **Not multi-user.** Single hardcoded `USER_ID`; no auth; no RLS deployed.
- **Not multi-device.** Sync watermarks assume single writer; two-device concurrent writes are not yet handled.
- **Not a server.** All compute (incl. pose detection) is on-device; Supabase is dumb storage + REST.

## Three highest-leverage architectural patterns

Each detailed in its Pass 2 file:

1. **Local-first canonical with cloud mirror** — SQLite is the truth. Offline reads and writes work fully; sync is an enhancement, not a dependency. ([01](./01-local-first-canonical-with-cloud-mirror.md))
2. **On-device ML pipeline** — camera frames → MediaPipe → FSM → rep count, all without leaving the device. Privacy, latency, and cost are all properties of this choice. ([02](./02-on-device-ml-pipeline.md))
3. **Reconstruct on reinstall** — game state (user levels, gate progress, week progress) is *derived* from the sessions table. Reinstall, pull sessions from cloud, rebuild everything else. ([03](./03-reconstruct-on-reinstall.md))

The fourth pattern (**watermark-based incremental sync**, [04](./04-watermark-based-incremental-sync.md)) is a sync-layer mechanism that makes #1 and #3 efficient at scale; it earns a file but is less load-bearing than the top three.

## Next reading

- For the lens-by-lens audit and the red-flags ranking, open [`audit.md`](./audit.md).
- For the schema details that pattern 03 depends on, see `.aipe/study-data-modeling/`.
- For the failure-mode in pattern 01's sync layer (early-return drops tables), see `.aipe/study-software-design/06-errors-and-special-cases.md` and `.aipe/drills/failure-handling-sync-partial-failure.md`.
