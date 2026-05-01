'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { saveDeveloperSession } from '@/lib/developer-session';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';

export default function DeveloperLoginPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v2/developer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'Falha no login de developer.');
      }
      const session = (await res.json()) as { role: 'developer'; expiresAt: string };
      saveDeveloperSession(session);
      router.push('/admin/modules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login de developer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.title}>Acesso do Desenvolvedor</h1>
        <p className={styles.sub}>Use o codigo de acesso tecnico para liberar sessao temporaria.</p>
        <form onSubmit={(e) => void onSubmit(e)} className={styles.form}>
          <input
            className={styles.input}
            type="password"
            placeholder="Codigo de acesso"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            required
          />
          {error ? <div className={styles.error}>{error}</div> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
