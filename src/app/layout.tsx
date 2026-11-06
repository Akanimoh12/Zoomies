import type { Metadata, Viewport } from 'next';
import { GAME } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: GAME.name,
  description: `${GAME.name}: a daily-course endless runner. ${GAME.tagline}`,
  openGraph: { title: GAME.name, description: GAME.tagline, type: 'website' },
  twitter: { card: 'summary', title: GAME.name, description: GAME.tagline },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#120E2A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
