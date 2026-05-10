'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PremiumEmptyState, PremiumErrorState, PremiumPageHeader, PremiumSummaryCard } from '@/components/premium';
import { listDeveloperPlans, createDeveloperPlan, updateDeveloperPlan, type DeveloperPlan } from '@/features/modules/developer-plans.api';
import styles from './page.module.css';

export default function DeveloperPlansPage() {
  const [plans, setPlans] = useState<DeveloperPlan[]>([]);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPlans(await listDeveloperPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar planos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function onCreatePlan() {
    const normalizedKey = key.trim();
    const normalizedName = name.trim();
    if (!normalizedKey || !normalizedName) {
      setError('Informe key e nome para criar o plano.');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await createDeveloperPlan({
        key: normalizedKey,
        name: normalizedName,
        description: description.trim() || undefined,
      });
      setKey('');
      setName('');
      setDescription('');
      setSuccessMessage('Plano criado com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar plano');
    } finally {
      setCreating(false);
    }
  }

  async function onTogglePlan(plan: DeveloperPlan) {
    setUpdatingPlanId(plan.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await updateDeveloperPlan(plan.id, { isActive: !plan.isActive });
      setSuccessMessage(`Plano ${plan.isActive ? 'desativado' : 'ativado'} com sucesso.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar plano');
    } finally {
      setUpdatingPlanId(null);
    }
  }

  const activePlans = plans.filter((plan) => plan.isActive).length;
  const inactivePlans = plans.length - activePlans;
  const totalModules = plans.reduce((total, plan) => total + plan.modules.length, 0);
  const totalLimits = plans.reduce((total, plan) => total + plan.limits.length, 0);

  return (
    <main className={styles.page}>
      <PremiumPageHeader
        title="Planos da plataforma"
        subtitle="Gerencie planos comerciais, modulos vinculados e limites persistidos em banco."
      />

      <section className={styles.summaryGrid}>
        <PremiumSummaryCard label="Planos" value={plans.length} />
        <PremiumSummaryCard label="Ativos" value={activePlans} />
        <PremiumSummaryCard label="Inativos" value={inactivePlans} />
        <PremiumSummaryCard label="Modulos vinculados" value={totalModules} />
        <PremiumSummaryCard label="Limites" value={totalLimits} />
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Novo plano</h2>
            <p>Crie a base comercial que sera usada nas assinaturas das empresas.</p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <Input placeholder="key (ex: basic)" value={key} onChange={(event) => setKey(event.target.value)} />
          <Input placeholder="Nome do plano" value={name} onChange={(event) => setName(event.target.value)} />
          <Input placeholder="Descricao opcional" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Button variant="primary" onClick={() => void onCreatePlan()} disabled={creating}>
            {creating ? 'Criando...' : 'Criar plano'}
          </Button>
        </div>
      </Card>

      {error ? <PremiumErrorState message={error} onRetry={() => void load()} /> : null}
      {successMessage ? <Card className={styles.successCard}>{successMessage}</Card> : null}
      {loading ? <Card className={styles.stateCard}>Carregando planos...</Card> : null}
      {!loading && plans.length === 0 ? (
        <PremiumEmptyState title="Nenhum plano cadastrado" description="Crie o primeiro plano para liberar assinaturas e modulos por empresa." />
      ) : null}

      <section className={styles.grid}>
        {plans.map((plan) => (
          <Card key={plan.id} className={styles.planCard}>
            <div className={styles.planTop}>
              <div>
                <strong className={styles.planName}>{plan.name}</strong>
                <p className={styles.planKey}>{plan.key}</p>
              </div>
              <Badge tone={plan.isActive ? 'success' : 'warning'}>
                {plan.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className={styles.description}>{plan.description || 'Sem descricao comercial cadastrada.'}</p>
            <div className={styles.metaGrid}>
              <span>Modulos: <strong>{plan.modules.length}</strong></span>
              <span>Limites: <strong>{plan.limits.length}</strong></span>
            </div>
            <div className={styles.moduleList}>
              {plan.modules.slice(0, 6).map((module) => (
                <Badge key={module.moduleKey} tone={module.enabled ? 'success' : 'default'}>
                  {module.moduleKey}
                </Badge>
              ))}
              {plan.modules.length > 6 ? <Badge>+{plan.modules.length - 6}</Badge> : null}
            </div>
            <div className={styles.actions}>
              <Button onClick={() => void onTogglePlan(plan)} disabled={updatingPlanId === plan.id}>
                {updatingPlanId === plan.id ? 'Salvando...' : plan.isActive ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
