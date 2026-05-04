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
import { saveDeveloperSession } from '@/lib/developer-session';

type DeveloperLoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

export default function DeveloperLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'technical' | 'legacy'>('technical');
  const [email, setEmail] = useState('tecnico@menuhub.local');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session =
        mode === 'technical'
          ? await apiFetch<DeveloperLoginResponse>('/v2/auth/login', {
              method: 'POST',
              body: JSON.stringify({ email: email.trim(), password }),
            })
          : await apiFetch<DeveloperLoginResponse>('/v2/developer/login', {
              method: 'POST',
              body: JSON.stringify({ code: code.trim() }),
            });

      const role = readRoleFromAccessToken(session.accessToken);
      if (role !== 'developer' && role !== 'technical_admin') {
        throw new Error('Token tecnico invalido para perfil developer.');
      }

      saveAuthSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresInSec: session.expiresInSec,
        role,
      });
      saveDeveloperSession({
        role,
        expiresAt: new Date(Date.now() + session.expiresInSec * 1000).toISOString(),
        accessToken: session.accessToken,
      });

      router.push('/developer/companies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login tecnico.');
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
        <p className={styles.sub}>Area restrita para acesso tecnico do backoffice comercial.</p>

        <div className={styles.tabs}>
          <button type="button" className={mode === 'technical' ? styles.tabActive : styles.tab} onClick={() => setMode('technical')}>
            Login tecnico
          </button>
          <button type="button" className={mode === 'legacy' ? styles.tabActive : styles.tab} onClick={() => setMode('legacy')}>
            Entrar com codigo legado
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className={styles.form}>
          {mode === 'technical' ? (
            <>
              <input className={styles.input} type="email" placeholder="E-mail tecnico" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className={styles.input} type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </>
          ) : (
            <input
              className={styles.input}
              type="password"
              placeholder="Codigo tecnico"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          )}

          {error ? <div className={styles.error}>{error}</div> : null}

          <Button type="submit" disabled={loading}>
            {loading ? 'Validando...' : mode === 'technical' ? 'Entrar com email e senha' : 'Entrar com codigo'}
          </Button>
        </form>

        <Link href="/" className={styles.backLink}>
          Voltar ao login da plataforma
        </Link>
      </Card>
    </main>
  );
}
