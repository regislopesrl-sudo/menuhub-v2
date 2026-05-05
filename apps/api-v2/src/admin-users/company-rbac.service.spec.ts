import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyRbacService } from './company-rbac.service';

describe('CompanyRbacService', () => {
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
  };

  function repositoryMock() {
    return {
      syncPermissionCatalogFromGlobalPermissions: jest.fn().mockResolvedValue(undefined),
      listGlobalRoles: jest.fn().mockResolvedValue([]),
      listCompanyRoles: jest.fn().mockResolvedValue([]),
      listCompanyPermissions: jest.fn().mockResolvedValue([]),
      findCompanyPermissionsByIds: jest.fn().mockResolvedValue([]),
      createCompanyRole: jest.fn(),
      findCompanyRoleById: jest.fn().mockResolvedValue(null),
      updateCompanyRole: jest.fn(),
      deleteCompanyRole: jest.fn(),
      findGlobalRolesByIds: jest.fn().mockResolvedValue([]),
      findCompanyRolesByIds: jest.fn().mockResolvedValue([]),
      replaceUserRoles: jest.fn().mockResolvedValue(undefined),
      removeCompanyUserRole: jest.fn().mockResolvedValue(undefined),
      getUserEffectiveAccess: jest.fn().mockResolvedValue(null),
    } as any;
  }

  it('retorna vazio para usuario sem roles', async () => {
    const repository = repositoryMock();
    const service = new CompanyRbacService(repository);

    const result = await service.getEffectivePermissionsForUser('company_a', 'user_1');

    expect(result.permissions).toEqual([]);
    expect(result.globalRoles).toEqual([]);
    expect(result.companyRoles).toEqual([]);
  });

  it('acumula permissoes globais e custom da empresa', async () => {
    const repository = repositoryMock();
    repository.getUserEffectiveAccess.mockResolvedValue({
      roles: [
        {
          role: {
            id: 'role_global',
            name: 'Admin',
            permissions: [{ permission: { id: 'p1', code: 'orders.manage', description: null } }],
          },
        },
      ],
      companyUserRoles: [
        {
          role: {
            id: 'role_company',
            key: 'menu.editor',
            name: 'Menu Editor',
            permissions: [{ permission: { id: 'p2', key: 'menu.update', description: null } }],
          },
        },
      ],
    });
    const service = new CompanyRbacService(repository);

    const result = await service.getEffectivePermissionsForUser('company_a', 'user_1');

    expect(result.permissions.map((item) => item.key)).toEqual(['menu.update', 'orders.manage']);
  });

  it('bloqueia uso de role de outra empresa ao atribuir', async () => {
    const repository = repositoryMock();
    repository.findGlobalRolesByIds.mockResolvedValue([]);
    repository.findCompanyRolesByIds.mockResolvedValue([]);
    const service = new CompanyRbacService(repository);

    await expect(service.resolveRoleAssignment(ctx, ['role_foreign'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia editar role system', async () => {
    const repository = repositoryMock();
    repository.findCompanyRoleById.mockResolvedValue({
      id: 'role_1',
      companyId: 'company_a',
      key: 'system.admin',
      name: 'System',
      isSystem: true,
      permissions: [],
    });
    const service = new CompanyRbacService(repository);

    await expect(service.updateRole(ctx, 'role_1', { name: 'Novo' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia remover role system', async () => {
    const repository = repositoryMock();
    repository.findCompanyRoleById.mockResolvedValue({
      id: 'role_1',
      companyId: 'company_a',
      key: 'system.admin',
      name: 'System',
      isSystem: true,
      permissions: [],
    });
    const service = new CompanyRbacService(repository);

    await expect(service.deleteRole(ctx, 'role_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('falha ao remover role inexistente da empresa', async () => {
    const repository = repositoryMock();
    const service = new CompanyRbacService(repository);

    await expect(service.removeRoleFromUser(ctx, 'user_1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('nega permissao ausente', async () => {
    const repository = repositoryMock();
    const service = new CompanyRbacService(repository);

    await expect(
      service.assertUserHasPermission('company_a', 'user_1', 'orders.manage'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

