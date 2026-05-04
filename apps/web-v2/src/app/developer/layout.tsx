'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';

export default function DeveloperLayout({ children }: { children: ReactNode }) {
  return <AuthGuard scope="developer">{children}</AuthGuard>;
}
