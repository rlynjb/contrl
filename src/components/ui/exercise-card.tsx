'use client'

import { useState, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { ExerciseService } from '@/lib/data-service/ExerciseService'
import type { BaseExercise } from '@/lib/data-service/ExerciseService/mocks/types'
import './exercise-card.css'

interface ExerciseCardProps {
  exercise: BaseExercise
  className?: string
  onExerciseChange?: (exercise: BaseExercise) => void
}

const EQUIPMENT_OPTIONS = ['Mini band', 'Pull-up bar', 'Dip bars', 'Rings', 'Dumbbells']

export default function ExerciseCard({ exercise, className = '', onExerciseChange }: ExerciseCardProps) {
  const [inputValue, setInputValue] = useState(exercise.name)
  const [displayExercise, setDisplayExercise] = useState<BaseExercise>(exercise)
  const [results, setResults] = useState<BaseExercise[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const equipmentRef = useRef<HTMLDivElement>(null)
  const hasTyped = useRef(false)
  const [setValues, setSetValues] = useState<string[]>(
    exercise.sets.map(set => 'reps' in set ? String(set.reps) : `${set.duration}s`)
  )
  const [tempoValue, setTempoValue] = useState(exercise.tempo || '')
  const [restValue, setRestValue] = useState(exercise.rest !== undefined ? `${exercise.rest}s` : '')
  const [notesValue, setNotesValue] = useState(exercise.notes || '')
  const [levelInfo, setLevelInfo] = useState<{ level: number, name: string, category: string } | null>(
    () => ExerciseService.getExerciseLevel(exercise.name)
  )

  // Sync level info when the displayed exercise changes
  useEffect(() => {
    setLevelInfo(displayExercise.name ? ExerciseService.getExerciseLevel(displayExercise.name) : null)
  }, [displayExercise.name])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
      if (equipmentRef.current && !equipmentRef.current.contains(e.target as Node)) {
        setShowEquipmentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search — only runs after the user has typed at least once
  useEffect(() => {
    if (!hasTyped.current) return

    if (!inputValue.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      const found = await ExerciseService.searchExercises(inputValue)
      setResults(found)
    }, 300)

    return () => clearTimeout(timer)
  }, [inputValue])

  const handleSelect = (selected: BaseExercise) => {
    setInputValue(selected.name)
    setDisplayExercise(selected)
    setSetValues(selected.sets.map(set => 'reps' in set ? String(set.reps) : `${set.duration}s`))
    setTempoValue(selected.tempo || '')
    setRestValue(selected.rest !== undefined ? `${selected.rest}s` : '')
    setNotesValue(selected.notes || '')
    setShowDropdown(false)
    onExerciseChange?.(selected)
  }

  const handleCreate = () => {
    const newExercise: BaseExercise = { name: inputValue.trim(), sets: [] }
    ExerciseService.addExercise(newExercise)
    setDisplayExercise(newExercise)
    setSetValues([])
    setTempoValue('')
    setRestValue('')
    setNotesValue('')
    setShowDropdown(false)
    onExerciseChange?.(newExercise)
  }

  const handleEquipmentChange = (value: string | undefined) => {
    const updated = { ...displayExercise, equipment: value }
    setDisplayExercise(updated)
    setShowEquipmentDropdown(false)
    onExerciseChange?.(updated)
  }

  const addSet = () => setSetValues(prev => [...prev, ''])

  const updateSet = (index: number, value: string) => {
    setSetValues(prev => prev.map((v, i) => i === index ? value : v))
  }

  const removeSet = (index: number) => {
    setSetValues(prev => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
    } else if (e.key === 'Enter' && showDropdown) {
      e.preventDefault()
      if (results.length === 1) {
        handleSelect(results[0])
      } else if (!hasExactMatch && inputValue.trim()) {
        handleCreate()
      }
    }
  }

  const hasExactMatch = results.some(
    r => r.name.toLowerCase() === inputValue.trim().toLowerCase()
  )
  const showCreate = inputValue.trim() && !hasExactMatch

  return (
    <div className={`exercise-card ${className}`}>
      {levelInfo && (
        <span className="exercise-card__level">Level {levelInfo.level} · {levelInfo.name} · {levelInfo.category}</span>
      )}

      <div className="exercise-card__name-wrapper" ref={containerRef}>
        <input
          className="exercise-card__name-input"
          value={inputValue}
          onChange={(e) => {
            hasTyped.current = true
            setInputValue(e.target.value)
            setResults([])
            setShowDropdown(!!e.target.value.trim())
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search or add exercise..."
        />
        {showDropdown && (
          <ul className="exercise-card__dropdown">
            {results.map((result, i) => (
              <li
                key={i}
                className="exercise-card__dropdown-item"
                onMouseDown={() => handleSelect(result)}
              >
                {result.name}
              </li>
            ))}
            {showCreate && (
              <li
                className="exercise-card__dropdown-item exercise-card__dropdown-item--create"
                onMouseDown={handleCreate}
              >
                + Create "{inputValue.trim()}"
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="exercise-card__equipment-wrapper" ref={equipmentRef}>
        <div
          className="exercise-card__equipment-trigger"
          onClick={() => setShowEquipmentDropdown(!showEquipmentDropdown)}
        >
          {displayExercise.equipment ? (
            <Badge variant="outline" className="exercise-card__equipment-badge-inner">
              {displayExercise.equipment}
            </Badge>
          ) : (
            <span className="exercise-card__equipment-placeholder">+ Equipment</span>
          )}
        </div>
        {showEquipmentDropdown && (
          <ul className="exercise-card__equipment-dropdown">
            <li
              className={`exercise-card__equipment-item ${!displayExercise.equipment ? 'exercise-card__equipment-item--active' : ''}`}
              onMouseDown={() => handleEquipmentChange(undefined)}
            >
              None
            </li>
            {EQUIPMENT_OPTIONS.map((option) => (
              <li
                key={option}
                className={`exercise-card__equipment-item ${displayExercise.equipment === option ? 'exercise-card__equipment-item--active' : ''}`}
                onMouseDown={() => handleEquipmentChange(option)}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="exercise-card__sets-info">
        <div className="exercise-card__sets-row">
          <span className="exercise-card__sets-label">{setValues.length} Sets</span>
          <div className="exercise-card__sets-inputs">
            {setValues.map((value, index) => (
              <input
                key={index}
                className="exercise-card__set-input"
                value={value}
                onChange={(e) => updateSet(index, e.target.value)}
                onBlur={() => { if (!value.trim() && setValues.length > 1) removeSet(index) }}
                placeholder="..."
              />
            ))}
            <button className="exercise-card__set-add" onClick={addSet}>+</button>
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
