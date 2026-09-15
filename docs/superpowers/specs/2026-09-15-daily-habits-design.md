# Daily habits on Home and History - design

**Date:** 2026-09-15
**Status:** Approved design (pending implementation plan)

## Goal

Add daily step tracking and daily plank tracking to contrl without mixing those habits into the push/pull/squat progression system. The Home screen should answer "what do I need to do today?" while preserving the current skill tree as the main workout progression surface.

The approved placement is:

```
Home
+-- THIS WEEK
|     - main workout dot per day
|     - compact secondary completion marks for steps and plank
|
+-- TODAY
|     - Steps progress, editable daily count, selectable daily goal
|     - Plank progress, timer/manual entry, selectable daily goal
|
+-- Skill Tree
      - unchanged push/pull/squat progression cards and nodes
```

## Non-goals

- Do not add steps as a fourth skill-tree category.
- Do not let daily plank completion advance or reset the push workout gate.
- Do not replace the current push/pull/squat weekly dots.
- Do not require a new account system or cloud dependency.
- Do not build automatic phone pedometer integration in the first version.
- Do not redesign the full History tab.
- Do not change workout session pass/fail logic.

## Concepts

### Workout sessions

Workout sessions remain the progression data for push, pull, and squat. They continue to drive:

- Skill tree levels
- Gate progress
- Weekly workout completion
- Workout history cards

### Daily habits

Daily habits are date-based personal checkpoints. The first two habits are:

- `steps`: a numeric count toward a configurable daily step goal
- `plank`: a number of seconds toward a configurable daily plank goal

Daily habits do not affect workout gates. They are logged alongside the day, not inside a push/pull/squat workout session.

## Home UI

### THIS WEEK section

The existing seven-day strip keeps its primary meaning: the main dot shows whether a push/pull/squat session was logged on that day. The dot remains colored by workout category.

Add two tiny secondary completion marks under each day:

```
Mon     Tue     Wed     Thu
dot     dot     dot     dot      workout session
s p     s -     - -     - -      steps / plank
```

Visual rules:

- Main dot: existing workout session indicator.
- First small mark: steps goal completed.
- Second small mark: plank goal completed.
- Filled mark: goal met for that date.
- Dim/empty mark: goal not met.
- Today still gets the existing outline behavior when no workout session exists.

The weekly strip should stay compact. It shows completion state only, not exact counts or seconds.

### TODAY section

Insert a new `TODAY` section between `THIS WEEK` and the skill tree.

The section contains one compact daily card with two habit rows.

Steps row:

```
[footsteps icon] Steps        6.2K / 8K      [Edit]
                 progress bar
                 1K 3K 5K 8K 10K
```

Plank row:

```
[timer icon]     Plank        0:45 / 1:00    [Start]
                 progress bar
                 30s 45s 60s 90s Custom
```

Interaction rules:

- Tapping a step goal chip changes the default daily step target.
- Tapping `Edit` opens a numeric step entry affordance for today's count.
- Tapping a plank target chip changes the default daily plank target.
- Tapping `Start` opens a plank timer using the same visual language as `HoldTimerModal`.
- Manual plank entry should also be available, because the user may log a plank performed away from the phone.

Display rules:

- Show actual progress against the goal, such as `6.2K / 8K` and `0:45 / 1:00`.
- Use the existing dark theme, square-ish card style, compact section labels, and Feather/Lucide-style icon language.
- Keep the skill tree visible below the Today card on normal phone heights, even if some lower nodes require scroll.

## History UI

History should include daily habits as a compact daily summary, not as full workout session cards.

Recommended structure:

```
Sep 14 - Sep 20

Mon
Steps 8.1K checked    Plank 60s checked
Push L1               100%

Tue
Steps 6.2K            Plank 45s
Pull L1               83%
```

History grouping remains weekly, newest first. Within each week:

- Group entries by local date.
- Render the daily habit summary for a date before that date's workout session cards.
- Keep existing workout cards expandable exactly as they are.
- If a date has habits but no workout, still show that date row.
- If a date has a workout but no habit data, show the workout normally and omit the habit summary for that date.

Goal preservation rule:

- Each saved daily habit entry stores the goal used on that date.
- If the default step or plank goal changes later, old History rows keep their original completion result.

## Settings UI

Add a `DAILY HABITS` section to Settings.

Rows:

- Daily step goal: selectable 1K through 10K in 1K increments.
- Daily plank goal: selectable 30s, 45s, 60s, 90s, or custom.
- Show daily habits on Home: optional boolean if the user later wants a quieter Home screen.

The first implementation can keep these controls simple and inline, matching the existing Settings row style.

## Data model

Add a local SQLite table for daily habit entries.

```sql
CREATE TABLE IF NOT EXISTS daily_habits (
  date TEXT PRIMARY KEY,
  steps_count INTEGER,
  steps_goal INTEGER NOT NULL,
  plank_seconds INTEGER,
  plank_goal_seconds INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
```

`date` is a device-local date key in `YYYY-MM-DD` format. This matches the current app's local-first week/day model.

Suggested TypeScript type:

```ts
export type DailyHabitEntry = {
  date: string;
  stepsCount: number | null;
  stepsGoal: number;
  plankSeconds: number | null;
  plankGoalSeconds: number;
  updatedAt: string;
};
```

Completion helpers:

```ts
stepsComplete = stepsCount != null && stepsCount >= stepsGoal
plankComplete = plankSeconds != null && plankSeconds >= plankGoalSeconds
```

Add local settings for default goals. These may live in `user_profile` at first:

```sql
daily_steps_goal INTEGER DEFAULT 8000
daily_plank_goal_seconds INTEGER DEFAULT 60
```

If more habits are added later, this can migrate to a separate habit settings table. For the current scope, columns on `user_profile` are simpler and consistent with the single-user app.

## App API

Add database helpers in `src/services/database.ts`:

```ts
getDailyHabit(date: string): Promise<DailyHabitEntry | null>
getDailyHabitsInRange(startDate: string, endDate: string): Promise<DailyHabitEntry[]>
upsertDailyHabit(entry: DailyHabitEntry): Promise<void>
updateDailyHabitSteps(date: string, stepsCount: number): Promise<void>
updateDailyHabitPlank(date: string, plankSeconds: number): Promise<void>
```

Add a focused hook:

```ts
useDailyHabits()
```

Responsibilities:

- Load today's habit entry.
- Load the current week's habit entries for the Home week strip.
- Load date ranges for History.
- Expose update functions for steps, plank, and goals.
- Preserve the goal snapshot when writing a daily entry.

This keeps daily habit state separate from `useGameState`, which should remain focused on workout progression.

## Sync behavior

The first version can be local-only. If Supabase sync is extended for this feature, add `daily_habits` to the synced table set with the same last-edit-wins approach currently used for sessions.

Sync should preserve:

- Date key
- Actual values
- Goal snapshot for that date
- Updated timestamp

Settings for default goals should sync with `user_profile` if those columns are added there.

## Error handling

- If today's daily habit entry fails to load, Home should still render the existing weekly strip and skill tree.
- If saving steps or plank fails, keep the entered value visible locally in component state and show a compact retry/error state.
- Invalid manual values are clamped to non-negative integers.
- A blank manual value means "not logged", not zero completed.

## Accessibility and input

- Step and plank goal selectors should be real pressable controls with visible selected state.
- The timer start action should have a clear accessible label.
- Numeric entry fields should use numeric keyboards.
- Progress bars should have accessible labels, such as "Steps progress, 6200 of 8000".
- Completion marks in the week strip should not rely on color alone; use shape/fill state and accessible labels.

## Acceptance criteria

1. Home renders in this order: `THIS WEEK`, `TODAY`, `Skill Tree`.
2. The existing workout day dots still represent push/pull/squat sessions.
3. The week strip shows compact steps/plank completion marks for each day.
4. The Today panel shows today's step count, step goal, plank seconds, and plank goal.
5. The user can choose a daily step goal from 1K through 10K.
6. The user can choose a daily plank goal from 30s, 45s, 60s, 90s, or custom.
7. The user can manually log today's steps.
8. The user can start a plank timer and save the completed seconds.
9. Daily plank completion does not update push gate progress.
10. Daily steps do not create workout sessions.
11. History groups daily habit summaries by date inside the existing weekly grouping.
12. History preserves the goal snapshot used on the original date.
13. Existing workout History cards still expand and display exercise breakdowns.
14. Loading or saving daily habits does not block the existing workout UI from rendering.

## Tradeoffs

| Choice | Why | Cost |
|---|---|---|
| Add a Today panel on Home | Makes daily habits visible without adding a tab | Pushes the skill tree slightly lower |
| Keep habits separate from sessions | Avoids corrupting progression semantics | Requires a new table and hook |
| Add small weekly habit marks | Gives weekly accountability at a glance | The week strip becomes denser |
| Preserve historical goals | Old days remain truthful after goal changes | Each daily row stores goal snapshots |
| Manual steps first | Simpler, reliable, no permissions | No automatic pedometer in first version |

## Future work

- Automatic step import from device health APIs.
- Daily habit streaks.
- More daily habits, such as mobility or hydration.
- Supabase sync for `daily_habits`.
- Goal presets by weekday.
- Collapsible Today panel if the Home screen feels too tall after real-device testing.
