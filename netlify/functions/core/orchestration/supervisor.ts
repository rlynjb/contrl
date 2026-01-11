import { SessionContext, SessionState, AgentType, StateMachine } from './state-machine'

export interface SupervisorRequest {
  message: string
  sessionId?: string
  userId?: string
  sessionState?: SessionState
}

export interface SupervisorResponse {
  message: string
  sessionId: string
  sessionState: SessionState
  currentAgent: AgentType
  data?: any
  context?: SessionContext
}

/**
 * Main supervisor that orchestrates the multi-agent system
 * Routes requests to appropriate agents based on session state
 */
export class Supervisor {
  private sessions: Map<string, SessionContext> = new Map()

  /**
   * Process incoming request and route to appropriate agent
   */
  async processRequest(request: SupervisorRequest): Promise<SupervisorResponse> {
    // Get or create session context
    const sessionId = request.sessionId || this.generateSessionId()
    let context = this.sessions.get(sessionId)
    
    if (!context) {
      context = StateMachine.createInitialContext(sessionId, request.userId)
      this.sessions.set(sessionId, context)
    }

    // Override state if explicitly provided
    if (request.sessionState && StateMachine.isValidTransition(context.currentState, request.sessionState)) {
      context = StateMachine.updateContext(context, request.sessionState)
    }

    // Determine which agent should handle this request
    const currentAgent = StateMachine.getAgentForState(context.currentState)

    try {
      // Route to appropriate agent (placeholder - will be replaced with actual agent calls)
      const agentResponse = await this.routeToAgent(currentAgent, request.message, context)

      // Determine next state based on agent response
      const nextState = StateMachine.getNextState(context.currentState, agentResponse, context)

      // Update context
      context = StateMachine.updateContext(context, nextState, {
        userProfile: agentResponse.userProfile || context.userProfile,
        workoutPlan: agentResponse.workoutPlan || context.workoutPlan,
        sessionData: { ...context.sessionData, ...agentResponse.sessionData }
      })

      // Store updated context
      this.sessions.set(sessionId, context)

      return {
        message: agentResponse.message,
        sessionId,
        sessionState: nextState,
        currentAgent,
        data: agentResponse.data,
        context
      }

    } catch (error) {
      console.error(`Error routing to ${currentAgent} agent:`, error)
      
      return {
        message: `I'm sorry, I encountered an error. Let me try to help you differently.`,
        sessionId,
        sessionState: context.currentState,
        currentAgent,
        data: { error: true, errorType: 'agent_routing_error' }
      }
    }
  }

  /**
   * Route request to specific agent (placeholder implementations)
   */
  private async routeToAgent(agent: AgentType, message: string, context: SessionContext): Promise<any> {
    switch (agent) {
      case 'intake':
        return this.handleIntakeAgent(message, context)
      case 'program':
        return this.handleProgramAgent(message, context)
      case 'coach':
        return this.handleTechniqueAgent(message, context)
      case 'gamification':
        return this.handleGamificationAgent(message, context)
      default:
        throw new Error(`Unknown agent type: ${agent}`)
    }
  }

  // Placeholder agent handlers - these will be replaced with OpenAI Agents SDK implementations
  private async handleIntakeAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const isProfileComplete = message.toLowerCase().includes('complete') || context.metadata.stepCount > 3
    
    return {
      message: `[Intake Agent] Thanks for your message: "${message}". I'm gathering your fitness profile to ensure safe and effective workouts. What are your main fitness goals?`,
      profileComplete: isProfileComplete,
      userProfile: isProfileComplete ? { goals: ['strength', 'mobility'], level: 'beginner' } : undefined,
      data: { agent: 'intake', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleProgramAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const isPlanReady = message.toLowerCase().includes('ready') || context.metadata.stepCount > 1
    
    return {
      message: `[Program Designer] Based on your profile, I'll create a personalized workout. How much time do you have today?`,
      planReady: isPlanReady,
      workoutPlan: isPlanReady ? { duration: 20, exercises: ['push-up', 'squat', 'plank'] } : undefined,
      data: { agent: 'program', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleTechniqueAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const isWorkoutComplete = message.toLowerCase().includes('done') || message.toLowerCase().includes('finished')
    
    return {
      message: `[Technique Coach] Great work! Focus on form and breath control. How are you feeling?`,
      workoutComplete: isWorkoutComplete,
      sessionData: { currentExercise: 'push-up', setsCompleted: isWorkoutComplete ? 3 : 1 },
      data: { agent: 'coach', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleGamificationAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const startNew = message.toLowerCase().includes('another') || message.toLowerCase().includes('next')
    
    return {
      message: `[Gamification] Excellent session! You've earned 15 XP. ${startNew ? "Let's plan your next workout!" : "Great job today!"}`,
      startNew,
      sessionData: { xpEarned: 15, streakDay: 3 },
      data: { agent: 'gamification', step: context.metadata.stepCount + 1 }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get session context by ID
   */
  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Clean up old sessions (basic memory management)
   */
  cleanupSessions(olderThanHours: number = 24): void {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000)
    
    const sessionsToDelete: string[] = []
    
    this.sessions.forEach((context, sessionId) => {
      const sessionTime = new Date(context.metadata.startTime).getTime()
      if (sessionTime < cutoffTime) {
        sessionsToDelete.push(sessionId)
      }
    })
    
    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId)
    })
  }
}

// Export singleton instance
export const supervisor = new Supervisor()
