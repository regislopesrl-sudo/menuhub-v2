import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { ModuleAccess } from '../modules/module-access.decorator';
import { ModuleGuard } from '../modules/module.guard';
import { StockService } from './stock.service';

@Controller('v2/admin/stock')
@UseGuards(RequireAdminGuard, ModuleGuard)
@ModuleAccess('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('items')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  listItems(@CurrentContext() ctx: RequestContext) {
    return this.stockService.listItems(ctx);
  }

  @Post('items')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  createItem(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      name: string;
      code?: string;
      purchaseUnit?: string;
      stockUnit?: string;
      productionUnit?: string;
      conversionFactor?: number;
      minimumQuantity?: number;
      reorderPoint?: number;
      averageCost?: number;
      leadTimeDays?: number;
      controlsStock?: boolean;
      controlsBatch?: boolean;
      controlsExpiry?: boolean;
      requiresFefo?: boolean;
      isPerishable?: boolean;
      isFractionable?: boolean;
      isCritical?: boolean;
      isHighTurnover?: boolean;
      allowNegativeStock?: boolean;
    },
  ) {
    return this.stockService.createItem(ctx, body);
  }

  @Patch('items/:id')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  updateItem(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.stockService.updateItem(ctx, id, body as any);
  }

  @Get('items/:id/batches')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  listBatches(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.stockService.listBatches(ctx, id);
  }

  @Post('items/:id/batches')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  createBatch(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: { batchNumber?: string; expirationDate?: string; receivedDate?: string; initialQuantity: number; unitCost?: number; notes?: string },
  ) {
    return this.stockService.createBatch(ctx, { ...body, stockItemId: id });
  }

  @Patch('items/:id/batches/:batchId/status')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  updateBatchStatus(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('batchId') batchId: string,
    @Body() body: { status: 'AVAILABLE' | 'OPENED' | 'QUARANTINED' | 'DISCARDED' | 'EXPIRED'; notes?: string },
  ) {
    return this.stockService.updateBatchStatus(ctx, { ...body, stockItemId: id, batchId });
  }

  @Get('movements')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  listMovements(
    @CurrentContext() ctx: RequestContext,
    @Query('stockItemId') stockItemId?: string,
    @Query('batchId') batchId?: string,
    @Query('movementType') movementType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.stockService.listMovements(ctx, { stockItemId, batchId, movementType, from, to });
  }

  @Post('movements/entry')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  manualEntry(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; unitCost?: number; batchId?: string; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.manualEntry(ctx, body);
  }

  @Post('movements/exit')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  manualExit(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; unitCost?: number; batchId?: string; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.manualExit(ctx, body);
  }

  @Post('inventory/counts')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  applyInventoryCount(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { counts: Array<{ stockItemId: string; countedQuantity: number; reasonCode?: string; notes?: string }>; notes?: string },
  ) {
    return this.stockService.applyInventoryCount(ctx, body);
  }

  @Post('inventory/batch-counts')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  applyBatchInventoryCount(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; batchId: string; countedQuantity: number; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.applyBatchInventoryCount(ctx, body);
  }

  @Post('conversions/estimate')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  estimateConversion(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; fromUnit: string; toUnit: string },
  ) {
    return this.stockService.estimateUnitConversion(ctx, body);
  }

  @Get('alerts/breakage')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  listBreakageAlerts(@CurrentContext() ctx: RequestContext) {
    return this.stockService.listBreakageAlerts(ctx);
  }

  @Post('movements/loss')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  registerLoss(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; unitCost?: number; batchId?: string; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.registerLoss(ctx, body);
  }
}
