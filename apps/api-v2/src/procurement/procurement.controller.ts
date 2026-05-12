import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { RequireAdminGuard } from '../common/require-admin.guard';
import type { RequestContext } from '../common/request-context';
import { ProcurementService } from './procurement.service';

@Controller('v2/admin/procurement')
@UseGuards(RequireAdminGuard)
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('suppliers')
  @RequirePermissions(TENANT_PERMISSIONS.SUPPLIERS_READ, TENANT_PERMISSIONS.SUPPLIERS_MANAGE)
  listSuppliers(@CurrentContext() ctx: RequestContext) {
    return this.procurementService.listSuppliers(ctx);
  }

  @Post('suppliers')
  @RequirePermissions(TENANT_PERMISSIONS.SUPPLIERS_MANAGE)
  createSupplier(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { name: string; document?: string; email?: string; phone?: string; notes?: string },
  ) {
    return this.procurementService.createSupplier(ctx, body);
  }

  @Patch('suppliers/:id')
  @RequirePermissions(TENANT_PERMISSIONS.SUPPLIERS_MANAGE)
  updateSupplier(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.procurementService.updateSupplier(ctx, id, body);
  }

  @Get('purchase-orders')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  listPurchaseOrders(@CurrentContext() ctx: RequestContext) {
    return this.procurementService.listPurchaseOrders(ctx);
  }

  @Post('purchase-orders')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  createPurchaseOrder(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      supplierId: string;
      notes?: string;
      expectedDeliveryDate?: string;
      items: Array<{ stockItemId: string; quantity: number; unitCost: number; unit?: string }>;
    },
  ) {
    return this.procurementService.createPurchaseOrder(ctx, body);
  }

  @Post('purchase-orders/:id/approve')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  approvePurchaseOrder(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.procurementService.approvePurchaseOrder(ctx, id);
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  cancelPurchaseOrder(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.procurementService.cancelPurchaseOrder(ctx, id);
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  receivePurchaseOrder(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body()
    body: {
      invoiceNumber?: string;
      invoiceKey?: string;
      dueDate?: string;
      items: Array<{
        stockItemId: string;
        receivedQuantity: number;
        unitCost: number;
        orderedQuantity?: number;
        batchNumber?: string;
        expirationDate?: string;
      }>;
    },
  ) {
    return this.procurementService.receivePurchaseOrder(ctx, id, body);
  }

  @Get('receipts')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  listReceipts(@CurrentContext() ctx: RequestContext) {
    return this.procurementService.listReceipts(ctx);
  }

  @Post('receipts/:id/conference')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  conferenceReceipt(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.procurementService.conferenceReceipt(ctx, id);
  }

  @Get('quotations')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  listQuotations(@CurrentContext() ctx: RequestContext, @Query('stockItemId') stockItemId: string) {
    return this.procurementService.listQuotations(ctx, stockItemId);
  }

  @Get('history')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  listPurchaseHistory(@CurrentContext() ctx: RequestContext, @Query('stockItemId') stockItemId: string) {
    return this.procurementService.listPurchaseHistory(ctx, stockItemId);
  }

  @Get('average-cost')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  getAverageCost(@CurrentContext() ctx: RequestContext, @Query('stockItemId') stockItemId: string) {
    return this.procurementService.getAverageCost(ctx, stockItemId);
  }

  @Get('accounts-payable')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_READ, TENANT_PERMISSIONS.BILLING_MANAGE)
  listAccountsPayable(@CurrentContext() ctx: RequestContext) {
    return this.procurementService.listAccountsPayable(ctx);
  }

  @Get('fiscal-documents')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  listPurchaseDocuments(@CurrentContext() ctx: RequestContext) {
    return this.procurementService.listPurchaseDocuments(ctx);
  }

  @Post('fiscal-documents/import-by-access-key')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  importFiscalDocumentByAccessKey(
    @CurrentContext() ctx: RequestContext,
    @Body() body: { accessKey: string; supplierId?: string; documentType?: 'NFE' | 'NFCE' },
  ) {
    return this.procurementService.importFiscalDocumentByAccessKey(ctx, body);
  }

  @Get('fiscal-documents/:id')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_READ, TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  getPurchaseDocument(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.procurementService.getPurchaseDocument(ctx, id);
  }

  @Patch('fiscal-documents/:id/items/:itemId/mapping')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  mapPurchaseDocumentItem(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { stockItemId: string; conversionFactor?: number },
  ) {
    return this.procurementService.mapPurchaseDocumentItem(ctx, id, itemId, body);
  }

  @Patch('fiscal-documents/:id/items/:itemId/ignore')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  ignorePurchaseDocumentItem(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.procurementService.ignorePurchaseDocumentItem(ctx, id, itemId);
  }

  @Post('fiscal-documents/:id/confirm-stock-entry')
  @RequirePermissions(TENANT_PERMISSIONS.PROCUREMENT_MANAGE)
  confirmPurchaseDocumentStockEntry(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.procurementService.confirmPurchaseDocumentStockEntry(ctx, id);
  }
}

