import type { UserData } from '../../localStorage'
import { MOCK_CurrentUserLevel } from '../CurrentLevel'
import { MOCK_weeklyWorkouts } from '../WeeklyProgress'

// Complete mock user data combining levels and weekly progress
export const MOCK_UserData: UserData = {
  currentLevels: MOCK_CurrentUserLevel,
  weeklyProgress: MOCK_weeklyWorkouts,
  lastUpdated: new Date().toISOString()
}
