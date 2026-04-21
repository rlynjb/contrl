import type { Landmark } from '../landmarks'
import { POSE } from '../landmarks'
import { averageLandmarks } from '../angles'

const ANKLE_VISIBILITY_THRESHOLD = 0.6

// Degrees from vertical: 0° = standing, 90° = horizontal
export const ORIENTATION_RANGES: Record<string, [number, number]> = {
  vertical: [0, 35],
  incline: [25, 70],
  horizontal: [60, 90],
}

/**
 * Returns angle (degrees) between the shoulder→endpoint body line and vertical.
 * Falls back from ankle to hip when ankles are not visible.
 */
export function calculateBodyLineAngle(landmarks: Landmark[]): number {
  const shoulder = averageLandmarks(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER])
  const ankle = averageLandmarks(landmarks[POSE.LEFT_ANKLE], landmarks[POSE.RIGHT_ANKLE])
  const hip = averageLandmarks(landmarks[POSE.LEFT_HIP], landmarks[POSE.RIGHT_HIP])

  const endpoint = ankle.visibility >= ANKLE_VISIBILITY_THRESHOLD ? ankle : hip

  const dx = endpoint.x - shoulder.x
  const dy = endpoint.y - shoulder.y // positive = downward in MediaPipe screen coords

  const magnitude = Math.sqrt(dx * dx + dy * dy)
  if (magnitude < 0.01) return 0

  // Angle from downward vertical (0, 1): 0° = straight down, 90° = horizontal
  const cosAngle = Math.max(-1, Math.min(1, dy / magnitude))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

export function isOrientationInRange(angle: number, orientation: string): boolean {
  const range = ORIENTATION_RANGES[orientation]
  if (!range) return true
  return angle >= range[0] && angle <= range[1]
}
