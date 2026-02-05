import { ExerciseCard } from '@/components/ui'
import type { ExtendedWeekDay } from './WeeklyProgress'

interface WorkoutDetailProps {
  selectedDay: ExtendedWeekDay
}

export default function WorkoutDetail({ selectedDay }: WorkoutDetailProps) {
  const hasWorkouts = selectedDay.exercises?.length || selectedDay.todayWorkout

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
        <div className="weekly-progress__workout-section weekly-progress__workout-section--completed">
          <div className="weekly-progress__workout-meta weekly-progress__workout-meta--completed">
            Completed: {new Date(selectedDay.date).toLocaleString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            })} | 
            Duration: {selectedDay.duration}min | 
            Categories: {(selectedDay.categories ?? []).join(', ')}
          </div>
          <div className="weekly-progress__exercise-list">
            {selectedDay.exercises.map((exercise, exIndex) => (
              <ExerciseCard 
                key={exIndex}
                exercise={exercise}
                className="weekly-progress__exercise-card weekly-progress__exercise-card--completed"
              />
            ))}
          </div>
        </div>
      
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
            Duration: {selectedDay.todayWorkout.duration}min | 
            Categories: {(selectedDay.todayWorkout.categories ?? []).join(', ')}
          </div>
          <div className="weekly-progress__exercise-list">
            {selectedDay.todayWorkout.exercises.map((exercise, exIndex) => (
              <ExerciseCard 
                key={exIndex}
                exercise={exercise}
                className="weekly-progress__exercise-card weekly-progress__exercise-card--planned"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}