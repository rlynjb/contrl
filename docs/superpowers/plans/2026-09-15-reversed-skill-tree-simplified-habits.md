# Reversed Skill Tree and Simplified Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the calisthenics skill tree display order and simplify the Home daily steps/plank controls to match the approved mockup.

**Architecture:** This is a refinement of the existing daily habits implementation, not a new subsystem. Keep the existing `daily_habits` table and `useDailyHabits()` hook, add small helper/update functions for the new Home behavior, rewrite `DailyHabitPanel` as a compact inline control, update History/Settings copy, and reverse only the visual order in `SkillTree`.

**Tech Stack:** React Native + Expo Router, TypeScript, `expo-sqlite`, existing `colors`/`fonts` theme, `@expo/vector-icons/Feather`.

**Spec:** [`docs/superpowers/specs/2026-09-15-reversed-skill-tree-simplified-habits-design.md`](../specs/2026-09-15-reversed-skill-tree-simplified-habits-design.md)

## Global Constraints

- Do not add a separate "Current Work" section above the tree.
- Do not redesign the full Home screen shell.
- Do not add automatic pedometer integration.
- Do not add custom plank duration entry.
- Do not use daily plank to advance push/pull/squat gates.
- Do not change workout session pass/fail logic.
- Steps row has no progress bar, no progress text, no preset chips, and no modal.
- Steps row has an inline `Goal` field with `K` suffix followed by `Log`.
- Plank row has no progress bar, no custom duration UI, and no duration chips.
- Plank row uses a fixed `4 sets · 60s` target.
- Plank count increments with `+`, stops at `4`, and gates `Log` until completion.
- Skill tree renders Level 1 first and Level 5 last.
- Push/pull/squat progression logic remains unchanged.
- Run `npx tsc --noEmit` after each task.

---

## File Structure

**Modify:**

- `src/components/SkillTree.tsx` - reverse the `LEVELS` display array only.
- `src/lib/daily-habits.ts` - add fixed plank constants and formatting helpers for the simplified UI.
- `src/services/database.ts` - add database helpers that save step goal-as-count and fixed plank completion while preserving the existing schema.
- `src/hooks/useDailyHabits.ts` - expose the new logging helpers to Home.
- `src/components/DailyHabitPanel.tsx` - replace progress/chip/modal UI with inline steps logging and gated plank set logging.
- `app/(tabs)/history.tsx` - adjust daily habit summary copy to match the simplified model.
- `app/settings/index.tsx` - remove the Home-obsolete plank duration selector and keep only useful settings.

**Verification:**

- Static verification: `npx tsc --noEmit`
- Manual Expo verification: `npm run start`, open Home, History, and Settings.

---

## Task 1: Reverse Skill Tree Display Order

**Files:**
- Modify: `src/components/SkillTree.tsx`

**Interfaces:**
- Consumes: existing `LEVELS` constant used by `SkillTree`
- Produces: same tree component API, with level rows rendered from `1` to `5`

- [ ] **Step 1: Confirm the current display order**

Run:

```bash
rg -n "const LEVELS" src/components/SkillTree.tsx
```

Expected: `const LEVELS = [5, 4, 3, 2, 1];`

- [ ] **Step 2: Reverse the display array**

Change:

```ts
const LEVELS = [5, 4, 3, 2, 1]; // top-to-bottom display
```

to:

```ts
const LEVELS = [1, 2, 3, 4, 5]; // top-to-bottom display
```

Do not change `getGate`, `getNodeState`, active-card routing, modal behavior, or user level progression.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Manual Home check**

Run:

```bash
npm run start
```

Open Home and verify the skill tree shows Level 1 first and Level 5 last, while Push/Pull/Squat cards still route to their log screens.

- [ ] **Step 5: Commit**

```bash
git add src/components/SkillTree.tsx
git commit -m "ui: reverse skill tree order"
```

---

## Task 2: Add Simplified Habit Logging Helpers

**Files:**
- Modify: `src/lib/daily-habits.ts`
- Modify: `src/services/database.ts`
- Modify: `src/hooks/useDailyHabits.ts`

**Interfaces:**
- Produces: `FIXED_PLANK_SET_COUNT: 4`
- Produces: `FIXED_PLANK_SET_SECONDS: 60`
- Produces: `FIXED_PLANK_TOTAL_SECONDS: 240`
- Produces: `stepsFromThousands(value: string): number | null`
- Produces: `stepsToThousandsInput(value: number | null, fallbackGoal: number): string`
- Produces: `plankCompletedSets(entry: DailyHabitEntry | null): number`
- Produces: `database.logDailyHabitStepsGoal(date: string, stepsGoal: number): Promise<void>`
- Produces: `database.logFixedDailyPlank(date: string): Promise<void>`
- Produces: `useDailyHabits().logStepsGoal(stepsGoal: number): Promise<void>`
- Produces: `useDailyHabits().logFixedPlank(): Promise<void>`

- [ ] **Step 1: Add fixed plank constants and step helpers**

In `src/lib/daily-habits.ts`, add:

```ts
export const FIXED_PLANK_SET_COUNT = 4
export const FIXED_PLANK_SET_SECONDS = 60
export const FIXED_PLANK_TOTAL_SECONDS = FIXED_PLANK_SET_COUNT * FIXED_PLANK_SET_SECONDS

export function stepsFromThousands(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.floor(numeric * 1000)
}

export function stepsToThousandsInput(value: number | null, fallbackGoal: number): string {
  const source = value ?? fallbackGoal
  if (!Number.isFinite(source) || source <= 0) return ''
  const thousands = source / 1000
  return Number.isInteger(thousands) ? String(thousands) : String(Math.round(thousands * 10) / 10)
}

export function plankCompletedSets(entry: DailyHabitEntry | null): number {
  if (!entry?.plankSeconds) return 0
  return Math.min(FIXED_PLANK_SET_COUNT, Math.floor(entry.plankSeconds / FIXED_PLANK_SET_SECONDS))
}
```

Keep the existing `STEP_GOALS` and `PLANK_GOALS` exports for Settings compatibility until Task 5 removes unused imports.

- [ ] **Step 2: Add database helper for steps goal logging**

In `src/services/database.ts`, after `updateDailyHabitSteps`, add:

```ts
export async function logDailyHabitStepsGoal(date: string, stepsGoal: number): Promise<void> {
  const safeGoal = Math.max(0, Math.floor(stepsGoal))
  const entry = await getOrCreateDailyHabit(date || toLocalDateKey())
  await upsertDailyHabit({
    ...entry,
    stepsCount: safeGoal,
    stepsGoal: safeGoal,
  })
}
```

This preserves the existing table shape while making the simplified Home action complete the steps habit for the selected goal.

- [ ] **Step 3: Add database helper for fixed plank logging**

Update imports in `src/services/database.ts` to include `FIXED_PLANK_TOTAL_SECONDS` from `@/lib/daily-habits`.

After `updateDailyHabitPlank`, add:

```ts
export async function logFixedDailyPlank(date: string): Promise<void> {
  const entry = await getOrCreateDailyHabit(date || toLocalDateKey())
  await upsertDailyHabit({
    ...entry,
    plankSeconds: FIXED_PLANK_TOTAL_SECONDS,
    plankGoalSeconds: FIXED_PLANK_TOTAL_SECONDS,
  })
}
```

- [ ] **Step 4: Expose hook methods**

In `src/hooks/useDailyHabits.ts`, extend `UseDailyHabitsReturn`:

```ts
  logStepsGoal: (stepsGoal: number) => Promise<void>;
  logFixedPlank: () => Promise<void>;
```

Add callbacks:

```ts
  const logStepsGoal = useCallback(async (stepsGoal: number) => {
    await db.logDailyHabitStepsGoal(todayDate, stepsGoal);
    await reload();
  }, [reload, todayDate]);

  const logFixedPlank = useCallback(async () => {
    await db.logFixedDailyPlank(todayDate);
    await reload();
  }, [reload, todayDate]);
```

Return them from the hook:

```ts
    logStepsGoal,
    logFixedPlank,
```

Leave `updateSteps`, `updatePlank`, and `updateSettings` in place so History and any older code paths remain type-compatible.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/daily-habits.ts src/services/database.ts src/hooks/useDailyHabits.ts
git commit -m "feat: add simplified habit logging helpers"
```

---

## Task 3: Replace Home Daily Habit Panel UI

**Files:**
- Modify: `src/components/DailyHabitPanel.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `stepsFromThousands`, `stepsToThousandsInput`, `plankCompletedSets`, `FIXED_PLANK_SET_COUNT`, `FIXED_PLANK_SET_SECONDS`
- Consumes: `onLogStepsGoal(stepsGoal: number): Promise<void>`
- Consumes: `onLogFixedPlank(): Promise<void>`
- Produces: no-modal Home UI for steps and fixed-plank set logging

- [ ] **Step 1: Update `DailyHabitPanel` props**

Change the prop type from:

```ts
  onUpdateSteps: (stepsCount: number) => Promise<void>;
  onUpdatePlank: (plankSeconds: number) => Promise<void>;
  onUpdateSettings: (settings: DailyHabitSettings) => Promise<void>;
```

to:

```ts
  settings: Pick<DailyHabitSettings, 'dailyStepsGoal'>;
  onLogStepsGoal: (stepsGoal: number) => Promise<void>;
  onLogFixedPlank: () => Promise<void>;
```

Keep this type import because the props use `Pick<DailyHabitSettings, 'dailyStepsGoal'>`:

```ts
import type { DailyHabitEntry, DailyHabitSettings } from '@/types';
```

- [ ] **Step 2: Remove modal/timer/chip state**

Remove these imports from `DailyHabitPanel.tsx`:

```ts
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HoldTimerModal } from './ui/HoldTimerModal';
```

Replace them with:

```ts
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

Remove:

- `entryMode`
- `entryValue`
- `timerVisible`
- `openEntry`
- `saveEntry`
- `<Modal ...>`
- `<HoldTimerModal ...>`
- `STEP_GOALS.map(...)`
- `PLANK_GOALS.map(...)`
- progress bar calculations and progress bar views

- [ ] **Step 3: Add local state for inline steps and plank set count**

Inside `DailyHabitPanel`, compute:

```ts
const initialStepsInput = useMemo(
  () => stepsToThousandsInput(today?.stepsCount ?? today?.stepsGoal ?? null, settings.dailyStepsGoal),
  [settings.dailyStepsGoal, today?.stepsCount, today?.stepsGoal]
);
const loggedPlankSets = plankCompletedSets(today);
const plankComplete = loggedPlankSets >= FIXED_PLANK_SET_COUNT;
```

Add state:

```ts
const [stepsInput, setStepsInput] = useState(initialStepsInput);
const [plankSets, setPlankSets] = useState(loggedPlankSets);
const [stepsError, setStepsError] = useState<string | null>(null);
const [savingSteps, setSavingSteps] = useState(false);
const [savingPlank, setSavingPlank] = useState(false);
```

Sync loaded values:

```ts
useEffect(() => {
  setStepsInput(initialStepsInput);
}, [initialStepsInput]);

useEffect(() => {
  setPlankSets(loggedPlankSets);
}, [loggedPlankSets]);
```

- [ ] **Step 4: Add save handlers**

Add:

```ts
const handleLogSteps = async () => {
  const stepsGoal = stepsFromThousands(stepsInput);
  if (stepsGoal == null) {
    setStepsError('Enter a goal');
    return;
  }
  setStepsError(null);
  setSavingSteps(true);
  try {
    await onLogStepsGoal(stepsGoal);
  } finally {
    setSavingSteps(false);
  }
};

const incrementPlankSets = () => {
  setPlankSets(current => Math.min(FIXED_PLANK_SET_COUNT, current + 1));
};

const handleLogPlank = async () => {
  if (plankSets < FIXED_PLANK_SET_COUNT) return;
  setSavingPlank(true);
  try {
    await onLogFixedPlank();
  } finally {
    setSavingPlank(false);
  }
};
```

- [ ] **Step 5: Replace the JSX with the simplified layout**

The returned card should have this structure:

```tsx
<View style={styles.dailyCard}>
  <View style={styles.habitRow}>
    <View style={[styles.habitIcon, styles.stepsIcon]}>
      <Feather name="navigation" size={16} color={colors.success} />
    </View>
    <Text style={styles.habitName}>Steps</Text>
    <View style={styles.inlineActionGroup}>
      <View style={styles.goalInputWrap}>
        <Text style={styles.goalInputLabel}>Goal</Text>
        <TextInput
          style={styles.goalInput}
          value={stepsInput}
          onChangeText={(value) => {
            setStepsInput(value.replace(/[^0-9.]/g, ''));
            setStepsError(null);
          }}
          keyboardType="decimal-pad"
          accessibilityLabel="Daily step goal in thousands"
        />
        <Text style={styles.goalInputSuffix}>K</Text>
      </View>
      <Pressable
        style={[styles.habitAction, savingSteps && styles.disabledButton]}
        onPress={handleLogSteps}
        disabled={savingSteps}
        accessibilityLabel={`Log ${stepsInput || '0'} thousand steps`}
      >
        <Text style={styles.habitActionText}>{savingSteps ? 'Saving' : 'Log'}</Text>
      </Pressable>
    </View>
  </View>
  {stepsError && <Text style={styles.errorText}>{stepsError}</Text>}

  <View style={styles.divider} />

  <View style={styles.habitRow}>
    <View style={[styles.habitIcon, styles.plankIcon]}>
      <Feather name="clock" size={16} color={colors.primary} />
    </View>
    <View style={styles.plankMain}>
      <View style={styles.plankTitleRow}>
        <Text style={styles.habitName}>Plank</Text>
        <Text style={styles.setCount}>{plankComplete ? FIXED_PLANK_SET_COUNT : plankSets}</Text>
        <Pressable
          style={[styles.setButton, plankSets >= FIXED_PLANK_SET_COUNT && styles.disabledButton]}
          onPress={incrementPlankSets}
          disabled={plankSets >= FIXED_PLANK_SET_COUNT}
          accessibilityLabel="Add completed plank set"
        >
          <Feather name="plus" size={14} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={styles.habitValue}>
        of {FIXED_PLANK_SET_COUNT} sets · {FIXED_PLANK_SET_SECONDS}s
      </Text>
    </View>
    <Pressable
      style={[
        styles.habitAction,
        (plankSets < FIXED_PLANK_SET_COUNT || savingPlank || plankComplete) && styles.disabledButton,
      ]}
      onPress={handleLogPlank}
      disabled={plankSets < FIXED_PLANK_SET_COUNT || savingPlank || plankComplete}
      accessibilityLabel={
        plankSets < FIXED_PLANK_SET_COUNT
          ? `Complete ${FIXED_PLANK_SET_COUNT - plankSets} more plank sets before logging`
          : 'Log completed daily plank'
      }
    >
      <Text style={styles.habitActionText}>
        {plankComplete ? 'Done' : savingPlank ? 'Saving' : 'Log'}
      </Text>
    </Pressable>
  </View>
</View>
```

Use the existing style names where they still fit. Add focused new styles for `inlineActionGroup`, `goalInputWrap`, `goalInputLabel`, `goalInput`, `goalInputSuffix`, `plankMain`, `plankTitleRow`, `setCount`, `setButton`, and `errorText`. Keep border radius `2` to match the app.

- [ ] **Step 6: Update Home prop wiring**

In `app/(tabs)/index.tsx`, change the `DailyHabitPanel` call from:

```tsx
<DailyHabitPanel
  today={today}
  settings={habitSettings}
  onUpdateSteps={updateSteps}
  onUpdatePlank={updatePlank}
  onUpdateSettings={updateSettings}
/>
```

to:

```tsx
<DailyHabitPanel
  today={today}
  settings={habitSettings}
  onLogStepsGoal={logStepsGoal}
  onLogFixedPlank={logFixedPlank}
/>
```

Update the destructuring from `useDailyHabits()` to include `logStepsGoal` and `logFixedPlank`. Remove `updateSteps`, `updatePlank`, and `updateSettings` from Home if they are no longer used there.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Manual Home check**

Run:

```bash
npm run start
```

Verify:

- Steps shows `Goal`, a numeric field, `K`, and `Log`.
- Steps has no progress bar, no progress text, no chips, and no modal.
- Plank shows the count immediately after `Plank`, then `+`, then `of 4 sets · 60s`, then `Log`.
- Plank `Log` is disabled until the count reaches `4`.
- Plank `+` stops incrementing at `4`.
- Logging steps/plank updates the `THIS WEEK` habit marks.

- [ ] **Step 9: Commit**

```bash
git add src/components/DailyHabitPanel.tsx "app/(tabs)/index.tsx"
git commit -m "ui: simplify daily habit logging"
```

---

## Task 4: Update History Habit Copy

**Files:**
- Modify: `app/(tabs)/history.tsx`

**Interfaces:**
- Consumes: existing `DailyHabitEntry`
- Consumes: `FIXED_PLANK_SET_COUNT`, `FIXED_PLANK_SET_SECONDS`, `FIXED_PLANK_TOTAL_SECONDS`, `formatSteps`
- Produces: History summaries that avoid old progress-ratio copy for new fixed-plank entries

- [ ] **Step 1: Update imports**

Change the daily habits import from:

```ts
import {
  formatSeconds,
  formatSteps,
  isPlankComplete,
  isStepsComplete,
  toLocalDateKey,
} from '../../src/lib/daily-habits';
```

to:

```ts
import {
  FIXED_PLANK_SET_COUNT,
  FIXED_PLANK_SET_SECONDS,
  FIXED_PLANK_TOTAL_SECONDS,
  formatSeconds,
  formatSteps,
  isPlankComplete,
  isStepsComplete,
  toLocalDateKey,
} from '../../src/lib/daily-habits';
```

- [ ] **Step 2: Add a plank history formatter**

Above `export default function HistoryScreen()`, add:

```ts
function formatPlankHistory(habit: DailyHabitEntry): string {
  if (habit.plankSeconds === FIXED_PLANK_TOTAL_SECONDS && habit.plankGoalSeconds === FIXED_PLANK_TOTAL_SECONDS) {
    return `Plank ${FIXED_PLANK_SET_COUNT} x ${FIXED_PLANK_SET_SECONDS}s`;
  }
  if (isPlankComplete(habit)) return 'Plank complete';
  return `Plank ${formatSeconds(habit.plankSeconds)}`;
}
```

- [ ] **Step 3: Replace habit summary text**

Change:

```tsx
Steps {formatSteps(habit.stepsCount)} / {formatSteps(habit.stepsGoal)}
```

to:

```tsx
Steps {formatSteps(habit.stepsCount)}
```

Change:

```tsx
Plank {formatSeconds(habit.plankSeconds)} / {formatSeconds(habit.plankGoalSeconds)}
```

to:

```tsx
{formatPlankHistory(habit)}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Manual History check**

Run:

```bash
npm run start
```

Log steps and plank from Home, then open History. Verify the habit summary shows copy like `Steps 8K` and `Plank 4 x 60s`.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/history.tsx"
git commit -m "ui: update daily habit history copy"
```

---

## Task 5: Simplify Daily Habit Settings

**Files:**
- Modify: `app/settings/index.tsx`

**Interfaces:**
- Consumes: existing `habitSettings`
- Produces: Settings without a daily plank duration selector

- [ ] **Step 1: Remove unused plank goal import**

Change:

```ts
import { STEP_GOALS, PLANK_GOALS } from '../../src/lib/daily-habits';
```

to:

```ts
import { STEP_GOALS } from '../../src/lib/daily-habits';
```

- [ ] **Step 2: Remove daily plank goal selector block**

Delete the block that starts with:

```tsx
<View style={styles.goalBlock}>
  <Text style={styles.rowLabel}>Daily plank goal</Text>
```

and ends after the `PLANK_GOALS.map(...)` goal grid closes.

- [ ] **Step 3: Add fixed plank info row**

In the `DAILY HABITS` section, where the deleted plank selector was, add:

```tsx
<View style={styles.row}>
  <View>
    <Text style={styles.rowLabel}>Daily plank</Text>
    <Text style={styles.rowSubtitle}>Fixed at 4 sets · 60s</Text>
  </View>
</View>
```

Keep the daily step goal chips in Settings. They can prefill the Home `Goal` field, but Home no longer shows those chips.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Manual Settings check**

Run:

```bash
npm run start
```

Open Settings and verify:

- Daily step goal chips remain.
- Daily plank no longer offers `30s`, `45s`, `60s`, `90s`.
- Daily plank displays `Fixed at 4 sets · 60s`.
- `Show on Home` still works.

- [ ] **Step 6: Commit**

```bash
git add app/settings/index.tsx
git commit -m "ui: simplify daily habit settings"
```

---

## Task 6: Final Verification and Cleanup

**Files:**
- Review: `src/components/SkillTree.tsx`
- Review: `src/components/DailyHabitPanel.tsx`
- Review: `src/lib/daily-habits.ts`
- Review: `src/services/database.ts`
- Review: `src/hooks/useDailyHabits.ts`
- Review: `app/(tabs)/index.tsx`
- Review: `app/(tabs)/history.tsx`
- Review: `app/settings/index.tsx`

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified implementation ready for merge/build

- [ ] **Step 1: Run full typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Inspect changed files**

Run:

```bash
git diff -- src/components/SkillTree.tsx src/components/DailyHabitPanel.tsx src/lib/daily-habits.ts src/services/database.ts src/hooks/useDailyHabits.ts "app/(tabs)/index.tsx" "app/(tabs)/history.tsx" app/settings/index.tsx
```

Verify:

- `SkillTree` changes only the display order.
- `DailyHabitPanel` has no modal, no progress bars, and no goal-chip rows.
- Steps saves a `K`-based value through `logStepsGoal`.
- Plank saves only after 4 completed sets.
- History copy no longer shows progress ratios for new plank entries.
- Settings no longer offers plank duration chips.

- [ ] **Step 3: Manual Home flow**

Run:

```bash
npm run start
```

On Home, verify:

- `THIS WEEK` renders.
- `TODAY` renders simplified steps and plank rows.
- Skill tree renders Level 1 at the top.
- Steps `Goal 8 K` + `Log` marks steps complete for today.
- Plank `+` increments `0`, `1`, `2`, `3`, `4`; `Log` enables only at `4`.
- Plank `Log` marks plank complete for today.

- [ ] **Step 4: Manual History and Settings flow**

With the Expo server still running, verify:

- History shows logged steps as a simple value.
- History shows fixed plank completion as `4 x 60s` or equivalent approved copy.
- Settings keeps daily step goal chips.
- Settings displays fixed plank information instead of duration choices.

- [ ] **Step 5: Final commit**

If Task 6 required cleanup edits, commit them:

```bash
git add src/components/SkillTree.tsx src/components/DailyHabitPanel.tsx src/lib/daily-habits.ts src/services/database.ts src/hooks/useDailyHabits.ts "app/(tabs)/index.tsx" "app/(tabs)/history.tsx" app/settings/index.tsx
git commit -m "chore: verify simplified habits UI"
```

If Task 6 made no edits, skip this commit.
