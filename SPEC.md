# contrl — Product Spec

## Overview

contrl is a fitness progression app for bodyweight training. It tracks workouts across three categories (push, pull, squat) through a 5-level skill tree. Users log sets/reps, use camera-based pose detection for rep counting, and sync data with Notion.

Built with Expo/React Native, SQLite, MediaPipe, and Notion API.

---

## Categories & Exercises

Three workout categories: **push**, **pull**, **squat**.

Each category has 5 levels of increasing difficulty. Each level contains 3-5 exercises with target sets, reps, and tempo.

**Exercise types:**
- **Rep exercises** — counted reps with tempo (e.g. 3x8 at 2-1-2-0)
- **Hold exercises** — timed holds (e.g. 4x60s, tempo "Steady")

**Exercise properties:**
- Name, category, level, target sets, target reps, sort order
- Tempo pattern ("2-1-2-0" for reps, "Steady" for holds)
- Notes: tip (technique), next (progression), scale down (regression)

Exercises are sourced from Notion (source of truth) and cached locally.

---

## Progression System

### Gates

Each category-level has a gate. Passing a gate requires **3 consecutive clean sessions**.

A session is **clean** when every exercise hits its target (all sets checked, all reps/seconds met).

- Clean session: gate counter increments (+1)
- Non-clean session: gate counter resets to 0
- Counter reaches 3: gate passes, user levels up

### Levels

Users start at level 1 in all categories. Passing a gate advances the category to the next level (max level 5), unlocking harder exercises.

### Week Tracking

A week runs Sunday to Saturday. Each category can be completed once per week. A week is complete when all 3 categories are logged.

### Streaks

Consecutive complete weeks. Broken when a week ends without all 3 categories logged.

---

## Screens

### Home

Dashboard with two stacked sections:

- **Week strip** — 7-day row (Sun-Sat), dots colored by category for any day a session was logged. Today is outlined when no session yet.
- **Skill tree** — 5 rows (levels, L5 → L1 top-to-bottom) × 3 columns (categories). The cell at each category's *current* level is rendered as a workout card (badge L#, category label, exercise count, gate progress with a `CLEAN STREAK` caption); tapping it routes to Log Workout. Locked / passed / non-current cells render as small square nodes and tap-open the exercise detail modal.

There is no separate Skill Tree tab — the tree is embedded directly under the week strip on Home.

### Log Workout

Per-exercise set tracking for a single category at the user's current level.

Each exercise block shows:
- Name, type (reps/hold), tempo, target (e.g. 3x8)
- Per-set progress bar (hit/miss/pending)
- Set rows with: checkbox, numeric input, timer button (holds), camera button, target and last session values
- Expandable progression guide

Additional elements:
- Notes textarea (optional)
- Save button (requires at least 1 checked set)
- Auto-save draft every 500ms

**Result screen** (after save):
- Completion percentage with progress bar
- Motivational message
- Gate progress or "GATE PASSED" with level-up indicator
- Per-exercise breakdown showing hit/miss and shortfall details

### Skill Tree (embedded on Home)

Grid: 5 rows (levels, L5 → L1 top-to-bottom) × 3 columns (categories).

Node rendering depends on whether the cell is at the user's current level for that category:

- **Active (user's current level)** — rendered as a workout card: level badge (or green check if logged this week), category label, exercise count, gate progress (`X/3` with `CLEAN STREAK` caption). Tap routes to Log Workout.
- **Passed** — small node with checkmark.
- **Locked** — small node with lock icon, dimmed.
- **Other in-progress** — small node with level number; an `X/3` badge sits below if any clean passes are recorded.

Tapping any non-active node opens a modal showing the category badge, level, status, 3-segment gate progress bar, and the exercise list with targets.

### History

Sessions grouped by week (newest first).

Week header: date range + category dots.
Session card: date, category badge, level, pass/fail, completion percentage.
Expandable per-exercise breakdown.

### Settings

- **Notion sync**: connection status, last synced, sync button, result display
- **Notion config**: integration token, database IDs, auto-sync toggle, test connection
- **Setup guide** (placeholder)
- **About**: app version

---

## Camera & Pose Detection

Uses MediaPipe pose landmarker for real-time pose detection.

### Supported Exercises

- **Push-ups** — elbow angle (shoulder-elbow-wrist), ready 160, bottom 90
- **Squats** — knee angle (hip-knee-ankle), ready 160, bottom 90
- **Plank holds** — alignment angle (shoulder-hip-ankle), threshold 15 from 180

### Rep Counter

State machine: idle -> ready -> down -> bottom -> up -> ready (rep counted).
Exponential smoothing on angles. 10-degree hysteresis to prevent jitter.

### Camera UI

- 10-second countdown before detection starts
- Front/back camera toggle
- Skeleton overlay on detected pose
- Confidence percentage display
- Debug panel showing angle and phase
- HUD with rep count or hold timer, target, start/done/cancel buttons

### Hold Timer Modal

For timed exercises without camera:
- Countdown display (MM:SS)
- Progress bar
- Start button to begin
- Auto-completes set when target reached

---

## Data Sync

### Rules

1. **Reference data** (exercises): Notion is source of truth. Upsert from remote, then prune stale local records.
2. **User-generated data** (sessions): bidirectional sync with last-edit-wins conflict resolution.
3. **Derived state** (levels, gates, week progress, streaks): computed from sessions, never synced. Reconstructed on reinstall.
4. **IDs**: remote-sourced records use remote ID directly. Locally-created records use generated IDs, associated with remote ID after first push.

### Sync Flow

1. Pull exercises from Notion (upsert all, then prune stale local records)
2. Pull sessions (merge with conflict resolution, 2-minute remote bias)
3. Push local unsynced sessions to Notion
4. Process deletions (archive in Notion, delete locally)
5. Update sync timestamp

### Rate Limiting

350ms minimum between Notion API requests. Exponential backoff on 5xx errors (3 retries). Respects 429 Retry-After.

### Reconstruction

On a fresh install with Notion auto-sync enabled, sessions are pulled from Notion *after* the database initializes. Reconstruction has to fire after the pull, not on the initial DB-ready pass (which sees zero sessions).

Trigger:
1. App opens → DB ready → first `load()` runs and creates default L1 gates with no recorded passes.
2. Auto-sync runs through `syncNow()` (not `syncAll()` directly), which bumps `syncVersion` after the pull completes.
3. `syncVersion` change triggers `load()` to run again. With sessions now in SQLite and gates still untouched (no recorded `consecutivePasses`, no `lastSessionDate`), the reinstall detector fires and reconstruction runs.

Reconstruction itself:
1. Sort all sessions chronologically.
2. Replay through gate evaluation: clean session → consecutive count +1, dirty session → reset to 0; 3 consecutive clean → graduate to next level.
3. Persist reconstructed user levels and gate progress.

Idempotent: running reconstruction against the same session history always produces the same result, so the post-sync `load()` re-run is safe to repeat.

---

## Data Model

### Exercise
id, name, category, level, targetSets, targetReps, isHold (derived from tempo), sortOrder, tempo, notes, notionPageId, updatedAt

### User
id, levels (Record<Category, number>), createdAt, notionPageId, updatedAt

### WorkoutSession
id, date, level, category, exercises (ExerciseEntry[]), notes, passed, notionPageId, updatedAt

### ExerciseEntry
exerciseId, targetSets, targetReps, actualSets, actualReps[], actualHoldSeconds[], checkedSets[], hitTarget

### GateProgress
level, category, status (locked/in-progress/passed), consecutivePasses, lastSessionDate

### WeekProgress
weekStart (Sunday YYYY-MM-DD), sessionsCompleted (Record<Category, boolean>)

### DraftSession
category, level, exercises (ExerciseFormState[]), notes, savedAt

---

## Database (SQLite)

Tables: user_profile, exercises, sessions, gate_progress, week_progress, drafts, sync_deletions.

Indexed on: category, level, sort_order, date, notion_page_id, updated_at.

Migrations run on open: adds columns if missing (passed, created_at on sessions; tempo, notes on exercises).

Seed data loaded from exercises-seed.json if exercises table is empty.

---

## Theme

Dark UI with sharp edges (0-2px border radius). Tron-inspired: muted slate surfaces with neon-cyan primary and saturated category accents.

**Colors:**
- Background: #1e293b (slate-800)
- Surface: #334155 (slate-700)
- Surface light: #475569 (slate-600)
- Border: #475569
- Text: #f8fafc (slate-50)
- Text secondary / muted: #cbd5e1 (slate-300)
- Primary: #00e5ff (cyan)
- Success: #34d399 (green)
- Warning: #fbbf24 (amber)
- Categories: push #F97316 (orange), pull #06B6D4 (cyan), squat #D946EF (purple)

**Typography:** Inter at 400/600/700/800 weights.

---

## Architecture

```
app/                    Expo Router screens
  (tabs)/               Tab navigation (home, history)
  log/[category]        Log workout
  settings/             Settings + Notion config

src/
  components/
    SkillTree.tsx       5x3 grid; renders active-level cells as
                        workout cards, others as small nodes
    camera/             PoseCamera, overlays, skeleton, debug
    ui/                 CategoryBadge, ProgressBar, HoldTimerModal
  constants/            Theme (colors, fonts)
  hooks/                useGameState, useExerciseForm, useExercises,
                        useDatabase, NotionSyncContext
  lib/
    game/               gate-check, progression, week-progress,
                        streaks, reconstruct
    pose/               rep-counter, angles, landmarks,
                        exercises/ (pushup, squat, plank)
  services/
    database.ts         SQLite CRUD
    notion/             api, config, sync, mapper
  types/                Domain types, Notion types
  data/                 exercises-seed.json
```

### State Flow

**App open** → SQLite init → first `load()` (user, sessions, gates, weeks) → reinstall detector skipped on this pass if there are no sessions yet → create missing default gates → ready.

**Auto-sync** (in parallel, gated on Notion configured + auto-sync enabled): goes through `NotionSyncContext.syncNow()` so it shares state with manual syncs. On completion it bumps `syncVersion`.

**`syncVersion` bump** → `load()` re-runs → reinstall detector now sees sessions present + gates untouched → reconstruction replays history → persisted user levels and gates → state reloaded into context.

**Log session** → save to DB → evaluate clean? → update gate → check level-up → update week → clear draft → show result.

**Sync** → pull exercises (upsert + prune) → pull sessions (merge with last-edit-wins, 2-min remote bias) → push local sessions → process deletions → increment `syncVersion` → reload state.
