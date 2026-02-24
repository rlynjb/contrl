'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUserData } from '@/hooks/useUserData'
import type { WorkoutLevel, BaseExercise } from '@/api'
import { api } from '@/api'
import WeeklyTracker from '@/components/WeeklyTracker'
import SkillTree from '@/components/SkillTree'

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

  // Fetch workout levels for skill tree
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
      <div style={{
        width: "100%", minHeight: "100vh", maxWidth: 480, margin: "0 auto",
        background: "#08080f", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#3a3a50", fontFamily: "'Anybody', monospace", fontSize: 12,
      }}>
        Loading...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{
        width: "100%", minHeight: "100vh", maxWidth: 480, margin: "0 auto",
        background: "#08080f", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        color: "#3a3a50", fontFamily: "'Anybody', monospace", fontSize: 12,
      }}>
        <p>{error || 'Failed to load data'}</p>
        <button onClick={refreshAll} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid #222234",
          background: "transparent", color: "#e0e0e0", cursor: "pointer",
        }}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{
      width: "100%", minHeight: "100vh", maxWidth: 480, margin: "0 auto",
      background: "#08080f", color: "#e0e0e0",
      fontFamily: "'Anybody', -apple-system, sans-serif", overflowX: "hidden",
    }}>
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
