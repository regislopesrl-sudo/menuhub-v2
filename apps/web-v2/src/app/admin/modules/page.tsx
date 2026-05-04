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
import {
  getCompanyModulesCommercialView,
  patchCurrentCompanyModule,
  type CompanyModulesCommercialView,
} from '@/features/modules/modules.api';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';
import { clearDeveloperSession, hasDeveloperSession } from '@/lib/developer-session';

const MODULE_ORDER = [
  'delivery',
  'pdv',
  'kds',
  'kiosk',
  'waiter_app',
  'whatsapp',
  'reports',
  'financial',
  'stock',
  'fiscal',
];

const MODULE_DESCRIPTIONS: Record<string, string> = {
  delivery: 'Canal de pedidos online com checkout e entrega.',
  pdv: 'Canal de balcao para venda presencial rapida.',
  kds: 'Painel de cozinha para preparo em tempo real.',
  kiosk: 'Autoatendimento para clientes no totem.',
  waiter_app: 'Atendimento de salao para garcom.',
  whatsapp: 'Canal de pedidos e atendimento via WhatsApp.',
  reports: 'Indicadores e relatorios operacionais.',
  financial: 'Controle financeiro e conciliacao basica.',
  stock: 'Estoque e movimentacoes de insumos/produtos.',
  fiscal: 'Emissao e controle fiscal.',
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
      <section className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Gestao de Modulos</h1>
          <p className={styles.sub}>Controle de habilitacao por empresa com base em plano + override.</p>
        </div>
        <div className={styles.actions}>
          <Badge tone="warning">Area Tecnica</Badge>
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
              <Link href={`/companies/${view.company.id}/subscription`}>
                <Button variant="primary">Criar assinatura</Button>
              </Link>
            </div>
          ) : null}
        </Card>
      ) : null}

      {loading ? <LoadingState label="Carregando modulos..." /> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && !error && cards.length === 0 ? (
        <EmptyState title="Sem modulos" description="Nenhum modulo encontrado para esta empresa." />
      ) : null}

      {!loading && cards.length > 0 ? (
        <section className={styles.grid}>
          {cards.map((item) => (
            <Card key={item.moduleKey} className={styles.card}>
              <div className={styles.cardTop}>
                <strong>{item.moduleKey}</strong>
                <Badge tone={item.effectiveEnabled ? 'success' : 'danger'}>{item.effectiveEnabled ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className={styles.metaRow}>
                <Badge>{item.source}</Badge>
                <Badge>{item.includedInPlan ? 'in_plan' : 'out_plan'}</Badge>
                <Badge>{item.overrideEnabled === null ? 'override:none' : `override:${item.overrideEnabled}`}</Badge>
              </div>
              <p className={styles.description}>{MODULE_DESCRIPTIONS[item.moduleKey] ?? 'Modulo comercial configuravel por plano e override.'}</p>
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
