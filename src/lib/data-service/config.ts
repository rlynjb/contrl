/**
 * Configuration for data sources and API endpoints
 */

/**
 * Storage Backend Options:
 * - Mock: Use mock data from service mocks folders (development only)
 * - localStorage: Browser local storage (development & production - single device)
 * - Netlify Blobs: Cloud storage via Netlify Blobs (production - persistent)
 * - Database: PostgreSQL/Neon database (future - full production)
 */
export const DATA_SOURCE_CONFIG = {
  // Toggle between 'mock' and 'api' data sources
  USE_MOCK_DATA: process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true',
  
  // Storage backend selection for user progress and workout plans
  // Use localStorage for development/testing, Netlify Blobs for production
  STORAGE: {
    // localStorage: Fast, browser-based (default for development)
    USE_LOCALSTORAGE: process.env.NEXT_PUBLIC_USE_LOCALSTORAGE === 'true' || 
                       (process.env.NODE_ENV === 'development' && 
                        process.env.NEXT_PUBLIC_USE_NETLIFY_BLOBS !== 'true'),
    
    // Netlify Blobs: Server-side cloud storage (recommended for production)
    USE_NETLIFY_BLOBS: process.env.NEXT_PUBLIC_USE_NETLIFY_BLOBS === 'true' || 
                        (process.env.NODE_ENV === 'production' && 
                         process.env.NEXT_PUBLIC_USE_LOCALSTORAGE !== 'true'),
  },
  
  // API base configuration
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  TIMEOUT: 10000, // 10 seconds
  
  // Feature flags for gradual rollout
  FEATURES: {
    // Database for exercises (static data)
    USE_DATABASE_EXERCISES: process.env.NEXT_PUBLIC_USE_DATABASE_EXERCISES === 'true',
    
    // Database for user progress (dynamic data) - future enhancement
    USE_DATABASE_USER_PROGRESS: process.env.NEXT_PUBLIC_USE_DATABASE_USER_PROGRESS === 'true',
    
    // Database for workout plans (dynamic data) - future enhancement
    USE_DATABASE_WORKOUT_PLANS: process.env.NEXT_PUBLIC_USE_DATABASE_WORKOUT_PLANS === 'true',
  }
} as const

export type DataSourceConfig = typeof DATA_SOURCE_CONFIG
