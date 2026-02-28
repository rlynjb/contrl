import { describe, it, expect } from 'vitest'
import { getNodeState, checkCategoryLevelUp } from '../progression'
import type { GateProgress, User } from '@/types'

describe('getNodeState', () => {
  const levels = { push: 2, pull: 1, squat: 1 }

  it('returns "passed" when gate.status is passed', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'passed', consecutivePasses: 3 }
    expect(getNodeState(gate, levels)).toBe('passed')
  })

  it('returns "locked" when gate level > user level', () => {
    const gate: GateProgress = { level: 3, category: 'push', status: 'in-progress', consecutivePasses: 0 }
    expect(getNodeState(gate, levels)).toBe('locked')
  })

  it('returns "in-progress" when consecutivePasses > 0 at current level', () => {
    const gate: GateProgress = { level: 2, category: 'push', status: 'in-progress', consecutivePasses: 2 }
    expect(getNodeState(gate, levels)).toBe('in-progress')
  })

  it('returns "open" when at current level with 0 passes', () => {
    const gate: GateProgress = { level: 2, category: 'push', status: 'in-progress', consecutivePasses: 0 }
    expect(getNodeState(gate, levels)).toBe('open')
  })

  it('returns "open" when at current level with status locked but reachable', () => {
    const gate: GateProgress = { level: 1, category: 'pull', status: 'locked', consecutivePasses: 0 }
    // level 1 <= userLevel 1, not passed, 0 passes → open
    expect(getNodeState(gate, levels)).toBe('open')
  })
})

describe('checkCategoryLevelUp', () => {
  it('advances level when gate is passed at current level', () => {
    const gate: GateProgress = { level: 2, category: 'push', status: 'passed', consecutivePasses: 3 }
    const user: User = { id: '1', levels: { push: 2, pull: 1, squat: 1 }, createdAt: '' }
    expect(checkCategoryLevelUp(gate, user)).toBe(true)
    expect(user.levels.push).toBe(3)
  })

  it('does not advance when gate is not passed', () => {
    const gate: GateProgress = { level: 2, category: 'push', status: 'in-progress', consecutivePasses: 1 }
    const user: User = { id: '1', levels: { push: 2, pull: 1, squat: 1 }, createdAt: '' }
    expect(checkCategoryLevelUp(gate, user)).toBe(false)
    expect(user.levels.push).toBe(2)
  })

  it('does not advance when gate level !== current level', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'passed', consecutivePasses: 3 }
    const user: User = { id: '1', levels: { push: 2, pull: 1, squat: 1 }, createdAt: '' }
    expect(checkCategoryLevelUp(gate, user)).toBe(false)
    expect(user.levels.push).toBe(2)
  })

  it('only advances the specific category', () => {
    const gate: GateProgress = { level: 1, category: 'pull', status: 'passed', consecutivePasses: 3 }
    const user: User = { id: '1', levels: { push: 3, pull: 1, squat: 2 }, createdAt: '' }
    checkCategoryLevelUp(gate, user)
    expect(user.levels).toEqual({ push: 3, pull: 2, squat: 2 })
  })
})
