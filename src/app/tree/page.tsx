'use client'

import { useState } from 'react'
import { useGameState } from '@/hooks/useGameState'
import { CATEGORIES } from '@/types'
import type { Category, GateProgress, Exercise } from '@/types'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { NodeBadge } from '@/components/ui/NodeBadge'
import { getNodeState } from '@/lib/progression'
import { createGateProgress } from '@/lib/gate-check'
import exercises from '@/data/exercises.json'

const LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

const typedExercises = exercises as Exercise[]
const MAX_LEVEL = 5

export default function TreePage() {
  const { status, user, gateProgress } = useGameState()
  const [expandedNode, setExpandedNode] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-tron-muted text-sm font-mono">
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-tron-muted text-sm font-mono">
        No data
      </div>
    )
  }

  const toggleNode = (key: string) => {
    setExpandedNode(prev => prev === key ? null : key)
  }

  // Levels rendered top-down: 5, 4, 3, 2, 1
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => MAX_LEVEL - i)

  return (
    <div className="px-4 py-6 space-y-5">
      <h1 className="text-lg font-bold tracking-wide text-tron-text">Skill Tree</h1>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map(cat => (
          <div key={cat} className="flex flex-col items-center gap-1">
            <CategoryBadge category={cat} />
            <span className="text-[10px] text-tron-muted font-mono">
              L{user.levels[cat]}
            </span>
          </div>
        ))}
      </div>

      {/* Tree grid: each row is a level, each column is a category */}
      <div className="space-y-0">
        {levels.map(level => (
          <div key={level} className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => {
              const nodeKey = `${cat}:${level}`
              const userLevel = user.levels[cat]
              const gate = gateProgress[nodeKey] ?? createGateProgress(cat, level, userLevel)
              const userLevelsMap = {
                push: cat === 'push' ? userLevel : 0,
                pull: cat === 'pull' ? userLevel : 0,
                squat: cat === 'squat' ? userLevel : 0,
              } as Record<Category, number>
              const nodeState = getNodeState(gate, userLevelsMap)
              const levelExercises = typedExercises.filter(
                e => e.category === cat && e.level === level
              )
              const hasExercises = levelExercises.length > 0

              return (
                <div key={nodeKey} className="flex flex-col items-center">
                  <button
                    onClick={() => hasExercises ? toggleNode(nodeKey) : undefined}
                    className={`flex flex-col items-center transition-transform ${
                      hasExercises ? 'active:scale-95' : ''
                    } ${expandedNode === nodeKey ? 'scale-110' : ''}`}
                    disabled={!hasExercises}
                  >
                    <NodeBadge
                      state={nodeState}
                      level={level}
                      consecutivePasses={gate.consecutivePasses}
                    />
                  </button>

                  {/* Connector line to next level below */}
                  {level > 1 && (
                    <div className={`w-px h-4 mt-0.5 ${
                      level <= userLevel
                        ? 'bg-tron-primary/25'
                        : 'bg-tron-border/30'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedNode && (
        <ExpandedDetail
          nodeKey={expandedNode}
          gateProgress={gateProgress}
          userLevels={user.levels}
          onClose={() => setExpandedNode(null)}
        />
      )}
    </div>
  )
}

function ExpandedDetail({
  nodeKey,
  gateProgress: gates,
  userLevels,
  onClose,
}: {
  nodeKey: string
  gateProgress: Record<string, GateProgress>
  userLevels: Record<Category, number>
  onClose: () => void
}) {
  const [cat, levelStr] = nodeKey.split(':') as [Category, string]
  const level = Number(levelStr)
  const gate = gates[nodeKey] ?? createGateProgress(cat, level, userLevels[cat])
  const levelExercises = typedExercises.filter(
    e => e.category === cat && e.level === level
  )
  const nodeState = getNodeState(gate, userLevels)

  const catBorder = cat === 'push'
    ? 'border-cat-push/30'
    : cat === 'pull'
      ? 'border-cat-pull/30'
      : 'border-cat-squat/30'

  return (
    <div className={`rounded-xl border bg-tron-surface p-4 ${catBorder}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CategoryBadge category={cat} />
          <span className="text-sm font-semibold text-tron-text">
            Level {level}
          </span>
          <span className="text-xs text-tron-muted">
            {LEVEL_NAMES[level]}
          </span>
        </div>
        <button onClick={onClose} className="text-tron-muted hover:text-tron-text p-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Gate progress indicator */}
      <div className="mb-3 py-2 px-3 rounded-lg bg-tron-surface-light">
        {nodeState === 'passed' ? (
          <span className="text-xs text-tron-success font-semibold">Gate cleared</span>
        ) : nodeState === 'locked' ? (
          <span className="text-xs text-tron-muted">Locked — complete previous level first</span>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-tron-text">Clean sessions</span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border transition-colors ${
                    i < gate.consecutivePasses
                      ? 'bg-tron-primary border-tron-primary'
                      : 'bg-transparent border-tron-border'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Exercise list with targets */}
      <div className="space-y-1.5">
        {levelExercises.map(ex => (
          <div
            key={ex.id}
            className="flex items-center justify-between text-xs py-1"
          >
            <span className={nodeState === 'locked' ? 'text-tron-muted' : 'text-tron-text'}>
              {ex.name}
            </span>
            <span className="text-tron-muted font-mono text-[10px] ml-2 shrink-0">
              {ex.isHold
                ? `${ex.targetSets}×${ex.targetHoldSeconds}s`
                : `${ex.targetSets}×${ex.targetReps}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
