import type { BaseExercise, BaseExerciseSet } from '@/api'

export interface Skill {
  id: string
  cat: string
  lv: number
  name: string
  sets: string
  exercise: BaseExercise
  done: boolean
  open: boolean
}

export interface CatInfo {
  label: string
  icon: string
  color: string
  bg: string
  border: string
  glow: string
}

export interface ExerciseHistoryEntry {
  date: string | Date
  sets: BaseExerciseSet[]
  completed?: boolean
}
