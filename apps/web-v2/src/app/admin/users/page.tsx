'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useModuleAccess } from '@/features/modules/use-module-access';
import { ModuleDisabled } from '@/components/module-disabled';
import {
  assignAdminUserBranches,
  assignAdminUserRoles,
  createAdminUser,
  deleteAdminUser,
  listAdminBranches,
  listAdminPermissions,
  listAdminRoles,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
  type AdminBranch,
  type AdminPermission,
  type AdminRole,
  type AdminUser,
  type AdminUsersHeaders,
} from '@/features/admin-users/admin-users.api';

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  isActive: boolean;
  roleIds: string[];
  branchIds: string[];
  defaultBranchId: string | null;
};

const EMPTY_FORM: UserFormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
  isActive: true,
  roleIds: [],
  branchIds: [],
  defaultBranchId: null,
};

export default function AdminUsersPage() {
  const headers = useMemo<AdminUsersHeaders>(
    () => ({
      companyId: process.env.NEXT_PUBLIC_MOCK_COMPANY_ID ?? 'company-demo',
      branchId: process.env.NEXT_PUBLIC_MOCK_BRANCH_ID,
      userRole: 'admin',
    }),
    [],
  );
  const access = useModuleAccess(
    { companyId: headers.companyId, branchId: headers.branchId, userRole: 'admin' },
    'admin_panel',
  );

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? user.isActive : !user.isActive);
      const matchesQuery =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.roles.some((role) => role.name.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, users]);

  const stats = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive).length;
    const inactiveUsers = users.length - activeUsers;
    const defaultBranchUsers = users.filter((user) => user.defaultBranchId).length;
    const roleCoverage = new Set(users.flatMap((user) => user.roles.map((role) => role.id))).size;
    return { activeUsers, inactiveUsers, defaultBranchUsers, roleCoverage };
  }, [users]);

  useEffect(() => {
    if (access.loading || !access.allowed) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersResponse, rolesResponse, permissionsResponse, branchesResponse] = await Promise.all([
          listAdminUsers(headers),
          listAdminRoles(headers),
          listAdminPermissions(headers),
          listAdminBranches(headers),
        ]);
        if (!active) return;
        setUsers(usersResponse.items);
        setRoles(rolesResponse.items);
        setPermissions(permissionsResponse.items);
        setBranches(branchesResponse.items);
        setSelectedUserId((current) => current ?? usersResponse.items[0]?.id ?? null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar usuarios e permissoes.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [access.allowed, access.loading, headers]);

  if (access.loading) {
    return <main className={styles.page}><LoadingState label="Validando acesso ao painel..." /></main>;
  }

  if (!access.allowed) {
    return <ModuleDisabled moduleName="Usuarios e Permissoes" reason={access.error ?? 'Acesso administrativo indisponivel.'} />;
  }

  const openCreateModal = () => {
    setForm({
      ...EMPTY_FORM,
      branchIds: headers.branchId ? [headers.branchId] : branches[0] ? [branches[0].id] : [],
      defaultBranchId: headers.branchId ?? branches[0]?.id ?? null,
    });
    setModalOpen(true);
    setSuccess(null);
    setError(null);
  };

  const openEditModal = (user: AdminUser) => {
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      isActive: user.isActive,
      roleIds: user.roles.map((role) => role.id),
      branchIds: user.branches.map((branch) => branch.id),
      defaultBranchId: user.defaultBranchId,
    });
    setModalOpen(true);
    setSuccess(null);
    setError(null);
  };

  const refreshUsers = async (preferredUserId?: string | null) => {
    const response = await listAdminUsers(headers);
    setUsers(response.items);
    setSelectedUserId(preferredUserId ?? response.items[0]?.id ?? null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Nome do usuario e obrigatorio.');
      return;
    }
    if (!form.id && form.password.trim().length < 6) {
      setError('Senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (form.branchIds.length === 0) {
      setError('Selecione ao menos uma filial para o usuario.');
      return;
    }
    if (form.defaultBranchId && !form.branchIds.includes(form.defaultBranchId)) {
      setError('A filial padrao precisa estar entre as filiais permitidas.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let savedUser: AdminUser;
      if (form.id) {
        savedUser = await updateAdminUser(headers, form.id, {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          password: form.password.trim() ? form.password : undefined,
          isActive: form.isActive,
        });
        savedUser = await assignAdminUserRoles(headers, form.id, form.roleIds);
        savedUser = await assignAdminUserBranches(headers, form.id, {
          branchIds: form.branchIds,
          defaultBranchId: form.defaultBranchId,
        });
      } else {
        savedUser = await createAdminUser(headers, {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          password: form.password,
          isActive: form.isActive,
          roleIds: form.roleIds,
          branchIds: form.branchIds,
          defaultBranchId: form.defaultBranchId,
        });
      }

      await refreshUsers(savedUser.id);
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setSuccess(form.id ? 'Usuario atualizado com sucesso.' : 'Usuario criado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUserStatus(headers, user.id, !user.isActive);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedUserId === updated.id) setSelectedUserId(updated.id);
      setSuccess(`Usuario ${updated.isActive ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status do usuario.');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Deseja remover o usuario ${user.name}? O acesso sera desativado.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminUser(headers, user.id);
      await refreshUsers(selectedUserId === user.id ? null : selectedUserId);
      setSuccess('Usuario removido do acesso ativo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover usuario.');
    }
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="Usuarios e Permissoes"
        subtitle="Controle operacional de acessos, roles e filiais da empresa"
        right={
          <div className={styles.headerActions}>
            <Badge tone="success">{users.length} usuarios</Badge>
            <Button variant="primary" onClick={openCreateModal}>Novo usuario</Button>
          </div>
        }
      />

      <section className={styles.heroGrid}>
        <Card className={styles.kpiCard}>
          <span>Usuarios ativos</span>
          <strong>{stats.activeUsers}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Usuarios inativos</span>
          <strong>{stats.inactiveUsers}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Com filial padrao</span>
          <strong>{stats.defaultBranchUsers}</strong>
        </Card>
        <Card className={styles.kpiCard}>
          <span>Roles em uso</span>
          <strong>{stats.roleCoverage}</strong>
        </Card>
      </section>

      <Card className={styles.noticeCard}>
        <div>
          <strong>Escopo atual</strong>
          <p>
            Usuarios agora sao reais no backend, com roles, permissoes efetivas e acesso por filial.
            O catalogo de roles/permissoes continua vindo do schema atual para evitar impacto cross-company.
          </p>
        </div>
        <Link href="/admin/settings" className={styles.noticeLink}>Voltar para Configuracoes</Link>
      </Card>

      {success ? <div className={styles.success}>{success}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? <LoadingState label="Carregando usuarios..." /> : null}

      {!loading ? (
        <div className={styles.layout}>
          <section className={styles.listColumn}>
            <Card className={styles.panel}>
              <div className={styles.toolbar}>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nome, email ou role"
                />
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}>
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </Select>
              </div>

              {visibleUsers.length === 0 ? (
                <EmptyState
                  title="Nenhum usuario encontrado"
                  description="Crie o primeiro usuario operacional ou ajuste os filtros."
                />
              ) : (
                <div className={styles.userList}>
                  {visibleUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`${styles.userRow} ${selectedUserId === user.id ? styles.userRowActive : ''}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div>
                        <div className={styles.userTop}>
                          <strong>{user.name}</strong>
                          <Badge tone={user.isActive ? 'success' : 'warning'}>
                            {user.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <p>{user.email || 'Sem email cadastrado'}</p>
                        <small>
                          {user.roles.map((role) => role.name).join(', ') || 'Sem role atribuida'} |{' '}
                          {user.branches.map((branch) => branch.name).join(', ') || 'Sem filial'}
                        </small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <aside className={styles.detailColumn}>
            <Card className={styles.panel}>
              {!selectedUser ? (
                <EmptyState title="Selecione um usuario" description="Escolha um usuario para ver detalhes, roles e acessos." />
              ) : (
                <>
                  <div className={styles.detailHeader}>
                    <div>
                      <div className={styles.userTop}>
                        <h2>{selectedUser.name}</h2>
                        <Badge tone={selectedUser.isActive ? 'success' : 'warning'}>
                          {selectedUser.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p>{selectedUser.email || 'Sem email cadastrado'}</p>
                    </div>
                    <div className={styles.detailActions}>
                      <Button onClick={() => openEditModal(selectedUser)}>Editar</Button>
                      <Button
                        variant={selectedUser.isActive ? 'danger' : 'primary'}
                        onClick={() => void handleToggleStatus(selectedUser)}
                      >
                        {selectedUser.isActive ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </div>

                  <div className={styles.metaGrid}>
                    <div>
                      <span>Telefone</span>
                      <strong>{selectedUser.phone || '-'}</strong>
                    </div>
                    <div>
                      <span>Ultimo login</span>
                      <strong>{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString('pt-BR') : 'Nunca'}</strong>
                    </div>
                    <div>
                      <span>Criado em</span>
                      <strong>{new Date(selectedUser.createdAt).toLocaleDateString('pt-BR')}</strong>
                    </div>
                    <div>
                      <span>Filial padrao</span>
                      <strong>{selectedUser.branches.find((branch) => branch.isDefault)?.name ?? '-'}</strong>
                    </div>
                  </div>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>
                      <h3>Roles</h3>
                      <Badge>{selectedUser.roles.length}</Badge>
                    </div>
                    <div className={styles.badgeWrap}>
                      {selectedUser.roles.length > 0 ? (
                        selectedUser.roles.map((role) => <Badge key={role.id} tone="default">{role.name}</Badge>)
                      ) : (
                        <span className={styles.placeholderText}>Nenhuma role atribuida.</span>
                      )}
                    </div>
                  </section>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>
                      <h3>Permissoes efetivas</h3>
                      <Badge>{selectedUser.permissions.length}</Badge>
                    </div>
                    <div className={styles.permissionList}>
                      {selectedUser.permissions.length > 0 ? (
                        selectedUser.permissions.map((permission) => (
                          <div key={permission.id} className={styles.permissionRow}>
                            <strong>{permission.code}</strong>
                            <span>{permission.description || 'Permissao sem descricao'}</span>
                          </div>
                        ))
                      ) : (
                        <span className={styles.placeholderText}>Sem permissoes efetivas no momento.</span>
                      )}
                    </div>
                  </section>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>
                      <h3>Filiais permitidas</h3>
                      <Badge>{selectedUser.branches.length}</Badge>
                    </div>
                    <div className={styles.branchList}>
                      {selectedUser.branches.map((branch) => (
                        <div key={branch.id} className={styles.branchRow}>
                          <div>
                            <strong>{branch.name}</strong>
                            <span>{branch.code || 'Sem codigo'}</span>
                          </div>
                          {branch.isDefault ? <Badge tone="success">Padrao</Badge> : <Badge>Permitida</Badge>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>
                      <h3>Catalogo de roles</h3>
                      <Badge>{roles.length}</Badge>
                    </div>
                    <div className={styles.roleCatalog}>
                      {roles.map((role) => (
                        <div key={role.id} className={styles.catalogCard}>
                          <strong>{role.name}</strong>
                          <p>{role.description || 'Role sem descricao'}</p>
                          <small>{role.permissions.map((permission) => permission.code).join(', ') || 'Sem permissoes vinculadas'}</small>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className={styles.footerActions}>
                    <Button variant="danger" onClick={() => void handleDelete(selectedUser)}>
                      Remover acesso
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className={styles.modalBackdrop} onClick={() => !saving && setModalOpen(false)}>
          <Card className={styles.modal} onClick={(event: React.MouseEvent) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{form.id ? 'Editar usuario' : 'Novo usuario'}</h2>
                <p>Controle nome, contato, roles e filiais com acesso operacional.</p>
              </div>
              <Button onClick={() => setModalOpen(false)} disabled={saving}>Fechar</Button>
            </div>

            <div className={styles.formGrid}>
              <Field label="Nome">
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </Field>
              <Field label="Telefone">
                <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </Field>
              <Field label={form.id ? 'Nova senha (opcional)' : 'Senha'}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={form.id ? 'Preencha apenas se quiser trocar' : 'Minimo 6 caracteres'}
                />
              </Field>
              <Field label="Filial padrao">
                <Select
                  value={form.defaultBranchId ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, defaultBranchId: event.target.value || null }))}
                >
                  <option value="">Selecionar</option>
                  {branches.filter((branch) => form.branchIds.includes(branch.id)).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className={styles.switchInline}>
              <label>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>Usuario ativo</span>
              </label>
            </div>

            <section className={styles.pickSection}>
              <div className={styles.sectionTitle}>
                <h3>Roles</h3>
                <Badge>{form.roleIds.length}</Badge>
              </div>
              <div className={styles.choiceGrid}>
                {roles.map((role) => {
                  const checked = form.roleIds.includes(role.id);
                  return (
                    <label key={role.id} className={styles.choiceCard}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            roleIds: checked
                              ? current.roleIds.filter((id) => id !== role.id)
                              : [...current.roleIds, role.id],
                          }))
                        }
                      />
                      <div>
                        <strong>{role.name}</strong>
                        <p>{role.description || 'Role sem descricao'}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className={styles.pickSection}>
              <div className={styles.sectionTitle}>
                <h3>Filiais permitidas</h3>
                <Badge>{form.branchIds.length}</Badge>
              </div>
              <div className={styles.choiceGrid}>
                {branches.map((branch) => {
                  const checked = form.branchIds.includes(branch.id);
                  return (
                    <label key={branch.id} className={styles.choiceCard}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((current) => {
                            const branchIds = checked
                              ? current.branchIds.filter((id) => id !== branch.id)
                              : [...current.branchIds, branch.id];
                            const defaultBranchId =
                              current.defaultBranchId === branch.id && checked
                                ? branchIds[0] ?? null
                                : current.defaultBranchId ?? branchIds[0] ?? null;
                            return { ...current, branchIds, defaultBranchId };
                          })
                        }
                      />
                      <div>
                        <strong>{branch.name}</strong>
                        <p>{branch.code || 'Sem codigo'} {branch.isActive ? '| Ativa' : '| Inativa'}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className={styles.pickSection}>
              <div className={styles.sectionTitle}>
                <h3>Catalogo de permissoes</h3>
                <Badge>{permissions.length}</Badge>
              </div>
              <div className={styles.permissionCatalog}>
                {permissions.map((permission) => (
                  <div key={permission.id} className={styles.permissionChip}>
                    <strong>{permission.code}</strong>
                    <span>{permission.description || 'Permissao sem descricao'}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className={styles.modalActions}>
              <Button onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Salvando...' : form.id ? 'Salvar usuario' : 'Criar usuario'}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
