/**
 * User API
 */

import { apiClient } from './client'
import type { BaseExercise } from './exercises'

// Types
export interface CurrentUserLevels {
  Push: number
  Pull: number
  Squat: number
}

export type MovementCategory = keyof CurrentUserLevels

export interface WorkoutSession {
  exercises: BaseExercise[]
  categories: ('Push' | 'Pull' | 'Squat')[]
  level: number
  date: Date
}

export interface WeekDay {
  date: Date
  completed: boolean
  isToday: boolean
  completedWorkout?: WorkoutSession
  todayWorkout?: WorkoutSession
  isWorkoutDay?: boolean
}

export interface UserData {
  currentLevels: CurrentUserLevels
  lastUpdated: string
  weeklyProgress?: WorkoutSession[]
}

// API functions
export const userApi = {
  async getUserData(): Promise<UserData | null> {
    try {
      const response = await apiClient.get<UserData>('/user/data')
      return response.data
    } catch {
      return null
    }
  },

  async updateUserData(data: UserData): Promise<UserData> {
    const response = await apiClient.put<UserData>('/user/data', data)
    return response.data
  },

  async getCurrentLevels(): Promise<CurrentUserLevels> {
    const response = await apiClient.get<CurrentUserLevels>('/user/levels')
    return response.data
  },

  async updateLevel(category: string, level: number): Promise<boolean> {
    try {
      await apiClient.put('/user/levels', { category, level })
      return true
    } catch {
      return false
    }
  }
}
