'use client'

import { cn } from '@/lib/utils'

interface SetCheckboxProps {
  checked: boolean
  met: boolean       // true = at or above target
  onChange: (checked: boolean) => void
  className?: string
}

export function SetCheckbox({ checked, met, onChange, className }: SetCheckboxProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'w-7 h-7 rounded border-2 flex items-center justify-center text-xs font-bold transition-all',
        !checked && 'border-tron-border bg-tron-surface text-tron-muted',
        checked && met && 'border-tron-success bg-tron-success-dim text-tron-success',
        checked && !met && 'border-tron-muted bg-tron-muted-dim text-tron-muted',
        className
      )}
    >
      {checked ? (met ? '✓' : '–') : ''}
    </button>
  )
}
