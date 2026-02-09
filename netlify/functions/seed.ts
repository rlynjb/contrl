/**
 * Netlify Function: Seed Data
 *
 * POST /seed - Initialize blob store with dynamic mock data
 * POST /seed?source=snapshot - Initialize from snapshot files
 *
 * =============================================================================
 * COMPLETE WORKFLOW: Mock ↔ Blob ↔ Snapshot
 * =============================================================================
 *
 * 1. SEED FROM MOCK (dynamic dates):
 *    curl -X POST http://localhost:8888/seed
 *    → Uses src/mocks/data (user.ts, exercises.ts) with current week dates
 *
 * 2. SEED FROM SNAPSHOT (static data):
 *    curl -X POST http://localhost:8888/seed?source=snapshot
 *    → Uses src/mocks/data/snapshots/*.json (previously exported data)
 *
 * 3. EXPORT TO SNAPSHOT:
 *    curl http://localhost:8888/export > export.json
 *    cat export.json | jq '.data.userData' > src/mocks/data/snapshots/user-snapshot.json
 *    cat export.json | jq '.data.workoutLevels' > src/mocks/data/snapshots/exercises-snapshot.json
 *
 * =============================================================================
 *
 * PREREQUISITES
 * -------------
 * 1. MSW must be disabled: NEXT_PUBLIC_MSW_ENABLED=false
 * 2. Netlify CLI installed: npm install -g netlify-cli
 * 3. Start server: netlify dev
 *
 * WHAT GETS SEEDED
 * ----------------
 * User Data (/user/data):
 *   - currentLevels: { Push: 1, Pull: 1, Squat: 1 }
 *   - weeklyProgress: Workouts for upcoming week
 *
 * Workout Levels (/exercises/levels):
 *   - Level 1-5: Beginner through Expert
 *
 * VERIFY
 * ------
 * curl http://localhost:8888/user/data
 * curl http://localhost:8888/exercises/levels
 */

import type { Context } from '@netlify/functions'
import {
  userDataStore,
  exerciseDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'

// Import dynamic mock data
import {
  MOCK_CurrentUserLevel,
  MOCK_weeklyWorkouts,
  workoutLevels
} from '../../src/mocks/data'

// Import static snapshot data
import userSnapshot from '../../src/mocks/data/snapshots/user-snapshot.json'
import exercisesSnapshot from '../../src/mocks/data/snapshots/exercises-snapshot.json'

export default async (req: Request, _context: Context) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST to seed data.', 405)
  }

  try {
    const url = new URL(req.url)
    const source = url.searchParams.get('source')
    const useSnapshot = source === 'snapshot'

    let userData
    let exerciseLevels

    if (useSnapshot) {
      // Static snapshot data (previously exported)
      userData = {
        ...userSnapshot,
        lastUpdated: new Date().toISOString()
      }
      exerciseLevels = exercisesSnapshot
    } else {
      // Dynamic mock data with current week dates
      userData = {
        currentLevels: MOCK_CurrentUserLevel,
        weeklyProgress: MOCK_weeklyWorkouts,
        lastUpdated: new Date().toISOString()
      }
      exerciseLevels = workoutLevels
    }

    await userDataStore.set(userData)
    await exerciseDataStore.setWorkoutLevels(exerciseLevels)

    return jsonResponse({
      success: true,
      message: `Seeded from ${useSnapshot ? 'snapshot' : 'mock data'}`,
      source: useSnapshot ? 'snapshot' : 'mock',
      data: { userData, workoutLevels: exerciseLevels }
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
