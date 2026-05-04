import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentAttemptStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BILLING_PROVIDER_TOKEN } from './providers/billing-provider.tokens';
import type { BillingProvider } from './providers/billing-provider.interface';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER_TOKEN) private readonly provider: BillingProvider,
  ) {}

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

  async runBillingCycle(companyId: string, referenceDateInput?: string) {
    const referenceDate = referenceDateInput ? new Date(referenceDateInput) : new Date();
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId },
      orderBy: { startsAt: 'desc' },
      include: { plan: { select: { key: true, name: true } } },
    });
    if (!subscription) {
      throw new BadRequestException('Empresa sem assinatura para ciclo de cobranca.');
    }

    await this.markPastDueInvoices(companyId, referenceDate);

    const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0));

    const openForMonth = await this.prisma.invoice.findFirst({
      where: {
        companyId,
        createdAt: { gte: monthStart, lt: monthEnd },
        status: { in: [InvoiceStatus.OPEN] },
      },
    });

    let createdInvoiceId: string | null = null;
    if (!openForMonth && (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.TRIAL)) {
      const amountByPlanKey: Record<string, number> = { starter: 9900, basic: 9900, pro: 19900, enterprise: 49900 };
      const amountCents = amountByPlanKey[subscription.plan.key] ?? 19900;
      const dueDate = new Date(referenceDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + 7);

      const invoice = await this.prisma.invoice.create({
        data: {
          companyId,
          subscriptionId: subscription.id,
          status: InvoiceStatus.OPEN,
          amountCents,
          dueDate,
          items: {
            create: {
              description: `Assinatura mensal ${subscription.plan.name}`,
              quantity: 1,
              unitAmountCents: amountCents,
              totalAmountCents: amountCents,
            },
          },
        },
      });
      createdInvoiceId = invoice.id;
      await this.prisma.invoiceStatusEvent.create({
        data: {
          invoiceId: invoice.id,
          fromStatus: null,
          toStatus: InvoiceStatus.OPEN,
          reason: 'CYCLE_GENERATED',
        },
      });
    }

    await this.syncSubscriptionStatus(companyId);

    return { companyId, createdInvoiceId };
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
    await this.prisma.invoiceStatusEvent.create({
      data: {
        invoiceId: invoice.id,
        fromStatus: invoice.status,
        toStatus: InvoiceStatus.PAID,
        reason: 'MOCK_PAYMENT',
      },
    });

    if (invoice.subscriptionId) {
      const currentSubscription = await this.prisma.companySubscription.findUnique({ where: { id: invoice.subscriptionId } });
      await this.prisma.companySubscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      await this.prisma.subscriptionStatusEvent.create({
        data: {
          subscriptionId: invoice.subscriptionId,
          fromStatus: currentSubscription?.status ?? null,
          toStatus: SubscriptionStatus.ACTIVE,
          reason: 'INVOICE_PAID',
        },
      });
    }

    return paid;
  }

  async createPaymentLink(invoiceId: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.companyId !== companyId) {
      throw new NotFoundException('Fatura nao encontrada para a empresa atual.');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Fatura ja paga.');
    }

    const payment = await this.provider.createPaymentForInvoice(invoice);
    await this.prisma.paymentAttempt.create({
      data: {
        invoiceId: invoice.id,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        status: PaymentAttemptStatus.PENDING,
      },
    });

    return {
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      paymentUrl: payment.paymentUrl,
      status: payment.status,
    };
  }

  async handleWebhook(provider: string, payload: unknown, headers?: Record<string, string | string[] | undefined>) {
    if (provider !== this.provider.providerName) {
      throw new BadRequestException(`Provider de webhook invalido: ${provider}`);
    }

    const body = (payload ?? {}) as Record<string, unknown>;
    const payloadJson = (typeof payload === 'object' && payload !== null
      ? (payload as Prisma.InputJsonValue)
      : ({ raw: payload } as Prisma.InputJsonValue));
    const eventId = String(body.eventId ?? '');
    if (!eventId) {
      throw new BadRequestException('Payload de webhook invalido: eventId obrigatorio.');
    }

    const existing = await this.prisma.billingWebhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider,
          eventId,
        },
      },
    });
    if (existing) {
      return {
        provider,
        eventId,
        processed: false,
        reason: 'DUPLICATE_EVENT',
      };
    }

    const result = await this.provider.handleWebhook(payload, headers);
    await this.prisma.billingWebhookEvent.create({
      data: {
        provider,
        eventId,
        eventType: String(body.eventType ?? 'unknown'),
        payloadJson,
        processedAt: new Date(),
      },
    });

    if (result.providerPaymentId) {
      const attempt = await this.prisma.paymentAttempt.findFirst({
        where: { provider, providerPaymentId: result.providerPaymentId },
        orderBy: { createdAt: 'desc' },
        include: { invoice: true },
      });

      if (attempt) {
        if (result.status === 'PAID') {
          const prev = attempt.invoice.status;
          await this.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: PaymentAttemptStatus.SUCCEEDED },
          });
          await this.prisma.invoice.update({
            where: { id: attempt.invoiceId },
            data: { status: InvoiceStatus.PAID, paidAt: new Date() },
          });
          await this.prisma.invoiceStatusEvent.create({
            data: {
              invoiceId: attempt.invoiceId,
              fromStatus: prev,
              toStatus: InvoiceStatus.PAID,
              reason: 'WEBHOOK_PAID',
            },
          });
          if (attempt.invoice.subscriptionId) {
            const currentSubscription = await this.prisma.companySubscription.findUnique({
              where: { id: attempt.invoice.subscriptionId },
            });
            await this.prisma.companySubscription.update({
              where: { id: attempt.invoice.subscriptionId },
              data: { status: SubscriptionStatus.ACTIVE },
            });
            await this.prisma.subscriptionStatusEvent.create({
              data: {
                subscriptionId: attempt.invoice.subscriptionId,
                fromStatus: currentSubscription?.status ?? null,
                toStatus: SubscriptionStatus.ACTIVE,
                reason: 'WEBHOOK_PAID',
              },
            });
          }
        } else if (result.status === 'FAILED') {
          await this.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: PaymentAttemptStatus.FAILED },
          });
        }
      }
    }

    return result;
  }

  private async markPastDueInvoices(companyId: string, now: Date) {
    const overdue = await this.prisma.invoice.findMany({
      where: {
        companyId,
        status: InvoiceStatus.OPEN,
        dueDate: { lt: now },
      },
      select: { id: true, status: true },
    });

    for (const invoice of overdue) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAST_DUE },
      });
      await this.prisma.invoiceStatusEvent.create({
        data: {
          invoiceId: invoice.id,
          fromStatus: invoice.status,
          toStatus: InvoiceStatus.PAST_DUE,
          reason: 'PAST_DUE',
        },
      });
    }
  }

  private async syncSubscriptionStatus(companyId: string) {
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId },
      orderBy: { startsAt: 'desc' },
    });
    if (!subscription) return;

    const unpaid = await this.prisma.invoice.findFirst({
      where: {
        companyId,
        subscriptionId: subscription.id,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAST_DUE] },
      },
    });

    const target = unpaid ? SubscriptionStatus.PAST_DUE : SubscriptionStatus.ACTIVE;
    if (subscription.status !== target) {
      await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: { status: target },
      });
      await this.prisma.subscriptionStatusEvent.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: target,
          reason: unpaid ? 'UNPAID_INVOICE' : 'ALL_INVOICES_PAID',
        },
      });
    }
  }
}
