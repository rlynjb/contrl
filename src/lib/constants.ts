export const APP_NAME = 'Contrl'

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Novice',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

export const CATEGORY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  push:  { color: '#F97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.16)' },
  pull:  { color: '#06B6D4', bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.16)' },
  squat: { color: '#D946EF', bg: 'rgba(217,70,239,0.06)', border: 'rgba(217,70,239,0.16)' },
}
