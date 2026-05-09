import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { RecipesService } from './recipes.service';

@Controller('v2/admin/recipes')
@UseGuards(RequireAdminGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  listRecipes(@CurrentContext() ctx: RequestContext) {
    return this.recipesService.listCompanyRecipes(ctx);
  }

  @Get(':recipeId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  getRecipe(@CurrentContext() ctx: RequestContext, @Param('recipeId') recipeId: string) {
    return this.recipesService.getRecipeById(ctx, recipeId);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  createRecipe(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name: string;
      type: 'SALE' | 'PRODUCTION';
      yieldQuantity: number;
      yieldUnit: string;
      lossPercent?: number | null;
      items: Array<{
        stockItemId: string;
        quantity: number;
        unit: string;
        optional?: boolean;
        affectsStock?: boolean;
        affectsCost?: boolean;
      }>;
    },
  ) {
    return this.recipesService.createRecipe(ctx, body);
  }

  @Patch(':recipeId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  patchRecipe(
    @CurrentContext() ctx: RequestContext,
    @Param('recipeId') recipeId: string,
    @Body()
    body: Partial<{
      name: string;
      type: 'SALE' | 'PRODUCTION';
      yieldQuantity: number;
      yieldUnit: string;
      lossPercent: number | null;
      active: boolean;
    }>,
  ) {
    return this.recipesService.updateRecipe(ctx, recipeId, body);
  }

  @Put(':recipeId/items')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  replaceItems(
    @CurrentContext() ctx: RequestContext,
    @Param('recipeId') recipeId: string,
    @Body()
    body: {
      items: Array<{
        stockItemId: string;
        quantity: number;
        unit: string;
        optional?: boolean;
        affectsStock?: boolean;
        affectsCost?: boolean;
      }>;
    },
  ) {
    return this.recipesService.replaceRecipeItems(ctx, recipeId, body.items);
  }

  @Get('compositions/products')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  listProductCompositions(@CurrentContext() ctx: RequestContext) {
    return this.recipesService.listProductCompositions(ctx);
  }

  @Get('compositions/products/:productId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  getProductComposition(@CurrentContext() ctx: RequestContext, @Param('productId') productId: string) {
    return this.recipesService.getProductComposition(ctx, productId);
  }

  @Patch('compositions/products/:productId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  patchProductComposition(
    @CurrentContext() ctx: RequestContext,
    @Param('productId') productId: string,
    @Body() body: { recipeId: string | null },
  ) {
    return this.recipesService.setProductRecipe(ctx, productId, body.recipeId ?? null);
  }

  @Get('compositions/products/:productId/cost')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  getProductSoldCost(
    @CurrentContext() ctx: RequestContext,
    @Param('productId') productId: string,
    @Query('portionQuantity') portionQuantity?: string,
  ) {
    return this.recipesService.getProductSoldCost(ctx, productId, {
      portionQuantity: portionQuantity ? Number(portionQuantity) : undefined,
    });
  }

  @Post(':recipeId/portioning/estimate')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  estimatePortioning(
    @CurrentContext() ctx: RequestContext,
    @Param('recipeId') recipeId: string,
    @Body()
    body: {
      portionQuantity: number;
      portionUnit?: string;
      extraLossPercent?: number;
    },
  ) {
    return this.recipesService.estimateRecipePortioning(ctx, recipeId, body);
  }

  @Get(':recipeId/cost-breakdown')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  getRecipeCostBreakdown(@CurrentContext() ctx: RequestContext, @Param('recipeId') recipeId: string) {
    return this.recipesService.getRecipeCostBreakdown(ctx, recipeId);
  }
}

