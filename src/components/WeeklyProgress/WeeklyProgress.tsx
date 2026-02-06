'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui'
import type { WeekDay, WorkoutSession } from '@/lib/data-service/UserService/mocks/WeeklyProgress/types'
import { dataService } from '@/lib/data-service'
import { MOCK_UserData } from '@/lib/data-service/UserService/mocks/UserData'
import WorkoutDetail from './WorkoutDetail'
import './WeeklyProgress.css'

export type ExtendedWeekDay = WeekDay & Partial<WorkoutSession>

export default function WeeklyProgress() {
  const [weekDays, setWeekDays] = useState<ExtendedWeekDay[]>([]) // extend WeekDay type
  const [selectedDay, setSelectedDay] = useState<ExtendedWeekDay | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    // Generate week days based on current date
    const generateWeekDays = (): WeekDay[] => {
      const today = new Date()
      const currentDay = today.getDay() // 0 = Sunday, 6 = Saturday
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - currentDay) // Go to Sunday
      weekStart.setHours(0, 0, 0, 0) // Reset to midnight
      
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

    // Fetch user data and merge with generated week
    const initializeWeeklyProgress = async () => {
      const generatedWeek = generateWeekDays()
      let fetchedUserData = await dataService.userProgress.getUserData()

      // Initialize with mock data if no user data exists
      if (!fetchedUserData) {
        dataService.userProgress.updateUserData(MOCK_UserData)
        fetchedUserData = MOCK_UserData
      }

      const weeklyProgress = fetchedUserData?.weeklyProgress

      if (Array.isArray(weeklyProgress) && weeklyProgress.length > 0) {
        const mergedWeek = generatedWeek.map(day => {
          const weekDay = day.date.toDateString();

          const workoutDay = weeklyProgress.find(
            wp => new Date(wp.date).toDateString() === weekDay
          )

          return {
            ...day,
            isWorkoutDay: workoutDay ? true : false,
            ...(workoutDay || {}),
            date: day.date // Keep the ISO string
          }
        })
        setWeekDays(mergedWeek)
      } else {
        setWeekDays(generatedWeek)
      }
    }

    initializeWeeklyProgress()
  }, [])

  const handleDayClick = (day: WeekDay) => {
    setSelectedDay(day)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedDay(null)
  }

  const hightlightDay = (day: WeekDay) => {
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
          
      <div className="weekly-progress__grid">
        {weekDays.map((day, index) => (
          <div
            key={index}
            className={`weekly-progress__day ${hightlightDay(day)}`}
            onClick={() => handleDayClick(day)}
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
        {selectedDay && <WorkoutDetail selectedDay={selectedDay} />}
      </Modal>
    </div>
  )
}
