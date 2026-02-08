'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { exerciseApi, type BaseExercise } from '@/api'
import './exercise-card.css'

interface WorkoutExerciseCardProps {
  exercise: BaseExercise
  className?: string
  onExerciseChange?: (exercise: BaseExercise) => void
}

export default function WorkoutExerciseCard({
  exercise,
  className = '',
  onExerciseChange
}: WorkoutExerciseCardProps) {
  // Match exercise-card format: "5" for reps, "30s" for duration
  const [setValues, setSetValues] = useState<string[]>(
    exercise.sets.map(set => 'reps' in set && set.reps ? String(set.reps) : `${set.duration}s`)
  )
  const [setCompleted, setSetCompleted] = useState<boolean[]>(
    exercise.sets.map(() => false)
  )
  const [tempoValue, setTempoValue] = useState(exercise.tempo || '')
  const [restValue, setRestValue] = useState(exercise.rest !== undefined ? `${exercise.rest}s` : '')
  const [notesValue, setNotesValue] = useState(exercise.notes || '')
  const [levelInfo, setLevelInfo] = useState<{ level: number; name: string; category: string } | null>(null)

  // Fetch level info on mount
  useEffect(() => {
    const fetchLevelInfo = async () => {
      if (exercise.name) {
        const info = await exerciseApi.getExerciseLevel(exercise.name)
        setLevelInfo(info)
      }
    }
    fetchLevelInfo()
  }, [exercise.name])

  const toggleSet = (index: number) => {
    setSetCompleted(prev => prev.map((v, i) => i === index ? !v : v))
  }

  const updateSet = (index: number, value: string) => {
    setSetValues(prev => prev.map((v, i) => i === index ? value : v))
  }

  const emitChange = () => {
    if (onExerciseChange) {
      // Convert string values back to BaseExerciseSet format
      const updatedSets = setValues.map(val => {
        if (val.endsWith('s')) {
          return { duration: parseInt(val) || 0 }
        }
        return { reps: parseInt(val) || 0 }
      })
      onExerciseChange({
        ...exercise,
        sets: updatedSets,
        tempo: tempoValue || undefined,
        rest: restValue ? parseInt(restValue) : undefined,
        notes: notesValue || undefined
      })
    }
  }

  const completedCount = setCompleted.filter(Boolean).length
  const allCompleted = completedCount === setValues.length && setValues.length > 0

  const categoryClass = levelInfo?.category ? `exercise-card--${levelInfo.category.toLowerCase()}` : ''

  return (
    <div className={`exercise-card ${categoryClass} ${allCompleted ? 'exercise-card--completed' : ''} ${className}`}>
      {levelInfo && (
        <span className="exercise-card__level">
          Level {levelInfo.level} · {levelInfo.name} · {levelInfo.category}
        </span>
      )}

      <div className="exercise-card__name-wrapper">
        <span className="exercise-card__name-display">{exercise.name}</span>
      </div>

      {exercise.equipment && (
        <div className="exercise-card__equipment-wrapper">
          <Badge variant="outline" className="exercise-card__equipment-badge-inner">
            {exercise.equipment}
          </Badge>
        </div>
      )}

      <div className="exercise-card__sets-info">
        <div className="exercise-card__sets-row">
          <span className="exercise-card__sets-label">
            {completedCount}/{setValues.length} Sets
          </span>
          <div className="exercise-card__sets-inputs">
            {setValues.map((value, index) => (
              <div key={index} className="exercise-card__set-group">
                <button
                  type="button"
                  className={`exercise-card__set-check ${setCompleted[index] ? 'exercise-card__set-check--done' : ''}`}
                  onClick={() => toggleSet(index)}
                  aria-label={setCompleted[index] ? 'Mark incomplete' : 'Mark complete'}
                >
                  {setCompleted[index] ? '✓' : ''}
                </button>
                <input
                  className="exercise-card__set-input"
                  value={value}
                  onChange={(e) => updateSet(index, e.target.value)}
                  onBlur={emitChange}
                  placeholder="..."
                />
              </div>
            ))}
          </div>
        </div>

        <div className="exercise-card__exercise-meta">
          <span className="exercise-card__meta-label">Tempo:</span>
          <input
            className="exercise-card__meta-input"
            value={tempoValue}
            onChange={(e) => setTempoValue(e.target.value)}
            placeholder="..."
          />
          <span className="exercise-card__meta-label exercise-card__meta-label--spaced">Rest:</span>
          <input
            className="exercise-card__meta-input"
            value={restValue}
            onChange={(e) => setRestValue(e.target.value)}
            placeholder="..."
          />
        </div>
      </div>

      <textarea
        className="exercise-card__notes"
        value={notesValue}
        onChange={(e) => setNotesValue(e.target.value)}
        placeholder="Add notes..."
      />
    </div>
  )
}
