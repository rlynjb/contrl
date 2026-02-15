/**
 * MSW Request Handlers
 *
 * Intercepts API requests and returns mock data during development/testing.
 */

import { http, HttpResponse } from 'msw'
import { allExercises, workoutLevels, MOCK_CurrentUserLevel, MOCK_weeklyWorkouts } from './data'
import type { WorkoutLevels, BaseExercise, UserData } from '@/api'

// In-memory storage for user data (simulates database)
let userData: UserData | null = {
  currentLevels: { ...MOCK_CurrentUserLevel },
  weeklyProgress: [...MOCK_weeklyWorkouts],
  lastUpdated: new Date().toISOString()
}

export const handlers = [
  // ============================================
  // Exercise Endpoints
  // ============================================

  // GET /.netlify/functions/exercises/levels - Get all workout levels
  http.get('*/exercises/levels', () => {
    return HttpResponse.json<WorkoutLevels>(workoutLevels)
  }),

  // GET /.netlify/functions/exercises - Get exercises with optional filtering
  http.get('*/exercises', ({ request }) => {
    const url = new URL(request.url)
    const level = url.searchParams.get('level')
    const category = url.searchParams.get('category')

    let exercises = [...allExercises]

    if (level !== null) {
      exercises = exercises.filter(e => e.level === Number(level))
    }

    if (category) {
      exercises = exercises.filter(e => e.category === category)
    }

    // Map to BaseExercise (strip metadata)
    const baseExercises: BaseExercise[] = exercises.map(({ name, sets, tempo, rest, equipment, notes }) => ({
      name,
      sets,
      tempo,
      rest,
      ...(equipment && { equipment }),
      ...(notes && { notes })
    }))

    return HttpResponse.json(baseExercises)
  }),

  // GET /.netlify/functions/exercises/search - Search exercises
  http.get('*/exercises/search', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')?.toLowerCase() || ''

    const results = allExercises.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.tags?.some(tag => tag.toLowerCase().includes(query))
    )

    const baseExercises: BaseExercise[] = results.map(({ name, sets, tempo, rest, equipment, notes }) => ({
      name,
      sets,
      tempo,
      rest,
      ...(equipment && { equipment }),
      ...(notes && { notes })
    }))

    return HttpResponse.json(baseExercises)
  }),

  // GET /.netlify/functions/exercises/level - Get exercise level info by name
  http.get('*/exercises/level', ({ request }) => {
    const url = new URL(request.url)
    const name = url.searchParams.get('name')

    if (!name) {
      return HttpResponse.json(null, { status: 400 })
    }

    const exercise = allExercises.find(e =>
      e.name.toLowerCase() === name.toLowerCase()
    )

    if (!exercise) {
      return HttpResponse.json(null, { status: 404 })
    }

    // Find the level name from workoutLevels
    const levelName = Object.values(workoutLevels)[exercise.level]?.name || `Level ${exercise.level}`

    return HttpResponse.json({
      level: exercise.level,
      name: levelName,
      category: exercise.category,
      originalSets: exercise.sets
    })
  }),

  // POST /.netlify/functions/exercises - Add a new exercise
  http.post('*/exercises', async ({ request }) => {
    const body = await request.json() as BaseExercise

    if (!body.name) {
      return HttpResponse.json({ error: 'Exercise name required' }, { status: 400 })
    }

    // In real implementation, this would persist to database
    return HttpResponse.json({ success: true, exercise: body })
  }),

  // ============================================
  // User Data Endpoints
  // ============================================

  // GET /.netlify/functions/user/data - Get all user data
  // Optional: ?category=Push to filter weeklyProgress by category
  http.get('*/user/data', ({ request }) => {
    if (!userData) {
      return HttpResponse.json(null, { status: 404 })
    }

    // Clean up sessions beyond the current week (Sun-Sat)
    if (userData.weeklyProgress) {
      const now = new Date()
      const endOfWeek = new Date(now)
      endOfWeek.setDate(now.getDate() + (6 - now.getDay())) // Saturday
      endOfWeek.setHours(23, 59, 59, 999)
      userData.weeklyProgress = userData.weeklyProgress.filter(
        session => new Date(session.date) <= endOfWeek
      )
    }

    const url = new URL(request.url)
    const category = url.searchParams.get('category')

    if (category && userData.weeklyProgress) {
      const filtered = [...userData.weeklyProgress]
        .filter(session => session.categories?.includes(category as 'Push' | 'Pull' | 'Squat'))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return HttpResponse.json<UserData>({ ...userData, weeklyProgress: filtered })
    }

    return HttpResponse.json<UserData>(userData)
  }),

  // PUT /.netlify/functions/user/data - Update all user data
  http.put('*/user/data', async ({ request }) => {
    const body = await request.json() as UserData

    userData = {
      ...body,
      lastUpdated: new Date().toISOString()
    }

    return HttpResponse.json<UserData>(userData)
  }),

  // GET /.netlify/functions/user/levels - Get user's current levels only
  http.get('*/user/levels', () => {
    if (!userData) {
      return HttpResponse.json({ Push: 0, Pull: 0, Squat: 0 })
    }
    return HttpResponse.json(userData.currentLevels)
  }),

  // PUT /.netlify/functions/user/levels - Update a single level
  http.put('*/user/levels', async ({ request }) => {
    const body = await request.json() as { category: string; level: number }

    if (body.category && typeof body.level === 'number') {
      if (!userData) {
        userData = {
          currentLevels: { Push: 0, Pull: 0, Squat: 0 },
          lastUpdated: new Date().toISOString()
        }
      }

      userData.currentLevels = {
        ...userData.currentLevels,
        [body.category]: body.level
      }
      userData.lastUpdated = new Date().toISOString()

      return HttpResponse.json({ success: true })
    }

    return HttpResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }),

  // ============================================
  // Health Check
  // ============================================

  // GET /.netlify/functions/health - Health check endpoint
  http.get('*/health', () => {
    return HttpResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mock: true
    })
  }),
]

// Helper to reset mock data (useful for tests)
export const resetMockData = () => {
  userData = {
    currentLevels: { ...MOCK_CurrentUserLevel },
    weeklyProgress: [...MOCK_weeklyWorkouts],
    lastUpdated: new Date().toISOString()
  }
}
