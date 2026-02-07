/**
 * Netlify Function: Exercise Level Info
 *
 * GET /.netlify/functions/exercises/level?name=exerciseName - Get level info for exercise
 *
 * Returns level number, level name, and category for a specific exercise.
 */

import type { Context } from '@netlify/functions'
import {
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'
import { allExercises, workoutLevels } from '../../src/mocks/data/exercises'

export default async (req: Request, _context: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  // Only GET allowed
  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const url = new URL(req.url)
    const name = url.searchParams.get('name')

    if (!name) {
      return jsonResponse(null, 400)
    }

    // Find exercise by name (case-insensitive)
    const exercise = allExercises.find(e =>
      e.name.toLowerCase() === name.toLowerCase()
    )

    if (!exercise) {
      return jsonResponse(null, 404)
    }

    // Get level name from workout levels
    const levelName = Object.values(workoutLevels)[exercise.level]?.name || `Level ${exercise.level}`

    return jsonResponse({
      level: exercise.level,
      name: levelName,
      category: exercise.category
    })

  } catch (error) {
    console.error('Exercise level info error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
}

export const config = {
  path: '/exercises/level'
}
