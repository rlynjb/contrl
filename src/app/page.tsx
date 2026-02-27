'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUserData } from '@/hooks/useUserData'
import type { WorkoutLevel, BaseExercise, BaseExerciseSet } from '@/api'
import { api } from '@/api'
import WeeklyTracker from '@/components/WeeklyTracker'
import SkillTree from '@/components/SkillTree'
import './page.css'

export default function DashboardPage() {
  const {
    userData,
    weekDays,
    status,
    saveStatus,
    error,
    currentLevels,
    refreshAll,
    updateExercise,
    updateLevel,
  } = useUserData()

  const [workoutLevels, setWorkoutLevels] = useState<Record<string, WorkoutLevel>>({})

  useEffect(() => {
    const fetchLevels = async () => {
      const levels = await api.exercises.getWorkoutLevels()
      setWorkoutLevels(levels)
    }
    fetchLevels()
  }, [])

  const todayExercises = useMemo(() => {
    const today = weekDays.find(d => d.isToday)
    return today?.exercises
  }, [weekDays])

  const exerciseHistory = useMemo(() => {
    if (!userData?.weeklyProgress) return new Map<string, { date: string | Date; sets: BaseExerciseSet[]; completed?: boolean }[]>()
    const map = new Map<string, { date: string | Date; sets: BaseExerciseSet[]; completed?: boolean }[]>()
    const todayStr = new Date().toDateString()

    for (const session of userData.weeklyProgress) {
      if (new Date(session.date).toDateString() === todayStr) continue
      for (const ex of session.exercises) {
        const entries = map.get(ex.name) || []
        entries.push({ date: session.date, sets: ex.sets, completed: ex.completed })
        map.set(ex.name, entries)
      }
    }

    map.forEach((entries, name) => {
      entries.sort((a: { date: string | Date }, b: { date: string | Date }) => new Date(b.date).getTime() - new Date(a.date).getTime())
      map.set(name, entries.slice(0, 3))
    })

    return map
  }, [userData])

  const handleSkillTreeChange = useCallback((exercise: BaseExercise) => {
    const today = weekDays.find(d => d.isToday)
    if (!today) return
    const index = today.exercises?.findIndex(e => e.name === exercise.name) ?? -1
    updateExercise(today.date, index, exercise)
  }, [weekDays, updateExercise])

  const handleLevelUp = useCallback(async (category: string, level: number) => {
    await updateLevel(category, level)
  }, [updateLevel])

  if (status === 'loading' && weekDays.length === 0) {
    return (
      <div className="app-container app-loading">
        Loading...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-container app-error">
        <p>{error || 'Failed to load data'}</p>
        <button onClick={refreshAll} className="app-error__retry">Retry</button>
      </div>
    )
  }

  return (
    <div className="app-container">
      <WeeklyTracker weekDays={weekDays} />
      <SkillTree
        currentLevels={currentLevels}
        workoutLevels={workoutLevels}
        todayExercises={todayExercises}
        exerciseHistory={exerciseHistory}
        saveStatus={saveStatus}
        onExerciseChange={handleSkillTreeChange}
        onLevelUp={handleLevelUp}
      />
    </div>
  )
}
