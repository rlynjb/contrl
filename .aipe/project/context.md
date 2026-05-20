# Project context

contrl is a fitness progression app for bodyweight training. It tracks workouts across three categories (push, pull, squat) through a 5-level skill tree. Users log sets/reps, use camera-based pose detection for rep counting, and sync with Supabase.

## Stack
- **Runtime / framework:** Expo SDK 55, React Native 0.83, React 19, expo-router (file-based routing)
- **Language:** TypeScript (strict)
- **Local storage:** SQLite (expo-sqlite) with additive migrations on open; secure key storage via expo-secure-store
- **Remote / sync:** Supabase — project **reindb** (shared with buffr; contrl tables live in the `contrl` schema, buffr tables in the `buffr` schema). Client configured with `db: { schema: 'contrl' }` in `createClient`. Anon key + URL only, RLS disabled, single-tenant via hardcoded USER_ID.
- **Computer vision:** MediaPipe pose landmarker via `react-native-mediapipe-posedetection` + `react-native-vision-camera` + worklets
- **Styling:** NativeWind (Tailwind-for-RN) over a hand-rolled dark theme; Inter typeface

## Data model
- **Exercise** — reference data, cached in SQLite. Fields: id, name, category, level, targetSets, targetReps, isHold (derived from tempo), sortOrder, tempo, notes (tip/next/scaleDown), notionPageId (dead schema, kept for column compatibility), updatedAt.
- **WorkoutSession** — user-generated, write-mostly mirror to Supabase. Holds an `ExerciseEntry[]` with actualSets/Reps/HoldSeconds, checkedSets, hitTarget. Has `passed`, `notionPageId` (dead schema), `updatedAt`.
- **GateProgress** — derived state per (level, category): status, consecutivePasses (0–3), lastSessionDate. Reconstructed from sessions on reinstall.
- **WeekProgress** — derived: weekStart (Mon YYYY-MM-DD), sessionsCompleted Record<Category, boolean>.
- **DraftSession** — autosaved every 500ms during logging.
- **User** — id, levels Record<Category, number>, notionPageId, updatedAt.
- **sync_meta** — local-only per-table sync ledger. One row per synced table (`table_name TEXT PK, last_synced_at TEXT`). Seeded with 5 rows (`user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress`) on migration; `setSyncMetaTouched(tableName)` updates the timestamp after each successful per-table upsert in `pushChanges()`; `getAllSyncMeta()` reads all rows for the Settings UI SYNC LEDGER section.

Sync rules:
1. Reference data (exercises): seeded from JSON; mirrored to Supabase on push.
2. User-generated (sessions): write-mostly mirror to Supabase; pull runs only on fresh install (`last_pulled_at IS NULL AND sessions empty`). Push uses `updated_at > last_pushed_at` watermark.
3. Derived (levels, gates, weeks, streaks): never synced — recomputed from sessions.
4. IDs: locally generated UUIDs; `notionPageId` columns kept on entity tables as dead schema (no longer written).

## File structure
```
app/                        Expo Router screens
  (tabs)/                   home, history
  log/[category]            log-workout flow + result
  settings/                 sync status + controls (polls sync_state via useFocusEffect); SYNC LEDGER section reads all 5 rows via getAllSyncMeta()
src/
  components/
    SkillTree.tsx           5x3 grid; active-level cell renders as workout card
    camera/                 PoseCamera, skeleton overlay, debug HUD
    ui/                     CategoryBadge, ProgressBar, HoldTimerModal, etc.
  constants/                theme (colors, fonts)
  hooks/                    useGameState, useExerciseForm, useExercises,
                            useDatabase
  lib/
    game/                   gate-check, progression, week-progress,
                            streaks, reconstruct
    pose/                   rep-counter (state machine), angles,
                            landmarks, exercises/{pushup,squat,plank}
  services/
    database.ts             SQLite CRUD + migrations
    sync/                   client, config, mapper, supabase-sync, index
  types/                    domain + Notion types
  data/                     exercises-seed.json
android/                    prebuild output (committed)
models/                     MediaPipe pose-landmarker assets
```

## Key algorithms / decisions
- **Gate state machine:** clean session → consecutivePasses++; dirty → reset to 0; reaches 3 → level up (capped at MAX_LEVEL = 5). Cleanliness comes from per-entry `hitTarget`, not exercise-ID matching.
- **Reconstruction on reinstall:** sort sessions chronologically, replay through gate evaluation; idempotent. Triggered after `pullRestoreIfFresh()` completes in the `app/_layout.tsx` useEffect on `ready`.
- **Rep counter:** finite state machine `idle → ready → down → bottom → up → ready` with exponential smoothing on joint angles and 10° hysteresis to prevent jitter. Per-exercise angle definitions (push-up: shoulder-elbow-wrist; squat: hip-knee-ankle; plank: shoulder-hip-ankle deviation from 180°).
- **Sync ordering:** on app ready — `pullRestoreIfFresh()` (only if `last_pulled_at IS NULL AND sessions empty`) then `pushChanges()` (watermark push). Writes also fire `pushChanges().catch(() => {})` at end of each writer in `database.ts`.
- **Sync state:** `sync_state(id='default', last_pushed_at, last_pulled_at)` SQLite table tracks watermarks.
- **Sync ledger:** `sync_meta(table_name TEXT PK, last_synced_at TEXT)` local-only table; `getAllSyncMeta()` and `setSyncMetaTouched(tableName)` are the public helpers in `src/services/database.ts`.
- **Auto-save draft:** debounced 500ms while logging; cleared on save.
- **Week:** Mon–Sun, one slot per category.

## What must not change
- Derived state (gates, levels, weeks, streaks) is never synced — only sessions are. Reinstall reconstruction depends on this.
- `MAX_LEVEL = 5` cap (UI assumes the 5-row tree).
- Session `hitTarget` per entry is the cleanliness signal — not a separate gate criteria table (gates.json was removed for this reason).
- Reconstruction must remain idempotent (post-sync `load()` re-run is allowed to repeat).
- `restoreInProgress` flag must be cleared before writes fire `pushChanges()` to avoid pushing JSON-seed pollution during restore.

---
Updated: 2026-05-17 — Notion sync replaced by Supabase write-mostly mirror; NotionSyncContext/useNotionSync/syncVersion removed; week boundary changed Sun→Mon.
Updated: 2026-05-19 — Supabase project renamed to reindb (shared with buffr); contrl schema + db:{schema:'contrl'} client option; sync_meta ledger table + getAllSyncMeta/setSyncMetaTouched helpers; Settings SYNC LEDGER section noted.
