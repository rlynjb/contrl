import type { Landmark } from '../landmarks'
import { POSE } from '../landmarks'
import { calculateAngle, smoothAngle, averageLandmarks } from '../angles'
import { RepCounter, type RepPhase } from '../rep-counter'
import { calculateBodyLineAngle, isOrientationInRange } from '../angles/body-line'
import type { PullExerciseConfig } from './pull.types'

const TRX_REP_CONFIG = { readyAngle: 160, bottomAngle: 80, hysteresis: 10 } as const
const ELBOW_SMOOTHING = 0.4
const BODY_LINE_SMOOTHING = 0.3

export interface TrxRepFrameResult {
  angle: number
  repCount: number
  phase: RepPhase
  repCompleted: boolean
}

export interface TrxHoldFrameResult {
  isHolding: boolean
  holdTimeMs: number
  alignmentAngle: number
}

export function createTrxRepProcessor(config: PullExerciseConfig) {
  const counter = new RepCounter(TRX_REP_CONFIG)
  let smoothedElbow = 0
  let smoothedBodyLine = 0
  let initialized = false

  return {
    processFrame(landmarks: Landmark[]): TrxRepFrameResult {
      const shoulder = averageLandmarks(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER])
      const elbow = averageLandmarks(landmarks[POSE.LEFT_ELBOW], landmarks[POSE.RIGHT_ELBOW])
      const wrist = averageLandmarks(landmarks[POSE.LEFT_WRIST], landmarks[POSE.RIGHT_WRIST])

      const rawElbow = calculateAngle(shoulder, elbow, wrist)
      const rawBodyLine = calculateBodyLineAngle(landmarks)

      if (!initialized) {
        smoothedElbow = rawElbow
        smoothedBodyLine = rawBodyLine
        initialized = true
      } else {
        smoothedElbow = smoothAngle(rawElbow, smoothedElbow, ELBOW_SMOOTHING)
        smoothedBodyLine = smoothAngle(rawBodyLine, smoothedBodyLine, BODY_LINE_SMOOTHING)
      }

      const orientationOk = isOrientationInRange(smoothedBodyLine, config.orientation)
      const result = orientationOk
        ? counter.update(smoothedElbow)
        : { phaseChanged: false, repCompleted: false, phase: counter.phase, count: counter.count }

      return { angle: smoothedElbow, repCount: result.count, phase: result.phase, repCompleted: result.repCompleted }
    },

    reset() {
      counter.reset()
      smoothedElbow = 0
      smoothedBodyLine = 0
      initialized = false
    },

    get count() { return counter.count },
  }
}

export function createTrxHoldProcessor(config: PullExerciseConfig) {
  let holdTimeMs = 0
  let smoothedBodyLine = 0
  let initialized = false

  return {
    processFrame(landmarks: Landmark[], deltaMs: number): TrxHoldFrameResult {
      const rawBodyLine = calculateBodyLineAngle(landmarks)

      if (!initialized) {
        smoothedBodyLine = rawBodyLine
        initialized = true
      } else {
        smoothedBodyLine = smoothAngle(rawBodyLine, smoothedBodyLine, BODY_LINE_SMOOTHING)
      }

      const isHolding = isOrientationInRange(smoothedBodyLine, config.orientation)

      if (isHolding && deltaMs > 0) {
        holdTimeMs += deltaMs
      }

      return { isHolding, holdTimeMs, alignmentAngle: smoothedBodyLine }
    },

    reset() {
      holdTimeMs = 0
      smoothedBodyLine = 0
      initialized = false
    },
  }
}
