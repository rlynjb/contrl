# contrl — Audit

Last updated: 2026-04-12

---

## What's Complete

Features that are stable and tested.

**Home screen**
- Weekly overview strip with category-colored dots
- Remaining/completed category cards with level, exercise count, gate progress
- Navigation to log workout
- Auto-sync on app open (when Notion configured)

**Log workout**
- Per-exercise set tracking with checkbox, numeric input, target display
- Last session values pre-filled
- Camera-based rep counting (push-ups, squats) and hold detection (planks)
- Hold timer modal for timed exercises
- Progression guide (tip, next, scale down) per exercise
- Auto-save draft every 500ms
- Result screen with completion percentage, gate progress, exercise breakdown
- Motivational messages based on performance

**Skill tree**
- 5x3 grid (levels x categories) with node states (passed, in-progress, open, locked)
- Tappable nodes including locked, with exercise list modal
- Exercise count per node
- Gate progress badge (X/3)

**History**
- Sessions grouped by week with category dots
- Expandable per-exercise breakdown
- Pass/fail indicators and completion percentage

**Notion sync**
- Exercises: upsert from Notion + prune stale (source of truth, no data loss window)
- Sessions: bidirectional with last-edit-wins conflict resolution
- Rate limiting (350ms min between requests, exponential backoff)
- Auto-sync on open, manual sync from settings

**Progression system**
- Gate evaluation using hitTarget field from session entries
- 3 consecutive clean sessions to pass a gate
- Level-up on gate pass (capped at MAX_LEVEL = 5)
- Progress reconstruction from session history on reinstall

**Database**
- SQLite with migrations (additive column changes)
- Draft persistence
- Sync deletion tracking

---

## What's Incomplete

Exists but has gaps.

**~~gates.json is stale~~ — RESOLVED**
- Removed gates.json and all dead code (evaluateSession, getGateCriteria, updateGateAfterSession)
- Gate evaluation uses hitTarget from session entries — no exercise ID matching needed

**~~Max level not capped~~ — RESOLVED**
- Added MAX_LEVEL = 5 constant, guarded in progression.ts and reconstruct.ts
- Level-up blocked at L5, gate shows as passed but level stays at 5

**Error states missing on screens**
- Home: `status === 'error'` renders null — no user feedback
- Log workout: database query failure shows infinite loading
- History: no error handling if session retrieval fails
- Settings: sync errors shown but no retry mechanism
- Files: `app/(tabs)/index.tsx:76-84`, `app/log/[category].tsx:236`

**Session `passed` field inconsistent**
- `buildSession()` in useExerciseForm doesn't set `passed`
- `insertSession()` stores it as NULL when undefined
- History screen recomputes it from exercises as fallback
- Sync mapper reads it from Notion but it may not match computed value
- Files: `src/hooks/useExerciseForm.ts:164`, `src/services/database.ts:294`

**Camera pose detection — no landmark validation**
- Angle calculations proceed even when landmark visibility is low
- `angles.ts` returns 0 degrees when landmarks are missing — indistinguishable from valid angle
- No minimum confidence threshold before counting reps
- Rep counting unreliable in poor lighting or partial body visibility
- Files: `src/lib/pose/angles.ts:15`, `src/components/camera/SetCameraOverlay.tsx:62-93`

**Camera processor not reset between sets**
- Processor created once on mount, stored in processorRef
- If user opens camera for set 1, closes, opens for set 2 — processor retains internal state
- Rep count won't carry over (UI state resets), but processor's phase state may be wrong
- Files: `src/components/camera/SetCameraOverlay.tsx:43-49`

**Reconstruction edge cases**
- Sessions without `hitTarget` field (old data) will be treated as non-clean
- Sessions logged at levels above the reconstructed level are silently skipped
- No handling for corrupted or partial session data
- File: `src/lib/game/reconstruct.ts:37-43`

**Notion sync — partial failure recovery**
- If exercise pull succeeds but session pull fails, exercises are replaced but sessions are stale
- Failed session pushes aren't queued for retry
- No rollback on partial sync
- File: `src/services/notion/sync.ts:49-61`

---

## What's Blocking Next Phase

Must be resolved before building anything new.

**~~gates.json exercise IDs don't match Notion IDs~~ — RESOLVED**
- Removed gates.json and all dead code that depended on it (evaluateSession, getGateCriteria, updateGateAfterSession, exerciseMeetsCriteria)
- Gate evaluation now relies entirely on hitTarget from session exercise entries
- A session is clean when all exercises have hitTarget === true, no per-exercise criteria matching needed

**~~Max level must be capped~~ — RESOLVED**
- Added MAX_LEVEL = 5 constant in types/index.ts
- checkCategoryLevelUp, reconstruction, and logSession all guard against level-up beyond MAX_LEVEL

**~~Exercise sync has a data loss window~~ — RESOLVED**
- Replaced delete-all + insert with upsert + delete-stale pattern
- Exercises are upserted first, then only exercises not in the Notion set are removed
- No data loss window — local exercises always exist during sync

---

## What's Explicitly Deferred

Not fixing now — documented so nothing is built on top of it unknowingly.

**Timezone handling**
- Week boundaries use device local time, not UTC
- Session dates stored as ISO strings but week assignment uses local Date parsing
- Users traveling across timezones may see sessions assigned to wrong weeks
- Streaks could break incorrectly at timezone boundaries
- Fixing requires: storing timezone with sessions, converting all week logic to UTC

**Notion token expiry**
- No detection of expired or revoked Notion integration tokens
- 401 responses trigger retry logic instead of prompting user to re-authenticate
- Will cause silent sync failures until user manually checks settings
- File: `src/services/notion/api.ts`

**Accessibility**
- No screen reader labels on interactive elements (camera button, timer button, week strip)
- Small text sizes (8-10px) on some labels
- No keyboard navigation support
- Color contrast may not meet WCAG standards for some status indicators

**Concurrent session saves**
- logSession uses refs to read latest state, but rapid successive saves can race
- Both reads see same gate progress, both increment, but only one write persists
- Unlikely in practice (user can't save two sessions simultaneously) but not guarded
- File: `src/hooks/useGameState.ts:162-167`

**Plank detection threshold**
- 15-degree alignment threshold is hardcoded for all users
- Doesn't account for body proportions, height, or camera angle
- May be too strict for some users and too lenient for others
- File: `src/lib/pose/exercises/plank.ts`

**Levels 4-5 exercise data**
- Exercises exist in Notion for L4-L5 but content is sparse
- Gate evaluation uses hitTarget (works for all levels), no per-exercise criteria needed
- Tree UI renders L4-L5 nodes correctly

**Notion setup guide**
- Settings links to `/settings/notion-guide` but the screen is a placeholder
- User must figure out Notion integration setup externally

**Hold timer frame drops**
- Camera-based plank timer accumulates deltaMs between frames
- Frame drops cause large deltaMs jumps, potentially over-counting hold time
- Standalone timer modal (HoldTimerModal) uses wall clock and is accurate
- File: `src/components/camera/SetCameraOverlay.tsx:70-80`

**Draft versioning**
- Auto-save overwrites previous draft without versioning
- If save fails, previous draft state is lost
- No conflict detection if draft is edited on another device via Notion
