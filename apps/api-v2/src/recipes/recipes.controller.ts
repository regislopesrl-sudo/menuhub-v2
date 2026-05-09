import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../common/rbac';
import { RecipesService } from './recipes.service';

@Controller('v2/recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @RequirePermissions(
    TENANT_PERMISSIONS.CATALOG_READ,
    TENANT_PERMISSIONS.CATALOG_MANAGE,
    PLATFORM_PERMISSIONS.MODULES_MANAGE,
  )
  list(@CurrentContext() ctx: RequestContext) {
    return this.recipesService.list(ctx.companyId);
  }

  @Get(':recipeId')
  @RequirePermissions(
    TENANT_PERMISSIONS.CATALOG_READ,
    TENANT_PERMISSIONS.CATALOG_MANAGE,
    PLATFORM_PERMISSIONS.MODULES_MANAGE,
  )
  getById(@CurrentContext() ctx: RequestContext, @Param('recipeId') recipeId: string) {
    return this.recipesService.getById(ctx.companyId, recipeId);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  create(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name: string;
      type: 'SALE' | 'PRODUCTION';
      yieldQuantity: number;
      yieldUnit: string;
      lossPercent?: number;
      active?: boolean;
    },
  ) {
    return this.recipesService.create(ctx.companyId, body);
  }

  @Patch(':recipeId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  update(
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
    return this.recipesService.update(ctx.companyId, recipeId, body);
  }

  @Post(':recipeId/items')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  addItem(
    @CurrentContext() ctx: RequestContext,
    @Param('recipeId') recipeId: string,
    @Body()
    body: {
      stockItemId: string;
      quantity: number;
      unit: string;
      optional?: boolean;
      affectsStock?: boolean;
      affectsCost?: boolean;
    },
  ) {
    return this.recipesService.addItem(ctx.companyId, recipeId, body);
  }

  @Patch(':recipeId/items/:itemId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  updateItem(
    @CurrentContext() ctx: RequestContext,
    @Param('recipeId') recipeId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: Partial<{
      quantity: number;
      unit: string;
      optional: boolean;
      affectsStock: boolean;
      affectsCost: boolean;
    }>,
  ) {
    return this.recipesService.updateItem(ctx.companyId, recipeId, itemId, body);
  }
}
