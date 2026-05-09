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

  @Get('production-orders')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  listProductionOrders(@CurrentContext() ctx: RequestContext) {
    return this.recipesService.listProductionOrders(ctx);
  }

  @Post('production-orders')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  createProductionOrder(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      stockItemId: string;
      recipeId?: string | null;
      plannedQuantity: number;
    },
  ) {
    return this.recipesService.createProductionOrder(ctx, body);
  }

  @Patch('production-orders/:orderId/start')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  startProductionOrder(@CurrentContext() ctx: RequestContext, @Param('orderId') orderId: string) {
    return this.recipesService.startProductionOrder(ctx, orderId);
  }

  @Patch('production-orders/:orderId/finish')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  finishProductionOrder(
    @CurrentContext() ctx: RequestContext,
    @Param('orderId') orderId: string,
    @Body() body: { actualQuantity?: number },
  ) {
    return this.recipesService.finishProductionOrder(ctx, orderId, body.actualQuantity);
  }

  @Patch('production-orders/:orderId/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  cancelProductionOrder(
    @CurrentContext() ctx: RequestContext,
    @Param('orderId') orderId: string,
    @Body() body: { reason: string },
  ) {
    return this.recipesService.cancelProductionOrder(ctx, orderId, body.reason);
  }

  @Get('production-losses')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_READ, TENANT_PERMISSIONS.CATALOG_MANAGE)
  listProductionLosses(@CurrentContext() ctx: RequestContext) {
    return this.recipesService.listProductionLosses(ctx);
  }

  @Post('production-orders/:orderId/loss')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE)
  registerProductionLoss(
    @CurrentContext() ctx: RequestContext,
    @Param('orderId') orderId: string,
    @Body()
    body: {
      quantity: number;
      reason?: string;
    },
  ) {
    return this.recipesService.registerProductionLoss(ctx, orderId, body.quantity, body.reason);
  }
}

