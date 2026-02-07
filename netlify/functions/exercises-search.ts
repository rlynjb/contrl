/**
 * Netlify Function: Exercise Search
 *
 * GET /.netlify/functions/exercises/search?q=query - Search exercises
 *
 * Searches exercises by name or tags.
 */

import type { Context } from '@netlify/functions'
import {
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'
import { allExercises } from '../../src/mocks/data/exercises'

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
    const query = url.searchParams.get('q')?.toLowerCase() || ''

    if (!query) {
      return jsonResponse([])
    }

    // Search by name or tags
    const results = allExercises.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.tags?.some(tag => tag.toLowerCase().includes(query))
    )

    // Map to BaseExercise format (strip metadata)
    const baseExercises = results.map(({ name, sets, tempo, rest, equipment, notes }) => ({
      name,
      sets,
      tempo,
      rest,
      ...(equipment && { equipment }),
      ...(notes && { notes })
    }))

    return jsonResponse(baseExercises)

  } catch (error) {
    console.error('Exercise search error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
}

export const config = {
  path: '/exercises/search'
}
