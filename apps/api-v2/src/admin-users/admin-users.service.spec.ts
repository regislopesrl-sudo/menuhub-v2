import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
  };

  function prismaMock() {
    return {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'branch_a' }]),
      },
      userRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      userBranchAccess: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (actions: Promise<unknown>[]) => Promise.all(actions)),
    } as any;
  }

  function rbacMock() {
    return {
      resolveRoleAssignment: jest.fn().mockResolvedValue({
        globalRoleIds: [],
        companyRoleIds: [],
      }),
      replaceUserRoles: jest.fn().mockResolvedValue(undefined),
      listRoles: jest.fn().mockResolvedValue([]),
      listPermissions: jest.fn().mockResolvedValue([]),
      createRole: jest.fn(),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
      removeRoleFromUser: jest.fn(),
    } as any;
  }

  it('lista usuarios respeitando companyId', async () => {
    const prisma = prismaMock();
    const service = new AdminUsersService(prisma, rbacMock());

    await service.listUsers(ctx);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchAccesses: {
            some: expect.objectContaining({
              branch: { companyId: 'company_a' },
            }),
          },
        }),
      }),
    );
  });

  it('bloqueia perfil user comum', async () => {
    const service = new AdminUsersService(prismaMock(), rbacMock());

    await expect(service.listUsers({ ...ctx, userRole: 'user' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cria usuario com hash, roles e filiais', async () => {
    const prisma = prismaMock();
    const rbac = rbacMock();
    rbac.resolveRoleAssignment.mockResolvedValue({
      globalRoleIds: ['role_admin'],
      companyRoleIds: [],
    });
    prisma.user.create.mockImplementation(async (input: any) => ({
      id: 'user_1',
      name: input.data.name,
      email: input.data.email,
      phone: input.data.phone,
      isActive: input.data.isActive,
      lastLoginAt: null,
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      updatedAt: new Date('2026-05-02T10:00:00.000Z'),
      roles: [
        {
          role: {
            id: 'role_admin',
            name: 'Admin',
            description: 'Administra a operacao',
            permissions: [
              {
                permission: {
                  id: 'perm_manage_orders',
                  code: 'manage.orders',
                  description: 'Gerencia pedidos',
                },
              },
            ],
          },
        },
      ],
      branchAccesses: [
        {
          branchId: 'branch_a',
          isDefault: true,
          branch: {
            id: 'branch_a',
            companyId: 'company_a',
            name: 'Loja Centro',
            code: 'CTR',
          },
        },
      ],
    }));
    const service = new AdminUsersService(prisma, rbac);

    const result = await service.createUser(ctx, {
      name: 'Ana Gestora',
      email: 'ana@menuhub.local',
      password: '123456',
      roleIds: ['role_admin'],
      branchIds: ['branch_a'],
      defaultBranchId: 'branch_a',
    });

    expect(prisma.user.create).toHaveBeenCalled();
    const passwordHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
    expect(passwordHash).toMatch(/^scrypt:/);
    expect(result.roles).toHaveLength(1);
    expect(result.permissions[0].code).toBe('manage.orders');
    expect(result.defaultBranchId).toBe('branch_a');
  });

  it('falha se branch informada nao pertence a empresa', async () => {
    const prisma = prismaMock();
    prisma.branch.findMany.mockResolvedValue([]);
    const service = new AdminUsersService(prisma, rbacMock());

    await expect(
      service.createUser(ctx, {
        name: 'Usuario',
        password: '123456',
        branchIds: ['branch_x'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nao permite ler usuario de outra empresa', async () => {
    const service = new AdminUsersService(prismaMock(), rbacMock());

    await expect(service.getUser('user_other', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atribui roles substituindo relacoes antigas', async () => {
    const prisma = prismaMock();
    const rbac = rbacMock();
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      name: 'Ana',
      email: 'ana@menuhub.local',
      phone: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      updatedAt: new Date('2026-05-02T10:00:00.000Z'),
      roles: [],
      branchAccesses: [
        {
          branchId: 'branch_a',
          isDefault: true,
          branch: { id: 'branch_a', companyId: 'company_a', name: 'Loja Centro', code: 'CTR' },
        },
      ],
    });
    rbac.resolveRoleAssignment.mockResolvedValue({
      globalRoleIds: ['role_manager'],
      companyRoleIds: ['company_role_1'],
    });
    const service = new AdminUsersService(prisma, rbac);

    await service.assignRoles('user_1', ctx, { roleIds: ['role_manager'] });

    expect(rbac.replaceUserRoles).toHaveBeenCalledWith(ctx, 'user_1', {
      globalRoleIds: ['role_manager'],
      companyRoleIds: ['company_role_1'],
    });
  });

  it('soft delete desativa e limpa contato unico', async () => {
    const prisma = prismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: 'user_1',
      name: 'Ana',
      email: 'ana@menuhub.local',
      phone: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      updatedAt: new Date('2026-05-02T10:00:00.000Z'),
      roles: [],
      branchAccesses: [
        {
          branchId: 'branch_a',
          isDefault: true,
          branch: { id: 'branch_a', companyId: 'company_a', name: 'Loja Centro', code: 'CTR' },
        },
      ],
    });
    const service = new AdminUsersService(prisma, rbacMock());

    await service.deleteUser('user_1', ctx);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          isActive: false,
          email: null,
          phone: null,
        }),
      }),
    );
  });
});
