/**
 * Phase 0 — Game Logic Types
 *
 * Lowercase categories for game logic; the API layer uses PascalCase ("Push").
 */

export type Category = 'push' | 'pull' | 'squat'

export const CATEGORIES: Category[] = ['push', 'pull', 'squat']

// ── Exercise library ────────────────────────────────────────

export type Exercise = {
  id: string
  name: string
  category: Category
  level: number                  // 1–5
  targetSets: number
  targetReps: number
  isHold: boolean                // true = use holdSeconds instead of reps
  targetHoldSeconds?: number     // only if isHold: true
}

// ── User ────────────────────────────────────────────────────

export type User = {
  id: string
  levels: Record<Category, number>
  createdAt: string
}

// ── Workout session (logged by user) ────────────────────────

export type ExerciseEntry = {
  exerciseId: string
  targetSets: number
  targetReps: number
  actualSets: number
  actualReps: number[]           // per-set: [10, 10, 8]
  actualHoldSeconds?: number[]   // per-set for isometrics
  checkedSets: boolean[]         // per-set: [true, true, true]
  hitTarget: boolean             // did ALL checked sets meet or exceed target?
}

export type WorkoutSession = {
  id: string
  date: string
  level: number
  category: Category
  exercises: ExerciseEntry[]
  notes?: string
}

// ── Gate system ─────────────────────────────────────────────

export type GateStatus = 'locked' | 'in-progress' | 'passed'

export type GateProgress = {
  level: number
  category: Category
  status: GateStatus
  consecutivePasses: number      // 0–3, gate passes at 3
  lastSessionDate?: string
}

export type GateCriteriaExercise = {
  exerciseId: string
  targetSets: number
  targetReps?: number
  targetHoldSeconds?: number
}

export type GateCriteria = {
  requiredConsecutivePasses: number
  exercises: GateCriteriaExercise[]
}

// ── Week tracking ───────────────────────────────────────────

export type WeekProgress = {
  weekStart: string              // "2025-03-03" (Monday)
  sessionsCompleted: Record<Category, boolean>
}
