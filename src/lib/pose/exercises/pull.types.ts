export type PullEquipment = 'bar' | 'trx'
export type BodyOrientation = 'vertical' | 'incline' | 'horizontal'

export interface PullExerciseConfig {
  equipment: PullEquipment
  orientation: BodyOrientation
  isHold: boolean
}
