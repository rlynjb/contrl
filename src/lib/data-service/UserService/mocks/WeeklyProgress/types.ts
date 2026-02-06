/**
 * Types specific to WeeklyProgress mock data
 */

import type { BaseExercise } from '@/lib/data-service/ExerciseService/mocks/types'

// Single workout session data
export interface WorkoutSession {
  exercises: BaseExercise[]
  categories: ('Push' | 'Pull' | 'Squat')[]
  level: number
  date: Date // When the workout was completed or is planned
}

// Individual day in the weekly progress
export interface WeekDay {
  date: Date // ISO date string
  completed: boolean
  isToday: boolean
  completedWorkout?: WorkoutSession // Completed workout data
  todayWorkout?: WorkoutSession // What's planned for today/future
  isWorkoutDay?: boolean
}

// Complete weekly progress data structure
export interface WeeklyProgressData {
  weekDays?: WeekDay[]
}
