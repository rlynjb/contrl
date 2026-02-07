/**
 * Netlify Function: Exercise Levels
 *
 * GET /.netlify/functions/exercises/levels - Get all workout levels
 *
 * Returns exercises organized by difficulty level.
 * Uses Netlify Blobs for caching, falls back to database.
 */

import type { Context } from '@netlify/functions'
import {
  exerciseDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'
import { workoutLevels } from '../../src/mocks/data/exercises'

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
    // Try to get from blob storage first
    const cachedLevels = await exerciseDataStore.getWorkoutLevels()

    if (cachedLevels) {
      return jsonResponse(cachedLevels)
    }

    // Fall back to mock data (or could query database here)
    // In production, you might want to cache this
    await exerciseDataStore.setWorkoutLevels(workoutLevels)

    return jsonResponse(workoutLevels)

  } catch (error) {
    console.error('Exercise levels error:', error)
    // Fall back to mock data on error
    return jsonResponse(workoutLevels)
  }
}

export const config = {
  path: '/exercises/levels'
}
