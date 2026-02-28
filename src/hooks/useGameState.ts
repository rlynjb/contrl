'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Category,
  WorkoutSession,
  GateProgress,
  WeekProgress,
  User,
} from '@/types'
import { CATEGORIES } from '@/types'
import { getStorage } from '@/lib/storage'
import {
  getGateCriteria,
  evaluateSession,
  updateGateAfterSession,
  createGateProgress,
} from '@/lib/gate-check'
import type { SessionResult } from '@/lib/gate-check'
import {
  getWeekStart,
  createWeekProgress,
  markCategoryDone,
  isWeekComplete,
  needsWeekReset,
  completedCount,
} from '@/lib/week-progress'
import { calculateStreak } from '@/lib/streaks'
import { checkCategoryLevelUp } from '@/lib/progression'

export type LogSessionResult = {
  sessionResult: SessionResult
  gateProgress: GateProgress
  leveledUp: boolean
  newLevel?: number
}

export type GameStateStatus = 'loading' | 'ready' | 'error'

export interface UseGameStateReturn {
  status: GameStateStatus
  user: User | null
  weekProgress: WeekProgress | null
  streak: number
  gateProgress: Record<string, GateProgress>
  sessions: WorkoutSession[]
  categoryDoneThisWeek: Record<Category, boolean>
  weekComplete: boolean
  completedThisWeek: number
  logSession: (session: WorkoutSession) => Promise<LogSessionResult>
  getGateForCategory: (category: Category) => GateProgress | null
  reload: () => Promise<void>
}

function gateKey(category: Category, level: number) {
  return `${category}:${level}`
}

export function useGameState(): UseGameStateReturn {
  const [status, setStatus] = useState<GameStateStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [weekProgress, setWeekProgress] = useState<WeekProgress | null>(null)
  const [streak, setStreak] = useState(0)
  const [gateProgress, setGateProgress] = useState<Record<string, GateProgress>>({})
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const initRef = useRef(false)

  const load = useCallback(async () => {
    const storage = getStorage()

    // Load user
    const loadedUser = await storage.getUser()

    // Load current week progress
    const currentWeekStart = getWeekStart(new Date())
    let loadedWeek = await storage.getWeekProgress(currentWeekStart)

    // Check for week reset — if stored week is from a previous week, archive it
    if (needsWeekReset(loadedWeek, new Date())) {
      if (loadedWeek && loadedWeek.weekStart !== currentWeekStart) {
        // Archive the old week
        const allSessions = await storage.getSessions()
        const prevWeeks = buildWeekHistory(allSessions)
        const newStreak = calculateStreak(prevWeeks)
        setStreak(newStreak)
      }
      loadedWeek = createWeekProgress(new Date())
      await storage.updateWeekProgress(loadedWeek)
    }

    // Load gate progress for user's current levels
    const gates: Record<string, GateProgress> = {}
    for (const cat of CATEGORIES) {
      const level = loadedUser.levels[cat]
      const gate = await storage.getGateProgress(level, cat)
      if (gate.status === 'locked' && level <= loadedUser.levels[cat]) {
        gate.status = 'in-progress'
      }
      gates[gateKey(cat, level)] = gate
    }

    // Load sessions + compute streak from history
    const allSessions = await storage.getSessions()
    const prevWeeks = buildWeekHistory(allSessions)
    const computedStreak = calculateStreak(prevWeeks)

    setUser(loadedUser)
    setWeekProgress(loadedWeek)
    setStreak(computedStreak)
    setGateProgress(gates)
    setSessions(allSessions)
    setStatus('ready')
  }, [])

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true
      load().catch(() => setStatus('error'))
    }
  }, [load])

  const logSession = useCallback(async (session: WorkoutSession): Promise<LogSessionResult> => {
    const storage = getStorage()

    // 1. Save session
    await storage.saveSession(session)
    setSessions(prev => [...prev, session])

    // 2. Evaluate against gate criteria
    const criteria = getGateCriteria(session.category, session.level)
    let sessionResult: SessionResult
    let updatedGate: GateProgress
    let leveledUp = false
    let newLevel: number | undefined

    if (criteria) {
      const currentGateKey = gateKey(session.category, session.level)
      const currentGate = gateProgress[currentGateKey] ??
        createGateProgress(session.category, session.level, user?.levels[session.category] ?? 1)

      sessionResult = evaluateSession(session, criteria)
      updatedGate = updateGateAfterSession(currentGate, sessionResult, criteria, session.date)

      // Persist gate
      await storage.updateGateProgress(updatedGate)

      // Check level up
      if (updatedGate.status === 'passed' && user) {
        const userCopy: User = {
          ...user,
          levels: { ...user.levels },
        }
        leveledUp = checkCategoryLevelUp(updatedGate, userCopy)
        if (leveledUp) {
          newLevel = userCopy.levels[session.category]
          await storage.updateUser(userCopy)
          setUser(userCopy)

          // Initialize gate for new level
          const newGate = createGateProgress(session.category, newLevel, newLevel)
          await storage.updateGateProgress(newGate)
          setGateProgress(prev => ({
            ...prev,
            [currentGateKey]: updatedGate,
            [gateKey(session.category, newLevel!)]: newGate,
          }))
        } else {
          setGateProgress(prev => ({
            ...prev,
            [currentGateKey]: updatedGate,
          }))
        }
      } else {
        setGateProgress(prev => ({
          ...prev,
          [gateKey(session.category, session.level)]: updatedGate,
        }))
      }
    } else {
      // No criteria found — treat as clean session with 100% completion
      sessionResult = { isClean: true, completionPct: 100, exerciseResults: [] }
      updatedGate = createGateProgress(session.category, session.level, user?.levels[session.category] ?? 1)
    }

    // 3. Update week progress
    if (weekProgress) {
      const updatedWeek = markCategoryDone(weekProgress, session.category)
      await storage.updateWeekProgress(updatedWeek)
      setWeekProgress(updatedWeek)
    }

    return { sessionResult, gateProgress: updatedGate, leveledUp, newLevel }
  }, [gateProgress, user, weekProgress])

  const getGateForCategory = useCallback((category: Category): GateProgress | null => {
    if (!user) return null
    const level = user.levels[category]
    return gateProgress[gateKey(category, level)] ?? null
  }, [user, gateProgress])

  const categoryDoneThisWeek: Record<Category, boolean> = weekProgress
    ? weekProgress.sessionsCompleted
    : { push: false, pull: false, squat: false }

  const weekComplete = weekProgress ? isWeekComplete(weekProgress) : false
  const completedThisWeek = weekProgress ? completedCount(weekProgress) : 0

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
    reload: load,
  }
}

/**
 * Build a list of WeekProgress entries from session history, sorted oldest→newest.
 */
function buildWeekHistory(sessions: WorkoutSession[]): WeekProgress[] {
  const byWeek = new Map<string, Set<Category>>()

  for (const s of sessions) {
    const weekStart = getWeekStart(new Date(s.date))
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, new Set())
    byWeek.get(weekStart)!.add(s.category)
  }

  const currentWeekStart = getWeekStart(new Date())

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
    }))
}
