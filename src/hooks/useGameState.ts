import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import type {
  Category,
  WorkoutSession,
  GateProgress,
  WeekProgress,
  User,
  DraftSession,
} from '@/types';
import { CATEGORIES } from '@/types';
import * as db from '@/services/database';
import {
  createGateProgress,
} from '@/lib/game/gate-check';
import type { SessionResult } from '@/lib/game/gate-check';
import {
  getWeekStart,
  createWeekProgress,
  markCategoryDone,
  isWeekComplete,
  needsWeekReset,
  completedCount,
} from '@/lib/game/week-progress';
import { calculateStreak } from '@/lib/game/streaks';
import { checkCategoryLevelUp } from '@/lib/game/progression';
import { reconstructFromSessions } from '@/lib/game/reconstruct';

export type LogSessionResult = {
  sessionResult: SessionResult;
  gateProgress: GateProgress;
  leveledUp: boolean;
  newLevel?: number;
};

export type GameStateStatus = 'loading' | 'ready' | 'error';

export interface UseGameStateReturn {
  status: GameStateStatus;
  error: string | null;
  user: User | null;
  weekProgress: WeekProgress | null;
  streak: number;
  gateProgress: Record<string, GateProgress>;
  sessions: WorkoutSession[];
  categoryDoneThisWeek: Record<Category, boolean>;
  weekComplete: boolean;
  completedThisWeek: number;
  logSession: (session: WorkoutSession) => Promise<LogSessionResult>;
  getGateForCategory: (category: Category) => GateProgress | null;
  saveDraft: (draft: DraftSession) => Promise<void>;
  loadDraft: (category: Category, level: number) => Promise<DraftSession | null>;
  reload: () => Promise<void>;
}

function gateKey(category: Category, level: number) {
  return `${category}:${level}`;
}

export const GameStateContext = createContext<UseGameStateReturn | null>(null);

export function useGameState(): UseGameStateReturn {
  const ctx = useContext(GameStateContext);
  if (ctx) return ctx;
  throw new Error('useGameState must be used within a GameStateProvider');
}

export function useGameStateInternal(dbReady: boolean = true): UseGameStateReturn {
  const [status, setStatus] = useState<GameStateStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [weekProgress, setWeekProgress] = useState<WeekProgress | null>(null);
  const [streak, setStreak] = useState(0);
  const [gateProgress, setGateProgress] = useState<Record<string, GateProgress>>({});
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const initRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    let loadedUser = await db.getUser();

    const currentWeekStart = getWeekStart(new Date());
    let loadedWeek = await db.getWeekProgress(currentWeekStart);
    const allSessions = await db.getSessions();

    if (!loadedWeek || needsWeekReset(loadedWeek, new Date())) {
      loadedWeek = createWeekProgress(new Date());
    }
    const activeWeek = loadedWeek;

    // Recompute week progress from actual sessions
    const thisWeekSessions = allSessions.filter(s => {
      const sessionWeek = getWeekStart(new Date(s.date));
      return sessionWeek === activeWeek.weekStart;
    });
    const recomputedCompleted: Record<Category, boolean> = { push: false, pull: false, squat: false };
    for (const s of thisWeekSessions) {
      recomputedCompleted[s.category] = true;
    }
    loadedWeek = { ...activeWeek, sessionsCompleted: recomputedCompleted };
    await db.updateWeekProgress(loadedWeek);

    // Detect reinstall: sessions exist, user levels are all default, and no
    // gate has recorded any progress yet. Reconstruction is idempotent on
    // session history, so it is safe to run whenever we see this "freshly
    // initialized" state.
    const isDefaultLevels = CATEGORIES.every(c => loadedUser.levels[c] === 1);
    const existingGates = await Promise.all(
      CATEGORIES.map(c => db.getGateProgress(c, loadedUser.levels[c]))
    );
    const gatesAreUntouched = existingGates.every(
      g => !g || (g.consecutivePasses === 0 && !g.lastSessionDate)
    );
    if (allSessions.length > 0 && isDefaultLevels && gatesAreUntouched) {
      const reconstructed = reconstructFromSessions(allSessions);
      // Persist reconstructed levels
      for (const cat of CATEGORIES) {
        if (reconstructed.userLevels[cat] !== 1) {
          await db.updateUserLevel(cat, reconstructed.userLevels[cat]);
        }
      }
      // Persist reconstructed gate progress
      for (const gate of Object.values(reconstructed.gateProgress)) {
        await db.updateGateProgress(gate);
      }
      // Reload user with updated levels
      loadedUser = await db.getUser();
    }

    const gates: Record<string, GateProgress> = {};
    for (const cat of CATEGORIES) {
      const level = loadedUser.levels[cat];
      let gate = await db.getGateProgress(cat, level);
      if (!gate) {
        gate = createGateProgress(cat, level, level);
        await db.updateGateProgress(gate);
      }
      if (gate.status === 'locked') {
        gate.status = 'in-progress';
      }
      gates[gateKey(cat, level)] = gate;
    }

    const prevWeeks = buildWeekHistory(allSessions);
    const computedStreak = calculateStreak(prevWeeks);

    setUser(loadedUser);
    setWeekProgress(loadedWeek);
    setStreak(computedStreak);
    setGateProgress(gates);
    setSessions(allSessions);
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (dbReady && !initRef.current) {
      initRef.current = true;
      load().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load workout data';
        setError(message);
        setStatus('error');
      });
    }
  }, [dbReady, load]);

  // Use refs so logSession always reads latest state
  const userRef = useRef(user);
  const gateProgressRef = useRef(gateProgress);
  const weekProgressRef = useRef(weekProgress);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { gateProgressRef.current = gateProgress; }, [gateProgress]);
  useEffect(() => { weekProgressRef.current = weekProgress; }, [weekProgress]);

  const logSession = useCallback(async (session: WorkoutSession): Promise<LogSessionResult> => {
    const currentUser = userRef.current;
    const currentGateProgress = gateProgressRef.current;
    const currentWeekProgress = weekProgressRef.current;

    // 1. Save session
    await db.insertSession(session);
    setSessions(prev => [...prev, session]);

    // 2. Evaluate session — a session is "clean" when all exercises hit target
    const isClean = session.exercises.length > 0 &&
      session.exercises.every(e => e.hitTarget);
    const metCount = session.exercises.filter(e => e.hitTarget).length;
    const completionPct = session.exercises.length > 0
      ? Math.round((metCount / session.exercises.length) * 100)
      : 0;

    const sessionResult: SessionResult = {
      isClean,
      completionPct,
      exerciseResults: session.exercises.map(e => ({
        exerciseId: e.exerciseId,
        met: e.hitTarget,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        actualCheckedSets: e.checkedSets.filter(Boolean).length,
        actualReps: e.actualReps,
        actualHoldSeconds: e.actualHoldSeconds,
      })),
    };

    const currentGateKey = gateKey(session.category, session.level);
    const currentGate = currentGateProgress[currentGateKey] ??
      createGateProgress(session.category, session.level, currentUser?.levels[session.category] ?? 1);

    let updatedGate: GateProgress;
    let leveledUp = false;
    let newLevel: number | undefined;

    if (isClean) {
      const newCount = currentGate.consecutivePasses + 1;
      const passed = newCount >= 3;
      updatedGate = {
        ...currentGate,
        consecutivePasses: newCount,
        status: passed ? 'passed' : 'in-progress',
        lastSessionDate: session.date,
      };
    } else {
      updatedGate = {
        ...currentGate,
        consecutivePasses: 0,
        status: 'in-progress',
        lastSessionDate: session.date,
      };
    }

    await db.updateGateProgress(updatedGate);

    if (updatedGate.status === 'passed' && currentUser) {
      const userCopy: User = { ...currentUser, levels: { ...currentUser.levels } };
      leveledUp = checkCategoryLevelUp(updatedGate, userCopy);
      if (leveledUp) {
        newLevel = userCopy.levels[session.category];
        await db.updateUserLevel(session.category, newLevel);
        setUser(userCopy);

        const newGate = createGateProgress(session.category, newLevel, newLevel);
        await db.updateGateProgress(newGate);
        setGateProgress(prev => ({
          ...prev,
          [currentGateKey]: updatedGate,
          [gateKey(session.category, newLevel!)]: newGate,
        }));
      } else {
        setGateProgress(prev => ({ ...prev, [currentGateKey]: updatedGate }));
      }
    } else {
      setGateProgress(prev => ({
        ...prev,
        [currentGateKey]: updatedGate,
      }));
    }

    // 3. Update week progress
    const wp = currentWeekProgress ?? createWeekProgress(new Date());
    const updatedWeek = markCategoryDone(wp, session.category);
    await db.updateWeekProgress(updatedWeek);
    setWeekProgress(updatedWeek);
    weekProgressRef.current = updatedWeek;

    // Clear draft after successful save
    await db.deleteDraft(session.category, session.level);

    return { sessionResult, gateProgress: updatedGate, leveledUp, newLevel };
  }, []);

  const saveDraftFn = useCallback(async (draft: DraftSession): Promise<void> => {
    await db.saveDraft(draft.category, draft.level, draft);
  }, []);

  const loadDraft = useCallback(async (category: Category, level: number): Promise<DraftSession | null> => {
    return db.getDraft(category, level);
  }, []);

  const getGateForCategory = useCallback((category: Category): GateProgress | null => {
    if (!user) return null;
    const level = user.levels[category];
    return gateProgress[gateKey(category, level)] ?? null;
  }, [user, gateProgress]);

  const categoryDoneThisWeek: Record<Category, boolean> = weekProgress
    ? weekProgress.sessionsCompleted
    : { push: false, pull: false, squat: false };

  const weekComplete = weekProgress ? isWeekComplete(weekProgress) : false;
  const completedThisWeek = weekProgress ? completedCount(weekProgress) : 0;

  return {
    status,
    error,
    user,
    weekProgress,
    streak,
    gateProgress,
    sessions,
    categoryDoneThisWeek,
    weekComplete,
    completedThisWeek,
    logSession,
    getGateForCategory,
    saveDraft: saveDraftFn,
    loadDraft,
    reload: load,
  };
}

function buildWeekHistory(sessions: WorkoutSession[]): WeekProgress[] {
  const byWeek = new Map<string, Set<Category>>();

  for (const s of sessions) {
    const weekStart = getWeekStart(new Date(s.date));
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, new Set());
    byWeek.get(weekStart)!.add(s.category);
  }

  const currentWeekStart = getWeekStart(new Date());

  return Array.from(byWeek.entries())
    .filter(([ws]) => ws !== currentWeekStart)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, cats]): WeekProgress => ({
      weekStart,
      sessionsCompleted: {
        push: cats.has('push'),
        pull: cats.has('pull'),
        squat: cats.has('squat'),
      },
    }));
}
