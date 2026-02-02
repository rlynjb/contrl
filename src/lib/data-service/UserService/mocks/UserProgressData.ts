import { currentLevelData } from './CurrentLevel'
import { sampleWorkouts } from './WeeklyProgress'

export const dataSource = {
  currentLevels: currentLevelData,
  weeklyProgress: sampleWorkouts,
  completedWorkouts: [],
  levelProgress: {
    Push: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() },
    Pull: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() },
    Squat: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() }
  },
  lastUpdated: new Date().toISOString()
}