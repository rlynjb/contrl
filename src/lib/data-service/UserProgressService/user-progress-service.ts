/**
 * User Progress Service - Handles user progress and level tracking
 * 
 * Storage Strategy:
 * - Development (local): localStorage (fast, easy debugging)
 * - Production (deployed): Netlify Blobs (persistent, cloud-backed)
 * - Future: Database support via feature flags
 */

import { apiClient } from '../api-client'
import { DATA_SOURCE_CONFIG } from '../config'

// Import storage implementations
import { UserProgressLocalStorageService } from './user-progress-localStorage-service'
import { UserProgressNetlifyBlobService } from './user-progress-netlifyBlob-service'

// Import mock data (fallback)
import { currentLevelData } from './mocks/CurrentLevel'
import { weeklyProgressData, generateCompleteWeeklyProgress } from './mocks/WeeklyProgress'

export class UserProgressService {
  /**
   * Get the active storage service based on configuration
   */
  private static getStorageService() {
    if (DATA_SOURCE_CONFIG.STORAGE.USE_NETLIFY_BLOBS) {
      return UserProgressNetlifyBlobService
    }
    return UserProgressLocalStorageService
  }
  
  /**
   * Get user's current levels across categories
   */
  static async getCurrentLevels(userId?: string): Promise<Record<string, number>> {
    // Use localStorage or Netlify Blobs for storage
    if (!DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_USER_PROGRESS) {
      const storage = this.getStorageService()
      const levels = await storage.getCurrentLevels()
      return levels as unknown as Record<string, number>
    }

    // Use mock data in development
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA) {
      return Promise.resolve(currentLevelData.currentLevels as unknown as Record<string, number>)
    }

    // Use database API
    try {
      const params: Record<string, string> = userId ? { userId } : {}
      const response = await apiClient.get<Record<string, number>>('/.netlify/functions/user/levels', params)
      return response.data
    } catch (error) {
      console.warn('Failed to fetch user levels from API, falling back to storage:', error)
      const storage = this.getStorageService()
      const levels = await storage.getCurrentLevels()
      return levels as unknown as Record<string, number>
    }
  }

  /**
   * Update user's level for a specific category
   */
  static async updateUserLevel(category: string, level: number, userId?: string): Promise<boolean> {
    // Use localStorage or Netlify Blobs for storage
    if (!DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_USER_PROGRESS) {
      const storage = this.getStorageService()
      return await storage.updateUserLevel(category, level)
    }

    // Use mock data in development
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA) {
      console.log(`Mock: Updated ${category} level to ${level} for user ${userId || 'default'}`)
      return Promise.resolve(true)
    }

    // Use database API
    try {
      const response = await apiClient.put<{ success: boolean }>('/.netlify/functions/user/levels', {
        category,
        level,
        userId
      })
      return response.data.success
    } catch (error) {
      console.warn('Failed to update user level via API, falling back to storage:', error)
      const storage = this.getStorageService()
      return await storage.updateUserLevel(category, level)
    }
  }

  /**
   * Get user's weekly progress
   */
  static async getWeeklyProgress(userId?: string): Promise<typeof weeklyProgressData> {
    // Use localStorage or Netlify Blobs for storage
    if (!DATA_SOURCE_CONFIG.FEATURES.USE_DATABASE_USER_PROGRESS) {
      const storage = this.getStorageService()
      return await storage.getWeeklyProgress()
    }

    // Use mock data in development
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA) {
      return Promise.resolve(generateCompleteWeeklyProgress())
    }

    // Use database API
    try {
      const params: Record<string, string> = userId ? { userId } : {}
      const response = await apiClient.get<typeof weeklyProgressData>('/.netlify/functions/user/progress/weekly', params)
      return response.data
    } catch (error) {
      console.warn('Failed to fetch weekly progress from API, falling back to storage:', error)
      const storage = this.getStorageService()
      return await storage.getWeeklyProgress()
    }
  }
  
  /**
   * Log a completed workout
   * New method for workout tracking
   */
  static async logWorkout(workout: any): Promise<boolean> {
    const storage = this.getStorageService()
    return await storage.logWorkout(workout)
  }
  
  /**
   * Export user progress data (for backup)
   */
  static async exportData(): Promise<string> {
    if (DATA_SOURCE_CONFIG.STORAGE.USE_NETLIFY_BLOBS) {
      return await UserProgressNetlifyBlobService.export()
    }
    return UserProgressLocalStorageService.export()
  }
  
  /**
   * Import user progress data (from backup)
   */
  static async importData(jsonString: string): Promise<void> {
    if (DATA_SOURCE_CONFIG.STORAGE.USE_NETLIFY_BLOBS) {
      await UserProgressNetlifyBlobService.import(jsonString)
    } else {
      UserProgressLocalStorageService.import(jsonString)
    }
  }
  
  /**
   * Clear all user progress data
   */
  static async clearData(): Promise<void> {
    if (DATA_SOURCE_CONFIG.STORAGE.USE_NETLIFY_BLOBS) {
      await UserProgressNetlifyBlobService.clear()
    } else {
      UserProgressLocalStorageService.clear()
    }
  }
}

