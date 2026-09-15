# Daily Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first daily steps and daily plank tracking to Home, History, and Settings without changing push/pull/squat workout progression.

**Architecture:** Daily habits live in a new `daily_habits` SQLite table keyed by local date, with default goals stored on the single `user_profile` row. A focused `useDailyHabits()` hook owns loading and updates, while Home, History, and Settings consume that hook without adding habit state to `useGameState`. The Home week strip gains compact habit completion marks, the Today panel handles day-of entry, and History renders habit summaries above existing workout cards.

**Tech Stack:** React Native + Expo Router, `expo-sqlite`, TypeScript, existing `colors`/`fonts` theme, `@expo/vector-icons/Feather`, existing `HoldTimerModal`.

**Spec:** [`docs/superpowers/specs/2026-09-15-daily-habits-design.md`](../specs/2026-09-15-daily-habits-design.md)

## Global Constraints

- Do not add steps as a fourth skill-tree category.
- Do not let daily plank completion advance or reset the push workout gate.
- Do not replace the current push/pull/squat weekly dots.
- Do not require a new account system or cloud dependency.
- Do not build automatic phone pedometer integration in the first version.
- Do not redesign the full History tab.
- Do not change workout session pass/fail logic.
- Use device-local `YYYY-MM-DD` date keys.
- Preserve the goal snapshot used on each daily habit entry.
- Daily habits are local-only in this first implementation.
- Run `npx tsc --noEmit` after each task.

---

## File Structure

**Create:**

- `src/lib/daily-habits.ts` - pure constants and helpers for goals, date keys, formatting, completion, and weekly date ranges.
- `src/hooks/useDailyHabits.ts` - stateful hook for today's entry, current week entries, settings, range loading, and update functions.
- `src/components/DailyHabitPanel.tsx` - Home Today card for steps and plank entry.
- `src/components/HabitWeekMarks.tsx` - two tiny completion marks for the Home week strip.

**Modify:**

- `src/types/index.ts` - add `DailyHabitEntry`, `DailyHabitSettings`, and goal settings on `User`.
- `src/services/database.ts` - add migration columns/table plus daily habit and settings accessors.
- `src/services/sync/mapper.ts` - keep remote user restore type-correct by filling local daily habit defaults.
- `app/(tabs)/index.tsx` - render weekly habit marks and `DailyHabitPanel`.
- `app/(tabs)/history.tsx` - merge daily habit summaries into existing weekly history groups.
- `app/settings/index.tsx` - add the `DAILY HABITS` settings section.

**Verification:**

- Static verification: `npx tsc --noEmit`
- Manual Expo verification: `npm run start`, open app, check Home, History, Settings interactions.

---

## Task 1: Add Daily Habit Types, Helpers, and SQLite Accessors

**Files:**
- Create: `src/lib/daily-habits.ts`
- Modify: `src/types/index.ts`
- Modify: `src/services/database.ts`
- Modify: `src/services/sync/mapper.ts`

**Interfaces:**
- Produces: `DailyHabitEntry`, `DailyHabitSettings`
- Produces: `STEP_GOALS`, `PLANK_GOALS`, `DEFAULT_DAILY_STEPS_GOAL`, `DEFAULT_DAILY_PLANK_GOAL_SECONDS`
- Produces: `toLocalDateKey(date?: Date): string`
- Produces: `getWeekDateKeys(date?: Date): string[]`
- Produces: `isStepsComplete(entry: DailyHabitEntry | null): boolean`
- Produces: `isPlankComplete(entry: DailyHabitEntry | null): boolean`
- Produces: `formatSteps(value: number | null): string`
- Produces: `formatSeconds(value: number | null): string`
- Produces database functions listed in Step 4

- [ ] **Step 1: Add daily habit types to `src/types/index.ts`**

Add this block after the `User` type:

```ts
export type DailyHabitSettings = {
  dailyStepsGoal: number
  dailyPlankGoalSeconds: number
  showDailyHabitsOnHome: boolean
}

export type DailyHabitEntry = {
  date: string
  stepsCount: number | null
  stepsGoal: number
  plankSeconds: number | null
  plankGoalSeconds: number
  updatedAt: string
}
```

Extend `User` with the same settings fields:

```ts
export type User = {
  id: string
  levels: Record<Category, number>
  dailyStepsGoal: number
  dailyPlankGoalSeconds: number
  showDailyHabitsOnHome: boolean
  createdAt: string
  notionPageId?: string | null
  updatedAt?: string
}
```

- [ ] **Step 2: Create `src/lib/daily-habits.ts`**

```ts
import { getWeekStart } from './game/week-progress'
import type { DailyHabitEntry } from '@/types'

export const DEFAULT_DAILY_STEPS_GOAL = 8000
export const DEFAULT_DAILY_PLANK_GOAL_SECONDS = 60
export const STEP_GOALS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000] as const
export const PLANK_GOALS = [30, 45, 60, 90] as const

export function toLocalDateKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getWeekDateKeys(date: Date = new Date()): string[] {
  const [year, month, day] = getWeekStart(date).split('-').map(Number)
  const start = new Date(year, month - 1, day)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toLocalDateKey(d)
  })
}

export function isStepsComplete(entry: DailyHabitEntry | null): boolean {
  return entry?.stepsCount != null && entry.stepsCount >= entry.stepsGoal
}

export function isPlankComplete(entry: DailyHabitEntry | null): boolean {
  return entry?.plankSeconds != null && entry.plankSeconds >= entry.plankGoalSeconds
}

export function formatSteps(value: number | null): string {
  if (value == null) return '-'
  if (value >= 1000) {
    const rounded = Math.round(value / 100) / 10
    return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}K`
  }
  return String(value)
}

export function formatSeconds(value: number | null): string {
  if (value == null) return '-'
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
```

- [ ] **Step 3: Add migration fields and table in `src/services/database.ts`**

Update the `user_profile` create statement to include:

```sql
      daily_steps_goal INTEGER DEFAULT 8000,
      daily_plank_goal_seconds INTEGER DEFAULT 60,
      show_daily_habits_on_home INTEGER DEFAULT 1,
```

Add the new table in the same `execAsync` block:

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

After the existing session-column migration block, add a user-profile column migration:

```ts
  const userCols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(user_profile)'
  );
  const userColNames = new Set(userCols.map(c => c.name));
  if (!userColNames.has('daily_steps_goal')) {
    await database.execAsync('ALTER TABLE user_profile ADD COLUMN daily_steps_goal INTEGER DEFAULT 8000');
  }
  if (!userColNames.has('daily_plank_goal_seconds')) {
    await database.execAsync('ALTER TABLE user_profile ADD COLUMN daily_plank_goal_seconds INTEGER DEFAULT 60');
  }
  if (!userColNames.has('show_daily_habits_on_home')) {
    await database.execAsync('ALTER TABLE user_profile ADD COLUMN show_daily_habits_on_home INTEGER DEFAULT 1');
  }
```

Add an index after the existing index block:

```sql
    CREATE INDEX IF NOT EXISTS idx_daily_habits_date ON daily_habits(date);
```

- [ ] **Step 4: Update imports and `getUser()` mapping**

Add imported types:

```ts
  DailyHabitEntry,
  DailyHabitSettings,
```

Add these row fields to the `getUser()` row type:

```ts
    daily_steps_goal: number | null;
    daily_plank_goal_seconds: number | null;
    show_daily_habits_on_home: number | null;
```

Return these fields from `getUser()`:

```ts
    dailyStepsGoal: row.daily_steps_goal ?? DEFAULT_DAILY_STEPS_GOAL,
    dailyPlankGoalSeconds: row.daily_plank_goal_seconds ?? DEFAULT_DAILY_PLANK_GOAL_SECONDS,
    showDailyHabitsOnHome: row.show_daily_habits_on_home !== 0,
```

Import defaults at the top:

```ts
import {
  DEFAULT_DAILY_PLANK_GOAL_SECONDS,
  DEFAULT_DAILY_STEPS_GOAL,
  toLocalDateKey,
} from '../lib/daily-habits';
```

- [ ] **Step 5: Add database accessors near the other data sections**

Add this block before the Sync state section:

```ts
// Daily habits

type DailyHabitRow = {
  date: string;
  steps_count: number | null;
  steps_goal: number;
  plank_seconds: number | null;
  plank_goal_seconds: number;
  updated_at: string;
};

function rowToDailyHabit(row: DailyHabitRow): DailyHabitEntry {
  return {
    date: row.date,
    stepsCount: row.steps_count,
    stepsGoal: row.steps_goal,
    plankSeconds: row.plank_seconds,
    plankGoalSeconds: row.plank_goal_seconds,
    updatedAt: row.updated_at,
  };
}

export async function getDailyHabitSettings(): Promise<DailyHabitSettings> {
  const user = await getUser();
  return {
    dailyStepsGoal: user.dailyStepsGoal,
    dailyPlankGoalSeconds: user.dailyPlankGoalSeconds,
    showDailyHabitsOnHome: user.showDailyHabitsOnHome,
  };
}

export async function updateDailyHabitSettings(settings: DailyHabitSettings): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `UPDATE user_profile
     SET daily_steps_goal = ?,
         daily_plank_goal_seconds = ?,
         show_daily_habits_on_home = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      settings.dailyStepsGoal,
      settings.dailyPlankGoalSeconds,
      settings.showDailyHabitsOnHome ? 1 : 0,
      now,
      'default',
    ]
  );
}

export async function getDailyHabit(date: string): Promise<DailyHabitEntry | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<DailyHabitRow>(
    'SELECT * FROM daily_habits WHERE date = ?',
    [date]
  );
  return row ? rowToDailyHabit(row) : null;
}

export async function getDailyHabitsInRange(startDate: string, endDate: string): Promise<DailyHabitEntry[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<DailyHabitRow>(
    'SELECT * FROM daily_habits WHERE date >= ? AND date <= ? ORDER BY date DESC',
    [startDate, endDate]
  );
  return rows.map(rowToDailyHabit);
}

export async function upsertDailyHabit(entry: DailyHabitEntry): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `INSERT OR REPLACE INTO daily_habits
     (date, steps_count, steps_goal, plank_seconds, plank_goal_seconds, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.stepsCount,
      entry.stepsGoal,
      entry.plankSeconds,
      entry.plankGoalSeconds,
      now,
    ]
  );
}

async function getOrCreateDailyHabit(date: string): Promise<DailyHabitEntry> {
  const existing = await getDailyHabit(date);
  if (existing) return existing;
  const settings = await getDailyHabitSettings();
  return {
    date,
    stepsCount: null,
    stepsGoal: settings.dailyStepsGoal,
    plankSeconds: null,
    plankGoalSeconds: settings.dailyPlankGoalSeconds,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateDailyHabitSteps(date: string, stepsCount: number): Promise<void> {
  const entry = await getOrCreateDailyHabit(date || toLocalDateKey());
  await upsertDailyHabit({
    ...entry,
    stepsCount: Math.max(0, Math.floor(stepsCount)),
  });
}

export async function updateDailyHabitPlank(date: string, plankSeconds: number): Promise<void> {
  const entry = await getOrCreateDailyHabit(date || toLocalDateKey());
  await upsertDailyHabit({
    ...entry,
    plankSeconds: Math.max(0, Math.floor(plankSeconds)),
  });
}
```

- [ ] **Step 6: Keep `userFromRemote()` type-correct**

In `src/services/sync/mapper.ts`, add:

```ts
import {
  DEFAULT_DAILY_PLANK_GOAL_SECONDS,
  DEFAULT_DAILY_STEPS_GOAL,
} from '@/lib/daily-habits';
```

Then update `userFromRemote()` to include local daily habit defaults:

```ts
export function userFromRemote(r: any): User {
  return {
    id: 'default',
    levels: {
      push: r.push_level,
      pull: r.pull_level,
      squat: r.squat_level,
    },
    dailyStepsGoal: DEFAULT_DAILY_STEPS_GOAL,
    dailyPlankGoalSeconds: DEFAULT_DAILY_PLANK_GOAL_SECONDS,
    showDailyHabitsOnHome: true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notionPageId: null,
  };
}
```

Leave `userToRemote()` unchanged for this first version because daily habits are local-only.

- [ ] **Step 7: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/daily-habits.ts src/services/database.ts src/services/sync/mapper.ts
git commit -m "feat(habits): add local daily habit storage"
```

---

## Task 2: Add `useDailyHabits()` Hook

**Files:**
- Create: `src/hooks/useDailyHabits.ts`

**Interfaces:**
- Consumes: database functions from Task 1
- Produces: `useDailyHabits(): UseDailyHabitsReturn`

- [ ] **Step 1: Create `src/hooks/useDailyHabits.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import type { DailyHabitEntry, DailyHabitSettings } from '@/types'
import * as db from '@/services/database'
import { getWeekDateKeys, toLocalDateKey } from '@/lib/daily-habits'

type DailyHabitsStatus = 'loading' | 'ready' | 'error'

export type UseDailyHabitsReturn = {
  status: DailyHabitsStatus
  error: string | null
  todayDate: string
  today: DailyHabitEntry | null
  weekEntries: Record<string, DailyHabitEntry>
  settings: DailyHabitSettings | null
  reload: () => Promise<void>
  loadRange: (startDate: string, endDate: string) => Promise<DailyHabitEntry[]>
  updateSteps: (stepsCount: number) => Promise<void>
  updatePlank: (plankSeconds: number) => Promise<void>
  updateSettings: (settings: DailyHabitSettings) => Promise<void>
}

export function useDailyHabits(): UseDailyHabitsReturn {
  const [todayDate] = useState(() => toLocalDateKey())
  const [weekDates] = useState(() => getWeekDateKeys())
  const [status, setStatus] = useState<DailyHabitsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState<DailyHabitEntry | null>(null)
  const [weekEntries, setWeekEntries] = useState<Record<string, DailyHabitEntry>>({})
  const [settings, setSettings] = useState<DailyHabitSettings | null>(null)

  const loadRange = useCallback((startDate: string, endDate: string) => {
    return db.getDailyHabitsInRange(startDate, endDate)
  }, [])

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [loadedSettings, loadedToday, loadedWeek] = await Promise.all([
        db.getDailyHabitSettings(),
        db.getDailyHabit(todayDate),
        db.getDailyHabitsInRange(weekDates[0], weekDates[6]),
      ])
      const byDate: Record<string, DailyHabitEntry> = {}
      for (const entry of loadedWeek) byDate[entry.date] = entry
      setSettings(loadedSettings)
      setToday(loadedToday)
      setWeekEntries(byDate)
      setStatus('ready')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load daily habits'
      setError(message)
      setStatus('error')
    }
  }, [todayDate, weekDates])

  useEffect(() => {
    reload()
  }, [reload])

  const updateSteps = useCallback(async (stepsCount: number) => {
    await db.updateDailyHabitSteps(todayDate, stepsCount)
    await reload()
  }, [reload, todayDate])

  const updatePlank = useCallback(async (plankSeconds: number) => {
    await db.updateDailyHabitPlank(todayDate, plankSeconds)
    await reload()
  }, [reload, todayDate])

  const updateSettings = useCallback(async (nextSettings: DailyHabitSettings) => {
    await db.updateDailyHabitSettings(nextSettings)
    setSettings(nextSettings)
    await reload()
  }, [reload])

  return {
    status,
    error,
    todayDate,
    today,
    weekEntries,
    settings,
    reload,
    loadRange,
    updateSteps,
    updatePlank,
    updateSettings,
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDailyHabits.ts
git commit -m "feat(habits): add daily habits hook"
```

---

## Task 3: Add Home Today Panel and Weekly Habit Marks

**Files:**
- Create: `src/components/HabitWeekMarks.tsx`
- Create: `src/components/DailyHabitPanel.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useDailyHabits()` from Task 2
- Consumes: `isStepsComplete(entry)`, `isPlankComplete(entry)`, `formatSteps(value)`, `formatSeconds(value)`
- Produces: Home layout order `THIS WEEK`, `TODAY`, `Skill Tree`

- [ ] **Step 1: Create `src/components/HabitWeekMarks.tsx`**

```tsx
import { View, StyleSheet } from 'react-native'
import { colors } from '@/constants/theme'
import type { DailyHabitEntry } from '@/types'
import { isPlankComplete, isStepsComplete } from '@/lib/daily-habits'

type Props = {
  entry: DailyHabitEntry | null
}

export function HabitWeekMarks({ entry }: Props) {
  const stepsDone = isStepsComplete(entry)
  const plankDone = isPlankComplete(entry)
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Steps ${stepsDone ? 'complete' : 'not complete'}, plank ${plankDone ? 'complete' : 'not complete'}`}
    >
      <View style={[styles.mark, stepsDone && styles.stepsDone]} />
      <View style={[styles.mark, plankDone && styles.plankDone]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 3,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 5,
    height: 5,
    borderRadius: 0,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
  stepsDone: {
    backgroundColor: colors.success,
    opacity: 1,
  },
  plankDone: {
    backgroundColor: colors.primary,
    opacity: 1,
  },
})
```

- [ ] **Step 2: Create `src/components/DailyHabitPanel.tsx`**

Implement a compact card with two rows, a step-entry modal, a plank manual-entry modal, and `HoldTimerModal`.

Use these props:

```ts
type Props = {
  today: DailyHabitEntry | null
  settings: DailyHabitSettings
  onUpdateSteps: (stepsCount: number) => Promise<void>
  onUpdatePlank: (plankSeconds: number) => Promise<void>
  onUpdateSettings: (settings: DailyHabitSettings) => Promise<void>
}
```

Use these key implementation details:

```tsx
const stepsValue = today?.stepsCount ?? null
const stepsGoal = today?.stepsGoal ?? settings.dailyStepsGoal
const plankValue = today?.plankSeconds ?? null
const plankGoal = today?.plankGoalSeconds ?? settings.dailyPlankGoalSeconds
const stepsPct = stepsGoal > 0 && stepsValue != null ? Math.min(100, Math.round((stepsValue / stepsGoal) * 100)) : 0
const plankPct = plankGoal > 0 && plankValue != null ? Math.min(100, Math.round((plankValue / plankGoal) * 100)) : 0
```

Use `STEP_GOALS` and `PLANK_GOALS` as chip data. A custom plank target should be supported with a numeric modal that calls:

```ts
onUpdateSettings({
  ...settings,
  dailyPlankGoalSeconds: nextSeconds,
})
```

For step goal chips, call:

```ts
onUpdateSettings({
  ...settings,
  dailyStepsGoal: goal,
})
```

For plank timer completion, call:

```ts
onUpdatePlank(seconds)
```

For manual entry modals, clamp parsed values with:

```ts
Math.max(0, Math.floor(Number(value) || 0))
```

Style requirements:

- `dailyCard`: `backgroundColor: colors.surface`, `borderRadius: 2`, `borderColor: colors.primary + '25'`
- habit rows use `Feather` icons `navigation` for steps and `clock` for plank
- progress tracks use the same square, thin style as existing `ProgressBar`/history bars
- action buttons use compact square-ish borders and existing `colors.primaryDim`

- [ ] **Step 3: Modify Home imports**

In `app/(tabs)/index.tsx`, add:

```ts
import { DailyHabitPanel } from '../../src/components/DailyHabitPanel';
import { HabitWeekMarks } from '../../src/components/HabitWeekMarks';
import { useDailyHabits } from '../../src/hooks/useDailyHabits';
import { getWeekDateKeys } from '../../src/lib/daily-habits';
```

- [ ] **Step 4: Load daily habits on Home**

Inside `HomeScreen`, add:

```ts
  const {
    status: habitStatus,
    today,
    weekEntries,
    settings: habitSettings,
    updateSteps,
    updatePlank,
    updateSettings,
  } = useDailyHabits();
```

Add:

```ts
  const weekDateKeys = useMemo(() => getWeekDateKeys(), []);
```

- [ ] **Step 5: Add weekly habit marks below each day**

Inside the `DAY_LABELS.map`, after the category label, render:

```tsx
                {habitSettings?.showDailyHabitsOnHome !== false && (
                  <HabitWeekMarks entry={weekEntries[weekDateKeys[i]] ?? null} />
                )}
```

Increase `dayCatLabel.height` from `10` to `11` only if marks need breathing room. Do not change the main dot color semantics.

- [ ] **Step 6: Add the Today panel before the skill tree**

Between the week section and skill tree section, add:

```tsx
      {habitSettings?.showDailyHabitsOnHome !== false && habitSettings && (
        <View style={styles.todaySection}>
          <Text style={styles.sectionHeader}>TODAY</Text>
          <DailyHabitPanel
            today={today}
            settings={habitSettings}
            onUpdateSteps={updateSteps}
            onUpdatePlank={updatePlank}
            onUpdateSettings={updateSettings}
          />
        </View>
      )}
```

Add style:

```ts
  todaySection: {
    marginBottom: 22,
  },
```

Do not block Home rendering when `habitStatus === 'error'`; omit the Today panel and marks if settings are unavailable.

- [ ] **Step 7: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8: Manual Home verification**

Run:

```bash
npm run start
```

Expected in Expo:

- Home order is `THIS WEEK`, `TODAY`, `Skill Tree`.
- Existing workout dots still show push/pull/squat color.
- Step and plank marks appear under each day.
- Editing steps updates today's display.
- Starting/completing plank updates today's display.
- Changing step/plank goals updates the selected chip and progress denominator.

- [ ] **Step 9: Commit**

```bash
git add src/components/HabitWeekMarks.tsx src/components/DailyHabitPanel.tsx app/\(tabs\)/index.tsx
git commit -m "feat(habits): add home daily habit controls"
```

---

## Task 4: Add Daily Habit Summaries to History

**Files:**
- Modify: `app/(tabs)/history.tsx`

**Interfaces:**
- Consumes: `getDailyHabitsInRange(startDate, endDate)`
- Consumes: `formatSteps`, `formatSeconds`, `isStepsComplete`, `isPlankComplete`
- Produces: History week groups that include habit-only dates and workout dates

- [ ] **Step 1: Add imports**

```ts
import { useFocusEffect } from 'expo-router';
import * as database from '../../src/services/database';
import {
  formatSeconds,
  formatSteps,
  isPlankComplete,
  isStepsComplete,
} from '../../src/lib/daily-habits';
import type { DailyHabitEntry } from '../../src/types';
```

If `useFocusEffect` conflicts with existing imports, merge it into the existing `expo-router` import shape used in this file.

- [ ] **Step 2: Add habit state and range loading**

Inside `HistoryScreen`, add:

```ts
  const [habitEntries, setHabitEntries] = useState<Record<string, DailyHabitEntry>>({});
```

After `weekGroups` is computed, add:

```ts
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    async function loadHabits() {
      if (weekGroups.length === 0) {
        setHabitEntries({});
        return;
      }
      const starts = weekGroups.map(g => g.weekStart).sort();
      const first = starts[0];
      const lastStart = starts[starts.length - 1];
      const last = new Date(lastStart + 'T00:00:00');
      last.setDate(last.getDate() + 6);
      const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
      const entries = await database.getDailyHabitsInRange(first, end);
      if (cancelled) return;
      const byDate: Record<string, DailyHabitEntry> = {};
      for (const entry of entries) byDate[entry.date] = entry;
      setHabitEntries(byDate);
    }
    loadHabits().catch(() => {});
    return () => { cancelled = true; };
  }, [weekGroups]));
```

- [ ] **Step 3: Render habit summary rows inside each week**

For each week group, derive date keys that include both workout dates and habit dates:

```ts
const sessionDates = group.sessions.map(s => s.date.slice(0, 10));
const weekEnd = new Date(group.weekStart + 'T00:00:00');
weekEnd.setDate(weekEnd.getDate() + 6);
const habitDates = Object.keys(habitEntries).filter(date => {
  return date >= group.weekStart && date <= `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
});
const dates = Array.from(new Set([...sessionDates, ...habitDates])).sort((a, b) => b.localeCompare(a));
```

Within each `date`, render the habit summary first when present:

```tsx
const habit = habitEntries[date];
{habit && (
  <View style={styles.habitSummaryRow}>
    <View style={styles.habitSummaryItem}>
      <Feather
        name={isStepsComplete(habit) ? 'check' : 'minus'}
        size={12}
        color={isStepsComplete(habit) ? colors.success : colors.muted}
      />
      <Text style={styles.habitSummaryText}>
        Steps {formatSteps(habit.stepsCount)} / {formatSteps(habit.stepsGoal)}
      </Text>
    </View>
    <View style={styles.habitSummaryItem}>
      <Feather
        name={isPlankComplete(habit) ? 'check' : 'minus'}
        size={12}
        color={isPlankComplete(habit) ? colors.success : colors.muted}
      />
      <Text style={styles.habitSummaryText}>
        Plank {formatSeconds(habit.plankSeconds)} / {formatSeconds(habit.plankGoalSeconds)}
      </Text>
    </View>
  </View>
)}
```

Then render the existing session cards for `group.sessions.filter(s => s.date.slice(0, 10) === date)`.

- [ ] **Step 4: Add History styles**

```ts
  habitSummaryRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  habitSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  habitSummaryText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
```

- [ ] **Step 5: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Manual History verification**

Run:

```bash
npm run start
```

Expected in Expo:

- History still groups by week newest first.
- Habit rows appear for dates that have daily habits.
- Existing workout cards still expand.
- Habit rows appear above workout cards for the same date.
- A habit-only date appears in the week group.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/history.tsx
git commit -m "feat(habits): show daily summaries in history"
```

---

## Task 5: Add Daily Habit Settings

**Files:**
- Modify: `app/settings/index.tsx`

**Interfaces:**
- Consumes: `useDailyHabits()`
- Consumes: `STEP_GOALS`, `PLANK_GOALS`
- Produces: Settings controls for daily step goal, daily plank goal, and Home visibility

- [ ] **Step 1: Add imports**

```ts
import { Switch } from 'react-native';
import { STEP_GOALS, PLANK_GOALS } from '../../src/lib/daily-habits';
import { useDailyHabits } from '../../src/hooks/useDailyHabits';
```

Merge `Switch` into the existing `react-native` import list.

- [ ] **Step 2: Load daily habit settings**

Inside `SettingsScreen`, add:

```ts
  const {
    settings: habitSettings,
    updateSettings: updateHabitSettings,
  } = useDailyHabits();
```

Add a helper:

```ts
  const updateHabitSettingValue = useCallback(async (
    patch: Partial<NonNullable<typeof habitSettings>>
  ) => {
    if (!habitSettings) return;
    await updateHabitSettings({ ...habitSettings, ...patch });
  }, [habitSettings, updateHabitSettings]);
```

- [ ] **Step 3: Render `DAILY HABITS` before `ABOUT`**

Place this section after `SYNC LEDGER` and before `ABOUT`:

```tsx
      {habitSettings && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>DAILY HABITS</Text>
          <View style={styles.goalBlock}>
            <Text style={styles.rowLabel}>Daily step goal</Text>
            <View style={styles.goalGrid}>
              {STEP_GOALS.map(goal => (
                <Pressable
                  key={goal}
                  style={[
                    styles.goalChip,
                    habitSettings.dailyStepsGoal === goal && styles.goalChipActive,
                  ]}
                  onPress={() => updateHabitSettingValue({ dailyStepsGoal: goal })}
                >
                  <Text
                    style={[
                      styles.goalChipText,
                      habitSettings.dailyStepsGoal === goal && styles.goalChipTextActive,
                    ]}
                  >
                    {goal / 1000}K
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.goalBlock}>
            <Text style={styles.rowLabel}>Daily plank goal</Text>
            <View style={styles.goalGrid}>
              {PLANK_GOALS.map(goal => (
                <Pressable
                  key={goal}
                  style={[
                    styles.goalChip,
                    habitSettings.dailyPlankGoalSeconds === goal && styles.goalChipActive,
                  ]}
                  onPress={() => updateHabitSettingValue({ dailyPlankGoalSeconds: goal })}
                >
                  <Text
                    style={[
                      styles.goalChipText,
                      habitSettings.dailyPlankGoalSeconds === goal && styles.goalChipTextActive,
                    ]}
                  >
                    {goal}s
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>Show on Home</Text>
              <Text style={styles.rowSubtitle}>Today card and weekly habit marks</Text>
            </View>
            <Switch
              value={habitSettings.showDailyHabitsOnHome}
              onValueChange={(value) => updateHabitSettingValue({ showDailyHabitsOnHome: value })}
              trackColor={{ false: colors.border, true: colors.primary + '55' }}
              thumbColor={habitSettings.showDailyHabitsOnHome ? colors.primary : colors.muted}
            />
          </View>
        </>
      )}
```

- [ ] **Step 4: Add Settings styles**

```ts
  goalBlock: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalChip: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  goalChipActive: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryDim,
  },
  goalChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  goalChipTextActive: {
    color: colors.primary,
  },
```

- [ ] **Step 5: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Manual Settings verification**

Run:

```bash
npm run start
```

Expected in Expo:

- Settings shows `DAILY HABITS`.
- Selecting a step goal persists after navigating away and back.
- Selecting a plank goal persists after navigating away and back.
- Turning `Show on Home` off hides the Today card and weekly habit marks.
- Turning `Show on Home` back on restores them.

- [ ] **Step 7: Commit**

```bash
git add app/settings/index.tsx
git commit -m "feat(habits): add daily habit settings"
```

---

## Task 6: Final Verification and Documentation Touch-Up

**Files:**
- Modify: `README.md` only if the implemented user flow needs a short note.
- Modify: `SPEC.md` only if the project-level app spec should list daily habits immediately.

**Interfaces:**
- Consumes: completed Tasks 1-5
- Produces: final verified implementation branch

- [ ] **Step 1: Run TypeScript verification**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run Expo manual smoke test**

```bash
npm run start
```

Expected manual checks:

- Home loads with no red screen.
- Home order is `THIS WEEK`, `TODAY`, `Skill Tree`.
- Steps can be entered manually and remain after app reload.
- Plank can be saved from timer and remains after app reload.
- Changing today's goals preserves already-saved old History rows because daily entries store their own goal fields.
- History shows habit summaries above same-day workout cards.
- Push/pull/squat sessions still update skill tree and history as before.
- Daily plank does not update push gate progress.
- Daily steps do not create workout sessions.

- [ ] **Step 3: Inspect final diff**

```bash
git status --short
git diff --stat HEAD
```

Expected: only intentional files from this plan are modified.

- [ ] **Step 4: Commit docs if changed**

If `README.md` or `SPEC.md` changed, commit them:

```bash
git add README.md SPEC.md
git commit -m "docs: document daily habits"
```

If no docs changed, skip this commit.

- [ ] **Step 5: Report completion evidence**

Final report should include:

- The `npx tsc --noEmit` result.
- Whether Expo manual smoke testing was completed.
- Any remaining risks, especially if device testing was not available.
