export const APP_NAME = 'Contrl'
export const APP_DESCRIPTION = 'AI-powered calisthenics coach focused on helping beginners build strength safely'

// App Metadata
export const APP_METADATA = {
  title: 'Contrl - AI-Powered Calisthenics Coach',
  description: 'AI-powered calisthenics coach focused on helping beginners build strength safely through proper form, controlled progressions, and body awareness.',
  keywords: ['calisthenics', 'fitness', 'AI coach', 'bodyweight', 'strength training'],
  authors: [{ name: 'Contrl Team' }],
}

export const APP_VIEWPORT = {
  width: 'device-width',
  initialScale: 1,
}

// Category color definitions (single source of truth)
export const CATEGORY_COLORS: Record<string, { color: string; bg: string; border: string; glow: string }> = {
  Push:  { color: "#F97316", bg: "#F9731610", border: "#F9731628", glow: "0 0 24px #F9731635" },
  Pull:  { color: "#06B6D4", bg: "#06B6D410", border: "#06B6D428", glow: "0 0 24px #06B6D435" },
  Squat: { color: "#D946EF", bg: "#D946EF10", border: "#D946EF28", glow: "0 0 24px #D946EF35" },
}

