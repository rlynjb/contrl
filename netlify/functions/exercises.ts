/**
 * Netlify Function: Exercises
 *
 * GET  /.netlify/functions/exercises - Get exercises with optional filtering
 * POST /.netlify/functions/exercises - Add a new exercise
 *
 * Query params for GET:
 *   - level: Filter by level number
 *   - category: Filter by category name
 */

import type { Context } from '@netlify/functions'
import {
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'
import { allExercises } from '../../src/mocks/data/exercises'
import type { BaseExercise } from '../../src/api/exercises'

export default async (req: Request, _context: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // GET - Get exercises with optional filtering
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const level = url.searchParams.get('level')
      const category = url.searchParams.get('category')

      let exercises = [...allExercises]

      if (level !== null) {
        exercises = exercises.filter(e => e.level === Number(level))
      }

      if (category) {
        exercises = exercises.filter(e => e.category === category)
      }

      // Map to BaseExercise (strip metadata like level, category, tags)
      const baseExercises: BaseExercise[] = exercises.map(({ name, sets, tempo, rest, equipment, notes }) => ({
        name,
        sets,
        tempo,
        rest,
        ...(equipment && { equipment }),
        ...(notes && { notes })
      }))

      return jsonResponse(baseExercises)
    }

    // POST - Add a new exercise
    if (req.method === 'POST') {
      const body = await req.json() as BaseExercise

      if (!body.name) {
        return errorResponse('Exercise name required', 400)
      }

      // In production, this would persist to database/blob storage
      // For now, just return success with the exercise
      return jsonResponse({ success: true, exercise: body })
    }

    // Method not allowed
    return errorResponse('Method not allowed', 405)

  } catch (error) {
    console.error('Exercises error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
}

export const config = {
  path: '/exercises'
}
