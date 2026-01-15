'use client'

import { useState, useEffect } from 'react'
import { CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { 
  weeklyProgressData, 
  generateCompleteWeeklyProgress,
  type WeekDay,
} from '@/data/WeeklyProgress'
import './WeeklyProgress.css'

export default function WeeklyProgress() {
  const [progressData, setProgressData] = useState(weeklyProgressData)
  const [isClient, setIsClient] = useState(false)
  const [selectedDay, setSelectedDay] = useState<WeekDay | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Regenerate data on client to ensure fresh dates
    setProgressData(generateCompleteWeeklyProgress())
  }, [])

  const { weekDays, stats, motivationalMessage, achievements } = progressData

  const handleDayClick = (day: WeekDay) => {
    if (day.workoutSession || day.plannedWorkout) {
      setSelectedDay(day)
      setIsModalOpen(true)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedDay(null)
  }

  return (
    <div className="weekly-progress">
      {!isClient || weekDays.length === 0 ? (
        <div className="weekly-progress__loading">
          <div className="weekly-progress__loading-header">
            <div>
              <CardDescription>Loading your weekly progress...</CardDescription>
            </div>
            <div className="weekly-progress__loading-streak">
              <div className="weekly-progress__loading-streak-number">-</div>
              <div className="weekly-progress__loading-streak-label">Day Streak</div>
            </div>
          </div>
          <div className="weekly-progress__loading-grid">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="weekly-progress__loading-day"
              >
                <div className="weekly-progress__loading-day-name">-</div>
                <div className="weekly-progress__loading-day-number">-</div>
                <div className="weekly-progress__loading-day-indicator">
                  <div className="weekly-progress__loading-day-dot"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="weekly-progress__content">
          {/* Week header (optional visual improvement) */}
          <div className="weekly-progress__week-header">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel, index) => (
              <div key={index} className="weekly-progress__day-label">
                {dayLabel}
              </div>
            ))}
          </div>
          
          <div className="weekly-progress__grid">
            {weekDays.map((day: WeekDay, index: number) => (
              <div
                key={index}
                className={`weekly-progress__day ${
                  day.isToday
                    ? 'weekly-progress__day--today'
                    : day.completed
                      ? 'weekly-progress__day--completed'
                      : 'weekly-progress__day--default'
                } ${(day.workoutSession || day.plannedWorkout) ? 'weekly-progress__day--with-workout' : ''}`}
                onClick={() => handleDayClick(day)}
              >
                <div className="weekly-progress__day-name">{day.day}</div>
                <div className="weekly-progress__day-number">{day.dayNum}</div>
                <div className="weekly-progress__day-indicator">
                  {day.completed ? (
                    <div className="weekly-progress__day-indicator--completed">✓</div>
                  ) : day.isToday ? (
                    <div className="weekly-progress__day-indicator--today"></div>
                  ) : (
                    <div className="weekly-progress__day-indicator--default"></div>
                  )}
                </div>
                
                {/* Exercise count indicator */}
                {day.workoutSession && (
                  <div className="weekly-progress__exercise-count weekly-progress__exercise-count--completed">
                    {day.workoutSession.exercises.length} ex
                  </div>
                )}
                {day.plannedWorkout && (
                  <div className="weekly-progress__exercise-count weekly-progress__exercise-count--planned">
                    {day.plannedWorkout.exercises.length} planned
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Exercise Details Modal */}
          <Modal 
            isOpen={isModalOpen} 
            onClose={closeModal}
            title={selectedDay ? `${selectedDay.day} (${selectedDay.dayNum}) - Workout Details` : 'Workout Details'}
          >
            {selectedDay && (
              <div className="weekly-progress__modal-content">
                <div className="weekly-progress__modal-badges">
                  {selectedDay.completed && <Badge variant="outline" className="weekly-progress__modal-badge">Completed</Badge>}
                  {selectedDay.isToday && <Badge variant="default" className="weekly-progress__modal-badge">Today</Badge>}
                </div>
                
                {selectedDay.workoutSession && (
                  <div className="weekly-progress__workout-section weekly-progress__workout-section--completed">
                    <h3 className="weekly-progress__workout-title weekly-progress__workout-title--completed">Completed Workout</h3>
                    <div className="weekly-progress__workout-meta weekly-progress__workout-meta--completed">
                      Duration: {selectedDay.workoutSession.duration}min | 
                      XP: {selectedDay.workoutSession.xpEarned} | 
                      Categories: {selectedDay.workoutSession.categories.join(', ')}
                    </div>
                    <div className="weekly-progress__exercise-list">
                      {selectedDay.workoutSession.exercises.map((exercise, exIndex) => (
                        <div key={exIndex} className="weekly-progress__exercise-item weekly-progress__exercise-item--completed">
                          <div className="weekly-progress__exercise-name weekly-progress__exercise-name--completed">{exercise.name}</div>
                          <div className="weekly-progress__exercise-sets weekly-progress__exercise-sets--completed">
                            {exercise.sets.map((set, setIndex) => 
                              'reps' in set ? `${set.reps} reps` : `${set.duration}s`
                            ).join(' → ')}
                          </div>
                          {exercise.equipment && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--completed">
                              Equipment: {exercise.equipment}
                            </div>
                          )}
                          {exercise.tempo && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--completed">
                              Tempo: {exercise.tempo}
                            </div>
                          )}
                          {exercise.rest && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--completed">
                              Rest: {exercise.rest}s
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedDay.plannedWorkout && (
                  <div className="weekly-progress__workout-section weekly-progress__workout-section--planned">
                    <h3 className="weekly-progress__workout-title weekly-progress__workout-title--planned">Planned Workout</h3>
                    <div className="weekly-progress__workout-meta weekly-progress__workout-meta--planned">
                      Planned Duration: {selectedDay.plannedWorkout.duration}min | 
                      Expected XP: {selectedDay.plannedWorkout.xpEarned} | 
                      Categories: {selectedDay.plannedWorkout.categories.join(', ')}
                    </div>
                    <div className="weekly-progress__exercise-list">
                      {selectedDay.plannedWorkout.exercises.map((exercise, exIndex) => (
                        <div key={exIndex} className="weekly-progress__exercise-item weekly-progress__exercise-item--planned">
                          <div className="weekly-progress__exercise-name weekly-progress__exercise-name--planned">{exercise.name}</div>
                          <div className="weekly-progress__exercise-sets weekly-progress__exercise-sets--planned">
                            {exercise.sets.map((set, setIndex) => 
                              'reps' in set ? `${set.reps} reps` : `${set.duration}s`
                            ).join(' → ')}
                          </div>
                          {exercise.equipment && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--planned">
                              Equipment: {exercise.equipment}
                            </div>
                          )}
                          {exercise.tempo && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--planned">
                              Tempo: {exercise.tempo}
                            </div>
                          )}
                          {exercise.rest && (
                            <div className="weekly-progress__exercise-detail weekly-progress__exercise-detail--planned">
                              Rest: {exercise.rest}s
                            </div>
                          )}
                          {exercise.notes && (
                            <div className="weekly-progress__exercise-notes weekly-progress__exercise-notes--planned">
                              💡 {exercise.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Modal>
        </div>
      )}
    </div>
  )
}
