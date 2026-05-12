'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import {
  getDeveloperCompanyModules,
  patchDeveloperCompanyModule,
  type DeveloperCompanyModulesView,
} from '@/features/developer/developer-companies.api';
import { getAuthSession } from '@/lib/auth-session';
import styles from './page.module.css';

type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

type ModuleUiMeta = {
  title: string;
  description: string;
};

const MODULE_META: Record<string, ModuleUiMeta> = {
  delivery: { title: 'Delivery', description: 'Cardapio online e pedidos.' },
  pdv: { title: 'PDV', description: 'Operacao de caixa e vendas presenciais.' },
  kds: { title: 'KDS', description: 'Cozinha e preparo.' },
  whatsapp: { title: 'WhatsApp', description: 'Atendimento e notificacoes.' },
  kiosk: { title: 'Kiosk', description: 'Autoatendimento.' },
  waiter_app: { title: 'Waiter App', description: 'Garcom digital.' },
  admin_panel: { title: 'Admin Panel', description: 'Acesso ao painel administrativo.' },
  orders: { title: 'Pedidos', description: 'Fluxo de pedidos e acompanhamento.' },
  menu: { title: 'Cardapio', description: 'Gestao de itens e categorias.' },
  payments: { title: 'Pagamentos', description: 'Processamento de pagamento.' },
  reports: { title: 'Relatorios', description: 'Indicadores e analises operacionais.' },
  stock: { title: 'Estoque', description: 'Controle de estoque e movimentacao.' },
  fiscal: { title: 'Fiscal', description: 'Rotinas e obrigacoes fiscais.' },
  financial: { title: 'Financeiro', description: 'Gestao financeira do negocio.' },
};

function statusTone(status: SubscriptionStatus | null): 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE' || status === 'TRIAL') return 'success';
  if (status === 'PAST_DUE') return 'warning';
  return 'danger';
}

function sourceLabel(source: 'plan' | 'override' | 'default'): string {
  if (source === 'override') return 'company_override';
  if (source === 'plan') return 'plan';
  return 'default';
}

function overrideLabel(value: boolean | null): string {
  if (value === true) return 'liberado manualmente';
  if (value === false) return 'bloqueado manualmente';
  return 'sem override';
}

export default function DeveloperCompanyModulesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const companyId = params?.id;

  const [view, setView] = useState<DeveloperCompanyModulesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});
  const [restricted, setRestricted] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getDeveloperCompanyModules(companyId);
      setView(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulos da empresa.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const session = getAuthSession();
    const isPlatformUser = session?.role === 'developer' || session?.role === 'technical_admin';
    if (!isPlatformUser) {
      setRestricted(true);
      setLoading(false);
      window.setTimeout(() => {
        router.push('/developer-login');
      }, 1200);
      return;
    }
    void load();
  }, [load, router]);

  const subscriptionStatus = (view?.subscription?.status ?? null) as SubscriptionStatus | null;
  const canEdit = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'TRIAL';

  const summary = useMemo(() => {
    const list = view?.modules ?? [];
    const active = list.filter((item) => item.effectiveEnabled).length;
    const blocked = list.length - active;
    const overrides = list.filter((item) => item.overrideEnabled !== null).length;
    return { active, blocked, overrides, total: list.length };
  }, [view]);

  const handleToggle = async (moduleKey: string, effectiveEnabled: boolean) => {
    if (!companyId || !canEdit) return;
    setSavingKey(moduleKey);
    setModuleErrors((current) => ({ ...current, [moduleKey]: '' }));
    setError(null);
    try {
      await patchDeveloperCompanyModule({
        companyId,
        moduleKey,
        enabled: !effectiveEnabled,
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao alterar modulo.';
      setModuleErrors((current) => ({ ...current, [moduleKey]: message }));
    } finally {
      setSavingKey(null);
    }
  };

  if (restricted) {
    return (
      <main className={styles.page}>
        <Card className={styles.alertCard}>
          Area restrita da plataforma. Redirecionando para o login tecnico...
        </Card>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Modulos por empresa"
        subtitle={`${view?.company?.name ?? 'Empresa'}${view?.company?.slug ? ` · ${view.company.slug}` : ''}`}
        actions={
          <>
            <Badge tone={statusTone(subscriptionStatus)}>{subscriptionStatus ?? 'SEM_ASSINATURA'}</Badge>
            <Link href={`/developer/companies/${companyId}/subscription`}>
              <Button variant="primary">Ativar assinatura</Button>
            </Link>
            <Link href="/developer/companies">
              <Button>Voltar para Empresas</Button>
            </Link>
          </>
        }
      />

      <section className={styles.summaryGrid}>
        <PremiumSummaryCard label="Plano atual" value={view?.plan?.name ?? 'Sem plano'} />
        <PremiumSummaryCard label="Modulos ativos" value={summary.active} />
        <PremiumSummaryCard label="Modulos bloqueados" value={summary.blocked} />
        <PremiumSummaryCard label="Overrides manuais" value={summary.overrides} />
      </section>

      <Card className={styles.policyCard}>
        <div>
          <span className={styles.eyebrow}>Liberacao tecnica</span>
          <h2>Painel manual de modulos da plataforma</h2>
          <p>
            Use esta tela apenas para suporte tecnico, homologacao comercial ou excecoes autorizadas.
            Administradores da loja continuam configurando apenas o uso operacional dos modulos liberados.
          </p>
        </div>
        <div className={styles.policyList}>
          <Badge tone="warning">exige platform:modules:manage</Badge>
          <Badge>auditoria de override</Badge>
          <Badge>assinatura continua obrigatoria</Badge>
        </div>
      </Card>

      {!canEdit ? (
        <Card className={styles.alertCard}>
          Assinatura inativa. Ative a assinatura para alterar modulos. O override tecnico nao substitui
          uma assinatura cancelada, expirada ou inadimplente.
          <div className={styles.actionRow}>
            <Link href={`/developer/companies/${companyId}/subscription`}>
              <Button variant="primary">Ir para assinatura</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {loading ? <Card className={styles.stateCard}>Carregando modulos...</Card> : null}
      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && summary.total === 0 ? <PremiumEmptyState title="Sem modulos" description="Nenhum modulo encontrado para esta empresa." /> : null}

      {!loading && !error && summary.total > 0 ? (
        <section className={styles.grid}>
          {view?.modules.map((row) => {
            const meta = MODULE_META[row.key] ?? {
              title: row.label,
              description: row.description,
            };
            const saving = savingKey === row.key;
            return (
              <Card key={row.key} className={styles.moduleCard}>
                <div className={styles.moduleTop}>
                  <div>
                    <h3>{meta.title}</h3>
                    <p>{meta.description}</p>
                  </div>
                  <Badge>{row.key}</Badge>
                </div>

                <div className={styles.badges}>
                  <Badge tone={row.effectiveEnabled ? 'success' : 'danger'}>{row.effectiveEnabled ? 'enabled' : 'disabled'}</Badge>
                  <Badge tone={row.source === 'override' ? 'warning' : 'success'}>{sourceLabel(row.source)}</Badge>
                  <Badge>{row.adminOnly ? 'adminOnly' : 'standard'}</Badge>
                  <Badge>{row.includedInPlan ? 'no plano' : 'fora do plano'}</Badge>
                </div>

                <p className={styles.originText}>
                  Origem: {sourceLabel(row.source)}
                  {row.blockedReason ? ` · ${row.blockedReason}` : ''}
                </p>
                <p className={styles.overrideText}>Override: {overrideLabel(row.overrideEnabled)}</p>

                {moduleErrors[row.key] ? <p className={styles.moduleError}>{moduleErrors[row.key]}</p> : null}

                <div className={styles.actionRow}>
                  <Button
                    variant={row.effectiveEnabled ? 'danger' : 'primary'}
                    onClick={() => void handleToggle(row.key, row.effectiveEnabled)}
                    disabled={saving || !canEdit}
                  >
                    {saving ? 'Salvando...' : row.effectiveEnabled ? 'Desabilitar' : 'Habilitar'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
