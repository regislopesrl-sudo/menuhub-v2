import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { TopNav } from '@/components/top-nav';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Web V2 - Admin Orders',
  description: 'Painel mínimo de pedidos V2',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        <AppShell>
          <TopNav />
          {children}
        </AppShell>
      </body>
    </html>
  );
}

