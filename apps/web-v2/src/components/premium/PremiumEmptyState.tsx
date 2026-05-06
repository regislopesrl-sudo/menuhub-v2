'use client';

import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  title: string;
  description: string;
};

export function PremiumEmptyState({ title, description }: Props) {
  return <EmptyState title={title} description={description} />;
}
