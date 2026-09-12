import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SolutionsBay / 100k-RYCOS — Company Admin',
  description: 'Manage your company, users, terminals, catalog and billing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="font-sans antialiased bg-neutral-50 text-techbay-blue">{children}</body>
    </html>
  )
}
