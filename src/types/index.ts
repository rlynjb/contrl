/**
 * Core domain types for the contrl game progression system.
 */

// ── Category ─────────────────────────────────────────────────

export type Category = 'push' | 'pull' | 'squat'

export const CATEGORIES: Category[] = ['push', 'pull', 'squat']

export const MAX_LEVEL = 5

// ── Exercise library ────────────────────────────────────────

export type Exercise = {
  id: string
  name: string
  category: Category
  level: number
  targetSets: number
  targetReps: number
  /** Derived: true when tempo === 'Steady' */
  isHold: boolean
  sortOrder?: number
  /** Tempo pattern (e.g. "2-1-2-0" for reps, "Steady" for holds) */
  tempo?: string
  /** Notes: tip, next progression, regression (line-separated) */
  notes?: string
  /** Notion page ID for sync */
  notionPageId?: string | null
  updatedAt?: string
}

// ── User ────────────────────────────────────────────────────

export type User = {
  id: string
  levels: Record<Category, number>
  createdAt: string
  notionPageId?: string | null
  updatedAt?: string
}

// ── Workout session ─────────────────────────────────────────

export type ExerciseEntry = {
  exerciseId: string
  targetSets: number
  targetReps: number
  actualSets: number
  actualReps: number[]
  actualHoldSeconds?: number[]
  checkedSets: boolean[]
  hitTarget: boolean
}

export type WorkoutSession = {
  id: string
  date: string
  level: number
  category: Category
  exercises: ExerciseEntry[]
  notes?: string
  /** Whether all exercises hit target (clean session) */
  passed?: boolean
  notionPageId?: string | null
  updatedAt?: string
}

export type ExerciseBreakdown = {
  exerciseId: string
  name: string
  hit: boolean
  percentage: number
  isHold: boolean
  shortSets: { set: number; type: 'unchecked' | 'short'; got?: number; needed?: number }[]
}

// ── Gate system ─────────────────────────────────────────────

export type GateStatus = 'locked' | 'in-progress' | 'passed'

export type GateProgress = {
  level: number
  category: Category
  status: GateStatus
  consecutivePasses: number
  lastSessionDate?: string
  notionPageId?: string | null
  updatedAt?: string
}

export type GateCriteriaExercise = {
  exerciseId: string
  targetSets: number
  targetReps?: number
}

export type GateCriteria = {
  requiredConsecutivePasses: number
  exercises: GateCriteriaExercise[]
}

// ── Week tracking ───────────────────────────────────────────

export type WeekProgress = {
  weekStart: string
  sessionsCompleted: Record<Category, boolean>
  notionPageId?: string | null
  updatedAt?: string
}

// ── Draft session ───────────────────────────────────────────

export type ExerciseFormState = {
  exerciseId: string
  checkedSets: boolean[]
  actualReps: number[]
  actualHoldSeconds?: number[]
}

export type DraftSession = {
  category: Category
  level: number
  exercises: ExerciseFormState[]
  notes: string
  savedAt: string
}
