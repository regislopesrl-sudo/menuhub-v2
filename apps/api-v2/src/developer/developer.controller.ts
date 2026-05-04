import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { signTechnicalToken } from '../common/technical-auth';
import { requireDeveloperAreaAccess } from '../common/developer-access';

@Controller('v2/developer')
export class DeveloperController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  login(@Body() body: { accessCode?: string }) {
    const expectedCode = process.env.DEVELOPER_ACCESS_CODE?.trim();
    const providedCode = body?.accessCode?.trim();

    if (!expectedCode || !providedCode || expectedCode !== providedCode) {
      throw new UnauthorizedException('Codigo de acesso invalido.');
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const sessionToken = signTechnicalToken({
      sub: 'developer-code',
      email: 'developer@local',
      role: 'DEVELOPER_SESSION',
      exp: Math.floor(Date.parse(expiresAt) / 1000),
    });
    return {
      role: 'developer' as const,
      expiresAt,
      sessionToken,
    };
  }

  @Get('companies')
  async listCompanies(@Headers() headers: Record<string, string | string[] | undefined>) {
    requireDeveloperAreaAccess(headers);
    return this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });
  }

  @Post('companies')
  async createCompany(
    @Body()
    body: {
      name: string;
      legalName: string;
      document?: string;
      slug: string;
      email?: string;
      phone?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    return this.prisma.company.create({
      data: {
        name: body.name,
        legalName: body.legalName,
        tradeName: body.name,
        document: body.document,
        slug: body.slug,
        email: body.email,
        phone: body.phone,
        status: body.status ?? 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });
  }

  @Patch('companies/:id')
  async patchCompany(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      legalName?: string;
      document?: string;
      slug?: string;
      email?: string;
      phone?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    return this.prisma.company.update({
      where: { id },
      data: {
        name: body.name,
        legalName: body.legalName,
        document: body.document,
        slug: body.slug,
        email: body.email,
        phone: body.phone,
        status: body.status,
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        slug: true,
        email: true,
        phone: true,
        status: true,
      },
    });
  }

  @Get('companies/:id/subscription')
  async getCompanySubscription(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId: id },
      orderBy: { startsAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
    });

    return subscription;
  }

  @Post('companies/:id/subscription')
  async createCompanySubscription(
    @Param('id') id: string,
    @Body()
    body: {
      planId: string;
      status: SubscriptionStatus;
      startsAt: string;
      endsAt?: string;
      trialEndsAt?: string;
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    const plan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ id: body.planId }, { key: body.planId }],
      },
      select: { id: true },
    });
    if (!plan) {
      throw new BadRequestException('Plano informado nao existe.');
    }

    if (body.status === 'ACTIVE') {
      const existingActive = await this.prisma.companySubscription.findFirst({
        where: {
          companyId: id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (existingActive) {
        throw new UnauthorizedException('Empresa ja possui assinatura ACTIVE.');
      }
    }

    return this.prisma.companySubscription.create({
      data: {
        companyId: id,
        planId: plan.id,
        status: body.status,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null,
      },
      include: {
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
    });
  }

  @Patch('companies/:id/subscription/:subscriptionId')
  async patchCompanySubscription(
    @Param('id') id: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body()
    body: {
      status?: SubscriptionStatus;
      endsAt?: string | null;
      trialEndsAt?: string | null;
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireDeveloperAreaAccess(headers);
    const current = await this.prisma.companySubscription.findFirst({
      where: { id: subscriptionId, companyId: id },
      select: { id: true },
    });
    if (!current) {
      throw new BadRequestException('Assinatura nao encontrada para a empresa informada.');
    }

    return this.prisma.companySubscription.update({
      where: { id: subscriptionId },
      data: {
        status: body.status,
        endsAt: body.endsAt === undefined ? undefined : body.endsAt === null ? null : new Date(body.endsAt),
        trialEndsAt:
          body.trialEndsAt === undefined
            ? undefined
            : body.trialEndsAt === null
              ? null
              : new Date(body.trialEndsAt),
      },
      include: {
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
    });
  }
}
