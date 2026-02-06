import { ExerciseCard, WorkoutExerciseCard } from '@/components/ui'
import { api } from '@/api'
import type { BaseExercise } from '@/api'
import type { ExtendedWeekDay } from './WeeklyProgress'

interface WorkoutDetailProps {
  selectedDay: ExtendedWeekDay
  onWorkoutUpdate?: () => void
}

export default function WorkoutDetail({ selectedDay, onWorkoutUpdate }: WorkoutDetailProps) {
  const hasWorkouts = selectedDay.exercises?.length || selectedDay.todayWorkout

  const handleExerciseChange = async (updatedExercise: BaseExercise, index: number) => {
    // Get current user data
    const userData = await api.user.getUserData()
    if (!userData?.weeklyProgress) return

    // Find and update the workout session for this day
    const dayDate = new Date(selectedDay.date).toDateString()
    const updatedProgress = userData.weeklyProgress.map(session => {
      if (new Date(session.date).toDateString() === dayDate) {
        const updatedExercises = [...session.exercises]
        updatedExercises[index] = updatedExercise
        return { ...session, exercises: updatedExercises }
      }
      return session
    })

    // Save updated data
    await api.user.updateUserData({
      ...userData,
      weeklyProgress: updatedProgress
    })

    onWorkoutUpdate?.()
  }

  if (!hasWorkouts) {
    return (
      <div className="weekly-progress__modal-content">
        <div className="weekly-progress__exercise-list">
          <ExerciseCard
            exercise={{ name: '', sets: [] }}
            onExerciseChange={() => {}}
            className="weekly-progress__exercise-card"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="weekly-progress__modal-content">
      {selectedDay.exercises && selectedDay.exercises.length > 0 && (
        <div className="weekly-progress__workout-section weekly-progress__workout-section--completed">
          <div className="weekly-progress__exercise-list">
            {selectedDay.exercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={exIndex}
                exercise={exercise}
                onExerciseChange={(updated) => handleExerciseChange(updated, exIndex)}
                className="weekly-progress__exercise-card"
              />
            ))}
          </div>
        </div>
      )}

      {selectedDay.todayWorkout && (
        <div className="weekly-progress__workout-section weekly-progress__workout-section--planned">
          <div className="weekly-progress__workout-meta weekly-progress__workout-meta--planned">
            Today: {new Date(selectedDay.todayWorkout.date).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })} |
            Categories: {(selectedDay.todayWorkout.categories ?? []).join(', ')}
          </div>
          <div className="weekly-progress__exercise-list">
            {selectedDay.todayWorkout.exercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={exIndex}
                exercise={exercise}
                onExerciseChange={(updated) => handleExerciseChange(updated, exIndex)}
                className="weekly-progress__exercise-card"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}