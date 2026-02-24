'use client'

import { useState, useMemo } from 'react'
import type { CurrentUserLevels, WorkoutLevel, BaseExercise, BaseExerciseSet, ProgressionNotes } from '@/api'
import './SkillTree.css'
import '../ui/exercise-card.css'

const CATS: Record<string, { label: string; icon: string; color: string; bg: string; border: string; glow: string }> = {
  Push:  { label: "PUSH",  icon: "\u2197", color: "#F97316", bg: "#F9731610", border: "#F9731628", glow: "0 0 24px #F9731635" },
  Pull:  { label: "PULL",  icon: "\u2199", color: "#06B6D4", bg: "#06B6D410", border: "#06B6D428", glow: "0 0 24px #06B6D435" },
  Squat: { label: "SQUAT", icon: "\u2193", color: "#D946EF", bg: "#D946EF10", border: "#D946EF28", glow: "0 0 24px #D946EF35" },
}

const LEVEL_MAP: Record<string, { lv: number; name: string }> = {
  beginner:     { lv: 1, name: "Beginner" },
  novice:       { lv: 2, name: "Novice" },
  intermediate: { lv: 3, name: "Intermediate" },
  advanced:     { lv: 4, name: "Advanced" },
  expert:       { lv: 5, name: "Expert" },
}

const LEVEL_ORDER = ["beginner", "novice", "intermediate", "advanced", "expert"]

interface Skill {
  id: string
  cat: string
  lv: number
  name: string
  sets: string
  exercise: BaseExercise
  done: boolean
  open: boolean
}

interface SkillTreeProps {
  currentLevels: CurrentUserLevels | null
  workoutLevels: Record<string, WorkoutLevel>
  todayExercises?: BaseExercise[]
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onExerciseChange?: (exercise: BaseExercise) => void
}

// Convert API workout levels to flat skill list, merging with today's tracked data
function buildSkills(
  workoutLevels: Record<string, WorkoutLevel>,
  currentLevels: CurrentUserLevels | null,
  todayExercises?: BaseExercise[]
): Skill[] {
  const skills: Skill[] = []
  const trackedByName = new Map(
    (todayExercises || []).map(e => [e.name, e])
  )

  for (const levelKey of LEVEL_ORDER) {
    const level = workoutLevels[levelKey]
    if (!level) continue
    const lvInfo = LEVEL_MAP[levelKey]

    for (const [category, exercises] of Object.entries(level.exercises)) {
      const userLevel = currentLevels?.[category as keyof CurrentUserLevels] ?? 1
      const isAtOrBelowLevel = lvInfo.lv <= userLevel

      for (const exercise of exercises as BaseExercise[]) {
        const tracked = trackedByName.get(exercise.name)
        const effective = tracked || exercise
        const setsStr = effective.sets
          .map(s => s.duration ? `${s.duration}s` : String(s.reps || 0))
          .join(', ')
        const setCount = effective.sets.length

        skills.push({
          id: `${levelKey}-${exercise.name.toLowerCase().replace(/\s+/g, '-')}`,
          cat: category,
          lv: lvInfo.lv,
          name: exercise.name,
          sets: `${setCount}\u00d7${setsStr.split(', ')[0] || ''}`,
          exercise: effective,
          done: lvInfo.lv < userLevel,
          open: isAtOrBelowLevel,
        })
      }
    }
  }

  return skills
}

// ── Progress Ring ──
function ProgressRing({ done, total, color, size = 34 }: { done: number; total: number; color: string; size?: number }) {
  const s = 2.5, r = (size - s) / 2, c = 2 * Math.PI * r
  return (
    <svg className="progress-ring" width={size} height={size}>
      <circle className="progress-ring__track" cx={size/2} cy={size/2} r={r} fill="none" stroke="#141420" strokeWidth={s} />
      <circle className="progress-ring__fill" cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
        strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done/total : 0))}
        strokeLinecap="round" />
    </svg>
  )
}

// ── Level Marker ──
function LevelMarker({ lv, filled, color }: { lv: number; filled: boolean; color: string }) {
  return (
    <div
      className={`level-marker${filled ? ' level-marker--filled' : ''}`}
      style={filled ? {
        background: color,
        borderColor: color,
        boxShadow: `0 0 12px ${color}40`,
      } : undefined}
    >{lv}</div>
  )
}

// ── Helpers ──
const formatSets = (sets: BaseExerciseSet[]): string[] =>
  sets.map(set => 'reps' in set && set.reps ? String(set.reps) : `${set.duration}s`)

const parseSets = (values: string[]): BaseExerciseSet[] =>
  values.map(val => {
    if (val.endsWith('s')) {
      return { duration: parseInt(val) || 0 }
    }
    return { reps: parseInt(val) || 0 }
  })

// ── Skill Card ──
function SkillCard({ skill, cat, isOpen, onTap, onExerciseChange }: {
  skill: Skill
  cat: typeof CATS[string]
  isOpen: boolean
  onTap: () => void
  onExerciseChange?: (exercise: BaseExercise) => void
}) {
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

// ── Main SkillTree ──
export default function SkillTree({ currentLevels, workoutLevels, todayExercises, saveStatus = 'idle', onExerciseChange }: SkillTreeProps) {
  const [tab, setTab] = useState<string>("Push")
  const [openId, setOpenId] = useState<string | null>(null)
  const [collapsedLevels, setCollapsedLevels] = useState<Record<number, boolean>>({})

  const skills = useMemo(() => buildSkills(workoutLevels, currentLevels, todayExercises), [workoutLevels, currentLevels, todayExercises])

  const cat = CATS[tab]
  const catSkills = skills.filter(s => s.cat === tab)
  const catDone = catSkills.filter(s => s.done).length
  const catTotal = catSkills.length
  const allDone = skills.filter(s => s.done).length
  const allTotal = skills.length

  const toggleLevel = (lv: number) => {
    setCollapsedLevels(prev => ({ ...prev, [lv]: !prev[lv] }))
    setOpenId(null)
  }

  const getNote = (levelKey: string, category: string): string | undefined => {
    return workoutLevels[levelKey]?.progressionNotes?.[category as keyof ProgressionNotes]
  }

  return (
    <div className="skill-tree">
      <div className="skill-tree__header">
        <div className="skill-tree__header-bar">
          <div className="skill-tree__levels">
            {Object.entries(CATS).map(([key, c]) => {
              const lv = currentLevels?.[key as keyof CurrentUserLevels] ?? 1
              return (
                <div key={key} className="skill-tree__level-badge" style={{ color: c.color, borderColor: c.color + "30" }}>
                  <span className="skill-tree__level-badge-label">{c.label}</span>
                  <span className="skill-tree__level-badge-value" style={{ color: c.color }}>{lv}</span>
                </div>
              )
            })}
          </div>
          <div className="skill-tree__header-actions">
            <div className="skill-tree__total-ring">
              <ProgressRing done={allDone} total={allTotal} color="#888" size={36} />
              <span className="skill-tree__total-pct">
                {allTotal ? Math.round((allDone/allTotal)*100) : 0}%
              </span>
            </div>
          </div>
        </div>

        <div className="skill-tree__tabs">
          {Object.entries(CATS).map(([key, c]) => {
            const active = key === tab
            const d = skills.filter(s => s.cat === key && s.done).length
            const t = skills.filter(s => s.cat === key).length
            return (
              <button
                key={key}
                className={`skill-tree__tab${active ? ' skill-tree__tab--active' : ''}`}
                onClick={() => { setTab(key); setOpenId(null) }}
                style={active ? { borderColor: c.color + "40", background: c.bg } : undefined}
              >
                <span className="skill-tree__tab-icon">{c.icon}</span>
                <span className="skill-tree__tab-label" style={{ color: active ? c.color : undefined }}>{c.label}</span>
                <span className="skill-tree__tab-count" style={{ color: active ? c.color + "80" : undefined }}>{d}/{t}</span>
              </button>
            )
          })}
        </div>
      </div>

      {saveStatus !== 'idle' && (
        <div className={`skill-tree__save-status skill-tree__save-status--${saveStatus}`} role="status" aria-live="polite">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && 'Failed to save'}
        </div>
      )}

      <div className="skill-tree__cat-progress">
        <div className="skill-tree__cat-progress-header">
          <span className="skill-tree__cat-progress-label" style={{ color: cat.color }}>{cat.label} PROGRESS</span>
          <span className="skill-tree__cat-progress-count">{catDone}/{catTotal}</span>
        </div>
        <div className="skill-tree__cat-progress-track">
          <div
            className="skill-tree__cat-progress-fill"
            style={{
              width: `${catTotal ? (catDone/catTotal)*100 : 0}%`,
              background: `linear-gradient(90deg, ${cat.color}, ${cat.color}aa)`,
            }}
          />
        </div>
      </div>

      <div className="skill-tree__timeline">
        <div
          className="skill-tree__timeline-line"
          style={{ background: `linear-gradient(180deg, ${cat.color}25, ${cat.color}04)` }}
        />

        {LEVEL_ORDER.map(levelKey => {
          const lvInfo = LEVEL_MAP[levelKey]
          const lvSkills = catSkills.filter(s => s.lv === lvInfo.lv)
          if (!lvSkills.length) return null

          const lvDone = lvSkills.filter(s => s.done).length
          const lvTotal = lvSkills.length
          const allLvDone = lvDone === lvTotal
          const anyDone = lvDone > 0
          const anyOpen = lvSkills.some(s => s.open)
          const isCollapsed = collapsedLevels[lvInfo.lv]
          const note = getNote(levelKey, tab)

          return (
            <div key={lvInfo.lv} className="level-group">
              <LevelMarker lv={lvInfo.lv} filled={anyDone} color={cat.color} />

              <div
                className={`level-group__header${isCollapsed ? ' level-group__header--collapsed' : ''}`}
                onClick={() => toggleLevel(lvInfo.lv)}
              >
                <div>
                  <span
                    className="level-group__label"
                    style={{ color: anyDone ? cat.color : anyOpen ? cat.color + "60" : "#222234" }}
                  >LEVEL {lvInfo.lv}</span>
                  <span className="level-group__name">{lvInfo.name}</span>
                  {allLvDone && <span className="level-group__clear" style={{ color: cat.color }}>&check; CLEAR</span>}
                </div>
                <div className="level-group__stats">
                  <span
                    className="level-group__count"
                    style={{ color: anyDone ? cat.color + "80" : "#222234" }}
                  >{lvDone}/{lvTotal}</span>
                  <svg
                    className={`level-group__chevron${isCollapsed ? ' level-group__chevron--collapsed' : ''}`}
                    width="14" height="14" viewBox="0 0 14 14"
                  >
                    <path d="M4 5l3 3 3-3" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {!isCollapsed && (
                <div className="level-group__content">
                  {note && (
                    <div
                      className="level-group__note"
                      style={{ borderLeftColor: cat.color + "20" }}
                    >{note}</div>
                  )}
                  {lvSkills.map(skill => (
                    <SkillCard key={skill.id} skill={skill} cat={cat}
                      isOpen={openId === skill.id}
                      onTap={() => setOpenId(openId === skill.id ? null : skill.id)}
                      onExerciseChange={onExerciseChange} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="skill-tree__mastery">
          <div className="skill-tree__mastery-icon">&starf;</div>
          <span className="skill-tree__mastery-label">MASTERY</span>
        </div>
      </div>
    </div>
  )
}
