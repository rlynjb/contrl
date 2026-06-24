# contrl — system overview

> Local-first bodyweight-progression mobile app. SQLite is source of truth. Supabase is the cloud mirror (write-mostly, restore on fresh install). On-device MediaPipe pose detection counts reps. Derived game state (gates, levels, weeks, streaks) is recomputed from session history — never synced.

```
┌─ UI layer (Expo + React Native, expo-router) ──────────────────────────────────────────────────┐
│                                                                                                │
│   app/_layout.tsx           app/(tabs)/index.tsx       app/log/[category]/...                  │
│   (sync useEffect)  →       SkillTree + WorkoutCard    →   PoseCamera + form + result          │
│   GameStateContext                                                                             │
│        │                                                                                       │
│        │ useGameState()                                                                        │
└────────┼───────────────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Domain layer (src/lib/, src/hooks/) ──────────────────────────────────────────────────────────┐
│                                                                                                │
│   useGameStateInternal  →  load()  →  reconstructFromSessions()  on freshly-initialized state  │
│         │                                                                                      │
│         ├── gate-check.ts        createGateProgress / SessionResult                            │
│         ├── progression.ts       getNodeState / checkCategoryLevelUp (MAX_LEVEL = 5)           │
│         ├── reconstruct.ts       idempotent replay of session history                          │
│         ├── week-progress.ts     getWeekStart / markCategoryDone / isWeekComplete              │
│         └── streaks.ts           calculateStreak                                               │
│                                                                                                │
│   lib/pose/                                                                                    │
│       angles.ts (calculateAngle, smoothAngle)                                                  │
│       landmarks.ts (POSE indices)                                                              │
│       rep-counter.ts (FSM: idle → ready → down → bottom → up → ready, count++)                 │
│       exercises/pushup,squat,plank,pull → processFrame(landmarks) → {angle, repCount, phase}   │
│                                                                                                │
│   useExerciseForm  →  500ms-debounced draft autosave  →  db.saveDraft                          │
└────────┬───────────────────────────────────────────┬───────────────────────────────────────────┘
         │                                           │
         ▼                                           ▼
┌─ Storage layer (SQLite local) ─────┐    ┌─ Provider layer (MediaPipe) ───────────────┐
│                                    │    │                                            │
│   src/services/database.ts         │    │   react-native-vision-camera               │
│      PRAGMA journal_mode = WAL     │    │   react-native-mediapipe-posedetection     │
│      Tables:                       │    │      Delegate.GPU                          │
│        user_profile                │    │      pose_landmarker_lite.task             │
│        exercises                   │    │      onResults → 33 landmarks @ ~30fps     │
│        sessions  (exercises_json)  │    │                                            │
│        gate_progress               │    └────────────────────────────────────────────┘
│        week_progress               │
│        drafts                      │
│        sync_deletions              │
│        sync_state                  │
│          (last_pushed_at,          │
│           last_pulled_at)          │
│        sync_meta                   │
│          (table_name PK,           │
│           last_synced_at)          │
│      Additive migrations on open   │
│      (PRAGMA table_info + ALTER)   │
│                                    │
└────────────┬───────────────────────┘
             │
             ▼  pull on fresh install; push on ready + after writes
┌─ Network boundary (HTTPS to Supabase) ─────────────────────────────────────────────────────────┐
│                                                                                                │
│   src/services/sync/                                                                           │
│      client.ts     supabase client (anon key + URL from EXPO_PUBLIC_* env vars)               │
│      config.ts     USER_ID = '00000000-0000-0000-0000-000000000001' (single-tenant)           │
│      mapper.ts     domain ↔ Supabase row shapes                                               │
│      supabase-sync.ts                                                                          │
│         pushChanges()          watermark push: updated_at > last_pushed_at                    │
│         pullRestoreIfFresh()   one-shot restore on fresh install                               │
│         clearLocalForRestore() wipes JSON-seed pollution before upsert                        │
│      index.ts      re-exports                                                                  │
│                                                                                                │
└─ Provider layer (Supabase Postgres) ───────────────────────────────────────────────────────────┘
   Supabase Postgres    exercises · sessions · gate_progress · week_progress · user_profile
                        (single tenant via USER_ID; RLS disabled)

On app ready (app/_layout.tsx useEffect on `ready`):
   pullRestoreIfFresh()  →   pushChanges()   →   useGameState reloads
   (skipped if last_pulled_at set or sessions exist)
   reconstructFromSessions runs if reinstall fingerprint detected (idempotent)
```

## Legend

- **GameStateContext** — React context owning user, week, streak, gates, sessions. Re-runs `load()` on mount and after sync completes.
- **`pushChanges()`** — `src/services/sync/supabase-sync.ts`. Watermark push of rows with `updated_at > last_pushed_at`; fires on app ready and at end of each write in `database.ts`.
- **`pullRestoreIfFresh()`** — `src/services/sync/supabase-sync.ts`. One-shot restore on fresh install (`last_pulled_at IS NULL AND sessions empty`); runs `clearLocalForRestore()` then full remote upsert.
- **`supabase`** — `src/services/sync/client.ts`. Supabase JS client configured with anon key + URL from `EXPO_PUBLIC_*` env vars.
- **`sync_state` table** — SQLite table with `id='default'`, `last_pushed_at`, `last_pulled_at`. Tracks watermarks for push/pull decisions.
- **`sync_meta` table** — per-table last-synced-at ledger; `pushChanges()` writes here via `setSyncMetaTouched(tableName)` after each per-table upsert; Settings UI reads all 5 rows via `getAllSyncMeta()` to render the SYNC LEDGER section.
- **`useGameStateInternal(dbReady)`** — `src/hooks/useGameState.ts` L67. Owns the load orchestration and the reinstall-reconstruction trigger.
- **`load()`** — Reads from SQLite, detects reinstall (sessions present + default levels + untouched gates), runs `reconstructFromSessions` if so, persists, then sets state.
- **`reconstructFromSessions(sessions)`** — `src/lib/game/reconstruct.ts` L13. Pure: sort chronologically, replay each session through gate evaluation. Idempotent.
- **`RepCounter`** — `src/lib/pose/rep-counter.ts` L21. Finite state machine, 10° hysteresis, no external state.
- **`calculateAngle(a, b, c)`** — `src/lib/pose/angles.ts` L7. Vector-dot-product joint angle in degrees, clamps to `[-1, 1]` for `acos` safety.
- **`smoothAngle(current, prev, factor)`** — Exponential smoothing, `factor = 0.4` per exercise processor.
- **`useExerciseForm`** — `src/hooks/useExerciseForm.ts` L20. Owns log-screen state; `setTimeout(save, 500)` cleared on each keystroke so only the last write hits SQLite.
- **`drafts` table** — Keyed by `draft:${category}:${level}`. One row per active log-flow. Deleted on successful session save.
- **`sync_deletions` table** — Records local deletions that need to propagate to Supabase as DELETE on next push (originally a Notion-era table, repurposed for Supabase tombstones; `notion_page_id` column now nullable).
- **Reinstall detection** — `useGameStateInternal` L112–L119: sessions exist AND all levels are 1 AND all current-level gates have `consecutivePasses === 0` and no `lastSessionDate`. Then `reconstructFromSessions` runs.

→ Section indexes: [01-system-design/README.md](./01-system-design/README.md) · [02-dsa/README.md](./02-dsa/README.md)

(AI engineering and ML moved to the companion guide `.aipe/study-ai-engineering/`; prompt engineering to `.aipe/study-prompt-engineering/`.)

---
