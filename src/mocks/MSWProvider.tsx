'use client'

/**
 * MSW Provider Component for Next.js
 *
 * Initializes the Mock Service Worker in development mode.
 * Wrap your application with this component to enable API mocking.
 *
 * Usage in layout.tsx:
 * ```tsx
 * import { MSWProvider } from '@/mocks/MSWProvider'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <MSWProvider>{children}</MSWProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */

import { useEffect, useState } from 'react'

interface MSWProviderProps {
  children: React.ReactNode
}

export function MSWProvider({ children }: MSWProviderProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const enableMocking = async () => {
      // Only enable MSW in development and when explicitly enabled
      if (process.env.NODE_ENV !== 'development') {
        setIsReady(true)
        return
      }

      // Check if MSW is enabled via environment variable
      const mswEnabled = process.env.NEXT_PUBLIC_MSW_ENABLED === 'true'
      if (!mswEnabled) {
        setIsReady(true)
        return
      }

      try {
        const { worker } = await import('./browser')
        await worker.start({
          onUnhandledRequest: 'bypass', // Don't warn about unhandled requests
          quiet: false, // Show startup message
        })
        console.log('[MSW] Mock Service Worker started')
      } catch (error) {
        console.warn('[MSW] Failed to start:', error)
      }

      setIsReady(true)
    }

    enableMocking()
  }, [])

  // Show nothing until MSW is ready (prevents flash of unmocked requests)
  if (!isReady) {
    return null
  }

  return <>{children}</>
}

export default MSWProvider
