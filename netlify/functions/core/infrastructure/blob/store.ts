/**
 * Netlify Blob Storage Utility
 *
 * Centralized blob storage access for all Netlify functions.
 * Provides typed access to different data stores.
 */

import { getStore } from '@netlify/blobs'

// Store names
export const STORES = {
  USER_DATA: 'user-data',
  EXERCISES: 'exercises'
} as const

// Keys
export const KEYS = {
  USER_PROGRESS: 'user-progress',
  WORKOUT_LEVELS: 'workout-levels',
  ALL_EXERCISES: 'all-exercises'
} as const

/**
 * Get a typed blob store
 */
export function getBlobStore(storeName: string) {
  return getStore(storeName)
}

/**
 * User Data Store operations
 */
export const userDataStore = {
  async get<T>(): Promise<T | null> {
    const store = getBlobStore(STORES.USER_DATA)
    return store.get(KEYS.USER_PROGRESS, { type: 'json' })
  },

  async set<T>(data: T): Promise<void> {
    const store = getBlobStore(STORES.USER_DATA)
    await store.setJSON(KEYS.USER_PROGRESS, data)
  },

  async delete(): Promise<void> {
    const store = getBlobStore(STORES.USER_DATA)
    await store.delete(KEYS.USER_PROGRESS)
  }
}

/**
 * Exercise Data Store operations
 */
export const exerciseDataStore = {
  async getWorkoutLevels<T>(): Promise<T | null> {
    const store = getBlobStore(STORES.EXERCISES)
    return store.get(KEYS.WORKOUT_LEVELS, { type: 'json' })
  },

  async setWorkoutLevels<T>(data: T): Promise<void> {
    const store = getBlobStore(STORES.EXERCISES)
    await store.setJSON(KEYS.WORKOUT_LEVELS, data)
  },

  async getAllExercises<T>(): Promise<T | null> {
    const store = getBlobStore(STORES.EXERCISES)
    return store.get(KEYS.ALL_EXERCISES, { type: 'json' })
  },

  async setAllExercises<T>(data: T): Promise<void> {
    const store = getBlobStore(STORES.EXERCISES)
    await store.setJSON(KEYS.ALL_EXERCISES, data)
  }
}

/**
 * CORS headers for API responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
}

/**
 * Create a JSON response
 */
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  })
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: corsHeaders }
  )
}

/**
 * Handle CORS preflight
 */
export function handleCors() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
