'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ActionTile } from '@/components/ui/ActionTile';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatusPill } from '@/components/ui/StatusPill';
import { useModules } from '@/features/modules/use-modules';
import { connectOrdersSocket, type SocketConnectionStatus } from '@/features/orders/orders.socket';
import { apiFetch, getApiBase } from '@/lib/api-fetch';
import type { OrderListItem, OrdersHeaders, OrdersListResponse } from '@/features/orders/orders.api';

type DashboardKpis = {
  ordersToday: number;
  activeOrders: number;
  inPreparation: number;
  ready: number;
  revenue: number;
  averageTicket: number;
};

type OpenSessionResponse = {
  id: string;
  branchId: string;
  status: string;
  openedAt: string;
  openingBalance: number;
} | null;

const ZERO_KPIS: DashboardKpis = {
  ordersToday: 0,
  activeOrders: 0,
  inPreparation: 0,
  ready: 0,
  revenue: 0,
  averageTicket: 0,
};

const PREPARATION_STATUSES = new Set(['CONFIRMED', 'IN_PREPARATION', 'WAITING_DISPATCH']);
const READY_STATUSES = new Set(['READY', 'WAITING_PICKUP']);
const ACTIVE_STATUSES = new Set([
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
]);

export default function AdminDashboardPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });

  const [kpis, setKpis] = useState<DashboardKpis>(ZERO_KPIS);
  const [cashStatus, setCashStatus] = useState<'ABERTO' | 'FECHADO' | 'INDISPONIVEL'>('INDISPONIVEL');
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('connecting');
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string>('');
  const refreshInFlightRef = useRef(false);

  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId,
      branchId,
      userRole: 'admin',
    }),
    [branchId, companyId],
  );

  const refreshDashboard = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-company-id': headers.companyId,
      ...(headers.branchId ? { 'x-branch-id': headers.branchId } : {}),
    };

    try {
      const [ordersRes, pdvSession] = await Promise.all([
        apiFetch<OrdersListResponse>('/v2/orders?limit=200', {
          method: 'GET',
          headers: requestHeaders,
        }),
        apiFetch<OpenSessionResponse>('/v2/pdv/sessions/current/open', {
          method: 'GET',
          headers: requestHeaders,
        }).catch(() => null),
      ]);

      const rows = Array.isArray(ordersRes?.data) ? ordersRes.data : [];
      setKpis(computeKpis(rows));
      setCashStatus(pdvSession ? 'ABERTO' : 'FECHADO');
      setOrdersError(null);
      setLastUpdateAt(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      setKpis(ZERO_KPIS);
      setCashStatus('INDISPONIVEL');
      setOrdersError(err instanceof Error ? err.message : 'Falha ao carregar indicadores.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [headers]);

  useEffect(() => {
    void refreshDashboard();
    const intervalId = window.setInterval(() => {
      void refreshDashboard();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [refreshDashboard]);

  useEffect(() => {
    const socket = connectOrdersSocket({
      headers,
      onConnectionStatus: setSocketStatus,
      onEvent: () => {
        void refreshDashboard();
      },
    });

    return () => {
      socket.disconnect();
      setSocketStatus('disconnected');
    };
  }, [headers, refreshDashboard]);

  const environmentLabel = useMemo(() => {
    const base = getApiBase().toLowerCase();
    if (base.includes('hml')) return 'Ambiente HML';
    if (base.includes('localhost') || base.includes('127.0.0.1')) return 'Ambiente Local';
    return 'Ambiente Operacional';
  }, []);

  if (modules.loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando painel operacional..." />
      </main>
    );
  }

  const canPdv = modules.isEnabled('pdv');
  const canKds = modules.isEnabled('kds');
  const canOrders = modules.isEnabled('orders');
  const canDelivery = modules.isEnabled('delivery');
  const canMenu = modules.isEnabled('menu');

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <h1 className={styles.title}>Painel Operacional</h1>
          <p className={styles.sub}>Controle em tempo real do restaurante</p>
          {lastUpdateAt ? <p className={styles.lastUpdate}>Atualizado as {lastUpdateAt}</p> : null}
        </div>

        <div className={styles.rightHeader}>
          <div className={styles.statusRow}>
            <StatusPill tone={modules.isApiHealthy ? 'success' : 'warning'} pulse={modules.isApiHealthy}>
              {modules.isApiHealthy ? 'Sistema Online' : 'Sistema Instavel'}
            </StatusPill>
            <StatusPill tone="violet">{environmentLabel}</StatusPill>
            <StatusPill tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'} pulse={socketStatus === 'connected'}>
              Realtime {socketStatus === 'connected' ? 'Conectado' : socketStatus === 'connecting' ? 'Conectando' : 'Offline'}
            </StatusPill>
            <StatusPill tone={cashStatus === 'ABERTO' ? 'success' : cashStatus === 'FECHADO' ? 'warning' : 'danger'}>
              Caixa {cashStatus === 'ABERTO' ? 'Aberto' : cashStatus === 'FECHADO' ? 'Fechado' : 'Indisponivel'}
            </StatusPill>
          </div>
        </div>
      </section>

      <section className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Pedidos hoje</p>
          <strong className={styles.kpiValue}>{kpis.ordersToday}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Pedidos ativos</p>
          <strong className={styles.kpiValue}>{kpis.activeOrders}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Em preparo</p>
          <strong className={styles.kpiValue}>{kpis.inPreparation}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Prontos</p>
          <strong className={styles.kpiValue}>{kpis.ready}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Faturamento do dia</p>
          <strong className={styles.kpiValue}>R$ {formatCurrency(kpis.revenue)}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Ticket medio</p>
          <strong className={styles.kpiValue}>R$ {formatCurrency(kpis.averageTicket)}</strong>
        </Card>
      </section>

      <section className={styles.dashboardWorkspace}>
        <aside className={styles.categoryPanel}>
          <div className={styles.categoryHeader}>
            <span>Operacao</span>
            <strong>Categorias</strong>
          </div>

        <section className={styles.quickActions}>
          {canPdv ? <ActionTile href="/admin/pdv" title="Novo Pedido PDV" description="Venda rapida no balcao" tone="blue" /> : null}
          {canKds ? <ActionTile href="/admin/kds" title="Ver Cozinha" description="Fila de preparo ao vivo" tone="orange" /> : null}
          {canOrders ? <ActionTile href="/admin/orders" title="Ver Pedidos" description="Gestao de status e detalhes" tone="green" /> : null}
          {canMenu ? <ActionTile href="/admin/menu" title="Gerenciar Cardapio" description="Produtos, adicionais e destaques" tone="violet" /> : null}
          <ActionTile href="/admin/users" title="Usuarios" description="Acessos, roles e filiais" tone="green" />
          <ActionTile href="/admin/settings" title="Configuracoes" description="Empresa, filial, operacao e pagamentos" tone="blue" />
          <ActionTile href="/admin/billing" title="Assinatura e cobranca" description="Plano, limites e status da assinatura SaaS" tone="violet" />
          <ActionTile href="/admin/stock" title="Estoque" description="Itens, entrada e saida manual de estoque" tone="orange" />
          <ActionTile href="/admin/procurement" title="Compras e fornecedores" description="Fornecedores, pedidos, recebimento e contas a pagar" tone="blue" />
          <ActionTile href="/admin/production" title="Producao Interna" description="Ordens de preparo, execucao e finalizacao por filial" tone="orange" />
          <ActionTile href="/admin/tables" title="Mesas e Comandas" description="Salao, consumo local, transferencias e fechamento" tone="green" />
          <ActionTile href="/admin/payments" title="Pagamentos" description="PIX mock, webhooks e conciliacao operacional" tone="violet" />
          <ActionTile href="/admin/notifications" title="Notificacoes" description="Eventos operacionais em tempo real" tone="blue" />
          <ActionTile href="/admin/finance" title="Financeiro" description="Fluxo de caixa, DRE e conciliacao local" tone="green" />
          <ActionTile href="/admin/reports" title="Relatorios" description="Vendas, canais, financeiro e indicadores gerenciais" tone="violet" />
          {canDelivery ? <ActionTile href="/delivery" title="Cardapio Online" description="Experiencia do cliente" tone="red" /> : null}
        </section>
          {ordersError ? (
            <Card className={styles.warningCard}>
              <Badge tone="warning">Falha de dados</Badge>
              <p className={styles.warningText}>Nao foi possivel atualizar indicadores agora. Exibindo fallback seguro com zero.</p>
            </Card>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeKpis(orders: OrderListItem[]): DashboardKpis {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  const todayOrders = (orders ?? []).filter((order) => {
    const created = new Date(order?.createdAt ?? '');
    return created.getFullYear() === y && created.getMonth() === m && created.getDate() === d;
  });

  const activeOrders = todayOrders.filter((o) => ACTIVE_STATUSES.has(String(o?.status ?? ''))).length;
  const inPreparation = todayOrders.filter((o) => PREPARATION_STATUSES.has(String(o?.status ?? ''))).length;
  const ready = todayOrders.filter((o) => READY_STATUSES.has(String(o?.status ?? ''))).length;
  const revenue = todayOrders.reduce((acc, order) => acc + Number(order?.total ?? 0), 0);
  const averageTicket = todayOrders.length > 0 ? revenue / todayOrders.length : 0;

  return {
    ordersToday: todayOrders.length,
    activeOrders,
    inPreparation,
    ready,
    revenue,
    averageTicket,
  };
}
