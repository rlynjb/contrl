'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import type { Category, Exercise, ExerciseEntry, WorkoutSession } from '@/types'
import { CATEGORIES } from '@/types'
import type { LogSessionResult } from '@/hooks/useGameState'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { GlowCard } from '@/components/ui/GlowCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SetCheckbox } from '@/components/ui/SetCheckbox'
import exercises from '@/data/exercises.json'

const typedExercises = exercises as Exercise[]

const LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

type Phase = 'select' | 'log' | 'result'

export default function LogPage() {
  const searchParams = useSearchParams()
  const preselected = searchParams.get('category') as Category | null

  const { status, user, categoryDoneThisWeek, getGateForCategory, logSession } = useGameState()

  const [phase, setPhase] = useState<Phase>(preselected ? 'log' : 'select')
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(preselected)
  const [result, setResult] = useState<LogSessionResult | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading' || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-tron-muted text-sm font-mono">
        Loading...
      </div>
    )
  }

  const handleSelectCategory = (cat: Category) => {
    setSelectedCategory(cat)
    setPhase('log')
  }

  const handleSave = async (session: WorkoutSession) => {
    setSaving(true)
    const res = await logSession(session)
    setResult(res)
    setSaving(false)
    setPhase('result')
  }

  const handleLogAnother = () => {
    setSelectedCategory(null)
    setResult(null)
    setPhase('select')
  }

  if (phase === 'select') {
    return (
      <CategorySelector
        user={user}
        categoryDoneThisWeek={categoryDoneThisWeek}
        getGateForCategory={getGateForCategory}
        onSelect={handleSelectCategory}
      />
    )
  }

  if (phase === 'log' && selectedCategory) {
    return (
      <ExerciseForm
        category={selectedCategory}
        level={user.levels[selectedCategory]}
        saving={saving}
        onSave={handleSave}
        onBack={() => setPhase('select')}
      />
    )
  }

  if (phase === 'result' && result) {
    return (
      <SessionResult
        result={result}
        category={selectedCategory!}
        onLogAnother={handleLogAnother}
        onDone={() => setPhase('select')}
      />
    )
  }

  return null
}

// ── Category Selector ─────────────────────────────────────────

function CategorySelector({
  user,
  categoryDoneThisWeek,
  getGateForCategory,
  onSelect,
}: {
  user: { levels: Record<Category, number> }
  categoryDoneThisWeek: Record<Category, boolean>
  getGateForCategory: (cat: Category) => { consecutivePasses: number; status: string } | null
  onSelect: (cat: Category) => void
}) {
  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-lg font-bold tracking-wide text-tron-text">Log Workout</h1>
      <p className="text-xs text-tron-muted">Choose a category to log</p>

      <div className="space-y-3">
        {CATEGORIES.map(cat => {
          const done = categoryDoneThisWeek[cat]
          const level = user.levels[cat]
          const gate = getGateForCategory(cat)
          const passes = gate?.consecutivePasses ?? 0

          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              className="w-full text-left"
            >
              <GlowCard glow={cat} className="p-4 hover:bg-tron-surface-light transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CategoryBadge category={cat} />
                    <div>
                      <p className="text-sm font-semibold text-tron-text">
                        Level {level}
                        <span className="text-tron-muted font-normal ml-1.5 text-xs">
                          {LEVEL_NAMES[level] ?? ''}
                        </span>
                      </p>
                      <p className="text-[11px] text-tron-muted mt-0.5">
                        {passes}/3 clean sessions
                      </p>
                    </div>
                  </div>
                  {done && (
                    <span className="text-tron-success text-[10px] font-semibold">Done this week</span>
                  )}
                </div>
              </GlowCard>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Exercise Form ─────────────────────────────────────────────

function ExerciseForm({
  category,
  level,
  saving,
  onSave,
  onBack,
}: {
  category: Category
  level: number
  saving: boolean
  onSave: (session: WorkoutSession) => void
  onBack: () => void
}) {
  const levelExercises = useMemo(
    () => typedExercises.filter(e => e.category === category && e.level === level),
    [category, level]
  )

  // State: per-exercise set tracking
  const [exerciseState, setExerciseState] = useState(() =>
    levelExercises.map(ex => ({
      exerciseId: ex.id,
      checkedSets: Array(ex.targetSets).fill(false) as boolean[],
      actualReps: Array(ex.targetSets).fill(ex.targetReps) as number[],
      actualHoldSeconds: ex.isHold
        ? Array(ex.targetSets).fill(ex.targetHoldSeconds ?? 0) as number[]
        : undefined,
    }))
  )

  const [notes, setNotes] = useState('')

  const toggleSet = (exIdx: number, setIdx: number) => {
    setExerciseState(prev => {
      const next = [...prev]
      const ex = { ...next[exIdx] }
      ex.checkedSets = [...ex.checkedSets]
      ex.checkedSets[setIdx] = !ex.checkedSets[setIdx]
      next[exIdx] = ex
      return next
    })
  }

  const updateReps = (exIdx: number, setIdx: number, value: number) => {
    setExerciseState(prev => {
      const next = [...prev]
      const ex = { ...next[exIdx] }
      ex.actualReps = [...ex.actualReps]
      ex.actualReps[setIdx] = value
      next[exIdx] = ex
      return next
    })
  }

  const updateHold = (exIdx: number, setIdx: number, value: number) => {
    setExerciseState(prev => {
      const next = [...prev]
      const ex = { ...next[exIdx] }
      ex.actualHoldSeconds = [...(ex.actualHoldSeconds ?? [])]
      ex.actualHoldSeconds[setIdx] = value
      next[exIdx] = ex
      return next
    })
  }

  const handleSave = () => {
    const entries: ExerciseEntry[] = levelExercises.map((ex, i) => {
      const state = exerciseState[i]
      const checkedCount = state.checkedSets.filter(Boolean).length

      let hitTarget = true
      for (let s = 0; s < state.checkedSets.length; s++) {
        if (!state.checkedSets[s]) continue
        if (ex.isHold) {
          if ((state.actualHoldSeconds?.[s] ?? 0) < (ex.targetHoldSeconds ?? 0)) hitTarget = false
        } else {
          if (state.actualReps[s] < ex.targetReps) hitTarget = false
        }
      }
      if (checkedCount < ex.targetSets) hitTarget = false

      return {
        exerciseId: ex.id,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        actualSets: checkedCount,
        actualReps: state.actualReps,
        actualHoldSeconds: state.actualHoldSeconds,
        checkedSets: state.checkedSets,
        hitTarget,
      }
    })

    const session: WorkoutSession = {
      id: `${category}-${level}-${Date.now()}`,
      date: new Date().toISOString(),
      level,
      category,
      exercises: entries,
      ...(notes.trim() && { notes: notes.trim() }),
    }

    onSave(session)
  }

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-tron-muted hover:text-tron-text text-sm"
        >
          &larr;
        </button>
        <CategoryBadge category={category} />
        <span className="text-sm font-semibold text-tron-text">
          Level {level} {LEVEL_NAMES[level] ?? ''}
        </span>
      </div>

      <div className="space-y-4">
        {levelExercises.map((ex, exIdx) => {
          const state = exerciseState[exIdx]
          const isHold = ex.isHold

          return (
            <GlowCard key={ex.id} glow="none" className="p-4">
              <p className="text-sm font-semibold text-tron-text mb-1">{ex.name}</p>
              <p className="text-[11px] text-tron-muted mb-3">
                Target: {ex.targetSets}×{isHold ? `${ex.targetHoldSeconds}s` : ex.targetReps}
              </p>

              <div className="space-y-2">
                {Array.from({ length: ex.targetSets }).map((_, setIdx) => {
                  const checked = state.checkedSets[setIdx]
                  const actualValue = isHold
                    ? (state.actualHoldSeconds?.[setIdx] ?? 0)
                    : state.actualReps[setIdx]
                  const targetValue = isHold ? (ex.targetHoldSeconds ?? 0) : ex.targetReps
                  const met = actualValue >= targetValue

                  return (
                    <div key={setIdx} className="flex items-center gap-3">
                      <SetCheckbox
                        checked={checked}
                        met={met}
                        onChange={() => toggleSet(exIdx, setIdx)}
                      />
                      <span className="text-[11px] text-tron-muted font-mono w-8">
                        S{setIdx + 1}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={actualValue}
                        onChange={e => {
                          const v = Math.max(0, parseInt(e.target.value) || 0)
                          isHold ? updateHold(exIdx, setIdx, v) : updateReps(exIdx, setIdx, v)
                        }}
                        className="w-16 rounded border border-tron-border bg-tron-surface px-2 py-1 text-center text-sm text-tron-text font-mono focus:border-tron-primary focus:outline-none"
                      />
                      <span className="text-[11px] text-tron-muted">
                        / {targetValue}{isHold ? 's' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </GlowCard>
          )
        })}
      </div>

      {/* Notes */}
      <div>
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-tron-border bg-tron-surface px-3 py-2 text-sm text-tron-text placeholder:text-tron-muted/50 focus:border-tron-primary focus:outline-none resize-none"
        />
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl border border-tron-primary/30 bg-tron-primary-dim py-3.5 text-center text-sm font-semibold text-tron-primary transition-all hover:bg-tron-primary/20 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Session'}
      </button>
    </div>
  )
}

// ── Session Result ────────────────────────────────────────────

function SessionResult({
  result,
  category,
  onLogAnother,
  onDone,
}: {
  result: LogSessionResult
  category: Category
  onLogAnother: () => void
  onDone: () => void
}) {
  const { sessionResult, gateProgress: gate, leveledUp, newLevel } = result
  const pct = sessionResult.completionPct

  const message = pct === 100
    ? 'Perfect session! All targets met.'
    : pct >= 75
      ? 'Great effort! Almost there.'
      : pct >= 50
        ? 'Good work! Keep building.'
        : 'Every rep counts. Keep showing up.'

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold tracking-wider text-tron-primary">SESSION LOGGED</h1>
        <p className="text-sm text-tron-text">{message}</p>
      </div>

      {/* Overall completion */}
      <GlowCard glow={pct === 100 ? category : 'none'} className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-tron-muted">Overall Completion</span>
          <span className="text-sm font-bold font-mono text-tron-text">{pct}%</span>
        </div>
        <ProgressBar
          value={pct}
          color={pct === 100 ? 'emerald' : pct >= 75 ? 'cyan' : 'amber'}
        />
      </GlowCard>

      {/* Gate progress */}
      <GlowCard glow="none" className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-tron-muted">Gate Progress</span>
          <span className="text-sm font-mono text-tron-text">
            {gate.status === 'passed'
              ? 'Gate cleared!'
              : `${gate.consecutivePasses}/3 clean sessions`}
          </span>
        </div>
        {sessionResult.isClean && gate.status !== 'passed' && (
          <p className="text-[11px] text-tron-success mt-1">Clean session — keep this up!</p>
        )}
        {!sessionResult.isClean && (
          <p className="text-[11px] text-tron-muted mt-1">Counter resets on non-clean session</p>
        )}
      </GlowCard>

      {/* Per-exercise breakdown */}
      {sessionResult.exerciseResults.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-tron-muted uppercase tracking-wider">Exercise Breakdown</h2>
          {sessionResult.exerciseResults.map(er => {
            const totalSets = er.targetSets
            const doneSets = er.actualCheckedSets
            const setsPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0

            return (
              <div key={er.exerciseId} className="rounded-lg border border-tron-border bg-tron-surface p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-tron-text">{er.exerciseId}</span>
                  <span className={`text-[10px] font-mono ${er.met ? 'text-tron-success' : 'text-tron-muted'}`}>
                    {er.met ? 'Met' : `${doneSets}/${totalSets} sets`}
                  </span>
                </div>
                <ProgressBar
                  value={setsPct}
                  color={er.met ? 'emerald' : 'muted'}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Level up notification */}
      {leveledUp && newLevel && (
        <div className="rounded-xl border border-tron-primary/40 bg-tron-primary-dim p-4 text-center animate-glow-burst">
          <p className="text-lg font-bold text-tron-primary tracking-wider">LEVEL UP!</p>
          <p className="text-sm text-tron-text mt-1">
            {category.charAt(0).toUpperCase() + category.slice(1)} → Level {newLevel}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onLogAnother}
          className="flex-1 rounded-xl border border-tron-border bg-tron-surface py-3 text-center text-sm font-semibold text-tron-text transition-all hover:bg-tron-surface-light"
        >
          Log Another
        </button>
        <button
          onClick={onDone}
          className="flex-1 rounded-xl border border-tron-primary/30 bg-tron-primary-dim py-3 text-center text-sm font-semibold text-tron-primary transition-all hover:bg-tron-primary/20"
        >
          Done
        </button>
      </div>
    </div>
  )
}
