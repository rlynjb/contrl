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
  getGateCriteria,
  evaluateSession,
  updateGateAfterSession,
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
import { useNotionSync } from './NotionSyncContext';

export type LogSessionResult = {
  sessionResult: SessionResult;
  gateProgress: GateProgress;
  leveledUp: boolean;
  newLevel?: number;
};

export type GameStateStatus = 'loading' | 'ready' | 'error';

export interface UseGameStateReturn {
  status: GameStateStatus;
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
  const [user, setUser] = useState<User | null>(null);
  const [weekProgress, setWeekProgress] = useState<WeekProgress | null>(null);
  const [streak, setStreak] = useState(0);
  const [gateProgress, setGateProgress] = useState<Record<string, GateProgress>>({});
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const initRef = useRef(false);
  const { syncVersion } = useNotionSync();

  const load = useCallback(async () => {
    const loadedUser = await db.getUser();

    const currentWeekStart = getWeekStart(new Date());
    let loadedWeek = await db.getWeekProgress(currentWeekStart);
    const allSessions = await db.getSessions();

    if (needsWeekReset(loadedWeek, new Date())) {
      loadedWeek = createWeekProgress(new Date());
    }

    // Recompute week progress from actual sessions
    const thisWeekSessions = allSessions.filter(s => {
      const sessionWeek = getWeekStart(new Date(s.date));
      return sessionWeek === loadedWeek.weekStart;
    });
    const recomputedCompleted: Record<Category, boolean> = { push: false, pull: false, squat: false };
    for (const s of thisWeekSessions) {
      recomputedCompleted[s.category] = true;
    }
    loadedWeek = { ...loadedWeek, sessionsCompleted: recomputedCompleted };
    await db.updateWeekProgress(loadedWeek);

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
      load().catch(() => setStatus('error'));
    }
  }, [dbReady, load]);

  // Reload all game state after a Notion sync
  const prevSyncVersion = useRef(syncVersion);
  useEffect(() => {
    if (syncVersion > prevSyncVersion.current) {
      prevSyncVersion.current = syncVersion;
      load().catch(() => setStatus('error'));
    }
  }, [syncVersion, load]);

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

    // 2. Evaluate against gate criteria
    const criteria = getGateCriteria(session.category, session.level);
    let sessionResult: SessionResult;
    let updatedGate: GateProgress;
    let leveledUp = false;
    let newLevel: number | undefined;

    if (criteria) {
      const currentGateKey = gateKey(session.category, session.level);
      const currentGate = currentGateProgress[currentGateKey] ??
        createGateProgress(session.category, session.level, currentUser?.levels[session.category] ?? 1);

      sessionResult = evaluateSession(session, criteria);
      updatedGate = updateGateAfterSession(currentGate, sessionResult, criteria, session.date);

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
          [gateKey(session.category, session.level)]: updatedGate,
        }));
      }
    } else {
      sessionResult = { isClean: true, completionPct: 100, exerciseResults: [] };
      updatedGate = createGateProgress(session.category, session.level, currentUser?.levels[session.category] ?? 1);
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
