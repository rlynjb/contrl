# contrl-mo — system overview

> Local-first bodyweight-progression mobile app. SQLite is source of truth. Notion is the cloud mirror. On-device MediaPipe pose detection counts reps. Derived game state (gates, levels, weeks, streaks) is recomputed from session history — never synced.

```
┌─ UI layer (Expo + React Native, expo-router) ──────────────────────────────────────────────────┐
│                                                                                                │
│   app/_layout.tsx           app/(tabs)/index.tsx       app/log/[category]/...                  │
│   NotionSyncProvider   →    SkillTree + WorkoutCard    →   PoseCamera + form + result          │
│   GameStateContext                                                                             │
│        │                                                                                       │
│        │ useGameState() / useNotionSync()                                                      │
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
│      Additive migrations on open   │
│      (PRAGMA table_info + ALTER)   │
│                                    │
└────────────┬───────────────────────┘
             │
             ▼  pull then push, ordered
┌─ Network boundary (HTTPS to Notion API) ───────────────────────────────────────────────────────┐
│                                                                                                │
│   src/services/notion/                                                                         │
│      api.ts        rateLimit() 350ms + retry 5xx (3×) + Retry-After on 429                     │
│      sync.ts       syncAll: pullExercises → pullSessions → pushSessions → processDeletions     │
│                    conflict resolution: last-edit-wins with 2-min remote bias                  │
│      mapper.ts     domain ↔ Notion properties                                                  │
│      config.ts     token + db ids in expo-secure-store                                         │
│                                                                                                │
└─ Provider layer (Notion) ──────────────────────────────────────────────────────────────────────┘
   notion.so/databases    Exercises DB  ·  Sessions DB  ·  User profile DB

After syncAll completes:
   syncVersion++   →   useGameState reloads   →   reconstructFromSessions runs if state is "fresh"
                                                  (idempotent on session history)
```

## Legend

- **NotionSyncProvider** — React context owning sync status + `syncVersion` counter. Bumped after every successful `syncAll()`. Components depending on it re-run their effects when it changes.
- **GameStateContext** — React context owning user, week, streak, gates, sessions. Re-runs `load()` when `syncVersion` increases.
- **`useGameStateInternal(dbReady)`** — `src/hooks/useGameState.ts` L68. Owns the load orchestration and the reinstall-reconstruction trigger.
- **`load()`** — Reads from SQLite, detects reinstall (sessions present + default levels + untouched gates), runs `reconstructFromSessions` if so, persists, then sets state.
- **`reconstructFromSessions(sessions)`** — `src/lib/game/reconstruct.ts` L13. Pure: sort chronologically, replay each session through gate evaluation. Idempotent.
- **`syncAll()`** — `src/services/notion/sync.ts` L33. Pull exercises (upsert + prune missing) → pull sessions (with conflict resolution) → push unsynced → process pending deletions → bump lastSync timestamp.
- **`rateLimit()`** — `src/services/notion/api.ts` L9. Sleeps to enforce 350ms minimum between requests. Module-level `lastRequestTime`.
- **`notionFetch`** — Single HTTP wrapper. Handles 429 (Retry-After header), 5xx (3 retries with `(n+1)*2000ms` backoff), and rate-limit gate.
- **`RepCounter`** — `src/lib/pose/rep-counter.ts` L21. Finite state machine, 10° hysteresis, no external state.
- **`calculateAngle(a, b, c)`** — `src/lib/pose/angles.ts` L7. Vector-dot-product joint angle in degrees, clamps to `[-1, 1]` for `acos` safety.
- **`smoothAngle(current, prev, factor)`** — Exponential smoothing, `factor = 0.4` per exercise processor.
- **`useExerciseForm`** — `src/hooks/useExerciseForm.ts` L20. Owns log-screen state; `setTimeout(save, 500)` cleared on each keystroke so only the last write hits SQLite.
- **`drafts` table** — Keyed by `draft:${category}:${level}`. One row per active log-flow. Deleted on successful session save.
- **`sync_deletions` table** — Records local deletions that need to archive their Notion page on next sync. Skipped on first sync (no prior `lastSync`).
- **Reinstall detection** — `useGameStateInternal` L112–L119: sessions exist AND all levels are 1 AND all current-level gates have `consecutivePasses === 0` and no `lastSessionDate`. Then `reconstructFromSessions` runs.

→ Section indexes: [01-system-design/README.md](./01-system-design/README.md) · [02-dsa/README.md](./02-dsa/README.md) · [03-ai-engineering/README.md](./03-ai-engineering/README.md) · [04-machine-learning/README.md](./04-machine-learning/README.md)
