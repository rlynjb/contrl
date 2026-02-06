/**
 * UserProgressService - localStorage Implementation
 * 
 * Stores user progress data (current levels, weekly progress)
 * in browser's localStorage. Suitable for development and single-user production.
 */

import type { CurrentUserLevels } from './mocks/CurrentLevel/types'
import type { WorkoutSession } from './mocks/WeeklyProgress/types'

export interface UserData {
  currentLevels: CurrentUserLevels
  lastUpdated: string
  weeklyProgress?: WorkoutSession[]
}

export class LocalStorage {
  private static readonly STORAGE_KEY = 'calistheniq_user_progress'
  
  static getUserData(): UserData | null {
    if (typeof window === 'undefined') {
      return null // Server-side rendering
    }
    
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Failed to getUserData from localStorage:', error)
      return null
    }
  }

  static updateUserData(data: UserData): void {
    if (typeof window === 'undefined') {
      return // Server-side rendering
    }

    try {
      data.lastUpdated = new Date().toISOString()
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
      throw error
    }
  }
}
