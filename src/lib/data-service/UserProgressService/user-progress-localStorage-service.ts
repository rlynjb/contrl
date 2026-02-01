/**
 * UserProgressService - localStorage Implementation
 * 
 * Stores user progress data (current levels, completed workouts, weekly progress)
 * in browser's localStorage. Suitable for development and single-user production.
 */

import type { CurrentUserLevels } from './mocks/CurrentLevel/types'
import type { WeeklyProgressData } from './mocks/WeeklyProgress/types'

export interface CompletedWorkout {
  id: string
  date: string
  category: string
  level: number
  exercises: {
    exerciseId: string
    exerciseName: string
    sets: Array<{
      reps: number
      restTime?: number
      notes?: string
    }>
  }[]
  totalDuration?: number
  notes?: string
}

export interface LevelProgressData {
  currentReps: number
  requiredReps: number
  workoutsCompleted: number
  requiredWorkouts: number
  lastUpdated: string
}

export interface UserProgressData {
  currentLevels: CurrentUserLevels
  completedWorkouts: CompletedWorkout[]
  levelProgress: Record<string, LevelProgressData>
  weeklyProgress?: WeeklyProgressData
  lastUpdated: string
}

export class UserProgressLocalStorageService {
  private static readonly STORAGE_KEY = 'calistheniq_user_progress'
  
  /**
   * Load all user progress data from localStorage
   */
  private static load(): UserProgressData | null {
    if (typeof window === 'undefined') {
      return null // Server-side rendering
    }
    
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
      return null
    }
  }
  
  /**
   * Save all user progress data to localStorage
   */
  private static save(data: UserProgressData): void {
    if (typeof window === 'undefined') {
      return // Server-side rendering
    }
    
    try {
      data.lastUpdated = new Date().toISOString()
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
      throw error
    }
  }
  
  /**
   * Get default/initial user progress data
   */
  private static getDefaultData(): UserProgressData {
    return {
      currentLevels: { Push: 0, Pull: 0, Squat: 0 },
      completedWorkouts: [],
      levelProgress: {
        Push: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() },
        Pull: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() },
        Squat: { currentReps: 0, requiredReps: 50, workoutsCompleted: 0, requiredWorkouts: 3, lastUpdated: new Date().toISOString() }
      },
      lastUpdated: new Date().toISOString()
    }
  }
  
  /**
   * Get current user levels for all categories
   */
  static async getCurrentLevels(): Promise<CurrentUserLevels> {
    const data = this.load()
    return data?.currentLevels || { Push: 0, Pull: 0, Squat: 0 }
  }
  
  /**
   * Update user level for a specific category
   */
  static async updateUserLevel(category: string, level: number): Promise<boolean> {
    try {
      const data = this.load() || this.getDefaultData()
      data.currentLevels[category as keyof CurrentUserLevels] = level
      
      // Reset progress when leveling up
      if (data.levelProgress[category]) {
        data.levelProgress[category].currentReps = 0
        data.levelProgress[category].workoutsCompleted = 0
        data.levelProgress[category].lastUpdated = new Date().toISOString()
      }
      
      this.save(data)
      console.log(`✅ Updated ${category} to level ${level}`)
      return true
    } catch (error) {
      console.error('Failed to update user level:', error)
      return false
    }
  }
  
  /**
   * Get weekly progress data
   * Generates from completed workouts if not explicitly stored
   */
  static async getWeeklyProgress(): Promise<WeeklyProgressData> {
    const data = this.load()
    
    if (data?.weeklyProgress) {
      return data.weeklyProgress
    }
    
    // Generate weekly progress from completed workouts
    const today = new Date()
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const recentWorkouts = data?.completedWorkouts.filter(w => 
      new Date(w.date) >= weekAgo
    ) || []
    
    // Create weekly summary
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const weekDays = dayNames.map((day, index) => {
      const dayWorkouts = recentWorkouts.filter(w => {
        const workoutDay = new Date(w.date).getDay()
        const adjustedDay = workoutDay === 0 ? 6 : workoutDay - 1 // Adjust to Mon=0
        return adjustedDay === index
      })
      
      const dayDate = new Date(today.getTime() - (6 - index) * 24 * 60 * 60 * 1000)
      const isToday = dayDate.toDateString() === today.toDateString()
      
      return {
        date: dayDate,
        completed: dayWorkouts.length > 0,
        isToday,
        completedWorkout: dayWorkouts.length > 0 ? {
          exercises: dayWorkouts.flatMap(w => w.exercises.map(e => ({ name: e.exerciseName } as any))),
          duration: dayWorkouts[0].totalDuration || 30,
          categories: [dayWorkouts[0].category] as any,
          level: dayWorkouts[0].level,
          date: new Date(dayWorkouts[0].date)
        } : undefined
      }
    })
    
    return {
      weekDays
    }
  }
  
  /**
   * Calculate current workout streak
   */
  private static calculateStreak(workouts: CompletedWorkout[]): number {
    if (workouts.length === 0) return 0
    
    const sortedDates = workouts
      .map(w => new Date(w.date).toDateString())
      .sort()
      .reverse()
    
    let streak = 1
    let currentDate = new Date(sortedDates[0])
    
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i])
      const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (diffDays === 1) {
        streak++
        currentDate = prevDate
      } else if (diffDays > 1) {
        break
      }
    }
    
    return streak
  }
  
  /**
   * Log a completed workout
   */
  static async logWorkout(workout: CompletedWorkout): Promise<boolean> {
    try {
      const data = this.load() || this.getDefaultData()
      
      // Add workout with generated ID if not provided
      if (!workout.id) {
        workout.id = `workout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      data.completedWorkouts.push(workout)
      
      // Update level progress
      if (workout.category && data.levelProgress[workout.category]) {
        const progress = data.levelProgress[workout.category]
        
        // Count total reps from workout
        const totalReps = workout.exercises.reduce((sum, exercise) => {
          return sum + exercise.sets.reduce((setSum, set) => setSum + set.reps, 0)
        }, 0)
        
        progress.currentReps += totalReps
        progress.workoutsCompleted += 1
        progress.lastUpdated = new Date().toISOString()
        
        // Check for level-up
        if (progress.currentReps >= progress.requiredReps && 
            progress.workoutsCompleted >= progress.requiredWorkouts) {
          const newLevel = (data.currentLevels[workout.category as keyof CurrentUserLevels] || 0) + 1
          await this.updateUserLevel(workout.category, newLevel)
          return true // Will save in updateUserLevel
        }
      }
      
      this.save(data)
      console.log('✅ Workout logged successfully:', workout.id)
      return true
    } catch (error) {
      console.error('Failed to log workout:', error)
      return false
    }
  }
  
  /**
   * Get level progress for a category
   */
  static async getLevelProgress(category: string): Promise<LevelProgressData | null> {
    const data = this.load()
    return data?.levelProgress[category] || null
  }
  
  /**
   * Get completed workouts with optional filtering
   */
  static async getCompletedWorkouts(filters?: {
    category?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<CompletedWorkout[]> {
    const data = this.load()
    let workouts = data?.completedWorkouts || []
    
    // Apply filters
    if (filters?.category) {
      workouts = workouts.filter(w => w.category === filters.category)
    }
    
    if (filters?.startDate) {
      workouts = workouts.filter(w => new Date(w.date) >= new Date(filters.startDate!))
    }
    
    if (filters?.endDate) {
      workouts = workouts.filter(w => new Date(w.date) <= new Date(filters.endDate!))
    }
    
    // Sort by date descending
    workouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    
    // Apply limit
    if (filters?.limit) {
      workouts = workouts.slice(0, filters.limit)
    }
    
    return workouts
  }
  
  /**
   * Clear all user progress data
   */
  static clear(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.STORAGE_KEY)
    console.log('🗑️ All user progress data cleared')
  }
  
  /**
   * Export data as JSON (for backup)
   */
  static export(): string {
    const data = this.load()
    return JSON.stringify(data, null, 2)
  }
  
  /**
   * Import data from JSON
   */
  static import(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString)
      this.save(data)
      console.log('✅ Data imported successfully')
    } catch (error) {
      console.error('Failed to import data:', error)
      throw new Error('Invalid JSON format')
    }
  }
}
