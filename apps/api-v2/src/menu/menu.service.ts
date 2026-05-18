import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from '../common/request-context';
import { ModulesService } from '../modules/modules.service';
import { StockService } from '../stock/stock.service';
import { isProductVisibleOnChannel, resolvePublicMenuPrice } from './menu-visibility.policy';

const BRANCH_SETTINGS_KEY = 'settings.branch';
const OPERATION_SETTINGS_KEY = 'settings.operation';

const WEEK_DAYS = [
  { dayKey: 'monday', label: 'Segunda' },
  { dayKey: 'tuesday', label: 'Terca' },
  { dayKey: 'wednesday', label: 'Quarta' },
  { dayKey: 'thursday', label: 'Quinta' },
  { dayKey: 'friday', label: 'Sexta' },
  { dayKey: 'saturday', label: 'Sabado' },
  { dayKey: 'sunday', label: 'Domingo' },
] as const;

type JsonRecord = Record<string, unknown>;
type PublicProductStockStatus =
  | 'available'
  | 'low_stock'
  | 'out_of_stock'
  | 'missing_recipe'
  | 'recipe_without_stock_items'
  | 'not_controlled';

type PublicProductStockAvailability = {
  productId: string;
  availabilityStatus: PublicProductStockStatus;
  availableToSell: number | null;
};

export interface PublicStorefrontScheduleDto {
  dayKey: string;
  label: string;
  isOpen: boolean;
  openAt: string | null;
  closeAt: string | null;
}

export interface PublicStorefrontDto {
  companyId: string;
  branchId?: string | null;
  branchName?: string;
  city?: string;
  state?: string;
  isOpen?: boolean;
  timezone?: string;
  publicTitle: string;
  publicDescription: string;
  logoUrl: string;
  bannerUrl: string;
  brandColor: string;
  closedMessage: string;
  schedules?: PublicStorefrontScheduleDto[];
  delivery?: {
    minimumOrder: number;
    averagePrepMinutes: number;
    averageDeliveryMinutes: number;
    allowPickup: boolean;
    allowDelivery: boolean;
  };
}

export interface MenuItemDto {
  id: string;
  type?: 'product' | 'combo';
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  categoryName?: string;
  available: boolean;
  stockAvailabilityStatus?: PublicProductStockStatus;
  availableToSell?: number | null;
  stockStatusLabel?: string;
  stockStatusMessage?: string;
  addonGroups?: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    required: boolean;
    allowMultiple: boolean;
    options: Array<{
      id: string;
      name: string;
      price: number;
      available: boolean;
    }>;
  }>;
  variations?: Array<{
    id: string;
    name: string;
    sku?: string;
    priceDelta: number;
    localPriceDelta: number;
    deliveryPriceDelta: number;
    active: boolean;
    sortOrder: number;
  }>;
  comboItems?: Array<{
    productId: string;
    productName?: string;
    quantity: number;
  }>;
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: ModulesService,
    private readonly stockService: StockService,
  ) {}

  async list(ctx: RequestContext): Promise<MenuItemDto[]> {
    if (!ctx?.companyId?.trim()) {
      throw new BadRequestException('Contexto de empresa ausente para carregar o cardapio.');
    }
    await this.assertMenuModuleEnabled(ctx.companyId);
    return this.listByCompanyId(ctx.companyId, ctx.branchId);
  }

  async listPublicByCompanySlug(companySlug: string, branchId?: string): Promise<MenuItemDto[]> {
    const company = await this.findPublicCompanyBySlug(companySlug);
    await this.assertMenuModuleEnabled(company.id);
    const scopedBranchId = branchId?.trim() || undefined;
    if (scopedBranchId) {
      await this.assertPublicBranchBelongsToCompany(company.id, scopedBranchId);
    }

    return this.listByCompanyId(company.id, scopedBranchId);
  }

  async getPublicStorefrontByCompanySlug(companySlug: string, branchId?: string): Promise<PublicStorefrontDto> {
    const company = await this.findPublicCompanyBySlug(companySlug);
    await this.assertMenuModuleEnabled(company.id);
    const branch = await this.findPublicBranch(company.id, branchId);

    const config = await this.prisma.companyConfiguration.findUnique({
      where: { companyId: company.id },
      select: {
        brandColor: true,
        timezone: true,
        publicTitle: true,
        publicDescription: true,
        bannerUrl: true,
        closedMessage: true,
      },
    });
    const [branchSettings, operation] = await Promise.all([
      this.readBranchSettings(company.id, branch.id),
      this.readOperationSettings(company.id, branch.id),
    ]);
    const schedules = this.normalizePublicSchedules(operation.schedules);
    const branchIsOpen = this.readBoolean(branchSettings, 'isOpen', true);

    return {
      companyId: company.id,
      branchId: branch.id,
      branchName: branch.name,
      city: branch.city ?? '',
      state: branch.state ?? '',
      isOpen: Boolean(branch.isActive) && branchIsOpen,
      timezone: config?.timezone ?? 'America/Sao_Paulo',
      publicTitle: config?.publicTitle || company.tradeName,
      publicDescription:
        config?.publicDescription || 'Gestao operacional para restaurante, PDV, cozinha e delivery',
      logoUrl: company.logoUrl ?? '',
      bannerUrl: config?.bannerUrl ?? '',
      brandColor: config?.brandColor ?? '#2557f6',
      closedMessage: config?.closedMessage ?? 'Loja fechada no momento. Voltamos em breve.',
      schedules,
      delivery: {
        minimumOrder: this.readNumber(operation.delivery, 'minimumOrder', 0),
        averagePrepMinutes: this.readNumber(operation.delivery, 'averagePrepMinutes', 20),
        averageDeliveryMinutes: this.readNumber(operation.delivery, 'averageDeliveryMinutes', 35),
        allowPickup: this.readBoolean(operation.delivery, 'allowPickup', true),
        allowDelivery: this.readBoolean(operation.delivery, 'allowDelivery', true),
      },
    };
  }

  private async findPublicCompanyBySlug(companySlug: string) {
    const slug = String(companySlug ?? '').trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug da empresa e obrigatorio para carregar o cardapio publico.');
    }

    const company = await this.prisma.company.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, tradeName: true, logoUrl: true },
    });

    if (!company) {
      throw new NotFoundException('Cardapio publico nao encontrado para esta empresa.');
    }

    return company;
  }

  private async assertMenuModuleEnabled(companyId: string): Promise<void> {
    const access = await this.modulesService.checkAccess({
      companyId,
      moduleKey: 'menu',
      isAdmin: false,
    });

    if (!access.allowed) {
      throw new ForbiddenException('Cardapio indisponivel para esta empresa.');
    }
  }

  private async assertPublicBranchBelongsToCompany(companyId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId.trim(), companyId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Filial publica nao encontrada para esta empresa.');
    }
  }

  private async findPublicBranch(companyId: string, branchId?: string) {
    const requestedBranchId = branchId?.trim();
    if (requestedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: requestedBranchId, companyId, isActive: true },
        select: { id: true, name: true, city: true, state: true, isActive: true },
      });
      if (!branch) {
        throw new NotFoundException('Filial publica nao encontrada para esta empresa.');
      }
      return branch;
    }

    const branch = await this.prisma.branch.findFirst({
      where: { companyId, isActive: true },
      select: { id: true, name: true, city: true, state: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new NotFoundException('Nenhuma filial publica ativa encontrada para esta empresa.');
    }
    return branch;
  }

  private async readBranchSettings(companyId: string, branchId: string): Promise<JsonRecord> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key: BRANCH_SETTINGS_KEY },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as JsonRecord) : {};
  }

  private async readOperationSettings(companyId: string, branchId: string): Promise<JsonRecord> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key: OPERATION_SETTINGS_KEY },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as JsonRecord) : {};
  }

  private normalizePublicSchedules(input: unknown): PublicStorefrontScheduleDto[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return WEEK_DAYS.map((day) => {
      const raw = input.find((entry) => this.isRecord(entry) && entry.dayKey === day.dayKey);
      if (!this.isRecord(raw)) {
        return {
          dayKey: day.dayKey,
          label: day.label,
          isOpen: false,
          openAt: null,
          closeAt: null,
        };
      }
      const isOpen = this.readBoolean(raw, 'isOpen', false);
      const openAt = this.readString(raw, 'openAt') ?? null;
      const closeAt = this.readString(raw, 'closeAt') ?? null;
      return {
        dayKey: day.dayKey,
        label: this.readString(raw, 'label') ?? day.label,
        isOpen,
        openAt: isOpen ? openAt : null,
        closeAt: isOpen ? closeAt : null,
      };
    });
  }

  private readString(input: unknown, key: string): string | null {
    if (!this.isRecord(input)) return null;
    const value = input[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readNumber(input: unknown, key: string, fallback: number): number {
    if (!this.isRecord(input)) return fallback;
    const value = Number(input[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  private readBoolean(input: unknown, key: string, fallback: boolean): boolean {
    if (!this.isRecord(input)) return fallback;
    const value = input[key];
    return typeof value === 'boolean' ? value : fallback;
  }

  private isRecord(input: unknown): input is JsonRecord {
    return Boolean(input && typeof input === 'object' && !Array.isArray(input));
  }

  private async listByCompanyId(companyId: string, branchId?: string | null): Promise<MenuItemDto[]> {
    const stockContext = {
      companyId,
      branchId: branchId ?? undefined,
      userRole: 'support',
      requestId: 'public-menu-stock-availability',
    } as RequestContext;
    const [products, combos, productAvailability] = await Promise.all([
      this.prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        availableDelivery: true,
      },
      include: {
        category: {
          select: {
            name: true,
            isActive: true,
          },
        },
        addonLinks: {
          include: {
            addonGroup: {
              include: {
                items: {
                  where: {
                    isActive: true,
                  },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                },
              },
            },
          },
        },
        variations: {
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.combo.findMany({
      where: {
        companyId,
        isActive: true,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                isActive: true,
                availableDelivery: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      }),
      this.stockService.listProductAvailability(stockContext),
    ]);
    const availabilityByProductId = new Map(
      (productAvailability as PublicProductStockAvailability[]).map((availability) => [availability.productId, availability]),
    );

    const productItems = products
      .filter((product) => isProductVisibleOnChannel(product, 'delivery'))
      .filter((product) => product.category?.isActive !== false)
      .map((product) => {
      const resolvedPrice = resolvePublicMenuPrice({
        salePrice: product.salePrice,
        deliveryPickupPrice: product.deliveryPickupPrice,
        promotionalPrice: product.promotionalPrice,
      });

      const addonGroups = product.addonLinks.map((link) => ({
        id: link.addonGroup.id,
        name: link.addonGroup.name,
        minSelect: link.addonGroup.minSelect,
        maxSelect: link.addonGroup.maxSelect,
        required: link.addonGroup.required,
        allowMultiple: link.addonGroup.allowMultiple,
        options: link.addonGroup.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          available: Boolean(item.isActive),
        })),
      }));
      const variations = (product.variations ?? []).map((variation: any) => ({
        id: variation.id,
        name: variation.name,
        sku: variation.sku ?? undefined,
        priceDelta: Number(variation.priceDelta ?? 0),
        localPriceDelta: Number(variation.localPriceDelta ?? 0),
        deliveryPriceDelta: Number(variation.deliveryPriceDelta ?? 0),
        active: variation.isActive !== false,
        sortOrder: Number(variation.sortOrder ?? 0),
      }));

        return {
        id: product.id,
        type: 'product' as const,
        name: product.name,
        description: product.description ?? undefined,
        imageUrl: product.imageUrl ?? undefined,
        price: resolvedPrice,
        categoryName: product.category?.name ?? undefined,
        available: isProductVisibleOnChannel(product, 'delivery'),
        ...this.toPublicStockFields(availabilityByProductId.get(product.id)),
        addonGroups,
        variations,
      };
      });

    const comboItems = combos
      .filter((combo) =>
        combo.items.every((item) => Boolean(item.product?.isActive && item.product?.availableDelivery && !item.product?.deletedAt)),
      )
      .map((combo) => ({
        id: combo.id,
        type: 'combo' as const,
        name: combo.name,
        description: combo.description ?? undefined,
        imageUrl: undefined,
        price: Number(combo.price ?? 0),
        categoryName: 'Combos',
        available: combo.isActive !== false,
        addonGroups: [],
        variations: [],
        comboItems: combo.items.map((item) => ({
          productId: item.productId,
          productName: item.product?.name ?? undefined,
          quantity: Number(item.quantity ?? 1),
        })),
      }));

    return [...productItems, ...comboItems];
  }

  private toPublicStockFields(availability?: PublicProductStockAvailability): Partial<MenuItemDto> {
    if (!availability) return {};
    return {
      stockAvailabilityStatus: availability.availabilityStatus,
      availableToSell: availability.availableToSell,
      stockStatusLabel: this.publicStockStatusLabel(availability.availabilityStatus),
      stockStatusMessage: this.publicStockStatusMessage(availability),
    };
  }

  private publicStockStatusLabel(status: PublicProductStockStatus): string {
    const labels: Record<PublicProductStockStatus, string> = {
      available: 'Disponivel',
      low_stock: 'Baixo estoque',
      out_of_stock: 'Sem estoque',
      missing_recipe: 'Sem ficha tecnica',
      recipe_without_stock_items: 'Ficha sem insumos',
      not_controlled: 'Sem controle',
    };
    return labels[status] ?? 'Estoque';
  }

  private publicStockStatusMessage(availability: PublicProductStockAvailability): string {
    if (availability.availabilityStatus === 'available' || availability.availabilityStatus === 'low_stock') {
      return typeof availability.availableToSell === 'number'
        ? `${availability.availableToSell} unidades disponiveis para venda.`
        : 'Produto disponivel para venda.';
    }
    if (availability.availabilityStatus === 'out_of_stock') {
      return 'Produto indisponivel por saldo tecnico de estoque.';
    }
    if (availability.availabilityStatus === 'missing_recipe') {
      return 'Produto ainda sem ficha tecnica vinculada.';
    }
    if (availability.availabilityStatus === 'recipe_without_stock_items') {
      return 'Ficha tecnica sem insumos que baixam estoque.';
    }
    return 'Produto sem controle tecnico de estoque.';
  }
}
