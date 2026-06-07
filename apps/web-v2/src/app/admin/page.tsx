'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  getBranchSettings,
  getCompanySettings,
  patchBranchSettings,
  patchCompanySettings,
  type BranchSettingsResponse,
  type CompanySettingsResponse,
  type SettingsHeaders,
} from '@/features/settings/settings.api';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminBranches,
  listAdminRoles,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
  type AdminBranch,
  type AdminRole,
  type AdminUser,
} from '@/features/admin-users/admin-users.api';
import { readJwtPayload } from '@/lib/auth-claims';
import { getAuthSession } from '@/lib/auth-session';
import styles from './page.module.css';

type CompanyForm = {
  tradeName: string;
  legalName: string;
  email: string;
  phone: string;
  responsible: string;
  operationType: string;
  referenceMonth: string;
  kitchenCmvGoal: string;
  barCmvGoal: string;
  address: string;
};

type UserForm = {
  id: string;
  name: string;
  email: string;
  profile: string;
  password: string;
  isActive: boolean;
};

type AdminPageHeaders = SettingsHeaders & {
  userRole?: 'admin' | 'master' | 'developer';
};

const INITIAL_COMPANY_FORM: CompanyForm = {
  tradeName: '',
  legalName: '',
  email: '',
  phone: '',
  responsible: '',
  operationType: '',
  referenceMonth: '',
  kitchenCmvGoal: '',
  barCmvGoal: '',
  address: '',
};

const INITIAL_USER_FORM: UserForm = {
  id: '',
  name: '',
  email: '',
  profile: '',
  password: '',
  isActive: true,
};

function resolveHeaders(): AdminPageHeaders {
  const fallbackCompanyId = process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo';
  const fallbackBranchId = process.env.NEXT_PUBLIC_MOCK_BRANCH_ID ?? 'branch-demo';
  const session = getAuthSession();
  if (!session?.accessToken) {
    return { companyId: fallbackCompanyId, branchId: fallbackBranchId };
  }
  const payload = readJwtPayload(session.accessToken);
  const role = String(payload?.role ?? 'admin');
  return {
    companyId: String(payload?.companyId ?? fallbackCompanyId),
    branchId: String(payload?.branchId ?? fallbackBranchId),
    userRole: role === 'master' || role === 'developer' ? role : 'admin',
  };
}

function companyFormFromSettings(company: CompanySettingsResponse | null, branch: BranchSettingsResponse | null): CompanyForm {
  const address = [branch?.street, branch?.number, branch?.district, branch?.city, branch?.state]
    .filter(Boolean)
    .join(', ');
  return {
    tradeName: company?.tradeName ?? '',
    legalName: company?.legalName ?? '',
    email: company?.email ?? branch?.email ?? '',
    phone: company?.phone ?? branch?.phone ?? '',
    responsible: branch?.responsible ?? '',
    operationType: company?.publicDescription ?? '',
    referenceMonth: new Date().toISOString().slice(0, 7),
    kitchenCmvGoal: '',
    barCmvGoal: '',
    address,
  };
}

function userFormFromUser(user: AdminUser): UserForm {
  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email ?? '',
    profile: user.roles[0]?.id ?? '',
    password: '',
    isActive: user.isActive,
  };
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminRootPage() {
  const [headers, setHeaders] = useState<AdminPageHeaders | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(INITIAL_COMPANY_FORM);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [userForm, setUserForm] = useState<UserForm>(INITIAL_USER_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultRoleId = useMemo(() => roles[0]?.id ?? '', [roles]);
  const defaultBranchId = useMemo(() => branches[0]?.id ?? headers?.branchId ?? null, [branches, headers?.branchId]);

  async function load() {
    const resolvedHeaders = resolveHeaders();
    setHeaders(resolvedHeaders);
    setLoading(true);
    setError(null);
    try {
      const [company, branch, usersData, rolesData, branchesData] = await Promise.all([
        getCompanySettings(resolvedHeaders).catch(() => null),
        getBranchSettings(resolvedHeaders).catch(() => null),
        listAdminUsers(resolvedHeaders).catch(() => ({ items: [], total: 0 })),
        listAdminRoles(resolvedHeaders).catch(() => ({ items: [], total: 0 })),
        listAdminBranches(resolvedHeaders).catch(() => ({ items: [], total: 0 })),
      ]);
      setCompanyForm(companyFormFromSettings(company, branch));
      setUsers(usersData.items ?? []);
      setRoles(rolesData.items ?? []);
      setBranches(branchesData.items ?? []);
      setUserForm((prev) => ({ ...prev, profile: prev.profile || rolesData.items?.[0]?.id || '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Inicio.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSaveCompany() {
    if (!headers) return;
    setSaving('company');
    setError(null);
    setMessage(null);
    try {
      await patchCompanySettings(headers, {
        tradeName: companyForm.tradeName,
        legalName: companyForm.legalName,
        email: companyForm.email,
        phone: companyForm.phone,
        publicDescription: companyForm.operationType,
      });
      await patchBranchSettings(headers, {
        responsible: companyForm.responsible,
      });
      setMessage('Empresa salva.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar empresa.');
    } finally {
      setSaving(null);
    }
  }

  async function onSaveUser() {
    if (!headers) return;
    if (!userForm.name.trim()) {
      setError('Informe o nome do usuario.');
      return;
    }
    if (!userForm.id && !userForm.password.trim()) {
      setError('Informe uma senha para novo usuario.');
      return;
    }
    setSaving('user');
    setError(null);
    setMessage(null);
    try {
      if (userForm.id) {
        await updateAdminUser(headers, userForm.id, {
          name: userForm.name,
          email: userForm.email || null,
          password: userForm.password || undefined,
          isActive: userForm.isActive,
        });
        await updateAdminUserStatus(headers, userForm.id, userForm.isActive);
      } else {
        await createAdminUser(headers, {
          name: userForm.name,
          email: userForm.email || null,
          password: userForm.password,
          isActive: userForm.isActive,
          roleIds: [userForm.profile || defaultRoleId].filter(Boolean),
          branchIds: defaultBranchId ? [defaultBranchId] : [],
          defaultBranchId,
        });
      }
      setUserForm({ ...INITIAL_USER_FORM, profile: defaultRoleId });
      setMessage('Usuario salvo.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar usuario.');
    } finally {
      setSaving(null);
    }
  }

  async function onDeleteUser() {
    if (!headers || !userForm.id) return;
    const confirmed = window.confirm('Excluir este usuario?');
    if (!confirmed) return;
    setSaving('user-delete');
    setError(null);
    setMessage(null);
    try {
      await deleteAdminUser(headers, userForm.id);
      setUserForm({ ...INITIAL_USER_FORM, profile: defaultRoleId });
      setMessage('Usuario excluido.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir usuario.');
    } finally {
      setSaving(null);
    }
  }

  function confirmCleanup(label: string) {
    const confirmed = window.confirm(`${label}: esta rotina exige bloco controlado para preservar historico fiscal e financeiro. Deseja apenas registrar a solicitacao?`);
    if (confirmed) setMessage(`${label} registrada para execucao controlada.`);
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Carregando configuracoes..." />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.dataPanel}>
        <header className={styles.panelHeader}>
          <div>
            <span>Inicio</span>
            <h1>Configuracoes</h1>
          </div>
          <strong>SISTEMA DE GESTAO</strong>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? <div className={styles.success}>{message}</div> : null}

        <section className={styles.sectionBlock}>
          <div className={styles.sectionTitle}>
            <h2>Cadastro da Empresa</h2>
            <p>Dados principais usados em cardapio, compras, estoque e relatorios.</p>
          </div>
          <div className={styles.formGrid}>
            <label>
              Nome do estabelecimento
              <Input value={companyForm.tradeName} onChange={(e) => setCompanyForm((p) => ({ ...p, tradeName: e.target.value }))} />
            </label>
            <label>
              Responsavel / Consultor
              <Input value={companyForm.responsible} onChange={(e) => setCompanyForm((p) => ({ ...p, responsible: e.target.value }))} />
            </label>
            <label>
              Tipo de operacao
              <Input value={companyForm.operationType} onChange={(e) => setCompanyForm((p) => ({ ...p, operationType: e.target.value }))} />
            </label>
            <label>
              Mes / Ano de referencia
              <Input type="month" value={companyForm.referenceMonth} onChange={(e) => setCompanyForm((p) => ({ ...p, referenceMonth: e.target.value }))} />
            </label>
            <label>
              Meta CMV Cozinha
              <Input value={companyForm.kitchenCmvGoal} onChange={(e) => setCompanyForm((p) => ({ ...p, kitchenCmvGoal: e.target.value }))} placeholder="Ex.: 32%" />
            </label>
            <label>
              Meta CMV Bar
              <Input value={companyForm.barCmvGoal} onChange={(e) => setCompanyForm((p) => ({ ...p, barCmvGoal: e.target.value }))} placeholder="Ex.: 28%" />
            </label>
            <label className={styles.wide}>
              Endereco
              <Input value={companyForm.address} onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))} />
            </label>
          </div>
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => void onSaveCompany()} disabled={saving === 'company'}>
              {saving === 'company' ? 'Salvando...' : 'Salvar Empresa'}
            </Button>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionTitle}>
            <h2>Importacoes</h2>
            <p>Atalhos para entrada de produtos, insumos e vendas historicas.</p>
          </div>
          <div className={styles.importGrid}>
            <Link href="/admin/menu?tab=import">Importar Produtos</Link>
            <Link href="/admin/stock?section=ingredients">Importar Insumos</Link>
            <Link href="/admin/reports?view=imports">Importar Vendas</Link>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionTitle}>
            <h2>Configuracao de Usuarios</h2>
            <p>Cadastro e manutencao dos acessos internos.</p>
          </div>
          <div className={styles.usersGrid}>
            <div className={styles.tableWrap}>
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Login</th>
                    <th>Perfil</th>
                    <th>Ativo</th>
                    <th>Ultimo login</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Nenhum usuario cadastrado.</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id.slice(0, 8)}</td>
                        <td>
                          <button type="button" className={styles.cellLink} onClick={() => setUserForm(userFormFromUser(user))}>
                            {user.name || 'Abrir usuario'}
                          </button>
                        </td>
                        <td>{user.email || '-'}</td>
                        <td>{user.roles.map((role) => role.name).join(', ') || '-'}</td>
                        <td>{user.isActive ? 'Sim' : 'Nao'}</td>
                        <td>{formatDate(user.lastLoginAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.userForm}>
              <label>
                ID
                <Input value={userForm.id || 'Automatico'} disabled />
              </label>
              <label>
                Nome
                <Input value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label>
                Login/e-mail
                <Input value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
              </label>
              <label>
                Perfil
                <select value={userForm.profile} onChange={(e) => setUserForm((p) => ({ ...p, profile: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Senha
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} />
              </label>
              <label>
                Ativo
                <select value={userForm.isActive ? 'yes' : 'no'} onChange={(e) => setUserForm((p) => ({ ...p, isActive: e.target.value === 'yes' }))}>
                  <option value="yes">Sim</option>
                  <option value="no">Nao</option>
                </select>
              </label>
              <div className={styles.actions}>
                <Button onClick={() => setUserForm({ ...INITIAL_USER_FORM, profile: defaultRoleId })}>Novo Usuario</Button>
                {userForm.id ? (
                  <Button variant="danger" onClick={() => void onDeleteUser()} disabled={saving === 'user-delete'}>
                    Excluir Usuario
                  </Button>
                ) : null}
                <Button variant="primary" onClick={() => void onSaveUser()} disabled={saving === 'user'}>
                  {saving === 'user' ? 'Salvando...' : 'Salvar Usuario'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionTitle}>
            <h2>Limpeza de Movimentacoes</h2>
            <p>Rotinas sensiveis ficam protegidas por confirmacao e devem ser executadas em bloco controlado.</p>
          </div>
          <div className={styles.cleanupGrid}>
            {['Limpeza estoque', 'Limpeza Compras', 'Limpeza de Vendas', 'Limpeza de Produto', 'Limpeza de Insumo'].map((label) => (
              <button key={label} type="button" onClick={() => confirmCleanup(label)}>
                {label}
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
