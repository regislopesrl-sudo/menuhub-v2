'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import styles from './page.module.css';

const relationshipShortcuts = [
  { href: '/admin/coupons', label: 'Cupons e descontos', description: 'regras de desconto' },
  { href: '/admin/crm', label: 'Clientes', description: 'historico e perfil' },
  { href: '/admin/crm', label: 'Fidelidade', description: 'pontos e cashback' },
  { href: '/admin/reviews', label: 'Avaliacoes', description: 'nota e retorno' },
  { href: '/admin/promotions', label: 'Food marketing', description: 'campanhas' },
  { href: '/admin/customer-credit', label: 'Fiado', description: 'credito do cliente' },
];

const creditStages = [
  { title: 'Clientes com fiado', value: 0, detail: 'Credito aberto' },
  { title: 'Saldo em aberto', value: 'R$ 0,00', detail: 'A receber' },
  { title: 'Vencidos', value: 0, detail: 'Exigem cobranca' },
  { title: 'Recebido hoje', value: 'R$ 0,00', detail: 'Baixas manuais' },
];

export default function AdminCustomerCreditPage() {
  return (
    <main className={styles.page}>
      <PageHeader
        title="Fiado"
        subtitle="Controle local de credito do cliente, cobranca e baixa futura no financeiro."
        right={<Button>Atualizar</Button>}
      />

      <Card className={styles.commandBar}>
        {relationshipShortcuts.map((shortcut) => (
          <a key={`${shortcut.href}-${shortcut.label}`} href={shortcut.href} className={shortcut.href === '/admin/customer-credit' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        {creditStages.map((stage) => (
          <Card key={stage.title} className={styles.metric}>
            <span>{stage.title}</span>
            <strong>{stage.value}</strong>
            <small>{stage.detail}</small>
          </Card>
        ))}
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Controle</span>
          <strong>Credito do cliente</strong>
        </div>
        <EmptyState title="Sem lancamentos de fiado" description="Quando um pedido for marcado como fiado, o saldo do cliente aparecera aqui para cobranca e baixa." />
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Regras</span>
          <strong>Fluxo preparado</strong>
        </div>
        <div className={styles.cardsGrid}>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Vinculo com cliente</strong>
              <Badge tone="success">CRM</Badge>
            </div>
            <p>Fiado deve sempre estar ligado a um cliente cadastrado.</p>
          </article>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Financeiro</strong>
              <Badge tone="warning">Preparado</Badge>
            </div>
            <p>Baixas futuras devem alimentar contas a receber e fluxo de caixa.</p>
          </article>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Bloqueio operacional</strong>
              <Badge>Local</Badge>
            </div>
            <p>Cliente vencido podera ser bloqueado para novo fiado.</p>
          </article>
        </div>
      </Card>
    </main>
  );
}
