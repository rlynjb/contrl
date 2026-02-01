/**
 * React hooks for data service integration
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { dataService } from '@/lib/data-service'
import type { BaseExercise } from '@/types'
import type { WorkoutLevels } from '@/lib/data-service/mock-data/WorkoutLevels/types'

/**
 * Hook for fetching workout levels data
 */
export function useWorkoutLevels() {
  const [data, setData] = useState<WorkoutLevels | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await dataService.exercises.getWorkoutLevels()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch workout levels')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return { data, loading, error, isUsingMockData: dataService.isUsingMockData() }
}

/**
 * Hook for fetching user's current levels
 */
export function useCurrentLevels(userId?: string) {
  const [data, setData] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await dataService.userProgress.getCurrentLevels(userId)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch current levels')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId])

  const updateLevel = useCallback(async (category: string, level: number) => {
    try {
      const success = await dataService.userProgress.updateUserLevel(category, level, userId)
      if (success && data) {
        setData(prev => ({ ...prev!, [category]: level }))
      }
      return success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update level')
      return false
    }
  }, [userId, data])

  return { 
    data, 
    loading, 
    error, 
    updateLevel, 
    isUsingMockData: dataService.isUsingMockData() 
  }
}

/**
 * Hook for fetching weekly progress
 */
export function useWeeklyProgress(userId?: string) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await dataService.userProgress.getWeeklyProgress(userId)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch weekly progress')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId])

  return { data, loading, error, isUsingMockData: dataService.isUsingMockData() }
}

/**
 * Hook for exercise search functionality
 */
export function useExerciseSearch() {
  const [results, setResults] = useState<BaseExercise[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await dataService.exercises.searchExercises(query)
      setResults(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search exercises')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return { 
    results, 
    loading, 
    error, 
    search, 
    clear, 
    isUsingMockData: dataService.isUsingMockData() 
  }
}

/**
 * Hook for data service health check
 */
export function useDataServiceHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setLoading(true)
        const healthy = await dataService.healthCheck()
        setIsHealthy(healthy)
      } catch {
        setIsHealthy(false)
      } finally {
        setLoading(false)
      }
    }

    checkHealth()
  }, [])

  return { isHealthy, loading, isUsingMockData: dataService.isUsingMockData() }
}
