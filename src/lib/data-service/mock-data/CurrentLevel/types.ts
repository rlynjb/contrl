/**
 * Types specific to CurrentLevel mock data
 */

// User's current levels across movement categories
export interface CurrentUserLevels {
  Push: number
  Pull: number
  Squat: number
}

// Type for movement categories
export type MovementCategory = keyof CurrentUserLevels

// Data structure for current level information
export interface CurrentLevelData {
  currentLevels: CurrentUserLevels
}
