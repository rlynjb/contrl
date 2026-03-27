import type { Landmark } from '../landmarks'
import { POSE } from '../landmarks'
import { calculateAngle, smoothAngle, averageLandmarks } from '../angles'
import { RepCounter, type RepPhase } from '../rep-counter'

const PUSHUP_CONFIG = { readyAngle: 160, bottomAngle: 90, hysteresis: 10 } as const
const SMOOTHING_FACTOR = 0.4

export interface PushupFrameResult {
  angle: number
  repCount: number
  phase: RepPhase
  repCompleted: boolean
}

export function createPushupProcessor() {
  const counter = new RepCounter(PUSHUP_CONFIG)
  let smoothedAngle = 0
  let initialized = false

  return {
    processFrame(landmarks: Landmark[]): PushupFrameResult {
      const shoulder = averageLandmarks(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER])
      const elbow = averageLandmarks(landmarks[POSE.LEFT_ELBOW], landmarks[POSE.RIGHT_ELBOW])
      const wrist = averageLandmarks(landmarks[POSE.LEFT_WRIST], landmarks[POSE.RIGHT_WRIST])

      const rawAngle = calculateAngle(shoulder, elbow, wrist)

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
