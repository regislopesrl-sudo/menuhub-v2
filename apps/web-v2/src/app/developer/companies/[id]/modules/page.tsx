'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { listDeveloperCompanyModules, patchDeveloperCompanyModule } from '@/features/modules/developer-plans.api';

type Row = { companyId: string; moduleKey: string; enabled: boolean; source: string; planKey?: string };

export default function DeveloperCompanyModulesPage() {
  const params = useParams<{ id: string }>();
  const companyId = params?.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setError(null);
    try {
      setRows(await listDeveloperCompanyModules(companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulos');
    }
  }

  useEffect(() => { void load(); }, [companyId]);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 12 }}>
      <Card>
        <h1>Company Modules</h1>
        <p>Empresa: {companyId}</p>
      </Card>
      {error ? <Card><p>{error}</p></Card> : null}
      {rows.map((row) => (
        <Card key={row.moduleKey}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{row.moduleKey}</strong>
              <p>source: {row.source} | plan: {row.planKey ?? '-'}</p>
            </div>
            <Button onClick={async () => {
              if (!companyId) return;
              await patchDeveloperCompanyModule(companyId, row.moduleKey, !row.enabled);
              await load();
            }}>{row.enabled ? 'Desabilitar' : 'Habilitar'}</Button>
          </div>
        </Card>
      ))}
    </main>
  );
}
