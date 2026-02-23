'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui'
import { useUserData } from '@/hooks/useUserData'
import type { ExtendedWeekDay } from '@/hooks/useUserData'
import type { WorkoutLevel } from '@/api'
import { api } from '@/api'
import WeeklyTracker from '@/components/WeeklyTracker'
import SkillTree from '@/components/SkillTree'
import WorkoutDetail from '@/components/WorkoutDetail'

export default function DashboardPage() {
  const {
    weekDays,
    status,
    saveStatus,
    error,
    currentLevels,
    userData,
    refreshAll,
    addCategoryToDay,
    removeCategoryFromDay,
    updateExercise,
    levelUp
  } = useUserData()

  const [workoutLevels, setWorkoutLevels] = useState<Record<string, WorkoutLevel>>({})
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Fetch workout levels for skill tree
  useEffect(() => {
    const fetchLevels = async () => {
      const levels = await api.exercises.getWorkoutLevels()
      setWorkoutLevels(levels)
    }
    fetchLevels()
  }, [])

  // Derive selectedDay from weekDays
  const selectedDay = useMemo<ExtendedWeekDay | null>(
    () => selectedDayDate
      ? weekDays.find(d => d.date.toDateString() === selectedDayDate) ?? null
      : null,
    [weekDays, selectedDayDate]
  )

  const handleDayClick = useCallback((day: ExtendedWeekDay) => {
    setSelectedDayDate(day.date.toDateString())
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setSelectedDayDate(null)
  }, [])

  const modalTitle = selectedDay
    ? `${new Date(selectedDay.date).toLocaleDateString('en-US', { weekday: 'short' })} (${new Date(selectedDay.date).getDate()}) - Workout Details`
    : 'Workout Details'

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
      <WeeklyTracker weekDays={weekDays} onDayClick={handleDayClick} />
      <SkillTree currentLevels={currentLevels} workoutLevels={workoutLevels} />

      {/* Workout Detail Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalTitle}
      >
        {saveStatus !== 'idle' && (
          <div
            className={`weekly-progress__save-status weekly-progress__save-status--${saveStatus}`}
            role="status"
            aria-live="polite"
          >
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'error' && 'Failed to save'}
          </div>
        )}
        {selectedDay && (
          <WorkoutDetail
            selectedDay={selectedDay}
            currentLevels={currentLevels}
            weeklyProgress={userData?.weeklyProgress || []}
            onAddCategory={addCategoryToDay}
            onRemoveCategory={removeCategoryFromDay}
            onUpdateExercise={updateExercise}
            onLevelUp={levelUp}
          />
        )}
      </Modal>
    </div>
  )
}
