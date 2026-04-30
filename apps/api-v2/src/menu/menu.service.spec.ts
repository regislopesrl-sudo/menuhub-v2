import { MenuService } from './menu.service';

describe('MenuService', () => {
  const ctx = {
    companyId: 'company_a',
    userRole: 'user' as const,
    requestId: 'req_1',
  };

  it('menu so retorna produtos da empresa', async () => {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new MenuService(prismaMock);
    await service.list(ctx);

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
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
          },
        ]),
      },
    } as any;

    const service = new MenuService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([
      {
        id: 'prod_1',
        name: 'Pizza',
        description: undefined,
        imageUrl: undefined,
        price: 45,
        categoryName: 'Pizzas',
        available: true,
        addonGroups: [],
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

    const service = new MenuService(prismaMock);
    const result = await service.list(ctx);

    expect(result).toEqual([
      {
        id: 'prod_2',
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
      },
    ]);
  });
});
