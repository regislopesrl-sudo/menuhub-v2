'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';
import { useOrders } from '@/features/orders/use-orders';

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
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'READY':
      return '#166534';
    case 'OUT_FOR_DELIVERY':
    case 'IN_PREPARATION':
      return '#92400e';
    case 'DELIVERED':
    case 'FINALIZED':
      return '#0f766e';
    case 'CANCELED':
    case 'REFUNDED':
      return '#991b1b';
    default:
      return '#334155';
  }
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

  const connectionClass =
    socketStatus === 'connected' ? styles.connected : socketStatus === 'connecting' ? styles.connecting : styles.disconnected;

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>Painel de Pedidos V2</h1>
        <div className={styles.actions}>
          <span className={`${styles.connection} ${connectionClass}`}>{connectionLabel(socketStatus)}</span>
          <button className={`${styles.button} ${styles.primary}`} onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input className={styles.input} type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        <input className={styles.input} type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
        <select className={styles.select} value={String(pagination.limit)} onChange={(e) => changeLimit(Number(e.target.value))}>
          <option value="10">10 / página</option>
          <option value="20">20 / página</option>
          <option value="50">50 / página</option>
          <option value="100">100 / página</option>
        </select>
        <button
          className={`${styles.button} ${styles.primary}`}
          onClick={() =>
            setFilters({
              status: statusFilter || undefined,
              createdFrom: fromFilter || undefined,
              createdTo: toFilter || undefined,
            })
          }
        >
          Aplicar filtros
        </button>
      </div>

      {error ? (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <button className={styles.button} onClick={() => void reload()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      <section className={styles.container}>
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
                <tr>
                  <td className={styles.td} colSpan={6}>
                    Carregando pedidos...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={6}>
                    Nenhum pedido encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td className={styles.td}>{order.orderNumber}</td>
                    <td className={styles.td}>
                      <span className={styles.status} style={{ color: statusColor(order.status), border: `1px solid ${statusColor(order.status)}33` }}>
                        {order.status}
                      </span>
                    </td>
                    <td className={styles.td}>{formatCurrency(order.total)}</td>
                    <td className={styles.td}>{order.paymentStatus}</td>
                    <td className={styles.td}>{formatDate(order.createdAt)}</td>
                    <td className={styles.td}>
                      <button className={styles.button} onClick={() => openOrderDetail(order.id)}>
                        Ver detalhe
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.cardList}>
          {loading ? <div className={styles.card}>Carregando pedidos...</div> : null}
          {!loading && orders.length === 0 ? <div className={styles.card}>Nenhum pedido encontrado.</div> : null}
          {!loading
            ? orders.map((order) => (
                <article key={order.id} className={styles.card}>
                  <div className={styles.cardRow}>
                    <strong>{order.orderNumber}</strong>
                    <span className={styles.status} style={{ color: statusColor(order.status), border: `1px solid ${statusColor(order.status)}33` }}>
                      {order.status}
                    </span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Total</span>
                    <strong>{formatCurrency(order.total)}</strong>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Pagamento</span>
                    <span>{order.paymentStatus}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Criado em</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                  <button className={styles.button} onClick={() => openOrderDetail(order.id)}>
                    Ver detalhe
                  </button>
                </article>
              ))
            : null}
        </div>

        <div className={styles.pagination}>
          <span>
            Página {paginationInfo.page} de {paginationInfo.totalPages} | Total: {paginationInfo.total}
          </span>
          <div className={styles.actions}>
            <button
              className={styles.button}
              disabled={pagination.page <= 1}
              onClick={() => changePage(pagination.page - 1)}
            >
              Anterior
            </button>
            <button
              className={styles.button}
              disabled={pagination.page >= paginationInfo.totalPages}
              onClick={() => changePage(pagination.page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </section>

      {selectedOrderId ? (
        <div className={styles.detailBackdrop} onClick={closeOrderDetail}>
          <aside className={styles.detail} onClick={(e) => e.stopPropagation()}>
            <div className={styles.toolbar}>
              <h2 className={styles.title} style={{ fontSize: 20 }}>
                Pedido {selectedOrder?.orderNumber ?? selectedOrderId}
              </h2>
              <button className={styles.button} onClick={closeOrderDetail}>
                Fechar
              </button>
            </div>

            {detailLoading ? <p>Carregando detalhe...</p> : null}
            {detailError ? (
              <div className={styles.errorBox}>
                <span>{detailError}</span>
                <button className={styles.button} onClick={() => openOrderDetail(selectedOrderId)}>
                  Tentar novamente
                </button>
              </div>
            ) : null}

            {selectedOrder ? (
              <>
                <section className={styles.section}>
                  <div className={styles.totalRow}>
                    <span>Status</span>
                    <span className={styles.status} style={{ color: statusColor(selectedOrder.status), border: `1px solid ${statusColor(selectedOrder.status)}33` }}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Pagamento</span>
                    <strong>{selectedOrder.paymentSummary?.status ?? '-'}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Data</span>
                    <strong>{formatDate(selectedOrder.createdAt)}</strong>
                  </div>
                </section>

                <section className={styles.section}>
                  <h3>Itens</h3>
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <div>{item.name}</div>
                      <div>Qtd: {item.quantity}</div>
                      <div>{formatCurrency(item.unitPrice)}</div>
                      <div>{formatCurrency(item.totalPrice)}</div>
                      {item.selectedOptions && item.selectedOptions.length > 0 ? (
                        <div className={styles.muted}>
                          +{' '}
                          {item.selectedOptions
                            .map((option) => `${option.name} (${formatCurrency(option.price)})`)
                            .join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>

                <section className={styles.section}>
                  <h3>Totais</h3>
                  <div className={styles.totalRow}>
                    <span>Subtotal</span>
                    <strong>{formatCurrency(selectedOrder.totals.subtotal)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Desconto</span>
                    <strong>- {formatCurrency(selectedOrder.totals.discount)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Taxa entrega</span>
                    <strong>{formatCurrency(selectedOrder.totals.deliveryFee)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Total final</span>
                    <strong>{formatCurrency(selectedOrder.totals.total)}</strong>
                  </div>
                </section>

                <section className={styles.section}>
                  <h3>Ações de status</h3>
                  <div className={styles.actions} style={{ flexWrap: 'wrap' }}>
                    {STATUS_ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        className={`${styles.button} ${action.danger ? styles.danger : styles.primary}`}
                        disabled={isUpdatingStatus === action.status || selectedOrder.status === action.status}
                        onClick={() => void updateOrderStatus(selectedOrder.id, action.status)}
                      >
                        {isUpdatingStatus === action.status ? 'Atualizando...' : action.label}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
