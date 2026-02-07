/**
 * Netlify Function: User Levels
 *
 * GET  /.netlify/functions/user/levels - Get current levels only
 * PUT  /.netlify/functions/user/levels - Update a single level
 *
 * Uses Netlify Blobs for persistent storage.
 */

import type { Context } from '@netlify/functions'
import {
  userDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'

interface CurrentUserLevels {
  Push: number
  Pull: number
  Squat: number
}

interface UserData {
  currentLevels: CurrentUserLevels
  lastUpdated: string
  weeklyProgress?: unknown[]
}

const DEFAULT_LEVELS: CurrentUserLevels = { Push: 0, Pull: 0, Squat: 0 }

export default async (req: Request, _context: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // GET - Read current levels only
    if (req.method === 'GET') {
      const data = await userDataStore.get<UserData>()

      if (!data) {
        return jsonResponse(DEFAULT_LEVELS)
      }

      return jsonResponse(data.currentLevels || DEFAULT_LEVELS)
    }

    // PUT - Update a single level
    if (req.method === 'PUT') {
      const body = await req.json() as { category: string; level: number }

      if (!body.category || typeof body.level !== 'number') {
        return errorResponse('Invalid request: category and level required', 400)
      }

      // Get existing data
      let data = await userDataStore.get<UserData>()

      if (!data) {
        data = {
          currentLevels: { ...DEFAULT_LEVELS },
          lastUpdated: new Date().toISOString()
        }
      }

      // Update the specific level
      data.currentLevels = {
        ...data.currentLevels,
        [body.category]: body.level
      }
      data.lastUpdated = new Date().toISOString()

      await userDataStore.set(data)

      return jsonResponse({ success: true })
    }

    // Method not allowed
    return errorResponse('Method not allowed', 405)

  } catch (error) {
    console.error('User levels error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
}

export const config = {
  path: '/user/levels'
}
