import type { DailyHabitEntry } from '@/types'
import { getWeekStart } from './game/week-progress'

export const DEFAULT_DAILY_STEPS_GOAL = 8000
export const DEFAULT_DAILY_PLANK_GOAL_SECONDS = 60
export const STEP_GOALS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000] as const
export const PLANK_GOALS = [30, 45, 60, 90] as const

export function toLocalDateKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getWeekDateKeys(date: Date = new Date()): string[] {
  const [year, month, day] = getWeekStart(date).split('-').map(Number)
  const start = new Date(year, month - 1, day)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toLocalDateKey(d)
  })
}

export function isStepsComplete(entry: DailyHabitEntry | null): boolean {
  return entry?.stepsCount != null && entry.stepsCount >= entry.stepsGoal
}

export function isPlankComplete(entry: DailyHabitEntry | null): boolean {
  return entry?.plankSeconds != null && entry.plankSeconds >= entry.plankGoalSeconds
}

export function formatSteps(value: number | null): string {
  if (value == null) return '-'
  if (value >= 1000) {
    const rounded = Math.round(value / 100) / 10
    return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}K`
  }
  return String(value)
}

export function formatSeconds(value: number | null): string {
  if (value == null) return '-'
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
