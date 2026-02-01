// Re-export commonly used types
export type { Metadata } from 'next'

// Base exercise set structure - can be extended for specific use cases
export interface BaseExerciseSet {
  reps?: number
  duration?: number
}

// Base exercise structure
export interface BaseExercise {
  name: string
  tempo?: string
  rest?: number
  equipment?: string
  notes?: string
  sets: BaseExerciseSet[]
}

// Chat system types (exported from useChat for reuse)
export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  agent?: string
  sessionState?: string
}

export interface ChatResponse {
  message: string
  sessionId: string
  sessionState: string
  currentAgent: string
  data?: any
  context?: any
  processingTimeMs?: number
}
