'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function ModuleDisabled({
  moduleName,
  reason,
}: {
  moduleName: string;
  reason?: string;
}) {
  return (
    <main style={{ minHeight: '100vh', padding: '24px 0', display: 'grid', placeItems: 'center' }}>
      <Card style={{ padding: 16, maxWidth: 560, width: '100%', display: 'grid', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Módulo desabilitado</h1>
        <p style={{ margin: 0, color: '#475569' }}>
          O módulo <strong>{moduleName}</strong> não está ativo para esta empresa.
        </p>
        {reason ? <small style={{ color: '#64748b' }}>{reason}</small> : null}
        <div>
          <Button onClick={() => window.location.assign('/admin/modules')}>Ir para Gestão de Módulos</Button>
        </div>
      </Card>
    </main>
  );
}

