/**
 * Netlify Function: Export Data
 *
 * Exports data from Netlify Blob store as JSON.
 *
 * ENDPOINT
 * --------
 * GET /api/export - Export user and exercises data from blob store
 *
 * HOW IT WORKS
 * ------------
 * Data flows: Netlify Blob → JSON output
 *
 * INDUSTRY STANDARD: FIXTURES + SNAPSHOTS PATTERN
 * ------------------------------------------------
 * Fixtures (Mock Files):
 *   - Source of truth, version controlled
 *   - Contains logic (date generation, computed values)
 *   - Located in: src/mocks/data/
 *
 * Snapshots (Exported Data):
 *   - Captured runtime state from blob storage
 *   - Pure JSON data for review
 *   - Created via: curl http://localhost:8888/api/export > snapshot.json
 *
 * Workflow:
 *   1. seed: Push fixtures to blob storage
 *   2. App modifies data in blob during usage
 *   3. export: Capture blob state to snapshot file
 *   4. Developer reviews snapshot, updates fixtures if needed
 *
 * LOCAL DEV SETUP
 * ---------------
 * Option 1: netlify dev (port 8888) — runs Next.js + functions together with /api/* redirects
 *   netlify dev
 *   curl http://localhost:8888/api/export > backup.json
 *
 * Option 2: npm run dev + netlify functions:serve (port 9999) — runs them separately
 *   npm run dev                              # Next.js on port 3000
 *   netlify functions:serve --port 9999      # Functions on port 9999
 *   curl http://localhost:9999/.netlify/functions/export > backup.json
 *   Note: /api/* redirects are NOT available in this mode, use /.netlify/functions/* directly.
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
