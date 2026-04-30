'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';
import { useOrders } from '@/features/orders/use-orders';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatCard } from '@/components/ui/StatCard';

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

const STATUS_ACTIONS: Array<{ label: string; status: (typeof STATUS_OPTIONS)[number]; danger?: boolean }> = [
  { label: 'Confirmar', status: 'CONFIRMED' },
  { label: 'Preparando', status: 'IN_PREPARATION' },
  { label: 'Pronto', status: 'READY' },
  { label: 'Saiu para entrega', status: 'OUT_FOR_DELIVERY' },
  { label: 'Entregue', status: 'DELIVERED' },
  { label: 'Finalizar', status: 'FINALIZED' },
  { label: 'Cancelar', status: 'CANCELED', danger: true },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (['CONFIRMED', 'READY', 'DELIVERED', 'FINALIZED'].includes(status)) return 'success';
  if (['IN_PREPARATION', 'OUT_FOR_DELIVERY', 'WAITING_PICKUP', 'WAITING_DISPATCH'].includes(status)) return 'warning';
  if (['CANCELED', 'REFUNDED'].includes(status)) return 'danger';
  return 'default';
}

function connectionLabel(status: 'connecting' | 'connected' | 'disconnected') {
  if (status === 'connected') return 'Conectado';
  if (status === 'connecting') return 'Conectando';
  return 'Desconectado';
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

  const [statusFilter, setStatusFilter] = useState(filters.status ?? '');
  const [fromFilter, setFromFilter] = useState(filters.createdFrom ?? '');
  const [toFilter, setToFilter] = useState(filters.createdTo ?? '');

  const pending = orders.filter((o) => o.status === 'PENDING_CONFIRMATION').length;
  const confirmed = orders.filter((o) => o.status === 'CONFIRMED').length;
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <main className={styles.page}>
      <section className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Painel de Pedidos</h1>
          <p className={styles.sub}>Operação em tempo real para acompanhamento e atualização de status</p>
        </div>
        <div className={styles.actions}>
          <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
            {connectionLabel(socketStatus)}
          </Badge>
          <Button variant="primary" onClick={() => void reload()}>Atualizar</Button>
        </div>
      </section>

      <section className={styles.gridKpi}>
        <StatCard label="Total pedidos" value={paginationInfo.total} />
        <StatCard label="Pendentes" value={pending} hint="Aguardando confirmação" />
        <StatCard label="Confirmados" value={confirmed} hint="Pedidos ativos" />
        <StatCard label="Faturamento (página)" value={formatCurrency(revenue)} />
      </section>

      <Card className={styles.filters}>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
        <Input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        <Input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
        <Select value={String(pagination.limit)} onChange={(e) => changeLimit(Number(e.target.value))}>
          <option value="10">10 / página</option>
          <option value="20">20 / página</option>
          <option value="50">50 / página</option>
          <option value="100">100 / página</option>
        </Select>
        <Button
          variant="primary"
          onClick={() =>
            setFilters({
              status: statusFilter || undefined,
              createdFrom: fromFilter || undefined,
              createdTo: toFilter || undefined,
            })
          }
        >
          Aplicar filtros
        </Button>
      </Card>

      {error ? (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : null}

      <Card className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Pedido</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Total</th>
                <th className={styles.th}>Pagamento</th>
                <th className={styles.th}>Criado em</th>
                <th className={styles.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1, 2, 3, 4].map((n) => (
                    <tr key={n}>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 14 }} /></td>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 14 }} /></td>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 14 }} /></td>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 14 }} /></td>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 14 }} /></td>
                      <td className={styles.td}><div className="ui-skeleton" style={{ height: 34 }} /></td>
                    </tr>
                  ))}
                </>
              ) : orders.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={6}>
                    <EmptyState title="Sem pedidos" description="Nenhum pedido encontrado com os filtros atuais." />
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td className={styles.td}>{order.orderNumber}</td>
                    <td className={styles.td}><Badge tone={statusTone(order.status)}>{order.status}</Badge></td>
                    <td className={styles.td}>{formatCurrency(order.total)}</td>
                    <td className={styles.td}>{order.paymentStatus}</td>
                    <td className={styles.td}>{formatDate(order.createdAt)}</td>
                    <td className={styles.td}><Button onClick={() => openOrderDetail(order.id)}>Ver detalhe</Button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.mobileList}>
          {loading ? <LoadingState label="Carregando pedidos..." /> : null}
          {!loading && orders.length === 0 ? <EmptyState title="Sem pedidos" description="Nenhum pedido encontrado." /> : null}
          {!loading
            ? orders.map((order) => (
                <Card key={order.id} className={styles.itemCard}>
                  <div className={styles.row}><strong>{order.orderNumber}</strong><Badge tone={statusTone(order.status)}>{order.status}</Badge></div>
                  <div className={styles.row}><span>Total</span><strong>{formatCurrency(order.total)}</strong></div>
                  <div className={styles.row}><span>Pagamento</span><span>{order.paymentStatus}</span></div>
                  <div className={styles.row}><span>Criado em</span><span>{formatDate(order.createdAt)}</span></div>
                  <Button onClick={() => openOrderDetail(order.id)}>Ver detalhe</Button>
                </Card>
              ))
            : null}
        </div>

        <div className={styles.pagination}>
          <span>Página {paginationInfo.page} de {paginationInfo.totalPages} | Total: {paginationInfo.total}</span>
          <div className={styles.actions}>
            <Button disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>Anterior</Button>
            <Button disabled={pagination.page >= paginationInfo.totalPages} onClick={() => changePage(pagination.page + 1)}>Próxima</Button>
          </div>
        </div>
      </Card>

      {selectedOrderId ? (
        <div className={styles.detailBackdrop} onClick={closeOrderDetail}>
          <aside className={styles.detail} onClick={(e) => e.stopPropagation()}>
            <div className={styles.topbar}>
              <h2 className={styles.title} style={{ fontSize: 22 }}>Pedido {selectedOrder?.orderNumber ?? selectedOrderId}</h2>
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
                  <h3 className={styles.sectionTitle}>Resumo</h3>
                  <div className={styles.row}><span>Status</span><Badge tone={statusTone(selectedOrder.status)}>{selectedOrder.status}</Badge></div>
                  <div className={styles.row}><span>Pagamento</span><strong>{selectedOrder.paymentSummary?.status ?? '-'}</strong></div>
                  <div className={styles.row}><span>Data</span><strong>{formatDate(selectedOrder.createdAt)}</strong></div>
                </Card>

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Itens</h3>
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <div><strong>{item.name}</strong> - Qtd {item.quantity}</div>
                      <div>{formatCurrency(item.unitPrice)} un | Total {formatCurrency(item.totalPrice)}</div>
                      {item.selectedOptions && item.selectedOptions.length > 0 ? (
                        <small style={{ color: '#64748b' }}>
                          + {item.selectedOptions.map((option) => `${option.name} (${formatCurrency(option.price)})`).join(', ')}
                        </small>
                      ) : null}
                    </div>
                  ))}
                </Card>

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Totais</h3>
                  <div className={styles.row}><span>Subtotal</span><strong>{formatCurrency(selectedOrder.totals.subtotal)}</strong></div>
                  <div className={styles.row}><span>Desconto</span><strong>- {formatCurrency(selectedOrder.totals.discount)}</strong></div>
                  <div className={styles.row}><span>Taxa entrega</span><strong>{formatCurrency(selectedOrder.totals.deliveryFee)}</strong></div>
                  <div className={styles.row}><span>Total final</span><strong>{formatCurrency(selectedOrder.totals.total)}</strong></div>
                </Card>

                <Card className={styles.section}>
                  <h3 className={styles.sectionTitle}>Atualizar status</h3>
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
