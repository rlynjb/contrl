/**
 * Core domain types for the contrl game progression system.
 * Extended with sync fields (notion_page_id, updated_at) for Notion integration.
 */

// ── Category ─────────────────────────────────────────────────

export type Category = 'push' | 'pull' | 'squat'

export const CATEGORIES: Category[] = ['push', 'pull', 'squat']

// ── Exercise library ────────────────────────────────────────

export type Exercise = {
  id: string
  name: string
  category: Category
  level: number
  targetSets: number
  targetReps: number
  isHold: boolean
  targetHoldSeconds?: number
  sortOrder?: number
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
  createdAt?: string
  notionPageId?: string | null
  updatedAt?: string
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
  targetHoldSeconds?: number
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
