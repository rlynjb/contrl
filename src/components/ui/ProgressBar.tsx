'use client'

import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number      // 0–100
  color?: 'cyan' | 'emerald' | 'amber' | 'muted'
  label?: string
  showPct?: boolean
  className?: string
}

const colorMap = {
  cyan: 'bg-tron-primary',
  emerald: 'bg-tron-success',
  amber: 'bg-tron-warning',
  muted: 'bg-tron-muted',
}

export function ProgressBar({ value, color = 'cyan', label, showPct, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('w-full', className)}>
      {(label || showPct) && (
        <div className="flex justify-between text-xs mb-1">
          {label && <span className="text-tron-text-secondary">{label}</span>}
          {showPct && <span className="text-tron-text-secondary font-mono">{clamped}%</span>}
        </div>
      )}
      <div className="h-2 rounded-full bg-tron-surface-light overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorMap[color])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
