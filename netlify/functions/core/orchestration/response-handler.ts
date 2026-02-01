import { SessionContext, SessionState, AgentType } from './state-machine'

export interface FormattedResponse {
  message: string
  sessionId: string
  sessionState: SessionState
  currentAgent: AgentType
  data?: any
  context?: SessionContext
  metadata: {
    timestamp: string
    processing_time_ms: number
    agent: AgentType
    state_transition?: {
      from: SessionState
      to: SessionState
    }
  }
}

export interface StreamingChunk {
  type: 'message' | 'data' | 'complete' | 'error'
  content: string
  metadata?: any
}

/**
 * Response handler for formatting agent outputs and handling streaming
 */
export class ResponseHandler {
  /**
   * Format a complete response from agent processing
   */
  formatResponse(
    message: string,
    sessionId: string,
    sessionState: SessionState,
    currentAgent: AgentType,
    context?: SessionContext,
    data?: any,
    processingStartTime?: number
  ): FormattedResponse {
    const processingTime = processingStartTime 
      ? Date.now() - processingStartTime 
      : 0

    return {
      message,
      sessionId,
      sessionState,
      currentAgent,
      data,
      context,
      metadata: {
        timestamp: new Date().toISOString(),
        processing_time_ms: processingTime,
        agent: currentAgent,
        state_transition: context ? {
          from: context.currentState,
          to: sessionState
        } : undefined
      }
    }
  }

  /**
   * Format an error response
   */
  formatErrorResponse(
    error: string,
    sessionId: string,
    sessionState: SessionState = 'intake',
    currentAgent: AgentType = 'intake',
    details?: any
  ): FormattedResponse {
    return {
      message: `I apologize, but I encountered an error: ${error}. Let me try to help you differently.`,
      sessionId,
      sessionState,
      currentAgent,
      data: {
        error: true,
        errorMessage: error,
        errorDetails: details,
        fallbackAgent: 'intake'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        processing_time_ms: 0,
        agent: currentAgent
      }
    }
  }

  /**
   * Create streaming response chunks (for future implementation)
   * This will be used when integrating with OpenAI streaming
   */
  createStreamingChunks(message: string, metadata?: any): StreamingChunk[] {
    // Simple implementation - split message into words for streaming effect
    const words = message.split(' ')
    const chunks: StreamingChunk[] = []

    // Create message chunks
    words.forEach((word, index) => {
      chunks.push({
        type: 'message',
        content: index === 0 ? word : ` ${word}`,
        metadata: {
          wordIndex: index,
          totalWords: words.length
        }
      })
    })

    // Add completion chunk
    chunks.push({
      type: 'complete',
      content: '',
      metadata: {
        ...metadata,
        totalChunks: chunks.length
      }
    })

    return chunks
  }

  /**
   * Sanitize message content for safe output
   */
  sanitizeMessage(message: string): string {
    // Basic sanitization - remove potentially harmful content
    return message
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  }

  /**
   * Add coaching context to response message
   */
  enrichMessageWithContext(
    baseMessage: string, 
    context: SessionContext, 
    agent: AgentType
  ): string {
    let enrichedMessage = baseMessage

    // Add contextual information based on agent and session state
    switch (agent) {
      case 'intake':
        if (context.metadata.stepCount > 0) {
          enrichedMessage += `\n\n*Building your profile (step ${context.metadata.stepCount + 1})*`
        }
        break

      case 'program':
        if (context.userProfile) {
          enrichedMessage += `\n\n*Designing for ${context.userProfile.level || 'beginner'} level*`
        }
        break

      case 'coach':
        // Workout context removed for simplicity
        break

      case 'gamification':
        // XP functionality removed for simplicity
        break
    }

    return enrichedMessage
  }

  /**
   * Generate debug information for development
   */
  generateDebugInfo(
    context: SessionContext,
    agent: AgentType,
    processingTime: number
  ): any {
    return {
      sessionInfo: {
        id: context.sessionId,
        state: context.currentState,
        stepCount: context.metadata.stepCount,
        duration: Date.now() - new Date(context.metadata.startTime).getTime()
      },
      agentInfo: {
        current: agent,
        processingTimeMs: processingTime
      },
      dataPresence: {
        hasProfile: !!context.userProfile,
        hasSessionData: !!context.sessionData
      }
    }
  }
}

// Export singleton instance
export const responseHandler = new ResponseHandler()
