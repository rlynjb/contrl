# contrl — Project Spec & Review

A code-review-driven spec for the `contrl` repo. Captures product intent, technical architecture, design choices, and tradeoffs. Complements [`SPEC.md`](SPEC.md) (product-only) with engineering rationale and review notes.

---

## 1. Elevator pitch

A local-first bodyweight progression app for Android (Expo/React Native). Users log workouts across three categories — **push**, **pull**, **squat** — through a 5-level skill tree. A level is graduated by logging 3 consecutive clean sessions. Workouts can use the device camera + MediaPipe pose detection to auto-count reps. Data lives in on-device SQLite with **optional** Notion sync as cloud backup; no account system.

---

## 2. Problem & goals

**Problem.** Bodyweight training plateaus without a clear progression structure. Most fitness apps (a) require accounts and lock data behind their cloud, (b) lean on manual rep counting, which breaks form/focus.

**Goals.**

- Make progression **visible and gated**, so the next workout has a defined target.
- Keep data ownership: **no account required**, your sessions live in local SQLite. Sync is opt-in and goes to *your* Notion workspace.
- Free the user from counting reps in their head: camera-based rep counter with on-device inference.
- Survive uninstall: if Notion sync is configured, sessions round-trip and progression reconstructs on a fresh install.

---

## 3. Product

### Categories & exercises

Three trees: **push**, **pull**, **squat**. Each has 5 levels of escalating difficulty. Each level holds 3–5 exercises, defined by `category × level × sortOrder`.

Exercises come in two shapes:

- **Rep exercises** — counted reps with a tempo (e.g. `3×8` at `2-1-2-0`).
- **Hold exercises** — timed isometrics (e.g. `4×60s`, tempo `Steady`).

Exercise fields (see [`src/types/index.ts`](src/types/index.ts)): `id, name, category, level, targetSets, targetReps, isHold, tempo, notes{ tip, next, scaleDown }, sortOrder`.

Source of truth is **Notion** (when configured); otherwise the seeded [`src/data/exercises-seed.json`](src/data/exercises-seed.json) is used on first DB init.

### Progression — gates

Each `(category, level)` has a **gate**. Passing the gate at the user's current level advances the user one level in that category (max 5). The mechanic:

- A session is **clean** when every exercise hits its target (every set checked, every set meets reps/seconds).
- Clean session → `consecutivePasses` += 1.
- Non-clean session → `consecutivePasses` = 0.
- `consecutivePasses` reaches **3** → gate `status = passed`, user level += 1.

Logic lives in [`src/lib/game/reconstruct.ts:13-72`](src/lib/game/reconstruct.ts#L13-L72) (replay) and [`src/hooks/useGameState.ts`](src/hooks/useGameState.ts) (live evaluation on each `logSession`).

### Weeks & streaks

A week runs Sunday → Saturday (device local time — no timezone handling). A week is **complete** when all three categories have at least one session that week. Streaks are consecutive complete weeks, broken when a week ends incomplete. See [`src/lib/game/week-progress.ts`](src/lib/game/week-progress.ts) and [`src/lib/game/streaks.ts`](src/lib/game/streaks.ts).

---

## 4. Screens

Tab bar: **Home**, **History**. (The earlier Skill Tree tab was merged into Home.)

### Home — [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx)

Two stacked sections:

1. **Week strip** — 7-day row (Sun–Sat). Each day is a dot, colored by the category logged that day. Today is outlined when no session yet.
2. **Skill tree** — 5 rows (levels, L5 → L1 top to bottom) × 3 columns (push / pull / squat). For each column the cell at the user's *current* level renders as a **workout card** (level badge, category label, exercise count, gate progress `X/3` with `CLEAN STREAK` caption); tap = navigate to Log Workout. Other cells render as small square nodes. Passed nodes show a check; locked nodes show a lock and dim out. Tapping any non-active node opens an exercise-detail modal.

Component: [`src/components/SkillTree.tsx`](src/components/SkillTree.tsx).

### Log Workout — [`app/log/[category].tsx`](app/log/%5Bcategory%5D.tsx)

Per-exercise set tracking for one category at the user's current level. Each exercise block shows:

- Name, type (reps/hold), tempo, target (e.g. `3×8`)
- Per-set progress bar (hit / miss / pending)
- Set rows: checkbox + numeric input + timer button (holds) + camera button + target + last-session values
- Expandable progression guide (tip / next / scale-down)

Plus: optional notes textarea, Save button (requires ≥1 checked set), auto-saved draft every 500ms.

After save, a **Result** view: completion percent, motivational message, gate progress or "GATE PASSED", and a per-exercise breakdown listing hit/miss + short sets. Form state machinery: [`src/hooks/useExerciseForm.ts`](src/hooks/useExerciseForm.ts).

### History — [`app/(tabs)/history.tsx`](app/(tabs)/history.tsx)

Sessions grouped by week, newest first. Each week shows date range + category badges. Each session card: date, category, level, pass/fail, completion %, expandable per-exercise breakdown.

### Settings — [`app/settings/`](app/settings/)

- **Notion sync**: connection status, last-synced timestamp, "Sync Now" button, result panel (pulled/pushed counts + errors).
- **Notion config** — separate route ([`app/settings/notion-sync.tsx`](app/settings/notion-sync.tsx)): integration token (stored via `expo-secure-store`), Sessions DB ID, optional Exercises DB ID, auto-sync toggle, Test Connection button.
- **Setup guide** (placeholder).
- **About**: app version.

---

## 5. Camera & rep detection

### Pipeline

- **Frames**: `react-native-vision-camera` (v4.7.3).
- **Inference**: `react-native-mediapipe-posedetection` (v0.4.0) — runs MediaPipe Pose Landmarker in `LIVE_STREAM` mode with GPU delegate, confidence thresholds 0.5.
- **Worklets**: `react-native-worklets-core` is in deps (verified loading in logcat); used indirectly by vision-camera frame processors.

UI surface ([`src/components/camera/`](src/components/camera/)):

- **`PoseCamera.tsx`** — viewfinder + landmark overlay. Handles 90° portrait rotation and front-camera mirror.
- **`SkeletonOverlay.tsx`** — draws the 33 landmarks plus connectors; a connection only draws when both endpoints have visibility > 0.6.
- **`SetCameraOverlay.tsx`** — wraps the exercise-specific processor, runs a 10-second countdown, shows rep count or hold timer + start/cancel.
- **`DebugPanel.tsx`** — overlay with live joint angle and FSM phase, for tuning.

### Rep-counter FSM — [`src/lib/pose/rep-counter.ts:21-86`](src/lib/pose/rep-counter.ts#L21-L86)

5-state machine with **±10° hysteresis** to reject jitter:

```
idle → ready → down → bottom → up → ready
                                    ↑ rep++ here
```

The increment happens specifically on `up → ready` after a full `bottom` reach — so a half-rep that doesn't dip past the bottom threshold is not counted.

### Angle math — [`src/lib/pose/angles.ts`](src/lib/pose/angles.ts)

- `calculateAngle(a, b, c)` — vector dot product, clamped cosine, returned in degrees. Treats `b` as vertex.
- `smoothAngle(prev, raw)` — exponential moving average, factor **0.4**.
- `averageLandmarks(left, right)` — bilateral averaging before angle computation, reduces left/right noise.

### Exercise processors — [`src/lib/pose/exercises/`](src/lib/pose/exercises/)

| Processor | Joint(s) measured | Ready | Bottom | Notes |
|---|---|---|---|---|
| `pushup.ts` | Elbow (shoulder-elbow-wrist) | 160° | 90° | bilateral avg |
| `squat.ts` | Knee (hip-knee-ankle) | 160° | 90° | bilateral avg |
| `plank.ts` | Body line (shoulder-hip-ankle) | — | — | counts hold time when ≤ 15° from horizontal |
| `pull-bar.ts` | Elbow | 155° | 85° | looser thresholds for bar mechanics |
| `pull-trx.ts` | Elbow + body line | 155° | 85° | also validates body orientation (`vertical` 0–35°, `incline`, `horizontal`) before counting |

Angle thresholds are **constant across user levels** — a known limitation (no scaling for limb length or strength asymmetry).

---

## 6. Data

### Domain types — [`src/types/index.ts`](src/types/index.ts)

```ts
Category   = 'push' | 'pull' | 'squat'
Exercise   { id, name, category, level, targetSets, targetReps, isHold, tempo, notes, sortOrder, notionPageId?, updatedAt? }
User       { id, levels: Record<Category, number>, createdAt, notionPageId?, updatedAt? }
WorkoutSession  { id, date, level, category, exercises: ExerciseEntry[], notes?, passed?, notionPageId?, updatedAt }
ExerciseEntry   { exerciseId, targetSets, targetReps, actualSets, actualReps[], actualHoldSeconds?[], checkedSets[], hitTarget }
GateProgress    { level, category, status: 'locked'|'in-progress'|'passed', consecutivePasses, lastSessionDate?, notionPageId?, updatedAt? }
WeekProgress    { weekStart, sessionsCompleted: Record<Category, boolean>, notionPageId?, updatedAt? }
DraftSession    { category, level, exercises: ExerciseFormState[], notes, savedAt }
```

Notion-side types in [`src/types/notion.ts`](src/types/notion.ts): `NotionPage`, `NotionProperty`, `SyncResult { pulled, pushed, errors[], debug[] }`, `SyncStatus = 'idle' | 'syncing' | 'success' | 'error'`.

### SQLite schema — [`src/services/database.ts`](src/services/database.ts)

Tables: `user_profile, exercises, sessions, gate_progress, week_progress, drafts, sync_deletions`. Indexed on category, level, sort_order, date, notion_page_id, updated_at.

Migrations run on open (adds columns where missing: `passed`, `created_at` on sessions; `tempo`, `notes` on exercises). Seed data loaded from JSON if exercises table is empty.

WAL mode by default (`expo-sqlite`): live data lives in `contrl.db-wal` until checkpointed — relevant when inspecting via `adb` on debug builds.

---

## 7. Sync (Notion)

### Categorization

| Data | Direction | Conflict policy |
|---|---|---|
| Exercises | Notion → local | Upsert from remote, then prune local rows missing from remote |
| Sessions | Bidirectional | Last-edited wins (Notion `last_edited_time` vs local `updatedAt`) |
| Derived state (levels, gates, weeks, streaks) | Never synced | Reconstructed from sessions on reinstall |

### Sync flow — [`src/services/notion/sync.ts`](src/services/notion/sync.ts)

1. Pull exercises from Notion → upsert all, then prune stale local records.
2. Pull sessions from Notion → merge with last-edit-wins (2-minute remote bias for clock skew).
3. Push local unsynced sessions to Notion.
4. Process deletions: `getPendingDeletions()` → archive Notion page → clear local flag.
5. Update sync timestamp, bump `syncVersion`.

### Rate limiting — [`src/services/notion/api.ts:9-49`](src/services/notion/api.ts#L9-L49)

- **350 ms** minimum between Notion API requests.
- Exponential backoff (3 retries) on 5xx.
- Respects `Retry-After` on 429.

### Reinstall reconstruction

The reconstruction trigger is non-obvious and worth documenting:

1. App opens. SQLite ready. First `load()` runs → reads sessions (0 on fresh install) → reinstall detector falls through → default L1 gates created.
2. Auto-sync (if Notion configured) goes through `NotionSyncContext.syncNow()`. This **must** be the sync entry point — direct `syncAll()` calls bypass the version bump.
3. `syncNow()` finishes → increments `syncVersion`.
4. `useGameState` observes `syncVersion` change → re-runs `load()`. Sessions are now present in SQLite, gates are still in their freshly-initialized state (no `consecutivePasses`, no `lastSessionDate`) → reinstall detector fires.
5. [`reconstructFromSessions()`](src/lib/game/reconstruct.ts) replays history → persists derived user levels and gate progress → state reloaded.

Idempotent: replaying the same sessions always produces the same result, so a stray re-run is safe.

The pre-fix version of this had two bugs that masked each other: the auto-sync called `syncAll()` directly (no `syncVersion` bump) AND the reinstall detector used `!hasAnyGate` which became false the moment the first `load()` pass created default gates. Both are fixed in current main.

---

## 8. Architecture

```
app/                    Expo Router screens (file-based routing)
  _layout.tsx           root: NotionSyncProvider, GameStateContext, auto-sync, font + DB boot
  (tabs)/               tab navigator
    _layout.tsx         header bar (logo, sync button, settings link) + tab config
    index.tsx           Home (week strip + SkillTree)
    history.tsx         History
  log/[category].tsx    Log Workout
  settings/             Settings + Notion config

src/
  components/
    SkillTree.tsx       5×3 grid; active cell → workout card, others → square nodes
    camera/             PoseCamera, SkeletonOverlay, SetCameraOverlay, DebugPanel
    ui/                 CategoryBadge, ProgressBar, HoldTimerModal
  constants/theme.ts    colors, fonts (Tron-inspired slate palette + neon cyan)
  hooks/
    useDatabase.ts      DB open/migrate, exposes `ready`
    useGameState.ts     master state hook (user, sessions, gates, weeks)
    useExerciseForm.ts  log-workout form builder, draft persistence
    useExercises.ts     exercises CRUD + reactive list
    NotionSyncContext.tsx  sync state + syncNow (re-entrancy guarded by ref)
  lib/
    game/               gate-check, progression, week-progress, streaks, reconstruct
    pose/               angles, landmarks, rep-counter, exercises/{pushup,squat,plank,pull-bar,pull-trx}
  services/
    database.ts         SQLite CRUD + migrations + seed
    notion/             api (request layer), config (token + db ids), sync, mapper
  types/                Domain + Notion types
  data/                 exercises-seed.json
```

### Boot flow

```
App open
  ↓
SQLite init + migrations + seed
  ↓
useGameStateInternal first load() (no sessions yet → defaults created)
  ↓
fonts load → splash hides → home renders
  ↓ (in parallel)
Auto-sync if configured → syncNow() → pulls sessions → bumps syncVersion
  ↓
load() re-runs → reconstruction (if reinstall state) → state reloaded
```

### Log session flow

```
Save tapped → DB insert → evaluate clean? → gate.consecutivePasses ±
  → if gate.status === 'passed' AND level === user.level: user.level++
  → mark category done in week → clear draft
  → show Result view (passed / message / breakdown)
```

### Custom hooks

- `useGameState()` — single source of truth for runtime state. Exposes `logSession`, `reload`, getters and the live `sessions` / `user` / `gateProgress` / `weekProgress`.
- `useExerciseForm()` — owns log-workout form state, debounced draft save, hit-target evaluation.
- `useNotionSync()` — global sync orchestrator. `syncNow()` is stable across renders (re-entrancy ref, not state deps) so it's safe to put in effect dependencies.

---

## 9. Tech stack

- **Runtime**: React Native 0.83 + React 19, Fabric (new architecture) enabled, Hermes JS engine.
- **Toolchain**: Expo SDK 55, Expo Router, EAS Build.
- **Language**: TypeScript 5.9, strict mode, `@/*` path alias → `src/*`.
- **Storage**: `expo-sqlite` (WAL), `expo-secure-store` (Notion token).
- **Camera / CV**: `react-native-vision-camera`, `react-native-mediapipe-posedetection`, `react-native-worklets-core`.
- **Styling**: NativeWind + Tailwind CSS, plus React Native `StyleSheet` for tighter components.
- **Cloud**: Notion API only (no Firebase/Supabase/Convex).
- **Fonts**: Inter (Google Fonts), weights 400/600/700/800.

See [`package.json`](package.json) for exact versions.

---

## 10. Build & deploy

Build profiles in [`eas.json`](eas.json): `development` (internal, dev-client), `preview` (internal), `production` (Play Store).

Day-to-day dev:

- `npm run android` — local debug build, hot-reload via Metro.
- `npm run android:device` — same but targets a connected device.
- `npx expo run:android --variant release --device <name>` — local release build with JS bundled into the APK (use this for daily-driver installs, since debug builds need Metro at runtime).

Release builds in the local dev setup are signed with the **debug keystore** (see [`android/app/build.gradle`](android/app/build.gradle) — release `signingConfig` points to `signingConfigs.debug`). Signature-match means a local release APK can update over a local debug APK without wiping data.

---

## 11. Theme & design language

Dark UI, tight visual rhythm, 0–2 px border radii.

```
bg            #1e293b   slate-800
surface       #334155   slate-700
surfaceLight  #475569   slate-600
border        #475569
text          #f8fafc   slate-50
textSecondary #cbd5e1   slate-300
primary       #00e5ff   cyan (Tron)
success       #34d399
warning       #fbbf24
push          #F97316   orange
pull          #06B6D4   cyan
squat         #D946EF   purple
```

Visual idioms:

- Sharp corners (no rounded surfaces).
- Neon-color accent text for category and primary actions.
- Square workout cards inside the tree are visually subordinate to the grid — they read as nodes, not buttons.
- Locked nodes use opacity 0.35 for clear demotion.

---

## 12. Known limits & tradeoffs

| # | Item | Notes |
|---|---|---|
| 1 | No conflict detection in Notion sync | Last-edit wins; edits within the 350ms request floor can be lossy. |
| 2 | Rep counter is purely stateful | No per-frame audit trail; no way to replay a session offline. |
| 3 | Angle thresholds are constant across levels | Doesn't scale for limb length or strength asymmetry; intentional simplification. |
| 4 | Body-line orientation check is TRX-only | Push/squat/plank trust the joint angle; a manipulated landmark stream could log a fake rep. |
| 5 | Weeks reset on local-device Sunday | No timezone handling — a user crossing time zones may see a partial week reset. |
| 6 | Only Notion as cloud backup | Tying recovery to a 3rd-party API means token expiry / DB rename breaks reconstruction. |
| 7 | Reconstruction requires Notion sync was active *before* uninstall | Without it, fresh install = permanent data loss. No alternative export/restore. |
| 8 | Single user per install | `user_profile.id = 'default'`. No accounts, no multi-user. |
| 9 | RNScreens emits iOS-only prop warnings on Android | Suppressed via `LogBox.ignoreLogs` in [`app/_layout.tsx`](app/_layout.tsx); library-level noise, not our code. |

---

## 13. Future considerations

- **Local export / import** to JSON would close the data-loss-on-uninstall gap independent of Notion.
- **Conflict resolution** in sync (e.g., per-field merge or 3-way merge on session edits) would let multiple devices share a Notion workspace cleanly.
- **Per-exercise angle calibration** during the 10-second countdown could replace the constant thresholds.
- **Audit trail** for the rep counter (record landmark series + phase transitions) would unlock post-session review and form coaching.
- **Multi-user / accounts** are out of scope by design, but a *device transfer* flow (encrypted backup of SQLite to user-supplied destination) would be a minimum-viable alternative.

---

## 14. Repo at a glance

| | |
|---|---|
| Lines of TS (src + app) | ~7k |
| Active screens | 4 (Home, History, Log, Settings) |
| Custom hooks | 5 |
| DB tables | 7 |
| Pose processors | 5 (push, squat, plank, pull-bar, pull-trx) |
| Build channels | 3 (dev / preview / production) |
| External APIs | 1 (Notion) |
| Cloud accounts required | 0 |

---

*This spec is a code-review snapshot. Live source is canonical; reconcile against [`SPEC.md`](SPEC.md) (product) and [`AUDIT.md`](AUDIT.md) (open issues) before relying on any single claim.*
