import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AUDIT_ACTIONS } from '../../common/audit-log';
import { recordAuditFromContext } from '../../common/audit-log-recorder';
import { CurrentContext } from '../../common/current-context.decorator';
import { RequireAdminGuard } from '../../common/require-admin.guard';
import type { RequestContext } from '../../common/request-context';
import { RequirePermissions } from '../../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../../common/rbac';
import { BranchSalesHistoryService } from './branch-sales-history.service';

@Controller('v2/settings/branches/:branchId/sales-history')
@UseGuards(RequireAdminGuard)
export class BranchSalesHistoryController {
  constructor(private readonly service: BranchSalesHistoryService) {}

  @Get('template')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async template(@CurrentContext() ctx: RequestContext, @Param('branchId') branchId: string, @Res({ passthrough: true }) res: any) {
    const csv = await this.service.getTemplate(ctx, branchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vendas-historicas-24-meses.csv"');
    return csv;
  }

  @Get('template/real')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async realTemplate(@CurrentContext() ctx: RequestContext, @Param('branchId') branchId: string, @Res({ passthrough: true }) res: any) {
    const csv = await this.service.getTemplate(ctx, branchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vendas-reais-operacionais.csv"');
    return csv;
  }

  @Post('import/validate')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async validate(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @UploadedFile() file: any,
  ) {
    try {
      const result = await this.service.importFile(ctx, branchId, file, { previewOnly: true });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch_sales_history', id: result.id, label: 'preview' },
        metadata: { branchId, importId: result.id, mode: 'preview' },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch_sales_history', id: branchId, label: 'preview' },
        metadata: { branchId, mode: 'preview', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('import')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async import(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @UploadedFile() file: any,
  ) {
    try {
      const result = await this.service.importFile(ctx, branchId, file);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch_sales_history', id: result.id, label: 'import' },
        metadata: {
          branchId,
          importId: result.id,
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          source: 'IMPORTED_HISTORY',
        },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch_sales_history', id: branchId, label: 'import' },
        metadata: { branchId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('import/real/validate')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async validateReal(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @UploadedFile() file: any,
  ) {
    try {
      const result = await this.service.importFile(ctx, branchId, file, { previewOnly: true, target: 'orders' });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch_sales_history', id: result.id, label: 'preview_real_orders' },
        metadata: { branchId, importId: result.id, mode: 'preview_real_orders' },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch_sales_history', id: branchId, label: 'preview_real_orders' },
        metadata: { branchId, mode: 'preview_real_orders', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('import/real')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importReal(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @UploadedFile() file: any,
  ) {
    try {
      const result = await this.service.importFile(ctx, branchId, file, { target: 'orders' });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'branch_sales_history', id: result.id, label: 'real_orders_import' },
        metadata: {
          branchId,
          importId: result.id,
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          source: 'IMPORTED_REAL_ORDERS',
        },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        outcome: 'failure',
        ctx,
        target: { type: 'branch_sales_history', id: branchId, label: 'real_orders_import' },
        metadata: { branchId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('imports')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async imports(@CurrentContext() ctx: RequestContext, @Param('branchId') branchId: string) {
    return this.service.listImports(ctx, branchId);
  }

  @Get('imports/:importId')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async detail(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @Param('importId') importId: string,
  ) {
    return this.service.getImport(ctx, branchId, importId);
  }

  @Get('imports/:importId/errors')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_READ, TENANT_PERMISSIONS.SETTINGS_WRITE)
  async errors(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @Param('importId') importId: string,
  ) {
    return this.service.getImportErrors(ctx, branchId, importId);
  }

  @Post('imports/:importId/cancel')
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_WRITE)
  async cancel(
    @CurrentContext() ctx: RequestContext,
    @Param('branchId') branchId: string,
    @Param('importId') importId: string,
  ) {
    return this.service.cancelImport(ctx, branchId, importId);
  }
}
