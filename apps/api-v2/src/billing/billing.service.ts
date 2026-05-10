import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentAttemptStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BILLING_PROVIDER_TOKEN } from './providers/billing-provider.tokens';
import type { BillingProvider } from './providers/billing-provider.interface';
import { assertValidSubscriptionTransition } from './billing-platform.policy';

const FALLBACK_MODULES = [
  'pdv',
  'kds',
  'delivery',
  'menu',
  'payments',
  'kiosk',
  'waiter_app',
  'reports',
] as const;

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

  async getCurrentBillingOverview(companyId: string) {
    const [subscription, moduleOverrides, invoices, branchesUsed, usersUsed] = await Promise.all([
      this.prisma.companySubscription.findFirst({
        where: { companyId },
        orderBy: { startsAt: 'desc' },
        include: {
          plan: {
            include: {
              modules: true,
              limits: true,
            },
          },
        },
      }),
      this.prisma.companyModuleOverride.findMany({
        where: { companyId },
        select: { moduleKey: true, enabled: true },
      }),
      this.prisma.invoice.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { attempts: true },
      }),
      this.prisma.branch.count({ where: { companyId, isActive: true } }),
      this.prisma.userCompanyMembership.count({ where: { companyId, isActive: true } }),
    ]);

    const overrideMap = new Map(moduleOverrides.map((item: { moduleKey: string; enabled: boolean | null }) => [item.moduleKey, item.enabled]));
    const planModuleMap = new Map(
      (subscription?.plan.modules ?? []).map((moduleItem: { moduleKey: string; enabled: boolean; adminOnly: boolean }) => [moduleItem.moduleKey, moduleItem]),
    );

    const moduleKeys = new Set<string>([
      ...FALLBACK_MODULES,
      ...(subscription?.plan.modules ?? []).map((item: { moduleKey: string }) => item.moduleKey),
      ...moduleOverrides.map((item: { moduleKey: string }) => item.moduleKey),
    ]);

    const modules = Array.from(moduleKeys)
      .sort()
      .map((key) => {
        const planModule = planModuleMap.get(key);
        const overrideEnabled = overrideMap.has(key) ? overrideMap.get(key) : null;
        const includedInPlan = Boolean(planModule?.enabled);
        const enabledByDefault = false;
        const enabled =
          overrideEnabled === null || overrideEnabled === undefined
            ? includedInPlan || enabledByDefault
            : Boolean(overrideEnabled);
        let source: 'plan' | 'default' | 'company_override' = 'default';
        if (overrideEnabled !== null && overrideEnabled !== undefined) {
          source = 'company_override';
        } else if (includedInPlan) {
          source = 'plan';
        }
        return {
          key,
          name: this.humanizeModuleKey(key),
          enabled,
          includedInPlan,
          source,
          overrideEnabled: overrideEnabled ?? null,
          adminOnly: planModule?.adminOnly ?? false,
          blocked: !enabled,
        };
      });

    const limitsRaw = subscription?.plan.limits ?? [];
    const limits = limitsRaw.map((item: { limitKey: string; limitValue: number }) => {
      const used = this.resolveUsedLimit(item.limitKey, branchesUsed, usersUsed);
      return {
        key: item.limitKey,
        label: this.humanizeLimitKey(item.limitKey),
        limit: item.limitValue,
        used,
      };
    });

    const status =
      subscription?.status === SubscriptionStatus.ACTIVE
        ? 'active'
        : subscription?.status === SubscriptionStatus.TRIAL
          ? 'trialing'
          : subscription?.status === SubscriptionStatus.PAST_DUE
            ? 'past_due'
            : subscription?.status === SubscriptionStatus.CANCELED
              ? 'canceled'
              : subscription?.status === SubscriptionStatus.EXPIRED
                ? 'expired'
                : 'missing_subscription';

    const nextOpenInvoice = invoices.find((item: { status: InvoiceStatus }) => item.status === InvoiceStatus.OPEN);
    const lastPaidInvoice = invoices.find((item: { status: InvoiceStatus }) => item.status === InvoiceStatus.PAID);
    const now = new Date();
    const pastDueInvoices = invoices.filter((item: { status: InvoiceStatus }) => item.status === InvoiceStatus.PAST_DUE);
    const oldestPastDue = pastDueInvoices
      .map((item: { dueDate: Date }) => item.dueDate)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const delinquencyDays = oldestPastDue
      ? Math.max(0, Math.floor((now.getTime() - oldestPastDue.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    const isDelinquent = status === 'past_due' || pastDueInvoices.length > 0;
    const providerName = (process.env.BILLING_PROVIDER ?? 'mock').trim().toLowerCase() || 'mock';

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt.toISOString(),
            endsAt: subscription.endsAt?.toISOString() ?? null,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            cancelAt: subscription.endsAt?.toISOString() ?? null,
          }
        : null,
      plan: subscription
        ? {
            id: subscription.plan.id,
            key: subscription.plan.key,
            name: subscription.plan.name,
            description: subscription.plan.description ?? '',
            priceCents: this.resolvePlanPriceCents(subscription.plan.key),
            currency: 'BRL',
            billingInterval: 'monthly',
          }
        : null,
      modules,
      limits,
      billing: {
        status,
        isDelinquent,
        delinquencyDays,
        oldestPastDueAt: oldestPastDue?.toISOString() ?? null,
        recommendedAction: isDelinquent ? 'regularize_payment' : 'none',
        nextBillingAt: nextOpenInvoice?.dueDate?.toISOString() ?? null,
        lastPaymentAt: lastPaidInvoice?.paidAt?.toISOString() ?? null,
        provider: providerName,
      },
      history: invoices.map((item: { id: string; status: InvoiceStatus; amountCents: number; dueDate: Date; paidAt: Date | null; createdAt: Date }) => ({
        id: item.id,
        status: item.status,
        amountCents: item.amountCents,
        dueDate: item.dueDate.toISOString(),
        paidAt: item.paidAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      support: {
        canUpgrade: true,
        upgradeAction: 'contact_support',
      },
    };
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

  async getInvoiceById(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        attempts: true,
        statusEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!invoice || invoice.companyId !== companyId) {
      throw new NotFoundException('Fatura nao encontrada para a empresa atual.');
    }

    return invoice;
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

  async changeSubscriptionPlanMock(
    companyId: string,
    input: { targetPlanId: string; effectiveAt?: string; reason?: string },
  ) {
    const targetPlanId = String(input.targetPlanId ?? '').trim();
    if (!targetPlanId) {
      throw new BadRequestException('targetPlanId obrigatorio.');
    }

    const [currentSubscription, targetPlan] = await Promise.all([
      this.prisma.companySubscription.findFirst({
        where: { companyId },
        orderBy: { startsAt: 'desc' },
        include: { plan: { select: { id: true, key: true, name: true } } },
      }),
      this.prisma.plan.findUnique({
        where: { id: targetPlanId },
        select: { id: true, key: true, name: true, isActive: true },
      }),
    ]);

    if (!currentSubscription) {
      throw new BadRequestException('Empresa sem assinatura para trocar plano.');
    }
    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('Plano alvo nao encontrado/ativo.');
    }
    if (currentSubscription.planId === targetPlan.id) {
      throw new BadRequestException('Assinatura ja esta no plano informado.');
    }

    const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : new Date();
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('effectiveAt invalido.');
    }

    const fromPrice = this.resolvePlanPriceCents(currentSubscription.plan.key);
    const toPrice = this.resolvePlanPriceCents(targetPlan.key);
    const changeType = toPrice >= fromPrice ? 'upgrade' : 'downgrade';

    const updated = await this.prisma.companySubscription.update({
      where: { id: currentSubscription.id },
      data: { planId: targetPlan.id },
      include: { plan: { select: { id: true, key: true, name: true } } },
    });

    await this.prisma.subscriptionStatusEvent.create({
      data: {
        subscriptionId: currentSubscription.id,
        fromStatus: currentSubscription.status,
        toStatus: currentSubscription.status,
        reason: `PLAN_${changeType.toUpperCase()}${input.reason ? `:${input.reason}` : ''}`,
      },
    });

    return {
      subscriptionId: updated.id,
      companyId,
      effectiveAt: effectiveAt.toISOString(),
      changeType,
      fromPlan: {
        id: currentSubscription.plan.id,
        key: currentSubscription.plan.key,
        name: currentSubscription.plan.name,
      },
      toPlan: {
        id: updated.plan.id,
        key: updated.plan.key,
        name: updated.plan.name,
      },
      status: updated.status,
    };
  }

  async getCommercialHistory(companyId: string, limitInput?: number) {
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(100, Number(limitInput))) : 30;

    const [subscriptionEvents, invoiceEvents, moduleEvents] = await Promise.all([
      this.prisma.subscriptionStatusEvent.findMany({
        where: { subscription: { companyId } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { subscription: { select: { id: true, planId: true, companyId: true } } },
      }),
      this.prisma.invoiceStatusEvent.findMany({
        where: { invoice: { companyId } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          invoice: {
            select: {
              id: true,
              companyId: true,
              subscriptionId: true,
              amountCents: true,
              dueDate: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.companyModuleAuditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const timeline = [
      ...subscriptionEvents.map((event) => ({
        type: 'subscription_status' as const,
        createdAt: event.createdAt.toISOString(),
        payload: {
          id: event.id,
          subscriptionId: event.subscriptionId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          reason: event.reason ?? null,
          planId: event.subscription?.planId ?? null,
        },
      })),
      ...invoiceEvents.map((event) => ({
        type: 'invoice_status' as const,
        createdAt: event.createdAt.toISOString(),
        payload: {
          id: event.id,
          invoiceId: event.invoiceId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          reason: event.reason ?? null,
          amountCents: event.invoice.amountCents,
          dueDate: event.invoice.dueDate.toISOString(),
          currentStatus: event.invoice.status,
        },
      })),
      ...moduleEvents.map((event) => ({
        type: 'module_audit' as const,
        createdAt: event.createdAt.toISOString(),
        payload: {
          id: event.id,
          moduleKey: event.moduleKey,
          action: event.action,
          source: event.source,
          userId: event.userId ?? null,
          reason: event.reason ?? null,
        },
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      companyId,
      timeline,
      summary: {
        subscriptionEvents: subscriptionEvents.length,
        invoiceEvents: invoiceEvents.length,
        moduleAuditEvents: moduleEvents.length,
      },
    };
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
      if (currentSubscription) {
        assertValidSubscriptionTransition(currentSubscription.status, SubscriptionStatus.ACTIVE);
      }
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
      const attempts = await this.prisma.paymentAttempt.findMany({
        where: { provider, providerPaymentId: result.providerPaymentId },
        orderBy: { createdAt: 'desc' },
        include: { invoice: true },
        take: 2,
      });
      if (attempts.length > 1) {
        throw new BadRequestException(
          `Webhook ambiguo para providerPaymentId '${result.providerPaymentId}'.`,
        );
      }
      const attempt = attempts[0];

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
            if (currentSubscription) {
              assertValidSubscriptionTransition(currentSubscription.status, SubscriptionStatus.ACTIVE);
            }
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
      assertValidSubscriptionTransition(subscription.status, target);
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

  private resolvePlanPriceCents(planKey: string): number {
    const byPlan: Record<string, number> = {
      basic: 9900,
      starter: 9900,
      pro: 19900,
      enterprise: 49900,
    };
    return byPlan[planKey] ?? 0;
  }

  private resolveUsedLimit(limitKey: string, branchesUsed: number, usersUsed: number): number | null {
    if (limitKey === 'branches') return branchesUsed;
    if (limitKey === 'users') return usersUsed;
    return null;
  }

  private humanizeLimitKey(limitKey: string): string {
    const labels: Record<string, string> = {
      branches: 'Filiais',
      users: 'Usuarios',
      orders_per_month: 'Pedidos por mes',
      products: 'Produtos',
      channels: 'Canais habilitados',
    };
    return labels[limitKey] ?? limitKey.replace(/_/g, ' ');
  }

  private humanizeModuleKey(moduleKey: string): string {
    const labels: Record<string, string> = {
      pdv: 'PDV',
      kds: 'KDS',
      delivery: 'Delivery',
      menu: 'Catalogo',
      payments: 'Pagamentos',
      kiosk: 'Kiosk/Totem',
      waiter_app: 'App Garcom',
      reports: 'Relatorios',
    };
    return labels[moduleKey] ?? moduleKey;
  }
}
