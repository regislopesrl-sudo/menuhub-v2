import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { requireDeveloperOrAdmin } from '../common/developer-role';
import { assertSameCompany } from '../common/assert-same-company';
import { BillingService } from './billing.service';

@Controller('v2/developer')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('companies/:companyId/billing')
  async getBilling(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    assertSameCompany(ctx.companyId, companyId);
    return this.billingService.getCompanyBilling(companyId);
  }

  @Put('companies/:companyId/billing-account')
  async upsertBillingAccount(
    @Param('companyId') companyId: string,
    @Body() body: { billingEmail: string; document?: string; legalName?: string; addressJson?: Prisma.InputJsonValue },
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    assertSameCompany(ctx.companyId, companyId);
    return this.billingService.upsertBillingAccount(companyId, body);
  }

  @Get('companies/:companyId/invoices')
  async listInvoices(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    assertSameCompany(ctx.companyId, companyId);
    return this.billingService.listInvoices(companyId);
  }

  @Post('companies/:companyId/invoices/mock')
  async createMockInvoice(
    @Param('companyId') companyId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    assertSameCompany(ctx.companyId, companyId);
    return this.billingService.createMockInvoice(companyId);
  }

  @Post('invoices/:invoiceId/pay/mock')
  async payMockInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    return this.billingService.payMockInvoice(invoiceId, ctx.companyId);
  }

  @Post('invoices/:invoiceId/payment-link')
  async createPaymentLink(
    @Param('invoiceId') invoiceId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    return this.billingService.createPaymentLink(invoiceId, ctx.companyId);
  }

  @Post('companies/:companyId/billing/run-cycle')
  async runBillingCycle(
    @Param('companyId') companyId: string,
    @Body() body: { referenceDate?: string },
    @CurrentContext() ctx: RequestContext,
  ) {
    requireDeveloperOrAdmin(ctx);
    assertSameCompany(ctx.companyId, companyId);
    return this.billingService.runBillingCycle(companyId, body?.referenceDate);
  }
}
