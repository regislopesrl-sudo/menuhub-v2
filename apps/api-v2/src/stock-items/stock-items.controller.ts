import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../common/rbac';
import { StockItemsService } from './stock-items.service';

@Controller('v2/stock-items')
export class StockItemsController {
  constructor(private readonly stockItemsService: StockItemsService) {}

  @Get()
  @RequirePermissions(
    TENANT_PERMISSIONS.CATALOG_READ,
    TENANT_PERMISSIONS.CATALOG_MANAGE,
    PLATFORM_PERMISSIONS.MODULES_MANAGE,
  )
  list(@CurrentContext() ctx: RequestContext) {
    return this.stockItemsService.list(ctx.companyId);
  }

  @Post()
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  create(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name: string;
      code?: string | null;
      stockType?: 'RAW_MATERIAL' | 'PRODUCT' | 'ADDON';
      purchaseUnit?: string | null;
      stockUnit?: string | null;
      productionUnit?: string | null;
      conversionFactor?: number;
      minimumQuantity?: number;
      reorderPoint?: number;
      averageCost?: number;
      standardCost?: number;
      controlsStock?: boolean;
      controlsBatch?: boolean;
      controlsExpiry?: boolean;
      isPerishable?: boolean;
      isFractionable?: boolean;
      isCritical?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.stockItemsService.create(ctx.companyId, body);
  }

  @Patch(':stockItemId')
  @RequirePermissions(TENANT_PERMISSIONS.CATALOG_MANAGE, PLATFORM_PERMISSIONS.MODULES_MANAGE)
  update(
    @CurrentContext() ctx: RequestContext,
    @Param('stockItemId') stockItemId: string,
    @Body()
    body: Partial<{
      name: string;
      code: string | null;
      stockType: 'RAW_MATERIAL' | 'PRODUCT' | 'ADDON';
      purchaseUnit: string | null;
      stockUnit: string | null;
      productionUnit: string | null;
      conversionFactor: number;
      minimumQuantity: number;
      reorderPoint: number;
      averageCost: number;
      standardCost: number;
      controlsStock: boolean;
      controlsBatch: boolean;
      controlsExpiry: boolean;
      isPerishable: boolean;
      isFractionable: boolean;
      isCritical: boolean;
      isActive: boolean;
    }>,
  ) {
    return this.stockItemsService.update(ctx.companyId, stockItemId, body);
  }
}
