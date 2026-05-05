import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ModuleKey } from '@delivery-futuro/shared-types';
import { Public } from '../common/public.decorator';
import { RequireDeveloperGuard } from '../common/require-developer.guard';
import { ModulesService } from '../modules/modules.service';
import { AuthServiceV2 } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';

@Controller('v2/developer')
export class DeveloperController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly authService: AuthServiceV2,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: { code?: string }) {
    return this.authService.loginWithDeveloperCode({ code: body.code ?? '' });
  }

  @Get('plans')
  @UseGuards(RequireDeveloperGuard)
  listPlans() {
    return this.modulesService.listPlans();
  }

  @Post('plans')
  @UseGuards(RequireDeveloperGuard)
  createPlan(
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    return this.modulesService.createPlan(body);
  }

  @Patch('plans/:id')
  @UseGuards(RequireDeveloperGuard)
  updatePlan(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      modules?: Array<{ moduleKey: ModuleKey; enabled?: boolean; adminOnly?: boolean }>;
      limits?: Array<{ limitKey: string; limitValue: number }>;
    },
  ) {
    return this.modulesService.updatePlan(id, body);
  }

  @Get('companies')
  @UseGuards(RequireDeveloperGuard)
  async listCompanies() {
    const rows = await this.prisma.company.findMany({
      orderBy: [{ createdAt: 'desc' }],
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

    return rows.map((item) => ({
      ...item,
      status: item.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    }));
  }

  @Post('companies')
  @UseGuards(RequireDeveloperGuard)
  async createCompany(
    @Body()
    body: {
      name: string;
      legalName: string;
      document?: string | null;
      slug?: string | null;
      email?: string | null;
      phone?: string | null;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
  ) {
    const name = String(body?.name ?? '').trim();
    const legalName = String(body?.legalName ?? '').trim();
    const slug = String(body?.slug ?? '').trim().toLowerCase() || null;

    if (!name) {
      throw new BadRequestException('name obrigatorio.');
    }
    if (!legalName) {
      throw new BadRequestException('legalName obrigatorio.');
    }

    const created = await this.prisma.company.create({
      data: {
        name,
        tradeName: name,
        legalName,
        document: String(body?.document ?? '').trim() || null,
        slug,
        email: String(body?.email ?? '').trim() || null,
        phone: String(body?.phone ?? '').trim() || null,
        status: body?.status ?? 'ACTIVE',
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

    return {
      ...created,
      status: created.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    };
  }

  @Patch('companies/:companyId')
  @UseGuards(RequireDeveloperGuard)
  async updateCompany(
    @Param('companyId') companyId: string,
    @Body()
    body: Partial<{
      name: string;
      legalName: string;
      document: string | null;
      slug: string | null;
      email: string | null;
      phone: string | null;
      status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    }>,
  ) {
    const nextName = body.name !== undefined ? String(body.name).trim() : undefined;
    const nextLegalName = body.legalName !== undefined ? String(body.legalName).trim() : undefined;
    if (body.name !== undefined && !nextName) {
      throw new BadRequestException('name nao pode ser vazio.');
    }
    if (body.legalName !== undefined && !nextLegalName) {
      throw new BadRequestException('legalName nao pode ser vazio.');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextLegalName !== undefined ? { legalName: nextLegalName } : {}),
        ...(body.document !== undefined ? { document: String(body.document ?? '').trim() || null } : {}),
        ...(body.slug !== undefined ? { slug: String(body.slug ?? '').trim().toLowerCase() || null } : {}),
        ...(body.email !== undefined ? { email: String(body.email ?? '').trim() || null } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone ?? '').trim() || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
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

    return {
      ...updated,
      status: updated.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    };
  }

  @Get('companies/:companyId/modules')
  @UseGuards(RequireDeveloperGuard)
  getCompanyModules(@Param('companyId') companyId: string) {
    return this.modulesService.listCurrentCompanyModules(companyId);
  }

  @Patch('companies/:companyId/modules/:moduleKey')
  @UseGuards(RequireDeveloperGuard)
  updateCompanyModule(
    @Param('companyId') companyId: string,
    @Param('moduleKey') moduleKey: ModuleKey,
    @Body() body: { enabled: boolean },
  ) {
    return this.modulesService.updateCompanyModuleOverride({
      companyId,
      moduleKey,
      enabled: Boolean(body?.enabled),
    });
  }
}
