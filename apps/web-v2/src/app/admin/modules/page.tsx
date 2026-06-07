'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import {
  getCompanyModulesCommercialView,
  patchCurrentCompanyModule,
  type CompanyModulesCommercialView,
} from '@/features/modules/modules.api';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';
import { clearDeveloperSession, hasDeveloperSession } from '@/lib/developer-session';

const MODULE_ORDER = [
  'admin_panel',
  'delivery',
  'orders',
  'menu',
  'payments',
  'pdv',
  'kds',
  'cash',
  'delivery_zones',
  'logistics',
  'reports',
  'financial',
  'stock',
  'procurement',
  'production',
  'crm',
  'coupons',
  'promotions',
  'notifications',
  'fiscal',
  'kiosk',
  'waiter_app',
  'whatsapp',
];

const MODULE_DESCRIPTIONS: Record<string, string> = {
  admin_panel: 'Painel administrativo, menus internos e gestao central.',
  delivery: 'Canal de pedidos online com checkout e entrega.',
  orders: 'Fila, historico e status dos pedidos.',
  menu: 'Produtos, categorias, complementos e cardapio online.',
  payments: 'Formas de pagamento, PIX, cartoes e vouchers.',
  pdv: 'Canal de balcao para venda presencial rapida.',
  kds: 'Painel de cozinha para preparo em tempo real.',
  cash: 'Abertura, sangria, fechamento e conferencia de caixa.',
  delivery_zones: 'Areas de entrega, bairros, CEPs, taxas e prazos.',
  logistics: 'Entregadores, despacho e acompanhamento de entregas.',
  reports: 'Indicadores, BI, CMV, vendas e analises gerenciais.',
  financial: 'Lancamentos, contas, fluxo de caixa e DRE.',
  stock: 'Estoque, insumos, produtos, cobertura e alertas.',
  procurement: 'Compras, fornecedores, notas fiscais e recebimento.',
  production: 'Producao interna, subprodutos e pre-preparo.',
  crm: 'Clientes, historico, fidelidade e relacionamento.',
  coupons: 'Cupons de desconto e regras promocionais.',
  promotions: 'Campanhas comerciais e acoes promocionais.',
  notifications: 'Notificacoes internas e canais futuros.',
  fiscal: 'Emissao e controle fiscal.',
  kiosk: 'Autoatendimento para clientes no totem.',
  waiter_app: 'Atendimento de salao para garcom.',
  whatsapp: 'Canal de pedidos e atendimento via WhatsApp.',
};

export default function AdminModulesPage() {
  const router = useRouter();
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);

  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'default-company';
  const headers = useMemo(
    () => ({
      companyId,
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'developer' as const,
    }),
    [companyId],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [view, setView] = useState<CompanyModulesCommercialView | null>(null);
  const access = useModuleAccess(headers, 'admin_panel');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getCompanyModulesCommercialView({
        headers,
        targetCompanyId: companyId,
      });
      setView(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulos.');
    } finally {
      setLoading(false);
    }
  }, [headers, companyId]);

  useEffect(() => {
    setIsDeveloper(hasDeveloperSession());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    if (!view) return [];
    return [...view.modules].sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a.moduleKey);
      const bi = MODULE_ORDER.indexOf(b.moduleKey);
      const av = ai >= 0 ? ai : 999;
      const bv = bi >= 0 ? bi : 999;
      return av - bv;
    });
  }, [view]);
  const summary = useMemo(() => {
    const total = cards.length;
    const active = cards.filter((item) => item.effectiveEnabled).length;
    const overrides = cards.filter((item) => item.overrideEnabled !== null).length;
    return { total, active, blocked: total - active, overrides };
  }, [cards]);

  const toggle = async (moduleKey: string, overrideEnabled: boolean | null) => {
    setSavingKey(moduleKey);
    setError(null);
    try {
      const nextEnabled = overrideEnabled === true ? false : true;
      await patchCurrentCompanyModule({
        headers,
        moduleKey,
        enabled: nextEnabled,
        reason: 'Ajuste manual via painel developer',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar modulo.');
    } finally {
      setSavingKey(null);
    }
  };

  const clearOverride = async (moduleKey: string) => {
    setSavingKey(moduleKey);
    setError(null);
    try {
      await patchCurrentCompanyModule({
        headers,
        moduleKey,
        enabled: null,
        reason: 'Remocao de override para voltar ao plano',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover override.');
    } finally {
      setSavingKey(null);
    }
  };

  if (access.loading || isDeveloper === null) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao modulo..." /></main>;
  }
  if (!access.allowed) {
    return <ModuleDisabled moduleName="Admin Panel" reason={access.error ?? 'Modulo admin_panel desativado.'} />;
  }
  if (!isDeveloper) {
    return <ModuleDisabled moduleName="Admin Modules" reason="Area tecnica restrita" />;
  }

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Gestão de módulos"
        subtitle="Controle de habilitação por empresa com base em plano e override."
        actions={
          <div className={styles.actions}>
            <Badge tone="warning">Área Técnica</Badge>
            <Button onClick={() => void load()}>Atualizar</Button>
            <Button
              variant="danger"
              onClick={() => {
                clearDeveloperSession();
                router.push('/developer-login');
              }}
            >
              Sair
            </Button>
          </div>
        }
      />

      <section className={styles.statsGrid}>
        <PremiumSummaryCard label="Módulos no catálogo" value={summary.total} />
        <PremiumSummaryCard label="Ativos" value={summary.active} />
        <PremiumSummaryCard label="Bloqueados" value={summary.blocked} />
        <PremiumSummaryCard label="Overrides" value={summary.overrides} />
      </section>

      {view ? (
        <Card>
          <div className={styles.metaRow}>
            <Badge>{view.company.name}</Badge>
            <Badge>{view.company.status}</Badge>
            <Badge>{view.plan?.name ?? 'Sem plano'}</Badge>
            <Badge tone={view.subscription ? 'success' : 'warning'}>
              {view.subscription?.status ?? 'SEM_ASSINATURA'}
            </Badge>
          </div>
          {!view.subscription || (view.subscription.status !== 'ACTIVE' && view.subscription.status !== 'TRIAL') ? (
            <div className={styles.ctaRow}>
              <p className={styles.sub}>Assinatura inativa: os modulos efetivos ficam bloqueados.</p>
              <Link href={`/developer/companies/${view.company.id}/subscription`}>
                <Button variant="primary">Criar assinatura</Button>
              </Link>
            </div>
          ) : null}
        </Card>
      ) : null}

      {loading ? <LoadingState label="Carregando modulos..." /> : null}
      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && cards.length === 0 ? (
        <EmptyState title="Sem modulos" description="Nenhum modulo encontrado para esta empresa." />
      ) : null}

      {!loading && cards.length > 0 ? (
        <section className={styles.grid}>
          {cards.map((item) => (
            <Card key={item.moduleKey} className={styles.card}>
              <div className={styles.cardTop}>
                <strong>{item.label ?? item.moduleKey}</strong>
                <Badge tone={item.effectiveEnabled ? 'success' : 'danger'}>{item.effectiveEnabled ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className={styles.metaRow}>
                <Badge>{item.moduleKey}</Badge>
                <Badge>{item.source}</Badge>
                <Badge>{item.includedInPlan ? 'in_plan' : 'out_plan'}</Badge>
                <Badge>{item.overrideEnabled === null ? 'override:none' : `override:${item.overrideEnabled}`}</Badge>
              </div>
              <p className={styles.description}>{item.description || MODULE_DESCRIPTIONS[item.moduleKey] || 'Modulo comercial configuravel por plano e override.'}</p>
              <div className={styles.actions}>
                <Button
                  variant={item.effectiveEnabled ? 'danger' : 'primary'}
                  onClick={() => void toggle(item.moduleKey, item.overrideEnabled)}
                  disabled={savingKey === item.moduleKey}
                >
                  {savingKey === item.moduleKey ? 'Salvando...' : item.effectiveEnabled ? 'Desabilitar' : 'Habilitar'}
                </Button>
                <Button
                  onClick={() => void clearOverride(item.moduleKey)}
                  disabled={savingKey === item.moduleKey || item.overrideEnabled === null}
                >
                  Remover override
                </Button>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
