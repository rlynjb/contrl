import { SessionContext, SessionState, AgentType, StateMachine } from './state-machine'
import { sessionManager } from './session-manager'
import { responseHandler } from './response-handler'

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
  /**
   * Process incoming request and route to appropriate agent
   */
  async processRequest(request: SupervisorRequest): Promise<SupervisorResponse> {
    // Get or create session context
    const sessionId = request.sessionId || sessionManager.generateSessionId()
    let context = await sessionManager.getSession(sessionId)
    
    if (!context) {
      context = StateMachine.createInitialContext(sessionId, request.userId)
      await sessionManager.saveSession(sessionId, context)
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
        sessionData: { ...context.sessionData, ...agentResponse.sessionData }
      })

      // Store updated context
      await sessionManager.saveSession(sessionId, context)

      // Sanitize the agent response message
      const sanitizedMessage = responseHandler.sanitizeMessage(agentResponse.message)

      return {
        message: sanitizedMessage,
        sessionId,
        sessionState: nextState,
        currentAgent,
        data: agentResponse.data,
        context
      }

    } catch (error) {
      console.error(`Error routing to ${currentAgent} agent:`, error)
      
      // Use ResponseHandler for consistent error formatting
      const errorResponse = responseHandler.formatErrorResponse(
        'I encountered an error processing your request',
        sessionId,
        context.currentState,
        currentAgent,
        {
          errorType: 'agent_routing_error',
          originalError: error instanceof Error ? error.message : 'Unknown error',
          agent: currentAgent
        }
      )
      
      return {
        message: errorResponse.message,
        sessionId: errorResponse.sessionId,
        sessionState: errorResponse.sessionState,
        currentAgent: errorResponse.currentAgent,
        data: errorResponse.data,
        context
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
    
    let responseMessage = ''
    if (context.metadata.stepCount === 0) {
      responseMessage = `Welcome to CalisthenIQ! I'm here to help you get started with a safe and effective workout routine. To create the best program for you, I'd love to learn about your fitness background and goals. What brings you here today?`
    } else {
      responseMessage = `Thanks for sharing that information! I'm building your fitness profile to ensure we create workouts that are both safe and effective for your current level. What are your main fitness goals? Are you looking to build strength, improve mobility, lose weight, or something else?`
    }
    
    return {
      message: responseMessage,
      profileComplete: isProfileComplete,
      userProfile: isProfileComplete ? { goals: ['strength', 'mobility'], level: 'beginner' } : undefined,
      data: { agent: 'intake', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleProgramAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const isPlanReady = message.toLowerCase().includes('ready') || context.metadata.stepCount > 1
    
    const responseMessage = `Perfect! Based on your fitness profile, I'm designing a personalized calisthenics workout that matches your current level and goals. How much time do you have available for today's workout? I can create anything from a quick 10-minute session to a full 45-minute routine.`
    
    return {
      message: responseMessage,
      planReady: isPlanReady,
      data: { agent: 'program', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleTechniqueAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const isWorkoutComplete = message.toLowerCase().includes('done') || message.toLowerCase().includes('finished')
    
    const responseMessage = isWorkoutComplete 
      ? `Excellent work completing your workout! You showed great form and dedication. Remember to stay hydrated and listen to your body. How are you feeling right now? Any muscle groups that feel particularly worked?`
      : `Great job! You're doing fantastic. Remember to focus on controlled movements and steady breathing. Quality over quantity is key in calisthenics. How is the current exercise feeling for you?`
    
    return {
      message: responseMessage,
      workoutComplete: isWorkoutComplete,
      sessionData: { 
        currentExercise: 'push-up', 
        setsCompleted: isWorkoutComplete ? 3 : 1,
        formFeedback: 'good'
      },
      data: { agent: 'coach', step: context.metadata.stepCount + 1 }
    }
  }

  private async handleGamificationAgent(message: string, context: SessionContext): Promise<any> {
    // TODO: Implement with OpenAI Agents SDK
    const startNew = message.toLowerCase().includes('another') || message.toLowerCase().includes('next')
    
    const currentStreak = 3
    
    const responseMessage = startNew
      ? `🎉 Amazing session! You're on a ${currentStreak}-day streak! Your consistency is paying off. Ready to plan your next workout and keep building that momentum?`
      : `🎉 Fantastic workout! You're maintaining a strong ${currentStreak}-day streak! Your dedication to consistent training is exactly what builds real strength and skill. Great job today!`
    
    return {
      message: responseMessage,
      startNew,
      sessionData: { 
        streakDay: currentStreak,
        achievements: ['consistency_champion']
      },
      data: { agent: 'gamification', step: context.metadata.stepCount + 1 }
    }
  }
}

// Export singleton instance
export const supervisor = new Supervisor()
