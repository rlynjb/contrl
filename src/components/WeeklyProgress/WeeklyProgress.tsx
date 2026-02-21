'use client'

import { useState, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui'
import { useUserData } from '@/hooks/useUserData'
import type { ExtendedWeekDay } from '@/hooks/useUserData'
import WorkoutDetail from './WorkoutDetail'
import './WeeklyProgress.css'

export type { ExtendedWeekDay } from '@/hooks/useUserData'

export default function WeeklyProgress() {
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

  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Derive selectedDay from weekDays — auto-updates when weekDays changes after mutation
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

  const highlightDay = (day: ExtendedWeekDay) => {
    return day.isToday ? 'weekly-progress__day--today' :
      day.isWorkoutDay ? 'weekly-progress__day--workout' : ''
  }

  const modalTitle = selectedDay
    ? `${new Date(selectedDay.date).toLocaleDateString('en-US', { weekday: 'short' })} (${new Date(selectedDay.date).getDate()}) - Workout Details`
    : 'Workout Details'

  return (
    <div className="weekly-progress">
      {/* Week header */}
      <div className="weekly-progress__week-header">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel, index) => (
          <div key={index} className="weekly-progress__day-label">
            {dayLabel}
          </div>
        ))}
      </div>

      <div className="weekly-progress__grid" role="grid" aria-label="Weekly workout calendar">
        {status === 'loading' && weekDays.length === 0 && (
          <p className="weekly-progress__loading">Loading...</p>
        )}

        {status === 'error' && (
          <div className="weekly-progress__error">
            <p>{error || 'Failed to load data'}</p>
            <button onClick={refreshAll}>Retry</button>
          </div>
        )}

        {status === 'success' && weekDays.length === 0 && (
          <p className="weekly-progress__empty">No workout data for this week</p>
        )}

        {weekDays.map((day, index) => (
          <div
            key={index}
            role="gridcell"
            tabIndex={0}
            aria-label={`${new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${day.isWorkoutDay ? ', has workout' : ''}${day.isToday ? ', today' : ''}`}
            aria-selected={selectedDayDate === day.date.toDateString()}
            className={`weekly-progress__day ${highlightDay(day)}`}
            onClick={() => handleDayClick(day)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(day) } }}
          >
            <div className="weekly-progress__day-name">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="weekly-progress__day-number">{new Date(day.date).getDate()}</div>
            <div className="weekly-progress__day-indicator">
              {day.completed ? (
                <div className="weekly-progress__day-indicator--completed">✓</div>
              ) : day.isToday ? (
                <div className="weekly-progress__day-indicator--today"></div>
              ) : (
                <div className="weekly-progress__day-indicator--default"></div>
              )}
            </div>
            <div className="weekly-progress__day-category">{day.isWorkoutDay ? day.categories : ''}</div>
          </div>
        ))}
      </div>

      {/* Exercise Details Modal */}
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
