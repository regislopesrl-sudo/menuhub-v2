'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';
import { useOrders, type OrdersFilters } from '@/features/orders/use-orders';
import type { OrderListItem } from '@/features/orders/orders.api';
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

const STATUS_ACTIONS: Array<{ label: string; status: (typeof STATUS_OPTIONS)[number]; danger?: boolean }> = [
  { label: 'Confirmar', status: 'CONFIRMED' },
  { label: 'Preparar', status: 'IN_PREPARATION' },
  { label: 'Pronto', status: 'READY' },
  { label: 'Saiu para entrega', status: 'OUT_FOR_DELIVERY' },
  { label: 'Entregue', status: 'DELIVERED' },
  { label: 'Finalizar', status: 'FINALIZED' },
  { label: 'Cancelar', status: 'CANCELED', danger: true },
];

const KANBAN_COLUMNS = [
  { key: 'pending', title: 'Entrada', statuses: ['DRAFT', 'PENDING_CONFIRMATION'] },
  { key: 'confirmed', title: 'Confirmados', statuses: ['CONFIRMED'] },
  { key: 'preparing', title: 'Cozinha', statuses: ['IN_PREPARATION'] },
  { key: 'ready', title: 'Prontos', statuses: ['READY', 'WAITING_PICKUP', 'WAITING_DISPATCH'] },
  { key: 'route', title: 'Entrega', statuses: ['OUT_FOR_DELIVERY'] },
  { key: 'closed', title: 'Concluidos', statuses: ['DELIVERED', 'FINALIZED', 'CANCELED', 'REFUNDED'] },
];

type ViewMode = 'table' | 'kanban' | 'cards';

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
  if (normalized === 'WEB') return 'Delivery';
  if (normalized === 'PDV') return 'PDV';
  if (normalized === 'KIOSK') return 'Totem';
  if (normalized === 'QR' || normalized === 'WAITER_APP') return 'Garcom';
  if (normalized === 'WHATSAPP') return 'WhatsApp';
  return normalized || 'Canal';
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
  } = useOrders(headers);
  const access = useModuleAccess(headers, 'orders');

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [draftFilters, setDraftFilters] = useState<OrdersFilters>({
    sortBy: 'createdAt',
    sortDirection: 'desc',
    ...filters,
  });

  const sortedOrders = useMemo(() => [...(orders ?? [])].sort(orderPriority), [orders]);
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
      delayedOnly: draftFilters.delayedOnly || undefined,
      sortBy: draftFilters.sortBy,
      sortDirection: draftFilters.sortDirection,
      createdFrom: draftFilters.createdFrom || undefined,
      createdTo: draftFilters.createdTo || undefined,
    });
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="Gestao de Pedidos"
        subtitle="Central operacional multi-canal para delivery, PDV, totem, mesas e WhatsApp futuro"
        right={
          <div className={styles.actions}>
            <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
              {connectionLabel(socketStatus)}
            </Badge>
            <Button variant="primary" onClick={() => void reload()}>
              Atualizar
            </Button>
          </div>
        }
      />

      <section className={styles.heroGrid}>
        <Card className={styles.commandCard}>
          <div>
            <span className={styles.eyebrow}>Operacao ao vivo</span>
            <h2>Fila inteligente por prioridade</h2>
            <p>
              Pedidos atrasados sobem no topo, eventos realtime atualizam a lista e o drawer concentra as acoes de
              cozinha, entrega e fechamento.
            </p>
          </div>
          <div className={styles.commandStats}>
            <Badge tone={kpis.delayed > 0 ? 'danger' : 'success'}>{kpis.delayed} atrasados</Badge>
            <Badge tone="warning">{kpis.preparing} em preparo</Badge>
            <Badge tone="success">{kpis.ready} prontos</Badge>
            {summaryError ? <Badge tone="warning">KPIs em fallback</Badge> : null}
          </div>
        </Card>
        <StatCard label="Pedidos hoje" value={summaryLoading ? '...' : kpis.total} hint={kpiHint} />
        <StatCard label="Pedidos ativos" value={summaryLoading ? '...' : kpis.active} hint="Entrada ate entrega" />
        <StatCard
          label="Faturamento liquido"
          value={summaryLoading ? '...' : formatCurrency(kpis.revenue)}
          hint={`Bruto ${formatCurrency(kpis.grossRevenue)} | Cancelado ${formatCurrency(kpis.canceledRevenue)}`}
        />
      </section>

      <section className={styles.gridKpi}>
        <StatCard label="Em preparo" value={summaryLoading ? '...' : kpis.preparing} />
        <StatCard label="Prontos" value={summaryLoading ? '...' : kpis.ready} />
        <StatCard label="Atrasados" value={summaryLoading ? '...' : kpis.delayed} hint="Acima de 10 min" />
        <StatCard label="Ticket medio" value={summaryLoading ? '...' : formatCurrency(kpis.averageTicket)} hint={`${kpis.canceled} cancelados`} />
      </section>

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

      {error ? (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : null}

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

      {selectedOrderId ? (
        <div className={styles.detailBackdrop} onClick={closeOrderDetail}>
          <aside className={styles.detail} onClick={(event) => event.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.eyebrow}>Detalhe completo</span>
                <h2>Pedido {selectedOrder?.orderNumber ?? selectedOrderId}</h2>
              </div>
              <Button onClick={closeOrderDetail}>Fechar</Button>
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
                <Card className={styles.section}>
                  <div className={styles.summaryHeader}>
                    <Badge tone={statusTone(selectedOrder.status)}>{selectedOrder.status}</Badge>
                    <Badge tone={delayTone(selectedOrder.delayLevel)}>{preparationLabel(detailToListItemLike(selectedOrder))}</Badge>
                  </div>
                  <div className={styles.infoGrid}>
                    <InfoRow label="Canal" value={channelLabel(selectedOrder.channel)} />
                    <InfoRow label="Pagamento" value={selectedOrder.paymentSummary?.status ?? '-'} />
                    <InfoRow label="Criado em" value={formatDate(selectedOrder.createdAt)} />
                    <InfoRow label="Atualizado" value={formatDate(selectedOrder.statusUpdatedAt ?? selectedOrder.updatedAt)} />
                  </div>
                </Card>

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Cliente e entrega</h3>
                  <div className={styles.infoGrid}>
                    <InfoRow label="Cliente" value={selectedOrder.customer?.name ?? 'Nao informado'} />
                    <InfoRow label="Telefone" value={selectedOrder.customer?.phone ?? '-'} />
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

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Itens e adicionais</h3>
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

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Totais</h3>
                  <InfoRow label="Subtotal" value={formatCurrency(selectedOrder.totals.subtotal)} />
                  <InfoRow label="Desconto" value={`- ${formatCurrency(selectedOrder.totals.discount)}`} />
                  <InfoRow label="Taxa entrega" value={formatCurrency(selectedOrder.totals.deliveryFee)} />
                  <InfoRow label="Total final" value={formatCurrency(selectedOrder.totals.total)} strong />
                </Card>

                <Card className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <h3 className={styles.sectionTitle}>Timeline</h3>
                    <Badge tone={selectedOrder.timelineSource === 'fallback' ? 'warning' : 'success'}>
                      {selectedOrder.timelineSource === 'fallback' ? 'Historico estimado' : 'Eventos reais'}
                    </Badge>
                  </div>
                  {selectedOrder.timelineSource === 'fallback' ? (
                    <p className={styles.timelineNotice}>Historico estimado com base nos timestamps existentes.</p>
                  ) : null}
                  <div className={styles.timeline}>
                    {(selectedOrder.timeline ?? []).map((event) => (
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
                </Card>

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Acoes operacionais</h3>
                  <div className={styles.statusActions}>
                    {STATUS_ACTIONS.map((action) => (
                      <Button
                        key={action.status}
                        variant={action.danger ? 'danger' : 'primary'}
                        disabled={isUpdatingStatus === action.status || selectedOrder.status === action.status}
                        onClick={() => void updateOrderStatus(selectedOrder.id, action.status)}
                      >
                        {isUpdatingStatus === action.status ? 'Atualizando...' : action.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              </>
            ) : null}
          </aside>
        </div>
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
