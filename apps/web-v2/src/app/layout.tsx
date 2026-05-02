import './globals.css';
import type { ReactNode } from 'react';
import { AppNavbar } from '@/components/app-navbar';

export const metadata = {
  title: 'Web V2 - Admin Orders',
  description: 'Painel minimo de pedidos V2',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppNavbar />
        {children}
      </body>
    </html>
  );
}

