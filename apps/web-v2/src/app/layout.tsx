import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { TopNav } from '@/components/top-nav';
import { PwaRegister } from '@/components/pwa-register';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'MenuHub Platform',
  description: 'Operacao local de restaurante com canais Totem e App Garcom.',
  manifest: '/manifest.webmanifest',
  applicationName: 'MenuHub',
};

export const viewport: Viewport = {
  themeColor: '#2557f6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.variable} suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(() => { try { const embedded = window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1'; if (embedded) { document.documentElement.classList.add('embedded-mode'); document.body.classList.add('embedded-mode'); } } catch (_) {} })();",
          }}
        />
        <PwaRegister />
        <AppShell>
          <TopNav />
          {children}
        </AppShell>
      </body>
    </html>
  );
}
