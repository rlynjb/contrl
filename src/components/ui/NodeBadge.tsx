'use client'

import { cn } from '@/lib/utils'

type NodeState = 'locked' | 'open' | 'in-progress' | 'passed'

interface NodeBadgeProps {
  state: NodeState
  level: number
  consecutivePasses?: number
  className?: string
}

export function NodeBadge({ state, level, consecutivePasses, className }: NodeBadgeProps) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5', className)}>
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-mono border-2 transition-all',
          state === 'locked' && 'bg-tron-surface border-tron-border text-tron-muted opacity-40',
          state === 'open' && 'bg-tron-surface border-tron-primary/40 text-tron-primary',
          state === 'in-progress' && 'bg-tron-primary-dim border-tron-primary text-tron-primary shadow-glow-cyan',
          state === 'passed' && 'bg-tron-success-dim border-tron-success text-tron-success shadow-glow-emerald',
        )}
      >
        {state === 'passed' ? '✓' : `L${level}`}
      </div>
      {state === 'in-progress' && consecutivePasses !== undefined && (
        <span className="text-[10px] font-mono text-tron-warning">{consecutivePasses}/3</span>
      )}
    </div>
  )
}
