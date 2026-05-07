import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { RequirePermissions } from '../common/permissions.decorator';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../common/rbac';
import { BillingService } from './billing.service';
import { assertCanAccessCompanyBillingAction } from './billing-platform.policy';

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
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:manage');
    return this.billingService.upsertBillingAccount(companyId, body);
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
    return this.billingService.createMockInvoice(companyId);
  }

  @Post('invoices/:invoiceId/pay/mock')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async payMockInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, ctx.companyId, 'billing:mock_payment');
    return this.billingService.payMockInvoice(invoiceId, ctx.companyId);
  }

  @Post('invoices/:invoiceId/payment-link')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async createPaymentLink(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, ctx.companyId, 'billing:manage');
    return this.billingService.createPaymentLink(invoiceId, ctx.companyId);
  }

  @Post('companies/:companyId/billing/run-cycle')
  @RequirePermissions(TENANT_PERMISSIONS.BILLING_MANAGE, PLATFORM_PERMISSIONS.BILLING_MANAGE)
  async runBillingCycle(
    @Param('companyId') companyId: string,
    @Body() body: { referenceDate?: string },
    @CurrentContext() ctx: RequestContext,
  ) {
    assertCanAccessCompanyBillingAction(ctx, companyId, 'billing:run_cycle');
    return this.billingService.runBillingCycle(companyId, body?.referenceDate);
  }
}
