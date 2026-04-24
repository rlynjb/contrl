/** Tron-inspired dark theme — slate-800/700/600 */
export const colors = {
  bg: '#1e293b',
  surface: '#334155',
  surfaceLight: '#475569',
  primary: '#00e5ff',
  primaryDim: 'rgba(0,229,255,0.15)',
  success: '#34d399',
  successDim: 'rgba(52,211,153,0.15)',
  warning: '#fbbf24',
  warningDim: 'rgba(251,191,36,0.15)',
  muted: '#cbd5e1',
  mutedDim: 'rgba(203,213,225,0.12)',
  danger: '#fb7185',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  border: '#475569',
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

/** Inter font families */
export const fonts = {
  regular: 'Inter_400Regular',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

/** Category border colors */
export const categoryBorder = {
  push: 'rgba(249,115,22,0.16)',
  pull: 'rgba(6,182,212,0.16)',
  squat: 'rgba(217,70,239,0.16)',
} as const;
