/**
 * MSW Mocks Module
 *
 * Export handlers, utilities, and mock data for Mock Service Worker.
 */

export { handlers, resetMockData } from './handlers'
export { MSWProvider } from './MSWProvider'

// Re-export mock data for database seeding and tests
export {
  allExercises,
  workoutLevels,
  MOCK_CurrentUserLevel,
  MOCK_weeklyWorkouts,
} from './data'

// Re-export types for convenience
export type { HttpHandler } from 'msw'
