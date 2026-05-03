import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import type {
  BranchSettingsDto,
  CompanySettingsDto,
  OperationSettingsDto,
  PaymentSettingsDto,
  SettingsChannelKey,
  WeeklyScheduleEntryDto,
} from './dto/settings.dto';

const COMPANY_SETTINGS_KEY = 'settings.company';
const BRANCH_SETTINGS_KEY = 'settings.branch';
const OPERATION_SETTINGS_KEY = 'settings.operation';
const PAYMENT_SETTINGS_KEY = 'settings.payments';

const WEEK_DAYS = [
  { dayKey: 'monday', label: 'Segunda' },
  { dayKey: 'tuesday', label: 'Terca' },
  { dayKey: 'wednesday', label: 'Quarta' },
  { dayKey: 'thursday', label: 'Quinta' },
  { dayKey: 'friday', label: 'Sexta' },
  { dayKey: 'saturday', label: 'Sabado' },
  { dayKey: 'sunday', label: 'Domingo' },
] as const;

const CHANNEL_KEYS: SettingsChannelKey[] = [
  'delivery',
  'pdv',
  'kiosk',
  'waiter_app',
  'kds',
  'whatsapp',
];

type JsonRecord = Record<string, unknown>;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const company = await this.prisma.company.findUnique({
      where: { id: ctx.companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company '${ctx.companyId}' nao encontrada.`);
    }
    const config = await this.readCompanyConfiguration(ctx.companyId);
    const legacyMeta = config ? null : await this.readSetting(ctx.companyId, branchId, COMPANY_SETTINGS_KEY);
    return {
      companyId: company.id,
      branchId,
      tradeName: company.tradeName,
      legalName: company.legalName,
      cnpj: company.cnpj ?? '',
      phone: company.phone ?? '',
      whatsapp: company.whatsapp ?? '',
      email: company.email ?? '',
      logoUrl: company.logoUrl ?? '',
      brandColor: config?.brandColor ?? this.readString(legacyMeta, 'brandColor') ?? '#ef4444',
      timezone: config?.timezone ?? this.readString(legacyMeta, 'timezone') ?? 'America/Sao_Paulo',
      currency: (config?.currency as 'BRL' | undefined) ?? 'BRL',
      status:
        config?.isActive === false || this.readString(legacyMeta, 'status') === 'INACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE',
      publicTitle: config?.publicTitle ?? this.readString(legacyMeta, 'publicTitle') ?? company.tradeName,
      publicDescription:
        config?.publicDescription ??
        this.readString(legacyMeta, 'publicDescription') ??
        'Gestao operacional para restaurante, PDV, cozinha e delivery',
      bannerUrl: config?.bannerUrl ?? this.readString(legacyMeta, 'bannerUrl') ?? '',
      closedMessage:
        config?.closedMessage ??
        this.readString(legacyMeta, 'closedMessage') ??
        'Loja fechada no momento. Voltamos em breve.',
    };
  }

  async patchCompany(ctx: RequestContext, body: CompanySettingsDto) {
    const branchId = await this.resolveBranchId(ctx);
    const company = await this.prisma.company.findUnique({
      where: { id: ctx.companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company '${ctx.companyId}' nao encontrada.`);
    }

    const email = this.normalizeOptionalString(body.email);
    if (email && !this.isValidEmail(email)) {
      throw new BadRequestException('Email da empresa invalido.');
    }

    await this.prisma.company.update({
      where: { id: ctx.companyId },
      data: {
        ...(body.tradeName !== undefined ? { tradeName: this.requireTrimmed(body.tradeName, 'Nome fantasia') } : {}),
        ...(body.legalName !== undefined ? { legalName: this.requireTrimmed(body.legalName, 'Razao social') } : {}),
        ...(body.cnpj !== undefined ? { cnpj: this.normalizeOptionalString(body.cnpj) } : {}),
        ...(body.phone !== undefined ? { phone: this.normalizeOptionalString(body.phone) } : {}),
        ...(body.whatsapp !== undefined ? { whatsapp: this.normalizeOptionalString(body.whatsapp) } : {}),
        ...(body.email !== undefined ? { email } : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: this.normalizeOptionalString(body.logoUrl) } : {}),
      },
    });

    const currentConfig = await this.readCompanyConfiguration(ctx.companyId);
    await this.prisma.companyConfiguration.upsert({
      where: { companyId: ctx.companyId },
      create: {
        companyId: ctx.companyId,
        brandColor:
          body.brandColor !== undefined
            ? this.normalizeOptionalString(body.brandColor)
            : currentConfig?.brandColor ?? '#ef4444',
        timezone:
          body.timezone !== undefined
            ? this.normalizeOptionalString(body.timezone)
            : currentConfig?.timezone ?? 'America/Sao_Paulo',
        currency: body.currency ?? currentConfig?.currency ?? 'BRL',
        isActive:
          body.status !== undefined ? body.status !== 'INACTIVE' : currentConfig?.isActive ?? true,
        publicTitle:
          body.publicTitle !== undefined
            ? this.normalizeOptionalString(body.publicTitle)
            : currentConfig?.publicTitle ?? company.tradeName,
        publicDescription:
          body.publicDescription !== undefined
            ? this.normalizeOptionalString(body.publicDescription)
            : currentConfig?.publicDescription ?? null,
        bannerUrl:
          body.bannerUrl !== undefined
            ? this.normalizeOptionalString(body.bannerUrl)
            : currentConfig?.bannerUrl ?? null,
        closedMessage:
          body.closedMessage !== undefined
            ? this.normalizeOptionalString(body.closedMessage)
            : currentConfig?.closedMessage ?? null,
      },
      update: {
        ...(body.brandColor !== undefined ? { brandColor: this.normalizeOptionalString(body.brandColor) } : {}),
        ...(body.timezone !== undefined ? { timezone: this.normalizeOptionalString(body.timezone) } : {}),
        ...(body.currency !== undefined ? { currency: body.currency ?? 'BRL' } : {}),
        ...(body.status !== undefined ? { isActive: body.status !== 'INACTIVE' } : {}),
        ...(body.publicTitle !== undefined ? { publicTitle: this.normalizeOptionalString(body.publicTitle) } : {}),
        ...(body.publicDescription !== undefined
          ? { publicDescription: this.normalizeOptionalString(body.publicDescription) }
          : {}),
        ...(body.bannerUrl !== undefined ? { bannerUrl: this.normalizeOptionalString(body.bannerUrl) } : {}),
        ...(body.closedMessage !== undefined
          ? { closedMessage: this.normalizeOptionalString(body.closedMessage) }
          : {}),
      },
    });

    return this.getCompany(ctx);
  }

  async getBranch(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId: ctx.companyId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch '${branchId}' nao encontrada para a company atual.`);
    }
    const meta = await this.readSetting(ctx.companyId, branchId, BRANCH_SETTINGS_KEY);
    return {
      branchId: branch.id,
      companyId: ctx.companyId,
      name: branch.name,
      code: branch.code ?? '',
      phone: branch.phone ?? '',
      whatsapp: branch.whatsapp ?? '',
      email: branch.email ?? '',
      city: branch.city ?? '',
      state: branch.state ?? '',
      zipCode: branch.zipCode ?? '',
      street: branch.street ?? '',
      number: branch.number ?? '',
      complement: branch.complement ?? '',
      district: branch.district ?? '',
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      isActive: Boolean(branch.isActive),
      responsible: this.readString(meta, 'responsible') ?? '',
      isOpen: this.readBoolean(meta, 'isOpen', true),
    };
  }

  async patchBranch(ctx: RequestContext, body: BranchSettingsDto) {
    const branchId = await this.resolveBranchId(ctx);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Branch '${branchId}' nao pertence a company '${ctx.companyId}'.`);
    }

    const email = this.normalizeOptionalString(body.email);
    if (email && !this.isValidEmail(email)) {
      throw new BadRequestException('Email da filial invalido.');
    }

    await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(body.name !== undefined ? { name: this.requireTrimmed(body.name, 'Nome da loja') } : {}),
        ...(body.code !== undefined ? { code: this.normalizeOptionalString(body.code) } : {}),
        ...(body.phone !== undefined ? { phone: this.normalizeOptionalString(body.phone) } : {}),
        ...(body.whatsapp !== undefined ? { whatsapp: this.normalizeOptionalString(body.whatsapp) } : {}),
        ...(body.email !== undefined ? { email } : {}),
        ...(body.city !== undefined ? { city: this.normalizeOptionalString(body.city) } : {}),
        ...(body.state !== undefined ? { state: this.normalizeOptionalString(body.state) } : {}),
        ...(body.zipCode !== undefined ? { zipCode: this.normalizeOptionalString(body.zipCode) } : {}),
        ...(body.street !== undefined ? { street: this.normalizeOptionalString(body.street) } : {}),
        ...(body.number !== undefined ? { number: this.normalizeOptionalString(body.number) } : {}),
        ...(body.complement !== undefined ? { complement: this.normalizeOptionalString(body.complement) } : {}),
        ...(body.district !== undefined ? { district: this.normalizeOptionalString(body.district) } : {}),
        ...(body.latitude !== undefined ? { latitude: this.toNullableDecimal(body.latitude) } : {}),
        ...(body.longitude !== undefined ? { longitude: this.toNullableDecimal(body.longitude) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });

    const current = await this.readSetting(ctx.companyId, branchId, BRANCH_SETTINGS_KEY);
    const next: JsonRecord = {
      ...current,
      ...(body.responsible !== undefined ? { responsible: this.normalizeOptionalString(body.responsible) } : {}),
      ...(body.isOpen !== undefined ? { isOpen: Boolean(body.isOpen) } : {}),
    };
    await this.writeSetting(ctx.companyId, branchId, BRANCH_SETTINGS_KEY, next);

    return this.getBranch(ctx);
  }

  async getOperation(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    await this.assertBranchBelongsToCompany(branchId, ctx.companyId);
    const meta = await this.readSetting(ctx.companyId, branchId, OPERATION_SETTINGS_KEY);
    const deliveryAreas = await this.prisma.deliveryArea.findMany({
      where: { branchId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        pricingMode: true,
        deliveryFee: true,
        baseFee: true,
        pricePerKm: true,
        estimatedMinutes: true,
        isActive: true,
        priority: true,
      },
    });
    const fiscal = await this.prisma.fiscalConfiguration.findFirst({
      where: { companyId: ctx.companyId, branchId },
      orderBy: { updatedAt: 'desc' },
      select: {
        enabled: true,
        environment: true,
      },
    });

    return {
      branchId,
      schedules: this.normalizeSchedules(meta.schedules),
      channels: this.normalizeChannelStates(meta.channels),
      delivery: {
        minimumOrder: this.readNumber(meta.delivery, 'minimumOrder', 0),
        averagePrepMinutes: this.readNumber(meta.delivery, 'averagePrepMinutes', 20),
        averageDeliveryMinutes: this.readNumber(meta.delivery, 'averageDeliveryMinutes', 35),
        allowPickup: this.readBoolean(meta.delivery, 'allowPickup', true),
        allowDelivery: this.readBoolean(meta.delivery, 'allowDelivery', true),
        serviceFee: this.readNumber(meta.delivery, 'serviceFee', 0),
        pricingMode: this.readString(meta.delivery, 'pricingMode') === 'km' ? 'km' : 'area',
        blockOutsideArea: this.readBoolean(meta.delivery, 'blockOutsideArea', true),
        allowCashOnDelivery: this.readBoolean(meta.delivery, 'allowCashOnDelivery', true),
        areas: deliveryAreas.map((area) => ({
          id: area.id,
          name: area.name,
          pricingMode: area.pricingMode === 'PER_KM' ? 'km' : 'area',
          deliveryFee: Number(area.deliveryFee ?? 0),
          baseFee: area.baseFee ? Number(area.baseFee) : 0,
          pricePerKm: area.pricePerKm ? Number(area.pricePerKm) : 0,
          estimatedMinutes: Number(area.estimatedMinutes ?? 0),
          active: Boolean(area.isActive),
          priority: Number(area.priority ?? 0),
        })),
      },
      fiscal: {
        serviceTax: this.readNumber(meta.fiscal, 'serviceTax', 0),
        fiscalObservation: this.readString(meta.fiscal, 'fiscalObservation') ?? '',
        futureFiscalEnabled: this.readBoolean(meta.fiscal, 'futureFiscalEnabled', false),
        fiscalConfigured: Boolean(fiscal?.enabled),
        fiscalEnvironment: fiscal?.environment ?? 'HOMOLOGATION',
      },
      users: {
        enabled: true,
        message: 'Gestao detalhada de usuarios, roles e acessos agora fica disponivel em /admin/users.',
      },
      devices: {
        enabled: false,
        message: 'Impressoras, KDS e terminais PDV permanecem preparados para integracao futura.',
      },
    };
  }

  async patchOperation(ctx: RequestContext, body: OperationSettingsDto) {
    const branchId = await this.resolveBranchId(ctx);
    await this.assertBranchBelongsToCompany(branchId, ctx.companyId);

    const current = await this.readSetting(ctx.companyId, branchId, OPERATION_SETTINGS_KEY);
    const next: JsonRecord = { ...current };

    if (body.schedules !== undefined) {
      next.schedules = this.validateSchedules(body.schedules);
    }
    if (body.channels !== undefined) {
      next.channels = this.validateChannelStates(body.channels);
    }
    if (body.delivery !== undefined) {
      next.delivery = this.validateDelivery(body.delivery);
    }
    if (body.fiscal !== undefined) {
      next.fiscal = this.validateFiscal(body.fiscal);
    }

    await this.writeSetting(ctx.companyId, branchId, OPERATION_SETTINGS_KEY, next);
    return this.getOperation(ctx);
  }

  async getPayments(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    await this.assertBranchBelongsToCompany(branchId, ctx.companyId);
    const meta = await this.readSetting(ctx.companyId, branchId, PAYMENT_SETTINGS_KEY);
    const providerName = (process.env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
    const cardMode =
      (process.env.PAYMENT_CARD_MODE ?? '').trim().toLowerCase() === 'mercadopago'
        ? 'mercadopago'
        : 'mock';
    const mpConfigured = Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim());
    const webhookUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL?.trim() || '';

    return {
      branchId,
      pixActive: this.readBoolean(meta, 'pixActive', true),
      cashActive: this.readBoolean(meta, 'cashActive', true),
      onlineCardActive: this.readBoolean(meta, 'onlineCardActive', true),
      presentCardActive: this.readBoolean(meta, 'presentCardActive', true),
      mercadoPagoMode: this.readString(meta, 'mercadoPagoMode') === 'production' ? 'production' : 'sandbox',
      cardMode,
      webhookUrl,
      providerName,
      providerStatus: providerName === 'mercadopago' ? (mpConfigured ? 'configured' : 'not_configured') : 'mock',
      secretStatus: mpConfigured ? 'configured' : 'not_configured',
    };
  }

  async patchPayments(ctx: RequestContext, body: PaymentSettingsDto) {
    const branchId = await this.resolveBranchId(ctx);
    await this.assertBranchBelongsToCompany(branchId, ctx.companyId);

    const current = await this.readSetting(ctx.companyId, branchId, PAYMENT_SETTINGS_KEY);
    const next: JsonRecord = {
      ...current,
      ...(body.pixActive !== undefined ? { pixActive: Boolean(body.pixActive) } : {}),
      ...(body.cashActive !== undefined ? { cashActive: Boolean(body.cashActive) } : {}),
      ...(body.onlineCardActive !== undefined ? { onlineCardActive: Boolean(body.onlineCardActive) } : {}),
      ...(body.presentCardActive !== undefined ? { presentCardActive: Boolean(body.presentCardActive) } : {}),
      ...(body.mercadoPagoMode !== undefined ? { mercadoPagoMode: body.mercadoPagoMode } : {}),
    };

    await this.writeSetting(ctx.companyId, branchId, PAYMENT_SETTINGS_KEY, next);
    return this.getPayments(ctx);
  }

  async getCompanyRuntimeConfiguration(ctx: RequestContext) {
    const [companyConfiguration, branchSettings, operationSettings, paymentSettings] = await Promise.all([
      this.getCompany(ctx),
      this.getBranch(ctx),
      this.getOperation(ctx),
      this.getPayments(ctx),
    ]);

    return {
      companyConfiguration,
      branchSettings,
      operationSettings,
      paymentSettings,
      behavior: 'fail_fast',
    };
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      await this.assertBranchBelongsToCompany(ctx.branchId, ctx.companyId);
      return ctx.branchId;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException(`Nenhuma branch encontrada para company '${ctx.companyId}'.`);
    }
    return branch.id;
  }

  private async assertBranchBelongsToCompany(branchId: string, companyId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(`Branch '${branchId}' nao pertence a company '${companyId}'.`);
    }
  }

  private async readSetting(companyId: string, branchId: string, key: string): Promise<JsonRecord> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as JsonRecord) : {};
  }

  private async writeSetting(companyId: string, branchId: string, key: string, value: JsonRecord): Promise<void> {
    await this.prisma.companySetting.upsert({
      where: { companyId_branchId_key: { companyId, branchId, key } },
      create: { companyId, branchId, key, value: value as any },
      update: { value: value as any },
    });
  }

  private async readCompanyConfiguration(companyId: string) {
    return this.prisma.companyConfiguration.findUnique({
      where: { companyId },
      select: {
        brandColor: true,
        timezone: true,
        currency: true,
        isActive: true,
        publicTitle: true,
        publicDescription: true,
        bannerUrl: true,
        closedMessage: true,
      },
    });
  }

  private validateSchedules(input: WeeklyScheduleEntryDto[]) {
    if (!Array.isArray(input)) {
      throw new BadRequestException('Horarios de funcionamento invalidos.');
    }
    const normalized = input.map((entry) => this.validateScheduleEntry(entry));
    return WEEK_DAYS.map((day) => normalized.find((entry) => entry.dayKey === day.dayKey) ?? this.defaultSchedule(day.dayKey, day.label));
  }

  private validateScheduleEntry(entry: WeeklyScheduleEntryDto) {
    const day = WEEK_DAYS.find((item) => item.dayKey === entry.dayKey);
    if (!day) {
      throw new BadRequestException(`Dia invalido na grade semanal: '${entry.dayKey}'.`);
    }

    const base = {
      dayKey: day.dayKey,
      label: day.label,
      isOpen: Boolean(entry.isOpen),
      openAt: this.normalizeOptionalString(entry.openAt) ?? '08:00',
      closeAt: this.normalizeOptionalString(entry.closeAt) ?? '18:00',
      breakStart: this.normalizeOptionalString(entry.breakStart) ?? null,
      breakEnd: this.normalizeOptionalString(entry.breakEnd) ?? null,
      channels: {} as Record<string, unknown>,
    };

    if (base.isOpen) {
      this.assertTimeRange(base.openAt, base.closeAt, `Horario principal de ${day.label}`);
      if (base.breakStart || base.breakEnd) {
        this.assertTimeRange(
          base.breakStart ?? '',
          base.breakEnd ?? '',
          `Intervalo de ${day.label}`,
        );
      }
    }

    for (const channel of CHANNEL_KEYS) {
      const channelInput = entry.channels?.[channel];
      if (!channelInput) {
        base.channels[channel] = {
          enabled: base.isOpen,
          openAt: base.isOpen ? base.openAt : null,
          closeAt: base.isOpen ? base.closeAt : null,
        };
        continue;
      }

      const enabled = channelInput.enabled !== undefined ? Boolean(channelInput.enabled) : base.isOpen;
      const openAt = this.normalizeOptionalString(channelInput.openAt) ?? base.openAt;
      const closeAt = this.normalizeOptionalString(channelInput.closeAt) ?? base.closeAt;
      if (enabled) {
        this.assertTimeRange(openAt, closeAt, `Horario do canal ${channel} em ${day.label}`);
      }
      base.channels[channel] = {
        enabled,
        openAt: enabled ? openAt : null,
        closeAt: enabled ? closeAt : null,
      };
    }

    return base;
  }

  private validateChannelStates(input: Partial<Record<SettingsChannelKey, boolean>>) {
    const result: Record<SettingsChannelKey, boolean> = this.normalizeChannelStates({});
    for (const key of CHANNEL_KEYS) {
      if (input[key] !== undefined) {
        result[key] = Boolean(input[key]);
      }
    }
    return result;
  }

  private validateDelivery(input: NonNullable<OperationSettingsDto['delivery']>) {
    const minimumOrder = this.nonNegativeNumber(input.minimumOrder, 'Pedido minimo');
    const averagePrepMinutes = this.nonNegativeNumber(input.averagePrepMinutes, 'Tempo medio de preparo');
    const averageDeliveryMinutes = this.nonNegativeNumber(input.averageDeliveryMinutes, 'Tempo medio de entrega');
    const serviceFee = this.nonNegativeNumber(input.serviceFee, 'Taxa de servico');
    return {
      ...(minimumOrder !== undefined ? { minimumOrder } : {}),
      ...(averagePrepMinutes !== undefined ? { averagePrepMinutes } : {}),
      ...(averageDeliveryMinutes !== undefined ? { averageDeliveryMinutes } : {}),
      ...(input.allowPickup !== undefined ? { allowPickup: Boolean(input.allowPickup) } : {}),
      ...(input.allowDelivery !== undefined ? { allowDelivery: Boolean(input.allowDelivery) } : {}),
      ...(serviceFee !== undefined ? { serviceFee } : {}),
      ...(input.pricingMode !== undefined ? { pricingMode: input.pricingMode } : {}),
      ...(input.blockOutsideArea !== undefined ? { blockOutsideArea: Boolean(input.blockOutsideArea) } : {}),
      ...(input.allowCashOnDelivery !== undefined
        ? { allowCashOnDelivery: Boolean(input.allowCashOnDelivery) }
        : {}),
    };
  }

  private validateFiscal(input: NonNullable<OperationSettingsDto['fiscal']>) {
    const serviceTax = this.nonNegativeNumber(input.serviceTax, 'Taxa de servico/fiscal');
    return {
      ...(serviceTax !== undefined ? { serviceTax } : {}),
      ...(input.fiscalObservation !== undefined
        ? { fiscalObservation: this.normalizeOptionalString(input.fiscalObservation) }
        : {}),
      ...(input.futureFiscalEnabled !== undefined
        ? { futureFiscalEnabled: Boolean(input.futureFiscalEnabled) }
        : {}),
    };
  }

  private normalizeSchedules(value: unknown) {
    if (!Array.isArray(value)) {
      return WEEK_DAYS.map((day) => this.defaultSchedule(day.dayKey, day.label));
    }
    const entries = value.filter((item) => this.isRecord(item)) as JsonRecord[];
    return WEEK_DAYS.map((day) => {
      const raw = entries.find((item) => item.dayKey === day.dayKey);
      if (!raw) return this.defaultSchedule(day.dayKey, day.label);
      const isOpen = this.readBoolean(raw, 'isOpen', false);
      const openAt = this.readString(raw, 'openAt') ?? '08:00';
      const closeAt = this.readString(raw, 'closeAt') ?? '18:00';
      const channelsValue = this.isRecord(raw.channels) ? (raw.channels as JsonRecord) : {};
      const channels: Record<string, unknown> = {};
      for (const channel of CHANNEL_KEYS) {
        const channelRaw = this.isRecord(channelsValue[channel]) ? (channelsValue[channel] as JsonRecord) : {};
        channels[channel] = {
          enabled: this.readBoolean(channelRaw, 'enabled', isOpen),
          openAt: this.readBoolean(channelRaw, 'enabled', isOpen)
            ? this.readString(channelRaw, 'openAt') ?? openAt
            : null,
          closeAt: this.readBoolean(channelRaw, 'enabled', isOpen)
            ? this.readString(channelRaw, 'closeAt') ?? closeAt
            : null,
        };
      }
      return {
        dayKey: day.dayKey,
        label: day.label,
        isOpen,
        openAt: isOpen ? openAt : null,
        closeAt: isOpen ? closeAt : null,
        breakStart: this.readString(raw, 'breakStart'),
        breakEnd: this.readString(raw, 'breakEnd'),
        channels,
      };
    });
  }

  private normalizeChannelStates(value: unknown): Record<SettingsChannelKey, boolean> {
    const raw = this.isRecord(value) ? (value as JsonRecord) : {};
    return {
      delivery: this.readBoolean(raw, 'delivery', true),
      pdv: this.readBoolean(raw, 'pdv', true),
      kiosk: this.readBoolean(raw, 'kiosk', false),
      waiter_app: this.readBoolean(raw, 'waiter_app', false),
      kds: this.readBoolean(raw, 'kds', true),
      whatsapp: this.readBoolean(raw, 'whatsapp', false),
    };
  }

  private defaultSchedule(dayKey: string, label: string) {
    const channels: Record<string, unknown> = {};
    for (const channel of CHANNEL_KEYS) {
      channels[channel] = {
        enabled: false,
        openAt: null,
        closeAt: null,
      };
    }
    return {
      dayKey,
      label,
      isOpen: false,
      openAt: null,
      closeAt: null,
      breakStart: null,
      breakEnd: null,
      channels,
    };
  }

  private requireTrimmed(value: string, label: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${label} e obrigatorio.`);
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string | null) {
    if (value === null) return null;
    if (value === undefined) return undefined;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private nonNegativeNumber(value: unknown, label: string) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${label} deve ser maior ou igual a zero.`);
    }
    return parsed;
  }

  private toNullableDecimal(value: number | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Latitude/longitude invalidas.');
    }
    return parsed as any;
  }

  private assertTimeRange(openAt: string, closeAt: string, label: string) {
    if (!this.isValidTime(openAt) || !this.isValidTime(closeAt)) {
      throw new BadRequestException(`${label} invalido.`);
    }
    if (this.timeToMinutes(closeAt) <= this.timeToMinutes(openAt)) {
      throw new BadRequestException(`${label}: fechamento deve ser maior que abertura.`);
    }
  }

  private isValidTime(value?: string | null) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  }

  private timeToMinutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private readString(input: unknown, key: string): string | null {
    if (!this.isRecord(input)) return null;
    const value = input[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readBoolean(input: unknown, key: string, fallback: boolean) {
    if (!this.isRecord(input)) return fallback;
    const value = input[key];
    return typeof value === 'boolean' ? value : fallback;
  }

  private readNumber(input: unknown, key: string, fallback: number) {
    if (!this.isRecord(input)) return fallback;
    const value = input[key];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
