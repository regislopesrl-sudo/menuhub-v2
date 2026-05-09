import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { isPlatformContext } from '../common/platform-access';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

const UPDATE_KEYS: Array<keyof UpdateBranchDto> = [
  'name',
  'code',
  'phone',
  'whatsapp',
  'email',
  'city',
  'state',
  'zipCode',
  'street',
  'number',
  'complement',
  'district',
  'latitude',
  'longitude',
  'isActive',
];

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext) {
    const where =
      ctx.branchId && !isPlatformContext(ctx)
        ? { companyId: ctx.companyId, id: ctx.branchId }
        : { companyId: ctx.companyId };
    const rows = await this.prisma.branch.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      items: rows,
      total: rows.length,
    };
  }

  async create(ctx: RequestContext, body: CreateBranchDto) {
    const name = String(body?.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('name obrigatorio.');
    }
    const created = await this.prisma.branch.create({
      data: {
        companyId: ctx.companyId,
        name,
        code: this.normalizeOptional(body.code),
        phone: this.normalizeOptional(body.phone),
        whatsapp: this.normalizeOptional(body.whatsapp),
        email: this.normalizeOptional(body.email),
        city: this.normalizeOptional(body.city),
        state: this.normalizeOptional(body.state),
        zipCode: this.normalizeOptional(body.zipCode),
        street: this.normalizeOptional(body.street),
        number: this.normalizeOptional(body.number),
        complement: this.normalizeOptional(body.complement),
        district: this.normalizeOptional(body.district),
        latitude: this.normalizeCoordinate(body.latitude, 'latitude'),
        longitude: this.normalizeCoordinate(body.longitude, 'longitude'),
        isActive: body.isActive ?? true,
      },
    });
    return created;
  }

  async update(ctx: RequestContext, branchId: string, body: UpdateBranchDto) {
    this.assertNonEmptyPayload(body);
    await this.assertBranchBelongsToCompany(ctx, branchId);
    const nextName = body.name !== undefined ? String(body.name ?? '').trim() : undefined;
    if (body.name !== undefined && !nextName) {
      throw new BadRequestException('name nao pode ser vazio.');
    }
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(body.code !== undefined ? { code: this.normalizeOptional(body.code) } : {}),
        ...(body.phone !== undefined ? { phone: this.normalizeOptional(body.phone) } : {}),
        ...(body.whatsapp !== undefined ? { whatsapp: this.normalizeOptional(body.whatsapp) } : {}),
        ...(body.email !== undefined ? { email: this.normalizeOptional(body.email) } : {}),
        ...(body.city !== undefined ? { city: this.normalizeOptional(body.city) } : {}),
        ...(body.state !== undefined ? { state: this.normalizeOptional(body.state) } : {}),
        ...(body.zipCode !== undefined ? { zipCode: this.normalizeOptional(body.zipCode) } : {}),
        ...(body.street !== undefined ? { street: this.normalizeOptional(body.street) } : {}),
        ...(body.number !== undefined ? { number: this.normalizeOptional(body.number) } : {}),
        ...(body.complement !== undefined ? { complement: this.normalizeOptional(body.complement) } : {}),
        ...(body.district !== undefined ? { district: this.normalizeOptional(body.district) } : {}),
        ...(body.latitude !== undefined
          ? { latitude: this.normalizeCoordinate(body.latitude, 'latitude') }
          : {}),
        ...(body.longitude !== undefined
          ? { longitude: this.normalizeCoordinate(body.longitude, 'longitude') }
          : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
    return updated;
  }

  private assertNonEmptyPayload(payload: UpdateBranchDto) {
    const hasAny = UPDATE_KEYS.some((key) => payload[key] !== undefined);
    if (!hasAny) {
      throw new BadRequestException('payload vazio para update branch.');
    }
  }

  private async assertBranchBelongsToCompany(ctx: RequestContext, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch '${branchId}' nao encontrada.`);
    }
    if (ctx.branchId && ctx.branchId !== branchId && !isPlatformContext(ctx)) {
      throw new ForbiddenException(`Branch '${branchId}' fora do escopo do usuario atual.`);
    }
    if (branch.companyId !== ctx.companyId && !isPlatformContext(ctx)) {
      throw new ForbiddenException(`Branch '${branchId}' nao pertence a company '${ctx.companyId}'.`);
    }
  }

  private normalizeOptional(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private normalizeCoordinate(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${field} invalido.`);
    }
    return parsed;
  }
}
