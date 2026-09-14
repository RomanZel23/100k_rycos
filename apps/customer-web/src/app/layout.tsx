import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegister } from '../components/PwaRegister';

export const metadata: Metadata = {
  title: 'RYCOS - POS & KDS Gastro',
  description: 'System POS i KDS Live dla gastronomii oraz zamawianie QR',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RYCOS',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f59e0b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
