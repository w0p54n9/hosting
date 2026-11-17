import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DM_Sans, Fraunces } from 'next/font/google';
import './globals.css';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const serif = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Hosting: plan the outing, not the logistics',
  description: 'A fair meeting spot, places everyone likes, carpools and directions for your group.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
