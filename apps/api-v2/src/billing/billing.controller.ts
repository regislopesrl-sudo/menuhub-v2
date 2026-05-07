import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../common/rbac';
import { BillingService } from './billing.service';
import { assertCanAccessCompanyBillingAction } from './billing-platform.policy';
import { assertRequiredBillingEmail } from './billing-validation';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import { AUDIT_ACTIONS } from '../common/audit-log';

@Controller('v2/developer')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('companies/:companyId/billing')
  @RequirePermissions(
    TENANT_PERMISSIONS.BILLING_READ,
    TENANT_PERMISSIONS.BILLING_MANAGE,
    PLATFORM_PERMISSIONS.BILLING_READ,
    PLATFORM_PERMISSIONS.BILLING_MANAGE,
  )
  async getBilling(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:read');
    return this.billingService.getCompanyBilling(companyId);
  }

  @Put('companies/:companyId/billing-account')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async upsertBillingAccount(
    @Param('companyId') companyId: string,
    @Body() body: { billingEmail: string; document?: string; legalName?: string; addressJson?: Prisma.InputJsonValue },
    @CurrentContext() ctx: RequestContext,
  ) {
    const billingEmail = assertRequiredBillingEmail(body?.billingEmail);
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:manage');
    try {
      const result = await this.billingService.upsertBillingAccount(companyId, { ...body, billingEmail });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_ACCOUNT_UPSERT,
        outcome: 'success',
        ctx,
        target: { type: 'billing_account', id: result.id, label: result.billingEmail },
        metadata: { companyId, billingEmail: result.billingEmail },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_ACCOUNT_UPSERT,
        outcome: 'failure',
        ctx,
        target: { type: 'billing_account', id: companyId },
        metadata: { companyId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('companies/:companyId/invoices')
  @RequirePermissions(
    TENANT_PERMISSIONS.BILLING_READ,
    TENANT_PERMISSIONS.BILLING_MANAGE,
    PLATFORM_PERMISSIONS.BILLING_READ,
    PLATFORM_PERMISSIONS.BILLING_MANAGE,
  )
  async listInvoices(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:read');
    return this.billingService.listInvoices(companyId);
  }

  @Post('companies/:companyId/invoices/mock')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async createMockInvoice(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:mock_payment');
    try {
      const result = await this.billingService.createMockInvoice(companyId);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_MOCK_PAYMENT,
        outcome: 'success',
        ctx,
        target: { type: 'invoice', id: result.id },
        metadata: { companyId, invoiceId: result.id, status: result.status },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_MOCK_PAYMENT,
        outcome: 'failure',
        ctx,
        target: { type: 'invoice' },
        metadata: { companyId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('invoices/:invoiceId/pay/mock')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async payMockInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, ctx.companyId, 'billing:mock_payment');
    try {
      const result = await this.billingService.payMockInvoice(invoiceId, ctx.companyId);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_MOCK_PAYMENT,
        outcome: 'success',
        ctx,
        target: { type: 'invoice', id: result.id },
        metadata: { companyId: ctx.companyId, invoiceId: result.id, status: result.status },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_MOCK_PAYMENT,
        outcome: 'failure',
        ctx,
        target: { type: 'invoice', id: invoiceId },
        metadata: { companyId: ctx.companyId, invoiceId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('invoices/:invoiceId/payment-link')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async createPaymentLink(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, ctx.companyId, 'billing:manage');
    try {
      const result = await this.billingService.createPaymentLink(invoiceId, ctx.companyId);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_PAYMENT_LINK_CREATE,
        outcome: 'success',
        ctx,
        target: { type: 'invoice', id: invoiceId },
        metadata: { companyId: ctx.companyId, invoiceId, provider: result.provider },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_PAYMENT_LINK_CREATE,
        outcome: 'failure',
        ctx,
        target: { type: 'invoice', id: invoiceId },
        metadata: { companyId: ctx.companyId, invoiceId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('companies/:companyId/billing/run-cycle')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async runBillingCycle(
    @Param('companyId') companyId: string,
    @Body() body: { referenceDate?: string },
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:run_cycle');
    try {
      const result = await this.billingService.runBillingCycle(companyId, body?.referenceDate);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_RUN_CYCLE,
        outcome: 'success',
        ctx,
        target: { type: 'company', id: companyId },
        metadata: { companyId, createdInvoiceId: result.createdInvoiceId ?? null },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.BILLING_RUN_CYCLE,
        outcome: 'failure',
        ctx,
        target: { type: 'company', id: companyId },
        metadata: { companyId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}
