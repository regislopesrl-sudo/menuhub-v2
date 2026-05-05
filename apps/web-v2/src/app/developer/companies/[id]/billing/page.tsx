'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import {
  createDeveloperInvoicePaymentLink,
  createDeveloperMockInvoice,
  runDeveloperBillingCycle,
  type BillingPaymentLink,
  getDeveloperCompanyBilling,
  listDeveloperCompanyInvoices,
  payDeveloperMockInvoice,
  upsertDeveloperCompanyBillingAccount,
  type Invoice,
} from '@/features/modules/developer-commercial.api';
import styles from './page.module.css';

export default function BillingPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingEmail, setBillingEmail] = useState('');
  const [document, setDocument] = useState('');
  const [legalName, setLegalName] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('SEM_ASSINATURA');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, BillingPaymentLink>>({});
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? '').toLowerCase();
  const allowMockPayButton = appEnv === 'local' || appEnv === 'hml' || appEnv === 'development';

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [billing, invoiceList] = await Promise.all([
        getDeveloperCompanyBilling(companyId),
        listDeveloperCompanyInvoices(companyId),
      ]);
      setBillingEmail(billing.billingAccount?.billingEmail ?? '');
      setDocument(billing.billingAccount?.document ?? '');
      setLegalName(billing.billingAccount?.legalName ?? billing.company.legalName);
      setSubscriptionStatus(billing.subscription?.status ?? 'SEM_ASSINATURA');
      setInvoices(invoiceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [companyId]);

  async function saveBillingAccount() {
    setError(null);
    try {
      await upsertDeveloperCompanyBillingAccount(companyId, {
        billingEmail,
        document: document || undefined,
        legalName: legalName || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar billing account.');
    }
  }

  async function createInvoice() {
    setError(null);
    try {
      await createDeveloperMockInvoice(companyId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar fatura mock.');
    }
  }

  async function payInvoice(invoiceId: string) {
    setError(null);
    try {
      await payDeveloperMockInvoice(companyId, invoiceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao pagar fatura mock.');
    }
  }

  async function createPaymentLink(invoiceId: string) {
    setError(null);
    try {
      const link = await createDeveloperInvoicePaymentLink(companyId, invoiceId);
      setPaymentLinks((prev) => ({ ...prev, [invoiceId]: link }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar link de pagamento.');
    }
  }

  async function runCycle() {
    setError(null);
    try {
      await runDeveloperBillingCycle(companyId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar ciclo de billing.');
    }
  }

  function getOverdueDays(invoice: Invoice): number {
    if (invoice.status !== 'PAST_DUE') return 0;
    const due = new Date(invoice.dueDate).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Billing da empresa"
        subtitle="Gerencie cobrança, faturas e status financeiro."
        actions={
          <Link href="/developer/companies">
            <Button>Voltar para Empresas</Button>
          </Link>
        }
      />

      <section className={styles.summaryGrid}>
        <PremiumSummaryCard label="Assinatura" value={subscriptionStatus} />
        <PremiumSummaryCard label="Faturas" value={invoices.length} />
        <PremiumSummaryCard label="Pagas" value={invoices.filter((invoice) => invoice.status === 'PAID').length} />
        <PremiumSummaryCard label="Em atraso" value={invoices.filter((invoice) => invoice.status === 'PAST_DUE').length} />
      </section>

      <div className={styles.row}>
        <Badge>{subscriptionStatus}</Badge>
      </div>
      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {loading ? <p>Carregando...</p> : null}

      <Card className={styles.card}>
        <h2>Dados fiscais/cobrança</h2>
        <div className={styles.form}>
          <Input placeholder="Billing email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
          <Input placeholder="Documento" value={document} onChange={(e) => setDocument(e.target.value)} />
          <Input placeholder="Razão social" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          <Button variant="primary" onClick={() => void saveBillingAccount()}>Salvar billing account</Button>
        </div>
      </Card>

      <Card className={styles.card}>
        <h2>Faturas</h2>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => void createInvoice()}>Gerar fatura mock</Button>
          <Button onClick={() => void runCycle()}>Rodar ciclo mensal</Button>
        </div>
        <div className={styles.list}>
          {invoices.map((invoice) => (
            <div key={invoice.id} className={styles.invoiceRow}>
              <div>
                <strong>{invoice.id.slice(0, 8)}</strong>
                <p>R$ {(invoice.amountCents / 100).toFixed(2)} • {invoice.status}</p>
                {invoice.status === 'PAST_DUE' ? (
                  <p className={styles.pastDue}>Em atraso há {getOverdueDays(invoice)} dia(s). Regularize o pagamento.</p>
                ) : null}
                {paymentLinks[invoice.id] ? (
                  <p className={styles.meta}>
                    {paymentLinks[invoice.id].provider} • {paymentLinks[invoice.id].status} • {paymentLinks[invoice.id].providerPaymentId}
                  </p>
                ) : null}
              </div>
              <div className={styles.actions}>
                <Button onClick={() => void createPaymentLink(invoice.id)} disabled={invoice.status === 'PAID'}>
                  Gerar link de pagamento
                </Button>
                {paymentLinks[invoice.id]?.provider === 'mock' && allowMockPayButton ? (
                  <Button onClick={() => void payInvoice(invoice.id)} disabled={invoice.status === 'PAID'}>
                    {invoice.status === 'PAID' ? 'Pago' : 'Simular pagamento'}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {invoices.length === 0 ? <PremiumEmptyState title="Sem faturas" description="Gere uma fatura mock para iniciar os testes de cobrança local." /> : null}
        </div>
      </Card>
    </main>
  );
}

