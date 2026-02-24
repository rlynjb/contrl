'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUserData } from '@/hooks/useUserData'
import type { WorkoutLevel, BaseExercise } from '@/api'
import { api } from '@/api'
import WeeklyTracker from '@/components/WeeklyTracker'
import SkillTree from '@/components/SkillTree'
import './page.css'

export default function DashboardPage() {
  const {
    weekDays,
    status,
    saveStatus,
    error,
    currentLevels,
    refreshAll,
    updateExercise,
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

  const handleSkillTreeChange = useCallback((exercise: BaseExercise) => {
    const today = weekDays.find(d => d.isToday)
    if (!today?.exercises) return
    const index = today.exercises.findIndex(e => e.name === exercise.name)
    if (index < 0) return
    updateExercise(today.date, index, exercise)
  }, [weekDays, updateExercise])

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
        saveStatus={saveStatus}
        onExerciseChange={handleSkillTreeChange}
      />
    </div>
  )
}
