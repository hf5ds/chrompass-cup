import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chrompass Cup',
  description: '2026/27 Golf Tournament',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
