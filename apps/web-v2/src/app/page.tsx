'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useModules } from '@/features/modules/use-modules';

const API_BASE = process.env.NEXT_PUBLIC_API_V2_URL ?? 'http://localhost:3202';
const WS_BASE = process.env.NEXT_PUBLIC_API_V2_WS_URL ?? API_BASE;

export default function HomePage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;

  const [apiStatus, setApiStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const [wsStatus, setWsStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const modulesState = useModules({ companyId, branchId, userRole: 'admin' });

  const headers = useMemo(
    () => ({
      'x-company-id': companyId,
      ...(branchId ? { 'x-branch-id': branchId } : {}),
      'x-user-role': 'admin',
    }),
    [branchId, companyId],
  );

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/v2/modules`, { headers, cache: 'no-store' });
        if (!mounted) return;
        setApiStatus(res.ok ? 'up' : 'down');
      } catch {
        if (mounted) setApiStatus('down');
      }
    };
    void check();
    return () => {
      mounted = false;
    };
  }, [headers]);

  useEffect(() => {
    const socket = io(`${WS_BASE}/v2/orders`, {
      transports: ['websocket', 'polling'],
      query: { companyId, ...(branchId ? { branchId } : {}) },
      auth: { companyId, ...(branchId ? { branchId } : {}), userRole: 'admin' },
      extraHeaders: { 'x-company-id': companyId, ...(branchId ? { 'x-branch-id': branchId } : {}), 'x-user-role': 'admin' },
    });

    setWsStatus('checking');
    socket.on('connect', () => setWsStatus('up'));
    socket.on('connect_error', () => setWsStatus('down'));
    socket.on('disconnect', () => setWsStatus('down'));

    return () => {
      socket.disconnect();
    };
  }, [branchId, companyId]);

  return (
    <main className={styles.page}>
      <Card className={styles.hero}>
        <div className={styles.tag}>MenuHub Platform V2</div>
        <h1 className={styles.title}>MenuHub V2</h1>
        <p className={styles.subtitle}>Gestão moderna para delivery, pedidos e atendimento.</p>
        <div className={styles.statusRow}>
          <Badge tone="warning">Ambiente HML</Badge>
          <Badge tone={apiStatus === 'up' ? 'success' : apiStatus === 'down' ? 'danger' : 'warning'}>
            API {apiStatus === 'up' ? 'Online' : apiStatus === 'down' ? 'Offline' : 'Verificando'}
          </Badge>
          <Badge tone={wsStatus === 'up' ? 'success' : wsStatus === 'down' ? 'danger' : 'warning'}>
            WebSocket {wsStatus === 'up' ? 'Conectado' : wsStatus === 'down' ? 'Desconectado' : 'Verificando'}
          </Badge>
        </div>
      </Card>

      <section className={styles.grid}>
        {modulesState.isEnabled('delivery') ? (
        <Link href="/delivery" className="ui-card">
          <article className={styles.linkCard}>
            <Badge tone="success">Cliente</Badge>
            <h2 className={styles.linkTitle}>Cardápio Online</h2>
            <p style={{ margin: 0, color: '#475569' }}>
              Experiência mobile-first para montar pedido, personalizar adicionais e pagar com PIX.
            </p>
            <div className={styles.meta}>
              <small style={{ color: '#64748b' }}>Acessar /delivery</small>
              <strong style={{ color: '#0f766e' }}>Entrar</strong>
            </div>
          </article>
        </Link>
        ) : null}

        {modulesState.isEnabled('orders') ? (
        <Link href="/admin/orders" className="ui-card">
          <article className={styles.linkCard}>
            <Badge tone="warning">Operação</Badge>
            <h2 className={styles.linkTitle}>Painel de Pedidos</h2>
            <p style={{ margin: 0, color: '#475569' }}>
              Visualização operacional com filtros, atualização de status e acompanhamento em tempo real.
            </p>
            <div className={styles.meta}>
              <small style={{ color: '#64748b' }}>Acessar /admin/orders</small>
              <strong style={{ color: '#0f766e' }}>Entrar</strong>
            </div>
          </article>
        </Link>
        ) : null}

        {modulesState.isEnabled('kds') ? (
        <Link href="/admin/kds" className="ui-card">
          <article className={styles.linkCard}>
            <Badge tone="warning">Cozinha</Badge>
            <h2 className={styles.linkTitle}>KDS Cozinha</h2>
            <p style={{ margin: 0, color: '#475569' }}>
              Painel de producao em Kanban para iniciar preparo, marcar pronto e finalizar pedidos.
            </p>
            <div className={styles.meta}>
              <small style={{ color: '#64748b' }}>Acessar /admin/kds</small>
              <strong style={{ color: '#0f766e' }}>Entrar</strong>
            </div>
          </article>
        </Link>
        ) : null}

        {modulesState.isEnabled('pdv') ? (
        <Link href="/admin/pdv" className="ui-card">
          <article className={styles.linkCard}>
            <Badge tone="warning">Balcao</Badge>
            <h2 className={styles.linkTitle}>PDV Rapido</h2>
            <p style={{ margin: 0, color: '#475569' }}>
              Operacao de caixa para criar pedidos presenciais e enviar direto para a cozinha.
            </p>
            <div className={styles.meta}>
              <small style={{ color: '#64748b' }}>Acessar /admin/pdv</small>
              <strong style={{ color: '#0f766e' }}>Entrar</strong>
            </div>
          </article>
        </Link>
        ) : null}

        {modulesState.isEnabled('admin_panel') ? (
        <Link href="/admin/modules" className="ui-card">
          <article className={styles.linkCard}>
            <Badge tone="warning">Config</Badge>
            <h2 className={styles.linkTitle}>Gestao de Modulos</h2>
            <p style={{ margin: 0, color: '#475569' }}>
              Habilite ou desabilite modulos por empresa com override sobre plano e default.
            </p>
            <div className={styles.meta}>
              <small style={{ color: '#64748b' }}>Acessar /admin/modules</small>
              <strong style={{ color: '#0f766e' }}>Entrar</strong>
            </div>
          </article>
        </Link>
        ) : null}
      </section>
    </main>
  );
}
