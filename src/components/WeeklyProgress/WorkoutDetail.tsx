'use client'

import { useState, useEffect } from 'react'
import { WorkoutExerciseCard } from '@/components/ui'
import { api } from '@/api'
import type { BaseExercise, CurrentUserLevels, ProgressionNotes } from '@/api'
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
  const [progressionNotes, setProgressionNotes] = useState<Record<string, ProgressionNotes>>({})

  // Fetch user levels and progression notes on mount
  useEffect(() => {
    const fetchData = async () => {
      const [levels, workoutLevels] = await Promise.all([
        api.user.getCurrentLevels(),
        api.exercises.getWorkoutLevels()
      ])
      setUserLevels(levels)

      // Build a lookup: level number -> progressionNotes
      const notesMap: Record<string, ProgressionNotes> = {}
      for (const key of Object.keys(workoutLevels)) {
        const wl = workoutLevels[key]
        if (wl.progressionNotes) {
          notesMap[key] = wl.progressionNotes
        }
      }
      setProgressionNotes(notesMap)
    }
    fetchData()
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
      const originalExercises = await api.exercises.getExercisesByLevel(level, category)

      // Get user data to find previous sessions with same exercises
      const userData = await api.user.getUserData()
      if (!userData) return

      // Sort all sessions most recent first for closest carry-over
      const allSessions = (userData.weeklyProgress || [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // Map exercises: use saved values from closest previous session if available
      const exercises = originalExercises.map(exercise => {
        // Look for this exercise in all sessions (most recent first)
        for (const session of allSessions) {
          const savedExercise = session.exercises.find(e => e.name === exercise.name)
          if (savedExercise) {
            // Use saved sets, completedSets, tempo, rest, notes from previous session
            return {
              ...exercise,
              category,
              sets: savedExercise.sets,
              completedSets: savedExercise.sets.map(() => false), // Reset completion for new day
              tempo: savedExercise.tempo,
              rest: savedExercise.rest,
              notes: savedExercise.notes,
              completed: false // Reset completion for new day
            }
          }
        }
        // No previous data found, use original exercise
        return { ...exercise, category }
      })

      setCategoryExercises(exercises)

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

      // Clear category exercises so they display from user data (selectedDay.exercises)
      setSelectedCategory(null)
      setCategoryExercises([])

      // Notify parent to refresh data
      onWorkoutUpdate?.()
    } finally {
      setIsLoading(false)
    }
  }

  // Handle removing a category's exercises
  const handleRemoveCategory = async (category: Category) => {
    const userData = await api.user.getUserData()
    if (!userData?.weeklyProgress) return

    const dayDate = new Date(selectedDay.date).toDateString()

    const updatedProgress = userData.weeklyProgress.map(session => {
      if (new Date(session.date).toDateString() === dayDate) {
        return {
          ...session,
          exercises: session.exercises.filter(e => e.category !== category),
          categories: (session.categories || []).filter(c => c !== category)
        }
      }
      return session
    })

    // Save updated data
    await api.user.updateUserData({
      ...userData,
      weeklyProgress: updatedProgress
    })

    // Remove from local addedCategories state
    setAddedCategories(prev => prev.filter(c => c !== category))

    // Clear selection if removing the currently selected category
    if (selectedCategory === category) {
      setSelectedCategory(null)
      setCategoryExercises([])
    }

    // Notify parent to refresh data
    onWorkoutUpdate?.()
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

  // Map level number to workout level key
  const levelKeyMap: Record<number, string> = { 1: 'beginner', 2: 'novice', 3: 'intermediate', 4: 'advanced', 5: 'expert' }

  const getProgressionNote = (cat: Category): string | undefined => {
    if (!userLevels) return undefined
    const key = levelKeyMap[userLevels[cat]]
    return progressionNotes[key]?.[cat]
  }

  // Group existing exercises by category
  const groupedExercises = (selectedDay.exercises || []).reduce<Record<Category, { exercise: BaseExercise; index: number }[]>>(
    (groups, exercise, index) => {
      const cat = (exercise.category || 'Push') as Category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push({ exercise, index })
      return groups
    },
    {} as Record<Category, { exercise: BaseExercise; index: number }[]>
  )

  const activeCategories = Object.keys(groupedExercises) as Category[]

  return (
    <div className="weekly-progress__modal-content">
      {/* Loading state */}
      {isLoading && (
        <p className="workout-detail__loading">Loading exercises...</p>
      )}

      {/* Preview of newly selected category exercises */}
      {selectedCategory && !isLoading && categoryExercises.length > 0 && (
        <div className="workout-detail__category-group">
          <div className={`workout-detail__category-header workout-detail__category-header--${selectedCategory.toLowerCase()}`}>
            <span>{selectedCategory}</span>
            <span className="workout-detail__category-header-level">Level {userLevels?.[selectedCategory] ?? 0}</span>
          </div>
          {getProgressionNote(selectedCategory) && (
            <p className="workout-detail__progression-note">{getProgressionNote(selectedCategory)}</p>
          )}
          <div className="weekly-progress__exercise-list">
            {categoryExercises.map((exercise, exIndex) => (
              <WorkoutExerciseCard
                key={`category-${exIndex}`}
                exercise={exercise}
                className="weekly-progress__exercise-card"
              />
            ))}
          </div>
        </div>
      )}

      {selectedCategory && !isLoading && categoryExercises.length === 0 && (
        <p className="workout-detail__empty">
          No exercises found for {selectedCategory} at level {userLevels?.[selectedCategory]}
        </p>
      )}

      {/* Existing exercises grouped by category */}
      {activeCategories.map(cat => (
        <div key={cat} className="workout-detail__category-group">
          <div className={`workout-detail__category-header workout-detail__category-header--${cat.toLowerCase()}`}>
            <span>{cat}</span>
            <span className="workout-detail__category-header-level">Level {userLevels?.[cat] ?? 0}</span>
          </div>
          {getProgressionNote(cat) && (
            <p className="workout-detail__progression-note">{getProgressionNote(cat)}</p>
          )}
          <div className="weekly-progress__exercise-list">
            {groupedExercises[cat].map(({ exercise, index }) => (
              <WorkoutExerciseCard
                key={index}
                exercise={exercise}
                onExerciseChange={(updated) => handleExerciseChange(updated, index)}
                className="weekly-progress__exercise-card"
              />
            ))}
          </div>
        </div>
      ))}

      {/* Category List - Always visible as last item */}
      <div className="workout-detail__category-list">
        {(['Push', 'Pull', 'Squat'] as Category[]).map((category) => {
          const hasExercises = selectedDay.categories?.includes(category) || addedCategories.includes(category)
          return (
            <div key={category} className="workout-detail__category-row">
              <button
                className={`workout-detail__category-item workout-detail__category-item--${category.toLowerCase()} ${selectedCategory === category ? 'workout-detail__category-item--active' : ''} ${hasExercises ? 'workout-detail__category-item--disabled' : ''}`}
                onClick={() => handleCategoryClick(category)}
                disabled={hasExercises}
              >
                <span className="workout-detail__category-name">{category}</span>
                <span className="workout-detail__category-level">
                  Level {userLevels?.[category] ?? 0}
                </span>
              </button>
              {hasExercises && (
                <button
                  className={`workout-detail__category-remove workout-detail__category-remove--${category.toLowerCase()}`}
                  onClick={() => handleRemoveCategory(category)}
                  title={`Remove ${category} exercises`}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
