'use client';

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  addZoneNeighborhood,
  addZonePostalCodeRange,
  addZonePolygonPoints,
  addZoneSchedule,
  archiveDeliveryZone,
  createDeliveryZone,
  createDynamicPricingRule,
  duplicateDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
  validateDeliveryAddress,
  type DeliveryZone,
  type DeliveryZoneType,
  type DeliveryZoneValidation,
} from '@/features/delivery-zones/delivery-zones.api';
import styles from './page.module.css';

const zoneTypes: Array<{ value: DeliveryZoneType; label: string }> = [
  { value: 'NEIGHBORHOOD', label: 'Bairros' },
  { value: 'POSTAL_CODE', label: 'CEPs' },
  { value: 'RADIUS', label: 'Raio KM' },
  { value: 'POLYGON', label: 'Mapa / Recorte' },
  { value: 'MANUAL', label: 'Manual' },
];

const adjustmentTypes = [
  { value: 'ADD_FIXED', label: 'Somar valor' },
  { value: 'SUBTRACT_FIXED', label: 'Descontar valor' },
  { value: 'SET_FIXED', label: 'Definir valor' },
  { value: 'PERCENTAGE_INCREASE', label: 'Aumentar %' },
  { value: 'PERCENTAGE_DISCOUNT', label: 'Descontar %' },
];

type ZoneFilter = 'ALL' | 'ACTIVE' | 'HIDDEN' | 'BLOCKED' | 'NEGOTIATION' | 'DYNAMIC';
type ZoneTab = 'overview' | 'map' | 'neighborhoods' | 'postal' | 'rules' | 'schedule' | 'validation' | 'audit';
type PolygonDraftPoint = { latitude: number; longitude: number };

const MAP_WIDTH = 720;
const MAP_HEIGHT = 360;
const MAP_TILE_SIZE = 256;
const DEFAULT_MAP_CENTER = { latitude: -24.3207, longitude: -46.9994 };

const zoneFilters: Array<{ value: ZoneFilter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ACTIVE', label: 'Ativas' },
  { value: 'HIDDEN', label: 'Ocultas do site' },
  { value: 'BLOCKED', label: 'Nao entregamos' },
  { value: 'NEGOTIATION', label: 'WhatsApp' },
  { value: 'DYNAMIC', label: 'Preco dinamico' },
];

const zoneTabs: Array<{ value: ZoneTab; label: string; description: string }> = [
  { value: 'overview', label: 'Visao geral', description: 'taxas e status' },
  { value: 'map', label: 'Mapa / raio', description: 'recorte e distancia' },
  { value: 'neighborhoods', label: 'Bairros', description: 'alias e cidade' },
  { value: 'postal', label: 'CEPs', description: 'faixas atendidas' },
  { value: 'rules', label: 'Regras especiais', description: 'pico e bloqueios' },
  { value: 'schedule', label: 'Horarios', description: 'ativacao e inativacao' },
  { value: 'validation', label: 'Teste checkout', description: 'endereco publico' },
  { value: 'audit', label: 'Auditoria', description: 'cadastro e risco' },
];

export default function AdminDeliveryZonesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<DeliveryZone[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'NEIGHBORHOOD' as DeliveryZoneType,
    deliveryFee: '8.00',
    courierFee: '6.00',
    minimumOrderAmount: '35.00',
    estimatedMinutesMin: '35',
    estimatedMinutesMax: '55',
    radiusKm: '5',
    feePerKm: '0',
    visibleOnDeliverySite: 'yes',
    isBlockedArea: 'no',
    blockedReason: '',
    requiresManualNegotiation: 'no',
    negotiationMessage: '',
  });
  const [neighborhood, setNeighborhood] = useState('');
  const [alias, setAlias] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [postalStart, setPostalStart] = useState('');
  const [postalEnd, setPostalEnd] = useState('');
  const [ruleName, setRuleName] = useState('Horario de pico');
  const [ruleType, setRuleType] = useState('ADD_FIXED');
  const [ruleAmount, setRuleAmount] = useState('3.00');
  const [ruleStart, setRuleStart] = useState('18:00');
  const [ruleEnd, setRuleEnd] = useState('22:00');
  const [scheduleMode, setScheduleMode] = useState('ACTIVE_WINDOW');
  const [scheduleDay, setScheduleDay] = useState('1');
  const [scheduleStart, setScheduleStart] = useState('18:00');
  const [scheduleEnd, setScheduleEnd] = useState('23:00');
  const [testCep, setTestCep] = useState('');
  const [testNeighborhood, setTestNeighborhood] = useState('');
  const [testCity, setTestCity] = useState('');
  const [testState, setTestState] = useState('SP');
  const [testSubtotal, setTestSubtotal] = useState('50');
  const [validation, setValidation] = useState<DeliveryZoneValidation | null>(null);
  const [statusFilter, setStatusFilter] = useState<ZoneFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | DeliveryZoneType>('ALL');
  const [activeTab, setActiveTab] = useState<ZoneTab>('overview');
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraftPoint[]>([]);
  const [mapZoom, setMapZoom] = useState(13);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const statusMatches =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && item.status === 'ACTIVE') ||
        (statusFilter === 'HIDDEN' && !item.visibleOnDeliverySite) ||
        (statusFilter === 'BLOCKED' && item.isBlockedArea) ||
        (statusFilter === 'NEGOTIATION' && item.requiresManualNegotiation) ||
        (statusFilter === 'DYNAMIC' && item.dynamicPricingRules.length > 0);
      const typeMatches = typeFilter === 'ALL' || item.type === typeFilter;
      return statusMatches && typeMatches;
    });
  }, [items, statusFilter, typeFilter]);

  const selected = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [filteredItems, items, selectedId],
  );

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === 'ACTIVE').length;
    const visible = items.filter((item) => item.visibleOnDeliverySite).length;
    const blocked = items.filter((item) => item.isBlockedArea).length;
    const negotiation = items.filter((item) => item.requiresManualNegotiation).length;
    const dynamic = items.filter((item) => item.dynamicPricingRules.length > 0).length;
    const neighborhoods = items.reduce((total, item) => total + item.neighborhoods.length, 0);
    const postal = items.reduce((total, item) => total + item.postalCodeRanges.length, 0);
    const schedules = items.reduce((total, item) => total + item.schedules.length, 0);
    return { active, visible, blocked, negotiation, dynamic, neighborhoods, postal, schedules };
  }, [items]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await listDeliveryZones();
      setItems(response.items);
      if (!selectedId && response.items[0]) setSelectedId(response.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar areas de entrega.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPolygonDraft(
      selected?.polygonPoints
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((point) => ({ latitude: point.latitude, longitude: point.longitude })) ?? [],
    );
  }, [selected?.id, selected?.polygonPoints.length]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createDeliveryZone({
        name: form.name,
        type: form.type,
        deliveryFee: Number(form.deliveryFee || 0),
        courierFee: form.courierFee ? Number(form.courierFee) : null,
        minimumOrderAmount: form.minimumOrderAmount ? Number(form.minimumOrderAmount) : null,
        estimatedMinutesMin: form.estimatedMinutesMin ? Number(form.estimatedMinutesMin) : null,
        estimatedMinutesMax: form.estimatedMinutesMax ? Number(form.estimatedMinutesMax) : null,
        radiusKm: form.radiusKm ? Number(form.radiusKm) : null,
        feePerKm: form.feePerKm ? Number(form.feePerKm) : null,
        visibleOnDeliverySite: form.visibleOnDeliverySite === 'yes',
        isBlockedArea: form.isBlockedArea === 'yes',
        blockedReason: form.blockedReason || null,
        requiresManualNegotiation: form.requiresManualNegotiation === 'yes',
        negotiationChannel: form.requiresManualNegotiation === 'yes' ? 'WHATSAPP' : null,
        negotiationMessage: form.negotiationMessage || null,
      });
      setSelectedId(created.id);
      setNotice('Area criada.');
      setForm((current) => ({ ...current, name: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar area.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelected(field: 'visibleOnDeliverySite' | 'isBlockedArea' | 'requiresManualNegotiation') {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateDeliveryZone(selected.id, { [field]: !selected[field] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar area.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelected() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await archiveDeliveryZone(selected.id);
      setNotice('Area arquivada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao arquivar area.');
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSelected() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const duplicated = await duplicateDeliveryZone(selected.id);
      setSelectedId(duplicated.id);
      setNotice('Area duplicada como rascunho.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao duplicar area.');
    } finally {
      setSaving(false);
    }
  }

  async function onAddNeighborhood(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await addZoneNeighborhood(selected.id, { neighborhood, alias, city, state });
      setNeighborhood('');
      setAlias('');
      setNotice('Bairro vinculado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao adicionar bairro.');
    } finally {
      setSaving(false);
    }
  }

  async function onAddPostalRange(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await addZonePostalCodeRange(selected.id, { postalCodeStart: postalStart, postalCodeEnd: postalEnd });
      setPostalStart('');
      setPostalEnd('');
      setNotice('Faixa de CEP vinculada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao adicionar CEP.');
    } finally {
      setSaving(false);
    }
  }

  async function onAddRule(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await createDynamicPricingRule(selected.id, {
        name: ruleName,
        adjustmentType: ruleType,
        adjustmentAmount: Number(ruleAmount || 0),
        startTime: ruleStart,
        endTime: ruleEnd,
        priority: 100,
        status: 'ACTIVE',
      });
      setNotice('Preco dinamico criado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar preco dinamico.');
    } finally {
      setSaving(false);
    }
  }

  async function onAddSchedule(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await addZoneSchedule(selected.id, {
        dayOfWeek: Number(scheduleDay),
        startTime: scheduleStart,
        endTime: scheduleEnd,
        mode: scheduleMode,
      });
      setNotice('Horario configurado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao configurar horario.');
    } finally {
      setSaving(false);
    }
  }

  async function onValidate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setValidation(null);
    try {
      const result = await validateDeliveryAddress({
        postalCode: testCep,
        neighborhood: testNeighborhood,
        city: testCity,
        state: testState,
        orderSubtotal: Number(testSubtotal || 0),
      });
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao testar endereco.');
    } finally {
      setSaving(false);
    }
  }

  async function onSavePolygon() {
    if (!selected) return;
    if (polygonDraft.length < 3) {
      setError('Desenhe pelo menos 3 pontos para salvar o poligono.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addZonePolygonPoints(selected.id, { points: polygonDraft });
      setNotice('Poligono salvo para a area de entrega.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar poligono.');
    } finally {
      setSaving(false);
    }
  }

  function onMapClick(event: MouseEvent<SVGSVGElement>) {
    if (!selected) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    const center = mapCenterForZone(selected, polygonDraft);
    const point = svgToLatLng(x, y, center, mapZoom);
    setPolygonDraft((current) => [...current, point]);
  }

  if (loading) return <LoadingState label="Carregando areas de entrega..." />;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Areas de Entrega"
        subtitle="Regioes dinamicas por bairro, CEP, raio, mapa, preco dinamico e checkout publico."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <section className={styles.kpis}>
        <Metric title="Areas" value={items.length} />
        <Metric title="Ativas" value={stats.active} />
        <Metric title="Site Delivery" value={stats.visible} />
        <Metric title="Bloqueadas" value={stats.blocked} />
        <Metric title="WhatsApp" value={stats.negotiation} />
        <Metric title="Preco dinamico" value={stats.dynamic} />
      </section>

      <Card className={styles.controlBar}>
        <div className={styles.panelHeader}>
          <div>
            <span>Operacao</span>
            <strong>Areas, regras e checkout</strong>
          </div>
          <div className={styles.badges}>
            <Badge tone="success">{stats.neighborhoods} bairros</Badge>
            <Badge>{stats.postal} faixas CEP</Badge>
            <Badge tone={stats.schedules > 0 ? 'success' : 'warning'}>{stats.schedules} horarios</Badge>
          </div>
        </div>
        <div className={styles.filterBar}>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ZoneFilter)}>
            {zoneFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </Select>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'ALL' | DeliveryZoneType)}>
            <option value="ALL">Todos os tipos</option>
            {zoneTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </Select>
          <Button onClick={() => { setStatusFilter('ALL'); setTypeFilter('ALL'); }} disabled={saving}>Limpar filtros</Button>
        </div>
      </Card>

      <section className={styles.workspace}>
        <Card className={`${styles.panel} ${styles.createPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span>Cadastro rapido</span>
              <strong>Nova area</strong>
            </div>
            <Badge tone={form.visibleOnDeliverySite === 'yes' ? 'success' : 'warning'}>
              {form.visibleOnDeliverySite === 'yes' ? 'Vai para o site' : 'Interna'}
            </Badge>
          </div>
          <form className={styles.formGrid} onSubmit={onCreate}>
            <label>
              <span>Nome da area</span>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex: Centro ate 3km" />
            </label>
            <label>
              <span>Tipo de calculo</span>
              <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as DeliveryZoneType })}>
                {zoneTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
            </label>
            <label>
              <span>Taxa cliente</span>
              <Input value={form.deliveryFee} onChange={(event) => setForm({ ...form, deliveryFee: event.target.value })} placeholder="Taxa cliente" />
            </label>
            <label>
              <span>Repasse entregador</span>
              <Input value={form.courierFee} onChange={(event) => setForm({ ...form, courierFee: event.target.value })} placeholder="Repasse entregador" />
            </label>
            <label>
              <span>Pedido minimo</span>
              <Input value={form.minimumOrderAmount} onChange={(event) => setForm({ ...form, minimumOrderAmount: event.target.value })} placeholder="Pedido minimo" />
            </label>
            <label>
              <span>Prazo minimo</span>
              <Input value={form.estimatedMinutesMin} onChange={(event) => setForm({ ...form, estimatedMinutesMin: event.target.value })} placeholder="Minutos" />
            </label>
            <label>
              <span>Prazo maximo</span>
              <Input value={form.estimatedMinutesMax} onChange={(event) => setForm({ ...form, estimatedMinutesMax: event.target.value })} placeholder="Minutos" />
            </label>
            <label>
              <span>Raio KM</span>
              <Input value={form.radiusKm} onChange={(event) => setForm({ ...form, radiusKm: event.target.value })} placeholder="Raio KM" />
            </label>
            <label>
              <span>Visibilidade</span>
              <Select value={form.visibleOnDeliverySite} onChange={(event) => setForm({ ...form, visibleOnDeliverySite: event.target.value })}>
                <option value="yes">Exibir no site</option>
                <option value="no">Ocultar do site</option>
              </Select>
            </label>
            <label>
              <span>Atendimento</span>
              <Select value={form.isBlockedArea} onChange={(event) => setForm({ ...form, isBlockedArea: event.target.value })}>
                <option value="no">Area atendida</option>
                <option value="yes">Nao entregamos</option>
              </Select>
            </label>
            <label>
              <span>Checkout</span>
              <Select value={form.requiresManualNegotiation} onChange={(event) => setForm({ ...form, requiresManualNegotiation: event.target.value })}>
                <option value="no">Calcular automatico</option>
                <option value="yes">Negociar WhatsApp</option>
              </Select>
            </label>
            <label>
              <span>Mensagem WhatsApp</span>
              <Input value={form.negotiationMessage} onChange={(event) => setForm({ ...form, negotiationMessage: event.target.value })} placeholder="Mensagem WhatsApp" />
            </label>
            <Button type="submit" variant="primary" disabled={saving}>Criar area</Button>
          </form>
        </Card>

        <Card className={`${styles.panel} ${styles.listPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span>Lista</span>
              <strong>Regioes cadastradas</strong>
            </div>
            <Badge>{filteredItems.length} exibidas</Badge>
          </div>
          {!items.length ? <EmptyState title="Sem areas" description="Crie uma area para o checkout calcular entrega dinamicamente." /> : null}
          {items.length > 0 && !filteredItems.length ? <EmptyState title="Nenhuma area no filtro" description="Ajuste os filtros para visualizar outras regioes." /> : null}
          <div className={styles.zoneList}>
            {filteredItems.map((zone) => (
              <button key={zone.id} type="button" className={selected?.id === zone.id ? styles.zoneActive : styles.zoneButton} onClick={() => setSelectedId(zone.id)}>
                <div>
                  <strong>{zone.name}</strong>
                  <span>{labelForZoneType(zone.type)} | prioridade {zone.priority}</span>
                </div>
                <div className={styles.zoneMeta}>
                  <small>{money(zone.deliveryFee)} cliente</small>
                  <small>{zone.courierFee != null ? money(zone.courierFee) : '-'} entregador</small>
                </div>
                <div className={styles.zonePills}>
                  <Badge tone={zone.status === 'ACTIVE' ? 'success' : 'warning'}>{zone.status}</Badge>
                  {!zone.visibleOnDeliverySite ? <Badge tone="warning">Oculta</Badge> : null}
                  {zone.isBlockedArea ? <Badge tone="danger">Bloqueada</Badge> : null}
                  {zone.requiresManualNegotiation ? <Badge tone="warning">WhatsApp</Badge> : null}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {selected ? (
          <section className={styles.editor}>
            <Card className={`${styles.panel} ${styles.selectedHero}`}>
              <div className={styles.detailTop}>
                <div>
                  <span>Area selecionada</span>
                  <strong>{selected.name}</strong>
                  <p>{labelForZoneType(selected.type)} | prioridade {selected.priority} | atualizado {shortDate(selected.updatedAt)}</p>
                </div>
                <div className={styles.badges}>
                  <Badge tone={selected.status === 'ACTIVE' ? 'success' : 'warning'}>{selected.status}</Badge>
                  <Badge tone={selected.visibleOnDeliverySite ? 'success' : 'warning'}>{selected.visibleOnDeliverySite ? 'Site Delivery' : 'Oculta no site'}</Badge>
                  {selected.isBlockedArea ? <Badge tone="danger">Nao entregamos</Badge> : null}
                  {selected.requiresManualNegotiation ? <Badge tone="warning">WhatsApp</Badge> : null}
                </div>
              </div>
              <div className={styles.summaryGrid}>
                <SummaryTile title="Taxa cliente" value={money(selected.deliveryFee)} />
                <SummaryTile title="Repasse entregador" value={selected.courierFee != null ? money(selected.courierFee) : '-'} />
                <SummaryTile title="Pedido minimo" value={selected.minimumOrderAmount != null ? money(selected.minimumOrderAmount) : '-'} />
                <SummaryTile title="Prazo" value={`${selected.estimatedMinutesMin ?? '-'}-${selected.estimatedMinutesMax ?? '-'} min`} />
                <SummaryTile title="Bairros" value={selected.neighborhoods.length} />
                <SummaryTile title="CEPs" value={selected.postalCodeRanges.length} />
              </div>
              <div className={styles.actionRow}>
                <Button onClick={() => void toggleSelected('visibleOnDeliverySite')} disabled={saving}>{selected.visibleOnDeliverySite ? 'Ocultar site' : 'Exibir site'}</Button>
                <Button onClick={() => void toggleSelected('isBlockedArea')} disabled={saving}>{selected.isBlockedArea ? 'Liberar area' : 'Nao entregamos'}</Button>
                <Button onClick={() => void toggleSelected('requiresManualNegotiation')} disabled={saving}>{selected.requiresManualNegotiation ? 'Calcular automatico' : 'Negociar WhatsApp'}</Button>
                <Button onClick={() => void duplicateSelected()} disabled={saving}>Duplicar</Button>
                <Button variant="danger" onClick={() => void archiveSelected()} disabled={saving}>Arquivar</Button>
              </div>
            </Card>

            <Card className={styles.panel}>
              <div className={styles.tabs}>
                {zoneTabs.map((tab) => (
                  <button key={tab.value} type="button" className={activeTab === tab.value ? styles.tabActive : styles.tabButton} onClick={() => setActiveTab(tab.value)}>
                    <strong>{tab.label}</strong>
                    <span>{tab.description}</span>
                  </button>
                ))}
              </div>
            </Card>

            {activeTab === 'overview' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Visao geral</span><strong>Como essa area entra no checkout</strong></div>
                <div className={styles.auditGrid}>
                  <AuditLine label="Tipo" value={labelForZoneType(selected.type)} />
                  <AuditLine label="Status" value={selected.status} />
                  <AuditLine label="Visivel no site" value={selected.visibleOnDeliverySite ? 'Sim' : 'Nao'} />
                  <AuditLine label="Negociacao manual" value={selected.requiresManualNegotiation ? 'Sim, WhatsApp' : 'Nao'} />
                  <AuditLine label="Area bloqueada" value={selected.isBlockedArea ? selected.blockedReason || 'Nao entregamos nessa regiao' : 'Nao'} />
                  <AuditLine label="Regra de prioridade" value={`Prioridade ${selected.priority}`} />
                </div>
              </Card>
            ) : null}

            {activeTab === 'map' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Mapa / Recorte</span><strong>Raio, base e poligono</strong></div>
                <div className={styles.summaryGrid}>
                  <SummaryTile title="Raio KM" value={selected.radiusKm ?? '-'} />
                  <SummaryTile title="Taxa por KM" value={selected.feePerKm != null ? money(selected.feePerKm) : '-'} />
                  <SummaryTile title="Distancia maxima" value={selected.maxDistanceKm ? `${selected.maxDistanceKm} km` : '-'} />
                  <SummaryTile title="Pontos no mapa" value={polygonDraft.length} />
                </div>
                <DeliveryZoneMap
                  zone={selected}
                  points={polygonDraft}
                  zoom={mapZoom}
                  onClick={onMapClick}
                />
                <div className={styles.mapActions}>
                  <Button type="button" onClick={() => setPolygonDraft((current) => current.slice(0, -1))} disabled={saving || polygonDraft.length === 0}>Desfazer ponto</Button>
                  <Button type="button" onClick={() => setPolygonDraft([])} disabled={saving || polygonDraft.length === 0}>Limpar desenho</Button>
                  <Button type="button" onClick={() => setMapZoom((current) => Math.max(11, current - 1))}>- Zoom</Button>
                  <Button type="button" onClick={() => setMapZoom((current) => Math.min(17, current + 1))}>+ Zoom</Button>
                  <Button type="button" variant="primary" onClick={() => void onSavePolygon()} disabled={saving || polygonDraft.length < 3}>Salvar poligono</Button>
                </div>
                <div className={styles.pointList}>
                  {polygonDraft.length ? polygonDraft.map((point, index) => (
                    <span key={`${point.latitude}-${point.longitude}-${index}`}>
                      {index + 1}. {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                    </span>
                  )) : <span>Clique no mapa para inserir os pontos da regiao.</span>}
                </div>
              </Card>
            ) : null}

            {activeTab === 'neighborhoods' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Bairros</span><strong>Alias, sub-bairros e cidades</strong></div>
                <form className={styles.compactForm} onSubmit={onAddNeighborhood}>
                  <Input value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} placeholder="Bairro" />
                  <Input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Apelido/sub-bairro" />
                  <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Cidade" />
                  <Input value={state} onChange={(event) => setState(event.target.value)} placeholder="UF" />
                  <Button type="submit" disabled={saving}>Adicionar</Button>
                </form>
                <MiniList items={selected.neighborhoods.map((item) => `${item.neighborhood}${item.alias ? ` / ${item.alias}` : ''}${item.city ? ` - ${item.city}` : ''}`)} empty="Sem bairros vinculados." />
              </Card>
            ) : null}

            {activeTab === 'postal' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>CEPs</span><strong>Faixas atendidas pelo site</strong></div>
                <form className={styles.compactForm} onSubmit={onAddPostalRange}>
                  <Input value={postalStart} onChange={(event) => setPostalStart(event.target.value)} placeholder="CEP inicial" />
                  <Input value={postalEnd} onChange={(event) => setPostalEnd(event.target.value)} placeholder="CEP final" />
                  <Button type="submit" disabled={saving}>Adicionar</Button>
                </form>
                <MiniList items={selected.postalCodeRanges.map((item) => `${formatCep(item.postalCodeStart)} ate ${formatCep(item.postalCodeEnd)}`)} empty="Sem faixas de CEP." />
              </Card>
            ) : null}

            {activeTab === 'rules' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Preco dinamico</span><strong>Pico, desconto e regra especial</strong></div>
                <form className={styles.compactForm} onSubmit={onAddRule}>
                  <Input value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Nome da regra" />
                  <Select value={ruleType} onChange={(event) => setRuleType(event.target.value)}>
                    {adjustmentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                  <Input value={ruleAmount} onChange={(event) => setRuleAmount(event.target.value)} placeholder="Valor" />
                  <Input value={ruleStart} onChange={(event) => setRuleStart(event.target.value)} placeholder="Inicio HH:mm" />
                  <Input value={ruleEnd} onChange={(event) => setRuleEnd(event.target.value)} placeholder="Fim HH:mm" />
                  <Button type="submit" disabled={saving}>Criar regra</Button>
                </form>
                <MiniList items={selected.dynamicPricingRules.map((item) => `${item.name}: ${item.adjustmentType} ${item.adjustmentAmount}`)} empty="Sem preco dinamico." />
              </Card>
            ) : null}

            {activeTab === 'schedule' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Horarios</span><strong>Ativacao e inativacao programada</strong></div>
                <form className={styles.compactForm} onSubmit={onAddSchedule}>
                  <Select value={scheduleMode} onChange={(event) => setScheduleMode(event.target.value)}>
                    <option value="ACTIVE_WINDOW">Ativo no intervalo</option>
                    <option value="INACTIVE_WINDOW">Inativo no intervalo</option>
                  </Select>
                  <Input value={scheduleDay} onChange={(event) => setScheduleDay(event.target.value)} placeholder="Dia 0-6" />
                  <Input value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} placeholder="Inicio" />
                  <Input value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} placeholder="Fim" />
                  <Button type="submit" disabled={saving}>Salvar horario</Button>
                </form>
                <MiniList items={selected.schedules.map((item) => `${dayLabel(item.dayOfWeek)} ${item.startTime}-${item.endTime} ${item.mode}`)} empty="Sem horarios especificos." />
              </Card>
            ) : null}

            {activeTab === 'validation' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Teste</span><strong>Validar checkout publico</strong></div>
                <form className={styles.compactForm} onSubmit={onValidate}>
                  <Input value={testCep} onChange={(event) => setTestCep(event.target.value)} placeholder="CEP" />
                  <Input value={testNeighborhood} onChange={(event) => setTestNeighborhood(event.target.value)} placeholder="Bairro" />
                  <Input value={testCity} onChange={(event) => setTestCity(event.target.value)} placeholder="Cidade" />
                  <Input value={testState} onChange={(event) => setTestState(event.target.value)} placeholder="UF" />
                  <Input value={testSubtotal} onChange={(event) => setTestSubtotal(event.target.value)} placeholder="Subtotal" />
                  <Button type="submit" variant="primary" disabled={saving}>Testar</Button>
                </form>
                {validation ? (
                  <div className={validation.deliverable ? styles.validationOk : styles.validationBlocked}>
                    <strong>{validation.deliverable ? 'Entrega atendida' : validation.reason || 'Nao atendida'}</strong>
                    <span>{validation.message || validation.zoneName || 'Resultado calculado pelo motor dinamico.'}</span>
                    <span>Taxa: {money(validation.deliveryFee)} | Repasse: {validation.courierFee != null ? money(validation.courierFee) : '-'} | Prazo: {validation.estimatedMinutesMin ?? '-'}-{validation.estimatedMinutesMax ?? '-'} min</span>
                    {validation.minimumOrderAmount != null ? <span>Pedido minimo: {money(validation.minimumOrderAmount)} {validation.missingAmount ? `| Falta ${money(validation.missingAmount)}` : ''}</span> : null}
                    {validation.requiresManualNegotiation ? <span>Cliente deve negociar pelo canal configurado.</span> : null}
                    {validation.dynamicPricingApplied ? <span>Preco dinamico: {validation.dynamicPricingRuleName}</span> : null}
                  </div>
                ) : null}
              </Card>
            ) : null}

            {activeTab === 'audit' ? (
              <Card className={styles.panel}>
                <div className={styles.panelHeader}><span>Auditoria</span><strong>Risco operacional da area</strong></div>
                <div className={styles.auditGrid}>
                  <AuditLine label="ID" value={selected.id} />
                  <AuditLine label="Criada em" value={shortDate(selected.createdAt)} />
                  <AuditLine label="Atualizada em" value={shortDate(selected.updatedAt)} />
                  <AuditLine label="Itens de bairro" value={String(selected.neighborhoods.length)} />
                  <AuditLine label="Faixas de CEP" value={String(selected.postalCodeRanges.length)} />
                  <AuditLine label="Regras dinamicas" value={String(selected.dynamicPricingRules.length)} />
                  <AuditLine label="Horarios" value={String(selected.schedules.length)} />
                  <AuditLine label="Pontos de mapa" value={String(selected.polygonPoints.length)} />
                </div>
              </Card>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function SummaryTile({ title, value }: { title: string; value: string | number | null | undefined }) {
  return (
    <div className={styles.summaryTile}>
      <span>{title}</span>
      <strong>{value ?? '-'}</strong>
    </div>
  );
}

function AuditLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.auditLine}>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function MiniList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className={styles.emptyText}>{empty}</p>;
  return (
    <div className={styles.miniList}>
      {items.slice(0, 8).map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function DeliveryZoneMap({
  zone,
  points,
  zoom,
  onClick,
}: {
  zone: DeliveryZone;
  points: PolygonDraftPoint[];
  zoom: number;
  onClick: (event: MouseEvent<SVGSVGElement>) => void;
}) {
  const center = mapCenterForZone(zone, points);
  const centerWorld = latLngToWorld(center.latitude, center.longitude, zoom);
  const centerTileX = Math.floor(centerWorld.x / MAP_TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / MAP_TILE_SIZE);
  const tiles = [];
  for (let x = centerTileX - 2; x <= centerTileX + 2; x += 1) {
    for (let y = centerTileY - 1; y <= centerTileY + 2; y += 1) {
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        href: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        x: x * MAP_TILE_SIZE - centerWorld.x + MAP_WIDTH / 2,
        y: y * MAP_TILE_SIZE - centerWorld.y + MAP_HEIGHT / 2,
      });
    }
  }

  const screenPoints = points.map((point) => latLngToSvg(point.latitude, point.longitude, center, zoom));
  const polygonPath = screenPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const basePoint =
    zone.baseLatitude != null && zone.baseLongitude != null
      ? latLngToSvg(zone.baseLatitude, zone.baseLongitude, center, zoom)
      : null;
  const radiusPixels =
    basePoint && zone.radiusKm ? (Number(zone.radiusKm) * 1000) / metersPerPixel(zone.baseLatitude ?? center.latitude, zoom) : 0;

  return (
    <div className={styles.mapShell}>
      <svg className={styles.deliveryMap} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Mapa para desenhar area de entrega" onClick={onClick}>
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} className={styles.mapFallback} />
        {tiles.map((tile) => (
          <image key={tile.key} href={tile.href} x={tile.x} y={tile.y} width={MAP_TILE_SIZE} height={MAP_TILE_SIZE} preserveAspectRatio="none" />
        ))}
        {basePoint && radiusPixels > 0 ? <circle cx={basePoint.x} cy={basePoint.y} r={radiusPixels} className={styles.mapRadius} /> : null}
        {screenPoints.length >= 3 ? <polygon points={polygonPath} className={styles.mapPolygon} /> : null}
        {screenPoints.length >= 2 ? <polyline points={polygonPath} className={styles.mapLine} /> : null}
        {screenPoints.map((point, index) => (
          <g key={`${point.x}-${point.y}-${index}`}>
            <circle cx={point.x} cy={point.y} r="8" className={styles.mapPoint} />
            <text x={point.x} y={point.y + 4} textAnchor="middle" className={styles.mapPointText}>{index + 1}</text>
          </g>
        ))}
        {basePoint ? (
          <g>
            <circle cx={basePoint.x} cy={basePoint.y} r="7" className={styles.mapBasePoint} />
            <text x={basePoint.x + 12} y={basePoint.y - 10} className={styles.mapLabel}>base</text>
          </g>
        ) : null}
      </svg>
      <div className={styles.mapLegend}>
        <span>Clique no mapa para adicionar pontos em ordem.</span>
        <span>Tiles: OpenStreetMap</span>
      </div>
    </div>
  );
}

function mapCenterForZone(zone: DeliveryZone, points: PolygonDraftPoint[]) {
  if (points.length) {
    const latitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
    const longitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
    return { latitude, longitude };
  }
  if (zone.baseLatitude != null && zone.baseLongitude != null) {
    return { latitude: zone.baseLatitude, longitude: zone.baseLongitude };
  }
  return DEFAULT_MAP_CENTER;
}

function latLngToSvg(latitude: number, longitude: number, center: PolygonDraftPoint, zoom: number) {
  const world = latLngToWorld(latitude, longitude, zoom);
  const centerWorld = latLngToWorld(center.latitude, center.longitude, zoom);
  return {
    x: world.x - centerWorld.x + MAP_WIDTH / 2,
    y: world.y - centerWorld.y + MAP_HEIGHT / 2,
  };
}

function svgToLatLng(x: number, y: number, center: PolygonDraftPoint, zoom: number) {
  const centerWorld = latLngToWorld(center.latitude, center.longitude, zoom);
  return worldToLatLng(centerWorld.x + x - MAP_WIDTH / 2, centerWorld.y + y - MAP_HEIGHT / 2, zoom);
}

function latLngToWorld(latitude: number, longitude: number, zoom: number) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToLatLng(x: number, y: number, zoom: number) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}

function metersPerPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

function money(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

function labelForZoneType(value: DeliveryZoneType) {
  return zoneTypes.find((type) => type.value === value)?.label ?? value;
}

function shortDate(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dayLabel(value: number) {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][value] ?? String(value);
}
