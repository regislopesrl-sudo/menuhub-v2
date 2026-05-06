'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { listDeveloperPlans, createDeveloperPlan, updateDeveloperPlan, type DeveloperPlan } from '@/features/modules/developer-plans.api';

export default function DeveloperPlansPage() {
  const [plans, setPlans] = useState<DeveloperPlan[]>([]);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setPlans(await listDeveloperPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar planos');
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Card>
        <h1>Developer Plans</h1>
        <p>Gestao de planos e modulos persistidos em banco.</p>
      </Card>

      <Card>
        <h2>Novo plano</h2>
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <Input placeholder="key (ex: basic)" value={key} onChange={(e) => setKey(e.target.value)} />
          <Input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={async () => {
            try {
              await createDeveloperPlan({ key, name });
              setKey('');
              setName('');
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Falha ao criar plano');
            }
          }}>Criar plano</Button>
        </div>
      </Card>

      {error ? <Card><p>{error}</p></Card> : null}

      {plans.map((plan) => (
        <Card key={plan.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>{plan.name}</strong> ({plan.key})
              <p>{plan.description || 'Sem descricao'}</p>
              <small>Modulos: {plan.modules.length}</small>
            </div>
            <Button onClick={async () => {
              await updateDeveloperPlan(plan.id, { isActive: !plan.isActive });
              await load();
            }}>{plan.isActive ? 'Desativar' : 'Ativar'}</Button>
          </div>
        </Card>
      ))}
    </main>
  );
}
