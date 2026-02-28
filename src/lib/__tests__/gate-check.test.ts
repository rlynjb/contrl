import { describe, it, expect } from 'vitest'
import {
  getGateCriteria,
  evaluateSession,
  updateGateAfterSession,
  createGateProgress,
} from '../gate-check'
import type { WorkoutSession, GateProgress, GateCriteria } from '@/types'

describe('getGateCriteria', () => {
  it('finds criteria for push level 1', () => {
    const criteria = getGateCriteria('push', 1)
    expect(criteria).not.toBeNull()
    expect(criteria!.requiredConsecutivePasses).toBe(3)
    expect(criteria!.exercises.length).toBe(3)
  })

  it('finds criteria for all L1–3 across categories', () => {
    for (const cat of ['push', 'pull', 'squat'] as const) {
      for (let level = 1; level <= 3; level++) {
        expect(getGateCriteria(cat, level)).not.toBeNull()
      }
    }
  })

  it('returns null for non-existent level', () => {
    expect(getGateCriteria('push', 99)).toBeNull()
  })
})

describe('evaluateSession', () => {
  // Push L1 criteria: 3 exercises
  const criteria = getGateCriteria('push', 1)!

  function makeCleanPushL1Session(): WorkoutSession {
    return {
      id: 's1', date: '2025-01-15', category: 'push', level: 1,
      exercises: [
        {
          exerciseId: 'beginner-negative-push-ups', targetSets: 3, targetReps: 8,
          actualSets: 3, actualReps: [8, 8, 8], checkedSets: [true, true, true], hitTarget: true,
        },
        {
          exerciseId: 'beginner-scapula-push-ups', targetSets: 4, targetReps: 8,
          actualSets: 4, actualReps: [8, 8, 8, 8], checkedSets: [true, true, true, true], hitTarget: true,
        },
        {
          exerciseId: 'beginner-plank-hold', targetSets: 4, targetReps: 0,
          actualSets: 4, actualReps: [], actualHoldSeconds: [60, 60, 60, 60],
          checkedSets: [true, true, true, true], hitTarget: true,
        },
      ],
    }
  }

  it('clean session → isClean=true, 100%', () => {
    const result = evaluateSession(makeCleanPushL1Session(), criteria)
    expect(result.isClean).toBe(true)
    expect(result.completionPct).toBe(100)
  })

  it('one rep below target → isClean=false', () => {
    const session = makeCleanPushL1Session()
    session.exercises[0].actualReps = [8, 8, 7] // one set below
    session.exercises[0].hitTarget = false
    const result = evaluateSession(session, criteria)
    expect(result.isClean).toBe(false)
    expect(result.completionPct).toBe(67) // 2 of 3 met
  })

  it('unchecked set → not counted, fails if needed for target', () => {
    const session = makeCleanPushL1Session()
    session.exercises[0].checkedSets = [true, true, false] // only 2 checked, need 3
    const result = evaluateSession(session, criteria)
    expect(result.isClean).toBe(false)
    expect(result.exerciseResults[0].actualCheckedSets).toBe(2)
  })

  it('missing exercise → not met', () => {
    const session = makeCleanPushL1Session()
    session.exercises = session.exercises.slice(0, 1) // only first exercise
    const result = evaluateSession(session, criteria)
    expect(result.isClean).toBe(false)
    expect(result.completionPct).toBe(33)
  })

  it('empty session → 0%', () => {
    const session: WorkoutSession = {
      id: 's2', date: '2025-01-15', category: 'push', level: 1, exercises: [],
    }
    const result = evaluateSession(session, criteria)
    expect(result.isClean).toBe(false)
    expect(result.completionPct).toBe(0)
  })

  it('hold exercise below target seconds → fails', () => {
    const session = makeCleanPushL1Session()
    session.exercises[2].actualHoldSeconds = [60, 60, 59, 60] // one set 1s short
    const result = evaluateSession(session, criteria)
    expect(result.isClean).toBe(false)
  })
})

describe('updateGateAfterSession', () => {
  const criteria: GateCriteria = { requiredConsecutivePasses: 3, exercises: [] }

  it('increments on clean session', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'in-progress', consecutivePasses: 1 }
    const result = { isClean: true, completionPct: 100, exerciseResults: [] }
    const updated = updateGateAfterSession(gate, result, criteria, '2025-01-15')
    expect(updated.consecutivePasses).toBe(2)
    expect(updated.status).toBe('in-progress')
  })

  it('passes gate at 3 consecutive', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'in-progress', consecutivePasses: 2 }
    const result = { isClean: true, completionPct: 100, exerciseResults: [] }
    const updated = updateGateAfterSession(gate, result, criteria, '2025-01-17')
    expect(updated.consecutivePasses).toBe(3)
    expect(updated.status).toBe('passed')
  })

  it('resets to 0 on non-clean session', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'in-progress', consecutivePasses: 2 }
    const result = { isClean: false, completionPct: 87, exerciseResults: [] }
    const updated = updateGateAfterSession(gate, result, criteria, '2025-01-17')
    expect(updated.consecutivePasses).toBe(0)
  })

  it('consecutive failures stay at 0', () => {
    const gate: GateProgress = { level: 1, category: 'push', status: 'in-progress', consecutivePasses: 0 }
    const result = { isClean: false, completionPct: 50, exerciseResults: [] }
    const updated = updateGateAfterSession(gate, result, criteria, '2025-01-18')
    expect(updated.consecutivePasses).toBe(0)
  })
})

describe('createGateProgress', () => {
  it('creates locked gate when level > userLevel', () => {
    const gate = createGateProgress('push', 3, 1)
    expect(gate.status).toBe('locked')
    expect(gate.consecutivePasses).toBe(0)
  })

  it('creates passed gate when level < userLevel', () => {
    const gate = createGateProgress('push', 1, 3)
    expect(gate.status).toBe('passed')
    expect(gate.consecutivePasses).toBe(3)
  })

  it('creates in-progress gate at current level', () => {
    const gate = createGateProgress('pull', 2, 2)
    expect(gate.status).toBe('in-progress')
    expect(gate.consecutivePasses).toBe(0)
  })
})
