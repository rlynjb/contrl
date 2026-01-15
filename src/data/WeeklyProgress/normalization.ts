// WeeklyProgress Normalization Functions
// Business logic for processing weekly progress data

import { WeekDay, WeeklyProgressData, mockWeeklyProgressData, sampleWorkouts, todaysPlannedWorkout, WorkoutSession } from './mock'

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
    let plannedWorkout: WorkoutSession | undefined
    if (isToday && todaysPlannedWorkout.date.toDateString() === date.toDateString()) {
      plannedWorkout = todaysPlannedWorkout
    }
    
    const completed = !!completedWorkout
    
    weekDays.push({
      date,
      completed,
      isToday,
      completedWorkout,
      plannedWorkout
    })
  }
  
  return weekDays
}

/**
 * Get today's workout preview
 */
export function getTodaysWorkoutPreview(weekDays: WeekDay[]): string[] {
  const today = weekDays.find(day => day.isToday)
  if (!today?.plannedWorkout) return []
  
  return today.plannedWorkout.exercises.map(exercise => 
    `${exercise.name} (${exercise.sets.length} sets)`
  )
}

/**
 * Get recent workout summary
 */
export function getRecentWorkoutSummary(weekDays: WeekDay[]): string[] {
  const completedWorkouts = weekDays
    .filter(day => day.completedWorkout)
    .slice(-2) // Get last 2 completed workouts
  
  return completedWorkouts.map(day => {
    const session = day.completedWorkout!
    const exerciseCount = session.exercises.length
    const categories = session.categories.join(', ')
    const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' })
    return `${dayName}: ${exerciseCount} exercises (${categories}) - ${session.duration}min`
  })
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
