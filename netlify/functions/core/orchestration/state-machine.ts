// State machine for managing workout session states and agent routing
export type SessionState = 'intake' | 'planning' | 'workout' | 'logging' | 'complete'
export type AgentType = 'intake' | 'program' | 'coach' | 'gamification'

export interface SessionContext {
  userId?: string
  sessionId: string
  currentState: SessionState
  userProfile?: any
  workoutPlan?: any
  sessionData?: any
  metadata: {
    startTime: string
    lastUpdate: string
    stepCount: number
  }
}

export class StateMachine {
  /**
   * Determines which agent should handle the current session state
   */
  static getAgentForState(state: SessionState): AgentType {
    switch (state) {
      case 'intake':
        return 'intake'
      case 'planning':
        return 'program'
      case 'workout':
        return 'coach'
      case 'logging':
      case 'complete':
        return 'gamification'
      default:
        return 'intake'
    }
  }

  /**
   * Determines the next session state based on current state and agent response
   */
  static getNextState(
    currentState: SessionState, 
    agentResponse: any, 
    context: SessionContext
  ): SessionState {
    switch (currentState) {
      case 'intake':
        // Move to planning if profile is complete
        return agentResponse.profileComplete ? 'planning' : 'intake'
      
      case 'planning':
        // Move to workout if plan is created
        return agentResponse.planReady ? 'workout' : 'planning'
      
      case 'workout':
        // Move to logging if workout is complete
        return agentResponse.workoutComplete ? 'logging' : 'workout'
      
      case 'logging':
        // Move to complete after logging
        return 'complete'
      
      case 'complete':
        // Can start new session (back to planning) or end
        return agentResponse.startNew ? 'planning' : 'complete'
      
      default:
        return 'intake'
    }
  }

  /**
   * Validates if a state transition is allowed
   */
  static isValidTransition(from: SessionState, to: SessionState): boolean {
    const validTransitions: Record<SessionState, SessionState[]> = {
      intake: ['intake', 'planning'],
      planning: ['planning', 'workout', 'intake'], // Can go back to intake
      workout: ['workout', 'logging'],
      logging: ['complete'],
      complete: ['planning', 'complete'] // Can start new or stay complete
    }

    return validTransitions[from]?.includes(to) ?? false
  }

  /**
   * Creates initial session context
   */
  static createInitialContext(sessionId: string, userId?: string): SessionContext {
    return {
      userId,
      sessionId,
      currentState: 'intake',
      metadata: {
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        stepCount: 0
      }
    }
  }

  /**
   * Updates session context with new state and data
   */
  static updateContext(
    context: SessionContext, 
    newState: SessionState, 
    data?: any
  ): SessionContext {
    return {
      ...context,
      currentState: newState,
      ...data,
      metadata: {
        ...context.metadata,
        lastUpdate: new Date().toISOString(),
        stepCount: context.metadata.stepCount + 1
      }
    }
  }
}
