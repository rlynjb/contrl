import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { cn } from '@/lib/utils'
import { APP_METADATA, APP_VIEWPORT } from '@/lib/constants'
import { MSWProvider } from '@/mocks'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = APP_METADATA

export const viewport = APP_VIEWPORT

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={cn(
        "min-h-screen bg-background font-sans antialiased text-foreground",
        inter.className
      )} suppressHydrationWarning>
        <MSWProvider>
          <div className="relative flex min-h-screen flex-col">
            <header className="border-b">
              <div className="container mx-auto px-4 py-3">
                <nav className="flex items-center justify-between">
                  <Link href="/" className="font-bold text-xl flex items-center gap-2">
                    contrl
                  </Link>
                  <Link
                    href="/workout-levels"
                    className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors"
                  >
                    Progression Levels
                  </Link>
                </nav>
              </div>
            </header>
            <div className="flex-1">{children}</div>
          </div>
        </MSWProvider>
      </body>
    </html>
  )
}
