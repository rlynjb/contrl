/**
 * Exercise Data Service - Handles exercise and workout level data
 */

import { apiClient } from './api-client'
import { DATA_SOURCE_CONFIG } from './config'

// Import existing mock data
import { workoutLevels } from './mock-data/WorkoutLevels'

// Import types
import type { BaseExercise } from '@/types'
import type { WorkoutLevels, WorkoutLevel } from './mock-data/WorkoutLevels/types'

export class ExerciseService {
  /**
   * Get all workout levels with exercises organized by difficulty
   */
  static async getWorkoutLevels(): Promise<WorkoutLevels> {
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA || !DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_EXERCISES) {
      // Return mock data
      return Promise.resolve(workoutLevels)
    }

    try {
      // TODO: Replace with actual API endpoint
      const response = await apiClient.get<WorkoutLevels>('/.netlify/functions/exercises/levels')
      return response.data
    } catch (error) {
      console.warn('Failed to fetch workout levels from API, falling back to mock data:', error)
      return workoutLevels
    }
  }

  /**
   * Get exercises by level and category
   */
  static async getExercisesByLevel(level: number, category?: string): Promise<BaseExercise[]> {
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA || !DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_EXERCISES) {
      // Filter mock data
      const levelData = workoutLevels[`level${level}` as keyof WorkoutLevels]
      if (!levelData) return []
      
      if (category) {
        return (levelData.exercises as any)[category] || []
      }
      
      // Return all exercises for the level
      return Object.values(levelData.exercises).flat() as BaseExercise[]
    }

    try {
      // TODO: Replace with actual API endpoint
      const params: Record<string, string> = { level: level.toString() }
      if (category) params.category = category
      
      const response = await apiClient.get<BaseExercise[]>('/.netlify/functions/exercises', params)
      return response.data
    } catch (error) {
      console.warn('Failed to fetch exercises from API, falling back to mock data:', error)
      const levelData = workoutLevels[`level${level}` as keyof WorkoutLevels]
      return levelData ? Object.values(levelData.exercises).flat() as BaseExercise[] : []
    }
  }

  /**
   * Search exercises by query
   */
  static async searchExercises(query: string): Promise<BaseExercise[]> {
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA || !DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_EXERCISES) {
      // Simple mock search - filter by name
      const allExercises: BaseExercise[] = Object.values(workoutLevels).flatMap((level: WorkoutLevel) => 
        Object.values(level.exercises).flat()
      ) as BaseExercise[]
      return allExercises.filter((exercise: BaseExercise) => 
        exercise.name.toLowerCase().includes(query.toLowerCase())
      )
    }

    try {
      // TODO: Replace with actual API endpoint
      const response = await apiClient.get<BaseExercise[]>('/.netlify/functions/exercises/search', {
        q: query
      })
      return response.data
    } catch (error) {
      console.warn('Failed to search exercises from API, falling back to mock data:', error)
      const allExercises: BaseExercise[] = Object.values(workoutLevels).flatMap((level: WorkoutLevel) => 
        Object.values(level.exercises).flat()
      ) as BaseExercise[]
      return allExercises.filter((exercise: BaseExercise) => 
        exercise.name.toLowerCase().includes(query.toLowerCase())
      )
    }
  }
}
