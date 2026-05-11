import { MenuService } from './menu.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MenuService', () => {
  const ctx = {
    companyId: 'company_a',
    userRole: 'user' as const,
    requestId: 'req_1',
  };

  function createService(prismaMock: any, moduleAccess = { allowed: true }) {
    prismaMock.combo = prismaMock.combo ?? {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const modulesService = {
      checkAccess: jest.fn().mockResolvedValue(moduleAccess),
    };
    return {
      service: new MenuService(prismaMock, modulesService as any),
      modulesService,
    };
  }

  it('menu so retorna produtos da empresa', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const { service, modulesService } = createService(prismaMock);
    await service.list(ctx);

    expect(modulesService.checkAccess).toHaveBeenCalledWith({
      companyId: 'company_a',
      moduleKey: 'menu',
      isAdmin: false,
    });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        isActive: true,
        deletedAt: null,
        availableDelivery: true,
      },
      include: {
        category: {
          select: {
            name: true,
            isActive: true,
          },
        },
        addonLinks: {
          include: {
            addonGroup: {
              include: {
                items: {
                  where: {
                    isActive: true,
                  },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                },
              },
            },
          },
        },
        variations: {
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    expect(prismaMock.combo.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company_a',
        isActive: true,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                isActive: true,
                availableDelivery: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });
  });

  it('menu retorna produto sem opcionais', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prod_1',
            name: 'Pizza',
            description: null,
            imageUrl: null,
            salePrice: 50,
            promotionalPrice: null,
            deliveryPickupPrice: 45,
            isActive: true,
            availableDelivery: true,
            deletedAt: null,
            category: { name: 'Pizzas' },
            addonLinks: [],
            variations: [],
          },
        ]),
      },
    } as any;

    const { service } = createService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([
      {
        id: 'prod_1',
        type: 'product',
        name: 'Pizza',
        description: undefined,
        imageUrl: undefined,
        price: 45,
        categoryName: 'Pizzas',
        available: true,
        addonGroups: [],
        variations: [],
      },
    ]);
  });

  it('menu retorna produto com opcionais', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prod_2',
            name: 'Hamburguer',
            description: 'Artesanal',
            imageUrl: 'https://img.local/hamburguer.png',
            salePrice: 32,
            promotionalPrice: 30,
            deliveryPickupPrice: 0,
            isActive: true,
            availableDelivery: true,
            deletedAt: null,
            category: { name: 'Lanches' },
            variations: [
              {
                id: 'var_1',
                name: 'Grande',
                sku: 'BURGER-G',
                priceDelta: 8,
                localPriceDelta: 6,
                deliveryPriceDelta: 9,
                isActive: true,
                sortOrder: 1,
              },
            ],
            addonLinks: [
              {
                addonGroup: {
                  id: 'grp_1',
                  name: 'Adicionais',
                  minSelect: 0,
                  maxSelect: 2,
                  required: false,
                  allowMultiple: true,
                  items: [
                    { id: 'add_1', name: 'Queijo', price: 4, isActive: true },
                    { id: 'add_2', name: 'Bacon', price: 6, isActive: true },
                  ],
                },
              },
            ],
          },
        ]),
      },
    } as any;

    const { service } = createService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([
      {
        id: 'prod_2',
        type: 'product',
        name: 'Hamburguer',
        description: 'Artesanal',
        imageUrl: 'https://img.local/hamburguer.png',
        price: 30,
        categoryName: 'Lanches',
        available: true,
        addonGroups: [
          {
            id: 'grp_1',
            name: 'Adicionais',
            minSelect: 0,
            maxSelect: 2,
            required: false,
            allowMultiple: true,
            options: [
              { id: 'add_1', name: 'Queijo', price: 4, available: true },
              { id: 'add_2', name: 'Bacon', price: 6, available: true },
            ],
          },
        ],
        variations: [
          {
            id: 'var_1',
            name: 'Grande',
            sku: 'BURGER-G',
            priceDelta: 8,
            localPriceDelta: 6,
            deliveryPriceDelta: 9,
            active: true,
            sortOrder: 1,
          },
        ],
      },
    ]);
  });

  it('remove do menu publico produto nao visivel no canal delivery', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prod_hidden',
            name: 'Produto oculto',
            description: null,
            imageUrl: null,
            salePrice: 20,
            promotionalPrice: null,
            deliveryPickupPrice: 20,
            isActive: true,
            availableDelivery: false,
            deletedAt: null,
            category: { name: 'Teste' },
            addonLinks: [],
          },
        ]),
      },
    } as any;

    const { service } = createService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([]);
  });

  it('menu publico retorna combos ativos com produtos visiveis', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      combo: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'combo_1',
            name: 'Combo Familia',
            description: 'Burger e batata',
            price: 49.9,
            isActive: true,
            items: [
              {
                productId: 'prod_1',
                quantity: 2,
                product: {
                  id: 'prod_1',
                  name: 'Burger',
                  isActive: true,
                  availableDelivery: true,
                  deletedAt: null,
                },
              },
            ],
          },
        ]),
      },
    } as any;

    const { service } = createService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([
      {
        id: 'combo_1',
        type: 'combo',
        name: 'Combo Familia',
        description: 'Burger e batata',
        imageUrl: undefined,
        price: 49.9,
        categoryName: 'Combos',
        available: true,
        addonGroups: [],
        variations: [],
        comboItems: [{ productId: 'prod_1', productName: 'Burger', quantity: 2 }],
      },
    ]);
  });

  it('falha quando companyId nao esta presente no contexto', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const { service } = createService(prismaMock);

    await expect(service.list({ companyId: '' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('remove do menu publico produto de categoria inativa', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prod_hidden_cat',
            name: 'Produto categoria inativa',
            description: null,
            imageUrl: null,
            salePrice: 20,
            promotionalPrice: null,
            deliveryPickupPrice: 20,
            isActive: true,
            availableDelivery: true,
            deletedAt: null,
            category: { name: 'Oculta', isActive: false },
            addonLinks: [],
          },
        ]),
      },
    } as any;

    const { service } = createService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([]);
  });

  it('carrega menu publico por slug da empresa sem depender de header x-company-id', async () => {
    const prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ id: 'company_a' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const { service } = createService(prismaMock);

    await service.listPublicByCompanySlug('Company-A');

    expect(prismaMock.company.findFirst).toHaveBeenCalledWith({
      where: { slug: 'company-a', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company_a' }),
      }),
    );
  });

  it('bloqueia menu publico quando modulo menu nao esta ativo', async () => {
    const prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ id: 'company_a' }),
      },
      product: {
        findMany: jest.fn(),
      },
    } as any;

    const { service } = createService(prismaMock, { allowed: false });

    await expect(service.listPublicByCompanySlug('company-a')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('retorna not found para slug publico inexistente ou empresa inativa', async () => {
    const prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      product: {
        findMany: jest.fn(),
      },
    } as any;

    const { service } = createService(prismaMock);

    await expect(service.listPublicByCompanySlug('empresa-inativa')).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('valida filial publica quando branchId e informado', async () => {
    const prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ id: 'company_a' }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const { service } = createService(prismaMock);

    await service.listPublicByCompanySlug('company-a', 'branch_a');

    expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'branch_a', companyId: 'company_a', isActive: true },
      select: { id: true },
    });
  });
});
