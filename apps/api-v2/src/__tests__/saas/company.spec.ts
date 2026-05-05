import { ConflictException } from '@nestjs/common';
import { DeveloperController } from '../../developer/developer.controller';

describe('SaaS Company Flow', () => {
  it('criar empresa', async () => {
    const prisma = {
      company: {
        create: jest.fn().mockResolvedValue({ id: 'c1', slug: 'empresa-a' }),
      },
    };
    const controller = new DeveloperController(prisma as never);

    const created = await controller.createCompany({
      name: 'Empresa A',
      legalName: 'Empresa A LTDA',
      slug: 'empresa-a',
    });

    expect(created.id).toBe('c1');
    expect(prisma.company.create).toHaveBeenCalled();
  });

  it('slug duplicado falha', async () => {
    const prisma = {
      company: {
        create: jest.fn().mockRejectedValue(new ConflictException('slug duplicado')),
      },
    };
    const controller = new DeveloperController(prisma as never);

    await expect(
      controller.createCompany({
        name: 'Empresa A',
        legalName: 'Empresa A LTDA',
        slug: 'empresa-a',
      }),
    ).rejects.toThrow();
  });
});
