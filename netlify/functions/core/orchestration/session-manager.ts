import { SessionContext } from './state-machine'

/**
 * Session manager for handling session persistence and lifecycle
 * In MVP: Uses in-memory storage
 * Future: Will integrate with database for persistence
 */
export class SessionManager {
  private sessions: Map<string, SessionContext> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Start cleanup timer (every hour)
    this.startCleanupTimer()
  }

  /**
   * Store session context
   */
  async saveSession(sessionId: string, context: SessionContext): Promise<void> {
    this.sessions.set(sessionId, { ...context })
    console.log(`Session ${sessionId} saved with state: ${context.currentState}`)
  }

  /**
   * Retrieve session context
   */
  async getSession(sessionId: string): Promise<SessionContext | null> {
    const session = this.sessions.get(sessionId)
    return session || null
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const deleted = this.sessions.delete(sessionId)
    if (deleted) {
      console.log(`Session ${sessionId} deleted`)
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionContext[]> {
    const userSessions: SessionContext[] = []
    
    this.sessions.forEach((context) => {
      if (context.userId === userId) {
        userSessions.push(context)
      }
    })

    return userSessions
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number
    activeStates: Record<string, number>
    averageStepCount: number
  } {
    let totalSteps = 0
    const activeStates: Record<string, number> = {}

    this.sessions.forEach((context) => {
      // Count states
      activeStates[context.currentState] = (activeStates[context.currentState] || 0) + 1
      totalSteps += context.metadata.stepCount
    })

    return {
      totalSessions: this.sessions.size,
      activeStates,
      averageStepCount: this.sessions.size > 0 ? totalSteps / this.sessions.size : 0
    }
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(maxAgeHours: number = 24): void {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000)
    let deletedCount = 0

    const sessionsToDelete: string[] = []

    this.sessions.forEach((context, sessionId) => {
      const sessionTime = new Date(context.metadata.lastUpdate).getTime()
      if (sessionTime < cutoffTime) {
        sessionsToDelete.push(sessionId)
      }
    })

    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId)
      deletedCount++
    })

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired sessions`)
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60 * 60 * 1000)
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Export sessions for backup/migration
   */
  exportSessions(): Record<string, SessionContext> {
    const exported: Record<string, SessionContext> = {}
    
    this.sessions.forEach((context, sessionId) => {
      exported[sessionId] = context
    })

    return exported
  }

  /**
   * Import sessions from backup
   */
  importSessions(sessions: Record<string, SessionContext>): void {
    Object.entries(sessions).forEach(([sessionId, context]) => {
      this.sessions.set(sessionId, context)
    })
    
    console.log(`Imported ${Object.keys(sessions).length} sessions`)
  }
}

// Export singleton instance
export const sessionManager = new SessionManager()
