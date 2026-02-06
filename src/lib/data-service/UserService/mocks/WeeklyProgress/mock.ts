import type { WorkoutSession } from './types'
import type { BaseExercise } from '@/lib/data-service/ExerciseService/mocks/types'
import { MOCK_CurrentUserLevel } from '../CurrentLevel'
import { allExercises } from '@/lib/data-service/ExerciseService/mocks/mock'

// Helper to filter exercises by category and level
const getExercisesForCategory = (
  category: 'Push' | 'Pull' | 'Squat',
  level: number
): BaseExercise[] => {
  return allExercises
    .filter(ex => ex.category === category && ex.level === level)
    .map(({ name, sets, tempo, rest, equipment }) => ({
      name,
      sets,
      tempo,
      rest,
      ...(equipment && { equipment })
    }))
}

// Generate workout sessions based on user's current levels
const generateWorkoutSessions = (): WorkoutSession[] => {
  const categories = Object.keys(MOCK_CurrentUserLevel) as ('Push' | 'Pull' | 'Squat')[]

  // Base dates for the week of Feb 2-8, 2026
  const workoutDates = [
    new Date("2026-02-03T09:00:00.000Z"), // Monday - Push
    new Date("2026-02-04T09:00:00.000Z"), // Tuesday - Pull
    new Date("2026-02-05T09:00:00.000Z"), // Wednesday - Squat
  ]

  return categories.map((category, index) => {
    const level = MOCK_CurrentUserLevel[category]
    const exercises = getExercisesForCategory(category, level)

    return {
      exercises,
      categories: [category],
      level,
      date: workoutDates[index]
    }
  })
}

// Generated workout sessions based on MOCK_CurrentUserLevel
const MOCK_weeklyWorkouts: WorkoutSession[] = generateWorkoutSessions()

// Today's planned workout - combines all categories
const todaysTodayWorkout: WorkoutSession = {
  exercises: [
    ...getExercisesForCategory('Push', MOCK_CurrentUserLevel.Push),
    ...getExercisesForCategory('Pull', MOCK_CurrentUserLevel.Pull),
    ...getExercisesForCategory('Squat', MOCK_CurrentUserLevel.Squat)
  ],
  categories: ['Push', 'Pull', 'Squat'],
  level: Math.max(MOCK_CurrentUserLevel.Push, MOCK_CurrentUserLevel.Pull, MOCK_CurrentUserLevel.Squat),
  date: new Date("2026-02-02T18:00:00.000Z") // Sunday, Feb 2, 2026
}

export { MOCK_weeklyWorkouts, todaysTodayWorkout }
