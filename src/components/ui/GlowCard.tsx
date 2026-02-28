'use client'

import { cn } from '@/lib/utils'

interface GlowCardProps {
  children: React.ReactNode
  className?: string
  glow?: 'cyan' | 'emerald' | 'amber' | 'push' | 'pull' | 'squat' | 'none'
  onClick?: () => void
}

const glowMap = {
  cyan: 'shadow-glow-cyan border-tron-primary/25',
  emerald: 'shadow-glow-emerald border-tron-success/25',
  amber: 'shadow-glow-amber border-tron-warning/25',
  push: 'shadow-glow-push border-cat-push/25',
  pull: 'shadow-glow-pull border-cat-pull/25',
  squat: 'shadow-glow-squat border-cat-squat/25',
  none: 'border-tron-border',
}

export function GlowCard({ children, className, glow = 'none', onClick }: GlowCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-tron-surface p-4',
        glowMap[glow],
        onClick && 'cursor-pointer active:scale-[0.98] transition-transform',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
