import type { Category, WorkoutSession, GateProgress } from '@/types'
import { CATEGORIES, MAX_LEVEL } from '@/types'
import { createGateProgress } from './gate-check'

/**
 * Reconstruct user levels and gate progress from session history.
 * Used when sessions exist but local progress data is empty (e.g., after
 * a fresh install with an imported sessions table).
 *
 * A session is "clean" when every exercise entry has hitTarget === true.
 * Gate passes require 3 consecutive clean sessions at a given level.
 */
export function reconstructFromSessions(sessions: WorkoutSession[]): {
  userLevels: Record<Category, number>;
  gateProgress: Record<string, GateProgress>;
} {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const userLevels: Record<Category, number> = { push: 1, pull: 1, squat: 1 }
  const gates: Record<string, GateProgress> = {}

  const getGate = (cat: Category, level: number): GateProgress => {
    const key = `${cat}:${level}`
    if (!gates[key]) {
      gates[key] = createGateProgress(cat, level, userLevels[cat])
    }
    return gates[key]
  }

  for (const session of sorted) {
    const { category, level } = session
    const currentLevel = userLevels[category]

    // Skip sessions logged at a level above the current derived level
    if (level > currentLevel) continue

    const gate = getGate(category, level)
    if (gate.status === 'passed') continue

    const isClean = session.exercises.length > 0 &&
      session.exercises.every(e => e.hitTarget)

    if (isClean) {
      gate.consecutivePasses += 1
      gate.lastSessionDate = session.date
      if (gate.consecutivePasses >= 3) {
        gate.status = 'passed'
        // Level up if this is the current level and not at max
        if (level === currentLevel && currentLevel < MAX_LEVEL) {
          userLevels[category] = currentLevel + 1
          // Initialize next gate
          getGate(category, currentLevel + 1)
        }
      }
    } else {
      gate.consecutivePasses = 0
      gate.lastSessionDate = session.date
    }
  }

  // Ensure current level gates exist
  for (const cat of CATEGORIES) {
    const gate = getGate(cat, userLevels[cat])
    if (gate.status === 'locked') {
      gate.status = 'in-progress'
    }
  }

  return { userLevels, gateProgress: gates }
}
