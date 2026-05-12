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
import { bumpKdsOrder, listKdsOrders, listKdsStations, printKdsOrder, readyKdsOrder, startKdsOrder, type KdsOrderCard, type KdsPrintTicket, type KdsStation } from '@/features/kds/kds.api';
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
  const [stations, setStations] = useState<KdsStation[]>([]);
  const [printPreview, setPrintPreview] = useState<KdsPrintTicket | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [stationFilter, setStationFilter] = useState<'all' | 'hot_kitchen' | 'cold_kitchen' | 'assembly' | 'expedition'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'PDV' | 'WEB' | 'WHATSAPP' | 'KIOSK' | 'WAITER_APP'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundArmed, setSoundArmed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [tick, setTick] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const access = useModuleAccess({ companyId: headers.companyId, branchId: headers.branchId, userRole: 'admin' }, 'kds');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listKdsOrders(headers, {
        station: stationFilter === 'all' ? undefined : stationFilter,
        channel: channelFilter === 'all' ? undefined : channelFilter,
      });
      setOrders(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar KDS.');
    } finally {
      setLoading(false);
    }
  }, [headers, stationFilter, channelFilter]);

  const loadStations = useCallback(async () => {
    try {
      setStations(await listKdsStations(headers));
    } catch {
      setStations([]);
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
    void loadStations();
  }, [loadStations]);

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

  const printTicket = async (orderId: string) => {
    setActionLoading(`print-${orderId}`);
    setPrintFeedback(null);
    setPrintPreview(null);
    try {
      const ticket = await printKdsOrder(orderId, headers);
      const stationLabel = stationLabels.get(ticket.station) ?? ticket.station;
      setPrintFeedback(`Comanda ${ticket.orderNumber} preparada para impressao (${stationLabel}).`);
      setPrintPreview(ticket);
      setShowPrintPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar comanda.');
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

  const stationLabels = useMemo(() => {
    const fallback = new Map<string, string>([
      ['hot_kitchen', 'Cozinha quente'],
      ['cold_kitchen', 'Cozinha fria'],
      ['assembly', 'Montagem'],
      ['expedition', 'Expedicao'],
    ]);
    for (const station of stations) fallback.set(station.key, station.label);
    return fallback;
  }, [stations]);

  const boardSummary = useMemo(() => {
    const allOrders = [...board.new, ...board.preparing, ...board.ready];
    const urgent = allOrders.filter((order) => order.priorityLevel === 'urgent').length;
    const late = allOrders.filter((order) => order.lateMinutes > 0).length;
    const avgElapsed = allOrders.length
      ? Math.round(allOrders.reduce((sum, order) => sum + order.elapsedMinutes, 0) / allOrders.length)
      : 0;
    return { total: allOrders.length, urgent, late, avgElapsed };
  }, [board]);

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
          <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value as any)} className={styles.filterSelect}>
            <option value="all">Todas estacoes</option>
            {(stations.length > 0 ? stations : [
              { key: 'hot_kitchen', label: 'Cozinha quente', prepTargetMinutes: 20 },
              { key: 'cold_kitchen', label: 'Cozinha fria', prepTargetMinutes: 12 },
              { key: 'assembly', label: 'Montagem', prepTargetMinutes: 10 },
              { key: 'expedition', label: 'Expedicao', prepTargetMinutes: 8 },
            ]).map((station) => (
              <option key={station.key} value={station.key}>{station.label}</option>
            ))}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as any)} className={styles.filterSelect}>
            <option value="all">Todos canais</option>
            <option value="PDV">PDV</option>
            <option value="WEB">Web</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="KIOSK">Totem</option>
            <option value="WAITER_APP">Garcom</option>
          </select>
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
      {printFeedback ? (
        <div className={styles.successBox}>
          <span>{printFeedback}</span>
          <div className={styles.actions}>
            {printPreview ? <Button onClick={() => setShowPrintPreview(true)}>Ver comanda</Button> : null}
            <Button onClick={() => setPrintFeedback(null)}>Fechar</Button>
          </div>
        </div>
      ) : null}

      {printPreview && showPrintPreview ? (
        <div className={styles.ticketBackdrop} onClick={() => setShowPrintPreview(false)}>
          <Card className={styles.ticketModal} onClick={(event) => event.stopPropagation()}>
            <header className={styles.ticketHeader}>
              <div>
                <small>Previa de comanda</small>
                <h2>{printPreview.orderNumber}</h2>
                <span>{stationLabels.get(printPreview.station) ?? printPreview.station} | {new Date(printPreview.printedAt).toLocaleString('pt-BR')}</span>
              </div>
              <Button onClick={() => setShowPrintPreview(false)}>Fechar</Button>
            </header>
            <pre className={styles.ticketPaper}>{printPreview.content}</pre>
            <div className={styles.ticketActions}>
              <Button variant="primary" onClick={() => window.print()}>Imprimir pelo navegador</Button>
              <Button onClick={() => void navigator?.clipboard?.writeText(printPreview.content)}>Copiar conteudo</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className={styles.summaryGrid} aria-label="Resumo operacional da cozinha">
          <Card className={styles.summaryCard}>
            <small>Fila total</small>
            <strong>{boardSummary.total}</strong>
            <span>Pedidos ativos no KDS</span>
          </Card>
          <Card className={styles.summaryCard}>
            <small>Urgentes</small>
            <strong>{boardSummary.urgent}</strong>
            <span>Acima do limite critico</span>
          </Card>
          <Card className={styles.summaryCard}>
            <small>Atrasados</small>
            <strong>{boardSummary.late}</strong>
            <span>Passaram do SLA da estacao</span>
          </Card>
          <Card className={styles.summaryCard}>
            <small>Tempo medio</small>
            <strong>{boardSummary.avgElapsed} min</strong>
            <span>Desde a criacao do pedido</span>
          </Card>
        </section>
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
                  stationLabel={stationLabels.get(order.station) ?? order.station}
                  onActionLabel={actionLoading === `start-${order.id}` ? 'Iniciando...' : 'Iniciar preparo'}
                  onAction={() => void withAction(`start-${order.id}`, () => startKdsOrder(order.id, headers))}
                  onPrintLabel={actionLoading === `print-${order.id}` ? 'Imprimindo...' : 'Imprimir comanda'}
                  onPrint={() => void printTicket(order.id)}
                  printDisabled={actionLoading === `print-${order.id}`}
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
                  stationLabel={stationLabels.get(order.station) ?? order.station}
                  onActionLabel={actionLoading === `ready-${order.id}` ? 'Atualizando...' : 'Marcar pronto'}
                  onAction={() => void withAction(`ready-${order.id}`, () => readyKdsOrder(order.id, headers))}
                  onPrintLabel={actionLoading === `print-${order.id}` ? 'Imprimindo...' : 'Imprimir comanda'}
                  onPrint={() => void printTicket(order.id)}
                  printDisabled={actionLoading === `print-${order.id}`}
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
                  stationLabel={stationLabels.get(order.station) ?? order.station}
                  onActionLabel={actionLoading === `bump-${order.id}` ? 'Finalizando...' : 'Finalizar'}
                  onAction={() => void withAction(`bump-${order.id}`, () => bumpKdsOrder(order.id, headers))}
                  onPrintLabel={actionLoading === `print-${order.id}` ? 'Imprimindo...' : 'Imprimir comanda'}
                  onPrint={() => void printTicket(order.id)}
                  printDisabled={actionLoading === `print-${order.id}`}
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
  stationLabel,
  onActionLabel,
  onAction,
  onPrintLabel,
  onPrint,
  printDisabled,
  disabled,
  emphasis,
}: {
  order: KdsOrderCard;
  urgency: 'normal' | 'attention' | 'urgent';
  urgencyLabel: string;
  stationLabel: string;
  onActionLabel: string;
  onAction: () => void;
  onPrintLabel: string;
  onPrint: () => void;
  printDisabled: boolean;
  disabled: boolean;
  emphasis: 'default' | 'ready';
}) {
  const totalMinutes = elapsedMinutes(order.createdAt);
  const prepMinutes = order.preparationStartedAt ? elapsedMinutes(order.preparationStartedAt) : null;
  const slaPercent = Math.min(100, Math.round((totalMinutes / Math.max(1, order.prepTargetMinutes)) * 100));

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
      <div className={styles.row}>
        <small className={styles.meta}>Estacao: {stationLabel}</small>
        <small className={styles.meta}>SLA: {order.prepTargetMinutes} min</small>
      </div>
      <div className={styles.slaTrack} aria-label={`SLA ${slaPercent}%`}>
        <span className={urgency === 'urgent' ? styles.slaUrgent : urgency === 'attention' ? styles.slaAttention : styles.slaNormal} style={{ width: `${slaPercent}%` }} />
      </div>
      {order.lateMinutes > 0 ? <small className={styles.meta}>Atraso: {order.lateMinutes} min</small> : null}
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
      <Button
        className={styles.actionBtn}
        disabled={printDisabled}
        onClick={onPrint}
      >
        {onPrintLabel}
      </Button>
    </Card>
  );
}
