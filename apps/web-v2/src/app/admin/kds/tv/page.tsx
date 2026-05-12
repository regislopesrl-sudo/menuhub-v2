'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { connectOrdersSocket, type OrdersEventPayload } from '@/features/orders/orders.socket';
import { getOrderById, type OrdersHeaders } from '@/features/orders/orders.api';
import { bumpKdsOrder, listKdsOrders, listKdsStations, readyKdsOrder, startKdsOrder, type KdsOrderCard, type KdsStation } from '@/features/kds/kds.api';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';

type SocketStatus = 'connecting' | 'connected' | 'disconnected';
type BoardKey = 'new' | 'preparing' | 'ready';
type StationFilter = 'all' | KdsStation['key'];

const fallbackStations: KdsStation[] = [
  { key: 'hot_kitchen', label: 'Cozinha quente', prepTargetMinutes: 20, productStationKeys: ['GRILL', 'FRYER', 'OVEN'], routingDescription: 'Produtos quentes e preparo principal.' },
  { key: 'cold_kitchen', label: 'Cozinha fria', prepTargetMinutes: 12, productStationKeys: ['COLD', 'DESSERTS', 'DRINKS'], routingDescription: 'Bebidas, sobremesas e preparo frio.' },
  { key: 'assembly', label: 'Montagem', prepTargetMinutes: 10, productStationKeys: ['ASSEMBLY'], routingDescription: 'Finalizacao e embalagem.' },
  { key: 'expedition', label: 'Expedicao', prepTargetMinutes: 8, productStationKeys: ['EXPEDITION'], routingDescription: 'Separacao, conferencia e saida.' },
];

function elapsedMinutes(isoDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    DELIVERY: 'Delivery',
    WEB: 'Web',
    PDV: 'PDV',
    KIOSK: 'Totem',
    WAITER_APP: 'Garcom',
    WHATSAPP: 'WhatsApp',
    delivery: 'Delivery',
    pdv: 'PDV',
    kiosk: 'Totem',
    waiter: 'Garcom',
    whatsapp: 'WhatsApp',
  };
  return map[channel] ?? channel;
}

function priorityLabel(order: KdsOrderCard): string {
  if (order.priorityLevel === 'urgent') return 'Urgente';
  if (order.priorityLevel === 'attention') return 'Atencao';
  return 'No prazo';
}

function mapOrderDetailToKds(detail: Awaited<ReturnType<typeof getOrderById>>): KdsOrderCard {
  const elapsed = elapsedMinutes(detail.createdAt);
  const prepTargetMinutes = 20;
  return {
    id: detail.id,
    orderNumber: detail.orderNumber,
    channel: detail.channel ?? 'unknown',
    status: detail.status,
    createdAt: detail.createdAt,
    preparationStartedAt: detail.preparationStartedAt,
    readyAt: detail.readyAt,
    elapsedMinutes: elapsed,
    prepTargetMinutes,
    lateMinutes: Math.max(0, elapsed - prepTargetMinutes),
    priorityLevel: elapsed > prepTargetMinutes + 5 ? 'urgent' : elapsed >= prepTargetMinutes ? 'attention' : 'normal',
    station: 'hot_kitchen',
    totals: detail.totals,
    customer: detail.customer?.name ? { name: detail.customer.name } : undefined,
    deliveryAddress: detail.deliveryAddress,
    items: detail.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions,
    })),
  };
}

export default function KdsTvPage() {
  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin',
    }),
    [],
  );

  const [orders, setOrders] = useState<KdsOrderCard[]>([]);
  const [stations, setStations] = useState<KdsStation[]>([]);
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const access = useModuleAccess({ companyId: headers.companyId, branchId: headers.branchId, userRole: 'admin' }, 'kds');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [stationData, orderData] = await Promise.all([
        listKdsStations(headers).catch(() => fallbackStations),
        listKdsOrders(headers, { station: stationFilter === 'all' ? undefined : stationFilter }),
      ]);
      setStations(stationData.length > 0 ? stationData : fallbackStations);
      setOrders(orderData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a tela da cozinha.');
    } finally {
      setLoading(false);
    }
  }, [headers, stationFilter]);

  const upsertOrder = useCallback((order: KdsOrderCard) => {
    setOrders((prev) => {
      const filtered = prev.filter((item) => item.id !== order.id);
      if (!['CONFIRMED', 'IN_PREPARATION', 'READY'].includes(order.status)) return filtered;
      return [...filtered, order];
    });
  }, []);

  const handleSocketEvent = useCallback(async (event: OrdersEventPayload) => {
    try {
      const detail = await getOrderById({ id: event.orderId, headers });
      upsertOrder(mapOrderDetailToKds(detail));
    } catch {
      void load();
    }
  }, [headers, load, upsertOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = connectOrdersSocket({
      headers,
      onConnectionStatus: (status) => setSocketStatus(status),
      onEvent: (event) => void handleSocketEvent(event),
    });
    return () => {
      socket.disconnect();
    };
  }, [headers, handleSocketEvent]);

  const stationLabels = useMemo(() => {
    const map = new Map<KdsStation['key'], string>();
    for (const station of (stations.length > 0 ? stations : fallbackStations)) map.set(station.key, station.label);
    return map;
  }, [stations]);

  const board = useMemo<Record<BoardKey, KdsOrderCard[]>>(() => {
    const refreshed = orders
      .map((order) => {
        const elapsed = elapsedMinutes(order.createdAt);
        return {
          ...order,
          elapsedMinutes: elapsed,
          lateMinutes: Math.max(0, elapsed - order.prepTargetMinutes),
          priorityLevel: elapsed > order.prepTargetMinutes + 5 ? 'urgent' : elapsed >= order.prepTargetMinutes ? 'attention' : 'normal',
        } satisfies KdsOrderCard;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      new: refreshed.filter((order) => order.status === 'CONFIRMED'),
      preparing: refreshed.filter((order) => order.status === 'IN_PREPARATION'),
      ready: refreshed.filter((order) => order.status === 'READY'),
    };
  }, [orders, now]);

  const summary = useMemo(() => {
    const all = [...board.new, ...board.preparing, ...board.ready];
    return {
      total: all.length,
      urgent: all.filter((order) => order.priorityLevel === 'urgent').length,
      late: all.filter((order) => order.lateMinutes > 0).length,
    };
  }, [board]);

  const withAction = async (key: string, fn: () => Promise<KdsOrderCard>) => {
    setActionLoading(key);
    setError(null);
    try {
      upsertOrder(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar pedido.');
    } finally {
      setActionLoading(null);
    }
  };

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao KDS..." /></main>;
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="KDS" reason={access.error ?? 'Modulo KDS desativado.'} />;
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>KDS ao vivo</p>
          <h1>Tela da Cozinha</h1>
          <span>Fila em tempo real por estacao, SLA e status de preparo.</span>
        </div>
        <div className={styles.heroStats}>
          <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
            {socketStatus === 'connected' ? 'Realtime conectado' : socketStatus === 'connecting' ? 'Conectando realtime' : 'Realtime offline'}
          </Badge>
          <strong>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
          <Button onClick={() => void load()}>Atualizar</Button>
          <Button variant="primary" onClick={() => window.location.assign('/admin/kds')}>Voltar ao KDS</Button>
        </div>
      </header>

      <section className={styles.filters} aria-label="Filtros por estacao">
        <button className={stationFilter === 'all' ? styles.activeFilter : ''} onClick={() => setStationFilter('all')}>Todas</button>
        {(stations.length > 0 ? stations : fallbackStations).map((station) => (
          <button
            key={station.key}
            className={stationFilter === station.key ? styles.activeFilter : ''}
            onClick={() => setStationFilter(station.key)}
          >
            <strong>{station.label}</strong>
            <small>{station.prepTargetMinutes} min SLA</small>
          </button>
        ))}
      </section>

      {error ? (
        <section className={styles.errorBox}>
          <strong>{error}</strong>
          <Button onClick={() => void load()}>Tentar novamente</Button>
        </section>
      ) : null}

      {loading ? <LoadingState label="Carregando pedidos da cozinha..." /> : null}

      {!loading ? (
        <section className={styles.summary}>
          <div><span>Total</span><strong>{summary.total}</strong></div>
          <div><span>Urgentes</span><strong>{summary.urgent}</strong></div>
          <div><span>Atrasados</span><strong>{summary.late}</strong></div>
        </section>
      ) : null}

      {!loading ? (
        <section className={styles.board}>
          <Column
            title="Novos"
            tone="new"
            orders={board.new}
            stationLabels={stationLabels}
            actionLabel="Iniciar"
            actionLoading={actionLoading}
            actionKey="start"
            onAction={(order) => void withAction(`start-${order.id}`, () => startKdsOrder(order.id, headers))}
          />
          <Column
            title="Preparando"
            tone="preparing"
            orders={board.preparing}
            stationLabels={stationLabels}
            actionLabel="Pronto"
            actionLoading={actionLoading}
            actionKey="ready"
            onAction={(order) => void withAction(`ready-${order.id}`, () => readyKdsOrder(order.id, headers))}
          />
          <Column
            title="Prontos"
            tone="ready"
            orders={board.ready}
            stationLabels={stationLabels}
            actionLabel="Finalizar"
            actionLoading={actionLoading}
            actionKey="bump"
            onAction={(order) => void withAction(`bump-${order.id}`, () => bumpKdsOrder(order.id, headers))}
          />
        </section>
      ) : null}
    </main>
  );
}

function Column({
  title,
  tone,
  orders,
  stationLabels,
  actionLabel,
  actionLoading,
  actionKey,
  onAction,
}: {
  title: string;
  tone: BoardKey;
  orders: KdsOrderCard[];
  stationLabels: Map<KdsStation['key'], string>;
  actionLabel: string;
  actionLoading: string | null;
  actionKey: string;
  onAction: (order: KdsOrderCard) => void;
}) {
  return (
    <section className={`${styles.column} ${styles[tone]}`}>
      <header>
        <h2>{title}</h2>
        <strong>{orders.length}</strong>
      </header>
      <div className={styles.columnBody}>
        {orders.length === 0 ? <div className={styles.empty}>Sem pedidos nesta fila.</div> : null}
        {orders.map((order) => (
          <article key={order.id} className={`${styles.orderCard} ${styles[order.priorityLevel]}`}>
            <div className={styles.orderTop}>
              <strong>{order.orderNumber}</strong>
              <span>{order.elapsedMinutes} min</span>
            </div>
            <div className={styles.badges}>
              <Badge tone={order.priorityLevel === 'urgent' ? 'danger' : order.priorityLevel === 'attention' ? 'warning' : 'success'}>{priorityLabel(order)}</Badge>
              <Badge>{channelLabel(order.channel)}</Badge>
              <Badge>{stationLabels.get(order.station) ?? order.station}</Badge>
            </div>
            <div className={styles.slaTrack}>
              <span style={{ width: `${Math.min(100, Math.round((order.elapsedMinutes / Math.max(1, order.prepTargetMinutes)) * 100))}%` }} />
            </div>
            {order.customer ? <p className={styles.meta}>Cliente: {order.customer.name}</p> : null}
            <div className={styles.items}>
              {order.items.map((item) => (
                <div key={item.id}>
                  <strong>{item.quantity}x {item.name}</strong>
                  {item.selectedOptions?.length ? <small>{item.selectedOptions.map((option) => option.name).join(', ')}</small> : null}
                </div>
              ))}
            </div>
            <button
              className={styles.actionButton}
              disabled={actionLoading === `${actionKey}-${order.id}`}
              onClick={() => onAction(order)}
            >
              {actionLoading === `${actionKey}-${order.id}` ? 'Atualizando...' : actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
