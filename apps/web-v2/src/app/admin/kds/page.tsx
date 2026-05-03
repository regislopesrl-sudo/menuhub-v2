'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { connectOrdersSocket, type OrdersEventPayload } from '@/features/orders/orders.socket';
import { getOrderById, type OrdersHeaders } from '@/features/orders/orders.api';
import { bumpKdsOrder, listKdsOrders, readyKdsOrder, startKdsOrder, type KdsOrderCard } from '@/features/kds/kds.api';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';

type SocketStatus = 'connecting' | 'connected' | 'disconnected';

function channelLabel(channel: string) {
  const map: Record<string, string> = {
    delivery: 'Delivery',
    pdv: 'PDV',
    kiosk: 'Totem',
    waiter: 'Garcom',
    whatsapp: 'WhatsApp',
    WEB: 'Web',
  };
  return map[channel] ?? channel;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function elapsedMinutes(isoDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

function urgencyClass(minutes: number): 'normal' | 'attention' | 'urgent' {
  if (minutes > 20) return 'urgent';
  if (minutes >= 10) return 'attention';
  return 'normal';
}

function urgencyLabel(minutes: number): string {
  if (minutes > 20) return 'Urgente';
  if (minutes >= 10) return 'Atencao';
  return 'Normal';
}

function mapOrderDetailToKds(detail: Awaited<ReturnType<typeof getOrderById>>): KdsOrderCard {
  return {
    id: detail.id,
    orderNumber: detail.orderNumber,
    channel: detail.channel ?? 'unknown',
    status: detail.status,
    createdAt: detail.createdAt,
    preparationStartedAt: detail.preparationStartedAt,
    readyAt: detail.readyAt,
    elapsedMinutes: elapsedMinutes(detail.createdAt),
    totals: detail.totals,
    customer: detail.customer,
    deliveryAddress: detail.deliveryAddress,
    items: detail.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions,
    })),
  };
}

export default function KdsPage() {
  const headers = useMemo<OrdersHeaders>(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin',
    }),
    [],
  );

  const [orders, setOrders] = useState<KdsOrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundArmed, setSoundArmed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [tick, setTick] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const access = useModuleAccess({ companyId: headers.companyId, branchId: headers.branchId, userRole: 'admin' }, 'kds');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listKdsOrders(headers);
      setOrders(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar KDS.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const upsertOrder = useCallback((order: KdsOrderCard) => {
    setOrders((prev) => {
      const filtered = prev.filter((item) => item.id !== order.id);
      if (!['CONFIRMED', 'IN_PREPARATION', 'READY'].includes(order.status)) {
        return filtered;
      }
      return [...filtered, order];
    });
  }, []);

  const playNewOrderBeep = useCallback(() => {
    if (!soundArmed || !soundEnabled || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      oscillator.start(now);
      oscillator.stop(now + 0.35);
    } catch {
      // non-blocking
    }
  }, [soundArmed, soundEnabled]);

  const handleSocketEvent = useCallback(
    async (event: OrdersEventPayload) => {
      try {
        const detail = await getOrderById({ id: event.orderId, headers });
        const next = mapOrderDetailToKds(detail);
        upsertOrder(next);
        if (event.type === 'order.created') {
          playNewOrderBeep();
        }
      } catch {
        // If detail is unavailable, fallback to manual refresh strategy
      }
    },
    [headers, playNewOrderBeep, upsertOrder],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = connectOrdersSocket({
      headers,
      onConnectionStatus: (status) => setSocketStatus(status),
      onEvent: (event) => {
        void handleSocketEvent(event);
      },
    });
    return () => {
      socket.disconnect();
    };
  }, [headers, handleSocketEvent]);

  useEffect(() => {
    const listener = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const withAction = async (key: string, fn: () => Promise<KdsOrderCard>) => {
    setActionLoading(key);
    try {
      const updated = await fn();
      upsertOrder(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar pedido.');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const activateSound = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    await audioContextRef.current.resume();
    setSoundArmed(true);
    setSoundEnabled(true);
  };

  const board = useMemo(() => {
    const normalized = orders
      .map((order) => ({
        ...order,
        elapsedMinutes: elapsedMinutes(order.createdAt),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      new: normalized.filter((order) => order.status === 'CONFIRMED'),
      preparing: normalized.filter((order) => order.status === 'IN_PREPARATION'),
      ready: normalized.filter((order) => order.status === 'READY'),
    };
  }, [orders, tick]);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao modulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="KDS" reason={access.error ?? 'Modulo KDS desativado.'} />;
  }

  return (
    <main className={`${styles.page} ${isFullscreen ? styles.fullscreen : ''}`}>
      <PageHeader
        title="KDS Cozinha"
        subtitle="Painel operacional em tempo real para preparo de pedidos"
        right={
          <div className={styles.actions}>
          <Badge tone={socketStatus === 'connected' ? 'success' : socketStatus === 'connecting' ? 'warning' : 'danger'}>
            {socketStatus === 'connected' ? 'Conectado' : socketStatus === 'connecting' ? 'Conectando' : 'Desconectado'}
          </Badge>
          {!soundArmed ? (
            <Button variant="primary" onClick={() => void activateSound()}>Ativar som</Button>
          ) : (
            <Button onClick={() => setSoundEnabled((v) => !v)}>{soundEnabled ? 'Som ligado' : 'Som desligado'}</Button>
          )}
          <Button onClick={() => void load()}>Atualizar</Button>
          <Button variant="primary" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
          </Button>
          </div>
        }
      />

      {loading ? <LoadingState label="Carregando pedidos da cozinha..." /> : null}
      {error ? (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <Button onClick={() => void load()}>Tentar novamente</Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className={styles.board}>
          <Card className={styles.column}>
            <header className={styles.columnHeader}>
              <h2>Novos</h2>
              <Badge>{board.new.length}</Badge>
            </header>
            <div className={styles.columnContent}>
              {board.new.length === 0 ? <EmptyState title="Sem pedidos" description="Nenhum novo pedido." /> : null}
              {board.new.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  urgency={urgencyClass(order.elapsedMinutes)}
                  urgencyLabel={urgencyLabel(order.elapsedMinutes)}
                  onActionLabel={actionLoading === `start-${order.id}` ? 'Iniciando...' : 'Iniciar preparo'}
                  onAction={() => void withAction(`start-${order.id}`, () => startKdsOrder(order.id, headers))}
                  disabled={actionLoading === `start-${order.id}`}
                  emphasis="default"
                />
              ))}
            </div>
          </Card>

          <Card className={styles.column}>
            <header className={styles.columnHeader}>
              <h2>Preparando</h2>
              <Badge tone="warning">{board.preparing.length}</Badge>
            </header>
            <div className={styles.columnContent}>
              {board.preparing.length === 0 ? <EmptyState title="Sem pedidos" description="Nenhum pedido em preparo." /> : null}
              {board.preparing.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  urgency={urgencyClass(order.elapsedMinutes)}
                  urgencyLabel={urgencyLabel(order.elapsedMinutes)}
                  onActionLabel={actionLoading === `ready-${order.id}` ? 'Atualizando...' : 'Marcar pronto'}
                  onAction={() => void withAction(`ready-${order.id}`, () => readyKdsOrder(order.id, headers))}
                  disabled={actionLoading === `ready-${order.id}`}
                  emphasis="ready"
                />
              ))}
            </div>
          </Card>

          <Card className={styles.column}>
            <header className={styles.columnHeader}>
              <h2>Prontos</h2>
              <Badge tone="success">{board.ready.length}</Badge>
            </header>
            <div className={styles.columnContent}>
              {board.ready.length === 0 ? <EmptyState title="Sem pedidos" description="Nenhum pedido pronto." /> : null}
              {board.ready.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  urgency={urgencyClass(order.elapsedMinutes)}
                  urgencyLabel={urgencyLabel(order.elapsedMinutes)}
                  onActionLabel={actionLoading === `bump-${order.id}` ? 'Finalizando...' : 'Finalizar'}
                  onAction={() => void withAction(`bump-${order.id}`, () => bumpKdsOrder(order.id, headers))}
                  disabled={actionLoading === `bump-${order.id}`}
                  emphasis="default"
                />
              ))}
            </div>
          </Card>
        </section>
      ) : null}
    </main>
  );
}

function OrderCard({
  order,
  urgency,
  urgencyLabel,
  onActionLabel,
  onAction,
  disabled,
  emphasis,
}: {
  order: KdsOrderCard;
  urgency: 'normal' | 'attention' | 'urgent';
  urgencyLabel: string;
  onActionLabel: string;
  onAction: () => void;
  disabled: boolean;
  emphasis: 'default' | 'ready';
}) {
  const totalMinutes = elapsedMinutes(order.createdAt);
  const prepMinutes = order.preparationStartedAt ? elapsedMinutes(order.preparationStartedAt) : null;

  return (
    <Card
      className={`${styles.orderCard} ${urgency === 'attention' ? styles.attention : ''} ${urgency === 'urgent' ? styles.urgent : ''}`}
    >
      <div className={styles.row}>
        <strong className={styles.orderNumber}>{order.orderNumber}</strong>
        <Badge tone={urgency === 'urgent' ? 'danger' : urgency === 'attention' ? 'warning' : 'default'}>
          {urgencyLabel}
        </Badge>
      </div>
      <div className={styles.row}>
        <Badge tone="warning">{channelLabel(order.channel)}</Badge>
        <strong className={styles.timeBadge}>{totalMinutes} min</strong>
      </div>
      {prepMinutes !== null ? <small className={styles.meta}>Tempo em preparo: {prepMinutes} min</small> : null}
      <small className={styles.meta}>Total: {formatCurrency(order.totals.total)}</small>
      {order.customer ? <small className={styles.meta}>Cliente: {order.customer.name}</small> : null}
      {order.deliveryAddress ? (
        <small className={styles.meta}>
          Endereco: {order.deliveryAddress.street}, {order.deliveryAddress.number} - {order.deliveryAddress.neighborhood}
        </small>
      ) : null}
      {order.items.map((item) => (
        <div key={item.id} className={styles.item}>
          <span>{item.quantity}x {item.name}</span>
          {item.selectedOptions?.length ? (
            <small>+ {item.selectedOptions.map((option) => option.name).join(', ')}</small>
          ) : null}
        </div>
      ))}
      <Button
        variant={emphasis === 'ready' ? 'danger' : 'primary'}
        className={styles.actionBtn}
        disabled={disabled}
        onClick={onAction}
      >
        {onActionLabel}
      </Button>
    </Card>
  );
}

