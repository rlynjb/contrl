import { useCallback, useEffect, useState } from 'react';
import type { DailyHabitEntry, DailyHabitSettings } from '@/types';
import * as db from '@/services/database';
import { getWeekDateKeys, toLocalDateKey } from '@/lib/daily-habits';

type DailyHabitsStatus = 'loading' | 'ready' | 'error';

export type UseDailyHabitsReturn = {
  status: DailyHabitsStatus;
  error: string | null;
  todayDate: string;
  today: DailyHabitEntry | null;
  weekEntries: Record<string, DailyHabitEntry>;
  settings: DailyHabitSettings | null;
  reload: () => Promise<void>;
  loadRange: (startDate: string, endDate: string) => Promise<DailyHabitEntry[]>;
  updateSteps: (stepsCount: number) => Promise<void>;
  updatePlank: (plankSeconds: number) => Promise<void>;
  updateSettings: (settings: DailyHabitSettings) => Promise<void>;
};

export function useDailyHabits(): UseDailyHabitsReturn {
  const [todayDate] = useState(() => toLocalDateKey());
  const [weekDates] = useState(() => getWeekDateKeys());
  const [status, setStatus] = useState<DailyHabitsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<DailyHabitEntry | null>(null);
  const [weekEntries, setWeekEntries] = useState<Record<string, DailyHabitEntry>>({});
  const [settings, setSettings] = useState<DailyHabitSettings | null>(null);

  const loadRange = useCallback((startDate: string, endDate: string) => {
    return db.getDailyHabitsInRange(startDate, endDate);
  }, []);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [loadedSettings, loadedToday, loadedWeek] = await Promise.all([
        db.getDailyHabitSettings(),
        db.getDailyHabit(todayDate),
        db.getDailyHabitsInRange(weekDates[0], weekDates[6]),
      ]);
      const byDate: Record<string, DailyHabitEntry> = {};
      for (const entry of loadedWeek) byDate[entry.date] = entry;
      setSettings(loadedSettings);
      setToday(loadedToday);
      setWeekEntries(byDate);
      setStatus('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load daily habits';
      setError(message);
      setStatus('error');
    }
  }, [todayDate, weekDates]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateSteps = useCallback(async (stepsCount: number) => {
    await db.updateDailyHabitSteps(todayDate, stepsCount);
    await reload();
  }, [reload, todayDate]);

  const updatePlank = useCallback(async (plankSeconds: number) => {
    await db.updateDailyHabitPlank(todayDate, plankSeconds);
    await reload();
  }, [reload, todayDate]);

  const updateSettings = useCallback(async (nextSettings: DailyHabitSettings) => {
    await db.updateDailyHabitSettings(nextSettings);
    setSettings(nextSettings);
    await reload();
  }, [reload]);

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
  };
}
