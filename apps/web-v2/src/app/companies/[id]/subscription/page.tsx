'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import {
  createDeveloperCompanySubscription,
  getDeveloperCompanySubscription,
  listDeveloperPlans,
  patchDeveloperCompanySubscription,
  type CompanySubscription,
  type DeveloperPlan,
} from '@/features/modules/developer-commercial.api';
import styles from './page.module.css';

function addOneMonthIso(baseDate: Date): string {
  const copy = new Date(baseDate);
  copy.setMonth(copy.getMonth() + 1);
  return copy.toISOString();
}

export default function CompanySubscriptionPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const [current, setCurrent] = useState<CompanySubscription | null>(null);
  const [plans, setPlans] = useState<DeveloperPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<CompanySubscription['status']>('ACTIVE');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [subscription, plansPayload] = await Promise.all([
        getDeveloperCompanySubscription(companyId),
        listDeveloperPlans(),
      ]);
      setCurrent(subscription);
      setPlans(plansPayload);
      if (!planId) {
        const activePlan = plansPayload.find((plan) => plan.isActive !== false) ?? plansPayload[0];
        if (activePlan) setPlanId(activePlan.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar assinatura.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [companyId]);

  async function createSubscription() {
    if (!planId) {
      setError('Selecione um plano valido para salvar a assinatura.');
      return;
    }
    setSavingCreate(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (current) {
        await patchDeveloperCompanySubscription(companyId, current.id, {
          status,
          endsAt: status === 'CANCELED' ? new Date().toISOString() : null,
        });
        setSuccessMessage(`Assinatura atualizada para ${status}.`);
        await load();
        return;
      }

      const startsAt = new Date();
      await createDeveloperCompanySubscription(companyId, {
        planId,
        status,
        startsAt: startsAt.toISOString(),
        endsAt: addOneMonthIso(startsAt),
      });
      setSuccessMessage('Assinatura salva com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar assinatura.');
    } finally {
      setSavingCreate(false);
    }
  }

  async function setSubscriptionStatus(nextStatus: CompanySubscription['status']) {
    if (!current) return;
    setSavingStatus(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchDeveloperCompanySubscription(companyId, current.id, {
        status: nextStatus,
        endsAt: nextStatus === 'CANCELED' ? new Date().toISOString() : undefined,
      });
      setSuccessMessage(`Assinatura atualizada para ${nextStatus}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar assinatura.');
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Assinatura da empresa"
        subtitle="Ative, altere ou cancele planos comerciais."
        actions={
          <Link href="/developer/companies">
            <Button>Voltar para Empresas</Button>
          </Link>
        }
      />
      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {successMessage ? <Card className={styles.card}>{successMessage}</Card> : null}

      <section className={styles.summaryGrid}>
        <PremiumSummaryCard label="Status" value={current?.status ?? 'SEM_ASSINATURA'} />
        <PremiumSummaryCard label="Periodicidade" value="Mensal" />
        <PremiumSummaryCard label="Plano atual" value={current?.plan?.name ?? current?.planId ?? 'Sem plano'} />
        <PremiumSummaryCard label="Inicio" value={current ? new Date(current.startsAt).toLocaleDateString() : '-'} />
        <PremiumSummaryCard label="Trial ate" value={current?.trialEndsAt ? new Date(current.trialEndsAt).toLocaleDateString() : '-'} />
      </section>

      <Card className={styles.card}>
        <h2>Status atual</h2>
        {loading ? <p>Carregando...</p> : null}
        {!loading && !current ? <PremiumEmptyState title="Sem assinatura" description="Selecione um plano e crie a assinatura comercial da empresa." /> : null}
        {current ? (
          <>
            <div className={styles.row}>
              <Badge>{current.status}</Badge>
              <Badge>{current.plan?.name ?? current.planId}</Badge>
            </div>
            <p>Inicio: {new Date(current.startsAt).toLocaleString()}</p>
            <div className={styles.row}>
              <Button onClick={() => void setSubscriptionStatus('ACTIVE')} disabled={savingStatus}>
                {savingStatus ? 'Salvando...' : 'Ativar'}
              </Button>
              <Button variant="danger" onClick={() => void setSubscriptionStatus('CANCELED')} disabled={savingStatus}>
                {savingStatus ? 'Salvando...' : 'Cancelar'}
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      <Card className={styles.card}>
        <h2>{current ? 'Atualizar assinatura' : 'Criar assinatura'}</h2>
        <div className={styles.form}>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.key})
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as CompanySubscription['status'])}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="TRIAL">TRIAL</option>
            <option value="PAST_DUE">PAST_DUE</option>
            <option value="CANCELED">CANCELED</option>
            <option value="EXPIRED">EXPIRED</option>
          </Select>
          <Input value={new Date().toISOString()} readOnly />
          <Button variant="primary" onClick={() => void createSubscription()} disabled={savingCreate || !planId}>
            {savingCreate ? 'Salvando...' : current ? 'Atualizar assinatura' : 'Salvar assinatura'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
