/**
 * Netlify Function: Health Check
 *
 * GET /.netlify/functions/health - Health check endpoint
 *
 * Returns status and timestamp for monitoring.
 */

import type { Context } from '@netlify/functions'
import { jsonResponse, handleCors } from './core/infrastructure/blob'

export default async (req: Request, _context: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  return jsonResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mock: false
  })
}

export const config = {
  path: '/health'
}
