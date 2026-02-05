/**
 * Exercise Data Service - Handles exercise and workout level data
 * 
 * Configure data source via: NEXT_PUBLIC_EXERCISE_SOURCE
 * Options: 'mock' | 'api'
 * Default: 'mock' (dev) | 'api' (prod)
 */

import { Api } from './api'

// Import existing mock data
import { workoutLevels } from './mocks'

// Import types
import type { BaseExercise, WorkoutLevels, WorkoutLevel } from './mocks/types'

// Data source type
type DataSource = 'mock' | 'api'

export class ExerciseService {
  private static customExercises: BaseExercise[] = []

  static addExercise(exercise: BaseExercise): void {
    const exists = this.customExercises.some(
      e => e.name.toLowerCase() === exercise.name.toLowerCase()
    )
    if (!exists) {
      this.customExercises.push(exercise)
    }
  }

  private static get dataSource(): DataSource {
    const envSource = process.env.NEXT_PUBLIC_EXERCISE_SOURCE as DataSource | undefined
    
    // Use environment variable if specified
    if (envSource) {
      return envSource
    }
    
    // Default: mock (dev) | api (prod)
    return process.env.NODE_ENV === 'production' ? 'api' : 'mock'
  }

  /**
   * Get all workout levels with exercises organized by difficulty
   */
  static async getWorkoutLevels(): Promise<WorkoutLevels> {
    const dataSource = this.dataSource

    switch (dataSource) {
      case 'mock':
        return workoutLevels

      case 'api':
        try {
          return await Api.getWorkoutLevels()
        } catch (error) {
          console.warn('API failed, falling back to mock:', error)
          return workoutLevels
        }

      default:
        return workoutLevels
    }
  }

  /**
   * Get exercises by level and category
   */
  static async getExercisesByLevel(level: number, category?: string): Promise<BaseExercise[]> {
    const dataSource = this.dataSource

    switch (dataSource) {
      case 'mock':
        const levelData = workoutLevels[`level${level}` as keyof WorkoutLevels]
        if (!levelData) return []
        
        if (category) {
          return (levelData.exercises as any)[category] || []
        }
        
        return Object.values(levelData.exercises).flat() as BaseExercise[]

      case 'api':
        try {
          return await Api.getExercisesByLevel(level, category)
        } catch (error) {
          console.warn('API failed, falling back to mock:', error)
          const fallbackLevel = workoutLevels[`level${level}` as keyof WorkoutLevels]
          return fallbackLevel ? Object.values(fallbackLevel.exercises).flat() as BaseExercise[] : []
        }

      default:
        return []
    }
  }

  /**
   * Search exercises by query
   */
  static async searchExercises(query: string): Promise<BaseExercise[]> {
    const dataSource = this.dataSource

    switch (dataSource) {
      case 'mock':
        const allExercises: BaseExercise[] = [
          ...this.customExercises,
          ...Object.values(workoutLevels).flatMap((level: WorkoutLevel) =>
            Object.values(level.exercises).flat()
          ) as BaseExercise[]
        ]
        return allExercises.filter((exercise: BaseExercise) =>
          exercise.name.toLowerCase().includes(query.toLowerCase())
        )

      case 'api':
        try {
          return await Api.searchExercises(query)
        } catch (error) {
          console.warn('API failed, falling back to mock:', error)
          const fallbackExercises: BaseExercise[] = [
            ...this.customExercises,
            ...Object.values(workoutLevels).flatMap((level: WorkoutLevel) =>
              Object.values(level.exercises).flat()
            ) as BaseExercise[]
          ]
          return fallbackExercises.filter((exercise: BaseExercise) =>
            exercise.name.toLowerCase().includes(query.toLowerCase())
          )
        }

      default:
        return []
    }
  }

  /**
   * Look up which level an exercise belongs to by name.
   * Returns null for custom exercises or if not found.
   */
  static getExerciseLevel(exerciseName: string): { level: number, name: string, category: string } | null {
    const entries = Object.entries(workoutLevels)
    for (let i = 0; i < entries.length; i++) {
      for (const [category, exercises] of Object.entries(entries[i][1].exercises)) {
        if ((exercises as BaseExercise[]).some((e: BaseExercise) => e.name === exerciseName)) {
          return { level: i, name: entries[i][1].name, category }
        }
      }
    }
    return null
  }
}
