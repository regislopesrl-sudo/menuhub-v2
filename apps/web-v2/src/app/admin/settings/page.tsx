'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { useModules } from '@/features/modules/use-modules';
import {
  getBranchSettings,
  getCompanySettings,
  getOperationSettings,
  getPaymentSettings,
  lookupBranchAddressByCep,
  patchBranchSettings,
  patchCompanySettings,
  patchOperationSettings,
  patchPaymentSettings,
  type BranchCepLookupResponse,
  type BranchSettingsResponse,
  type CompanySettingsResponse,
  type OperationSettingsResponse,
  type PaymentSettingsResponse,
} from '@/features/settings/settings.api';

type SettingsTab =
  | 'company'
  | 'branch'
  | 'hours'
  | 'channels'
  | 'delivery'
  | 'payments'
  | 'fiscal'
  | 'users'
  | 'devices'
  | 'appearance';

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'company', label: 'Empresa' },
  { key: 'branch', label: 'Loja / Filial' },
  { key: 'hours', label: 'Horarios' },
  { key: 'channels', label: 'Canais' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'payments', label: 'Pagamentos' },
  { key: 'fiscal', label: 'Fiscal / Taxas' },
  { key: 'users', label: 'Usuarios' },
  { key: 'devices', label: 'Dispositivos' },
  { key: 'appearance', label: 'Aparencia' },
];

const CHANNEL_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  pdv: 'PDV',
  kiosk: 'Totem',
  waiter_app: 'App Garcom',
  kds: 'KDS',
  whatsapp: 'WhatsApp',
};

const LOCAL_UPLOAD_LIMIT_MB = 4;

export default function AdminSettingsPage() {
  const moduleHeaders = useMemo(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin' as const,
    }),
    [],
  );
  const modules = useModules(moduleHeaders);
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [company, setCompany] = useState<CompanySettingsResponse | null>(null);
  const [branch, setBranch] = useState<BranchSettingsResponse | null>(null);
  const [operation, setOperation] = useState<OperationSettingsResponse | null>(null);
  const [payments, setPayments] = useState<PaymentSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTab, setSavingTab] = useState<SettingsTab | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cepLookupStatus, setCepLookupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cepLookupMessage, setCepLookupMessage] = useState<string | null>(null);
  const [lastCepLookup, setLastCepLookup] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [companyData, branchData, operationData, paymentData] = await Promise.all([
          getCompanySettings(),
          getBranchSettings(),
          getOperationSettings(),
          getPaymentSettings(),
        ]);
        if (!active) return;
        setCompany(companyData);
        setBranch(branchData);
        setOperation(operationData);
        setPayments(paymentData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'branch' || !branch) return;
    const digits = digitsOnly(branch.zipCode, 8);
    const hasMissingAddress = !branch.street || !branch.district || !branch.city || !branch.state;
    if (digits.length === 8 && hasMissingAddress && digits !== lastCepLookup && cepLookupStatus !== 'loading') {
      void lookupBranchCep(digits);
    }
  }, [activeTab, branch?.zipCode]);

  const kpis = useMemo(() => {
    const openDays = operation?.schedules.filter((item) => item.isOpen).length ?? 0;
    const activeChannels = Object.values(operation?.channels ?? {}).filter(Boolean).length;
    const deliveryAreas = operation?.delivery.areas.length ?? 0;
    const activePayments = [
      payments?.debitActive,
      payments?.creditActive,
      payments?.pixActive,
      payments?.pixOnlineActive,
      payments?.creditOnlineActive,
      payments?.foodVoucherActive,
      payments?.mealVoucherActive,
    ].filter(Boolean).length;
    return { openDays, activeChannels, deliveryAreas, activePayments };
  }, [operation, payments]);

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando configuracoes da operacao..." />
      </main>
    );
  }

  if (error || !company || !branch || !operation || !payments) {
    return (
      <main className={styles.page}>
        <EmptyState title="Configuracoes indisponiveis" description={error ?? 'Tente novamente em instantes.'} />
      </main>
    );
  }

  async function saveCompanySection(mode: 'company' | 'appearance') {
    const currentCompany = company;
    if (!currentCompany) return;

    if (currentCompany.email && !isValidEmail(currentCompany.email)) {
      setError('Email da empresa invalido.');
      return;
    }
    setSavingTab(mode);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload =
        mode === 'company'
          ? {
              tradeName: currentCompany.tradeName,
              legalName: currentCompany.legalName,
              cnpj: currentCompany.cnpj,
              phone: currentCompany.phone,
              whatsapp: currentCompany.whatsapp,
              email: currentCompany.email,
              logoUrl: currentCompany.logoUrl,
              brandColor: currentCompany.brandColor,
              timezone: currentCompany.timezone,
              currency: currentCompany.currency,
              status: currentCompany.status,
            }
          : {
              brandColor: currentCompany.brandColor,
              logoUrl: currentCompany.logoUrl,
              publicTitle: currentCompany.publicTitle,
              publicDescription: currentCompany.publicDescription,
              bannerUrl: currentCompany.bannerUrl,
              closedMessage: currentCompany.closedMessage,
            };
      const response = await patchCompanySettings(undefined, payload);
      setCompany(response);
      setSuccessMessage(mode === 'company' ? 'Empresa atualizada.' : 'Aparencia publica atualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar empresa.');
    } finally {
      setSavingTab(null);
    }
  }

  async function saveBranchSection() {
    const currentBranch = branch;
    if (!currentBranch) return;

    if (currentBranch.email && !isValidEmail(currentBranch.email)) {
      setError('Email da loja/filial invalido.');
      return;
    }
    setSavingTab('branch');
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await patchBranchSettings(undefined, currentBranch);
      setBranch(response);
      setSuccessMessage('Loja / filial atualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar filial.');
    } finally {
      setSavingTab(null);
    }
  }

  function handleBranchCepChange(value: string) {
    if (!branch) return;
    const nextZipCode = maskCep(value);
    const digits = digitsOnly(nextZipCode, 8);
    setBranch({ ...branch, zipCode: nextZipCode });
    setCepLookupMessage(null);

    if (digits.length < 8) {
      setCepLookupStatus('idle');
      setLastCepLookup('');
      return;
    }

    if (digits !== lastCepLookup) {
      void lookupBranchCep(digits);
    }
  }

  async function lookupBranchCep(zipCode?: string) {
    const digits = digitsOnly(zipCode ?? branch?.zipCode ?? '', 8);
    if (digits.length !== 8) {
      setCepLookupStatus('error');
      setCepLookupMessage('Informe um CEP com 8 digitos.');
      return;
    }

    setCepLookupStatus('loading');
    setCepLookupMessage('Buscando CEP...');
    setError(null);
    try {
      const address = await lookupBranchAddressByCep(undefined, digits);
      setBranch((current) => (current ? applyCepAddress(current, address) : current));
      setLastCepLookup(digits);
      setCepLookupStatus('success');
      setCepLookupMessage(
        address.latitude !== null && address.longitude !== null
          ? 'Endereco e localizacao preenchidos pelo CEP.'
          : 'Endereco preenchido pelo CEP. Latitude/longitude nao encontrados automaticamente.',
      );
    } catch (err) {
      setCepLookupStatus('error');
      setCepLookupMessage(err instanceof Error ? err.message : 'Nao foi possivel consultar o CEP.');
    }
  }

  async function saveOperationSection(mode: 'hours' | 'channels' | 'delivery' | 'fiscal') {
    const currentOperation = operation;
    if (!currentOperation) return;
    if (mode === 'hours') {
      const invalid = currentOperation.schedules.find((entry) => !isScheduleValid(entry));
      if (invalid) {
        setError(`Horario invalido em ${invalid.label}.`);
        return;
      }
    }
    if (mode === 'delivery') {
      const values = [
        currentOperation.delivery.minimumOrder,
        currentOperation.delivery.averagePrepMinutes,
        currentOperation.delivery.averageDeliveryMinutes,
        currentOperation.delivery.serviceFee,
      ];
      if (values.some((value) => Number(value) < 0)) {
        setError('Campos monetarios e tempos do delivery devem ser maiores ou iguais a zero.');
        return;
      }
    }
    if (mode === 'fiscal' && Number(currentOperation.fiscal.serviceTax) < 0) {
      setError('Taxa de servico/fiscal deve ser maior ou igual a zero.');
      return;
    }

    setSavingTab(mode);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload =
        mode === 'hours'
          ? { schedules: currentOperation.schedules }
          : mode === 'channels'
            ? { channels: currentOperation.channels }
            : mode === 'delivery'
              ? { delivery: currentOperation.delivery }
              : { fiscal: currentOperation.fiscal };
      const response = await patchOperationSettings(undefined, payload);
      setOperation(response);
      setSuccessMessage('Operacao atualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar operacao.');
    } finally {
      setSavingTab(null);
    }
  }

  async function saveDeliverySection() {
    const currentOperation = operation;
    const currentCompany = company;
    if (!currentOperation || !currentCompany) return;

    const values = [
      currentOperation.delivery.minimumOrder,
      currentOperation.delivery.averagePrepMinutes,
      currentOperation.delivery.averageDeliveryMinutes,
      currentOperation.delivery.serviceFee,
    ];
    if (values.some((value) => Number(value) < 0)) {
      setError('Campos monetarios e tempos do delivery devem ser maiores ou iguais a zero.');
      return;
    }

    setSavingTab('delivery');
    setError(null);
    setSuccessMessage(null);
    try {
      const [operationResponse, companyResponse] = await Promise.all([
        patchOperationSettings(undefined, { delivery: currentOperation.delivery }),
        patchCompanySettings(undefined, {
          logoUrl: currentCompany.logoUrl,
          publicTitle: currentCompany.publicTitle,
          publicDescription: currentCompany.publicDescription,
          bannerUrl: currentCompany.bannerUrl,
          brandColor: currentCompany.brandColor,
        }),
      ]);
      setOperation(operationResponse);
      setCompany(companyResponse);
      setSuccessMessage('Delivery e vitrine do cardapio online atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar delivery.');
    } finally {
      setSavingTab(null);
    }
  }

  async function handleLogoUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file || !company) return;
    try {
      setError(null);
      const dataUrl = await fileToDataUrl(file, ['image/']);
      setCompany({ ...company, logoUrl: dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar logo.');
    }
  }

  async function handleDeliveryMediaUpload(files: FileList | null) {
    if (!files?.length || !company) return;
    try {
      setError(null);
      const dataUrls = await Promise.all(Array.from(files).map((file) => fileToDataUrl(file, ['image/', 'video/'])));
      const current = splitMediaList(company.bannerUrl);
      setCompany({ ...company, bannerUrl: [...current, ...dataUrls].join('\n') });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar midia do cardapio.');
    }
  }

  async function savePaymentsSection() {
    const currentPayments = payments;
    if (!currentPayments) return;

    setSavingTab('payments');
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await patchPaymentSettings(undefined, {
        pixActive: currentPayments.pixActive,
        debitActive: currentPayments.debitActive,
        creditActive: currentPayments.creditActive,
        pixOnlineActive: currentPayments.pixOnlineActive,
        creditOnlineActive: currentPayments.creditOnlineActive,
        foodVoucherActive: currentPayments.foodVoucherActive,
        mealVoucherActive: currentPayments.mealVoucherActive,
        onlineCardActive: currentPayments.creditOnlineActive,
        presentCardActive: currentPayments.debitActive || currentPayments.creditActive,
        mercadoPagoMode: currentPayments.mercadoPagoMode,
      });
      setPayments(response);
      setSuccessMessage('Pagamentos atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar pagamentos.');
    } finally {
      setSavingTab(null);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Configuracoes da Empresa / Loja"
        subtitle="Operacao, canais, delivery, pagamentos e aparencia da plataforma"
        right={
          <div className={styles.headerBadges}>
            <Badge tone={company.status === 'ACTIVE' ? 'success' : 'danger'}>
              Empresa {company.status === 'ACTIVE' ? 'ativa' : 'inativa'}
            </Badge>
            <Badge tone={branch.isOpen ? 'success' : 'warning'}>
              Loja {branch.isOpen ? 'aberta' : 'fechada'}
            </Badge>
            <Badge tone={payments.providerStatus === 'configured' ? 'success' : payments.providerStatus === 'mock' ? 'warning' : 'danger'}>
              Provider {payments.providerStatus}
            </Badge>
          </div>
        }
      />

      <section className={styles.kpis}>
        <Card className={styles.kpiCard}>
          <span>Dias abertos</span>
          <strong>{kpis.openDays}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Canais ativos</span>
          <strong>{kpis.activeChannels}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Areas de entrega</span>
          <strong>{kpis.deliveryAreas}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Pagamentos ativos</span>
          <strong>{kpis.activePayments}</strong>
        </Card>
      </section>

      <Card className={styles.noticeCard}>
        <div>
          <strong>Base atual do schema</strong>
          <p>
            Empresa e filial agora usam persistencia dedicada. Operacao, canais, pagamentos e preferencias de filial
            continuam separados para manter a configuracao operacional organizada por loja.
          </p>
        </div>
      </Card>

      {successMessage ? <div className={styles.success}>{successMessage}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <SectionTabs
        tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'company' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Empresa</h2>
              <p>Dados institucionais e identidade principal da operacao.</p>
            </div>
            <Button variant="primary" onClick={() => void saveCompanySection('company')} disabled={savingTab === 'company'}>
              {savingTab === 'company' ? 'Salvando...' : 'Salvar Empresa'}
            </Button>
          </div>
          <div className={styles.formGrid}>
            <Field label="Nome fantasia">
              <Input value={company.tradeName} onChange={(e) => setCompany({ ...company, tradeName: e.target.value })} />
            </Field>
            <Field label="Razao social">
              <Input value={company.legalName} onChange={(e) => setCompany({ ...company, legalName: e.target.value })} />
            </Field>
            <Field label="CNPJ">
              <Input value={company.cnpj} onChange={(e) => setCompany({ ...company, cnpj: digitsOnly(e.target.value, 14) })} />
            </Field>
            <Field label="Telefone">
              <Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
            </Field>
            <Field label="WhatsApp">
              <Input value={company.whatsapp} onChange={(e) => setCompany({ ...company, whatsapp: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
            </Field>
            <Field label="Logo URL">
              <Input value={company.logoUrl} onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })} />
            </Field>
            <Field label="Cor principal">
              <Input value={company.brandColor} onChange={(e) => setCompany({ ...company, brandColor: e.target.value })} />
            </Field>
            <Field label="Timezone">
              <Input value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} />
            </Field>
            <Field label="Moeda">
              <Select value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value as 'BRL' })}>
                <option value="BRL">BRL</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={company.status} onChange={(e) => setCompany({ ...company, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </Select>
            </Field>
          </div>
        </Card>
      ) : null}

      {activeTab === 'branch' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Loja / Filial</h2>
              <p>Endereco, contato, geolocalizacao e status operacional da unidade.</p>
            </div>
            <Button variant="primary" onClick={() => void saveBranchSection()} disabled={savingTab === 'branch'}>
              {savingTab === 'branch' ? 'Salvando...' : 'Salvar Filial'}
            </Button>
          </div>
          <div className={styles.formGrid}>
            <Field label="Nome da loja">
              <Input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
            </Field>
            <Field label="Codigo">
              <Input value={branch.code} onChange={(e) => setBranch({ ...branch, code: e.target.value })} />
            </Field>
            <Field label="Responsavel">
              <Input value={branch.responsible} onChange={(e) => setBranch({ ...branch, responsible: e.target.value })} />
            </Field>
            <Field label="Telefone da loja">
              <Input value={branch.phone} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} />
            </Field>
            <Field label="Email da loja">
              <Input value={branch.email} onChange={(e) => setBranch({ ...branch, email: e.target.value })} />
            </Field>
            <div className={styles.field}>
              <span>CEP</span>
              <div className={styles.cepLookupRow}>
                <Input
                  value={branch.zipCode}
                  onBlur={() => {
                    const digits = digitsOnly(branch.zipCode, 8);
                    if (digits.length === 8) void lookupBranchCep(digits);
                  }}
                  onChange={(e) => handleBranchCepChange(e.target.value)}
                />
                <Button
                  type="button"
                  className={styles.cepLookupButton}
                  onClick={() => void lookupBranchCep()}
                  disabled={cepLookupStatus === 'loading'}
                >
                  {cepLookupStatus === 'loading' ? 'Buscando...' : 'Buscar CEP'}
                </Button>
              </div>
              {cepLookupMessage ? (
                <small
                  className={`${styles.cepLookupFeedback} ${
                    cepLookupStatus === 'error' ? styles.cepLookupFeedbackError : ''
                  }`.trim()}
                >
                  {cepLookupMessage}
                </small>
              ) : null}
            </div>
            <Field label="Rua">
              <Input value={branch.street} onChange={(e) => setBranch({ ...branch, street: e.target.value })} />
            </Field>
            <Field label="Numero">
              <Input value={branch.number} onChange={(e) => setBranch({ ...branch, number: e.target.value })} />
            </Field>
            <Field label="Complemento">
              <Input value={branch.complement} onChange={(e) => setBranch({ ...branch, complement: e.target.value })} />
            </Field>
            <Field label="Bairro">
              <Input value={branch.district} onChange={(e) => setBranch({ ...branch, district: e.target.value })} />
            </Field>
            <Field label="Cidade">
              <Input value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} />
            </Field>
            <Field label="Estado">
              <Input value={branch.state} onChange={(e) => setBranch({ ...branch, state: e.target.value.toUpperCase().slice(0, 2) })} />
            </Field>
            <Field label="Latitude">
              <Input value={branch.latitude ?? ''} onChange={(e) => setBranch({ ...branch, latitude: parseOptionalNumber(e.target.value) })} />
            </Field>
            <Field label="Longitude">
              <Input value={branch.longitude ?? ''} onChange={(e) => setBranch({ ...branch, longitude: parseOptionalNumber(e.target.value) })} />
            </Field>
          </div>
          <div className={styles.switchRow}>
            <Toggle checked={branch.isOpen} label="Loja aberta" onChange={(checked) => setBranch({ ...branch, isOpen: checked })} />
            <Toggle checked={branch.isActive} label="Filial ativa" onChange={(checked) => setBranch({ ...branch, isActive: checked })} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'hours' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Horarios de funcionamento</h2>
              <p>Grade semanal com horarios principais e variacoes por canal.</p>
            </div>
            <Button variant="primary" onClick={() => void saveOperationSection('hours')} disabled={savingTab === 'hours'}>
              {savingTab === 'hours' ? 'Salvando...' : 'Salvar Horarios'}
            </Button>
          </div>
          <div className={styles.scheduleGrid}>
            {operation.schedules.map((entry) => (
              <article key={entry.dayKey} className={styles.scheduleCard}>
                <div className={styles.scheduleTop}>
                  <strong>{entry.label}</strong>
                  <Toggle checked={entry.isOpen} label={entry.isOpen ? 'Aberto' : 'Fechado'} onChange={(checked) => updateSchedule(operation, setOperation, entry.dayKey, { isOpen: checked })} />
                </div>
                <div className={styles.timeRow}>
                  <Input type="time" value={entry.openAt ?? ''} onChange={(e) => updateSchedule(operation, setOperation, entry.dayKey, { openAt: e.target.value })} disabled={!entry.isOpen} />
                  <Input type="time" value={entry.closeAt ?? ''} onChange={(e) => updateSchedule(operation, setOperation, entry.dayKey, { closeAt: e.target.value })} disabled={!entry.isOpen} />
                </div>
                <div className={styles.timeRow}>
                  <Input type="time" value={entry.breakStart ?? ''} onChange={(e) => updateSchedule(operation, setOperation, entry.dayKey, { breakStart: e.target.value || null })} disabled={!entry.isOpen} />
                  <Input type="time" value={entry.breakEnd ?? ''} onChange={(e) => updateSchedule(operation, setOperation, entry.dayKey, { breakEnd: e.target.value || null })} disabled={!entry.isOpen} />
                </div>
                <div className={styles.channelTimes}>
                  {Object.entries(entry.channels).map(([channelKey, channel]) => (
                    <div key={channelKey} className={styles.channelTimeRow}>
                      <span>{CHANNEL_LABELS[channelKey] ?? channelKey}</span>
                      <label className={styles.inlineToggle}>
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={(e) =>
                            updateScheduleChannel(operation, setOperation, entry.dayKey, channelKey, {
                              enabled: e.target.checked,
                            })
                          }
                        />
                        <small>{channel.enabled ? 'On' : 'Off'}</small>
                      </label>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Card>
      ) : null}

      {activeTab === 'channels' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Canais de atendimento</h2>
              <p>Controle operacional por canal, em paralelo aos modulos tecnicos de /admin/modules.</p>
            </div>
            <Button variant="primary" onClick={() => void saveOperationSection('channels')} disabled={savingTab === 'channels'}>
              {savingTab === 'channels' ? 'Salvando...' : 'Salvar Canais'}
            </Button>
          </div>
          <div className={styles.channelGrid}>
            {Object.entries(operation.channels).map(([channelKey, enabled]) => {
              const moduleEnabled = modules.isEnabled(channelKey);
              return (
                <Card key={channelKey} className={styles.channelCard}>
                  <div className={styles.channelHeader}>
                    <strong>{CHANNEL_LABELS[channelKey] ?? channelKey}</strong>
                    <Badge tone={moduleEnabled ? 'success' : 'warning'}>
                      Modulo {moduleEnabled ? 'ativo' : 'desligado'}
                    </Badge>
                  </div>
                  <Toggle
                    checked={enabled}
                    label={enabled ? 'Canal operacional ativo' : 'Canal operacional inativo'}
                    onChange={(checked) =>
                      setOperation({
                        ...operation,
                        channels: { ...operation.channels, [channelKey]: checked },
                      })
                    }
                  />
                </Card>
              );
            })}
          </div>
        </Card>
      ) : null}

      {activeTab === 'delivery' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Delivery</h2>
              <p>Politicas do canal e vitrine publica exibida no cardapio online.</p>
            </div>
            <Button variant="primary" onClick={() => void saveDeliverySection()} disabled={savingTab === 'delivery'}>
              {savingTab === 'delivery' ? 'Salvando...' : 'Salvar Delivery'}
            </Button>
          </div>
          <div className={styles.deliveryShowcase}>
            <div className={styles.deliveryPreviewCard}>
              <div className={styles.deliveryPreviewMedia}>
                {splitMediaList(company.bannerUrl)[0]?.startsWith('data:video') || /\.(mp4|webm|ogg)(\?|#|$)/i.test(splitMediaList(company.bannerUrl)[0] ?? '') ? (
                  <video src={splitMediaList(company.bannerUrl)[0]} muted loop playsInline controls />
                ) : splitMediaList(company.bannerUrl)[0] ? (
                  <img src={splitMediaList(company.bannerUrl)[0]} alt="Midia principal do cardapio online" />
                ) : (
                  <span>Midia do cardapio online</span>
                )}
              </div>
              <div className={styles.deliveryPreviewIdentity}>
                <div className={styles.deliveryPreviewLogo}>
                  {company.logoUrl ? <img src={company.logoUrl} alt="Logo da empresa" /> : <span>{company.publicTitle.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div>
                  <small>Cardapio online</small>
                  <strong>{company.publicTitle || company.tradeName}</strong>
                </div>
              </div>
            </div>
            <div className={styles.deliveryMediaConfig}>
              <Field label="Nome exibido no cardapio online">
                <Input value={company.publicTitle} onChange={(e) => setCompany({ ...company, publicTitle: e.target.value })} />
              </Field>
              <Field label="Texto de apoio">
                <Input value={company.publicDescription} onChange={(e) => setCompany({ ...company, publicDescription: e.target.value })} />
              </Field>
              <Field label="Upload do logo">
                <input className={styles.fileInput} type="file" accept="image/*" onChange={(event) => void handleLogoUpload(event.target.files)} />
              </Field>
              <Field label="Upload de fotos ou video do card principal">
                <input className={styles.fileInput} type="file" accept="image/*,video/*" multiple onChange={(event) => void handleDeliveryMediaUpload(event.target.files)} />
              </Field>
              <Field label="Midias do card principal">
                <textarea
                  className={styles.textArea}
                  value={company.bannerUrl}
                  onChange={(e) => setCompany({ ...company, bannerUrl: e.target.value })}
                  placeholder="Uma URL por linha. Aceita imagem, video ou arquivo enviado."
                  rows={5}
                />
              </Field>
              <p className={styles.helperText}>
                As midias sao exibidas como slides no topo do cardapio online. Para producao com arquivos grandes, a proxima etapa ideal e trocar este upload local por storage/CDN.
              </p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <Field label="Pedido minimo">
              <Input type="number" min="0" value={operation.delivery.minimumOrder} onChange={(e) => setOperation({ ...operation, delivery: { ...operation.delivery, minimumOrder: Number(e.target.value || 0) } })} />
            </Field>
            <Field label="Tempo medio preparo (min)">
              <Input type="number" min="0" value={operation.delivery.averagePrepMinutes} onChange={(e) => setOperation({ ...operation, delivery: { ...operation.delivery, averagePrepMinutes: Number(e.target.value || 0) } })} />
            </Field>
            <Field label="Tempo medio entrega (min)">
              <Input type="number" min="0" value={operation.delivery.averageDeliveryMinutes} onChange={(e) => setOperation({ ...operation, delivery: { ...operation.delivery, averageDeliveryMinutes: Number(e.target.value || 0) } })} />
            </Field>
            <Field label="Taxa de servico">
              <Input type="number" min="0" step="0.01" value={operation.delivery.serviceFee} onChange={(e) => setOperation({ ...operation, delivery: { ...operation.delivery, serviceFee: Number(e.target.value || 0) } })} />
            </Field>
            <Field label="Calculo">
              <Select value={operation.delivery.pricingMode} onChange={(e) => setOperation({ ...operation, delivery: { ...operation.delivery, pricingMode: e.target.value as 'area' | 'km' } })}>
                <option value="area">Por area</option>
                <option value="km">Por km</option>
              </Select>
            </Field>
          </div>
          <div className={styles.switchRow}>
            <Toggle checked={operation.delivery.allowPickup} label="Aceitar retirada" onChange={(checked) => setOperation({ ...operation, delivery: { ...operation.delivery, allowPickup: checked } })} />
            <Toggle checked={operation.delivery.allowDelivery} label="Aceitar entrega" onChange={(checked) => setOperation({ ...operation, delivery: { ...operation.delivery, allowDelivery: checked } })} />
            <Toggle checked={operation.delivery.blockOutsideArea} label="Bloquear fora da area" onChange={(checked) => setOperation({ ...operation, delivery: { ...operation.delivery, blockOutsideArea: checked } })} />
            <Toggle checked={operation.delivery.allowCashOnDelivery} label="Permitir dinheiro na entrega" onChange={(checked) => setOperation({ ...operation, delivery: { ...operation.delivery, allowCashOnDelivery: checked } })} />
          </div>
          <div className={styles.areaList}>
            {operation.delivery.areas.length === 0 ? (
              <EmptyState title="Sem areas de entrega" description="O backend ainda nao retornou areas cadastradas para esta filial." />
            ) : (
              operation.delivery.areas.map((area) => (
                <div key={area.id} className={styles.areaRow}>
                  <div>
                    <strong>{area.name}</strong>
                    <small>
                      {area.pricingMode === 'km' ? `Base ${money(area.baseFee)} + ${money(area.pricePerKm)}/km` : `Taxa ${money(area.deliveryFee)}`} | ETA {area.estimatedMinutes} min
                    </small>
                  </div>
                  <Badge tone={area.active ? 'success' : 'warning'}>{area.active ? 'Ativa' : 'Inativa'}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}

      {activeTab === 'payments' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Pagamentos</h2>
              <p>Ativacao operacional e status sanitizado do provider. Segredos nao sao exibidos.</p>
            </div>
            <Button variant="primary" onClick={() => void savePaymentsSection()} disabled={savingTab === 'payments'}>
              {savingTab === 'payments' ? 'Salvando...' : 'Salvar Pagamentos'}
            </Button>
          </div>
          <div className={styles.switchRow}>
            <Toggle checked={payments.debitActive} label="Débito" onChange={(checked) => setPayments({ ...payments, debitActive: checked })} />
            <Toggle checked={payments.creditActive} label="Crédito" onChange={(checked) => setPayments({ ...payments, creditActive: checked })} />
            <Toggle checked={payments.pixActive} label="Pix" onChange={(checked) => setPayments({ ...payments, pixActive: checked })} />
            <Toggle checked={payments.pixOnlineActive} label="Pix Online" onChange={(checked) => setPayments({ ...payments, pixOnlineActive: checked })} />
            <Toggle checked={payments.creditOnlineActive} label="Crédito Online" onChange={(checked) => setPayments({ ...payments, creditOnlineActive: checked })} />
            <Toggle checked={payments.foodVoucherActive} label="Vale Alimentação" onChange={(checked) => setPayments({ ...payments, foodVoucherActive: checked })} />
            <Toggle checked={payments.mealVoucherActive} label="Vale Refeição" onChange={(checked) => setPayments({ ...payments, mealVoucherActive: checked })} />
          </div>
          <div className={styles.formGrid}>
            <Field label="Modo Mercado Pago">
              <Select value={payments.mercadoPagoMode} onChange={(e) => setPayments({ ...payments, mercadoPagoMode: e.target.value as 'sandbox' | 'production' })}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Producao</option>
              </Select>
            </Field>
            <Field label="Webhook URL">
              <Input value={payments.webhookUrl} disabled />
            </Field>
            <Field label="Provider">
              <Input value={payments.providerName} disabled />
            </Field>
            <Field label="Status provider">
              <Input value={payments.providerStatus} disabled />
            </Field>
            <Field label="Modo cartao online">
              <Input value={payments.cardMode} disabled />
            </Field>
            <Field label="Segredo">
              <Input value={payments.secretStatus} disabled />
            </Field>
          </div>
        </Card>
      ) : null}

      {activeTab === 'fiscal' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Fiscal / Taxas</h2>
              <p>Configuracao inicial sem emissao fiscal real nesta fase.</p>
            </div>
            <Button variant="primary" onClick={() => void saveOperationSection('fiscal')} disabled={savingTab === 'fiscal'}>
              {savingTab === 'fiscal' ? 'Salvando...' : 'Salvar Fiscal'}
            </Button>
          </div>
          <div className={styles.formGrid}>
            <Field label="Taxa de servico">
              <Input type="number" min="0" step="0.01" value={operation.fiscal.serviceTax} onChange={(e) => setOperation({ ...operation, fiscal: { ...operation.fiscal, serviceTax: Number(e.target.value || 0) } })} />
            </Field>
            <Field label="Observacao fiscal">
              <Input value={operation.fiscal.fiscalObservation} onChange={(e) => setOperation({ ...operation, fiscal: { ...operation.fiscal, fiscalObservation: e.target.value } })} />
            </Field>
            <Field label="Ambiente atual">
              <Input value={operation.fiscal.fiscalEnvironment} disabled />
            </Field>
            <Field label="Configuracao fiscal">
              <Input value={operation.fiscal.fiscalConfigured ? 'Configurado' : 'Nao configurado'} disabled />
            </Field>
          </div>
          <div className={styles.switchRow}>
            <Toggle checked={operation.fiscal.futureFiscalEnabled} label="Emissao fiscal futura preparada" onChange={(checked) => setOperation({ ...operation, fiscal: { ...operation.fiscal, futureFiscalEnabled: checked } })} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'users' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Usuarios e permissoes</h2>
              <p>Gestao real de acessos, roles e filiais operacionais.</p>
            </div>
            <Link href="/admin/users">
              <Button variant="primary">Abrir gestao de usuarios</Button>
            </Link>
          </div>
          <div className={styles.placeholderGrid}>
            <RoleCard title="Operador" description="Atendimento, abertura de pedido e consulta basica." />
            <RoleCard title="Caixa" description="Sessao PDV, pagamento presencial e fechamento de caixa." />
            <RoleCard title="Cozinha" description="KDS, preparo e finalizacao operacional." />
            <RoleCard title="Gerente" description="Configuracoes, relatorios e supervisao geral." />
            <RoleCard title="Master" description="Administracao total da empresa e filiais." />
          </div>
          <p className={styles.placeholderText}>{operation.users.message}</p>
        </Card>
      ) : null}

      {activeTab === 'devices' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Impressao e dispositivos</h2>
              <p>Painel preparado para futuras integracoes com hardware operacional.</p>
            </div>
            <Badge tone="warning">Futuro</Badge>
          </div>
          <div className={styles.placeholderGrid}>
            <RoleCard title="Impressora cozinha" description="Fila de producao e tickets KDS." />
            <RoleCard title="Impressora caixa" description="Comprovantes e fechamento de sessao." />
            <RoleCard title="Terminal PDV" description="Identificacao e status da estacao de venda." />
            <RoleCard title="Tela KDS" description="Monitoramento da cozinha e expedição." />
          </div>
          <p className={styles.placeholderText}>{operation.devices.message}</p>
        </Card>
      ) : null}

      {activeTab === 'appearance' ? (
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Aparencia do cardapio online</h2>
              <p>Titulo publico, banner, identidade visual e mensagem de loja fechada.</p>
            </div>
            <Button variant="primary" onClick={() => void saveCompanySection('appearance')} disabled={savingTab === 'appearance'}>
              {savingTab === 'appearance' ? 'Salvando...' : 'Salvar Aparencia'}
            </Button>
          </div>
          <div className={styles.formGrid}>
            <Field label="Titulo publico">
              <Input value={company.publicTitle} onChange={(e) => setCompany({ ...company, publicTitle: e.target.value })} />
            </Field>
            <Field label="Descricao">
              <Input value={company.publicDescription} onChange={(e) => setCompany({ ...company, publicDescription: e.target.value })} />
            </Field>
            <Field label="Banner URL">
              <Input value={company.bannerUrl} onChange={(e) => setCompany({ ...company, bannerUrl: e.target.value })} />
            </Field>
            <Field label="Logo URL">
              <Input value={company.logoUrl} onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })} />
            </Field>
            <Field label="Cor principal">
              <Input value={company.brandColor} onChange={(e) => setCompany({ ...company, brandColor: e.target.value })} />
            </Field>
            <Field label="Mensagem loja fechada">
              <Input value={company.closedMessage} onChange={(e) => setCompany({ ...company, closedMessage: e.target.value })} />
            </Field>
          </div>
          <div className={styles.themeNotice}>
            <Badge tone="default">Tema</Badge>
            <span>Claro padrao agora. Modo escuro futuro preparado via configuracao.</span>
          </div>
        </Card>
      ) : null}
    </main>
  );
}

function splitMediaList(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fileToDataUrl(file: File, allowedPrefixes: string[]) {
  if (!allowedPrefixes.some((prefix) => file.type.startsWith(prefix))) {
    throw new Error('Tipo de arquivo nao suportado para esta area.');
  }
  if (file.size > LOCAL_UPLOAD_LIMIT_MB * 1024 * 1024) {
    throw new Error(`Arquivo muito grande. Limite local: ${LOCAL_UPLOAD_LIMIT_MB} MB.`);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function applyCepAddress(branch: BranchSettingsResponse, address: BranchCepLookupResponse): BranchSettingsResponse {
  return {
    ...branch,
    zipCode: maskCep(address.cep),
    street: address.street || branch.street,
    complement: branch.complement || address.complement,
    district: address.district || branch.district,
    city: address.city || branch.city,
    state: address.state || branch.state,
    latitude: address.latitude ?? branch.latitude,
    longitude: address.longitude ?? branch.longitude,
  };
}

function updateSchedule(
  operation: OperationSettingsResponse,
  setOperation: (value: OperationSettingsResponse) => void,
  dayKey: string,
  patch: Partial<OperationSettingsResponse['schedules'][number]>,
) {
  setOperation({
    ...operation,
    schedules: operation.schedules.map((entry) => (entry.dayKey === dayKey ? { ...entry, ...patch } : entry)),
  });
}

function updateScheduleChannel(
  operation: OperationSettingsResponse,
  setOperation: (value: OperationSettingsResponse) => void,
  dayKey: string,
  channelKey: string,
  patch: Partial<{ enabled: boolean; openAt: string | null; closeAt: string | null }>,
) {
  setOperation({
    ...operation,
    schedules: operation.schedules.map((entry) =>
      entry.dayKey === dayKey
        ? {
            ...entry,
            channels: {
              ...entry.channels,
              [channelKey]: {
                ...entry.channels[channelKey],
                ...patch,
              },
            },
          }
        : entry,
    ),
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function RoleCard({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.roleCard}>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function digitsOnly(value: string, max: number) {
  return value.replace(/\D/g, '').slice(0, max);
}

function maskCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTime(value: string | null) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isScheduleValid(entry: OperationSettingsResponse['schedules'][number]) {
  if (!entry.isOpen) return true;
  if (!isValidTime(entry.openAt) || !isValidTime(entry.closeAt)) return false;
  return timeToMinutes(entry.closeAt as string) > timeToMinutes(entry.openAt as string);
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function money(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
