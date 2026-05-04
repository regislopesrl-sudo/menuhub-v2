'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { saveAuthSession } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api-fetch';
import { readRoleFromAccessToken } from '@/lib/auth-claims';

type DeveloperLoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

export default function DeveloperLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await apiFetch<DeveloperLoginResponse>('/v2/developer/login', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });

      const role = readRoleFromAccessToken(session.accessToken);
      if (role !== 'developer') {
        throw new Error('Token tecnico invalido para perfil developer.');
      }

      saveAuthSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresInSec: session.expiresInSec,
        role,
      });

      router.push('/admin/modules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Codigo tecnico invalido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Acesso Tecnico"
        subtitle="Area restrita ao desenvolvedor da plataforma"
        right={<Badge tone="warning">Developer Only</Badge>}
      />

      <Card className={styles.card}>
        <h1 className={styles.title}>Entrar como desenvolvedor</h1>
        <p className={styles.sub}>Area restrita ao desenvolvedor da plataforma. Este acesso nao e usuario da loja.</p>

        <form onSubmit={(e) => void onSubmit(e)} className={styles.form}>
          <input
            className={styles.input}
            type="password"
            placeholder="Codigo tecnico"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />

          {error ? <div className={styles.error}>{error}</div> : null}

          <Button type="submit" disabled={loading}>
            {loading ? 'Validando...' : 'Entrar como desenvolvedor'}
          </Button>
        </form>

        <Link href="/" className={styles.backLink}>
          Voltar ao login da plataforma
        </Link>
      </Card>
    </main>
  );
}
