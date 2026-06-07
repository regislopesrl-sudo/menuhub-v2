'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import styles from './page.module.css';
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

function getEnvironmentLabel() {
  const appEnv = String(process.env.NEXT_PUBLIC_APP_ENV ?? '').trim().toLowerCase();
  if (appEnv === 'hml') return 'Ambiente HML';
  if (appEnv === 'prd' || appEnv === 'production') return 'Ambiente Produção';
  if (appEnv === 'local' || appEnv === 'dev' || appEnv === 'development') return 'Ambiente Local';

  const apiBase = API_BASE.toLowerCase();
  if (apiBase.includes('hml')) return 'Ambiente HML';
  if (apiBase.includes('localhost') || apiBase.includes('127.0.0.1')) return 'Ambiente Local';
  return 'Ambiente Operacional';
}

export default function HomePage() {
  const router = useRouter();
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const environmentLabel = getEnvironmentLabel();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      <section className={styles.loginCard} aria-label="Acesso MenuHub">
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>MH</span>
          <span className={styles.brandName}>MenuHub</span>
        </div>
        <h1 className={styles.title}>Acesse sua conta</h1>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span>E-mail ou usuario *</span>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="usuario@menuhub"
            />
          </label>

          <label className={styles.field}>
            <span>Senha *</span>
            <div className={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Senha"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'ENTRAR'}
          </button>
        </form>

        <Link href="mailto:suporte@menuhub.local?subject=Recuperar acesso MenuHub" className={styles.forgotLink}>
          Esqueci minha senha
        </Link>

        <div className={styles.supportBox}>
          <span>Precisa de ajuda?</span>
          <Link href="mailto:suporte@menuhub.local?subject=Suporte MenuHub">Fale com o suporte.</Link>
        </div>

        <div className={styles.footerLinks}>
          <Link href="/delivery">Cardapio online</Link>
          <Link href="/developer-login">Acesso tecnico</Link>
        </div>

        <div className={styles.statusLine} aria-label="Status do ambiente">
          <span>{environmentLabel}</span>
          <span>API {apiStatus === 'up' ? 'online' : apiStatus === 'down' ? 'offline' : 'verificando'}</span>
          <span>WS {wsStatus === 'up' ? 'conectado' : wsStatus === 'down' ? 'offline' : 'verificando'}</span>
        </div>
      </section>
    </main>
  );
}
