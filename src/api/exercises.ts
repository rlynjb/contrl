/**
 * Exercise API
 */

import { apiClient } from './client'

// Types
export interface BaseExerciseSet {
  reps?: number
  duration?: number
}

export interface BaseExercise {
  name: string
  tempo?: string
  rest?: number
  equipment?: string
  notes?: string
  sets: BaseExerciseSet[]
  completed?: boolean
  completedSets?: boolean[]
}

export interface ExerciseWithMetadata extends BaseExercise {
  id: string
  level: number
  levelName: string
  category: 'Push' | 'Pull' | 'Squat'
  difficulty: 'Foundation' | 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Expert'
  tags: string[]
}

export interface ExercisesByCategory {
  Push: BaseExercise[]
  Pull: BaseExercise[]
  Squat: BaseExercise[]
}

export interface WorkoutLevel {
  name: string
  description?: string
  exercises: ExercisesByCategory
}

export type WorkoutLevels = Record<string, WorkoutLevel>

export interface ExerciseLevelInfo {
  level: number
  name: string
  category: string
  originalSets?: BaseExerciseSet[]
}

// API functions
export const exerciseApi = {
  async getWorkoutLevels(): Promise<WorkoutLevels> {
    const response = await apiClient.get<WorkoutLevels>('/exercises/levels')
    return response.data
  },

  async getExercisesByLevel(level: number, category?: string): Promise<BaseExercise[]> {
    const params: Record<string, string> = { level: level.toString() }
    if (category) params.category = category

    const response = await apiClient.get<BaseExercise[]>('/exercises', params)
    return response.data
  },

  async searchExercises(query: string): Promise<BaseExercise[]> {
    const response = await apiClient.get<BaseExercise[]>('/exercises/search', {
      q: query
    })
    return response.data
  },

  async getExerciseLevel(name: string): Promise<ExerciseLevelInfo | null> {
    const response = await apiClient.get<ExerciseLevelInfo | null>(
      '/exercises/level',
      { name }
    )
    return response.data
  },

  async addExercise(exercise: BaseExercise): Promise<{ success: boolean; exercise?: BaseExercise }> {
    const response = await apiClient.post<{ success: boolean; exercise?: BaseExercise }>(
      '/exercises',
      exercise
    )
    return response.data
  }
}
