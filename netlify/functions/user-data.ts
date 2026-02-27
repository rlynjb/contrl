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
  exerciseDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'
import { workoutLevels as fallbackLevels } from '../../src/mocks/data/exercises'

// Type definitions matching src/api types
interface CurrentUserLevels {
  Push: number
  Pull: number
  Squat: number
}

interface BaseExerciseSet {
  reps?: number
  duration?: number
}

interface BaseExercise {
  name: string
  sets: BaseExerciseSet[]
  completed?: boolean
  completedSets?: boolean[]
  category: 'Push' | 'Pull' | 'Squat'
  [key: string]: unknown
}

interface WorkoutSession {
  exercises: BaseExercise[]
  categories: ('Push' | 'Pull' | 'Squat')[]
  date: string
  [key: string]: unknown
}

interface WorkoutLevel {
  exercises: Record<string, BaseExercise[]>
  [key: string]: unknown
}

interface UserData {
  currentLevels: CurrentUserLevels
  lastUpdated: string
  weeklyProgress?: WorkoutSession[]
}

const LEVEL_ORDER = ['beginner', 'novice', 'intermediate', 'advanced', 'expert']
const CATEGORIES: (keyof CurrentUserLevels)[] = ['Push', 'Pull', 'Squat']

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

      // Clean up sessions dated in the future (beyond Saturday)
      if (data.weeklyProgress) {
        const now = new Date()
        const endOfWeek = new Date(now)
        endOfWeek.setDate(now.getDate() + (6 - now.getDay())) // Saturday
        endOfWeek.setHours(23, 59, 59, 999)
        const cleaned = data.weeklyProgress
          .filter(session => new Date(session.date) <= endOfWeek)
        if (cleaned.length !== data.weeklyProgress.length) {
          data.weeklyProgress = cleaned
          await userDataStore.set(data)
        }
      }

      // Auto-level-up: check if today's exercises meet all targets at current level
      if (data.weeklyProgress?.length && data.currentLevels) {
        const todayStr = new Date().toDateString()
        const todaySession = data.weeklyProgress
          .find(s => new Date(s.date).toDateString() === todayStr)

        if (todaySession) {
          const exerciseLevels = await exerciseDataStore.getWorkoutLevels<Record<string, WorkoutLevel>>() || fallbackLevels
          let levelsChanged = false

          for (const cat of CATEGORIES) {
            const userLevel: number = data.currentLevels[cat]
            const levelKey = LEVEL_ORDER[userLevel - 1]
            if (!levelKey || userLevel >= 5) continue

            const targets = exerciseLevels[levelKey]?.exercises?.[cat] as BaseExercise[] | undefined
            if (!targets?.length) continue

            const allMet = targets.every(target => {
              const tracked = todaySession.exercises.find(e => e.name === target.name)
              if (!tracked) return false
              return target.sets.every((ts: BaseExerciseSet, i: number) => {
                const actual = tracked.sets[i]
                if (!actual) return false
                if (ts.reps) return (actual.reps || 0) >= ts.reps
                if (ts.duration) return (actual.duration || 0) >= ts.duration
                return false
              })
            })

            if (allMet) {
              data.currentLevels[cat] = userLevel + 1
              levelsChanged = true
            }
          }

          if (levelsChanged) {
            data.lastUpdated = new Date().toISOString()
            await userDataStore.set(data)
          }
        }
      }

      // Optional category filter: GET /user/data?category=Push
      const url = new URL(req.url)
      const category = url.searchParams.get('category')

      if (category && data.weeklyProgress) {
        const filtered = data.weeklyProgress
          .filter(session => session.categories?.includes(category as 'Push' | 'Pull' | 'Squat'))
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
