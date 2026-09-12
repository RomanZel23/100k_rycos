import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '100k-RYCOS - Skanuj, Zamawiaj, Odbieraj',
  description: 'Błyskawiczne zamawianie jedzenia przez kod QR przy stoliku i na parkingu',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900 pb-20">
        {children}
      </body>
    </html>
  );
}
