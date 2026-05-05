'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import {
  createDeveloperCompanySubscription,
  getDeveloperCompanySubscription,
  patchDeveloperCompanySubscription,
  type CompanySubscription,
} from '@/features/modules/developer-commercial.api';
import styles from './page.module.css';

const PLAN_OPTIONS = [
  { id: 'starter', label: 'Starter' },
  { id: 'pro', label: 'Pro' },
  { id: 'enterprise', label: 'Enterprise' },
];

export default function CompanySubscriptionPage({ params }: { params: { id: string } }) {
  const companyId = params.id;
  const [current, setCurrent] = useState<CompanySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState('pro');
  const [status, setStatus] = useState<CompanySubscription['status']>('ACTIVE');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCurrent(await getDeveloperCompanySubscription(companyId));
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
    try {
      await createDeveloperCompanySubscription(companyId, {
        planId,
        status,
        startsAt: new Date().toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar assinatura.');
    }
  }

  async function setSubscriptionStatus(nextStatus: CompanySubscription['status']) {
    if (!current) return;
    try {
      await patchDeveloperCompanySubscription(companyId, current.id, {
        status: nextStatus,
        endsAt: nextStatus === 'CANCELED' ? new Date().toISOString() : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar assinatura.');
    }
  }

  return (
    <main className={styles.page}>
      <h1>Assinatura da Empresa</h1>
      {error ? <p className={styles.error}>{error}</p> : null}

      <Card className={styles.card}>
        <h2>Status atual</h2>
        {loading ? <p>Carregando...</p> : null}
        {!loading && !current ? <Badge tone="warning">SEM_ASSINATURA</Badge> : null}
        {current ? (
          <>
            <div className={styles.row}>
              <Badge>{current.status}</Badge>
              <Badge>{current.plan?.name ?? current.planId}</Badge>
            </div>
            <p>Inicio: {new Date(current.startsAt).toLocaleString()}</p>
            <div className={styles.row}>
              <Button onClick={() => void setSubscriptionStatus('ACTIVE')}>Ativar</Button>
              <Button variant="danger" onClick={() => void setSubscriptionStatus('CANCELED')}>Cancelar</Button>
            </div>
          </>
        ) : null}
      </Card>

      <Card className={styles.card}>
        <h2>Criar/Trocar assinatura</h2>
        <div className={styles.form}>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {PLAN_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
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
          <Button variant="primary" onClick={() => void createSubscription()}>Salvar assinatura</Button>
        </div>
      </Card>
    </main>
  );
}
