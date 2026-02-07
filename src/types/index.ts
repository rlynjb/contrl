// Re-export commonly used types
export type { Metadata } from 'next'

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
