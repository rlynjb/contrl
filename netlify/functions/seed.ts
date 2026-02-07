/**
 * Netlify Function: Seed Data
 *
 * POST /seed - Initialize blob store with mock data
 *
 * This function populates the Netlify Blob store with initial data.
 * Uses the same mock data as MSW handlers for consistency.
 *
 * PREREQUISITES
 * -------------
 * 1. MSW must be disabled in .env.local:
 *    NEXT_PUBLIC_MSW_ENABLED=false
 *
 * 2. Netlify CLI must be installed:
 *    npm install -g netlify-cli
 *
 * LOCAL DEVELOPMENT
 * -----------------
 * 1. Start the Netlify dev server:
 *    netlify dev
 *
 * 2. Call the seed endpoint:
 *    curl -X POST http://localhost:8888/seed
 *
 * 3. Verify the data was seeded:
 *    curl http://localhost:8888/user/data
 *
 * PRODUCTION / DEPLOY PREVIEW
 * ---------------------------
 * After deploying to Netlify:
 *    curl -X POST https://your-site.netlify.app/seed
 *
 * WHAT GETS SEEDED
 * ----------------
 * User Data (/user/data):
 *   - currentLevels: { Push: 1, Pull: 1, Squat: 0 }
 *   - weeklyProgress: Workouts for Mon/Tue/Wed of the current week
 *     - Monday: Push exercises
 *     - Tuesday: Pull exercises
 *     - Wednesday: Squat exercises
 *
 * Workout Levels (/exercises/levels):
 *   - Level 0: Foundation exercises
 *   - Level 1: Beginner exercises
 *   - Level 2-5: Novice through Expert
 *
 * RE-SEEDING
 * ----------
 * To reset data to defaults, call the seed endpoint again:
 *    curl -X POST http://localhost:8888/seed
 *
 * This overwrites existing data with fresh mock data using current week dates.
 *
 * TROUBLESHOOTING
 * ---------------
 * "Method not allowed":
 *   Make sure you're using POST: curl -X POST http://localhost:8888/seed
 *
 * Empty response from /user/data:
 *   The seed function hasn't been called yet. Run the seed command.
 *
 * Data not showing in app:
 *   1. Check browser console for errors
 *   2. Verify MSW is disabled (NEXT_PUBLIC_MSW_ENABLED=false)
 *   3. Restart netlify dev after changing env variables
 *   4. Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R)
 */

import type { Context } from '@netlify/functions'
import {
  userDataStore,
  exerciseDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'

// Import mock data from src/mocks/data
import {
  MOCK_CurrentUserLevel,
  MOCK_weeklyWorkouts,
  workoutLevels
} from '../../src/mocks/data'

export default async (req: Request, _context: Context) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST to seed data.', 405)
  }

  try {
    // Use mock data with current week dates
    const userData = {
      currentLevels: MOCK_CurrentUserLevel,
      weeklyProgress: MOCK_weeklyWorkouts,
      lastUpdated: new Date().toISOString()
    }

    // Seed user data
    await userDataStore.set(userData)

    // Seed exercise/workout levels
    await exerciseDataStore.setWorkoutLevels(workoutLevels)

    return jsonResponse({
      success: true,
      message: 'Blob store seeded successfully',
      data: {
        userData,
        workoutLevels
      }
    })

  } catch (error) {
    console.error('Seed error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to seed data',
      500
    )
  }
}

export const config = {
  path: '/seed'
}
