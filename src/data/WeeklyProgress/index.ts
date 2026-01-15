// WeeklyProgress Module Exports
// Clean export interface for WeeklyProgress data

export type { 
  WeekDay, 
  WeeklyStats, 
  WeeklyProgressData,
  WorkoutSession
} from './mock'

export { 
  generateWeeklyProgress,
  calculateWeeklyStats,
  generateMotivationalMessage,
  getRelevantAchievements,
  generateCompleteWeeklyProgress,
  getTodaysWorkoutPreview,
  getRecentWorkoutSummary,
  weeklyProgressData
} from './normalization'
