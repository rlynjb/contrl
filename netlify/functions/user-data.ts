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

      // Clean up sessions beyond the current week (Sun-Sat)
      if (data.weeklyProgress) {
        const now = new Date()
        const endOfWeek = new Date(now)
        endOfWeek.setDate(now.getDate() + (6 - now.getDay())) // Saturday
        endOfWeek.setHours(23, 59, 59, 999)
        const cleaned = (data.weeklyProgress as Array<{ date: string; [key: string]: unknown }>)
          .filter(session => new Date(session.date) <= endOfWeek)
        if (cleaned.length !== data.weeklyProgress.length) {
          data.weeklyProgress = cleaned
          await userDataStore.set(data)
        }
      }

      // Optional category filter: GET /user/data?category=Push
      const url = new URL(req.url)
      const category = url.searchParams.get('category')

      if (category && data.weeklyProgress) {
        const filtered = (data.weeklyProgress as Array<{ categories?: string[]; date: string; [key: string]: unknown }>)
          .filter(session => session.categories?.includes(category))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        return jsonResponse({ ...data, weeklyProgress: filtered })
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
