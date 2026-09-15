import type { DailyHabitEntry } from '@/types'
import { getWeekStart } from './game/week-progress'

export const DEFAULT_DAILY_STEPS_GOAL = 8000
export const DEFAULT_DAILY_PLANK_GOAL_SECONDS = 60
export const STEP_GOALS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000] as const
export const PLANK_GOALS = [30, 45, 60, 90] as const
export const FIXED_PLANK_SET_COUNT = 4
export const FIXED_PLANK_SET_SECONDS = 60
export const FIXED_PLANK_TOTAL_SECONDS = FIXED_PLANK_SET_COUNT * FIXED_PLANK_SET_SECONDS

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

export function stepsFromThousands(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.floor(numeric * 1000)
}

export function stepsToThousandsInput(value: number | null, fallbackGoal: number): string {
  const source = value ?? fallbackGoal
  if (!Number.isFinite(source) || source <= 0) return ''
  const thousands = source / 1000
  return Number.isInteger(thousands) ? String(thousands) : String(Math.round(thousands * 10) / 10)
}

export function plankCompletedSets(entry: DailyHabitEntry | null): number {
  if (!entry?.plankSeconds) return 0
  return Math.min(FIXED_PLANK_SET_COUNT, Math.floor(entry.plankSeconds / FIXED_PLANK_SET_SECONDS))
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
