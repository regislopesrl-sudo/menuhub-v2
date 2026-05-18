import { ForbiddenException } from '@nestjs/common';
import { ProductRecipesBackendService } from './product-recipes-backend.service';
import type { RequestContext } from '../common/request-context';
import { TENANT_PERMISSIONS } from '../common/rbac';

const ctx: RequestContext = {
  companyId: 'company-a',
  branchId: 'branch-a',
  allowedBranchIds: ['branch-a'],
  userRole: 'owner',
  requestId: 'req-a',
  permissions: [TENANT_PERMISSIONS.RECIPE_READ],
};

describe('ProductRecipesBackendService', () => {
  it('busca ficha tecnica por empresa e produto', async () => {
    const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-a' });
    const recipeFindFirst = jest.fn().mockResolvedValue({
      id: 'recipe-a',
      totalCost: 25,
      items: [{ id: 'item-a', unitCost: 10, totalCost: 20 }],
      costSnapshots: [{ id: 'snapshot-a' }],
    });
    const service = new ProductRecipesBackendService(
      {
        product: { findFirst: productFindFirst },
        productRecipe: { findFirst: recipeFindFirst },
      } as any,
      { recordFromContext: jest.fn() } as any,
    );

    const recipe = await service.getRecipeForProduct(ctx, 'product-a');

    expect(productFindFirst).toHaveBeenCalledWith({
      where: { id: 'product-a', deletedAt: null, companyId: 'company-a' },
      select: { id: true },
    });
    expect(recipeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'product-a', companyId: 'company-a' },
      }),
    );
    expect(recipe?.totalCost).toBeNull();
    expect(recipe?.items?.[0].unitCost).toBeNull();
  });

  it('exibe custos quando usuario tem permissao de custo', async () => {
    const service = new ProductRecipesBackendService(
      {
        product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }) },
        productRecipe: {
          findFirst: jest.fn().mockResolvedValue({ id: 'recipe-a', totalCost: 25, items: [], costSnapshots: [] }),
        },
      } as any,
      { recordFromContext: jest.fn() } as any,
    );

    const recipe = await service.getRecipeForProduct(
      { ...ctx, permissions: [TENANT_PERMISSIONS.RECIPE_READ, TENANT_PERMISSIONS.RECIPE_COST_READ] },
      'product-a',
    );

    expect(recipe?.totalCost).toBe(25);
  });

  it('bloqueia alteracao de ingredientes sem permissao de gestao', async () => {
    const service = new ProductRecipesBackendService({} as any, { recordFromContext: jest.fn() } as any);

    await expect(service.replaceItems(ctx, 'product-a', [])).rejects.toThrow(
      new ForbiddenException('Sem permissao para alterar ingredientes.'),
    );
  });
});
