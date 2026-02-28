import { gameDataStore, jsonResponse, errorResponse, handleCors } from './core/infrastructure/blob'

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return handleCors()

  const url = new URL(request.url)

  try {
    if (request.method === 'GET') {
      const key = url.searchParams.get('key')
      if (!key) return errorResponse('Missing key parameter', 400)
      const data = await gameDataStore.get(key)
      return jsonResponse(data)
    }

    if (request.method === 'PUT') {
      const body = await request.json() as { key: string; value: unknown }
      if (!body.key) return errorResponse('Missing key in body', 400)
      await gameDataStore.set(body.key, body.value)
      return jsonResponse({ success: true })
    }

    if (request.method === 'DELETE') {
      const key = url.searchParams.get('key')
      if (!key) return errorResponse('Missing key parameter', 400)
      await gameDataStore.delete(key)
      return jsonResponse({ success: true })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500)
  }
}

export const config = {
  path: '/game/data'
}
