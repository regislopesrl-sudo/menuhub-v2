import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AdminMenuService } from './admin-menu.service';

describe('AdminMenuService', () => {
  const ctx = {
    companyId: 'company_a',
    branchId: 'branch_a',
    userRole: 'admin' as const,
    requestId: 'req_1',
  };

  function product(overrides: Record<string, unknown> = {}) {
    return {
      id: 'prod_1',
      companyId: 'company_a',
      categoryId: 'cat_1',
      name: 'X Burger',
      description: 'Burger',
      salePrice: 25,
      promotionalPrice: null,
      costPrice: 0,
      localPrice: 25,
      deliveryPickupPrice: 28,
      prepTimeMinutes: 10,
      imageUrl: null,
      kitchenStation: null,
      isActive: true,
      isFeatured: false,
      controlsStock: false,
      allowNotes: true,
      availableDelivery: true,
      availableCounter: true,
      availableKiosk: true,
      availableTable: true,
      sortOrder: 0,
      deletedAt: null,
      category: { id: 'cat_1', name: 'Lanches' },
      addonLinks: [],
      ...overrides,
    };
  }

  function addonGroup(overrides: Record<string, unknown> = {}) {
    return {
      id: 'group_1',
      companyId: 'company_a',
      name: 'Adicionais',
      minSelect: 0,
      maxSelect: 2,
      required: false,
      allowMultiple: true,
      items: [],
      productLinks: [{ productId: 'prod_1' }],
      ...overrides,
    };
  }

  function addonItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'option_1',
      groupId: 'group_1',
      name: 'Bacon',
      price: 6,
      isActive: true,
      sortOrder: 0,
      group: { id: 'group_1', companyId: 'company_a' },
      ...overrides,
    };
  }

  function prismaMock() {
    return {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch_a' }),
      },
      productCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'cat_1' }),
        create: jest.fn().mockResolvedValue({ id: 'cat_new', name: 'Combos', isActive: true }),
        update: jest.fn().mockImplementation((args) =>
          Promise.resolve({ id: args.where.id, name: args.data.name ?? 'Lanches', isActive: args.data.isActive ?? true, _count: { products: 3 } }),
        ),
        delete: jest.fn().mockResolvedValue({ id: 'cat_1' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(product()),
        create: jest.fn().mockImplementation((args) => Promise.resolve(product({ ...args.data, id: 'prod_new', addonLinks: [] }))),
        update: jest.fn().mockImplementation((args) => Promise.resolve(product({ ...args.data }))),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      addonGroup: {
        findFirst: jest.fn().mockResolvedValue(addonGroup()),
        create: jest.fn().mockImplementation((args) => Promise.resolve(addonGroup({ ...args.data, id: 'group_new', productLinks: [{ productId: 'prod_1' }] }))),
        update: jest.fn().mockImplementation((args) => Promise.resolve(addonGroup({ ...args.data }))),
        delete: jest.fn().mockResolvedValue(addonGroup()),
      },
      addonItem: {
        findFirst: jest.fn().mockResolvedValue(addonItem()),
        create: jest.fn().mockImplementation((args) => Promise.resolve(addonItem({ ...args.data, id: 'option_new' }))),
        update: jest.fn().mockImplementation((args) => Promise.resolve(addonItem({ ...args.data }))),
        delete: jest.fn().mockResolvedValue(addonItem()),
      },
      companySetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'setting_1' }),
      },
    } as any;
  }

  it('cria produto', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.createProduct(ctx, {
      name: 'Batata',
      salePrice: 12,
      deliveryPrice: 14,
      categoryName: 'Acompanhamentos',
      channels: { delivery: true, pdv: true, waiter: false },
    });

    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: 'company_a',
        name: 'Batata',
        salePrice: 12,
        deliveryPickupPrice: 14,
        availableDelivery: true,
        availableCounter: true,
        availableTable: false,
      }),
    }));
    expect(result.id).toBe('prod_new');
  });

  it('cria categoria real', async () => {
    const prisma = prismaMock();
    prisma.productCategory.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    const result = await service.createCategory(ctx, { name: 'Combos' });

    expect(prisma.productCategory.create).toHaveBeenCalledWith({
      data: { companyId: 'company_a', name: 'Combos' },
      include: { _count: { select: { products: true } } },
    });
    expect(result).toEqual({ id: 'cat_new', name: 'Combos', count: 0, active: true });
  });

  it('lista categorias com contador', async () => {
    const prisma = prismaMock();
    prisma.productCategory.findMany.mockResolvedValue([
      { id: 'cat_1', name: 'Lanches', isActive: true, _count: { products: 3 } },
    ]);
    const service = new AdminMenuService(prisma);

    const result = await service.listCategories(ctx);

    expect(result).toEqual([{ id: 'cat_1', name: 'Lanches', count: 3, active: true }]);
  });

  it('edita categoria real isolada por empresa', async () => {
    const prisma = prismaMock();
    prisma.productCategory.findFirst
      .mockResolvedValueOnce({ id: 'cat_1', companyId: 'company_a', _count: { products: 3 } })
      .mockResolvedValueOnce(null);
    const service = new AdminMenuService(prisma);

    const result = await service.updateCategory('cat_1', ctx, { name: 'Combos Premium' });

    expect(prisma.productCategory.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cat_1', companyId: 'company_a' },
    }));
    expect(prisma.productCategory.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cat_1' },
      data: { name: 'Combos Premium' },
    }));
    expect(result).toEqual({ id: 'cat_1', name: 'Combos Premium', count: 3, active: true });
  });

  it('remove categoria e desvincula produtos', async () => {
    const prisma = prismaMock();
    prisma.productCategory.findFirst.mockResolvedValue({ id: 'cat_1', companyId: 'company_a', _count: { products: 3 } });
    const service = new AdminMenuService(prisma);

    const result = await service.deleteCategory('cat_1', ctx);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { companyId: 'company_a', categoryId: 'cat_1' },
      data: { categoryId: null },
    });
    expect(prisma.productCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    expect(result).toEqual({ deleted: true, id: 'cat_1', affectedProducts: 3 });
  });

  it('bloqueia categoria de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.productCategory.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.updateCategory('cat_other', ctx, { name: 'Bebidas' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteCategory('cat_other', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('edita produto', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateProduct('prod_1', ctx, { name: 'Burger Duplo', salePrice: 30 });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'prod_1' },
      data: expect.objectContaining({ name: 'Burger Duplo', salePrice: 30 }),
    }));
  });

  it('bloqueia produto de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.getProduct('prod_other', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'prod_other', companyId: 'company_a' }),
    }));
  });

  it('duplica produto inativo', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.duplicateProduct('prod_1', ctx);

    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'X Burger (copia)',
        isActive: false,
        isFeatured: false,
      }),
    }));
  });

  it('ativa e desativa produto', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateAvailability('prod_1', ctx, {
      available: false,
      channels: { delivery: false, pdv: true, waiter: false },
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isActive: false,
        availableDelivery: false,
        availableCounter: true,
        availableTable: false,
      }),
    }));
  });

  it('atualiza PDV e Kiosk de forma independente no produto', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateProduct('prod_1', ctx, {
      channels: { pdv: false, kiosk: true },
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availableCounter: false,
        availableKiosk: true,
      }),
    }));
  });

  it('valida preco invalido', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.createProduct(ctx, { name: 'Produto', salePrice: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create sem nome falha', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.createProduct(ctx, { salePrice: 10 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update com nome vazio falha', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.updateProduct('prod_1', ctx, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update com preco negativo falha', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.updateProduct('prod_1', ctx, { salePrice: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('patch availability bloqueia produto de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.updateAvailability('prod_other', ctx, { available: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('duplicate bloqueia produto de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.duplicateProduct('prod_other', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list retorna aliases de canal separados corretamente', async () => {
    const prisma = prismaMock();
    prisma.product.findMany.mockResolvedValue([
      product({
        availableDelivery: false,
        availableCounter: true,
        availableKiosk: false,
        availableTable: false,
      }),
    ]);
    const service = new AdminMenuService(prisma);

    const result = await service.listProducts(ctx);

    expect(result[0]).toEqual(expect.objectContaining({
      availableDelivery: false,
      availablePdv: true,
      availableKiosk: false,
      availableWaiter: false,
      channels: {
        delivery: false,
        pdv: true,
        kiosk: false,
        waiter: false,
      },
    }));
  });

  it('list retorna recomendacoes salvas do produto', async () => {
    const prisma = prismaMock();
    prisma.product.findMany.mockResolvedValue([product()]);
    prisma.companySetting.findFirst.mockResolvedValue({
      value: {
        prod_1: {
          title: 'Combine com',
          type: 'manual',
          limit: 2,
          active: true,
          productIds: ['prod_2'],
        },
      },
    });
    const service = new AdminMenuService(prisma);

    const result = await service.listProducts(ctx);

    expect(result[0].recommendations).toEqual({
      title: 'Combine com',
      type: 'manual',
      limit: 2,
      active: true,
      productIds: ['prod_2'],
    });
  });

  it('PATCH availableKiosk nao altera availablePdv', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateAvailability('prod_1', ctx, {
      channels: { kiosk: false },
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        availableKiosk: false,
      },
    }));
  });

  it('PATCH availablePdv nao altera availableKiosk', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateAvailability('prod_1', ctx, {
      channels: { pdv: false },
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        availableCounter: false,
      },
    }));
  });

  it('preview de importacao valida linhas', async () => {
    const service = new AdminMenuService(prismaMock());
    const result = await service.previewImport(ctx, {
      csv: 'name,description,category,salePrice,deliveryPrice,promotionalPrice,isActive,availableDelivery,availablePdv,availableKiosk\nBurger,Ok,Lanches,25,28,,true,true,true,true\nSem preco,Erro,Lanches,,,,true,true,true,true',
    });

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.rows[1].errors).toContain('salePrice obrigatorio');
  });

  it('importacao ignora invalidos', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.commitImport(ctx, {
      csv: 'name,description,category,salePrice\nBurger,Ok,Lanches,25\nSem preco,Erro,Lanches,',
    });

    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
  });

  it('marca e desmarca destaque', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateFeatured('prod_1', ctx, { featured: true });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { isFeatured: true },
    }));
  });

  it('reordena destaques', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.reorderFeatured(ctx, { productIds: ['prod_1', 'prod_2'] });

    expect(prisma.product.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'prod_1' },
      data: { isFeatured: true, sortOrder: 0 },
    }));
    expect(prisma.product.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'prod_2' },
      data: { isFeatured: true, sortOrder: 1 },
    }));
  });

  it('salva recomendacoes peca tambem', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.putRecommendations('prod_1', ctx, {
      title: 'Peca tambem',
      type: 'manual',
      limit: 3,
      active: true,
      productIds: ['prod_2'],
    });

    expect(result.productIds).toEqual(['prod_2']);
    expect(prisma.companySetting.upsert).toHaveBeenCalled();
  });

  it('cria grupo de adicional para produto da empresa', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.createProductAddonGroup('prod_1', ctx, {
      name: 'Molhos',
      minSelect: 0,
      maxSelect: 3,
      required: false,
      allowMultiple: true,
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'prod_1', companyId: 'company_a' }),
    }));
    expect(prisma.addonGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: 'company_a',
        name: 'Molhos',
        minSelect: 0,
        maxSelect: 3,
        productLinks: { create: { productId: 'prod_1' } },
      }),
    }));
    expect(result.id).toBe('group_new');
  });

  it('edita grupo de adicional', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateAddonGroup('group_1', ctx, { name: 'Extras', required: true, minSelect: 1, maxSelect: 2 });

    expect(prisma.addonGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group_1', companyId: 'company_a' },
    }));
    expect(prisma.addonGroup.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group_1' },
      data: expect.objectContaining({ name: 'Extras', required: true, minSelect: 1, maxSelect: 2 }),
    }));
  });

  it('remove grupo de adicional', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.deleteAddonGroup('group_1', ctx);

    expect(prisma.addonGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group_1', companyId: 'company_a' },
    }));
    expect(prisma.addonGroup.delete).toHaveBeenCalledWith({ where: { id: 'group_1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('cria opcao de adicional', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.createAddonOption('group_1', ctx, { name: 'Cheddar', price: 4.5 });

    expect(prisma.addonGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group_1', companyId: 'company_a' },
    }));
    expect(prisma.addonItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ groupId: 'group_1', name: 'Cheddar', price: 4.5 }),
    }));
    expect(result.id).toBe('option_new');
  });

  it('edita preco de opcao de adicional', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    await service.updateAddonOption('option_1', ctx, { price: 7.5, available: false });

    expect(prisma.addonItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'option_1', group: { companyId: 'company_a' } },
    }));
    expect(prisma.addonItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'option_1' },
      data: expect.objectContaining({ price: 7.5, isActive: false }),
    }));
  });

  it('remove opcao de adicional', async () => {
    const prisma = prismaMock();
    const service = new AdminMenuService(prisma);

    const result = await service.deleteAddonOption('option_1', ctx);

    expect(prisma.addonItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'option_1', group: { companyId: 'company_a' } },
    }));
    expect(prisma.addonItem.delete).toHaveBeenCalledWith({ where: { id: 'option_1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('bloqueia preco negativo em opcao', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.createAddonOption('group_1', ctx, { name: 'Bacon', price: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia grupo de adicional para produto de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.createProductAddonGroup('prod_other', ctx, { name: 'Extras' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.addonGroup.create).not.toHaveBeenCalled();
  });

  it('bloqueia editar grupo de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.addonGroup.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.updateAddonGroup('group_other', ctx, { name: 'Extras' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.addonGroup.update).not.toHaveBeenCalled();
  });

  it('bloqueia editar opcao de outra empresa', async () => {
    const prisma = prismaMock();
    prisma.addonItem.findFirst.mockResolvedValue(null);
    const service = new AdminMenuService(prisma);

    await expect(service.updateAddonOption('option_other', ctx, { price: 2 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.addonItem.update).not.toHaveBeenCalled();
  });

  it('bloqueia minSelect maior que maxSelect', async () => {
    const service = new AdminMenuService(prismaMock());

    await expect(service.createProductAddonGroup('prod_1', ctx, {
      name: 'Obrigatorios',
      minSelect: 3,
      maxSelect: 1,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lista adicionais atualizados no formato do delivery', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(product({
      addonLinks: [
        {
          addonGroup: addonGroup({
            name: 'Queijos',
            items: [addonItem({ name: 'Prato', price: 3, isActive: true })],
          }),
        },
      ],
    }));
    const service = new AdminMenuService(prisma);

    const result = await service.listProductAddonGroups('prod_1', ctx);

    expect(result).toEqual([
      expect.objectContaining({
        name: 'Queijos',
        options: [expect.objectContaining({ name: 'Prato', price: 3, available: true })],
      }),
    ]);
  });

  it('migration inicializa availableKiosk com availableCounter', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../prisma/migrations/20260502120000_add_product_available_kiosk/migration.sql'),
      'utf8',
    );

    expect(sql).toContain('ADD COLUMN "available_kiosk" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('SET "available_kiosk" = "available_counter"');
  });
});
