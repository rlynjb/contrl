import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions'
import { supervisor, SupervisorRequest } from './core/orchestration/supervisor'
import { SessionState } from './core/orchestration/state-machine'
import { responseHandler } from './core/orchestration/response-handler'

// Type definitions for the coach function
interface CoachRequest {
  message: string
  sessionId?: string
  userId?: string
  sessionState?: SessionState
}

// Main coach orchestrator function
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    }
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    // Track processing time
    const processingStartTime = Date.now()
    
    // Parse request body
    const body: CoachRequest = JSON.parse(event.body || '{}')
    
    // Validate required fields
    if (!body.message) {
      const errorResponse = responseHandler.formatErrorResponse(
        'Message is required',
        body.sessionId || 'unknown',
        'intake',
        'intake',
        { validationError: 'missing_message' }
      )
      
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorResponse)
      }
    }

    console.log('Coach function called with:', {
      message: body.message,
      sessionId: body.sessionId,
      userId: body.userId,
      sessionState: body.sessionState
    })

    // Use supervisor to handle the request
    const supervisorRequest: SupervisorRequest = {
      message: body.message,
      sessionId: body.sessionId,
      userId: body.userId,
      sessionState: body.sessionState
    }

    const supervisorResponse = await supervisor.processRequest(supervisorRequest)

    // Enhance message with context if available
    const enhancedMessage = supervisorResponse.context 
      ? responseHandler.enrichMessageWithContext(
          supervisorResponse.message,
          supervisorResponse.context,
          supervisorResponse.currentAgent
        )
      : supervisorResponse.message

    // Format response with ResponseHandler
    const formattedResponse = responseHandler.formatResponse(
      responseHandler.sanitizeMessage(enhancedMessage),
      supervisorResponse.sessionId,
      supervisorResponse.sessionState,
      supervisorResponse.currentAgent,
      supervisorResponse.context,
      supervisorResponse.data,
      processingStartTime
    )

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formattedResponse)
    }

  } catch (error) {
    console.error('Coach function error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Use ResponseHandler for error formatting
    const errorResponse = responseHandler.formatErrorResponse(
      'Internal server error',
      'unknown', // We don't have sessionId in catch block
      'intake',
      'intake',
      {
        originalError: errorMessage,
        development: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      }
    )
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorResponse)
    }
  }
}
