'use client'

import type { Category } from '@/types'
import { CategoryBadge } from '@/components/ui/CategoryBadge'

interface GatePassedModalProps {
  category: Category
  oldLevel: number
  newLevel: number
  onClose: () => void
}

const LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

export function GatePassedModal({ category, oldLevel, newLevel, onClose }: GatePassedModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-tron-primary/40 bg-tron-surface p-8 text-center animate-glow-burst"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <CategoryBadge category={category} className="text-sm px-4 py-1" />
        </div>

        <h2 className="text-2xl font-bold tracking-widest text-tron-primary mb-2">
          LEVEL UP!
        </h2>

        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="text-center">
            <p className="text-lg font-mono text-tron-muted">{oldLevel}</p>
            <p className="text-[10px] text-tron-muted">{LEVEL_NAMES[oldLevel]}</p>
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-tron-primary">
            <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-center">
            <p className="text-lg font-mono text-tron-primary font-bold">{newLevel}</p>
            <p className="text-[10px] text-tron-primary">{LEVEL_NAMES[newLevel]}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-xl border border-tron-primary/30 bg-tron-primary-dim py-3 text-sm font-semibold text-tron-primary transition-all hover:bg-tron-primary/20"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
