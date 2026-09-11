import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'YallaOrder — Company Admin',
  description: 'Manage your company, users, terminals and billing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
