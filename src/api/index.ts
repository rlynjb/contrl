/**
 * API Module
 *
 * Centralized API access for the application.
 *
 * Usage:
 *   import { api } from '@/api'
 *   const levels = await api.exercises.getWorkoutLevels()
 *   const user = await api.user.getUserData()
 */

import { exerciseApi } from './exercises'
import { userApi } from './user'
import { apiClient } from './client'

// Main API object
export const api = {
  exercises: exerciseApi,
  user: userApi,

  async healthCheck(): Promise<boolean> {
    try {
      await apiClient.get('/.netlify/functions/health')
      return true
    } catch {
      return false
    }
  }
}

// Named exports for direct imports
export { exerciseApi } from './exercises'
export { userApi } from './user'
export { apiClient } from './client'

// Type exports
export type {
  BaseExercise,
  BaseExerciseSet,
  ExerciseWithMetadata,
  ExercisesByCategory,
  WorkoutLevel,
  WorkoutLevels,
  ExerciseLevelInfo
} from './exercises'

export type {
  CurrentUserLevels,
  MovementCategory,
  WorkoutSession,
  WeekDay,
  UserData
} from './user'

export type { ApiResponse, ApiError } from './client'
