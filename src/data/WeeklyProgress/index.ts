// WeeklyProgress Module Exports
// Clean export interface for WeeklyProgress data

export type { 
  WeekDay, 
  WeeklyProgressData,
  WorkoutSession
} from './mock'

export { 
  generateWeeklyProgress,
  generateCompleteWeeklyProgress,
  getTodaysWorkoutPreview,
  getRecentWorkoutSummary,
  weeklyProgressData
} from './normalization'
