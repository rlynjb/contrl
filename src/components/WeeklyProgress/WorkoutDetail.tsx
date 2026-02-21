'use client'

import { useState, useEffect, useMemo } from 'react'
import { WorkoutExerciseCard } from '@/components/ui'
import { api } from '@/api'
import type { BaseExercise, CurrentUserLevels, ProgressionNotes, WorkoutSession } from '@/api'
import type { ExtendedWeekDay, Category } from '@/hooks/useUserData'

interface WorkoutDetailProps {
  selectedDay: ExtendedWeekDay
  currentLevels: CurrentUserLevels | null
  weeklyProgress: WorkoutSession[]
  onAddCategory: (date: Date, category: Category, exercises: BaseExercise[], level: number) => Promise<void>
  onRemoveCategory: (date: Date, category: Category) => Promise<void>
  onUpdateExercise: (date: Date, exerciseIndex: number, exercise: BaseExercise) => void
  onLevelUp: (category: Category, newLevel: number) => Promise<boolean>
}

export default function WorkoutDetail({
  selectedDay,
  currentLevels,
  weeklyProgress,
  onAddCategory,
  onRemoveCategory,
  onUpdateExercise,
  onLevelUp
}: WorkoutDetailProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [categoryExercises, setCategoryExercises] = useState<BaseExercise[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [progressionNotes, setProgressionNotes] = useState<Record<string, ProgressionNotes>>({})
  const [levelUpMessage, setLevelUpMessage] = useState<string | null>(null)

  // Derive added categories from selectedDay — auto-updates after mutations
  const addedCategories = useMemo(
    () => (selectedDay.categories || []) as Category[],
    [selectedDay.categories]
  )

  // Fetch progression notes on mount (read-only exercise metadata)
  useEffect(() => {
    const fetchNotes = async () => {
      const workoutLevels = await api.exercises.getWorkoutLevels()
      const notesMap: Record<string, ProgressionNotes> = {}
      for (const key of Object.keys(workoutLevels)) {
        const wl = workoutLevels[key]
        if (wl.progressionNotes) {
          notesMap[key] = wl.progressionNotes
        }
      }
      setProgressionNotes(notesMap)
    }
    fetchNotes()
  }, [])

  // Handle category selection — fetches exercises and delegates write to hook
  const handleCategoryClick = async (category: Category) => {
    if (selectedCategory === category) {
      setSelectedCategory(null)
      setCategoryExercises([])
      return
    }

    if (!currentLevels) return

    setSelectedCategory(category)
    setIsLoading(true)

    try {
      const level = currentLevels[category]
      const originalExercises = await api.exercises.getExercisesByLevel(level, category)

      // Sort all sessions most recent first for closest carry-over
      const allSessions = [...weeklyProgress]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // Map exercises: use saved values from closest previous session if available
      const exercises = originalExercises.map(exercise => {
        for (const session of allSessions) {
          const savedExercise = session.exercises.find(e => e.name === exercise.name)
          if (savedExercise) {
            return {
              ...exercise,
              category,
              sets: savedExercise.sets,
              completedSets: savedExercise.sets.map(() => false),
              tempo: savedExercise.tempo,
              rest: savedExercise.rest,
              notes: savedExercise.notes,
              completed: false
            }
          }
        }
        return { ...exercise, category }
      })

      setCategoryExercises(exercises)

      // Delegate the write to the hook (serialized, race-condition free)
      await onAddCategory(selectedDay.date, category, exercises, level)

      // Clear preview — exercises now display from selectedDay.exercises via hook
      setSelectedCategory(null)
      setCategoryExercises([])
    } finally {
      setIsLoading(false)
    }
  }

  // Handle removing a category's exercises
  const handleRemoveCategory = async (category: Category) => {
    await onRemoveCategory(selectedDay.date, category)

    if (selectedCategory === category) {
      setSelectedCategory(null)
      setCategoryExercises([])
    }
  }

  const checkAndLevelUp = async (category: Category) => {
    if (!currentLevels) return false

    const currentLevel = currentLevels[category]
    if (currentLevel >= 5) return false

    // Use the latest selectedDay exercises (derived from hook state)
    const catExercises = (selectedDay.exercises || []).filter(e => e.category === category)
    if (catExercises.length === 0) return false

    for (const exercise of catExercises) {
      if (!exercise.completedSets?.every(Boolean)) return false

      try {
        const levelInfo = await api.exercises.getExerciseLevel(exercise.name)
        if (!levelInfo?.originalSets) return false

        for (let i = 0; i < exercise.sets.length; i++) {
          const actual = exercise.sets[i]
          const target = levelInfo.originalSets[i]
          if (!target) continue

          if (target.reps && (!actual.reps || actual.reps < target.reps)) return false
          if (target.duration && (!actual.duration || actual.duration < target.duration)) return false
        }
      } catch {
        return false
      }
    }

    // All exercises passed — level up!
    const newLevel = currentLevel + 1
    const success = await onLevelUp(category, newLevel)
    if (success) {
      setLevelUpMessage(`${category} leveled up to Level ${newLevel}!`)
      setTimeout(() => setLevelUpMessage(null), 4000)
    }
    return success
  }

  const handleExerciseChange = (updatedExercise: BaseExercise, index: number) => {
    // Delegate write to the hook (debounced + serialized via write queue)
    onUpdateExercise(selectedDay.date, index, updatedExercise)

    // Check level-up after update
    const category = updatedExercise.category as Category | undefined
    if (category) {
      checkAndLevelUp(category)
    }
  }

  // Map level number to workout level key
  const levelKeyMap: Record<number, string> = { 1: 'beginner', 2: 'novice', 3: 'intermediate', 4: 'advanced', 5: 'expert' }

  const getProgressionNote = (cat: Category): string | undefined => {
    if (!currentLevels) return undefined
    const key = levelKeyMap[currentLevels[cat]]
    return progressionNotes[key]?.[cat]
  }

  // Group existing exercises by category
  const groupedExercises = useMemo(
    () => (selectedDay.exercises || []).reduce<Record<Category, { exercise: BaseExercise; index: number }[]>>(
      (groups, exercise, index) => {
        const cat = (exercise.category || 'Push') as Category
        if (!groups[cat]) groups[cat] = []
        groups[cat].push({ exercise, index })
        return groups
      },
      {} as Record<Category, { exercise: BaseExercise; index: number }[]>
    ),
    [selectedDay.exercises]
  )

  const activeCategories = Object.keys(groupedExercises) as Category[]

  return (
    <div className="weekly-progress__modal-content">
      {/* Level-up notification */}
      {levelUpMessage && (
        <div className="workout-detail__level-up" role="status" aria-live="polite">
          {levelUpMessage}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <p className="workout-detail__loading" aria-live="polite">Loading exercises...</p>
      )}

      {/* Preview of newly selected category exercises */}
      {selectedCategory && !isLoading && categoryExercises.length > 0 && (
        <div className="workout-detail__category-group">
          <div className={`workout-detail__category-header workout-detail__category-header--${selectedCategory.toLowerCase()}`}>
            <span>{selectedCategory}</span>
            <span className="workout-detail__category-header-level">Level {currentLevels?.[selectedCategory] ?? 0}</span>
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
          No exercises found for {selectedCategory} at level {currentLevels?.[selectedCategory]}
        </p>
      )}

      {/* Existing exercises grouped by category */}
      {activeCategories.map(cat => (
        <div key={cat} className="workout-detail__category-group">
          <div className={`workout-detail__category-header workout-detail__category-header--${cat.toLowerCase()}`}>
            <span>{cat}</span>
            <span className="workout-detail__category-header-level">Level {currentLevels?.[cat] ?? 0}</span>
          </div>
          {getProgressionNote(cat) && (
            <p className="workout-detail__progression-note">{getProgressionNote(cat)}</p>
          )}
          <div className="weekly-progress__exercise-list">
            {groupedExercises[cat].map(({ exercise, index }) => (
              <WorkoutExerciseCard
                key={`${exercise.name}-${index}`}
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
          const hasExercises = addedCategories.includes(category)
          return (
            <div key={category} className="workout-detail__category-row">
              <button
                className={`workout-detail__category-item workout-detail__category-item--${category.toLowerCase()} ${selectedCategory === category ? 'workout-detail__category-item--active' : ''} ${hasExercises ? 'workout-detail__category-item--disabled' : ''}`}
                onClick={() => handleCategoryClick(category)}
                disabled={hasExercises}
                aria-label={`Add ${category} exercises at level ${currentLevels?.[category] ?? 0}`}
              >
                <span className="workout-detail__category-name">{category}</span>
                <span className="workout-detail__category-level">
                  Level {currentLevels?.[category] ?? 0}
                </span>
              </button>
              {hasExercises && (
                <button
                  className={`workout-detail__category-remove workout-detail__category-remove--${category.toLowerCase()}`}
                  onClick={() => handleRemoveCategory(category)}
                  aria-label={`Remove ${category} exercises from this workout`}
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
