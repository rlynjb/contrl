import { describe, it, expect } from 'vitest'
import { updateStreakOnWeekEnd, calculateStreak } from '../streaks'
import type { WeekProgress } from '@/types'

function completeWeek(weekStart: string): WeekProgress {
  return { weekStart, sessionsCompleted: { push: true, pull: true, squat: true } }
}

function incompleteWeek(weekStart: string): WeekProgress {
  return { weekStart, sessionsCompleted: { push: true, pull: false, squat: false } }
}

describe('updateStreakOnWeekEnd', () => {
  it('increments streak on complete week', () => {
    expect(updateStreakOnWeekEnd(2, completeWeek('2025-01-13'))).toBe(3)
  })

  it('resets to 0 on incomplete week', () => {
    expect(updateStreakOnWeekEnd(5, incompleteWeek('2025-01-13'))).toBe(0)
  })
})

describe('calculateStreak', () => {
  it('returns 0 for empty history', () => {
    expect(calculateStreak([])).toBe(0)
  })

  it('counts consecutive complete weeks', () => {
    expect(calculateStreak([
      completeWeek('2025-01-06'),
      completeWeek('2025-01-13'),
      completeWeek('2025-01-20'),
    ])).toBe(3)
  })

  it('resets on incomplete week', () => {
    expect(calculateStreak([
      completeWeek('2025-01-06'),
      completeWeek('2025-01-13'),
      incompleteWeek('2025-01-20'),
      completeWeek('2025-01-27'),
    ])).toBe(1)
  })

  it('only counts current streak (from end)', () => {
    expect(calculateStreak([
      completeWeek('2025-01-06'),
      incompleteWeek('2025-01-13'),
      completeWeek('2025-01-20'),
      completeWeek('2025-01-27'),
    ])).toBe(2)
  })
})
