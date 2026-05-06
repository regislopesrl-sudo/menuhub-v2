'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import { getCurrentBilling, type BillingCurrentResponse } from '@/features/billing/billing.api';
import styles from './page.module.css';

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function statusTone(status: BillingCurrentResponse['billing']['status']): 'success' | 'warning' | 'danger' {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due') return 'warning';
  return 'danger';
}

function statusLabel(status: BillingCurrentResponse['billing']['status']) {
  const map: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    expired: 'expired',
    missing_subscription: 'missing_subscription',
  };
  return map[status] ?? status;
}

export default function AdminBillingPage() {
  const [data, setData] = useState<BillingCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getCurrentBilling();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar billing.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const trialDaysLeft = useMemo(() => {
    const trialEndsAt = data?.subscription?.trialEndsAt;
    if (!trialEndsAt) return null;
    const diff = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  }, [data?.subscription?.trialEndsAt]);

  if (loading) {
    return (
      <main className={styles.page}>
        <Card className={styles.stateCard}>Carregando assinatura e cobranca...</Card>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className={styles.page}>
        <PremiumErrorState message={error ?? 'Sem dados de billing.'} onRetry={() => void load()} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Assinatura e cobranca"
        subtitle="Acompanhe plano, modulos, limites e situacao da assinatura"
        actions={<Badge tone={statusTone(data.billing.status)}>{statusLabel(data.billing.status)}</Badge>}
      />

      <section className={styles.summary}>
        <PremiumSummaryCard label="Plano atual" value={data.plan?.name ?? 'Sem assinatura'} />
        <PremiumSummaryCard label="Status" value={statusLabel(data.billing.status)} />
        <PremiumSummaryCard
          label="Proxima cobranca"
          value={formatDate(data.billing.nextBillingAt)}
        />
        <PremiumSummaryCard label="Ultimo pagamento" value={formatDate(data.billing.lastPaymentAt)} />
      </section>

      <section className={styles.grid}>
        <Card className={styles.section}>
          <h2>Plano atual</h2>
          <p className={styles.subtle}>{data.plan?.description || 'Sem descricao disponivel.'}</p>
          <div className={styles.meta}>
            <p><span>Nome:</span> {data.plan?.name ?? '-'}</p>
            <p><span>Periodicidade:</span> {data.plan?.billingInterval ?? '-'}</p>
            <p><span>Preco:</span> {data.plan ? money(data.plan.priceCents, data.plan.currency) : '-'}</p>
            <p><span>Inicio:</span> {formatDate(data.subscription?.startsAt ?? null)}</p>
            <p><span>Fim/Renovacao:</span> {formatDate(data.subscription?.endsAt ?? null)}</p>
            {trialDaysLeft !== null ? <p><span>Dias restantes de trial:</span> {trialDaysLeft}</p> : null}
          </div>
          {data.billing.status === 'past_due' ? (
            <p className={styles.warning}>Assinatura em inadimplencia. Regularize para evitar bloqueios.</p>
          ) : null}
          {data.billing.status === 'missing_subscription' ? (
            <PremiumEmptyState title="Sem assinatura" description="Contrate um plano para liberar recursos SaaS." />
          ) : null}
        </Card>

        <Card className={styles.section}>
          <h2>Cobranca</h2>
          <div className={styles.meta}>
            <p><span>Status:</span> {statusLabel(data.billing.status)}</p>
            <p><span>Provider:</span> {data.billing.provider}</p>
            <p><span>Proxima cobranca:</span> {formatDate(data.billing.nextBillingAt)}</p>
            <p><span>Ultimo pagamento:</span> {formatDate(data.billing.lastPaymentAt)}</p>
          </div>
          <div className={styles.ctaRow}>
            <Button variant="primary">Falar com suporte</Button>
            <Button>Solicitar upgrade</Button>
          </div>
        </Card>
      </section>

      <section className={styles.grid}>
        <Card className={styles.section}>
          <h2>Modulos incluidos</h2>
          {data.modules.length === 0 ? (
            <PremiumEmptyState title="Sem modulos mapeados" description="A lista de modulos sera exibida aqui." />
          ) : (
            <div className={styles.list}>
              {data.modules.map((moduleItem) => (
                <div key={moduleItem.key} className={styles.row}>
                  <div>
                    <strong>{moduleItem.name}</strong>
                    <p className={styles.subtle}>
                      {moduleItem.includedInPlan ? 'Incluido no plano' : 'Fora do plano'} | source: {moduleItem.source}
                      {moduleItem.overrideEnabled !== null ? ' | override developer' : ''}
                    </p>
                  </div>
                  <Badge tone={moduleItem.enabled ? 'success' : 'warning'}>
                    {moduleItem.enabled ? 'ativo' : 'inativo'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.section}>
          <h2>Limites do plano</h2>
          {data.limits.length === 0 ? (
            <PremiumEmptyState title="Sem limites detalhados" description="Uso detalhado em fase futura." />
          ) : (
            <div className={styles.list}>
              {data.limits.map((limitItem) => (
                <div key={limitItem.key} className={styles.row}>
                  <div>
                    <strong>{limitItem.label}</strong>
                    <p className={styles.subtle}>Key: {limitItem.key}</p>
                  </div>
                  <Badge>{limitItem.used ?? '-'} / {limitItem.limit}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card className={styles.section}>
        <h2>Historico de cobrancas</h2>
        {data.history.length === 0 ? (
          <PremiumEmptyState title="Sem historico de faturas" description="Historico de faturas sera exibido aqui." />
        ) : (
          <div className={styles.list}>
            {data.history.map((invoice) => (
              <div key={invoice.id} className={styles.row}>
                <div>
                  <strong>{invoice.id}</strong>
                  <p className={styles.subtle}>
                    Vencimento: {formatDate(invoice.dueDate)} | Criada: {formatDate(invoice.createdAt)}
                  </p>
                </div>
                <div className={styles.right}>
                  <Badge>{invoice.status}</Badge>
                  <small>{money(invoice.amountCents, data.plan?.currency ?? 'BRL')}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className={styles.backLink}>
        <Link href="/admin">
          <Button>Voltar ao painel admin</Button>
        </Link>
      </div>
    </main>
  );
}
