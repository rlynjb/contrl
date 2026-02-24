'use client'

import { useState } from 'react'
import type { BaseExercise, BaseExerciseSet } from '@/api'
import { formatSets, parseSets } from '@/lib/exercise-utils'
import type { Skill, CatInfo } from './types'

interface SkillCardProps {
  skill: Skill
  cat: CatInfo
  isOpen: boolean
  onTap: () => void
  onExerciseChange?: (exercise: BaseExercise) => void
}

export default function SkillCard({ skill, cat, isOpen, onTap, onExerciseChange }: SkillCardProps) {
  const locked = !skill.open
  const [setValues, setSetValues] = useState<string[]>(() => formatSets(skill.exercise.sets))
  const [setCompleted, setSetCompleted] = useState<boolean[]>(
    () => skill.exercise.completedSets || skill.exercise.sets.map(() => false)
  )
  const [tempoValue, setTempoValue] = useState(() => skill.exercise.tempo || '')
  const [restValue, setRestValue] = useState(() => skill.exercise.rest !== undefined ? `${skill.exercise.rest}s` : '')
  const [targetValues] = useState<string[]>(() => formatSets(skill.exercise.sets))

  const buildExercise = (
    sets: BaseExerciseSet[],
    completed: boolean[],
    overrides?: Partial<Pick<BaseExercise, 'tempo' | 'rest'>>
  ): BaseExercise => {
    const allDone = completed.every(Boolean) && completed.length > 0
    return {
      ...skill.exercise,
      sets,
      tempo: (overrides?.tempo ?? tempoValue) || undefined,
      rest: overrides?.rest ?? (restValue ? parseInt(restValue) : undefined),
      completed: allDone,
      completedSets: completed,
    }
  }

  const toggleSet = (index: number) => {
    const newCompleted = setCompleted.map((v, i) => i === index ? !v : v)
    setSetCompleted(newCompleted)
    onExerciseChange?.(buildExercise(parseSets(setValues), newCompleted))
  }

  const updateSet = (index: number, value: string) => {
    setSetValues(prev => prev.map((v, i) => i === index ? value : v))
  }

  const emitChange = () => {
    onExerciseChange?.(buildExercise(parseSets(setValues), setCompleted))
  }

  const completedCount = setCompleted.filter(Boolean).length

  return (
    <div
      className={`skill-card${locked ? ' skill-card--locked' : ''}${isOpen ? ' skill-card--open' : ''}`}
      onClick={() => !locked && onTap()}
      style={!locked ? {
        borderColor: isOpen ? cat.color + "50" : undefined,
        background: isOpen ? `linear-gradient(160deg, ${cat.bg}, #0c0c18 70%)` : undefined,
        boxShadow: isOpen ? cat.glow : undefined,
      } : undefined}
    >
      <div className="skill-card__header">
        <div
          className="skill-card__dot"
          style={{
            background: skill.done ? cat.color : undefined,
            borderColor: skill.done ? cat.color : skill.open ? cat.color + "50" : undefined,
            boxShadow: skill.done ? `0 0 6px ${cat.color}50` : undefined,
          }}
        />
        <div className="skill-card__name-wrap">
          <div className="skill-card__name">{skill.name}</div>
        </div>
        <span className="skill-card__sets">{skill.sets}</span>
        {locked && <span className="skill-card__lock">&#128274;</span>}
        {skill.done && (
          <div className="skill-card__check" style={{ background: cat.color, boxShadow: `0 2px 6px ${cat.color}40` }}>
            &check;
          </div>
        )}
        {!locked && !skill.done && (
          <svg className={`skill-card__chevron${isOpen ? ' skill-card__chevron--open' : ''}`} width="16" height="16" viewBox="0 0 16 16">
            <path d="M4 6l4 4 4-4" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {isOpen && (
        <div className="skill-card__details" onClick={e => e.stopPropagation()}>
          <div className="skill-card__divider" style={{ background: `linear-gradient(90deg, ${cat.color}18, transparent)` }} />
          <div className="exercise-card__sets-info">
            <div className="exercise-card__sets-row">
              <span className="exercise-card__sets-label">
                {completedCount}/{setValues.length} Sets
              </span>
              <div className="exercise-card__sets-inputs">
                {setValues.map((value, index) => (
                  <div key={index} className="exercise-card__set-group">
                    <div className="exercise-card__set-row">
                      <button
                        type="button"
                        className={`exercise-card__set-check ${setCompleted[index] ? 'exercise-card__set-check--done' : ''}`}
                        onClick={() => toggleSet(index)}
                        aria-label={`Set ${index + 1}: ${setCompleted[index] ? 'Mark incomplete' : 'Mark complete'}`}
                      >
                        {setCompleted[index] ? '\u2713' : ''}
                      </button>
                      <input
                        className="exercise-card__set-input"
                        value={value}
                        onChange={(e) => updateSet(index, e.target.value)}
                        onBlur={emitChange}
                        placeholder="..."
                        aria-label={`Set ${index + 1} reps`}
                        inputMode="numeric"
                      />
                    </div>
                    <span className="exercise-card__set-target">
                      Goal: {targetValues[index]}
                    </span>
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
                onBlur={emitChange}
                placeholder="..."
                aria-label="Tempo"
              />
              <span className="exercise-card__meta-label exercise-card__meta-label--spaced">Rest:</span>
              <input
                className="exercise-card__meta-input"
                value={restValue}
                onChange={(e) => setRestValue(e.target.value)}
                onBlur={emitChange}
                placeholder="..."
                aria-label="Rest period"
              />
            </div>
          </div>
          {skill.done && (
            <div className="skill-card__completed" style={{ color: cat.color }}>
              &loz; COMPLETED &loz;
            </div>
          )}
        </div>
      )}
    </div>
  )
}
