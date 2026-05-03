'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  listCurrentCompanyModules,
  listModules,
  patchCurrentCompanyModule,
  type CompanyModuleAccess,
  type ModuleDefinition,
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

export default function AdminModulesPage() {
  const router = useRouter();
  const [isDeveloper, setIsDeveloper] = useState(false);

  const headers = useMemo(
    () => ({
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
    }),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [companyModules, setCompanyModules] = useState<CompanyModuleAccess[]>([]);
  const access = useModuleAccess(headers, 'admin_panel');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [defs, company] = await Promise.all([
        listModules(headers),
        listCurrentCompanyModules(headers),
      ]);
      setModules(defs);
      setCompanyModules(company);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulos.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    setIsDeveloper(hasDeveloperSession());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    const map = new Map(companyModules.map((item) => [item.moduleKey, item]));
    const merged = modules.map((def) => {
      const state = map.get(def.key);
      return {
        key: def.key,
        name: def.name,
        enabled: state?.enabled ?? def.enabledByDefault,
        adminOnly: state?.adminOnly ?? def.adminOnly,
        source: state?.source ?? 'default',
        planKey: state?.planKey,
      };
    });
    return merged.sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a.key);
      const bi = MODULE_ORDER.indexOf(b.key);
      const av = ai >= 0 ? ai : 999;
      const bv = bi >= 0 ? bi : 999;
      return av - bv;
    });
  }, [companyModules, modules]);

  const toggle = async (moduleKey: string, enabled: boolean) => {
    setSavingKey(moduleKey);
    setError(null);
    try {
      const updated = await patchCurrentCompanyModule({
        headers,
        moduleKey,
        enabled,
      });
      setCompanyModules((prev) => {
        const next = prev.filter((item) => item.moduleKey !== moduleKey);
        next.push(updated);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar modulo.');
    } finally {
      setSavingKey(null);
    }
  };

  if (access.loading) {
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
      <PageHeader
        title="Gestao de Modulos"
        subtitle="Controle tecnico de habilitacao por empresa com base em override, plano e default."
        right={
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
        }
      />

      {loading ? <LoadingState label="Carregando modulos..." /> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && !error && cards.length === 0 ? (
        <EmptyState title="Sem modulos" description="Nenhum modulo encontrado para esta empresa." />
      ) : null}

      {!loading && cards.length > 0 ? (
        <section className={styles.grid}>
          {cards.map((item) => (
            <Card key={item.key} className={styles.card}>
              <div className={styles.cardTop}>
                <strong>{item.name}</strong>
                <Badge tone={item.enabled ? 'success' : 'danger'}>{item.enabled ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className={styles.metaRow}>
                <Badge>{item.key}</Badge>
                {item.adminOnly ? <Badge tone="warning">adminOnly</Badge> : null}
                {item.planKey ? <Badge>{item.planKey}</Badge> : null}
                <Badge>{item.source}</Badge>
              </div>
              <p className={styles.description}>
                {item.key === 'delivery' && 'Canal de pedidos online com checkout e entrega.'}
                {item.key === 'pdv' && 'Canal de balcao para venda presencial rapida.'}
                {item.key === 'kds' && 'Painel de cozinha para preparo em tempo real.'}
                {item.key === 'kiosk' && 'Autoatendimento para clientes no totem.'}
                {item.key === 'waiter_app' && 'Atendimento de salao para garcom.'}
                {item.key === 'whatsapp' && 'Canal de pedidos e atendimento via WhatsApp.'}
                {item.key === 'reports' && 'Indicadores e relatorios operacionais.'}
                {item.key === 'financial' && 'Controle financeiro e conciliacao basica.'}
                {item.key === 'stock' && 'Estoque e movimentacoes de insumos/produtos.'}
                {item.key === 'fiscal' && 'Emissao e controle fiscal.'}
              </p>
              <Button
                variant={item.enabled ? 'danger' : 'primary'}
                onClick={() => void toggle(item.key, !item.enabled)}
                disabled={savingKey === item.key}
              >
                {savingKey === item.key
                  ? 'Salvando...'
                  : item.enabled
                    ? 'Desabilitar'
                    : 'Habilitar'}
              </Button>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
