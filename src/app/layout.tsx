import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CalisthenIQ - AI-Powered Calisthenics Coach',
  description: 'AI-powered calisthenics coach focused on helping beginners build strength safely through proper form, controlled progressions, and body awareness.',
  keywords: ['calisthenics', 'fitness', 'AI coach', 'bodyweight', 'strength training'],
  authors: [{ name: 'CalisthenIQ Team' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

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
      )}>
        <div className="relative flex min-h-screen flex-col">
          <header className="border-b">
            <div className="container mx-auto px-4 py-3">
              <nav className="flex items-center justify-between">
                <Link href="/" className="font-bold text-xl flex items-center gap-2">
                  🤸‍♂️ CalisthenIQ
                </Link>
                <div className="flex items-center gap-4">
                  <Link href="/workout">
                    <Button variant="ghost" size="sm">
                      Workouts
                    </Button>
                  </Link>
                </div>
              </nav>
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  )
}
