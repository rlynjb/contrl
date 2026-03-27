import type { Landmark } from '../landmarks'
import { POSE } from '../landmarks'
import { calculateAngle, averageLandmarks } from '../angles'

const ALIGNMENT_THRESHOLD = 15

export interface PlankFrameResult {
  isHolding: boolean
  holdTimeMs: number
  alignmentAngle: number
}

export function createPlankProcessor() {
  let holdTimeMs = 0
  let isHolding = false

  return {
    processFrame(landmarks: Landmark[], deltaMs: number): PlankFrameResult {
      const shoulder = averageLandmarks(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER])
      const hip = averageLandmarks(landmarks[POSE.LEFT_HIP], landmarks[POSE.RIGHT_HIP])
      const ankle = averageLandmarks(landmarks[POSE.LEFT_ANKLE], landmarks[POSE.RIGHT_ANKLE])

      const alignmentAngle = calculateAngle(shoulder, hip, ankle)
      const deviation = Math.abs(180 - alignmentAngle)

      isHolding = deviation <= ALIGNMENT_THRESHOLD

      if (isHolding && deltaMs > 0) {
        holdTimeMs += deltaMs
      }

      return { isHolding, holdTimeMs, alignmentAngle }
    },

    reset() {
      holdTimeMs = 0
      isHolding = false
    },

    get totalHoldMs() { return holdTimeMs },
    get holding() { return isHolding },
  }
}
