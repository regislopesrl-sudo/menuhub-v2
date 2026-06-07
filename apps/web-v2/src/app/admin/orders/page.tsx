'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import styles from './page.module.css';
import { useOrders, type OrdersFilters } from '@/features/orders/use-orders';
import type { OrderDetail, OrderListItem } from '@/features/orders/orders.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { StatCard } from '@/components/ui/StatCard';
import { ModuleDisabled } from '@/components/module-disabled';
import { useModuleAccess } from '@/features/modules/use-module-access';

const STATUS_OPTIONS = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FINALIZED',
  'CANCELED',
  'REFUNDED',
] as const;

const ACTIVE_STATUSES = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'WAITING_PICKUP',
  'WAITING_DISPATCH',
  'OUT_FOR_DELIVERY',
];

type OrderStatus = (typeof STATUS_OPTIONS)[number];

type StatusAction = {
  label: string;
  status: OrderStatus;
  hint: string;
  danger?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_CONFIRMATION: 'Novo',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  WAITING_PICKUP: 'Aguardando retirada',
  WAITING_DISPATCH: 'Aguardando despacho',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  FINALIZED: 'Concluido',
  CANCELED: 'Cancelado',
  REFUNDED: 'Estornado',
};

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'Nao pago',
  PENDING: 'Pendente',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  REFUNDED: 'Estornado',
  CANCELED: 'Cancelado',
};

const KANBAN_COLUMNS = [
  { key: 'pending', title: 'Entrada', statuses: ['DRAFT', 'PENDING_CONFIRMATION'] },
  { key: 'confirmed', title: 'Confirmados', statuses: ['CONFIRMED'] },
  { key: 'preparing', title: 'Cozinha', statuses: ['IN_PREPARATION'] },
  { key: 'ready', title: 'Prontos', statuses: ['READY', 'WAITING_PICKUP', 'WAITING_DISPATCH'] },
  { key: 'route', title: 'Entrega', statuses: ['OUT_FOR_DELIVERY'] },
  { key: 'closed', title: 'Concluidos', statuses: ['DELIVERED', 'FINALIZED', 'CANCELED', 'REFUNDED'] },
];

type ViewMode = 'table' | 'kanban' | 'cards';
type OrderScope = 'recent' | 'active' | 'history';
type LatestFacetKey = 'all' | 'fast' | 'attention' | 'late' | 'platform' | 'ifood' | 'preparing' | 'canceled';

const DEFAULT_REOPEN_REASON = 'Reabertura operacional';

type OrderOperationalAlert = {
  tone: 'warning' | 'danger';
  title: string;
  description: string;
};

type OrderLifecycleStep = {
  key: string;
  label: string;
  description: string;
  statuses: string[];
};

type OperationalPreset = {
  label: string;
  description: string;
  viewMode: ViewMode;
  filters: OrdersFilters;
};

const OPERATIONAL_PRESETS: OperationalPreset[] = [
  {
    label: 'Entrada',
    description: 'Pedidos aguardando acao',
    viewMode: 'kanban',
    filters: { status: 'PENDING_CONFIRMATION', sortBy: 'createdAt', sortDirection: 'asc' },
  },
  {
    label: 'Atrasados',
    description: 'Prioridade de SLA',
    viewMode: 'cards',
    filters: { delayedOnly: true, activeOnly: true, sortBy: 'createdAt', sortDirection: 'asc' },
  },
  {
    label: 'Cozinha',
    description: 'Producao em andamento',
    viewMode: 'kanban',
    filters: { status: 'IN_PREPARATION', sortBy: 'updatedAt', sortDirection: 'desc' },
  },
  {
    label: 'Delivery',
    description: 'Pedidos do site',
    viewMode: 'table',
    filters: { channel: 'delivery', activeOnly: true, sortBy: 'createdAt', sortDirection: 'desc' },
  },
  {
    label: 'Fila ativa',
    description: 'Tudo que ainda exige acao',
    viewMode: 'kanban',
    filters: { activeOnly: true, sortBy: 'createdAt', sortDirection: 'asc' },
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (['READY', 'DELIVERED', 'FINALIZED'].includes(status)) return 'success';
  if (['CONFIRMED', 'IN_PREPARATION', 'WAITING_PICKUP', 'WAITING_DISPATCH', 'OUT_FOR_DELIVERY'].includes(status)) {
    return 'warning';
  }
  if (['CANCELED', 'REFUNDED'].includes(status)) return 'danger';
  return 'default';
}

function paymentTone(status?: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'PAID') return 'success';
  if (status === 'PENDING' || status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'REFUNDED' || status === 'CANCELED') return 'danger';
  return 'default';
}

function delayTone(level?: string): 'default' | 'warning' | 'danger' {
  if (level === 'urgent') return 'danger';
  if (level === 'attention') return 'warning';
  return 'default';
}

function channelLabel(channel?: string) {
  const normalized = (channel ?? '').toUpperCase();
  if (normalized === 'WEB' || normalized === 'DELIVERY') return 'Delivery';
  if (normalized === 'PDV') return 'PDV';
  if (normalized === 'IFOOD') return 'iFood';
  if (normalized === 'KIOSK') return 'Totem';
  if (normalized === 'QR' || normalized === 'WAITER_APP') return 'Garcom';
  if (normalized === 'WHATSAPP') return 'WhatsApp';
  return normalized || 'Canal';
}

function normalizedChannel(order: { channel?: string }) {
  return (order.channel ?? '').toUpperCase();
}

function isTableOrCommandOrder(order: { channel?: string }) {
  return ['QR', 'WAITER_APP', 'WAITER', 'TABLE', 'MESA', 'COMMAND', 'COMANDA'].includes(normalizedChannel(order));
}

function isDeliveryOrder(order: { channel?: string; deliveryAddress?: { street?: string; neighborhood?: string } }) {
  return (
    ['WEB', 'DELIVERY', 'IFOOD', 'WHATSAPP'].includes(normalizedChannel(order)) ||
    Boolean(order.deliveryAddress?.street || order.deliveryAddress?.neighborhood)
  );
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function paymentLabel(status?: string) {
  if (!status) return 'Pagamento';
  return PAYMENT_LABELS[status] ?? status;
}

function compactOrderCode(orderNumber: string) {
  const normalized = orderNumber.replace(/[^a-zA-Z0-9]/g, '');
  return normalized.slice(-6) || orderNumber;
}

function formatElapsed(minutes = 0) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'agora';
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.floor(minutes % 60);
  if (hours < 24) return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours > 0 ? `${days} d ${dayHours} h` : `${days} d`;
}

function scopeTitle(scope: OrderScope) {
  if (scope === 'active') return 'Gestao de pedidos';
  if (scope === 'history') return 'Historico de pedidos';
  return 'Ultimos pedidos';
}

function scopeDescription(scope: OrderScope) {
  if (scope === 'active') return 'Pedidos em aberto, preparo, retirada e entrega.';
  if (scope === 'history') return 'Pedidos concluidos para consulta e auditoria.';
  return 'Fila recente com cliente, numero, origem, valor, tempo e status.';
}

function connectionLabel(status: 'connecting' | 'connected' | 'disconnected') {
  if (status === 'connected') return 'Realtime conectado';
  if (status === 'connecting') return 'Conectando realtime';
  return 'Realtime offline';
}

function preparationLabel(order: OrderListItem) {
  if (!order.isDelayed) return `${order.elapsedMinutes ?? 0} min`;
  if (order.delayLevel === 'urgent') return `Urgente: ${order.elapsedMinutes ?? 0} min`;
  return `Atencao: ${order.elapsedMinutes ?? 0} min`;
}

function buildOrderStatusActions(order: OrderDetail): StatusAction[] {
  const delivery = isDeliveryOrder(order);

  switch (order.status) {
    case 'DRAFT':
    case 'PENDING_CONFIRMATION':
      return [
        {
          label: 'Confirmar pedido',
          status: 'CONFIRMED',
          hint: 'Aceita o pedido e libera para a fila operacional.',
        },
      ];
    case 'CONFIRMED':
      return [
        {
          label: 'Enviar para preparo',
          status: 'IN_PREPARATION',
          hint: 'Move o pedido para a cozinha/KDS.',
        },
        {
          label: 'Marcar pronto',
          status: 'READY',
          hint: 'Use quando o preparo foi concluido fora da fila.',
        },
      ];
    case 'IN_PREPARATION':
      return [
        {
          label: 'Marcar pronto',
          status: 'READY',
          hint: 'Pedido finalizado na cozinha e aguardando retirada ou entrega.',
        },
      ];
    case 'READY':
      return delivery
        ? [
            {
              label: 'Enviar para despacho',
              status: 'WAITING_DISPATCH',
              hint: 'Pedido saiu da cozinha e aguarda entregador/rota.',
            },
          ]
        : [
            {
              label: 'Aguardar retirada',
              status: 'WAITING_PICKUP',
              hint: 'Pedido saiu da cozinha e aguarda atendimento, mesa ou retirada.',
            },
          ];
    case 'WAITING_PICKUP':
      return [
        {
          label: 'Finalizar pedido',
          status: 'FINALIZED',
          hint: 'Fecha venda presencial, mesa ou retirada ja concluida.',
        },
      ];
    case 'WAITING_DISPATCH':
      return [
        {
          label: 'Saiu para entrega',
          status: 'OUT_FOR_DELIVERY',
          hint: 'Registra despacho para o entregador ou retirada externa.',
        },
      ];
    case 'OUT_FOR_DELIVERY':
      return [
        {
          label: 'Marcar entregue',
          status: 'DELIVERED',
          hint: 'Confirma entrega ao cliente.',
        },
      ];
    case 'DELIVERED':
      return [
        {
          label: 'Finalizar pedido',
          status: 'FINALIZED',
          hint: 'Encerra a conferencia operacional do pedido.',
        },
      ];
    default:
      return [];
  }
}

function buildOrderOperationalAlerts(order: OrderDetail): OrderOperationalAlert[] {
  const alerts: OrderOperationalAlert[] = [];
  const missingProducts = (order.items ?? []).filter((item) => !item.productId).length;
  const missingOptions = (order.items ?? []).reduce(
    (total, item) => total + (item.selectedOptions ?? []).filter((option) => !option.optionId).length,
    0,
  );
  const isDeliveryChannel = isDeliveryOrder(order);
  const hasDeliveryAddress = Boolean(
    order.deliveryAddress?.street || order.deliveryAddress?.neighborhood || order.deliveryAddress?.reference,
  );

  if (missingProducts > 0) {
    alerts.push({
      tone: 'warning',
      title: `${missingProducts} item(ns) sem vinculo de cardapio`,
      description: 'Confira o produto vendido para manter estoque, ficha tecnica e relatorios corretos.',
    });
  }

  if (missingOptions > 0) {
    alerts.push({
      tone: 'warning',
      title: `${missingOptions} adicional(is) sem vinculo`,
      description: 'Associe as opcoes aos adicionais cadastrados para evitar falha em custo e baixa de estoque.',
    });
  }

  if (!order.customer?.name) {
    alerts.push({
      tone: 'warning',
      title: 'Cliente nao identificado',
      description: 'Complete os dados do cliente quando o pedido exigir historico, entrega ou relacionamento.',
    });
  }

  if (isDeliveryChannel && !hasDeliveryAddress) {
    alerts.push({
      tone: 'danger',
      title: 'Entrega sem endereco completo',
      description: 'Revise rua, bairro, numero e referencia antes de despachar o pedido.',
    });
  }

  if (['DELIVERED', 'FINALIZED'].includes(order.status) && order.paymentSummary?.status !== 'PAID') {
    alerts.push({
      tone: 'danger',
      title: 'Pedido encerrado sem pagamento confirmado',
      description: 'Valide o recebimento no caixa ou ajuste o pagamento antes de fechar a conferencia.',
    });
  }

  return alerts;
}

function buildOrderLifecycleSteps(order: OrderDetail): OrderLifecycleStep[] {
  const delivery = isDeliveryOrder(order);
  return [
    {
      key: 'entry',
      label: 'Entrada',
      description: 'Pedido recebido',
      statuses: ['DRAFT', 'PENDING_CONFIRMATION'],
    },
    {
      key: 'confirmed',
      label: 'Confirmacao',
      description: 'Aceito para operacao',
      statuses: ['CONFIRMED'],
    },
    {
      key: 'kds',
      label: 'KDS/Cozinha',
      description: 'Preparo em andamento',
      statuses: ['IN_PREPARATION'],
    },
    {
      key: 'ready',
      label: 'Pronto',
      description: 'Producao concluida',
      statuses: ['READY'],
    },
    {
      key: 'handoff',
      label: delivery ? 'Despacho' : 'Retirada',
      description: delivery ? 'Aguardando rota/entregador' : 'Aguardando atendimento',
      statuses: delivery ? ['WAITING_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'] : ['WAITING_PICKUP', 'DELIVERED'],
    },
    {
      key: 'closed',
      label: 'Finalizacao',
      description: 'Pedido encerrado',
      statuses: ['FINALIZED'],
    },
  ];
}

function buildKpis(orders: OrderListItem[], total: number) {
  const active = orders.filter((order) => ACTIVE_STATUSES.includes(order.status)).length;
  const preparing = orders.filter((order) => order.status === 'IN_PREPARATION').length;
  const ready = orders.filter((order) => ['READY', 'WAITING_PICKUP', 'WAITING_DISPATCH'].includes(order.status)).length;
  const delayed = orders.filter((order) => order.isDelayed).length;
  const canceled = orders.filter((order) => order.status === 'CANCELED').length;
  const grossRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  const canceledRevenue = orders
    .filter((order) => ['CANCELED', 'REFUNDED'].includes(order.status) || ['CANCELED', 'REFUNDED'].includes(order.paymentStatus))
    .reduce((sum, order) => sum + (order.total || 0), 0);
  const netRevenue = Math.max(0, grossRevenue - canceledRevenue);
  const averageTicket = orders.length > 0 ? netRevenue / orders.length : 0;

  return { total, active, preparing, ready, delayed, canceled, revenue: netRevenue, grossRevenue, canceledRevenue, averageTicket };
}

function latestFacetMatches(order: OrderListItem, facet: LatestFacetKey) {
  const elapsed = order.elapsedMinutes ?? 0;
  const channel = channelLabel(order.channel);
  if (facet === 'fast') return elapsed <= 20;
  if (facet === 'attention') return elapsed > 20 && elapsed <= 80;
  if (facet === 'late') return elapsed > 80 || order.isDelayed;
  if (facet === 'platform') return channel !== 'iFood';
  if (facet === 'ifood') return channel === 'iFood';
  if (facet === 'preparing') return order.status === 'IN_PREPARATION';
  if (facet === 'canceled') return order.status === 'CANCELED';
  return true;
}

function orderPriority(a: OrderListItem, b: OrderListItem) {
  const delay = Number(b.isDelayed) - Number(a.isDelayed);
  if (delay !== 0) return delay;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export default function AdminOrdersPage() {
  const headers = useMemo(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin' as const,
    }),
    [],
  );

  const {
    orders,
    loading,
    error,
    summary,
    summaryLoading,
    summaryError,
    filters,
    pagination,
    paginationInfo,
    socketStatus,
    selectedOrderId,
    selectedOrder,
    detailLoading,
    detailError,
    isUpdatingStatus,
    reload,
    setFilters,
    changePage,
    changeLimit,
    openOrderDetail,
    closeOrderDetail,
    updateOrderStatus,
    cancelSelectedOrder,
    addInternalNote,
    refundSelectedOrderMock,
  } = useOrders(headers);
  const access = useModuleAccess(headers, 'orders');

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState('all');
  const [orderScope, setOrderScope] = useState<OrderScope>('recent');
  const [latestFacet, setLatestFacet] = useState<LatestFacetKey>('all');
  const [cancelReasonCode, setCancelReasonCode] = useState('customer_request');
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [estimateMinutes, setEstimateMinutes] = useState('30');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('operator_adjustment');
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [reopenReason, setReopenReason] = useState(DEFAULT_REOPEN_REASON);
  const [draftFilters, setDraftFilters] = useState<OrdersFilters>({
    sortBy: 'createdAt',
    sortDirection: 'desc',
    ...filters,
  });

  useEffect(() => {
    setShowReopenConfirm(false);
    setReopenReason(DEFAULT_REOPEN_REASON);
  }, [selectedOrderId]);

  const sortedOrders = useMemo(() => [...(orders ?? [])].sort(orderPriority), [orders]);
  const latestVisibleOrders = useMemo(
    () => sortedOrders.filter((order) => latestFacetMatches(order, latestFacet)),
    [latestFacet, sortedOrders],
  );
  const activeChannels = useMemo(
    () => Array.from(new Set(sortedOrders.map((order) => channelLabel(order.channel)).filter(Boolean))),
    [sortedOrders],
  );
  const tableOrdersCount = sortedOrders.filter(isTableOrCommandOrder).length;
  const deliveryOrdersCount = sortedOrders.filter(isDeliveryOrder).length;
  const customerCount = new Set(sortedOrders.map((order) => order.customerName?.trim()).filter(Boolean)).size;
  const urgentOrders = sortedOrders.filter((order) => order.delayLevel === 'urgent').length;
  const branchLabel = headers.branchId || 'branch-demo';
  const localKpis = buildKpis(sortedOrders, paginationInfo.total);
  const kpis = summary
    ? {
        total: summary.totalOrders,
        active: summary.activeOrders,
        preparing: summary.preparingOrders,
        ready: summary.readyOrders,
        delayed: summary.delayedOrders,
        canceled: summary.canceledOrders,
        revenue: summary.netRevenue,
        grossRevenue: summary.grossRevenue,
        canceledRevenue: summary.canceledRevenue,
        averageTicket: summary.averageTicket,
      }
    : localKpis;
  const kpiHint = summaryLoading
    ? 'Calculando no backend...'
    : summaryError
      ? 'Fallback local'
      : 'Resumo global do dia';
  const quickFilters: Array<{ key: string; label: string; hint: string; count: number | string; filters: OrdersFilters }> = [
    {
      key: 'all',
      label: 'Todos',
      hint: 'Mais recentes',
      count: paginationInfo.total,
      filters: { sortBy: 'createdAt', sortDirection: 'desc' },
    },
    {
      key: 'active',
      label: 'Ativos',
      hint: 'Exigem acao',
      count: kpis.active,
      filters: { activeOnly: true, sortBy: 'createdAt', sortDirection: 'asc' },
    },
    {
      key: 'preparing',
      label: 'Preparo',
      hint: 'Cozinha',
      count: kpis.preparing,
      filters: { status: 'IN_PREPARATION', sortBy: 'createdAt', sortDirection: 'asc' },
    },
    {
      key: 'ready',
      label: 'Prontos',
      hint: 'Retirada/entrega',
      count: kpis.ready,
      filters: { status: 'READY', sortBy: 'updatedAt', sortDirection: 'desc' },
    },
    {
      key: 'delayed',
      label: 'Atrasados',
      hint: 'Prioridade',
      count: kpis.delayed,
      filters: { delayedOnly: true, activeOnly: true, sortBy: 'createdAt', sortDirection: 'asc' },
    },
    {
      key: 'closed',
      label: 'Concluidos',
      hint: 'Historico',
      count: Math.max(0, kpis.total - kpis.active),
      filters: { closedOnly: true, sortBy: 'createdAt', sortDirection: 'desc' },
    },
  ];
  const latestFacets: Array<{ key: LatestFacetKey; label: string; hint: string; count: number }> = [
    { key: 'all', label: 'Todos', hint: 'Lista carregada', count: sortedOrders.length },
    { key: 'fast', label: '0 - 20 min', hint: 'Dentro do tempo', count: sortedOrders.filter((order) => latestFacetMatches(order, 'fast')).length },
    { key: 'attention', label: '30 - 80 min', hint: 'Acompanhar', count: sortedOrders.filter((order) => latestFacetMatches(order, 'attention')).length },
    { key: 'late', label: '+80 min', hint: 'Prioridade', count: sortedOrders.filter((order) => latestFacetMatches(order, 'late')).length },
    { key: 'platform', label: 'Plataforma', hint: 'MenuHub e canais locais', count: sortedOrders.filter((order) => latestFacetMatches(order, 'platform')).length },
    { key: 'ifood', label: 'iFood', hint: 'Marketplace', count: sortedOrders.filter((order) => latestFacetMatches(order, 'ifood')).length },
    { key: 'preparing', label: 'Em preparacao', hint: 'Cozinha', count: sortedOrders.filter((order) => latestFacetMatches(order, 'preparing')).length },
    { key: 'canceled', label: 'Cancelado', hint: 'Revisar', count: sortedOrders.filter((order) => latestFacetMatches(order, 'canceled')).length },
  ];

  if (access.loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Validando acesso ao modulo de pedidos..." />
      </main>
    );
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="Pedidos" reason={access.error ?? 'Modulo orders desativado.'} />;
  }

  const applyFilters = () => {
    setFilters({
      status: draftFilters.status || undefined,
      channel: draftFilters.channel || undefined,
      paymentStatus: draftFilters.paymentStatus || undefined,
      search: draftFilters.search?.trim() || undefined,
      activeOnly: draftFilters.activeOnly || undefined,
      closedOnly: draftFilters.closedOnly || undefined,
      delayedOnly: draftFilters.delayedOnly || undefined,
      sortBy: draftFilters.sortBy,
      sortDirection: draftFilters.sortDirection,
      createdFrom: draftFilters.createdFrom || undefined,
      createdTo: draftFilters.createdTo || undefined,
    });
  };

  const applyPreset = (preset: OperationalPreset) => {
    setActiveQuickFilter(preset.label);
    setLatestFacet('all');
    setViewMode(preset.viewMode);
    setDraftFilters(preset.filters);
    setFilters(preset.filters);
  };

  const applyQuickFilter = (quickFilter: (typeof quickFilters)[number]) => {
    setActiveQuickFilter(quickFilter.key);
    setLatestFacet('all');
    setDraftFilters(quickFilter.filters);
    setFilters(quickFilter.filters);
  };

  const applyScope = (scope: OrderScope) => {
    const scopeFilters: OrdersFilters =
      scope === 'active'
        ? { activeOnly: true, sortBy: 'createdAt', sortDirection: 'asc' }
        : scope === 'history'
          ? { closedOnly: true, sortBy: 'createdAt', sortDirection: 'desc' }
          : { sortBy: 'createdAt', sortDirection: 'desc' };

    setOrderScope(scope);
    setLatestFacet('all');
    setActiveQuickFilter(scope === 'active' ? 'active' : scope === 'history' ? 'closed' : 'all');
    setDraftFilters(scopeFilters);
    setFilters(scopeFilters);
  };

  const submitLatestSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters = {
      ...draftFilters,
      search: draftFilters.search?.trim() || undefined,
      sortBy: draftFilters.sortBy ?? 'createdAt',
      sortDirection: draftFilters.sortDirection ?? 'desc',
    };
    setActiveQuickFilter(nextFilters.search ? 'search' : 'all');
    setLatestFacet('all');
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  };

  const submitCancel = async () => {
    if (!selectedOrder) return;
    await cancelSelectedOrder(selectedOrder.id, {
      reasonCode: cancelReasonCode,
      reasonText: cancelReasonText || undefined,
      internalNote: internalNote || undefined,
    });
    setCancelReasonText('');
  };

  const submitInternalNote = async () => {
    if (!selectedOrder || !internalNote.trim()) return;
    await addInternalNote(selectedOrder.id, internalNote.trim());
    setInternalNote('');
  };

  const submitEstimateTime = async () => {
    if (!selectedOrder) return;
    const minutes = Number(estimateMinutes || '0');
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    await addInternalNote(selectedOrder.id, `Tempo operacional ajustado para ${minutes} min.`);
  };

  const submitReopenOrder = async () => {
    if (!selectedOrder || isUpdatingStatus === 'CONFIRMED') return;
    const reason = reopenReason.trim() || DEFAULT_REOPEN_REASON;
    await updateOrderStatus(selectedOrder.id, 'CONFIRMED');
    await addInternalNote(selectedOrder.id, `Pedido reaberto. Motivo: ${reason}`);
    setShowReopenConfirm(false);
    setReopenReason(DEFAULT_REOPEN_REASON);
  };

  const printSelectedOrder = () => {
    window.print();
  };

  const printOrdersList = () => {
    window.print();
  };

  const submitRefund = async () => {
    if (!selectedOrder) return;
    const amount = Number(refundAmount || '0');
    if (!Number.isFinite(amount) || amount <= 0) return;
    await refundSelectedOrderMock(selectedOrder.id, {
      amount,
      reasonCode: refundReason,
      reasonText: refundReason,
    });
    setRefundAmount('');
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title={scopeTitle(orderScope)}
        subtitle={scopeDescription(orderScope)}
        right={
          <div className={styles.actions}>
            <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
              {connectionLabel(socketStatus)}
            </Badge>
            <Button onClick={printOrdersList}>Imprimir lista</Button>
            <a className={styles.newOrderLink} href="/admin/pdv" aria-label="Novo pedido">
              +
            </a>
            <Button variant="primary" onClick={() => void reload()}>
              Atualizar
            </Button>
          </div>
        }
      />

      <Card className={styles.latestShell}>
        <div className={styles.scopeTabs} role="tablist" aria-label="Modo de pedidos">
          {([
            { key: 'recent', label: 'Ultimos pedidos', hint: 'Todos recentes' },
            { key: 'active', label: 'Gestao de pedidos', hint: 'Somente ativos' },
            { key: 'history', label: 'Historico', hint: 'Concluidos' },
          ] as Array<{ key: OrderScope; label: string; hint: string }>).map((scope) => (
            <button
              key={scope.key}
              type="button"
              role="tab"
              aria-selected={orderScope === scope.key}
              className={orderScope === scope.key ? styles.scopeTabActive : undefined}
              onClick={() => applyScope(scope.key)}
            >
              <strong>{scope.label}</strong>
              <small>{scope.hint}</small>
            </button>
          ))}
        </div>
        <div className={styles.portalShortcuts} aria-label="Atalhos operacionais de pedidos">
          <button
            type="button"
            className={orderScope === 'active' ? styles.portalShortcutActive : undefined}
            onClick={() => applyScope('active')}
          >
            <strong>Gestao de pedidos</strong>
            <span>{kpis.active}</span>
            <small>Fila operacional</small>
          </button>
          <a href="/admin/tables">
            <strong>Mesas/Comandas</strong>
            <span>{tableOrdersCount}</span>
            <small>Salao e consumo local</small>
          </a>
          <button
            type="button"
            className={orderScope === 'history' ? styles.portalShortcutActive : undefined}
            onClick={() => applyScope('history')}
          >
            <strong>Historico de pedidos</strong>
            <span>{Math.max(0, kpis.total - kpis.active)}</span>
            <small>Consulta e auditoria</small>
          </button>
          <a href="/admin/logistics">
            <strong>Gestao de entregas</strong>
            <span>{deliveryOrdersCount}</span>
            <small>Despacho e entregadores</small>
          </a>
          <a href="/delivery">
            <strong>Cardapio online</strong>
            <span>Web</span>
            <small>Experiencia do cliente</small>
          </a>
          <a href="/admin/crm">
            <strong>Clientes</strong>
            <span>{customerCount}</span>
            <small>Relacionamento</small>
          </a>
          <a href="/admin/promotions">
            <strong>Food marketing</strong>
            <span>Novo</span>
            <small>Campanhas e cupons</small>
          </a>
        </div>
        <div className={styles.latestHeader}>
          <div>
            <span className={styles.eyebrow}>{orderScope === 'history' ? 'Consulta' : 'Operacao'}</span>
            <h2>{scopeTitle(orderScope)}</h2>
            <p>
              {summaryLoading ? 'Atualizando indicadores...' : `${kpis.total} pedido(s) no periodo | ${kpis.active} ativo(s) | ${kpis.delayed} atrasado(s)`}
            </p>
          </div>
          <form className={styles.latestSearch} onSubmit={submitLatestSearch}>
            <Input
              placeholder="Pesquise por cliente ou numero do pedido"
              value={draftFilters.search ?? ''}
              onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            />
            <Button type="submit">Buscar</Button>
          </form>
        </div>

        {orderScope === 'history' ? (
          <div className={styles.historyFilters} aria-label="Filtros do historico de pedidos">
            <label>
              <span>Inicio</span>
              <Input
                type="date"
                value={draftFilters.createdFrom ?? ''}
                onChange={(event) => setDraftFilters((current) => ({ ...current, createdFrom: event.target.value }))}
              />
            </label>
            <label>
              <span>Fim</span>
              <Input
                type="date"
                value={draftFilters.createdTo ?? ''}
                onChange={(event) => setDraftFilters((current) => ({ ...current, createdTo: event.target.value }))}
              />
            </label>
            <label>
              <span>Status</span>
              <Select
                value={draftFilters.status ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    status: event.target.value || undefined,
                    closedOnly: true,
                  }))
                }
              >
                <option value="">Todos encerrados</option>
                <option value="DELIVERED">Entregues</option>
                <option value="FINALIZED">Finalizados</option>
                <option value="CANCELED">Cancelados</option>
                <option value="REFUNDED">Reembolsados</option>
              </Select>
            </label>
            <label>
              <span>Canal</span>
              <Select
                value={draftFilters.channel ?? ''}
                onChange={(event) => setDraftFilters((current) => ({ ...current, channel: event.target.value || undefined }))}
              >
                <option value="">Todos os canais</option>
                <option value="delivery">Delivery</option>
                <option value="pdv">PDV</option>
                <option value="waiter">Mesa/Comanda</option>
                <option value="ifood">iFood</option>
                <option value="whatsapp">WhatsApp</option>
              </Select>
            </label>
            <label>
              <span>Pagamento</span>
              <Select
                value={draftFilters.paymentStatus ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, paymentStatus: event.target.value || undefined }))
                }
              >
                <option value="">Todos pagamentos</option>
                <option value="PAID">Pago</option>
                <option value="PENDING">Pendente</option>
                <option value="UNPAID">Nao pago</option>
                <option value="REFUNDED">Reembolsado</option>
                <option value="CANCELED">Cancelado</option>
              </Select>
            </label>
            <div className={styles.historyFilterActions}>
              <Button
                onClick={() => {
                  const clean = { closedOnly: true, sortBy: 'createdAt' as const, sortDirection: 'desc' as const };
                  setActiveQuickFilter('closed');
                  setLatestFacet('all');
                  setDraftFilters(clean);
                  setFilters(clean);
                }}
              >
                Limpar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setActiveQuickFilter('history');
                  setLatestFacet('all');
                  applyFilters();
                }}
              >
                Aplicar consulta
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.liveFacets} aria-label="Filtros rapidos da lista de pedidos">
          {latestFacets.map((facet) => (
            <button
              key={facet.key}
              type="button"
              className={latestFacet === facet.key ? styles.liveFacetActive : undefined}
              onClick={() => setLatestFacet(facet.key)}
            >
              <span>{facet.count}</span>
              <strong>{facet.label}</strong>
              <small>{facet.hint}</small>
            </button>
          ))}
        </div>

        <div className={styles.quickFilters}>
          {quickFilters.map((quickFilter) => (
            <button
              key={quickFilter.key}
              type="button"
              className={activeQuickFilter === quickFilter.key ? styles.quickFilterActive : undefined}
              onClick={() => applyQuickFilter(quickFilter)}
            >
              <strong>{quickFilter.label}</strong>
              <span>{quickFilter.count}</span>
              <small>{quickFilter.hint}</small>
            </button>
          ))}
        </div>

        <div className={styles.latestWorkspace}>
          <LatestOrdersList loading={loading} orders={latestVisibleOrders} selectedOrderId={selectedOrderId} onOpen={openOrderDetail} />
          <aside className={styles.inlineDetail}>
            {!selectedOrderId ? (
              <EmptyState title="Nenhum pedido selecionado" description="Clique em um pedido da lista para ver cliente, itens, pagamento e acoes." />
            ) : null}

            {selectedOrderId ? (
              <>
                <div className={styles.drawerHeader}>
                  <div>
                    <span className={styles.eyebrow}>Detalhe do pedido</span>
                    <h2>Pedido {selectedOrder?.orderNumber ?? selectedOrderId}</h2>
                  </div>
                  <Button onClick={closeOrderDetail}>Limpar selecao</Button>
                </div>

                {detailLoading ? <LoadingState label="Carregando detalhe..." /> : null}
                {detailError ? (
                  <div className={styles.errorBox}>
                    <span>{detailError}</span>
                    <Button onClick={() => openOrderDetail(selectedOrderId)}>Tentar novamente</Button>
                  </div>
                ) : null}

                {selectedOrder ? (
                  <>
                    <Card className={styles.detailHero}>
                      <div className={styles.detailHeroTop}>
                        <div>
                          <span className={styles.eyebrow}>Pedido aberto</span>
                          <h3>{selectedOrder.customer?.name ?? 'Cliente nao informado'}</h3>
                          <p>{channelLabel(selectedOrder.channel)} | {formatDate(selectedOrder.createdAt)}</p>
                        </div>
                        <div className={styles.detailHeroBadges}>
                          <Badge tone={statusTone(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                          <Badge tone={paymentTone(selectedOrder.paymentSummary?.status)}>{paymentLabel(selectedOrder.paymentSummary?.status)}</Badge>
                          <Badge tone={delayTone(selectedOrder.delayLevel)}>{preparationLabel(detailToListItemLike(selectedOrder))}</Badge>
                        </div>
                      </div>
                      <div className={styles.detailHeroMetrics}>
                        <div>
                          <small>Total</small>
                          <strong>{formatCurrency(selectedOrder.totals.total)}</strong>
                        </div>
                        <div>
                          <small>Itens</small>
                          <strong>{selectedOrder.items?.length ?? 0}</strong>
                        </div>
                        <div>
                          <small>Pago</small>
                          <strong>{formatCurrency(selectedOrder.paymentSummary?.paidAmount ?? 0)}</strong>
                        </div>
                        <div>
                          <small>Filial</small>
                          <strong>{branchLabel}</strong>
                        </div>
                      </div>
                    </Card>

                    <OrderOperationalAlerts alerts={buildOrderOperationalAlerts(selectedOrder)} />
                    <OrderLifecyclePanel selectedOrder={selectedOrder} />

                    <div className={styles.detailSplit}>
                      <Card className={styles.section}>
                        <h3 className={styles.sectionTitle}>Cliente</h3>
                        <div className={styles.infoGridSingle}>
                          <InfoRow label="Nome" value={selectedOrder.customer?.name ?? 'Nao informado'} />
                          <InfoRow label="Telefone" value={selectedOrder.customer?.phone ?? '-'} />
                          <InfoRow label="Canal" value={channelLabel(selectedOrder.channel)} />
                        </div>
                      </Card>
                      <Card className={styles.section}>
                        <h3 className={styles.sectionTitle}>Entrega</h3>
                        <div className={styles.infoGridSingle}>
                          <InfoRow label="Bairro" value={selectedOrder.deliveryAddress?.neighborhood ?? '-'} />
                          <InfoRow
                            label="Endereco"
                            value={[
                              selectedOrder.deliveryAddress?.street,
                              selectedOrder.deliveryAddress?.number,
                              selectedOrder.deliveryAddress?.neighborhood,
                            ]
                              .filter(Boolean)
                              .join(', ') || '-'}
                          />
                          <InfoRow label="Referencia" value={selectedOrder.deliveryAddress?.reference ?? '-'} />
                        </div>
                      </Card>
                    </div>

                    <Card className={styles.section}>
                      <div className={styles.sectionTitleRow}>
                        <h3 className={styles.sectionTitle}>Itens e adicionais</h3>
                        <Badge tone="default">{selectedOrder.items?.length ?? 0} item(ns)</Badge>
                      </div>
                      <div className={styles.itemsList}>
                        {(selectedOrder.items ?? []).map((item) => (
                          <div key={item.id} className={styles.itemRow}>
                            <div>
                              <strong>{item.quantity}x {item.name}</strong>
                              <span>{formatCurrency(item.unitPrice)} un.</span>
                            </div>
                            <strong>{formatCurrency(item.totalPrice)}</strong>
                            {item.selectedOptions && item.selectedOptions.length > 0 ? (
                              <small>
                                + {item.selectedOptions.map((option) => `${option.name} (${formatCurrency(option.price)})`).join(', ')}
                              </small>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className={`${styles.section} ${styles.totalsCard}`}>
                      <div className={styles.sectionTitleRow}>
                        <h3 className={styles.sectionTitle}>Resumo financeiro</h3>
                        <Badge tone={paymentTone(selectedOrder.paymentSummary?.status)}>{paymentLabel(selectedOrder.paymentSummary?.status)}</Badge>
                      </div>
                      <div className={styles.totalRows}>
                        <InfoRow label="Subtotal" value={formatCurrency(selectedOrder.totals.subtotal)} />
                        <InfoRow label="Desconto" value={`- ${formatCurrency(selectedOrder.totals.discount)}`} />
                        <InfoRow label="Taxa entrega" value={formatCurrency(selectedOrder.totals.deliveryFee)} />
                        <InfoRow label="Total final" value={formatCurrency(selectedOrder.totals.total)} strong />
                        <InfoRow label="Pago" value={formatCurrency(selectedOrder.paymentSummary?.paidAmount ?? 0)} />
                        <InfoRow label="Reembolsado" value={formatCurrency(selectedOrder.paymentSummary?.refundedAmount ?? 0)} />
                      </div>
                    </Card>

                    <OrderHistoryPanel
                      selectedOrder={selectedOrder}
                      showFullHistory={showFullHistory}
                      onToggle={() => setShowFullHistory((current) => !current)}
                    />

                    <Card className={styles.section}>
                      <div className={styles.sectionTitleRow}>
                        <h3 className={styles.sectionTitle}>Acoes rapidas</h3>
                        <Badge tone="default">Status</Badge>
                      </div>
                      <div className={styles.drawerCommandRow}>
                        <Button onClick={printSelectedOrder}>Imprimir</Button>
                        <Input
                          placeholder="Tempo em min"
                          value={estimateMinutes}
                          onChange={(event) => setEstimateMinutes(event.target.value)}
                        />
                        <Button onClick={() => void submitEstimateTime()}>Salvar tempo</Button>
                      </div>
                      {['FINALIZED', 'DELIVERED', 'CANCELED', 'REFUNDED'].includes(selectedOrder.status) ? (
                        <div className={styles.reopenBox}>
                          <div className={styles.reopenCopy}>
                            <strong>Pedido encerrado</strong>
                            <span>Use reabrir para voltar o pedido ao fluxo operacional.</span>
                          </div>
                          {!showReopenConfirm ? (
                            <Button variant="primary" onClick={() => setShowReopenConfirm(true)}>
                              Reabrir pedido
                            </Button>
                          ) : null}
                          {showReopenConfirm ? (
                            <div className={styles.reopenConfirm}>
                              <div className={styles.reopenWarning}>
                                <strong>Confirmar reabertura</strong>
                                <span>O pedido volta para Confirmado e entra novamente no fluxo operacional.</span>
                              </div>
                              <Input
                                placeholder="Motivo da reabertura"
                                value={reopenReason}
                                onChange={(event) => setReopenReason(event.target.value)}
                              />
                              <div className={styles.reopenActions}>
                                <Button
                                  disabled={isUpdatingStatus === 'CONFIRMED'}
                                  onClick={() => {
                                    setShowReopenConfirm(false);
                                    setReopenReason(DEFAULT_REOPEN_REASON);
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  variant="primary"
                                  disabled={isUpdatingStatus === 'CONFIRMED'}
                                  onClick={() => void submitReopenOrder()}
                                >
                                  {isUpdatingStatus === 'CONFIRMED' ? 'Reabrindo...' : 'Confirmar reabertura'}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <OrderStatusActions
                        selectedOrder={selectedOrder}
                        isUpdatingStatus={isUpdatingStatus}
                        onUpdate={(status) => void updateOrderStatus(selectedOrder.id, status)}
                      />
                    </Card>

                    <Card className={styles.section}>
                      <div className={styles.sectionTitleRow}>
                        <h3 className={styles.sectionTitle}>Cancelamento e observacoes</h3>
                        <Badge tone="warning">Controle</Badge>
                      </div>
                      <div className={styles.formGrid}>
                        <Select value={cancelReasonCode} onChange={(event) => setCancelReasonCode(event.target.value)}>
                          <option value="customer_request">Solicitacao do cliente</option>
                          <option value="out_of_stock">Item indisponivel</option>
                          <option value="payment_issue">Problema no pagamento</option>
                          <option value="duplicate_order">Pedido duplicado</option>
                          <option value="operator_error">Erro operacional</option>
                        </Select>
                        <Input placeholder="Detalhe do cancelamento" value={cancelReasonText} onChange={(event) => setCancelReasonText(event.target.value)} />
                        <Button
                          variant="danger"
                          disabled={isUpdatingStatus === 'CANCELED' || ['CANCELED', 'FINALIZED', 'REFUNDED'].includes(selectedOrder.status)}
                          onClick={() => void submitCancel()}
                        >
                          Cancelar com motivo
                        </Button>
                      </div>
                      <div className={styles.formGrid}>
                        <Input placeholder="Observacao interna" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
                        <Button onClick={() => void submitInternalNote()}>Adicionar observacao</Button>
                      </div>
                    </Card>
                  </>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>
      </Card>

      <section className={styles.compactKpis}>
        <StatCard label="Faturamento liquido" value={summaryLoading ? '...' : formatCurrency(kpis.revenue)} hint={kpiHint} />
        <StatCard label="Ticket medio" value={summaryLoading ? '...' : formatCurrency(kpis.averageTicket)} hint={`${kpis.canceled} cancelados`} />
        <StatCard label="Em preparo" value={summaryLoading ? '...' : kpis.preparing} />
        <StatCard label="Prontos" value={summaryLoading ? '...' : kpis.ready} />
      </section>

      <Card className={styles.advancedToggle}>
        <div>
          <span className={styles.eyebrow}>Operacao avancada</span>
          <strong>SLA, kanban, filtros completos e acoes de detalhe</strong>
          <small>
            {urgentOrders} urgente(s) | {activeChannels.length || 0} canal(is) ativo(s) | filial {branchLabel}
          </small>
        </div>
        <Button onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? 'Ocultar operacao avancada' : 'Mostrar operacao avancada'}
        </Button>
      </Card>

      {showAdvanced ? (
        <>
          <Card className={styles.operationsBar}>
            <div className={styles.operationSummary}>
              <span className={styles.eyebrow}>Comando rapido</span>
              <strong>SLA, canais e prioridades</strong>
              <small>
                {urgentOrders} urgente(s) | {activeChannels.length || 0} canal(is) ativo(s) | filial {branchLabel}
              </small>
            </div>
            <div className={styles.operationButtons}>
              {OPERATIONAL_PRESETS.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </Card>

          <Card className={styles.filters}>
        <div className={styles.filterHeader}>
          <div>
            <strong>Filtros rapidos</strong>
            <span>Refine por status, canal, pagamento, periodo e atraso.</span>
          </div>
          <SectionTabs
            active={viewMode}
            onChange={setViewMode}
            tabs={[
              { key: 'table', label: 'Tabela' },
              { key: 'kanban', label: 'Kanban' },
              { key: 'cards', label: 'Cards' },
            ]}
          />
        </div>
        <div className={styles.filterGrid}>
          <Input
            placeholder="Buscar pedido ou cliente"
            value={draftFilters.search ?? ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <Select
            value={draftFilters.status ?? ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value || undefined }))}
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
          <Select
            value={draftFilters.channel ?? ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, channel: event.target.value || undefined }))}
          >
            <option value="">Todos os canais</option>
            <option value="delivery">Delivery</option>
            <option value="pdv">PDV</option>
            <option value="kiosk">Totem</option>
            <option value="waiter">Garcom/Mesa</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
          <Select
            value={draftFilters.paymentStatus ?? ''}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, paymentStatus: event.target.value || undefined }))
            }
          >
            <option value="">Todos pagamentos</option>
            <option value="UNPAID">Nao pago</option>
            <option value="PENDING">Pendente</option>
            <option value="PAID">Pago</option>
            <option value="REFUNDED">Estornado</option>
            <option value="CANCELED">Cancelado</option>
          </Select>
          <Input
            type="date"
            value={draftFilters.createdFrom ?? ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, createdFrom: event.target.value }))}
          />
          <Input
            type="date"
            value={draftFilters.createdTo ?? ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, createdTo: event.target.value }))}
          />
          <Select value={String(pagination.limit)} onChange={(event) => changeLimit(Number(event.target.value))}>
            <option value="10">10 por pagina</option>
            <option value="20">20 por pagina</option>
            <option value="50">50 por pagina</option>
            <option value="100">100 por pagina</option>
          </Select>
          <Select
            value={`${draftFilters.sortBy ?? 'createdAt'}:${draftFilters.sortDirection ?? 'desc'}`}
            onChange={(event) => {
              const [sortBy, sortDirection] = event.target.value.split(':') as [
                OrdersFilters['sortBy'],
                OrdersFilters['sortDirection'],
              ];
              setDraftFilters((current) => ({ ...current, sortBy, sortDirection }));
            }}
          >
            <option value="createdAt:desc">Mais recentes</option>
            <option value="createdAt:asc">Mais antigos</option>
            <option value="updatedAt:desc">Atualizados recentemente</option>
            <option value="total:desc">Maior valor</option>
            <option value="status:asc">Status A-Z</option>
          </Select>
        </div>
        <div className={styles.filterFooter}>
          <label className={styles.checkPill}>
            <input
              type="checkbox"
              checked={Boolean(draftFilters.activeOnly)}
              onChange={(event) => setDraftFilters((current) => ({ ...current, activeOnly: event.target.checked }))}
            />
            Somente ativos
          </label>
          <label className={styles.checkPill}>
            <input
              type="checkbox"
              checked={Boolean(draftFilters.delayedOnly)}
              onChange={(event) => setDraftFilters((current) => ({ ...current, delayedOnly: event.target.checked }))}
            />
            Somente atrasados
          </label>
          <div className={styles.actions}>
            <Button
              onClick={() => {
                const clean = { sortBy: 'createdAt' as const, sortDirection: 'desc' as const };
                setActiveQuickFilter('all');
                setDraftFilters(clean);
                setFilters(clean);
              }}
            >
              Limpar
            </Button>
            <Button variant="primary" onClick={applyFilters}>
              Aplicar filtros
            </Button>
          </div>
        </div>
          </Card>
        </>
      ) : null}

      {error ? (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : null}

      {showAdvanced ? (
      <Card className={styles.boardCard}>
        {viewMode === 'table' ? (
          <OrdersTable
            loading={loading}
            orders={sortedOrders}
            onOpen={openOrderDetail}
          />
        ) : null}
        {viewMode === 'kanban' ? (
          <OrdersKanban
            loading={loading}
            orders={sortedOrders}
            onOpen={openOrderDetail}
          />
        ) : null}
        {viewMode === 'cards' ? (
          <OrdersCards
            loading={loading}
            orders={sortedOrders}
            onOpen={openOrderDetail}
          />
        ) : null}

        <div className={styles.pagination}>
          <span>
            Pagina {paginationInfo.page} de {paginationInfo.totalPages} | Total: {paginationInfo.total}
          </span>
          <div className={styles.actions}>
            <Button disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>
              Anterior
            </Button>
            <Button disabled={pagination.page >= paginationInfo.totalPages} onClick={() => changePage(pagination.page + 1)}>
              Proxima
            </Button>
          </div>
        </div>
      </Card>
      ) : null}

    </main>
  );
}

function OrdersTable({ loading, orders, onOpen }: { loading: boolean; orders: OrderListItem[]; onOpen: (id: string) => void }) {
  if (loading) return <SkeletonTable />;
  if (orders.length === 0) {
    return <EmptyState title="Sem pedidos" description="Nenhum pedido encontrado com os filtros atuais." />;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Canal</th>
            <th>Cliente</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th>Total</th>
            <th>Tempo</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className={order.isDelayed ? styles.delayedRow : ''}>
              <td><strong>{order.orderNumber}</strong></td>
              <td><Badge>{channelLabel(order.channel)}</Badge></td>
              <td>{order.customerName ?? '-'}</td>
              <td><Badge tone={statusTone(order.status)}>{order.status}</Badge></td>
              <td><Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge></td>
              <td>{formatCurrency(order.total)}</td>
              <td><Badge tone={delayTone(order.delayLevel)}>{preparationLabel(order)}</Badge></td>
              <td><Button onClick={() => onOpen(order.id)}>Ver detalhe</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LatestOrdersList({
  loading,
  orders,
  selectedOrderId,
  onOpen,
}: {
  loading: boolean;
  orders: OrderListItem[];
  selectedOrderId?: string | null;
  onOpen: (id: string) => void;
}) {
  if (loading) return <SkeletonLatestOrders />;
  if (orders.length === 0) {
    return <EmptyState title="Sem pedidos" description="Nenhum pedido encontrado para a fila selecionada." />;
  }

  return (
    <div className={styles.latestList}>
      {orders.map((order) => (
        <button
          key={order.id}
          type="button"
          className={`${styles.latestRow} ${order.isDelayed ? styles.latestRowDelayed : ''} ${
            selectedOrderId === order.id ? styles.latestRowActive : ''
          }`}
          onClick={() => onOpen(order.id)}
        >
          <span className={styles.latestCustomer}>
            <strong>{order.customerName ?? 'Cliente nao informado'}</strong>
            <small>{order.orderNumber}</small>
          </span>
          <span className={styles.latestChannel}>
            <Badge>{channelLabel(order.channel)}</Badge>
            <small>{compactOrderCode(order.orderNumber)}</small>
          </span>
          <span className={styles.latestTotal}>{formatCurrency(order.total)}</span>
          <span className={styles.latestTime}>{formatElapsed(order.elapsedMinutes)}</span>
          <span className={styles.latestStatus}>
            <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
            <small>{paymentLabel(order.paymentStatus)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function OrderOperationalAlerts({ alerts }: { alerts: OrderOperationalAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card className={styles.operationalAlerts}>
      <div className={styles.sectionTitleRow}>
        <h3 className={styles.sectionTitle}>Alertas operacionais</h3>
        <Badge tone="warning">{alerts.length} pendencia(s)</Badge>
      </div>
      <div className={styles.operationalAlertList}>
        {alerts.map((alert) => (
          <article
            key={`${alert.title}-${alert.tone}`}
            className={`${styles.operationalAlert} ${alert.tone === 'danger' ? styles.operationalAlertDanger : ''}`}
          >
            <strong>{alert.title}</strong>
            <span>{alert.description}</span>
          </article>
        ))}
      </div>
    </Card>
  );
}

function OrderLifecyclePanel({ selectedOrder }: { selectedOrder: OrderDetail }) {
  const steps = buildOrderLifecycleSteps(selectedOrder);
  const currentIndex = steps.findIndex((step) => step.statuses.includes(selectedOrder.status));
  const isInterrupted = ['CANCELED', 'REFUNDED'].includes(selectedOrder.status);

  return (
    <Card className={styles.lifecyclePanel}>
      <div className={styles.sectionTitleRow}>
        <h3 className={styles.sectionTitle}>Fluxo operacional</h3>
        <Badge tone={isInterrupted ? 'danger' : statusTone(selectedOrder.status)}>
          {statusLabel(selectedOrder.status)}
        </Badge>
      </div>
      <div className={styles.lifecycleSteps}>
        {steps.map((step, index) => {
          const isCurrent = currentIndex === index;
          const isDone = selectedOrder.status === 'FINALIZED' || (!isInterrupted && currentIndex > index);
          return (
            <div
              key={step.key}
              className={`${styles.lifecycleStep} ${isCurrent ? styles.lifecycleStepActive : ''} ${
                isDone ? styles.lifecycleStepDone : ''
              } ${isInterrupted ? styles.lifecycleStepInterrupted : ''}`}
            >
              <span>{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.lifecycleHint}>
        {isInterrupted
          ? 'Pedido interrompido. Reabra somente quando houver necessidade operacional.'
          : 'Use as proximas acoes para avancar uma etapa por vez, mantendo KDS, entrega e caixa alinhados.'}
      </p>
    </Card>
  );
}

function OrderStatusActions({
  selectedOrder,
  isUpdatingStatus,
  onUpdate,
}: {
  selectedOrder: OrderDetail;
  isUpdatingStatus?: string | null;
  onUpdate: (status: OrderStatus) => void;
}) {
  const actions = buildOrderStatusActions(selectedOrder);

  if (actions.length === 0) {
    return (
      <div className={styles.statusActionsEmpty}>
        <strong>Nenhuma proxima acao automatica</strong>
        <span>Pedido encerrado, cancelado ou aguardando reabertura operacional.</span>
      </div>
    );
  }

  return (
    <div className={styles.statusActions}>
      {actions.map((action) => (
        <article key={action.status} className={styles.statusActionItem}>
          <div>
            <strong>{action.label}</strong>
            <span>{action.hint}</span>
          </div>
          <Button
            variant={action.danger ? 'danger' : 'primary'}
            disabled={isUpdatingStatus === action.status || selectedOrder.status === action.status}
            onClick={() => onUpdate(action.status)}
          >
            {isUpdatingStatus === action.status ? 'Atualizando...' : 'Executar'}
          </Button>
        </article>
      ))}
    </div>
  );
}

function OrderHistoryPanel({
  selectedOrder,
  showFullHistory,
  onToggle,
}: {
  selectedOrder: OrderDetail;
  showFullHistory: boolean;
  onToggle: () => void;
}) {
  const historyEvents = selectedOrder.timeline ?? [];
  const visibleEvents = showFullHistory ? historyEvents : historyEvents.slice(0, 3);

  return (
    <Card className={styles.section}>
      <div className={styles.sectionTitleRow}>
        <h3 className={styles.sectionTitle}>Historico de modificacoes</h3>
        <Badge tone={selectedOrder.timelineSource === 'fallback' ? 'warning' : 'success'}>
          {selectedOrder.timelineSource === 'fallback' ? 'Historico estimado' : 'Eventos reais'}
        </Badge>
      </div>
      {selectedOrder.timelineSource === 'fallback' ? (
        <p className={styles.timelineNotice}>Historico estimado com base nos horarios registrados do pedido.</p>
      ) : null}
      {historyEvents.length ? (
        <>
          <div className={styles.timeline}>
            {visibleEvents.map((event) => (
              <div key={`${event.status}-${event.at}`} className={styles.timelineItem}>
                <span />
                <div>
                  <strong>{event.message ?? event.label}</strong>
                  <small>
                    {formatDate(event.createdAt ?? event.at)} | {event.actor?.name ?? 'Sistema'}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.timelineFooter}>
            <span>{historyEvents.length} modificacao(oes) registradas</span>
            <Button onClick={onToggle}>
              {showFullHistory ? 'Ocultar historico' : 'Ver historico completo de modificacoes'}
            </Button>
          </div>
        </>
      ) : (
        <EmptyState title="Sem historico" description="As alteracoes do pedido aparecerao aqui quando houver eventos registrados." />
      )}
    </Card>
  );
}

function SkeletonLatestOrders() {
  return (
    <div className={styles.latestList}>
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className={styles.latestRowSkeleton}>
          <div className="ui-skeleton" style={{ height: 18, width: '28%' }} />
          <div className="ui-skeleton" style={{ height: 18, width: '12%' }} />
          <div className="ui-skeleton" style={{ height: 18, width: '10%' }} />
          <div className="ui-skeleton" style={{ height: 18, width: '12%' }} />
          <div className="ui-skeleton" style={{ height: 18, width: '14%' }} />
        </div>
      ))}
    </div>
  );
}

function OrdersKanban({ loading, orders, onOpen }: { loading: boolean; orders: OrderListItem[]; onOpen: (id: string) => void }) {
  if (loading) return <LoadingState label="Carregando quadro de pedidos..." />;
  return (
    <div className={styles.kanban}>
      {KANBAN_COLUMNS.map((column) => {
        const columnOrders = orders.filter((order) => column.statuses.includes(order.status));
        return (
          <section key={column.key} className={styles.kanbanColumn}>
            <div className={styles.kanbanHeader}>
              <strong>{column.title}</strong>
              <Badge>{columnOrders.length}</Badge>
            </div>
            {columnOrders.length === 0 ? <span className={styles.emptyMini}>Sem pedidos</span> : null}
            {columnOrders.map((order) => (
              <OrderMiniCard key={order.id} order={order} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function OrdersCards({ loading, orders, onOpen }: { loading: boolean; orders: OrderListItem[]; onOpen: (id: string) => void }) {
  if (loading) return <LoadingState label="Carregando pedidos..." />;
  if (orders.length === 0) return <EmptyState title="Fila limpa" description="Nenhum pedido para exibir agora." />;
  return (
    <div className={styles.cardsGrid}>
      {orders.map((order) => (
        <OrderMiniCard key={order.id} order={order} onOpen={onOpen} />
      ))}
    </div>
  );
}

function OrderMiniCard({ order, onOpen }: { order: OrderListItem; onOpen: (id: string) => void }) {
  return (
    <article className={`${styles.orderCard} ${order.isDelayed ? styles.orderCardDelayed : ''}`}>
      <div className={styles.orderCardTop}>
        <strong>{order.orderNumber}</strong>
        <Badge tone={delayTone(order.delayLevel)}>{preparationLabel(order)}</Badge>
      </div>
      <div className={styles.orderMeta}>
        <Badge>{channelLabel(order.channel)}</Badge>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        <Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
      </div>
      <p>{order.customerName ?? 'Cliente nao informado'}</p>
      <div className={styles.orderCardBottom}>
        <strong>{formatCurrency(order.total)}</strong>
        <Button onClick={() => onOpen(order.id)}>Detalhe</Button>
      </div>
    </article>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <span>{value}</span>}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <tbody>
          {[1, 2, 3, 4, 5].map((item) => (
            <tr key={item}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((cell) => (
                <td key={cell}>
                  <div className="ui-skeleton" style={{ height: 16 }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function detailToListItemLike(detail: {
  id: string;
  orderNumber: string;
  channel?: string;
  customer?: { name?: string };
  status: string;
  totals: { total: number };
  paymentSummary?: { status: string };
  createdAt: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  elapsedMinutes: number;
  isDelayed: boolean;
  delayLevel: 'none' | 'attention' | 'urgent';
}): OrderListItem {
  return {
    id: detail.id,
    orderNumber: detail.orderNumber,
    channel: detail.channel,
    customerName: detail.customer?.name,
    status: detail.status,
    total: detail.totals.total,
    paymentStatus: detail.paymentSummary?.status ?? 'UNPAID',
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    statusUpdatedAt: detail.statusUpdatedAt,
    elapsedMinutes: detail.elapsedMinutes,
    isDelayed: detail.isDelayed,
    delayLevel: detail.delayLevel,
  };
}
