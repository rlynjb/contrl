// WeeklyProgress Normalization Functions
// Business logic for processing weekly progress data

import { sampleWorkouts, todaysTodayWorkout } from './mock'
import type { WeekDay, WeeklyProgressData, WorkoutSession } from './types'

/**
 * Generate weekly progress data for the current week (Sunday to Saturday)
 * Uses actual workout dates from sample data for realistic completion tracking
 */
export function generateWeeklyProgress(): WeekDay[] {
  const today = new Date()
  const weekDays: WeekDay[] = []
  
  // Get the start of the current week (Sunday)
  const currentDay = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - currentDay)
  startOfWeek.setHours(0, 0, 0, 0) // Start of day
  
  // Generate all 7 days of the week (Sunday to Saturday)
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    
    // Check if this date is today
    const isToday = date.toDateString() === today.toDateString()
    
    // Find completed workouts for this day
    const completedWorkout = sampleWorkouts.find(workout => 
      workout.date.toDateString() === date.toDateString() && 
      workout.date <= today
    )
    
    // Find planned workouts for this day (including today)
    let todayWorkout: WorkoutSession | undefined
    if (isToday && todaysTodayWorkout.date.toDateString() === date.toDateString()) {
      todayWorkout = todaysTodayWorkout
    }
    
    const completed = !!completedWorkout
    
    weekDays.push({
      date,
      completed,
      isToday,
      completedWorkout,
      todayWorkout
    })
  }
  
  return weekDays
}

/**
 * Generate complete weekly progress data
 */
export function generateCompleteWeeklyProgress(): WeeklyProgressData {
  const weekDays = generateWeeklyProgress()
  
  return {
    weekDays
  }
}

// Export processed data
export const weeklyProgressData = generateCompleteWeeklyProgress()
