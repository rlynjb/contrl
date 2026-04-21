import type { Exercise } from '../../../types'
import type { PullExerciseConfig } from './pull.types'
import { createBarPullProcessor } from './pull-bar'
import { createTrxRepProcessor, createTrxHoldProcessor } from './pull-trx'

const EXERCISE_CONFIGS: Record<string, PullExerciseConfig> = {
  'beginner-trx-lat-pull-down':          { equipment: 'trx', orientation: 'vertical',   isHold: false },
  'beginner-trx-inverted-row':            { equipment: 'trx', orientation: 'incline',    isHold: false },
  'beginner-trx-passive-hang':            { equipment: 'trx', orientation: 'vertical',   isHold: true  },
  'novice-trx-inverted-row':              { equipment: 'trx', orientation: 'incline',    isHold: false },
  'novice-trx-scapula-pullups':           { equipment: 'trx', orientation: 'vertical',   isHold: false },
  'intermediate-trx-pullups-band-assisted': { equipment: 'trx', orientation: 'vertical', isHold: false },
  'intermediate-trx-inverted-row':        { equipment: 'trx', orientation: 'incline',    isHold: false },
  'intermediate-trx-scapula-pullups':     { equipment: 'trx', orientation: 'vertical',   isHold: false },
  'trx-row':                              { equipment: 'trx', orientation: 'horizontal', isHold: false },
  'trx-dead-hang':                        { equipment: 'trx', orientation: 'horizontal', isHold: true  },
}

const DEFAULT_CONFIG: PullExerciseConfig = { equipment: 'bar', orientation: 'vertical', isHold: false }

export function createPullProcessor(exercise: Exercise) {
  const config = EXERCISE_CONFIGS[exercise.id] ?? DEFAULT_CONFIG

  if (config.equipment === 'trx' && config.isHold) {
    return { type: 'plank' as const, processor: createTrxHoldProcessor(config) }
  }
  if (config.equipment === 'trx') {
    return { type: 'rep' as const, processor: createTrxRepProcessor(config) }
  }
  return { type: 'rep' as const, processor: createBarPullProcessor() }
}
