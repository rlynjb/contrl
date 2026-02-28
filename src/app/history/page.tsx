'use client'

import { useMemo, useState } from 'react'
import { useGameState } from '@/hooks/useGameState'
import type { Category, WorkoutSession } from '@/types'
import { getWeekStart } from '@/lib/week-progress'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { GlowCard } from '@/components/ui/GlowCard'
import { ProgressBar } from '@/components/ui/ProgressBar'

export default function HistoryPage() {
  const { status, sessions, streak } = useGameState()

  const weekGroups = useMemo(() => {
    if (!sessions.length) return []

    const byWeek = new Map<string, WorkoutSession[]>()
    for (const s of sessions) {
      const ws = getWeekStart(new Date(s.date))
      if (!byWeek.has(ws)) byWeek.set(ws, [])
      byWeek.get(ws)!.push(s)
    }

    return Array.from(byWeek.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekStart, weekSessions]) => ({
        weekStart,
        sessions: weekSessions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        categories: new Set(weekSessions.map(s => s.category)),
      }))
  }, [sessions])

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-tron-muted text-sm font-mono">
        Loading...
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide text-tron-text">History</h1>
        {streak > 0 && (
          <span className="text-xs text-tron-warning font-mono">{streak} week streak</span>
        )}
      </div>

      {weekGroups.length === 0 ? (
        <div className="text-center text-sm text-tron-muted py-12">
          No sessions logged yet. Start training!
        </div>
      ) : (
        <div className="space-y-6">
          {weekGroups.map(group => (
            <WeekGroup key={group.weekStart} {...group} />
          ))}
        </div>
      )}
    </div>
  )
}

function WeekGroup({
  weekStart,
  sessions,
  categories,
}: {
  weekStart: string
  sessions: WorkoutSession[]
  categories: Set<Category>
}) {
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }, [weekStart])

  const weekStartFormatted = new Date(weekStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  const allCats: Category[] = ['push', 'pull', 'squat']

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-tron-text">
            {weekStartFormatted} — {weekEnd}
          </span>
        </div>
        <div className="flex gap-1.5">
          {allCats.map(cat => (
            <div
              key={cat}
              className={`w-2.5 h-2.5 rounded-full ${
                categories.has(cat)
                  ? cat === 'push'
                    ? 'bg-cat-push'
                    : cat === 'pull'
                      ? 'bg-cat-pull'
                      : 'bg-cat-squat'
                  : 'bg-tron-border'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sessions.map(session => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: WorkoutSession }) {
  const [expanded, setExpanded] = useState(false)

  const completionPct = useMemo(() => {
    if (!session.exercises.length) return 0
    const met = session.exercises.filter(e => e.hitTarget).length
    return Math.round((met / session.exercises.length) * 100)
  }, [session.exercises])

  const dateFormatted = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <GlowCard glow="none" className="p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CategoryBadge category={session.category} />
            <div>
              <p className="text-xs text-tron-text">{dateFormatted}</p>
              <p className="text-[10px] text-tron-muted">L{session.level}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono ${
              completionPct === 100 ? 'text-tron-success' : 'text-tron-muted'
            }`}>
              {completionPct}%
            </span>
            <svg
              className={`w-3 h-3 text-tron-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12"
            >
              <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-tron-border space-y-2">
          {session.exercises.map(entry => (
            <div key={entry.exerciseId} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-tron-text">{entry.exerciseId}</span>
                <span className={`text-[10px] font-mono ${entry.hitTarget ? 'text-tron-success' : 'text-tron-muted'}`}>
                  {entry.hitTarget ? 'Met' : `${entry.actualSets}/${entry.targetSets}`}
                </span>
              </div>
              <ProgressBar
                value={entry.targetSets > 0 ? Math.round((entry.actualSets / entry.targetSets) * 100) : 0}
                color={entry.hitTarget ? 'emerald' : 'muted'}
              />
            </div>
          ))}
          {session.notes && (
            <p className="text-[10px] text-tron-muted italic pt-1">{session.notes}</p>
          )}
        </div>
      )}
    </GlowCard>
  )
}
