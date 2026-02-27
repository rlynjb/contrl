'use client'

import { useState, useMemo } from 'react'
import type { CurrentUserLevels, WorkoutLevel, BaseExercise, ProgressionNotes, ExercisesByCategory } from '@/api'
import { CATEGORY_COLORS } from '@/lib/constants'
import ProgressRing from './ProgressRing'
import LevelMarker from './LevelMarker'
import SkillCard from './SkillCard'
import type { Skill, CatInfo, ExerciseHistoryEntry } from './types'
import './SkillTree.css'
import '../ui/exercise-card.css'

const CATS: Record<string, CatInfo> = Object.fromEntries(
  Object.entries(CATEGORY_COLORS).map(([key, val]) => [key, {
    ...val,
    label: key.toUpperCase(),
    icon: key === 'Push' ? "\u2197" : key === 'Pull' ? "\u2199" : "\u2193",
  }])
)

const LEVEL_MAP: Record<string, { lv: number; name: string }> = {
  beginner:     { lv: 1, name: "Beginner" },
  novice:       { lv: 2, name: "Novice" },
  intermediate: { lv: 3, name: "Intermediate" },
  advanced:     { lv: 4, name: "Advanced" },
  expert:       { lv: 5, name: "Expert" },
}

const LEVEL_ORDER = ["beginner", "novice", "intermediate", "advanced", "expert"]

interface SkillTreeProps {
  currentLevels: CurrentUserLevels | null
  workoutLevels: Record<string, WorkoutLevel>
  todayExercises?: BaseExercise[]
  exerciseHistory?: Map<string, ExerciseHistoryEntry[]>
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onExerciseChange?: (exercise: BaseExercise) => void
  onLevelUp?: (category: string, level: number) => void
}

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

      for (let ei = 0; ei < (exercises as BaseExercise[]).length; ei++) {
        const exercise = (exercises as BaseExercise[])[ei]
        const tracked = trackedByName.get(exercise.name)
        const effective = tracked || exercise
        const setsStr = effective.sets
          .map(s => s.duration ? `${s.duration}s` : String(s.reps || 0))
          .join(', ')
        const setCount = effective.sets.length

        skills.push({
          id: `${levelKey}-${category.toLowerCase()}-${ei}-${exercise.name.toLowerCase().replace(/\s+/g, '-')}`,
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

export default function SkillTree({ currentLevels, workoutLevels, todayExercises, exerciseHistory, saveStatus = 'idle', onExerciseChange, onLevelUp }: SkillTreeProps) {
  const [tab, setTab] = useState<string>("Push")
  const [openId, setOpenId] = useState<string | null>(null)
  const [collapsedLevels, setCollapsedLevels] = useState<Record<number, boolean>>({})

  const skills = useMemo(() => buildSkills(workoutLevels, currentLevels, todayExercises), [workoutLevels, currentLevels, todayExercises])

  const levelUpInfo = useMemo(() => {
    const result: Record<string, { eligible: boolean; nextLevel: number; nextName: string }> = {}
    for (const c of Object.keys(CATS)) {
      const userLv = currentLevels?.[c as keyof CurrentUserLevels] ?? 1
      const levelKey = LEVEL_ORDER[userLv - 1]
      const nextLevelKey = LEVEL_ORDER[userLv]
      const nextName = nextLevelKey ? LEVEL_MAP[nextLevelKey].name : ''

      if (!levelKey || userLv >= 5) {
        result[c] = { eligible: false, nextLevel: userLv + 1, nextName }
        continue
      }

      const levelExercises = workoutLevels[levelKey]?.exercises?.[c as keyof ExercisesByCategory]
      if (!levelExercises?.length) {
        result[c] = { eligible: false, nextLevel: userLv + 1, nextName }
        continue
      }

      const eligible = levelExercises.every(target => {
        const tracked = todayExercises?.find(e => e.name === target.name)
        if (!tracked) return false
        return target.sets.every((targetSet, i) => {
          const actual = tracked.sets[i]
          if (!actual) return false
          if (targetSet.reps) return (actual.reps || 0) >= targetSet.reps
          if (targetSet.duration) return (actual.duration || 0) >= targetSet.duration
          return false
        })
      })

      result[c] = { eligible, nextLevel: userLv + 1, nextName }
    }
    return result
  }, [currentLevels, workoutLevels, todayExercises])

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
            const lv = currentLevels?.[key as keyof CurrentUserLevels] ?? 1
            return (
              <button
                key={key}
                className={`skill-tree__tab${active ? ' skill-tree__tab--active' : ''}`}
                onClick={() => { setTab(key); setOpenId(null) }}
                style={active ? { borderColor: c.color + "40", background: c.bg } : undefined}
              >
                <span className="skill-tree__tab-icon">{c.icon}</span>
                <span className="skill-tree__tab-label" style={{ color: active ? c.color : undefined }}>{c.label}</span>
                <span className="skill-tree__level-badge-value" style={{ color: active ? c.color : undefined }}>lvl {lv}</span>
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
                      onExerciseChange={onExerciseChange}
                      history={exerciseHistory?.get(skill.name)} />
                  ))}
                  {levelUpInfo[tab]?.eligible && lvInfo.lv === (currentLevels?.[tab as keyof CurrentUserLevels] ?? 1) && (
                    <button
                      className="level-group__levelup"
                      onClick={(e) => { e.stopPropagation(); onLevelUp?.(tab, levelUpInfo[tab].nextLevel) }}
                      style={{ borderColor: cat.color + '40', color: cat.color }}
                    >
                      Move to Level {levelUpInfo[tab].nextLevel} &mdash; {levelUpInfo[tab].nextName}
                    </button>
                  )}
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
