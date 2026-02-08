'use client'

import { useState, useEffect } from 'react'
import { WorkoutExerciseCard } from '@/components/ui'
import { api } from '@/api'
import type { BaseExercise, CurrentUserLevels } from '@/api'
import type { ExtendedWeekDay } from './WeeklyProgress'

interface WorkoutDetailProps {
  selectedDay: ExtendedWeekDay
  onWorkoutUpdate?: () => void
}

type Category = keyof CurrentUserLevels

export default function WorkoutDetail({ selectedDay, onWorkoutUpdate }: WorkoutDetailProps) {
  const [userLevels, setUserLevels] = useState<CurrentUserLevels | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [categoryExercises, setCategoryExercises] = useState<BaseExercise[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [addedCategories, setAddedCategories] = useState<Category[]>([])

  // Fetch user levels on mount
  useEffect(() => {
    const fetchLevels = async () => {
      const levels = await api.user.getCurrentLevels()
      setUserLevels(levels)
    }
    fetchLevels()
  }, [])

  // Handle category selection - fetches exercises and saves to userData
  const handleCategoryClick = async (category: Category) => {
    if (selectedCategory === category) {
      // Deselect if already selected
      setSelectedCategory(null)
      setCategoryExercises([])
      return
    }

    if (!userLevels) return

    setSelectedCategory(category)
    setIsLoading(true)

    try {
      const level = userLevels[category]
      const exercises = await api.exercises.getExercisesByLevel(level, category)
      setCategoryExercises(exercises)

      // Save exercises to userData
      const userData = await api.user.getUserData()
      if (!userData) return

      const dayDate = new Date(selectedDay.date).toDateString()
      const existingSession = userData.weeklyProgress?.find(
        session => new Date(session.date).toDateString() === dayDate
      )

      let updatedProgress = userData.weeklyProgress || []

      if (existingSession) {
        // Update existing session - add exercises and category
        updatedProgress = updatedProgress.map(session => {
          if (new Date(session.date).toDateString() === dayDate) {
            const existingCategories = session.categories || []
            return {
              ...session,
              exercises: [...session.exercises, ...exercises],
              categories: existingCategories.includes(category)
                ? existingCategories
                : [...existingCategories, category]
            }
          }
          return session
        })
      } else {
        // Create new session for this day
        updatedProgress = [
          ...updatedProgress,
          {
            exercises,
            categories: [category],
            level,
            date: selectedDay.date
          }
        ]
      }

      // Save to Netlify Blob via API
      await api.user.updateUserData({
        ...userData,
        weeklyProgress: updatedProgress
      })

      // Mark category as added to disable button immediately
      setAddedCategories(prev => [...prev, category])

      // Notify parent to refresh data
      onWorkoutUpdate?.()
    } finally {
      setIsLoading(false)
    }
  }

  const handleExerciseChange = async (updatedExercise: BaseExercise, index: number) => {
    // Get current user data
    const userData = await api.user.getUserData()
    if (!userData?.weeklyProgress) return

    // Find and update the workout session for this day
    const dayDate = new Date(selectedDay.date).toDateString()
    const updatedProgress = userData.weeklyProgress.map(session => {
      if (new Date(session.date).toDateString() === dayDate) {
        const updatedExercises = [...session.exercises]
        updatedExercises[index] = updatedExercise
        return { ...session, exercises: updatedExercises }
      }
      return session
    })

    // Save updated data
    await api.user.updateUserData({
      ...userData,
      weeklyProgress: updatedProgress
    })

    onWorkoutUpdate?.()
  }

  return (
    <div className="weekly-progress__modal-content">
      <div className="weekly-progress__exercise-list">
        {/* Category exercises when selected */}
        {isLoading && (
          <p className="workout-detail__loading">Loading exercises...</p>
        )}

        {selectedCategory && !isLoading && categoryExercises.length > 0 && (
          <>
            {categoryExercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={`category-${exIndex}`}
                exercise={exercise}
                className="weekly-progress__exercise-card"
              />
            ))}
          </>
        )}

        {selectedCategory && !isLoading && categoryExercises.length === 0 && (
          <p className="workout-detail__empty">
            No exercises found for {selectedCategory} at level {userLevels?.[selectedCategory]}
          </p>
        )}

        {/* Existing workout exercises */}
        {selectedDay.exercises && selectedDay.exercises.length > 0 && (
          <>
            {selectedDay.exercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={exIndex}
                exercise={exercise}
                onExerciseChange={(updated) => handleExerciseChange(updated, exIndex)}
                className="weekly-progress__exercise-card"
              />
            ))}
          </>
        )}

        {/* Today's workout */}
        {selectedDay.todayWorkout && (
          <>
            {selectedDay.todayWorkout.exercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={`today-${exIndex}`}
                exercise={exercise}
                onExerciseChange={(updated) => handleExerciseChange(updated, exIndex)}
                className="weekly-progress__exercise-card"
              />
            ))}
          </>
        )}

        {/* Category List - Always visible as last item */}
        <div className="workout-detail__category-list">
          {(['Push', 'Pull', 'Squat'] as Category[]).map((category) => {
            const hasExercises = selectedDay.categories?.includes(category) || addedCategories.includes(category)
            return (
              <button
                key={category}
                className={`workout-detail__category-item workout-detail__category-item--${category.toLowerCase()} ${selectedCategory === category ? 'workout-detail__category-item--active' : ''} ${hasExercises ? 'workout-detail__category-item--disabled' : ''}`}
                onClick={() => handleCategoryClick(category)}
                disabled={hasExercises}
              >
                <span className="workout-detail__category-name">{category}</span>
                <span className="workout-detail__category-level">
                  Level {userLevels?.[category] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
