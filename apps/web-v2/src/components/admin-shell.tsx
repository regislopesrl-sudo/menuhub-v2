'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getCompanySettings } from '@/features/settings/settings.api';
import { apiFetch } from '@/lib/api-fetch';
import { readJwtPayload } from '@/lib/auth-claims';
import { logoutCurrentSession } from '@/lib/auth-api';
import { getAuthSession } from '@/lib/auth-session';
import styles from './admin-shell.module.css';

type CurrentUserResponse = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
  section: NavSection;
  external?: boolean;
  disabled?: boolean;
  match?: string[];
  matchQuery?: QueryMatch;
  children?: Array<{
    href: string;
    label: string;
    description?: string;
    external?: boolean;
    match?: string[];
    matchQuery?: QueryMatch;
  }>;
};

type NavSection = 'Operacao' | 'Gestao' | 'Administracao';
type QueryMatch = Record<string, string | string[]>;
type SearchReader = { get(name: string): string | null };

type ContextAction = {
  href: string;
  label: string;
  external?: boolean;
};

const NAV_SECTION_ORDER: NavSection[] = ['Operacao', 'Gestao', 'Administracao'];

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin/orders',
    label: 'Pedidos',
    description: 'Gestao de pedidos',
    icon: 'PE',
    section: 'Operacao',
    match: ['/admin/orders', '/admin/pdv'],
    children: [
      { href: '/admin/pdv', label: 'Novo Pedido PDV', description: 'Venda rapida no balcao', match: ['/admin/pdv'] },
      { href: '/admin/orders', label: 'Gestao de pedidos', description: 'Fila, status e historico', match: ['/admin/orders'] },
    ],
  },
  {
    href: '/admin/tables',
    label: 'Mesas/Comandas',
    description: 'Consumo local',
    icon: 'MC',
    section: 'Operacao',
    match: ['/admin/tables'],
    children: [
      { href: '/admin/tables', label: 'Mesas e Comandas', description: 'Abertura, consumo e fechamento', match: ['/admin/tables'] },
    ],
  },
  {
    href: '/admin/kds',
    label: 'KDS',
    description: 'Cozinha',
    icon: 'KD',
    section: 'Operacao',
    match: ['/admin/kds'],
    children: [
      { href: '/admin/kds', label: 'Ver Cozinha', description: 'Fila de preparo', match: ['/admin/kds'] },
      { href: '/admin/kds/tv', label: 'Painel TV', description: 'Visao de producao', match: ['/admin/kds/tv'] },
    ],
  },
  {
    href: '/admin/cash',
    label: 'Caixa',
    description: 'Abertura, sangria e fechamento',
    icon: 'CX',
    section: 'Operacao',
    match: ['/admin/cash'],
    children: [
      { href: '/admin/cash', label: 'Operacoes do Caixa', description: 'Movimentos e caixas anteriores', match: ['/admin/cash'] },
    ],
  },
  {
    href: '/admin/logistics',
    label: 'Delivery',
    description: 'Entregas, rotas e regioes',
    icon: 'DL',
    section: 'Operacao',
    match: ['/admin/logistics', '/admin/delivery-zones'],
    children: [
      { href: '/admin/logistics', label: 'Entregadores', description: 'Equipe, status e historico', match: ['/admin/logistics'] },
      { href: '/admin/delivery-zones', label: 'Areas de Entrega', description: 'Mapa, bairros, taxas e prazos', match: ['/admin/delivery-zones'] },
    ],
  },
  {
    href: '/admin/reports?view=dashboard',
    label: 'Desempenho',
    description: 'Analise das vendas',
    icon: 'DE',
    section: 'Gestao',
    match: ['/admin/reports'],
    children: [
      { href: '/admin/reports?view=dashboard', label: 'Dashboard de Performance', description: 'Indicadores executivos', match: ['/admin/reports'], matchQuery: { view: ['', 'dashboard', 'executive'] } },
      { href: '/admin/reports?view=sales', label: 'Analise das vendas', description: 'Periodo, canal, produto e ticket', match: ['/admin/reports'], matchQuery: { view: 'sales' } },
      { href: '/admin/reports?view=operations', label: 'Operacional', description: 'Status, picos e atrasos', match: ['/admin/reports'], matchQuery: { view: 'operations' } },
      { href: '/admin/reports?view=menu', label: 'Eng Cardapio', description: 'Margem, CMV e mix', match: ['/admin/reports'], matchQuery: { view: 'menu' } },
      { href: '/admin/reports?view=abc-stock', label: 'ABC Insumos', description: 'Curva ABC de compras', match: ['/admin/reports'], matchQuery: { view: 'abc-stock' } },
      { href: '/admin/reports?view=abc-products', label: 'ABC Pratos', description: 'Curva ABC de vendas', match: ['/admin/reports'], matchQuery: { view: 'abc-products' } },
    ],
  },
  {
    href: '/admin/menu?tab=products',
    label: 'Catalogo',
    description: 'Produtos e complementos',
    icon: 'CA',
    section: 'Gestao',
    match: ['/admin/menu', '/delivery'],
    children: [
      { href: '/admin/menu?tab=products', label: 'Produtos', description: 'Cadastro e precos', match: ['/admin/menu'], matchQuery: { tab: ['', 'products'] } },
      { href: '/admin/menu?tab=categories', label: 'Categorias', description: 'Ordenacao e grupos', match: ['/admin/menu'], matchQuery: { tab: 'categories' } },
      { href: '/admin/menu?tab=addons', label: 'Complementos', description: 'Adicionais e grupos', match: ['/admin/menu'], matchQuery: { tab: 'addons' } },
      { href: '/admin/menu?tab=combos', label: 'Opcoes', description: 'Combos e variacoes', match: ['/admin/menu'], matchQuery: { tab: 'combos' } },
      { href: '/admin/menu?tab=audit', label: 'Filtros avancados', description: 'Auditoria e saneamento', match: ['/admin/menu'], matchQuery: { tab: 'audit' } },
      { href: '/delivery', label: 'Cardapio Online', description: 'Experiencia do cliente', external: true, match: ['/delivery'] },
    ],
  },
  {
    href: '/admin/stock?section=alerts',
    label: 'Estoque',
    description: 'Estoque, compras e producao',
    icon: 'ES',
    section: 'Gestao',
    match: ['/admin/stock', '/admin/procurement', '/admin/production', '/admin/technical-sheet'],
    children: [
      { href: '/admin/stock?section=alerts', label: 'Alerta de Ruptura', description: 'Itens criticos', match: ['/admin/stock'], matchQuery: { section: ['', 'alerts'] } },
      { href: '/admin/stock?section=purchasing', label: 'Compra Sugerida', description: 'Cobertura de insumos', match: ['/admin/stock'], matchQuery: { section: 'purchasing' } },
      { href: '/admin/stock?section=sanity', label: 'Saneamento', description: 'Cardapio e estoque', match: ['/admin/stock'], matchQuery: { section: 'sanity' } },
      { href: '/admin/stock?section=products', label: 'Produtos', description: 'Saldo por produto', match: ['/admin/stock'], matchQuery: { section: 'products' } },
      { href: '/admin/stock?section=ingredients', label: 'Insumos', description: 'Cadastro e custo base', match: ['/admin/stock'], matchQuery: { section: 'ingredients' } },
      { href: '/admin/procurement', label: 'Compras e Fornecedores', description: 'Notas, pedidos e entradas', match: ['/admin/procurement'] },
      { href: '/admin/production', label: 'Producao Interna', description: 'Receitas de insumos', match: ['/admin/production'] },
      { href: '/admin/technical-sheet', label: 'Ficha Tecnica', description: 'Composicao dos produtos', match: ['/admin/technical-sheet'] },
    ],
  },
  {
    href: '/admin/finance?tab=accounts',
    label: 'Financeiro',
    description: 'Lancamentos, caixa e DRE',
    icon: 'FN',
    section: 'Gestao',
    match: ['/admin/finance', '/admin/payments'],
    children: [
      { href: '/admin/finance?tab=accounts', label: 'Lancamentos', description: 'Pagar, receber e todos', match: ['/admin/finance'], matchQuery: { tab: 'accounts' } },
      { href: '/admin/finance?tab=cashflow', label: 'Fluxo de Caixa', description: 'Tabela, grafico e calendario', match: ['/admin/finance'], matchQuery: { tab: 'cashflow' } },
      { href: '/admin/finance?tab=summary', label: 'Analise Financeira', description: 'Pagamentos e recebimentos', match: ['/admin/finance'], matchQuery: { tab: ['', 'summary', 'dre', 'cmv', 'reconciliation', 'exports'] } },
      { href: '/admin/finance?tab=settings', label: 'Configuracoes', description: 'Contas, categorias e centros', match: ['/admin/finance'], matchQuery: { tab: 'settings' } },
      { href: '/admin/payments', label: 'Formas de Pagamento', description: 'PIX, cartoes e vouchers', match: ['/admin/payments'] },
    ],
  },
  {
    href: '/admin/crm',
    label: 'Relacionamento',
    description: 'Cupons, fidelidade e clientes',
    icon: 'RM',
    section: 'Gestao',
    match: ['/admin/crm', '/admin/coupons', '/admin/promotions', '/admin/notifications'],
    children: [
      { href: '/admin/coupons', label: 'Cupons e Descontos', description: 'Regras e validacao', match: ['/admin/coupons'] },
      { href: '/admin/crm', label: 'Fidelidade', description: 'Clientes, historico e cashback mock', match: ['/admin/crm'] },
      { href: '/admin/promotions', label: 'Promocoes', description: 'Campanhas locais', match: ['/admin/promotions'] },
      { href: '/admin/notifications', label: 'Notificacoes', description: 'Eventos internos', match: ['/admin/notifications'] },
    ],
  },
  {
    href: '/admin/settings',
    label: 'Minha Empresa',
    description: 'Loja, dados e assinatura',
    icon: 'ME',
    section: 'Administracao',
    match: ['/admin/settings', '/admin/billing', '/admin/context', '/admin/modules'],
    children: [
      { href: '/admin/settings', label: 'Configuracoes', description: 'Loja, filial, horarios e canais', match: ['/admin/settings'] },
      { href: '/admin/billing', label: 'Assinatura e Cobranca', description: 'Plano e limites', match: ['/admin/billing'] },
      { href: '/admin/modules', label: 'Modulos', description: 'Habilitacao por empresa', match: ['/admin/modules'] },
      { href: '/admin/context', label: 'Contexto', description: 'Empresa, filial e perfil', match: ['/admin/context'] },
    ],
  },
  {
    href: '/admin/users',
    label: 'Administrativo',
    description: 'Usuarios e permissoes',
    icon: 'AD',
    section: 'Administracao',
    match: ['/admin', '/admin/users'],
    children: [
      { href: '/admin', label: 'Inicio', description: 'Configuracoes gerais', match: ['/admin'] },
      { href: '/admin/users', label: 'Usuarios', description: 'Perfis e permissoes', match: ['/admin/users'] },
    ],
  },
];

function hrefPath(href: string) {
  return href.split('?')[0].split('#')[0];
}

function queryMatches(searchParams: SearchReader, matchQuery?: QueryMatch) {
  if (!matchQuery) return true;
  return Object.entries(matchQuery).every(([key, expected]) => {
    const current = searchParams.get(key) ?? '';
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return expectedValues.includes(current);
  });
}

function pathMatches(pathname: string, matches: string[]) {
  return matches.some((match) => (match === '/admin' ? pathname === '/admin' : pathname === match || pathname.startsWith(`${match}/`)));
}

function childMatches(pathname: string, searchParams: SearchReader, child: NonNullable<NavItem['children']>[number]) {
  const matches = child.match ?? [hrefPath(child.href)];
  return pathMatches(pathname, matches) && queryMatches(searchParams, child.matchQuery);
}

function isPathActive(pathname: string, searchParams: SearchReader, item: NavItem) {
  if (item.disabled) return false;
  const matches = item.match ?? [hrefPath(item.href)];
  const ownPathMatch = item.href === '/admin' ? pathname === '/admin' : pathMatches(pathname, matches);
  return (ownPathMatch && queryMatches(searchParams, item.matchQuery)) || Boolean(item.children?.some((child) => childMatches(pathname, searchParams, child)));
}

function getPageLabel(pathname: string, searchParams: SearchReader) {
  const active = NAV_ITEMS.find((item) => isPathActive(pathname, searchParams, item));
  const activeChild = active?.children?.find((child) => childMatches(pathname, searchParams, child));
  return active && activeChild ? `${active.label} / ${activeChild.label}` : active?.label ?? 'Painel';
}

function getContextActions(pathname: string, searchParams: SearchReader): ContextAction[] {
  if (pathname.startsWith('/admin/technical-sheet')) {
    return [{ href: '/admin/technical-sheet', label: 'Cadastro de Ficha Tecnica' }];
  }
  if (pathname.startsWith('/admin/menu')) {
    const tab = searchParams.get('tab') ?? 'products';
    if (tab === 'categories') return [{ href: '/admin/menu?tab=categories', label: 'Cadastro de Categoria' }];
    if (tab === 'addons') return [{ href: '/admin/menu?tab=addons', label: 'Cadastro de Complemento' }];
    if (tab === 'audit') return [{ href: '/admin/menu?tab=audit', label: 'Filtros Avancados' }];
    return [
      { href: '/admin/menu?tab=products', label: 'Cadastro de Produto' },
      { href: '/admin/menu?tab=categories', label: 'Cadastro de Categoria' },
    ];
  }
  if (pathname.startsWith('/admin/procurement')) {
    return [
      { href: '/admin/procurement#compras', label: 'Lancamento de Compras' },
      { href: '/admin/procurement#fornecedores', label: 'Cadastro de Fornecedores' },
    ];
  }
  if (pathname.startsWith('/admin/stock')) {
    const section = searchParams.get('section') ?? 'alerts';
    return [{ href: section === 'ingredients' ? '/admin/stock?section=ingredients' : '/admin/stock?section=products', label: section === 'ingredients' ? 'Cadastro de Insumo' : 'Cadastro de Estoque' }];
  }
  if (pathname.startsWith('/admin/logistics') || pathname.startsWith('/admin/delivery-zones')) {
    return [
      { href: '/admin/logistics', label: 'Entregadores' },
      { href: '/admin/delivery-zones', label: 'Areas de Entrega' },
    ];
  }
  if (pathname.startsWith('/admin/finance')) {
    return [
      { href: '/admin/finance?tab=accounts', label: 'Lancamentos' },
      { href: '/admin/finance?tab=cashflow', label: 'Fluxo de Caixa' },
      { href: '/admin/payments', label: 'Formas de Pagamento' },
    ];
  }
  if (pathname.startsWith('/admin/crm') || pathname.startsWith('/admin/coupons') || pathname.startsWith('/admin/promotions') || pathname.startsWith('/admin/notifications')) {
    return [
      { href: '/admin/crm', label: 'Clientes' },
      { href: '/admin/coupons', label: 'Cupons' },
      { href: '/admin/notifications', label: 'Notificacoes' },
    ];
  }
  if (pathname.startsWith('/admin/production')) {
    return [{ href: '/admin/production', label: 'Cadastro de Receita' }];
  }
  if (pathname.startsWith('/admin/reports')) return [];
  if (pathname.startsWith('/admin/orders')) {
    return [{ href: '/admin/pdv', label: 'Novo Pedido' }];
  }
  if (pathname.startsWith('/admin/cash')) {
    return [{ href: '/admin/cash', label: 'Movimento de Caixa' }];
  }
  if (pathname.startsWith('/admin/settings')) {
    return [{ href: '/admin/settings', label: 'Minha Empresa' }];
  }
  if (pathname === '/admin') return [];
  return [];
}

function StableSmall({ text }: { text: string }) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== text) {
      ref.current.textContent = text;
    }
  }, [text]);

  return <small ref={ref} suppressHydrationWarning translate="no" />;
}

function StableSpan({ className, text }: { className?: string; text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== text) {
      ref.current.textContent = text;
    }
  }, [text]);

  return <span className={className} ref={ref} suppressHydrationWarning translate="no" />;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [userLabel, setUserLabel] = useState('Usuario');
  const companyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const branchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID ?? 'branch-demo';

  const session = mounted ? getAuthSession() : null;
  const tokenContext = useMemo(() => {
    if (!session?.accessToken) return { companyId, branchId, role: 'admin' };
    const payload = readJwtPayload(session.accessToken);
    return {
      companyId: String(payload?.companyId ?? companyId),
      branchId: String(payload?.branchId ?? branchId),
      role: String(payload?.role ?? 'admin'),
    };
  }, [branchId, companyId, session?.accessToken]);

  useEffect(() => {
    setMounted(true);
    setIsEmbedded(window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1');
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      const settingsHeaders = {
        companyId: tokenContext.companyId,
        ...(tokenContext.branchId ? { branchId: tokenContext.branchId } : {}),
      };
      const [me, settings] = await Promise.all([
        apiFetch<CurrentUserResponse>('/v2/auth/me', { method: 'GET' }).catch(() => null),
        getCompanySettings(settingsHeaders).catch(() => null),
      ]);
      if (cancelled) return;
      const resolvedUser = me?.name || me?.email || me?.role || tokenContext.role;
      setUserLabel(String(resolvedUser));
      setStoreName(settings?.publicTitle || settings?.deliveryStoreName || settings?.tradeName || 'MenuHub');
    }

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [tokenContext]);

  if (isEmbedded) return <>{children}</>;

  const pageLabel = getPageLabel(pathname, searchParams);
  const contextActions = getContextActions(pathname, searchParams);
  const contextLabel = `Empresa: ${tokenContext.companyId} | Filial: ${tokenContext.branchId || '-'} | Perfil: ${tokenContext.role}`;

  return (
    <div className={styles.shell} data-admin-shell="true" translate="no">
      <aside className={styles.sidebar} data-admin-sidebar="true">
        <div className={`${styles.brand} ${styles.brandStatic}`.trim()} aria-label="Sistema de Gestao">
          <span className={styles.brandMark}>MH</span>
          <span>
            <strong>Sistema de Gestao</strong>
            <small>Controle operacional</small>
          </span>
        </div>

        <nav className={styles.nav} aria-label="Menu principal">
          {NAV_SECTION_ORDER.map((section) => {
            const items = NAV_ITEMS.filter((item) => item.section === section);
            return (
              <div key={section} className={styles.navSection}>
                <span className={styles.navSectionTitle}>{section}</span>
                {items.map((item) => {
                  const active = isPathActive(pathname, searchParams, item);
                  return (
                    <div key={item.label} className={styles.navGroup}>
                      {item.disabled ? (
                        <button
                          type="button"
                          className={`${styles.navLink} ${styles.navLinkDisabled}`.trim()}
                          aria-disabled="true"
                        >
                          <span className={styles.navIcon}>{item.icon}</span>
                          <span className={styles.navText}>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          target={item.external ? '_blank' : undefined}
                          rel={item.external ? 'noopener noreferrer' : undefined}
                          className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`.trim()}
                        >
                          <span className={styles.navIcon}>{item.icon}</span>
                          <span className={styles.navText}>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </Link>
                      )}
                      {active && item.children?.length ? (
                        <div className={styles.subNav} aria-label={`Submenus de ${item.label}`}>
                          {item.children.map((child) => {
                            const childActive = childMatches(pathname, searchParams, child);
                            return (
                              <Link
                                key={`${item.label}-${child.label}`}
                                href={child.href}
                                target={child.external ? '_blank' : undefined}
                                rel={child.external ? 'noopener noreferrer' : undefined}
                                className={`${styles.subNavLink} ${childActive ? styles.subNavLinkActive : ''}`.trim()}
                              >
                                <strong>{child.label}</strong>
                                {child.description ? <small>{child.description}</small> : null}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          className={styles.logout}
          onClick={() => {
            const confirmed = window.confirm('Deseja realmente sair do sistema?');
            if (!confirmed) return;
            void logoutCurrentSession();
            window.location.href = '/';
          }}
        >
          Sair
        </button>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar} data-admin-topbar="true">
          <div className={styles.topbarTitle}>
            <span>Aplicativo local com banco DEV</span>
            <strong>SISTEMA DE GESTAO</strong>
            <StableSmall text={`${storeName} | ${pageLabel}`} />
          </div>
          <div className={styles.topbarActions}>
            <StableSpan className={styles.userBadge} text={`Usuario: ${userLabel}`} />
            {contextActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noopener noreferrer' : undefined}
                className={styles.contextButton}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </header>
        <div className={styles.contextBar}>{contextLabel}</div>
        <div className={styles.content}>{children}</div>
      </section>
    </div>
  );
}
