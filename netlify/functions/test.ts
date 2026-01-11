import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions'

/**
 * Simple test function to verify Netlify Functions are working
 * Accessible at /.netlify/functions/test
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    }
  }

  try {
    const testInfo = {
      message: 'CalisthenIQ Netlify Functions are working! 🚀',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      function: 'test',
      event: {
        httpMethod: event.httpMethod,
        path: event.path,
        headers: {
          'user-agent': event.headers?.['user-agent'] || 'unknown',
          'host': event.headers?.['host'] || 'unknown'
        }
      },
      context: {
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        remainingTimeInMillis: context.getRemainingTimeInMillis()
      },
      netlifyConfig: {
        functionsDirectory: 'netlify/functions',
        buildCommand: 'npm run build',
        hasCoachFunction: true,
        orchestrationReady: true
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testInfo, null, 2)
    }

  } catch (error) {
    console.error('Test function error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage,
        function: 'test'
      })
    }
  }
}
