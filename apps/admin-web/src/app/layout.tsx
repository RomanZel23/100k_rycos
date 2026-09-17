import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SolutionsBay / 100k-RYCOS — Company Admin',
  description: 'Manage your company, users, terminals, catalog and billing.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="font-sans antialiased bg-neutral-50 text-techbay-blue">{children}</body>
    </html>
  )
}
