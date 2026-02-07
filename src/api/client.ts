/**
 * API Client for making HTTP requests
 */

export interface ApiResponse<T = unknown> {
  data: T
  success: boolean
  message?: string
  error?: string
}

export interface ApiError {
  message: string
  status?: number
  code?: string
}

class ApiClient {
  private baseUrl: string
  private timeout: number

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
    this.timeout = Number(process.env.NEXT_PUBLIC_API_TIMEOUT) || 10000
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      return {
        data,
        success: true,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      const apiError: ApiError = {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        status: error instanceof Error && 'status' in error ? (error as unknown as { status: number }).status : undefined,
      }

      throw apiError
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    let url = endpoint
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params)
      url = `${endpoint}?${searchParams.toString()}`
    }

    return this.request<T>(url, {
      method: 'GET',
    })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }
}

export const apiClient = new ApiClient()
