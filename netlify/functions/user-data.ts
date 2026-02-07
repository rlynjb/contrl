/**
 * Netlify Function: User Data
 *
 * GET  /.netlify/functions/user/data - Get all user data
 * PUT  /.netlify/functions/user/data - Update all user data
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

// Type definitions matching src/api/user.ts
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

const DEFAULT_USER_DATA: UserData = {
  currentLevels: { Push: 0, Pull: 0, Squat: 0 },
  lastUpdated: new Date().toISOString(),
  weeklyProgress: []
}

export default async (req: Request, _context: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // GET - Read user data
    if (req.method === 'GET') {
      const data = await userDataStore.get<UserData>()

      if (!data) {
        return jsonResponse(DEFAULT_USER_DATA)
      }

      return jsonResponse(data)
    }

    // PUT - Update user data
    if (req.method === 'PUT') {
      const body = await req.json() as UserData

      const updatedData: UserData = {
        ...body,
        lastUpdated: new Date().toISOString()
      }

      await userDataStore.set(updatedData)

      return jsonResponse(updatedData)
    }

    // Method not allowed
    return errorResponse('Method not allowed', 405)

  } catch (error) {
    console.error('User data error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    )
  }
}

export const config = {
  path: '/user/data'
}
