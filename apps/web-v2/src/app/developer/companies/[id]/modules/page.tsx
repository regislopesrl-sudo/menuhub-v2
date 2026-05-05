'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  getCompanyModulesCommercialView,
  patchCurrentCompanyModule,
  type CompanyModulesCommercialView,
} from '@/features/modules/modules.api';
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

export default function DeveloperCompanyModulesPage() {
  const params = useParams<{ id: string }>();
  const companyId = params?.id;

  const [view, setView] = useState<CompanyModulesCommercialView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getCompanyModulesCommercialView({
        headers: { companyId, userRole: 'developer' },
        targetCompanyId: companyId,
      });
      setView(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulos da empresa.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setError(null);
    try {
      await patchCurrentCompanyModule({
        headers: { companyId, userRole: 'developer' },
        moduleKey,
        enabled: !effectiveEnabled,
        reason: 'Ajuste manual de modulo por empresa',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar modulo.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleClearOverride = async (moduleKey: string, includedInPlan: boolean) => {
    if (!companyId || !canEdit) return;
    setSavingKey(moduleKey);
    setError(null);
    try {
      await patchCurrentCompanyModule({
        headers: { companyId, userRole: 'developer' },
        moduleKey,
        enabled: includedInPlan,
        reason: 'Limpeza de override (retorno ao plano)',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao limpar override.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <main className={styles.page}>
      <Card className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Modulos da empresa</h1>
            <p className={styles.subtitle}>
              {view?.company?.name ?? 'Empresa'}
              {view?.company?.slug ? ` · ${view.company.slug}` : ''}
            </p>
          </div>
          <div className={styles.headerActions}>
            <Badge tone={statusTone(subscriptionStatus)}>{subscriptionStatus ?? 'SEM_ASSINATURA'}</Badge>
            <Link href="/developer/companies">
              <Button>Voltar para Empresas</Button>
            </Link>
          </div>
        </div>
      </Card>

      <section className={styles.summaryGrid}>
        <Card className={styles.summaryCard}><span>Plano atual</span><strong>{view?.plan?.name ?? 'Sem plano'}</strong></Card>
        <Card className={styles.summaryCard}><span>Modulos ativos</span><strong>{summary.active}</strong></Card>
        <Card className={styles.summaryCard}><span>Modulos bloqueados</span><strong>{summary.blocked}</strong></Card>
        <Card className={styles.summaryCard}><span>Overrides manuais</span><strong>{summary.overrides}</strong></Card>
      </section>

      {!canEdit ? (
        <Card className={styles.alertCard}>
          Assinatura inativa. Ative a assinatura para alterar modulos.
        </Card>
      ) : null}

      {loading ? <Card className={styles.stateCard}>Carregando modulos...</Card> : null}
      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {!loading && !error && summary.total === 0 ? <Card className={styles.stateCard}>Nenhum modulo encontrado para esta empresa.</Card> : null}

      {!loading && !error && summary.total > 0 ? (
        <section className={styles.grid}>
          {view?.modules.map((row) => {
            const meta = MODULE_META[row.moduleKey] ?? {
              title: row.moduleKey,
              description: 'Modulo comercial configuravel por plano e override.',
            };
            const saving = savingKey === row.moduleKey;
            return (
              <Card key={row.moduleKey} className={styles.moduleCard}>
                <div className={styles.moduleTop}>
                  <div>
                    <h3>{meta.title}</h3>
                    <p>{meta.description}</p>
                  </div>
                  <Badge>{row.moduleKey}</Badge>
                </div>

                <div className={styles.badges}>
                  <Badge tone={row.effectiveEnabled ? 'success' : 'danger'}>{row.effectiveEnabled ? 'Ativo' : 'Bloqueado'}</Badge>
                  <Badge tone={row.source === 'override' ? 'warning' : 'success'}>{row.source === 'override' ? 'Override' : 'Plano'}</Badge>
                  <Badge>{row.includedInPlan ? 'Incluido no plano' : 'Fora do plano'}</Badge>
                  <Badge>{view?.plan?.key ?? '-'}</Badge>
                </div>

                <p className={styles.originText}>
                  Origem: {row.source === 'override' ? 'Override manual' : 'Plano'}
                  {!canEdit ? ' · Bloqueado por assinatura' : ''}
                </p>

                <div className={styles.actionRow}>
                  <Button
                    variant={row.effectiveEnabled ? 'danger' : 'primary'}
                    onClick={() => void handleToggle(row.moduleKey, row.effectiveEnabled)}
                    disabled={saving || !canEdit}
                  >
                    {saving ? 'Salvando...' : row.effectiveEnabled ? 'Desabilitar' : 'Habilitar'}
                  </Button>

                  {row.overrideEnabled !== null ? (
                    <Button onClick={() => void handleClearOverride(row.moduleKey, row.includedInPlan)} disabled={saving || !canEdit}>
                      Limpar override
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
