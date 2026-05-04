'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ActionTile } from '@/components/ui/ActionTile';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  getDeveloperCompanyBilling,
  listDeveloperCompanyInvoices,
  type CompanySubscription,
  type Invoice,
} from '@/features/modules/developer-commercial.api';
import { getCompanyModulesCommercialView } from '@/features/modules/modules.api';
import { useModules } from '@/features/modules/use-modules';
import { connectOrdersSocket, type SocketConnectionStatus } from '@/features/orders/orders.socket';
import { apiFetch, getApiBase } from '@/lib/api-fetch';
import type { OrderListItem, OrdersHeaders, OrdersListResponse } from '@/features/orders/orders.api';
import { hasDeveloperSession } from '@/lib/developer-session';

const MODULE_CARDS: Array<{
  key: 'orders' | 'kds' | 'pdv' | 'delivery' | 'menu';
  title: string;
  href: string;
  description: string;
}> = [
  {
    key: 'orders',
    title: 'Pedidos',
    href: '/admin/orders',
    description: 'Acompanhe volume, status e fluxo dos pedidos em tempo real.',
  },
  {
    key: 'kds',
    title: 'Cozinha / KDS',
    href: '/admin/kds',
    description: 'Controle da fila de preparo, priorizacao e finalizacao.',
  },
  {
    key: 'pdv',
    title: 'PDV / Balcao',
    href: '/admin/pdv',
    description: 'Operacao de caixa e venda rapida no balcao.',
  },
  {
    key: 'menu',
    title: 'Cardapio / Catalogo',
    href: '/admin/menu',
    description: 'Gerencie produtos, categorias, canais e opcionais do restaurante.',
  },
  {
    key: 'delivery',
    title: 'Delivery / Cardapio',
    href: '/delivery',
    description: 'Canal online do cliente para pedidos digitais.',
  },
];

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

type SaaSSnapshot = {
  companyName: string;
  companyStatus: string;
  subscription: CompanySubscription | null;
  modulesActive: number;
  modulesBlocked: number;
  latestInvoice: Invoice | null;
  billingMessage: string;
};

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<string>('');
  const [saasLoading, setSaasLoading] = useState(true);
  const [saasError, setSaasError] = useState<string | null>(null);
  const [saasData, setSaasData] = useState<SaaSSnapshot | null>(null);

  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId,
      branchId,
      userRole: 'admin',
    }),
    [branchId, companyId],
  );

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
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
      setIsRefreshing(false);
    }
  }, [headers]);

  const refreshSaasSnapshot = useCallback(async () => {
    setSaasLoading(true);
    setSaasError(null);
    try {
      if (!hasDeveloperSession()) {
        setSaasData({
          companyName: companyId,
          companyStatus: 'UNKNOWN',
          subscription: null,
          modulesActive: 0,
          modulesBlocked: 0,
          latestInvoice: null,
          billingMessage: 'Faça login tecnico em /developer-login para carregar dados comerciais.',
        });
        return;
      }

      const commercialView = await getCompanyModulesCommercialView({
        headers: {
          companyId,
          branchId,
          userRole: 'developer',
        },
        targetCompanyId: companyId,
      });

      const [billing, invoices] = await Promise.all([
        getDeveloperCompanyBilling(companyId),
        listDeveloperCompanyInvoices(companyId),
      ]);

      const modulesActive = commercialView.modules.filter((item) => item.effectiveEnabled).length;
      const modulesBlocked = commercialView.modules.length - modulesActive;
      const latestInvoice = [...invoices].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0] ?? null;

      setSaasData({
        companyName: commercialView.company.name,
        companyStatus: commercialView.company.status,
        subscription: billing.subscription,
        modulesActive,
        modulesBlocked,
        latestInvoice,
        billingMessage: billing.billingAccount
          ? `Cobranca em ${billing.billingAccount.billingEmail}`
          : 'Sem billing account cadastrada.',
      });
    } catch (err) {
      setSaasError(err instanceof Error ? err.message : 'Falha ao carregar dados comerciais.');
    } finally {
      setSaasLoading(false);
    }
  }, [branchId, companyId]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    void refreshSaasSnapshot();
  }, [refreshSaasSnapshot]);

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

  const cards = MODULE_CARDS.filter((item) => modules.isEnabled(item.key));
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
          <button type="button" className={styles.refreshButton} onClick={() => void refreshDashboard()} disabled={isRefreshing}>
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
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

      <section className={styles.saasGrid}>
        <Card className={styles.saasCard}>
          <p className={styles.saasLabel}>Status da empresa</p>
          {saasLoading ? <LoadingState label="Carregando status comercial..." /> : null}
          {!saasLoading ? (
            <>
              <h3 className={styles.saasTitle}>{saasData?.companyName ?? companyId}</h3>
              <div className={styles.metaRow}>
                <Badge>{`Status: ${saasData?.companyStatus ?? 'N/D'}`}</Badge>
                <Badge>{`Seu plano: ${saasData?.subscription?.plan?.name ?? 'Sem plano'}`}</Badge>
                <Badge tone={saasData?.subscription?.status === 'ACTIVE' || saasData?.subscription?.status === 'TRIAL' ? 'success' : 'warning'}>
                  {`Sua assinatura: ${saasData?.subscription?.status ?? 'SEM_ASSINATURA'}`}
                </Badge>
              </div>
            </>
          ) : null}
        </Card>

        <Card className={styles.saasCard}>
          <p className={styles.saasLabel}>Billing</p>
          {saasLoading ? <LoadingState label="Carregando cobranca..." /> : null}
          {!saasLoading ? (
            <>
              <p className={styles.saasText}>{saasData?.billingMessage ?? 'Dados de cobranca indisponiveis.'}</p>
              <p className={styles.saasText}>
                {`Ultima invoice: ${saasData?.latestInvoice ? saasData.latestInvoice.status : 'Nenhuma'}`}
              </p>
              <Link href={`/developer/companies/${companyId}/billing`} className={styles.saasLink}>
                Ver cobranca
              </Link>
            </>
          ) : null}
        </Card>

        <Card className={styles.saasCard}>
          <p className={styles.saasLabel}>Seus modulos</p>
          {saasLoading ? <LoadingState label="Carregando modulos comerciais..." /> : null}
          {!saasLoading ? (
            <div className={styles.metaRow}>
              <Badge tone="success">{`Ativos: ${saasData?.modulesActive ?? 0}`}</Badge>
              <Badge tone="danger">{`Bloqueados: ${saasData?.modulesBlocked ?? 0}`}</Badge>
              <Link href="/admin/modules" className={styles.saasLink}>Gerenciar modulos</Link>
            </div>
          ) : null}
        </Card>

        <Card className={styles.saasCard}>
          <p className={styles.saasLabel}>Alertas</p>
          {saasError ? <p className={styles.warningText}>{saasError}</p> : null}
          {!saasError && !saasLoading ? (
            <ul className={styles.alertList}>
              {!saasData?.subscription ? <li>Empresa sem assinatura ativa.</li> : null}
              {saasData?.subscription && saasData.subscription.status !== 'ACTIVE' && saasData.subscription.status !== 'TRIAL' ? (
                <li>Sua assinatura requer atencao imediata.</li>
              ) : null}
              {saasData?.latestInvoice?.status === 'PAST_DUE' ? <li>Pagamento pendente na ultima invoice.</li> : null}
              {(saasData?.modulesBlocked ?? 0) > 0 ? <li>Existem modulos bloqueados por plano ou override.</li> : null}
              {!saasData?.subscription && !saasData?.latestInvoice && (saasData?.modulesBlocked ?? 0) === 0 ? (
                <li>Nenhum alerta comercial no momento.</li>
              ) : null}
            </ul>
          ) : null}
        </Card>
      </section>

        <section className={styles.quickActions}>
          {canPdv ? <ActionTile href="/admin/pdv" title="Novo Pedido PDV" description="Venda rapida no balcao" tone="blue" /> : null}
          {canKds ? <ActionTile href="/admin/kds" title="Ver Cozinha" description="Fila de preparo ao vivo" tone="orange" /> : null}
          {canOrders ? <ActionTile href="/admin/orders" title="Ver Pedidos" description="Gestao de status e detalhes" tone="green" /> : null}
          {canMenu ? <ActionTile href="/admin/menu" title="Gerenciar Cardapio" description="Produtos, adicionais e destaques" tone="violet" /> : null}
          <ActionTile href="/admin/users" title="Usuarios" description="Acessos, roles e filiais" tone="green" />
          <ActionTile href="/admin/settings" title="Configuracoes" description="Empresa, filial, operacao e pagamentos" tone="blue" />
          {canDelivery ? <ActionTile href="/delivery" title="Cardapio Online" description="Experiencia do cliente" tone="red" /> : null}
        </section>

      {ordersError ? (
        <Card className={styles.warningCard}>
          <Badge tone="warning">Falha de dados</Badge>
          <p className={styles.warningText}>Nao foi possivel atualizar indicadores agora. Exibindo fallback seguro com zero.</p>
        </Card>
      ) : null}

      <section className={styles.grid}>
        {cards.map((card) => (
          <Link key={card.key} href={card.href} className={styles.cardLink}>
            <Card className={styles.card}>
              <Badge>{card.title}</Badge>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardText}>{card.description}</p>
            </Card>
          </Link>
        ))}
        <Link href="/admin/settings" className={styles.cardLink}>
          <Card className={styles.card}>
            <Badge>Configuracoes</Badge>
            <h2 className={styles.cardTitle}>Configuracoes</h2>
            <p className={styles.cardText}>Empresa, loja, horarios, canais, delivery, pagamentos e aparencia.</p>
          </Card>
        </Link>
        <Link href="/admin/users" className={styles.cardLink}>
          <Card className={styles.card}>
            <Badge>Usuarios</Badge>
            <h2 className={styles.cardTitle}>Usuarios e Permissoes</h2>
            <p className={styles.cardText}>Cadastre acessos, roles efetivas e filiais permitidas por operador.</p>
          </Card>
        </Link>
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

