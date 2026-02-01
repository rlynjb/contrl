/**
 * Main Data Service - Unified access point for all data operations
 */

import { ExerciseService } from './ExerciseService'
import { UserProgressService } from './UserProgressService'
import { apiClient } from './api-client'
import { DATA_SOURCE_CONFIG } from './config'

/**
 * Main Data Service - Unified access point
 */
export const dataService = {
  exercises: ExerciseService,
  userProgress: UserProgressService,
  
  // Utility methods
  isUsingMockData: () => DATA_SOURCE_CONFIG.USE_MOCK_DATA,
  getConfig: () => DATA_SOURCE_CONFIG,
  
  // Health check
  async healthCheck(): Promise<boolean> {
    if (DATA_SOURCE_CONFIG.USE_MOCK_DATA) {
      return Promise.resolve(true)
    }
    
    try {
      await apiClient.get('/.netlify/functions/health')
      return true
    } catch {
      return false
    }
  }
}
