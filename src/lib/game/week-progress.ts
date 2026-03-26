import type { Category, WeekProgress } from '@/types'
import { CATEGORIES } from '@/types'

/**
 * Get the Monday date string ("YYYY-MM-DD") for the week containing `date`.
 */
export function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Create a fresh WeekProgress for the week containing `date`.
 */
export function createWeekProgress(date: Date): WeekProgress {
  return {
    weekStart: getWeekStart(date),
    sessionsCompleted: { push: false, pull: false, squat: false },
  }
}

/**
 * Mark a category as completed for the week.
 */
export function markCategoryDone(
  week: WeekProgress,
  category: Category
): WeekProgress {
  return {
    ...week,
    sessionsCompleted: {
      ...week.sessionsCompleted,
      [category]: true,
    },
  }
}

/**
 * A week is "complete" when all 3 categories have been logged.
 */
export function isWeekComplete(week: WeekProgress): boolean {
  return CATEGORIES.every(c => week.sessionsCompleted[c])
}

/**
 * Check whether `week` belongs to the current calendar week.
 * If not, a reset is needed.
 */
export function needsWeekReset(week: WeekProgress | null, now: Date): boolean {
  if (!week) return true
  return getWeekStart(now) !== week.weekStart
}

/**
 * Count how many categories are done this week.
 */
export function completedCount(week: WeekProgress): number {
  return CATEGORIES.filter(c => week.sessionsCompleted[c]).length
}
