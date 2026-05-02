'use client';

import Link from 'next/link';
import styles from './app-navbar.module.css';
import { useModules } from '@/features/modules/use-modules';

export function AppNavbar() {
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID;
  const modules = useModules({ companyId, branchId, userRole: 'admin' });

  return (
    <header className={styles.navWrap}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>MenuHub V2</Link>
        <div className={styles.links}>
          <Link href="/admin" className={styles.link}>Dashboard</Link>
          {modules.isEnabled('orders') ? <Link href="/admin/orders" className={styles.link}>Pedidos</Link> : null}
          {modules.isEnabled('kds') ? <Link href="/admin/kds" className={styles.link}>KDS</Link> : null}
          {modules.isEnabled('pdv') ? <Link href="/admin/pdv" className={styles.link}>PDV</Link> : null}
        </div>
      </nav>
    </header>
  );
}
