'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  assignDriver,
  createDriver,
  getLogisticsSummary,
  listAssignableOrders,
  listDeliveries,
  listDrivers,
  updateDeliveryStatus,
  updateDriver,
  type DriverStatus,
  type LogisticsAssignableOrder,
  type LogisticsDelivery,
  type LogisticsDriver,
  type LogisticsSummary,
} from '@/features/logistics/logistics.api';
import styles from './page.module.css';

type DeliveryStatusAction = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

const operationShortcuts = [
  { href: '/admin/orders', label: 'Ultimos pedidos', description: 'Fila e historico' },
  { href: '/admin/logistics', label: 'Gestao de entregas', description: 'Despacho e rotas' },
  { href: '/admin/delivery-zones', label: 'Areas de entrega', description: 'Taxas, raio e bairros' },
  { href: '/delivery', label: 'Cardapio online', description: 'Visao do cliente' },
  { href: '/admin/cash', label: 'Caixa', description: 'Fechamento do turno' },
  { href: '/admin/settings', label: 'Configuracoes', description: 'Loja e canais' },
];

export default function AdminLogisticsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<LogisticsSummary | null>(null);
  const [drivers, setDrivers] = useState<LogisticsDriver[]>([]);
  const [orders, setOrders] = useState<LogisticsAssignableOrder[]>([]);
  const [deliveries, setDeliveries] = useState<LogisticsDelivery[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Moto');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [commissionValue, setCommissionValue] = useState('8');

  const availableDrivers = useMemo(
    () => drivers.filter((driver) => driver.isActive && driver.isOnline && driver.status !== 'OFFLINE'),
    [drivers],
  );
  const dispatchQueue = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          Number(!a.canAssign) - Number(!b.canAssign) ||
          Number(a.assignmentStatus !== 'UNASSIGNED') - Number(b.assignmentStatus !== 'UNASSIGNED') ||
          b.waitingMinutes - a.waitingMinutes,
      ),
    [orders],
  );
  const dispatchStats = useMemo(() => {
    const readyToAssign = orders.filter((order) => order.assignmentStatus === 'UNASSIGNED' && order.canAssign).length;
    const blocked = orders.filter((order) => !order.canAssign).length;
    const assigned = deliveries.filter((delivery) => delivery.status === 'ASSIGNED').length;
    const inRoute = deliveries.filter((delivery) => delivery.status === 'OUT_FOR_DELIVERY').length;
    const failed = deliveries.filter((delivery) => delivery.status === 'FAILED').length;
    return { readyToAssign, blocked, assigned, inRoute, failed };
  }, [deliveries, orders]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, driverList, orderList, deliveryList] = await Promise.all([
        getLogisticsSummary(),
        listDrivers(),
        listAssignableOrders(),
        listDeliveries(),
      ]);
      setSummary(nextSummary);
      setDrivers(driverList.items);
      setOrders(orderList.items);
      setDeliveries(deliveryList.items);
      const nextAvailableDrivers = driverList.items.filter(
        (driver) => driver.isActive && driver.isOnline && driver.status !== 'OFFLINE',
      );
      setSelectedDrivers((current) => {
        const next = { ...current };
        for (const order of orderList.items) {
          if (!next[order.id] && order.canAssign && nextAvailableDrivers[0]) next[order.id] = nextAvailableDrivers[0].id;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar logistica.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateDriver(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Nome do entregador e obrigatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDriver({
        name,
        phone,
        vehicleType,
        vehiclePlate,
        commissionType: 'fixed',
        commissionValue: Number(commissionValue || 0),
        status: 'AVAILABLE',
        isOnline: true,
        isActive: true,
      });
      setName('');
      setPhone('');
      setVehiclePlate('');
      setCommissionValue('8');
      setNotice('Entregador criado e liberado para atribuicao.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar entregador.');
    } finally {
      setSaving(false);
    }
  }

  async function setDriverState(driver: LogisticsDriver, status: DriverStatus, isActive = driver.isActive) {
    setSaving(true);
    setError(null);
    try {
      await updateDriver(driver.id, { status, isOnline: status !== 'OFFLINE', isActive });
      setNotice(`${driver.name} atualizado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar entregador.');
    } finally {
      setSaving(false);
    }
  }

  async function onAssignDriver(order: LogisticsAssignableOrder) {
    if (!order.canAssign) {
      setError(order.dispatchBlockers?.[0] ?? 'Pedido ainda nao esta liberado para despacho.');
      return;
    }
    const driverId = selectedDrivers[order.id];
    if (!driverId) {
      setError('Selecione um entregador para atribuir o pedido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await assignDriver(order.id, driverId);
      setNotice(`Pedido ${order.orderNumber} atribuido.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atribuir entregador.');
    } finally {
      setSaving(false);
    }
  }

  async function changeDeliveryStatus(delivery: LogisticsDelivery, status: DeliveryStatusAction) {
    setSaving(true);
    setError(null);
    try {
      await updateDeliveryStatus(delivery.id, status);
      setNotice(status === 'DELIVERED' ? 'Entrega finalizada.' : 'Status da entrega atualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar entrega.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Carregando logistica..." />;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Logistica"
        subtitle="Entregadores, atribuicao, acompanhamento e desempenho da entrega."
        right={
          <div className={styles.headerActions}>
            <Badge tone={summary?.health === 'OK' ? 'success' : summary?.health === 'ATTENTION' ? 'warning' : 'danger'}>
              {summary?.health === 'OK' ? 'Operacao normal' : summary?.health === 'ATTENTION' ? 'Atencao na fila' : 'Revisar falhas'}
            </Badge>
            <Button onClick={() => void load()} disabled={saving}>Atualizar</Button>
          </div>
        }
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <Card className={styles.commandBar}>
        {operationShortcuts.map((shortcut) => (
          <a key={shortcut.href} href={shortcut.href} className={shortcut.href === '/admin/logistics' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        <Metric title="Disponiveis" value={summary?.availableDrivers ?? 0} detail={`${summary?.onlineDrivers ?? 0} online`} />
        <Metric title="Fila sem entregador" value={summary?.pendingDispatchOrders ?? 0} detail="Prontos para despacho" />
        <Metric title="Em rota" value={summary?.openDeliveries ?? 0} detail={`${summary?.onDeliveryDrivers ?? 0} entregador(es)`} />
        <Metric title="Entregues hoje" value={summary?.deliveredToday ?? 0} detail={`${summary?.averageDeliveryMinutes ?? 0} min medio`} />
        <Metric title="Falhas hoje" value={summary?.failedToday ?? 0} detail="Requer conferencia" />
        <Metric title="Repasse estimado" value={money(summary?.courierPayoutToday ?? 0)} detail="Comissoes do dia" />
      </section>

      <Card className={styles.dispatchFlow}>
        <div className={styles.dispatchStep}>
          <span>1</span>
          <div>
            <strong>{orders.length}</strong>
            <small>Prontos da cozinha</small>
          </div>
        </div>
        <div className={styles.dispatchStep}>
          <span>2</span>
          <div>
            <strong>{dispatchStats.readyToAssign}</strong>
            <small>Sem entregador</small>
          </div>
        </div>
        <div className={styles.dispatchStep}>
          <span>3</span>
          <div>
            <strong>{dispatchStats.assigned}</strong>
            <small>Atribuidos</small>
          </div>
        </div>
        <div className={styles.dispatchStep}>
          <span>4</span>
          <div>
            <strong>{dispatchStats.inRoute}</strong>
            <small>Em rota</small>
          </div>
        </div>
        <div className={`${styles.dispatchStep} ${dispatchStats.blocked || dispatchStats.failed ? styles.dispatchStepAttention : ''}`}>
          <span>!</span>
          <div>
            <strong>{dispatchStats.blocked + dispatchStats.failed}</strong>
            <small>Revisar</small>
          </div>
        </div>
      </Card>

      <section className={styles.workspace}>
        <Card className={styles.queuePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Operacao</span>
              <strong>Fila de atribuicao</strong>
            </div>
            <Badge>{dispatchStats.readyToAssign} livres</Badge>
          </div>
          {!orders.length ? (
            <EmptyState title="Sem pedidos pendentes" description="Pedidos de delivery prontos ou aguardando despacho aparecem aqui." />
          ) : null}
          <div className={styles.orderList}>
            {dispatchQueue.map((order) => (
              <article key={order.id} className={`${styles.orderCard} ${!order.canAssign ? styles.orderCardBlocked : ''}`}>
                <div className={styles.orderMain}>
                  <div>
                    <div className={styles.orderTitle}>
                      <strong>{order.orderNumber}</strong>
                      <Badge tone={order.assignmentStatus === 'UNASSIGNED' ? 'warning' : 'success'}>
                        {assignmentLabel(order.assignmentStatus)}
                      </Badge>
                    </div>
                    <p>{order.customer?.name ?? 'Cliente nao informado'} - {addressLine(order)}</p>
                    <small>{money(order.totalAmount)} - taxa {money(order.deliveryFee)} - aguardando {order.waitingMinutes} min</small>
                    {order.dispatchBlockers?.length ? (
                      <div className={styles.blockerList}>
                        {order.dispatchBlockers.map((blocker) => (
                          <span key={blocker}>{blocker}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.assignmentBox}>
                    <Select
                      value={selectedDrivers[order.id] ?? ''}
                      onChange={(event) => setSelectedDrivers((current) => ({ ...current, [order.id]: event.target.value }))}
                      disabled={!availableDrivers.length || saving || !order.canAssign}
                    >
                      <option value="">Selecionar entregador</option>
                      {availableDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} - {driver.vehicleType || 'sem veiculo'}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="primary" onClick={() => void onAssignDriver(order)} disabled={saving || !order.canAssign || !availableDrivers.length}>
                      Atribuir
                    </Button>
                  </div>
                </div>
                {order.courier ? <small className={styles.currentCourier}>Atual: {order.courier.name}</small> : null}
              </article>
            ))}
          </div>
        </Card>

        <aside className={styles.sideStack}>
          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>Cadastro</span>
                <strong>Novo entregador</strong>
              </div>
            </div>
            <form className={styles.formGrid} onSubmit={onCreateDriver}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do entregador" />
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefone / WhatsApp" />
              <Select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
                <option>Moto</option>
                <option>Carro</option>
                <option>Bicicleta</option>
                <option>A pe</option>
              </Select>
              <Input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} placeholder="Placa / identificacao" />
              <Input value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} placeholder="Taxa por entrega" />
              <Button type="submit" variant="primary" disabled={saving}>Cadastrar entregador</Button>
            </form>
          </Card>

          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span>Equipe</span>
                <strong>Saude da escala</strong>
              </div>
            </div>
            <div className={styles.healthList}>
              <span><b>{summary?.activeDrivers ?? 0}</b> ativos</span>
              <span><b>{summary?.onlineDrivers ?? 0}</b> online</span>
              <span><b>{summary?.onDeliveryDrivers ?? 0}</b> em entrega</span>
              <span><b>{summary?.deliveriesToday ?? 0}</b> atribuicoes hoje</span>
            </div>
          </Card>
        </aside>
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span>Equipe</span>
            <strong>Entregadores</strong>
          </div>
          <Badge>{drivers.length} cadastrados</Badge>
        </div>
        {!drivers.length ? <EmptyState title="Sem entregadores" description="Cadastre entregadores para atribuir pedidos de delivery." /> : null}
        <div className={styles.cardsGrid}>
          {drivers.map((driver) => (
            <article key={driver.id} className={styles.itemCard}>
              <div className={styles.itemTop}>
                <div>
                  <strong>{driver.name}</strong>
                  <small>{driver.phone || 'Sem telefone'} - {driver.vehicleType || 'Sem veiculo'} {driver.vehiclePlate ? `- ${driver.vehiclePlate}` : ''}</small>
                </div>
                <Badge tone={driver.isActive ? statusTone(driver.status) : 'danger'}>{driver.isActive ? driverStatusLabel(driver.status) : 'Inativo'}</Badge>
              </div>
              <div className={styles.metaGrid}>
                <span>Hoje <b>{driver.deliveriesToday ?? 0}</b></span>
                <span>Entregues <b>{driver.deliveredToday ?? 0}</b></span>
                <span>Falhas <b>{driver.failedToday ?? 0}</b></span>
                <span>Media <b>{driver.averageDeliveryMinutes ?? 0} min</b></span>
                <span>Em aberto <b>{driver.openDeliveries ?? 0}</b></span>
                <span>Repasse <b>{money(driver.payoutToday ?? 0)}</b></span>
              </div>
              <div className={styles.actions}>
                <Button onClick={() => void setDriverState(driver, 'AVAILABLE')} disabled={saving}>Disponivel</Button>
                <Button onClick={() => void setDriverState(driver, 'OFFLINE')} disabled={saving}>Offline</Button>
                <Button variant="danger" onClick={() => void setDriverState(driver, driver.status, !driver.isActive)} disabled={saving}>
                  {driver.isActive ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span>Acompanhamento</span>
            <strong>Entregas recentes</strong>
          </div>
          <Badge>{deliveries.length} registros</Badge>
        </div>
        {!deliveries.length ? <EmptyState title="Sem entregas atribuidas" description="Quando um pedido receber entregador, ele aparece aqui." /> : null}
        <div className={styles.deliveryList}>
          {deliveries.map((delivery) => (
            <article key={delivery.id} className={styles.deliveryRow}>
              <div>
                <div className={styles.orderTitle}>
                  <strong>Pedido {delivery.order.orderNumber}</strong>
                  <Badge tone={delivery.status === 'FAILED' ? 'danger' : delivery.status === 'DELIVERED' ? 'success' : 'warning'}>
                    {assignmentLabel(delivery.status)}
                  </Badge>
                </div>
                <p>{delivery.courier.name} - {delivery.order.customer?.name ?? 'Cliente nao informado'} - {money(delivery.order.totalAmount)}</p>
                <small>
                  Atribuida em {formatDate(delivery.assignedAt)} - {delivery.elapsedMinutes} min
                  {delivery.order.trackingToken ? ` - token ${delivery.order.trackingToken}` : ''}
                </small>
              </div>
              <div className={styles.actions}>
                <Button onClick={() => void changeDeliveryStatus(delivery, 'OUT_FOR_DELIVERY')} disabled={saving}>Saiu</Button>
                <Button onClick={() => void changeDeliveryStatus(delivery, 'DELIVERED')} disabled={saving}>Entregue</Button>
                <Button variant="danger" onClick={() => void changeDeliveryStatus(delivery, 'FAILED')} disabled={saving}>Falhou</Button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}

function Metric({ title, value, detail }: { title: string; value: string | number; detail: string }) {
  return (
    <Card className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Card>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function addressLine(order: LogisticsAssignableOrder) {
  if (!order.address) return 'Endereco nao informado';
  return `${order.address.street}, ${order.address.number} - ${order.address.district}`;
}

function assignmentLabel(status: string) {
  const labels: Record<string, string> = {
    UNASSIGNED: 'Sem entregador',
    ASSIGNED: 'Atribuido',
    OUT_FOR_DELIVERY: 'Em rota',
    DELIVERED: 'Entregue',
    FAILED: 'Falhou',
  };
  return labels[status] ?? status;
}

function driverStatusLabel(status: DriverStatus) {
  const labels: Record<DriverStatus, string> = {
    AVAILABLE: 'Disponivel',
    ON_DELIVERY: 'Em entrega',
    OFFLINE: 'Offline',
  };
  return labels[status];
}

function statusTone(status: DriverStatus): 'success' | 'warning' | 'danger' {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'ON_DELIVERY') return 'warning';
  return 'danger';
}
