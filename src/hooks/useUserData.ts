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
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
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

// Apply a weeklyProgress update optimistically to weekDays state
function applyProgressToWeekDays(
  currentWeekDays: ExtendedWeekDay[],
  updatedProgress: WorkoutSession[]
): ExtendedWeekDay[] {
  return currentWeekDays.map(day => {
    const weekDay = day.date.toDateString()
    const workoutDay = updatedProgress.find(
      wp => new Date(wp.date).toDateString() === weekDay
    )

    if (workoutDay) {
      return {
        ...day,
        isWorkoutDay: Boolean(workoutDay.exercises?.length),
        ...workoutDay,
        date: day.date
      }
    }

    // No workout for this day — clear any previous workout data
    return {
      date: day.date,
      isToday: day.isToday,
      completed: false,
      completedWorkout: undefined,
      todayWorkout: undefined,
      isWorkoutDay: false
    }
  })
}

export interface UseUserDataReturn {
  userData: UserData | null
  currentLevels: CurrentUserLevels | null
  weekDays: ExtendedWeekDay[]
  status: AsyncStatus
  saveStatus: SaveStatus
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
  ) => void
  levelUp: (category: Category, newLevel: number) => Promise<boolean>
}

// Debounce delay for exercise updates (ms)
const EXERCISE_SAVE_DELAY = 600
// Auto-hide "Saved" indicator after this many ms
const SAVED_DISPLAY_DURATION = 2000

export function useUserData(): UseUserDataReturn {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [currentLevels, setCurrentLevels] = useState<CurrentUserLevels | null>(null)
  const [weekDays, setWeekDays] = useState<ExtendedWeekDay[]>([])
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Write queue: serializes all async mutations so they don't interleave
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())
  // Debounce timer for exercise updates
  const exerciseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending exercise update (accumulated during debounce window)
  const pendingExerciseRef = useRef<{
    date: Date
    exerciseIndex: number
    updatedExercise: BaseExercise
  } | null>(null)
  // Timer for auto-hiding "Saved" status
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const task = writeQueueRef.current.then(fn, fn)
    writeQueueRef.current = task.then(
      () => {},
      () => {}
    )
    return task
  }, [])

  const showSaved = useCallback(() => {
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_DURATION)
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (exerciseDebounceRef.current) clearTimeout(exerciseDebounceRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const addCategoryToDay = useCallback(
    async (
      date: Date,
      category: Category,
      exercises: BaseExercise[],
      level: number
    ) => {
      // Optimistic: update weekDays immediately
      setWeekDays(prev => {
        const dayDate = new Date(date).toDateString()
        return prev.map(day => {
          if (day.date.toDateString() !== dayDate) return day
          const existingExercises = day.exercises || []
          const existingCategories = (day.categories || []) as Category[]
          return {
            ...day,
            exercises: [...existingExercises, ...exercises],
            categories: existingCategories.includes(category)
              ? existingCategories
              : [...existingCategories, category],
            isWorkoutDay: true
          }
        })
      })

      setSaveStatus('saving')
      try {
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

          const saved = await api.user.updateUserData({
            ...latest,
            weeklyProgress: updatedProgress
          })
          // Reconcile with server response
          setUserData(saved)
          setWeekDays(prev => applyProgressToWeekDays(prev, saved.weeklyProgress || []))
        })
        showSaved()
      } catch {
        setSaveStatus('error')
        // Revert on failure
        await refreshAll()
      }
    },
    [enqueue, refreshAll, showSaved]
  )

  const removeCategoryFromDay = useCallback(
    async (date: Date, category: Category) => {
      // Optimistic: update weekDays immediately
      setWeekDays(prev => {
        const dayDate = new Date(date).toDateString()
        return prev.map(day => {
          if (day.date.toDateString() !== dayDate) return day
          const filteredExercises = (day.exercises || []).filter(e => e.category !== category)
          const filteredCategories = ((day.categories || []) as Category[]).filter(c => c !== category)
          return {
            ...day,
            exercises: filteredExercises,
            categories: filteredCategories,
            isWorkoutDay: filteredExercises.length > 0
          }
        })
      })

      setSaveStatus('saving')
      try {
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

          const saved = await api.user.updateUserData({
            ...latest,
            weeklyProgress: updatedProgress
          })
          setUserData(saved)
          setWeekDays(prev => applyProgressToWeekDays(prev, saved.weeklyProgress || []))
        })
        showSaved()
      } catch {
        setSaveStatus('error')
        await refreshAll()
      }
    },
    [enqueue, refreshAll, showSaved]
  )

  // Flush the pending exercise update to the server
  const flushExerciseUpdate = useCallback(async () => {
    const pending = pendingExerciseRef.current
    if (!pending) return
    pendingExerciseRef.current = null

    setSaveStatus('saving')
    try {
      await enqueue(async () => {
        const latest = await api.user.getUserData()
        if (!latest?.weeklyProgress) return

        const dayDate = new Date(pending.date).toDateString()
        const updatedProgress = latest.weeklyProgress.map(session => {
          if (new Date(session.date).toDateString() === dayDate) {
            const updatedExercises = [...session.exercises]
            updatedExercises[pending.exerciseIndex] = pending.updatedExercise
            return { ...session, exercises: updatedExercises }
          }
          return session
        })

        const saved = await api.user.updateUserData({
          ...latest,
          weeklyProgress: updatedProgress
        })
        setUserData(saved)
        setWeekDays(prev => applyProgressToWeekDays(prev, saved.weeklyProgress || []))
      })
      showSaved()
    } catch {
      setSaveStatus('error')
      await refreshAll()
    }
  }, [enqueue, refreshAll, showSaved])

  // Debounced exercise update: updates UI instantly, batches API calls
  const updateExercise = useCallback(
    (
      date: Date,
      exerciseIndex: number,
      updatedExercise: BaseExercise
    ) => {
      // Optimistic: update weekDays immediately
      setWeekDays(prev => {
        const dayDate = new Date(date).toDateString()
        return prev.map(day => {
          if (day.date.toDateString() !== dayDate) return day
          const updatedExercises = [...(day.exercises || [])]
          updatedExercises[exerciseIndex] = updatedExercise
          return { ...day, exercises: updatedExercises }
        })
      })

      // Store the latest pending update
      pendingExerciseRef.current = { date, exerciseIndex, updatedExercise }

      // Reset debounce timer
      if (exerciseDebounceRef.current) clearTimeout(exerciseDebounceRef.current)
      exerciseDebounceRef.current = setTimeout(() => {
        flushExerciseUpdate()
      }, EXERCISE_SAVE_DELAY)
    },
    [flushExerciseUpdate]
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
    saveStatus,
    error,
    refreshAll,
    addCategoryToDay,
    removeCategoryFromDay,
    updateExercise,
    levelUp
  }
}
