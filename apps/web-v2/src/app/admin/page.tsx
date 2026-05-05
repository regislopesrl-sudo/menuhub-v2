'use client';

import Link from 'next/link';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { useModules } from '@/features/modules/use-modules';
import { hasDeveloperSession } from '@/lib/developer-session';

const MODULE_CARDS = [
  {
    key: 'orders',
    title: 'Pedidos',
    href: '/admin/orders',
    description: 'Monitoramento e atualização de status dos pedidos.',
  },
  {
    key: 'kds',
    title: 'Cozinha (KDS)',
    href: '/admin/kds',
    description: 'Operação de preparo com filas visuais e atualização em tempo real.',
  },
  {
    key: 'pdv',
    title: 'PDV / Balcão',
    href: '/admin/pdv',
    description: 'Venda presencial rápida com fluxo de caixa e envio para cozinha.',
  },
  {
    key: 'delivery',
    title: 'Cardápio',
    href: '/delivery',
    description: 'Experiência do cliente para pedidos online.',
  },
];

export default function AdminDashboardPage() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });
  const canManageModules = typeof window !== 'undefined' ? hasDeveloperSession() : false;

  if (modules.loading) {
    return <main className={styles.page}><LoadingState label="Carregando painel administrativo..." /></main>;
  }

  const cards = MODULE_CARDS.filter((item) => modules.isEnabled(item.key));
  if (canManageModules) {
    cards.push({
      key: 'admin_panel',
      title: 'Gestao de Modulos',
      href: '/admin/modules',
      description: 'Area tecnica para habilitar/desabilitar modulos por empresa.',
    });
    cards.push({
      key: 'developer_companies',
      title: 'Empresas SaaS',
      href: '/developer/companies',
      description: 'Cadastro de empresas e gestao comercial de assinatura.',
    });
  }

  return (
    <main className={styles.page}>
      <Card className={styles.hero}>
        <Badge tone="warning">Operação Interna</Badge>
        <h1 className={styles.title}>Painel Administrativo</h1>
        <p className={styles.sub}>Acesso central para os módulos ativos da operação.</p>
      </Card>

      <section className={styles.grid}>
        {cards.map((card) => (
          <Link key={card.key} href={card.href} className={styles.cardLink}>
            <Card className={styles.card}>
              <Badge>{card.key}</Badge>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardText}>{card.description}</p>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
