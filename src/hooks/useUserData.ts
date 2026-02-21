'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/api'
import type {
  UserData,
  CurrentUserLevels,
  BaseExercise,
  WorkoutSession,
  WeekDay
} from '@/api'

export type AsyncStatus = 'idle' | 'loading' | 'error' | 'success'
export type Category = keyof CurrentUserLevels

export type ExtendedWeekDay = WeekDay & Partial<WorkoutSession>

// Generate week days (Sunday to Saturday) based on current date
function generateWeekDays(): WeekDay[] {
  const today = new Date()
  const currentDay = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - currentDay)
  weekStart.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + i)
    const dateISO = date.toISOString()
    const isToday = date.toDateString() === today.toDateString()

    return {
      date: new Date(dateISO),
      isToday,
      completed: false,
      completedWorkout: undefined,
      todayWorkout: undefined
    }
  })
}

// Merge generated week with user's weekly progress
function mergeWeekDays(
  generatedWeek: WeekDay[],
  weeklyProgress: WorkoutSession[] | undefined
): ExtendedWeekDay[] {
  if (!Array.isArray(weeklyProgress) || weeklyProgress.length === 0) {
    return generatedWeek
  }

  return generatedWeek.map(day => {
    const weekDay = day.date.toDateString()
    const workoutDay = weeklyProgress.find(
      wp => new Date(wp.date).toDateString() === weekDay
    )

    return {
      ...day,
      isWorkoutDay: Boolean(workoutDay?.exercises?.length),
      ...(workoutDay || {}),
      date: day.date
    }
  })
}

export interface UseUserDataReturn {
  userData: UserData | null
  currentLevels: CurrentUserLevels | null
  weekDays: ExtendedWeekDay[]
  status: AsyncStatus
  error: string | null
  refreshAll: () => Promise<void>
  addCategoryToDay: (
    date: Date,
    category: Category,
    exercises: BaseExercise[],
    level: number
  ) => Promise<void>
  removeCategoryFromDay: (date: Date, category: Category) => Promise<void>
  updateExercise: (
    date: Date,
    exerciseIndex: number,
    updatedExercise: BaseExercise
  ) => Promise<void>
  levelUp: (category: Category, newLevel: number) => Promise<boolean>
}

export function useUserData(): UseUserDataReturn {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [currentLevels, setCurrentLevels] = useState<CurrentUserLevels | null>(null)
  const [weekDays, setWeekDays] = useState<ExtendedWeekDay[]>([])
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Write queue: serializes all async mutations so they don't interleave
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const task = writeQueueRef.current.then(fn, fn)
    // Keep the chain going regardless of success/failure
    writeQueueRef.current = task.then(
      () => {},
      () => {}
    )
    return task
  }, [])

  const refreshAll = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [fetchedUserData, levels] = await Promise.all([
        api.user.getUserData(),
        api.user.getCurrentLevels()
      ])
      const merged = mergeWeekDays(generateWeekDays(), fetchedUserData?.weeklyProgress)
      setUserData(fetchedUserData)
      setCurrentLevels(levels)
      setWeekDays(merged)
      setStatus('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
      setStatus('error')
    }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const addCategoryToDay = useCallback(
    async (
      date: Date,
      category: Category,
      exercises: BaseExercise[],
      level: number
    ) => {
      await enqueue(async () => {
        const latest = await api.user.getUserData()
        if (!latest) return

        const dayDate = new Date(date).toDateString()
        const existingSession = latest.weeklyProgress?.find(
          session => new Date(session.date).toDateString() === dayDate
        )

        let updatedProgress = latest.weeklyProgress || []

        if (existingSession) {
          updatedProgress = updatedProgress.map(session => {
            if (new Date(session.date).toDateString() === dayDate) {
              const existingCategories = session.categories || []
              return {
                ...session,
                exercises: [...session.exercises, ...exercises],
                categories: existingCategories.includes(category)
                  ? existingCategories
                  : [...existingCategories, category]
              }
            }
            return session
          })
        } else {
          updatedProgress = [
            ...updatedProgress,
            {
              exercises,
              categories: [category],
              level,
              date
            }
          ]
        }

        await api.user.updateUserData({
          ...latest,
          weeklyProgress: updatedProgress
        })
      })
      await refreshAll()
    },
    [enqueue, refreshAll]
  )

  const removeCategoryFromDay = useCallback(
    async (date: Date, category: Category) => {
      await enqueue(async () => {
        const latest = await api.user.getUserData()
        if (!latest?.weeklyProgress) return

        const dayDate = new Date(date).toDateString()

        const updatedProgress = latest.weeklyProgress.map(session => {
          if (new Date(session.date).toDateString() === dayDate) {
            return {
              ...session,
              exercises: session.exercises.filter(e => e.category !== category),
              categories: (session.categories || []).filter(c => c !== category)
            }
          }
          return session
        })

        await api.user.updateUserData({
          ...latest,
          weeklyProgress: updatedProgress
        })
      })
      await refreshAll()
    },
    [enqueue, refreshAll]
  )

  const updateExercise = useCallback(
    async (
      date: Date,
      exerciseIndex: number,
      updatedExercise: BaseExercise
    ) => {
      await enqueue(async () => {
        const latest = await api.user.getUserData()
        if (!latest?.weeklyProgress) return

        const dayDate = new Date(date).toDateString()
        const updatedProgress = latest.weeklyProgress.map(session => {
          if (new Date(session.date).toDateString() === dayDate) {
            const updatedExercises = [...session.exercises]
            updatedExercises[exerciseIndex] = updatedExercise
            return { ...session, exercises: updatedExercises }
          }
          return session
        })

        await api.user.updateUserData({
          ...latest,
          weeklyProgress: updatedProgress
        })
      })
      await refreshAll()
    },
    [enqueue, refreshAll]
  )

  const levelUp = useCallback(
    async (category: Category, newLevel: number): Promise<boolean> => {
      const success = await api.user.updateLevel(category, newLevel)
      if (success) {
        setCurrentLevels(prev =>
          prev ? { ...prev, [category]: newLevel } : prev
        )
      }
      return success
    },
    []
  )

  return {
    userData,
    currentLevels,
    weekDays,
    status,
    error,
    refreshAll,
    addCategoryToDay,
    removeCategoryFromDay,
    updateExercise,
    levelUp
  }
}
