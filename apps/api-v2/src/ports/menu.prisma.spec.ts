import { MenuPrismaPort } from './menu.prisma';

describe('MenuPrismaPort', () => {
  function makePortWithProducts(products: unknown[]) {
    const prismaMock = {
      product: {
        findMany: jest.fn().mockResolvedValue(products),
      },
    } as any;

    return {
      port: new MenuPrismaPort(prismaMock),
      prismaMock,
    };
  }

  it('item inexistente', async () => {
    const { port } = makePortWithProducts([]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow('Item inexistente ou sem acesso para a empresa atual');
  });

  it('item existente', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    const result = await port.validateItems({
      companyId: 'company_a',
      storeId: 'store_1',
      channel: 'delivery',
      items: [{ productId: 'p1', quantity: 2 }],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Pizza');
    expect(result.items[0].quantity).toBe(2);
  });

  it('preco retornado corretamente', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: 45,
        deliveryPickupPrice: 39.9,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    const result = await port.validateItems({
      companyId: 'company_a',
      storeId: 'store_1',
      channel: 'delivery',
      items: [{ productId: 'p1', quantity: 1 }],
    });

    expect(result.items[0].unitPrice).toBe(39.9);
  });

  it('item inativo ou indisponivel bloqueia', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: false,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow('Item indisponivel para delivery');
  });

  it('PDV usa availableCounter', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        availableCounter: false,
        availableKiosk: true,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'pdv',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow('Item indisponivel para pdv');
  });

  it('Kiosk usa availableKiosk quando o canal for totem', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        availableCounter: true,
        availableKiosk: false,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'kiosk',
        items: [{ productId: 'p1', quantity: 1 }],
      } as any),
    ).rejects.toThrow('Item indisponivel para kiosk');
  });

  it('waiter_app usa availableTable para bloquear produto de mesa', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        availableCounter: true,
        availableKiosk: true,
        availableTable: false,
        deletedAt: null,
        addonLinks: [],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'waiter_app',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow('Item indisponivel para waiter_app');
  });

  it('produtos de outra empresa nao retornam', async () => {
    const { port, prismaMock } = makePortWithProducts([]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow('Item inexistente ou sem acesso para a empresa atual');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['p1'] },
        companyId: 'company_a',
      },
      include: {
        addonLinks: {
          include: {
            addonGroup: {
              include: {
                items: {
                  where: { isActive: true },
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('frontend nao consegue manipular preco do addon', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_1',
              name: 'Adicionais',
              minSelect: 0,
              maxSelect: 2,
              required: false,
              allowMultiple: true,
              items: [{ id: 'add_1', name: 'Queijo', price: 4 }],
            },
          },
        ],
      },
    ]);

    const result = await port.validateItems({
      companyId: 'company_a',
      storeId: 'store_1',
      channel: 'delivery',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          selectedOptions: [{ groupId: 'grp_1', optionId: 'add_1', name: 'Fake', price: 999 }],
        },
      ],
    });

    expect(result.items[0].selectedOptions?.[0]).toEqual({
      groupId: 'grp_1',
      optionId: 'add_1',
      name: 'Queijo',
      price: 4,
    });
  });

  it('optionId invalido bloqueia checkout', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_1',
              name: 'Adicionais',
              minSelect: 0,
              maxSelect: 2,
              required: false,
              allowMultiple: true,
              items: [{ id: 'add_1', name: 'Queijo', price: 4 }],
            },
          },
        ],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            selectedOptions: [{ groupId: 'grp_1', optionId: 'add_invalid', name: 'X', price: 1 }],
          },
        ],
      }),
    ).rejects.toThrow('Opcional invalido');
  });

  it('required sem opcao bloqueia', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_req',
              name: 'Molhos',
              minSelect: 0,
              maxSelect: 1,
              required: true,
              allowMultiple: false,
              items: [{ id: 'add_m1', name: 'Molho verde', price: 2 }],
            },
          },
        ],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [{ productId: 'p1', quantity: 1, selectedOptions: [] }],
      }),
    ).rejects.toThrow("Grupo obrigatorio 'Molhos'");
  });

  it('minSelect bloqueia abaixo do minimo', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_min',
              name: 'Sabores extras',
              minSelect: 2,
              maxSelect: 3,
              required: false,
              allowMultiple: true,
              items: [
                { id: 'add_1', name: 'Queijo', price: 4 },
                { id: 'add_2', name: 'Bacon', price: 6 },
              ],
            },
          },
        ],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            selectedOptions: [{ groupId: 'grp_min', optionId: 'add_1', name: 'x', price: 1 }],
          },
        ],
      }),
    ).rejects.toThrow("Grupo 'Sabores extras' exige no minimo 2");
  });

  it('maxSelect bloqueia acima do maximo', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_max',
              name: 'Topings',
              minSelect: 0,
              maxSelect: 1,
              required: false,
              allowMultiple: true,
              items: [
                { id: 'add_1', name: 'Queijo', price: 4 },
                { id: 'add_2', name: 'Bacon', price: 6 },
              ],
            },
          },
        ],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            selectedOptions: [
              { groupId: 'grp_max', optionId: 'add_1', name: 'x', price: 1 },
              { groupId: 'grp_max', optionId: 'add_2', name: 'y', price: 1 },
            ],
          },
        ],
      }),
    ).rejects.toThrow("Grupo 'Topings' permite no maximo 1");
  });

  it('allowMultiple=false bloqueia multiplas escolhas', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_single',
              name: 'Borda',
              minSelect: 0,
              maxSelect: 2,
              required: false,
              allowMultiple: false,
              items: [
                { id: 'add_1', name: 'Catupiry', price: 4 },
                { id: 'add_2', name: 'Cheddar', price: 5 },
              ],
            },
          },
        ],
      },
    ]);

    await expect(
      port.validateItems({
        companyId: 'company_a',
        storeId: 'store_1',
        channel: 'delivery',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            selectedOptions: [
              { groupId: 'grp_single', optionId: 'add_1', name: 'x', price: 1 },
              { groupId: 'grp_single', optionId: 'add_2', name: 'y', price: 1 },
            ],
          },
        ],
      }),
    ).rejects.toThrow("Grupo 'Borda' nao permite multiplas opcoes");
  });

  it('selecao valida passa', async () => {
    const { port } = makePortWithProducts([
      {
        id: 'p1',
        name: 'Pizza',
        salePrice: 50,
        promotionalPrice: null,
        deliveryPickupPrice: 0,
        isActive: true,
        availableDelivery: true,
        deletedAt: null,
        addonLinks: [
          {
            addonGroup: {
              id: 'grp_ok',
              name: 'Bebida',
              minSelect: 1,
              maxSelect: 1,
              required: true,
              allowMultiple: false,
              items: [{ id: 'add_1', name: 'Refri', price: 7 }],
            },
          },
        ],
      },
    ]);

    const result = await port.validateItems({
      companyId: 'company_a',
      storeId: 'store_1',
      channel: 'delivery',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          selectedOptions: [{ groupId: 'grp_ok', optionId: 'add_1', name: 'x', price: 99 }],
        },
      ],
    });

    expect(result.items[0].selectedOptions?.[0]).toEqual({
      groupId: 'grp_ok',
      optionId: 'add_1',
      name: 'Refri',
      price: 7,
    });
  });
});
