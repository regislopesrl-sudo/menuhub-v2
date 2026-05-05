import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
  };

  function prismaMock() {
    return {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company_a',
          tradeName: 'MenuHub Burgers',
          legalName: 'MenuHub Burgers LTDA',
          cnpj: '12345678000199',
          phone: '11999990000',
          whatsapp: '11999990001',
          email: 'contato@menuhub.local',
          logoUrl: 'https://img.local/logo.png',
        }),
        update: jest.fn().mockResolvedValue({ id: 'company_a' }),
      },
      companyConfiguration: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'company_config_1' }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch_a',
          companyId: 'company_a',
          name: 'Loja Centro',
          code: 'CTR',
          phone: '1133334444',
          whatsapp: '11911112222',
          email: 'centro@menuhub.local',
          city: 'Sao Paulo',
          state: 'SP',
          zipCode: '01001000',
          street: 'Rua A',
          number: '100',
          complement: null,
          district: 'Centro',
          latitude: -23.5,
          longitude: -46.6,
          isActive: true,
          createdAt: new Date('2026-01-01T10:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      companySetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'setting_1' }),
      },
      deliveryArea: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      fiscalConfiguration: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: false,
          environment: 'HOMOLOGATION',
        }),
      },
    } as any;
  }

  it('busca settings respeitando companyId e branchId', async () => {
    const prisma = prismaMock();
    const service = new SettingsService(prisma);

    await service.getBranch(ctx);

    expect(prisma.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'branch_a', companyId: 'company_a' },
      }),
    );
  });

  it('update company nao altera outra empresa', async () => {
    const prisma = prismaMock();
    prisma.company.findUnique.mockResolvedValueOnce(null);
    const service = new SettingsService(prisma);

    await expect(service.patchCompany(ctx, { tradeName: 'Nova' })).rejects.toThrow("Company 'company_a' nao encontrada.");
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('update branch valida empresa', async () => {
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce(null);
    const service = new SettingsService(prisma);

    await expect(service.patchBranch(ctx, { name: 'Outra filial' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('update payments nao retorna segredo', async () => {
    const prisma = prismaMock();
    prisma.companySetting.findFirst.mockResolvedValue({
      value: {
        pixActive: true,
        onlineCardActive: true,
        accessToken: 'real_secret',
        webhookSecret: 'real_secret_2',
      },
    });
    const service = new SettingsService(prisma);

    const result = await service.getPayments(ctx);

    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('webhookSecret');
    expect(result.pixActive).toBe(true);
  });

  it('usa configuracao dedicada da empresa quando disponivel', async () => {
    const prisma = prismaMock();
    prisma.companyConfiguration.findUnique.mockResolvedValue({
      brandColor: '#111827',
      timezone: 'America/Fortaleza',
      currency: 'BRL',
      isActive: false,
      publicTitle: 'MenuHub Premium',
      publicDescription: 'Descricao dedicada',
      bannerUrl: 'https://img.local/banner.png',
      closedMessage: 'Fechado para manutencao',
    });
    const service = new SettingsService(prisma);

    const result = await service.getCompany(ctx);

    expect(result.brandColor).toBe('#111827');
    expect(result.status).toBe('INACTIVE');
    expect(result.publicTitle).toBe('MenuHub Premium');
  });

  it('patch company grava na configuracao dedicada', async () => {
    const prisma = prismaMock();
    const service = new SettingsService(prisma);

    await service.patchCompany(ctx, {
      brandColor: '#2563eb',
      status: 'ACTIVE',
      publicTitle: 'Nova vitrine',
    });

    expect(prisma.companyConfiguration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company_a' },
        update: expect.objectContaining({
          brandColor: '#2563eb',
          isActive: true,
          publicTitle: 'Nova vitrine',
        }),
      }),
    );
  });

  it('horarios invalidos falham', async () => {
    const service = new SettingsService(prismaMock());

    await expect(
      service.patchOperation(ctx, {
        schedules: [
          {
            dayKey: 'monday',
            isOpen: true,
            openAt: '18:00',
            closeAt: '10:00',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valores negativos falham', async () => {
    const service = new SettingsService(prismaMock());

    await expect(
      service.patchOperation(ctx, {
        delivery: {
          minimumOrder: -1,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runtime facade agrega company/branch/operation/payments sem fundir origem', async () => {
    const prisma = prismaMock();
    const service = new SettingsService(prisma);

    const runtime = await service.getCompanyRuntimeConfiguration(ctx);

    expect(runtime.behavior).toBe('fail_fast');
    expect(runtime.companyConfiguration.companyId).toBe('company_a');
    expect(runtime.branchSettings.branchId).toBe('branch_a');
    expect(runtime.operationSettings.branchId).toBe('branch_a');
    expect(runtime.paymentSettings.branchId).toBe('branch_a');
  });

  it('runtime facade falha rapido quando uma origem falha', async () => {
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce(null);
    const service = new SettingsService(prisma);

    await expect(service.getCompanyRuntimeConfiguration(ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});
