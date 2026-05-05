'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './premium.module.css';

type Props = {
  message?: string | null;
  onRetry?: () => void;
};

export function PremiumErrorState({ message, onRetry }: Props) {
  return (
    <Card className={styles.errorCard}>
      <p>Não foi possível carregar os dados.</p>
      {message ? <small>{message}</small> : null}
      {onRetry ? (
        <div style={{ marginTop: 8 }}>
          <Button onClick={onRetry}>Tentar novamente</Button>
        </div>
      ) : null}
    </Card>
  );
}
