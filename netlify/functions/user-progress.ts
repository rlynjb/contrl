/**
 * Netlify Function: User Progress Storage
 * 
 * Handles GET/POST/DELETE requests for user progress data using Netlify Blobs.
 * Stores current levels, completed workouts, and progress tracking.
 */

import type { Context } from '@netlify/functions'

// Type definitions
interface UserProgressData {
  currentLevels: {
    Push: number
    Pull: number
    Squat: number
  }
  completedWorkouts: any[]
  levelProgress: Record<string, any>
  weeklyProgress?: any
  lastUpdated: string
}

export default async (req: Request, context: Context) => {
  const STORE_NAME = 'user-progress'
  const DATA_KEY = 'progress'
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  }
  
  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  
  try {
    // Get Netlify Blobs store
    const { getStore } = await import('@netlify/blobs')
    const store = getStore(STORE_NAME)
    
    // GET - Read user progress
    if (req.method === 'GET') {
      try {
        const data = await store.get(DATA_KEY, { type: 'json' })
        
        if (!data) {
          // Return default data if nothing stored
          const defaultData: UserProgressData = {
            currentLevels: { Push: 0, Pull: 0, Squat: 0 },
            completedWorkouts: [],
            levelProgress: {},
            lastUpdated: new Date().toISOString()
          }
          return new Response(JSON.stringify(defaultData), { headers })
        }
        
        return new Response(JSON.stringify(data), { headers })
      } catch (error) {
        console.error('Error reading from Netlify Blobs:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to read progress data' }),
          { status: 500, headers }
        )
      }
    }
    
    // POST - Write user progress
    if (req.method === 'POST') {
      try {
        const data: UserProgressData = await req.json()
        data.lastUpdated = new Date().toISOString()
        
        await store.setJSON(DATA_KEY, data)
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            timestamp: data.lastUpdated 
          }),
          { headers }
        )
      } catch (error) {
        console.error('Error writing to Netlify Blobs:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to save progress data' }),
          { status: 500, headers }
        )
      }
    }
    
    // DELETE - Clear user progress
    if (req.method === 'DELETE') {
      try {
        await store.delete(DATA_KEY)
        
        return new Response(
          JSON.stringify({ success: true }),
          { headers }
        )
      } catch (error) {
        console.error('Error deleting from Netlify Blobs:', error)
        // Even if delete fails, consider it successful (idempotent)
        return new Response(
          JSON.stringify({ success: true }),
          { headers }
        )
      }
    }
    
    // Unsupported method
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    )
    
  } catch (error) {
    console.error('Netlify Blobs error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers }
    )
  }
}

export const config = {
  path: '/user-progress'
}
