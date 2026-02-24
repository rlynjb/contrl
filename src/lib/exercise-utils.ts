import type { BaseExerciseSet } from '@/api'

export const formatSets = (sets: BaseExerciseSet[]): string[] =>
  sets.map(set => 'reps' in set && set.reps ? String(set.reps) : `${set.duration}s`)

export const parseSets = (values: string[]): BaseExerciseSet[] =>
  values.map(val => {
    if (val.endsWith('s')) {
      return { duration: parseInt(val) || 0 }
    }
    return { reps: parseInt(val) || 0 }
  })
