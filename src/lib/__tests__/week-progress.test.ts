import { describe, it, expect } from 'vitest'
import {
  getWeekStart,
  createWeekProgress,
  markCategoryDone,
  isWeekComplete,
  needsWeekReset,
  completedCount,
} from '../week-progress'

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2025-01-15 is a Wednesday
    expect(getWeekStart(new Date('2025-01-15T12:00:00'))).toBe('2025-01-13')
  })

  it('returns same Monday for a Monday', () => {
    expect(getWeekStart(new Date('2025-01-13T08:00:00'))).toBe('2025-01-13')
  })

  it('returns previous Monday for a Sunday', () => {
    // 2025-01-19 is a Sunday
    expect(getWeekStart(new Date('2025-01-19T18:00:00'))).toBe('2025-01-13')
  })

  it('returns previous Monday for a Saturday', () => {
    expect(getWeekStart(new Date('2025-01-18T12:00:00'))).toBe('2025-01-13')
  })
})

describe('createWeekProgress', () => {
  it('creates empty week with all categories false', () => {
    const week = createWeekProgress(new Date('2025-01-15'))
    expect(week.weekStart).toBe('2025-01-13')
    expect(week.sessionsCompleted).toEqual({ push: false, pull: false, squat: false })
  })
})

describe('markCategoryDone', () => {
  it('marks a category as completed', () => {
    const week = createWeekProgress(new Date('2025-01-15'))
    const updated = markCategoryDone(week, 'push')
    expect(updated.sessionsCompleted.push).toBe(true)
    expect(updated.sessionsCompleted.pull).toBe(false)
  })

  it('is idempotent', () => {
    const week = createWeekProgress(new Date('2025-01-15'))
    const first = markCategoryDone(week, 'push')
    const second = markCategoryDone(first, 'push')
    expect(second.sessionsCompleted.push).toBe(true)
  })
})

describe('isWeekComplete', () => {
  it('returns false when not all categories done', () => {
    const week = createWeekProgress(new Date('2025-01-15'))
    expect(isWeekComplete(markCategoryDone(week, 'push'))).toBe(false)
  })

  it('returns true when all 3 categories done', () => {
    let week = createWeekProgress(new Date('2025-01-15'))
    week = markCategoryDone(week, 'push')
    week = markCategoryDone(week, 'pull')
    week = markCategoryDone(week, 'squat')
    expect(isWeekComplete(week)).toBe(true)
  })
})

describe('needsWeekReset', () => {
  it('returns true for null week', () => {
    expect(needsWeekReset(null, new Date())).toBe(true)
  })

  it('returns false when same calendar week', () => {
    const week = createWeekProgress(new Date('2025-01-15'))
    expect(needsWeekReset(week, new Date('2025-01-17'))).toBe(false)
  })

  it('returns true when different calendar week', () => {
    const week = createWeekProgress(new Date('2025-01-13'))
    expect(needsWeekReset(week, new Date('2025-01-20'))).toBe(true)
  })
})

describe('completedCount', () => {
  it('returns 0 for fresh week', () => {
    expect(completedCount(createWeekProgress(new Date()))).toBe(0)
  })

  it('returns correct count', () => {
    let week = createWeekProgress(new Date())
    week = markCategoryDone(week, 'push')
    week = markCategoryDone(week, 'squat')
    expect(completedCount(week)).toBe(2)
  })
})
