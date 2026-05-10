import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { StockService } from './stock.service';

@Controller('v2/admin/stock')
@UseGuards(RequireAdminGuard)
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
      minimumQuantity?: number;
      reorderPoint?: number;
      averageCost?: number;
      controlsBatch?: boolean;
      controlsExpiry?: boolean;
      isPerishable?: boolean;
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

  @Get('movements')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_READ, TENANT_PERMISSIONS.INVENTORY_MANAGE)
  listMovements(@CurrentContext() ctx: RequestContext, @Query('stockItemId') stockItemId?: string) {
    return this.stockService.listMovements(ctx, stockItemId);
  }

  @Post('movements/entry')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  manualEntry(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; unitCost?: number; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.manualEntry(ctx, body);
  }

  @Post('movements/exit')
  @RequirePermissions(TENANT_PERMISSIONS.INVENTORY_MANAGE)
  manualExit(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { stockItemId: string; quantity: number; unitCost?: number; reasonCode?: string; notes?: string },
  ) {
    return this.stockService.manualExit(ctx, body);
  }
}
