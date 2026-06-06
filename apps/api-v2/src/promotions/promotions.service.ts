import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';

const PROMOTIONS_KEY = 'promotions.local';

type Promotion = {
  id: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  channels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const items = await this.readPromotions(ctx.companyId, branchId);
    return { branchId, provider: 'company-setting-local', items };
  }

  async create(ctx: RequestContext, body: Partial<Promotion>) {
    const branchId = await this.resolveBranchId(ctx);
    const now = new Date().toISOString();
    const promotion: Promotion = {
      id: randomUUID(),
      name: this.requiredString(body.name, 'Nome da promocao'),
      description: this.optionalString(body.description) ?? undefined,
      startsAt: this.optionalString(body.startsAt) ?? undefined,
      endsAt: this.optionalString(body.endsAt) ?? undefined,
      channels: Array.isArray(body.channels) && body.channels.length ? body.channels.map(String) : ['PDV', 'WEB'],
      isActive: body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    const items = [promotion, ...(await this.readPromotions(ctx.companyId, branchId))];
    await this.writePromotions(ctx.companyId, branchId, items);
    return promotion;
  }

  async update(ctx: RequestContext, promotionId: string, body: Partial<Promotion>) {
    const branchId = await this.resolveBranchId(ctx);
    const items = await this.readPromotions(ctx.companyId, branchId);
    const index = items.findIndex((item) => item.id === promotionId);
    if (index < 0) throw new NotFoundException('Promocao nao encontrada.');
    items[index] = {
      ...items[index],
      ...(body.name !== undefined ? { name: this.requiredString(body.name, 'Nome da promocao') } : {}),
      ...(body.description !== undefined ? { description: this.optionalString(body.description) ?? undefined } : {}),
      ...(body.startsAt !== undefined ? { startsAt: this.optionalString(body.startsAt) ?? undefined } : {}),
      ...(body.endsAt !== undefined ? { endsAt: this.optionalString(body.endsAt) ?? undefined } : {}),
      ...(body.channels !== undefined
        ? { channels: Array.isArray(body.channels) ? body.channels.map(String) : items[index].channels }
        : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.writePromotions(ctx.companyId, branchId, items);
    return items[index];
  }

  private async readPromotions(companyId: string, branchId: string): Promise<Promotion[]> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key: PROMOTIONS_KEY },
      select: { value: true },
    });
    const value = setting?.value as { items?: unknown[] } | null | undefined;
    return Array.isArray(value?.items)
      ? value.items.filter((item): item is Promotion => Boolean(item && typeof item === 'object' && 'id' in item))
      : [];
  }

  private async writePromotions(companyId: string, branchId: string, items: Promotion[]) {
    await this.prisma.companySetting.upsert({
      where: { companyId_branchId_key: { companyId, branchId, key: PROMOTIONS_KEY } },
      create: { companyId, branchId, key: PROMOTIONS_KEY, value: { items } as any },
      update: { value: { items } as any },
    });
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: ctx.branchId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (branch) return branch.id;
      throw new BadRequestException('Filial fora do escopo da empresa atual.');
    }
    const branch = await this.prisma.branch.findFirst({ where: { companyId: ctx.companyId }, select: { id: true } });
    if (!branch) throw new BadRequestException('Nenhuma filial encontrada para promocoes.');
    return branch.id;
  }

  private requiredString(value: unknown, label: string): string {
    const normalized = this.optionalString(value);
    if (!normalized) throw new BadRequestException(`${label} e obrigatorio.`);
    return normalized;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
  }
}
