import { DeveloperController } from './developer.controller';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import * as auditRecorder from '../common/audit-log-recorder';

describe('DeveloperController', () => {
  const modulesService = {
    listPlans: jest.fn(),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    listCurrentCompanyModules: jest.fn(),
    updateCompanyModuleOverride: jest.fn(),
  };
  const authService = {
    loginWithDeveloperCode: jest.fn(),
  };
  const prisma = {
    company: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    companySubscription: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    companyModuleOverride: { count: jest.fn() },
  };

  const controller = new DeveloperController(modulesService as any, authService as any, prisma as any);
  const auditSpy = jest.spyOn(auditRecorder, 'recordAuditFromContext').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('login tecnico usa codigo e retorna sessao', async () => {
    authService.loginWithDeveloperCode.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });

    const result = await controller.login({ code: 'abc123' });

    expect(authService.loginWithDeveloperCode).toHaveBeenCalledWith({ code: 'abc123' });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSec: 900 });
  });

  it('listPlans bloqueia usuario developer sem contexto platform', () => {
    expect(() =>
      controller.listPlans({ companyId: 'c1', userRole: 'developer', requestId: 'r1', permissions: [] }),
    ).toThrow(ForbiddenException);
  });

  it('createPlan sem permissao platform registra blocked', async () => {
    await expect(
      controller.createPlan(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:read'],
        },
        { key: 'basic', name: 'Plano Basic' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.plan.create',
        outcome: 'blocked',
      }),
    );
  });

  it('listPlans permite contexto platform por source', () => {
    modulesService.listPlans.mockReturnValueOnce([{ key: 'pro' }]);
    const result = controller.listPlans({
      companyId: 'c1',
      userRole: 'developer',
      source: 'technical-admin',
      requestId: 'r1',
      permissions: ['*'],
    });
    expect(modulesService.listPlans).toHaveBeenCalled();
    expect(result).toEqual([{ key: 'pro' }]);
  });

  it('listPlans permite platform:admin para acoes de plataforma', () => {
    modulesService.listPlans.mockReturnValueOnce([{ key: 'pro-admin' }]);
    const result = controller.listPlans({
      companyId: 'c1',
      userRole: 'developer',
      source: 'jwt',
      requestId: 'r1',
      permissions: ['platform:admin'],
    });
    expect(modulesService.listPlans).toHaveBeenCalled();
    expect(result).toEqual([{ key: 'pro-admin' }]);
  });

  it('getCompanySubscription permite platform:billing:read', async () => {
    prisma.companySubscription.findFirst.mockResolvedValueOnce({
      id: 'sub_1',
      companyId: 'c1',
      planId: 'plan_1',
      status: 'ACTIVE',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: null,
      trialEndsAt: null,
      plan: { id: 'plan_1', key: 'basic', name: 'Basic' },
    });

    const result = await controller.getCompanySubscription('c1', {
      companyId: 'c1',
      userRole: 'developer',
      source: 'jwt',
      requestId: 'r1',
      permissions: ['platform:billing:read'],
    });

    expect(prisma.companySubscription.findFirst).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'sub_1', planId: 'plan_1', status: 'ACTIVE' });
  });

  it('createCompanySubscription bloqueia platform:billing:read sem manage', async () => {
    await expect(
      controller.createCompanySubscription(
        'c1',
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:billing:read'],
        },
        {
          planId: 'plan_1',
          status: 'ACTIVE',
          startsAt: '2026-01-01T00:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createCompany sem name retorna erro', async () => {
    await expect(
      controller.createCompany(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:create'],
        },
        {
          name: '   ',
          legalName: 'Empresa Teste LTDA',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateCompany com payload vazio retorna erro', async () => {
    await expect(
      controller.updateCompany(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:update'],
        },
        'c1',
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('companies permissions ficam separadas por acao', async () => {
    await expect(
      controller.createCompany(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:read'],
        },
        {
          name: 'Empresa Teste',
          legalName: 'Empresa Teste LTDA',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.updateCompany(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:create'],
        },
        'c1',
        { name: 'Novo nome' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.company.create',
        outcome: 'blocked',
      }),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.company.update',
        outcome: 'blocked',
      }),
    );
  });

  it('createCompany falha de persistencia registra outcome failure', async () => {
    prisma.company.create.mockRejectedValueOnce(new BadRequestException('slug duplicado'));
    await expect(
      controller.createCompany(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:companies:create'],
        },
        {
          name: 'Empresa Teste',
          legalName: 'Empresa Teste LTDA',
          slug: 'empresa-teste',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.company.create',
        outcome: 'failure',
      }),
    );
  });

  it('createPlan sem name falha no service e preserva contrato', async () => {
    modulesService.createPlan.mockRejectedValueOnce(new BadRequestException('key e name sao obrigatorios.'));
    await expect(
      controller.createPlan(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:plans:manage'],
        },
        { key: 'pro', name: '' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
      }),
    );
  });

  it('updatePlan inexistente retorna erro esperado do service', async () => {
    modulesService.updatePlan.mockRejectedValueOnce(new NotFoundException("Plano 'x' nao encontrado."));
    await expect(
      controller.updatePlan(
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:plans:manage'],
        },
        'x',
        { name: 'Pro' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
      }),
    );
  });

  it('createPlan sucesso registra audit event', async () => {
    modulesService.createPlan.mockResolvedValueOnce({ id: 'p1', key: 'basic' });

    await controller.createPlan(
      {
        companyId: 'c1',
        userRole: 'developer',
        source: 'technical-admin',
        requestId: 'r1',
        permissions: ['*'],
      },
      { key: 'basic', name: 'Plano Basic' },
    );

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.plan.create',
        outcome: 'success',
      }),
    );
  });

  it('create subscription sem planId bloqueia', async () => {
    await expect(
      controller.createCompanySubscription(
        'c1',
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:billing:manage'],
        },
        {
          planId: '',
          status: 'ACTIVE',
          startsAt: '2026-01-01T00:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('patch subscription com payload vazio bloqueia', async () => {
    await expect(
      controller.patchCompanySubscription(
        'c1',
        'sub1',
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:billing:manage'],
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('platform:billing:manage permite patch subscription valido', async () => {
    prisma.companySubscription.findUnique.mockResolvedValueOnce({
      id: 'sub1',
      companyId: 'c1',
      status: 'ACTIVE',
    });
    prisma.companySubscription.update.mockResolvedValueOnce({
      id: 'sub1',
      companyId: 'c1',
      planId: 'plan_1',
      status: 'PAST_DUE',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: null,
      trialEndsAt: null,
      plan: { id: 'plan_1', key: 'basic', name: 'Basic' },
    });

    const result = await controller.patchCompanySubscription(
      'c1',
      'sub1',
      {
        companyId: 'c1',
        userRole: 'developer',
        source: 'jwt',
        requestId: 'r1',
        permissions: ['platform:billing:manage'],
      },
      { status: 'PAST_DUE' },
    );

    expect(result).toMatchObject({ id: 'sub1', status: 'PAST_DUE' });
  });

  it('bloqueia transicao invalida de assinatura', async () => {
    prisma.companySubscription.findUnique.mockResolvedValueOnce({
      id: 'sub1',
      companyId: 'c1',
      status: 'EXPIRED',
    });

    await expect(
      controller.patchCompanySubscription(
        'c1',
        'sub1',
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:billing:manage'],
        },
        { status: 'TRIAL' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('module override com moduleKey ausente bloqueia', async () => {
    expect(() =>
      controller.updateCompanyModule(
        'c1',
        '' as ModuleKey,
        {
          companyId: 'c1',
          userRole: 'developer',
          source: 'jwt',
          requestId: 'r1',
          permissions: ['platform:modules:manage'],
        },
        { enabled: true },
      ),
    ).toThrow(BadRequestException);
  });
});
