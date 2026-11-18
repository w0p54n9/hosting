import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Archivo } from 'next/font/google';
import './globals.css';

// Archivo's width axis at 125% + weight 900 gives the extra-wide, ultra-black display look.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: 'GOING OUT: plan the night, not the logistics',
  description: 'Pick the day, find the fair middle, rank places everyone likes, sort out rides. Going Out does the planning.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
