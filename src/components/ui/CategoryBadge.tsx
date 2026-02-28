'use client'

import { cn } from '@/lib/utils'
import type { Category } from '@/types'

interface CategoryBadgeProps {
  category: Category
  className?: string
}

const styles: Record<Category, string> = {
  push: 'bg-cat-push/15 text-cat-push border-cat-push/30',
  pull: 'bg-cat-pull/15 text-cat-pull border-cat-pull/30',
  squat: 'bg-cat-squat/15 text-cat-squat border-cat-squat/30',
}

const labels: Record<Category, string> = {
  push: 'Push',
  pull: 'Pull',
  squat: 'Squat',
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        styles[category],
        className
      )}
    >
      {labels[category]}
    </span>
  )
}
