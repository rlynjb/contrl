import type {
  Category,
  GateProgress,
} from '@/types'

export type SessionResult = {
  isClean: boolean
  completionPct: number
  exerciseResults: {
    exerciseId: string
    met: boolean
    targetSets: number
    targetReps?: number
    actualCheckedSets: number
    actualReps: number[]
    actualHoldSeconds?: number[]
  }[]
}

/**
 * Create a fresh gate progress entry for a category + level.
 */
export function createGateProgress(
  category: Category,
  level: number,
  userLevel: number
): GateProgress {
  return {
    level,
    category,
    status: level > userLevel ? 'locked' : (level < userLevel ? 'passed' : 'in-progress'),
    consecutivePasses: level < userLevel ? 3 : 0,
    lastSessionDate: undefined,
  }
}
