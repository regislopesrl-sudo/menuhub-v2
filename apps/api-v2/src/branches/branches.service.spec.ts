import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';

describe('BranchesService', () => {
  const prisma = {
    branch: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;

  const service = new BranchesService(prisma);
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'manager' as const,
    requestId: 'r1',
    permissions: ['settings.write'],
    source: 'jwt' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista apenas branch do contexto quando branchId presente', async () => {
    prisma.branch.findMany.mockResolvedValueOnce([{ id: 'branch_a' }]);
    const result = await service.list(ctx as any);
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company_a', id: 'branch_a' } }),
    );
    expect(result.total).toBe(1);
  });

  it('create exige name', async () => {
    await expect(service.create(ctx as any, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update rejeita payload vazio', async () => {
    await expect(service.update(ctx as any, 'branch_a', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia update cross-branch para usuario branch-scoped', async () => {
    prisma.branch.findFirst.mockResolvedValueOnce({ id: 'branch_b', companyId: 'company_a' });
    await expect(service.update(ctx as any, 'branch_b', { name: 'Nova' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('bloqueia update cross-company', async () => {
    prisma.branch.findFirst.mockResolvedValueOnce({ id: 'branch_x', companyId: 'company_b' });
    await expect(
      service.update(
        { ...ctx, branchId: undefined } as any,
        'branch_x',
        { name: 'Nova' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('branch inexistente retorna not found', async () => {
    prisma.branch.findFirst.mockResolvedValueOnce(null);
    await expect(service.update({ ...ctx, branchId: undefined } as any, 'missing', { name: 'Nova' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
