import type {
  Category,
  GateCriteria,
  GateCriteriaExercise,
  GateProgress,
  WorkoutSession,
  ExerciseEntry,
} from '@/types'
import gatesData from '@/data/gates.json'

type GatesJson = Record<string, Record<string, GateCriteria>>

/**
 * Look up gate criteria for a category + level.
 */
export function getGateCriteria(
  category: Category,
  level: number
): GateCriteria | null {
  const byLevel = (gatesData as GatesJson)[category]
  if (!byLevel) return null
  return byLevel[String(level)] ?? null
}

/**
 * Check if a single exercise entry meets a single gate criterion.
 * For hold exercises, actualHoldSeconds stores the logged seconds.
 * For rep exercises, actualReps stores the logged reps.
 * Both compare against targetReps.
 */
function exerciseMeetsCriteria(
  entry: ExerciseEntry,
  criterion: GateCriteriaExercise
): boolean {
  const checkedCount = entry.checkedSets.filter(Boolean).length
  if (checkedCount < criterion.targetSets) return false

  const target = criterion.targetReps ?? 0

  // Use actualHoldSeconds if available (hold exercise), otherwise actualReps
  const actuals = entry.actualHoldSeconds ?? entry.actualReps

  for (let i = 0; i < entry.checkedSets.length; i++) {
    if (entry.checkedSets[i] && (actuals[i] ?? 0) < target) {
      return false
    }
  }
  return true
}

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
 * Evaluate a workout session against gate criteria.
 */
export function evaluateSession(
  session: WorkoutSession,
  criteria: GateCriteria
): SessionResult {
  const exerciseResults = criteria.exercises.map(criterion => {
    const entry = session.exercises.find(e => e.exerciseId === criterion.exerciseId)

    if (!entry) {
      return {
        exerciseId: criterion.exerciseId,
        met: false,
        targetSets: criterion.targetSets,
        targetReps: criterion.targetReps,
        actualCheckedSets: 0,
        actualReps: [],
        actualHoldSeconds: undefined,
      }
    }

    return {
      exerciseId: criterion.exerciseId,
      met: exerciseMeetsCriteria(entry, criterion),
      targetSets: criterion.targetSets,
      targetReps: criterion.targetReps,
      actualCheckedSets: entry.checkedSets.filter(Boolean).length,
      actualReps: entry.actualReps,
      actualHoldSeconds: entry.actualHoldSeconds,
    }
  })

  const metCount = exerciseResults.filter(r => r.met).length
  const completionPct = criteria.exercises.length > 0
    ? Math.round((metCount / criteria.exercises.length) * 100)
    : 0

  return {
    isClean: exerciseResults.every(r => r.met),
    completionPct,
    exerciseResults,
  }
}

/**
 * Update gate progress after evaluating a session.
 */
export function updateGateAfterSession(
  gate: GateProgress,
  result: SessionResult,
  criteria: GateCriteria,
  sessionDate: string
): GateProgress {
  if (result.isClean) {
    const newCount = gate.consecutivePasses + 1
    const passed = newCount >= criteria.requiredConsecutivePasses
    return {
      ...gate,
      consecutivePasses: newCount,
      status: passed ? 'passed' : 'in-progress',
      lastSessionDate: sessionDate,
    }
  }

  return {
    ...gate,
    consecutivePasses: 0,
    status: gate.level <= 0 ? 'locked' : 'in-progress',
    lastSessionDate: sessionDate,
  }
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
