import type { Metadata } from 'next'
import './globals.css'
import { APP_METADATA, APP_VIEWPORT } from '@/lib/constants'
import { MSWProvider } from '@/mocks'

export const metadata: Metadata = APP_METADATA

export const viewport = APP_VIEWPORT

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body style={{ background: "#08080f" }} suppressHydrationWarning>
        <MSWProvider>
          <header style={{
            width: "100%",
            maxWidth: 480,
            margin: "0 auto",
            padding: "12px 20px",
            borderBottom: "1px solid #12121e",
            background: "#08080f",
          }}>
            <span style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "#e0e0e0",
              fontFamily: "'Anybody', monospace",
            }}>contrl</span>
          </header>
          {children}
        </MSWProvider>
      </body>
    </html>
  )
}
