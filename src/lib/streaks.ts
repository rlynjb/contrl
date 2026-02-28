import type { WeekProgress } from '@/types'
import { isWeekComplete } from './week-progress'

/**
 * Update streak when a week ends (i.e. new week starts).
 * Complete week → increment. Incomplete → reset to 0.
 */
export function updateStreakOnWeekEnd(
  currentStreak: number,
  endedWeek: WeekProgress
): number {
  return isWeekComplete(endedWeek) ? currentStreak + 1 : 0
}

/**
 * Calculate streak from a list of archived week histories (oldest → newest).
 */
export function calculateStreak(history: WeekProgress[]): number {
  let streak = 0
  for (const week of history) {
    if (isWeekComplete(week)) {
      streak += 1
    } else {
      streak = 0
    }
  }
  return streak
}
