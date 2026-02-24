/**
 * User Mock Data
 */

import type { CurrentUserLevels, WorkoutSession } from '@/api/user'
import type { BaseExercise } from '@/api/exercises'
import { allExercises } from './exercises'

// Mock user's current progress levels
export const MOCK_CurrentUserLevel: CurrentUserLevels = {
  Push: 1,
  Pull: 1,
  Squat: 1
}

// Helper to filter exercises by category and level
const getExercisesForCategory = (
  category: 'Push' | 'Pull' | 'Squat',
  level: number
): BaseExercise[] => {
  return allExercises
    .filter(ex => ex.category === category && ex.level === level)
    .map(({ name, sets, tempo, rest, equipment, category: cat }) => ({
      name,
      sets,
      tempo,
      rest,
      category: cat,
      ...(equipment && { equipment })
    }))
}

// Get dates for the current week (Monday, Wednesday, Friday) as ISO strings
const getCurrentWeekWorkoutDates = (): string[] => {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday, 1 = Monday, etc.

  // Calculate offset to get to Monday of current week
  const daysToMonday = day === 0 ? -6 : 1 - day

  const monday = new Date(now)
  monday.setDate(now.getDate() + daysToMonday)
  monday.setHours(9, 0, 0, 0)

  const wednesday = new Date(monday)
  wednesday.setDate(monday.getDate() + 2)

  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  return [monday.toISOString(), wednesday.toISOString(), friday.toISOString()]
}

// Generate workout sessions based on user's current levels
const generateWorkoutSessions = (): WorkoutSession[] => {
  const categories = Object.keys(MOCK_CurrentUserLevel) as ('Push' | 'Pull' | 'Squat')[]
  const workoutDates = getCurrentWeekWorkoutDates()

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
export const MOCK_weeklyWorkouts: WorkoutSession[] = generateWorkoutSessions()
