'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { saveAuthSession } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api-fetch';
import { readRoleFromAccessToken } from '@/lib/auth-claims';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';
const WS_BASE = process.env.NEXT_PUBLIC_API_V2_WS_URL ?? API_BASE;

export default function HomePage() {
  const router = useRouter();
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [apiStatus, setApiStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const [wsStatus, setWsStatus] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/v2/health`, { cache: 'no-store' });
        if (!active) return;
        setApiStatus(res.ok ? 'up' : 'down');
      } catch {
        if (active) setApiStatus('down');
      }
    };

    void check();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const socket = io(`${WS_BASE}/v2/orders`, {
      transports: ['websocket', 'polling'],
      withCredentials: false,
      query: {
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      auth: {
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      extraHeaders: {
        'x-company-id': companyId,
        ...(branchId ? { 'x-branch-id': branchId } : {}),
      },
    });

    setWsStatus('checking');
    socket.on('connect', () => setWsStatus('up'));
    socket.on('connect_error', () => setWsStatus('down'));
    socket.on('disconnect', () => setWsStatus('down'));

    return () => {
      socket.disconnect();
    };
  }, [branchId, companyId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!identifier.trim() || !password.trim()) {
      setError('Preencha usuário/e-mail e senha para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await apiFetch<LoginResponse>('/v2/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: identifier.trim(), password, branchId }),
      });

      const role = readRoleFromAccessToken(session.accessToken);
      saveAuthSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresInSec: session.expiresInSec,
        role,
      });

      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <Card className={styles.loginCard}>
        <div className={styles.brandLine}>MenuHub Platform</div>
        <h1 className={styles.title}>Entrar na plataforma</h1>
        <p className={styles.subtitle}>Gestão operacional para restaurante, PDV, cozinha e delivery</p>

        <div className={styles.badgeRow}>
          <Badge tone="warning">Ambiente HML</Badge>
          <small className={styles.statusText}>
            API: {apiStatus === 'up' ? 'online' : apiStatus === 'down' ? 'offline' : 'verificando'} | WS:{' '}
            {wsStatus === 'up' ? 'conectado' : wsStatus === 'down' ? 'desconectado' : 'verificando'}
          </small>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span>E-mail ou usuário</span>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="seu.usuario@menuhub"
            />
          </label>

          <label className={styles.field}>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className={styles.linksRow}>
          <Link href="/delivery" className={styles.secondaryLink}>
            Acessar cardápio online
          </Link>
          <Link href="/developer-login" className={styles.secondaryLink}>
            Acesso tecnico
          </Link>
        </div>
      </Card>
    </main>
  );
}
