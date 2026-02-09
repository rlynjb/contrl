/**
 * Netlify Function: Export Data
 *
 * GET /export - Export current blob store data as JSON
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
 * USAGE
 * -----
 * curl http://localhost:8888/export
 * # Or open in browser: http://localhost:8888/export
 *
 * RESPONSE
 * --------
 * {
 *   "success": true,
 *   "exportedAt": "2025-02-08T...",
 *   "data": {
 *     "userData": { currentLevels, weeklyProgress },
 *     "workoutLevels": { beginner, novice, ... }
 *   }
 * }
 *
 * WHY SNAPSHOTS?
 * --------------
 * - Mock files (user.ts, exercises.ts) contain logic code that generates data
 * - Snapshots are pure JSON files with static data
 * - Export saves blob data → snapshot JSON (preserves logic in .ts files)
 * - Seed from snapshot restores exact state without regenerating dates
 */

import type { Context } from '@netlify/functions'
import {
  userDataStore,
  exerciseDataStore,
  jsonResponse,
  errorResponse,
  handleCors
} from './core/infrastructure/blob'

export default async (req: Request, _context: Context) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed. Use GET to export data.', 405)
  }

  try {
    const userData = await userDataStore.get()
    const workoutLevels = await exerciseDataStore.getWorkoutLevels()

    return jsonResponse({
      success: true,
      exportedAt: new Date().toISOString(),
      data: { userData, workoutLevels }
    })

  } catch (error) {
    console.error('Export error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to export data',
      500
    )
  }
}

export const config = {
  path: '/export'
}
