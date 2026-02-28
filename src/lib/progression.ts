import type { Category, GateProgress, User } from '@/types'

/**
 * Derive the visual state of a skill-tree node.
 * No FSM — state is derived from data.
 */
export function getNodeState(
  gate: GateProgress,
  userLevels: Record<Category, number>
): 'locked' | 'open' | 'in-progress' | 'passed' {
  if (gate.status === 'passed') return 'passed'
  if (gate.level > userLevels[gate.category]) return 'locked'
  if (gate.consecutivePasses > 0) return 'in-progress'
  return 'open'
}

/**
 * Check whether a category should level up after the gate is fully passed.
 * Returns true if the level was advanced, false otherwise.
 * Mutates user.levels directly if a level-up occurs.
 */
export function checkCategoryLevelUp(
  gate: GateProgress,
  user: User
): boolean {
  if (gate.status === 'passed' && gate.level === user.levels[gate.category]) {
    user.levels[gate.category] += 1
    return true
  }
  return false
}
