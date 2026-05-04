import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyBilling(companyId: string) {
    const [company, account, subscription] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, legalName: true } }),
      this.prisma.billingAccount.findUnique({ where: { companyId } }),
      this.prisma.companySubscription.findFirst({
        where: { companyId },
        orderBy: { startsAt: 'desc' },
        include: { plan: { select: { id: true, key: true, name: true } } },
      }),
    ]);

    if (!company) {
      throw new NotFoundException(`Empresa '${companyId}' nao encontrada.`);
    }

    return { company, billingAccount: account, subscription };
  }

  async upsertBillingAccount(
    companyId: string,
    input: { billingEmail: string; document?: string; legalName?: string; addressJson?: Prisma.InputJsonValue },
  ) {
    return this.prisma.billingAccount.upsert({
      where: { companyId },
      update: {
        billingEmail: input.billingEmail,
        document: input.document,
        legalName: input.legalName,
        addressJson: input.addressJson,
      },
      create: {
        companyId,
        billingEmail: input.billingEmail,
        document: input.document,
        legalName: input.legalName,
        addressJson: input.addressJson,
      },
    });
  }

  async listInvoices(companyId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        attempts: true,
      },
    });
  }

  async createMockInvoice(companyId: string) {
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId },
      orderBy: { startsAt: 'desc' },
      include: { plan: { select: { id: true, key: true, name: true } } },
    });

    if (!subscription || (subscription.status !== SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.TRIAL)) {
      throw new BadRequestException('Empresa sem assinatura ativa para gerar fatura.');
    }

    const amountByPlanKey: Record<string, number> = {
      starter: 9900,
      pro: 19900,
      enterprise: 49900,
      basic: 9900,
    };
    const amountCents = amountByPlanKey[subscription.plan.key] ?? 19900;
    const description = `Assinatura ${subscription.plan.name}`;

    return this.prisma.invoice.create({
      data: {
        companyId,
        subscriptionId: subscription.id,
        status: InvoiceStatus.OPEN,
        amountCents,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        items: {
          create: {
            description,
            quantity: 1,
            unitAmountCents: amountCents,
            totalAmountCents: amountCents,
          },
        },
      },
      include: {
        items: true,
        attempts: true,
      },
    });
  }

  async payMockInvoice(invoiceId: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura nao encontrada.');
    }
    if (invoice.companyId !== companyId) {
      throw new NotFoundException('Fatura nao encontrada para a empresa atual.');
    }

    const providerPaymentId = `mock_${invoice.id}_${Date.now()}`;

    await this.prisma.paymentAttempt.create({
      data: {
        invoiceId: invoice.id,
        provider: 'mock',
        providerPaymentId,
        status: 'SUCCEEDED',
      },
    });

    const paid = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
      include: {
        items: true,
        attempts: true,
      },
    });

    if (invoice.subscriptionId) {
      await this.prisma.companySubscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
    }

    return paid;
  }
}
