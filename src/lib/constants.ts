export const APP_NAME = 'CalisthenIQ'
export const APP_DESCRIPTION = 'AI-powered calisthenics coach focused on helping beginners build strength safely'

// App Metadata
export const APP_METADATA = {
  title: 'CalisthenIQ - AI-Powered Calisthenics Coach',
  description: 'AI-powered calisthenics coach focused on helping beginners build strength safely through proper form, controlled progressions, and body awareness.',
  keywords: ['calisthenics', 'fitness', 'AI coach', 'bodyweight', 'strength training'],
  authors: [{ name: 'CalisthenIQ Team' }],
}

export const APP_VIEWPORT = {
  width: 'device-width',
  initialScale: 1,
}

// API Endpoints
export const API_ENDPOINTS = {
  COACH: '/.netlify/functions/coach',
  HEALTH: '/api/health'
} as const

// UI Constants
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
} as const

// Exercise Categories
export const EXERCISE_PATTERNS = {
  PUSH: 'push',
  PULL: 'pull',
  SQUAT: 'squat',
  HINGE: 'hinge',
  CORE: 'core',
  MOBILITY: 'mobility'
} as const

// Equipment Types
export const EQUIPMENT_TYPES = {
  BODYWEIGHT: 'bodyweight',
  TRX: 'trx',
  RESISTANCE_BAND: 'band',
  HOUSEHOLD: 'household'
} as const

// Pain Scale
export const PAIN_SCALE = {
  MIN: 0,
  MAX: 10,
  WARNING_THRESHOLD: 4,
  STOP_THRESHOLD: 7
} as const
