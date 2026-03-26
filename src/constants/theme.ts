/** Tron-inspired dark theme — matches the web app palette */
export const colors = {
  bg: '#06080f',
  surface: '#0c1021',
  surfaceLight: '#121830',
  primary: '#00e5ff',
  primaryDim: 'rgba(0,229,255,0.15)',
  success: '#34d399',
  successDim: 'rgba(52,211,153,0.15)',
  warning: '#fbbf24',
  warningDim: 'rgba(251,191,36,0.15)',
  muted: '#6b8aab',
  mutedDim: 'rgba(107,138,171,0.12)',
  danger: '#fb7185',
  text: '#e2e8f0',
  textSecondary: '#64748b',
  border: '#1e293b',
} as const;

/** Category accent colors */
export const categoryColors = {
  push: '#F97316',
  pull: '#06B6D4',
  squat: '#D946EF',
} as const;

/** Category background colors (low opacity) */
export const categoryBg = {
  push: 'rgba(249,115,22,0.06)',
  pull: 'rgba(6,182,212,0.06)',
  squat: 'rgba(217,70,239,0.06)',
} as const;

/** Category border colors */
export const categoryBorder = {
  push: 'rgba(249,115,22,0.16)',
  pull: 'rgba(6,182,212,0.16)',
  squat: 'rgba(217,70,239,0.16)',
} as const;
