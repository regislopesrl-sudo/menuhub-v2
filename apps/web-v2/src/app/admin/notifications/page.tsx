'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { connectOrdersSocket, type OrdersEventPayload, type SocketConnectionStatus } from '@/features/orders/orders.socket';
import type { OrdersHeaders } from '@/features/orders/orders.api';
import styles from './page.module.css';

type Severity = 'info' | 'success' | 'warning';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  orderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  requestId?: string;
  severity: Severity;
};

function severityFor(event: OrdersEventPayload): Severity {
  if (event.type === 'order.created') return 'success';
  if (['CANCELED', 'PAYMENT_FAILED', 'REFUNDED'].includes(String(event.status).toUpperCase())) return 'warning';
  return 'info';
}

function titleFor(event: OrdersEventPayload): string {
  if (event.type === 'order.created') return 'Novo pedido recebido';
  return 'Status de pedido atualizado';
}

function descriptionFor(event: OrdersEventPayload): string {
  if (event.type === 'order.created') {
    return `Pedido ${event.orderNumber} entrou na fila operacional.`;
  }
  return `Pedido ${event.orderNumber} agora esta em ${event.status}.`;
}

function toneFor(severity: Severity): 'default' | 'success' | 'warning' {
  if (severity === 'success') return 'success';
  if (severity === 'warning') return 'warning';
  return 'default';
}

function toNotification(event: OrdersEventPayload): NotificationItem {
  return {
    id: `${event.type}:${event.orderId}:${event.timestamp}:${event.requestId}`,
    title: titleFor(event),
    description: descriptionFor(event),
    orderId: event.orderId,
    orderNumber: event.orderNumber,
    status: event.status,
    createdAt: event.timestamp,
    requestId: event.requestId,
    severity: severityFor(event),
  };
}

export default function AdminNotificationsPage() {
  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin',
    }),
    [],
  );

  const [events, setEvents] = useState<NotificationItem[]>([]);
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('connecting');
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | Severity>('all');

  useEffect(() => {
    if (paused) return;
    const socket = connectOrdersSocket({
      headers,
      onConnectionStatus: setSocketStatus,
      onEvent: (event) => {
        const next = toNotification(event);
        setEvents((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 80));
      },
    });
    return () => {
      socket.disconnect();
    };
  }, [headers, paused]);

  const visibleEvents = useMemo(
    () => (filter === 'all' ? events : events.filter((event) => event.severity === filter)),
    [events, filter],
  );

  const summary = useMemo(() => ({
    total: events.length,
    success: events.filter((item) => item.severity === 'success').length,
    warning: events.filter((item) => item.severity === 'warning').length,
    info: events.filter((item) => item.severity === 'info').length,
  }), [events]);

  return (
    <main className={styles.page}>
      <PageHeader
        title="Notificacoes em Tempo Real"
        subtitle="Central local de eventos operacionais para pedidos, KDS, PDV e delivery."
        right={
          <div className={styles.actions}>
            <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
              {socketStatus === 'connected' ? 'Realtime conectado' : socketStatus === 'connecting' ? 'Conectando' : 'Realtime offline'}
            </Badge>
            <Button onClick={() => setPaused((value) => !value)}>{paused ? 'Retomar' : 'Pausar'}</Button>
            <Button onClick={() => setEvents([])}>Limpar</Button>
          </div>
        }
      />

      <section className={styles.heroGrid}>
        <Card className={styles.heroCard}><span>Total</span><strong>{summary.total}</strong></Card>
        <Card className={styles.heroCard}><span>Novos pedidos</span><strong>{summary.success}</strong></Card>
        <Card className={styles.heroCard}><span>Alertas</span><strong>{summary.warning}</strong></Card>
        <Card className={styles.heroCard}><span>Atualizacoes</span><strong>{summary.info}</strong></Card>
      </section>

      <Card className={styles.panel}>
        <div className={styles.filterRow}>
          <button className={filter === 'all' ? styles.activeFilter : ''} onClick={() => setFilter('all')}>Todos</button>
          <button className={filter === 'success' ? styles.activeFilter : ''} onClick={() => setFilter('success')}>Novos pedidos</button>
          <button className={filter === 'warning' ? styles.activeFilter : ''} onClick={() => setFilter('warning')}>Alertas</button>
          <button className={filter === 'info' ? styles.activeFilter : ''} onClick={() => setFilter('info')}>Atualizacoes</button>
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <small>Feed operacional</small>
            <h2>Eventos recentes</h2>
          </div>
          <Badge>{visibleEvents.length} visiveis</Badge>
        </div>

        {visibleEvents.length === 0 ? (
          <EmptyState title="Aguardando eventos" description="Novos pedidos e atualizacoes aparecem aqui em tempo real." />
        ) : null}

        <div className={styles.timeline}>
          {visibleEvents.map((event) => (
            <article key={event.id} className={styles.eventCard}>
              <div className={styles.marker} />
              <div className={styles.eventBody}>
                <div className={styles.eventTop}>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.description}</p>
                  </div>
                  <Badge tone={toneFor(event.severity)}>{event.status}</Badge>
                </div>
                <div className={styles.metaRow}>
                  <span>Pedido: {event.orderNumber}</span>
                  <span>ID: {event.orderId.slice(0, 8)}</span>
                  <span>{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                  {event.requestId ? <span>Req: {event.requestId}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
