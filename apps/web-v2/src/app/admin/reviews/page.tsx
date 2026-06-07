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

const reviewStages = [
  { title: 'Pendentes', value: 0, detail: 'Aguardando resposta' },
  { title: 'Respondidas', value: 0, detail: 'Retorno enviado' },
  { title: 'Criticas', value: 0, detail: 'Nota baixa ou reclamacao' },
  { title: 'Media', value: '-', detail: 'Avaliacao geral' },
];

export default function AdminReviewsPage() {
  return (
    <main className={styles.page}>
      <PageHeader
        title="Avaliacoes"
        subtitle="Central local para acompanhar notas, comentarios e retorno ao cliente."
        right={<Button>Atualizar</Button>}
      />

      <Card className={styles.commandBar}>
        {relationshipShortcuts.map((shortcut) => (
          <a key={`${shortcut.href}-${shortcut.label}`} href={shortcut.href} className={shortcut.href === '/admin/reviews' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        {reviewStages.map((stage) => (
          <Card key={stage.title} className={styles.metric}>
            <span>{stage.title}</span>
            <strong>{stage.value}</strong>
            <small>{stage.detail}</small>
          </Card>
        ))}
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Monitoramento</span>
          <strong>Avaliacoes do cliente</strong>
        </div>
        <EmptyState title="Sem avaliacoes conectadas" description="Quando os pedidos gerarem notas e comentarios, eles aparecerao aqui para resposta e acompanhamento." />
      </Card>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Roteiro</span>
          <strong>Proximas integracoes</strong>
        </div>
        <div className={styles.cardsGrid}>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Pedido finalizado</strong>
              <Badge tone="warning">Preparado</Badge>
            </div>
            <p>Enviar convite de avaliacao pelo canal do cliente.</p>
          </article>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Resposta operacional</strong>
              <Badge>Local</Badge>
            </div>
            <p>Registrar retorno para comentarios positivos ou criticos.</p>
          </article>
          <article className={styles.itemCard}>
            <div className={styles.itemTop}>
              <strong>Campanha de retorno</strong>
              <Badge tone="success">CRM</Badge>
            </div>
            <p>Gerar cupom ou campanha para recuperar cliente insatisfeito.</p>
          </article>
        </div>
      </Card>
    </main>
  );
}
