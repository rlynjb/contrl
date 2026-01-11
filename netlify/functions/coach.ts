import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions'
import { supervisor, SupervisorRequest } from './core/orchestration/supervisor'

// Type definitions for the coach function
interface CoachRequest {
  message: string
  sessionId?: string
  userId?: string
  sessionState?: 'intake' | 'planning' | 'workout' | 'logging' | 'complete'
}

interface CoachResponse {
  message: string
  sessionId: string
  sessionState: 'intake' | 'planning' | 'workout' | 'logging' | 'complete'
  currentAgent: 'intake' | 'program' | 'coach' | 'gamification'
  data?: any
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
    // Parse request body
    const body: CoachRequest = JSON.parse(event.body || '{}')
    
    // Validate required fields
    if (!body.message) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Message is required' })
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

    const response = await supervisor.processRequest(supervisorRequest)

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    }

  } catch (error) {
    console.error('Coach function error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      })
    }
  }
}
