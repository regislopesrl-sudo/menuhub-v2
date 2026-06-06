'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { AdminShell } from '@/components/admin-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard scope="admin">
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
