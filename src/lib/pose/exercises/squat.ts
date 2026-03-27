import type { Landmark } from '../landmarks'
import { POSE } from '../landmarks'
import { calculateAngle, smoothAngle, averageLandmarks } from '../angles'
import { RepCounter, type RepPhase } from '../rep-counter'

const SQUAT_CONFIG = { readyAngle: 160, bottomAngle: 90, hysteresis: 10 } as const
const SMOOTHING_FACTOR = 0.4

export interface SquatFrameResult {
  angle: number
  repCount: number
  phase: RepPhase
  repCompleted: boolean
}

export function createSquatProcessor() {
  const counter = new RepCounter(SQUAT_CONFIG)
  let smoothedAngle = 0
  let initialized = false

  return {
    processFrame(landmarks: Landmark[]): SquatFrameResult {
      const hip = averageLandmarks(landmarks[POSE.LEFT_HIP], landmarks[POSE.RIGHT_HIP])
      const knee = averageLandmarks(landmarks[POSE.LEFT_KNEE], landmarks[POSE.RIGHT_KNEE])
      const ankle = averageLandmarks(landmarks[POSE.LEFT_ANKLE], landmarks[POSE.RIGHT_ANKLE])

      const rawAngle = calculateAngle(hip, knee, ankle)

      if (!initialized) {
        smoothedAngle = rawAngle
        initialized = true
      } else {
        smoothedAngle = smoothAngle(rawAngle, smoothedAngle, SMOOTHING_FACTOR)
      }

      const result = counter.update(smoothedAngle)
      return { angle: smoothedAngle, repCount: result.count, phase: result.phase, repCompleted: result.repCompleted }
    },

    reset() {
      counter.reset()
      smoothedAngle = 0
      initialized = false
    },

    get count() { return counter.count },
  }
}
