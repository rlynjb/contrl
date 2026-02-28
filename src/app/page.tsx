'use client'

import Link from 'next/link'
import { useGameState } from '@/hooks/useGameState'
import { CATEGORIES } from '@/types'
import type { Category } from '@/types'
import { GlowCard } from '@/components/ui/GlowCard'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'

const LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

const CATEGORY_GLOWS: Record<Category, 'push' | 'pull' | 'squat'> = {
  push: 'push',
  pull: 'pull',
  squat: 'squat',
}

export default function HomePage() {
  const {
    status,
    user,
    categoryDoneThisWeek,
    weekComplete,
    completedThisWeek,
    streak,
    getGateForCategory,
  } = useGameState()

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-tron-muted text-sm font-mono">
        Loading...
      </div>
    )
  }

  if (status === 'error' || !user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-tron-muted text-sm font-mono">
        <p>Failed to load data</p>
      </div>
    )
  }

  const firstIncomplete = CATEGORIES.find(c => !categoryDoneThisWeek[c])

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header: streak + week progress */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide text-tron-text">This Week</h1>
          <p className="text-xs text-tron-muted mt-0.5">
            {completedThisWeek}/3 sessions completed
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tron-warning-dim border border-tron-warning/20">
            <span className="text-tron-warning text-sm font-bold">{streak}</span>
            <span className="text-tron-warning/70 text-[10px] font-medium">week streak</span>
          </div>
        )}
      </div>

      {/* Overall week progress bar */}
      <ProgressBar
        value={Math.round((completedThisWeek / 3) * 100)}
        color={weekComplete ? 'emerald' : 'cyan'}
        label={weekComplete ? 'Week complete!' : `${completedThisWeek} of 3`}
      />

      {/* Category rows */}
      <div className="space-y-3">
        {CATEGORIES.map(cat => {
          const done = categoryDoneThisWeek[cat]
          const level = user.levels[cat]
          const gate = getGateForCategory(cat)
          const passes = gate?.consecutivePasses ?? 0

          return (
            <GlowCard key={cat} glow={done ? CATEGORY_GLOWS[cat] : 'none'} className="p-4">
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
                      {gate?.status === 'passed'
                        ? 'Gate cleared'
                        : `${passes}/3 clean sessions`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {done ? (
                    <span className="text-tron-success text-xs font-semibold">Done</span>
                  ) : (
                    <span className="text-tron-muted text-xs">Not yet</span>
                  )}
                </div>
              </div>
            </GlowCard>
          )
        })}
      </div>

      {/* Next up CTA */}
      {firstIncomplete && !weekComplete && (
        <Link
          href={`/log?category=${firstIncomplete}`}
          className="block w-full rounded-xl border border-tron-primary/30 bg-tron-primary-dim py-3.5 text-center text-sm font-semibold text-tron-primary transition-all hover:bg-tron-primary/20"
        >
          Log {firstIncomplete.charAt(0).toUpperCase() + firstIncomplete.slice(1)} Session
        </Link>
      )}

      {weekComplete && (
        <div className="rounded-xl border border-tron-success/30 bg-tron-success-dim py-3.5 text-center text-sm font-semibold text-tron-success">
          All sessions logged this week!
        </div>
      )}
    </div>
  )
}
