import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import { isPointInsidePolygon, type NormalizedGeoJsonPolygon } from '../delivery/point-in-polygon';

type ZoneType = 'POSTAL_CODE' | 'POLYGON' | 'NEIGHBORHOOD' | 'RADIUS' | 'MANUAL';
type ValidateSource = 'CHECKOUT' | 'ADMIN_PREVIEW' | 'PUBLIC_CHECKOUT';

type ValidateAddressInput = {
  companyId?: string;
  branchId?: string;
  postalCode?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  orderSubtotal?: number;
  publicOnly?: boolean;
  source?: ValidateSource;
};

export type DeliveryZoneValidationResult = {
  configured: boolean;
  deliverable: boolean;
  requiresManualNegotiation: boolean;
  reason:
    | null
    | 'OUT_OF_COVERAGE'
    | 'AREA_BLOCKED'
    | 'MANUAL_NEGOTIATION_REQUIRED'
    | 'MINIMUM_ORDER_NOT_REACHED'
    | 'ZONE_INACTIVE'
    | 'ZONE_NOT_VISIBLE_ON_SITE'
    | 'ADDRESS_INVALID';
  zoneId: string | null;
  zoneName: string | null;
  deliveryFee: number;
  courierFee: number | null;
  minimumOrderAmount: number | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  distanceKm: number | null;
  missingAmount: number | null;
  dynamicPricingApplied: boolean;
  dynamicPricingRuleName: string | null;
  message: string | null;
};

type MatchCandidate = {
  zone: any;
  source: 'zone' | 'postalCode' | 'neighborhood' | 'radius' | 'polygon' | 'manual';
  specificity: number;
  deliveryFee: number;
  courierFee: number | null;
  minimumOrderAmount: number | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  distanceKm: number | null;
};

const SPECIFICITY: Record<string, number> = {
  POSTAL_CODE: 50,
  POLYGON: 40,
  NEIGHBORHOOD: 30,
  RADIUS: 20,
  MANUAL: 10,
};

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext, query: { status?: string; type?: string } = {}) {
    const branchId = await this.resolveBranchId(ctx, undefined);
    const rows = await this.prisma.deliveryZone.findMany({
      where: {
        companyId: ctx.companyId,
        branchId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      include: this.zoneIncludes(),
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      companyId: ctx.companyId,
      branchId,
      items: rows.map((row) => this.serializeZone(row)),
      total: rows.length,
    };
  }

  async get(ctx: RequestContext, id: string) {
    const zone = await this.findZoneOrThrow(ctx, id);
    return this.serializeZone(zone);
  }

  async create(ctx: RequestContext, body: Record<string, unknown>) {
    const branchId = await this.resolveBranchId(ctx, this.optionalString(body.branchId));
    const name = this.requiredString(body.name, 'Nome da regiao');
    const type = this.normalizeZoneType(body.type);
    const zone = await this.prisma.deliveryZone.create({
      data: {
        companyId: ctx.companyId,
        branchId,
        name,
        type,
        status: this.optionalString(body.status) ?? 'ACTIVE',
        priority: this.int(body.priority, 100),
        deliveryFee: this.money(body.deliveryFee, 0),
        minimumOrderAmount: this.optionalMoney(body.minimumOrderAmount),
        estimatedMinutesMin: this.optionalInt(body.estimatedMinutesMin),
        estimatedMinutesMax: this.optionalInt(body.estimatedMinutesMax),
        baseLatitude: this.optionalDecimal(body.baseLatitude),
        baseLongitude: this.optionalDecimal(body.baseLongitude),
        radiusKm: this.optionalDecimal(body.radiusKm),
        feePerKm: this.optionalDecimal(body.feePerKm),
        maxDistanceKm: this.optionalDecimal(body.maxDistanceKm),
        courierFee: this.optionalMoney(body.courierFee),
        courierFeeType: this.optionalString(body.courierFeeType),
        isBlockedArea: Boolean(body.isBlockedArea),
        blockedReason: this.optionalString(body.blockedReason),
        requiresManualNegotiation: Boolean(body.requiresManualNegotiation),
        negotiationChannel: this.optionalString(body.negotiationChannel),
        negotiationMessage: this.optionalString(body.negotiationMessage),
        visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite),
        notes: this.optionalString(body.notes),
        metadata: this.optionalJson(body.metadata),
        createdByUserId: ctx.userId ?? null,
        updatedByUserId: ctx.userId ?? null,
      } as any,
      include: this.zoneIncludes(),
    });
    await this.audit(ctx, 'delivery_zone.create', zone.id, { name, type, branchId });
    return this.serializeZone(zone);
  }

  async update(ctx: RequestContext, id: string, body: Record<string, unknown>) {
    await this.findZoneOrThrow(ctx, id);
    const data: Record<string, unknown> = {
      updatedByUserId: ctx.userId ?? null,
    };
    const moneyFields = new Set(['deliveryFee', 'minimumOrderAmount', 'courierFee']);
    const decimalFields = new Set(['baseLatitude', 'baseLongitude', 'radiusKm', 'feePerKm', 'maxDistanceKm']);
    const intFields = new Set(['priority', 'estimatedMinutesMin', 'estimatedMinutesMax']);
    const stringFields = new Set([
      'name',
      'status',
      'type',
      'courierFeeType',
      'blockedReason',
      'negotiationChannel',
      'negotiationMessage',
      'notes',
    ]);
    for (const [key, value] of Object.entries(body)) {
      if (key === 'branchId' || key === 'companyId') continue;
      if (moneyFields.has(key)) data[key] = key === 'deliveryFee' ? this.money(value, 0) : this.optionalMoney(value);
      if (decimalFields.has(key)) data[key] = this.optionalDecimal(value);
      if (intFields.has(key)) data[key] = this.optionalInt(value);
      if (stringFields.has(key)) data[key] = key === 'type' ? this.normalizeZoneType(value) : this.optionalString(value);
      if (key === 'isBlockedArea' || key === 'requiresManualNegotiation' || key === 'visibleOnDeliverySite') data[key] = Boolean(value);
      if (key === 'metadata') data[key] = this.optionalJson(value);
    }
    const zone = await this.prisma.deliveryZone.update({
      where: { id },
      data: data as any,
      include: this.zoneIncludes(),
    });
    await this.audit(ctx, 'delivery_zone.update', zone.id, { changedFields: Object.keys(data) });
    return this.serializeZone(zone);
  }

  async archive(ctx: RequestContext, id: string) {
    await this.findZoneOrThrow(ctx, id);
    const zone = await this.prisma.deliveryZone.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), updatedByUserId: ctx.userId ?? null },
      include: this.zoneIncludes(),
    });
    await this.audit(ctx, 'delivery_zone.archive', id);
    return this.serializeZone(zone);
  }

  async duplicate(ctx: RequestContext, id: string) {
    const source = await this.findZoneOrThrow(ctx, id);
    const created = await this.prisma.deliveryZone.create({
      data: {
        companyId: source.companyId,
        branchId: source.branchId,
        name: `${source.name} - copia`,
        type: source.type,
        status: 'DRAFT',
        priority: Number(source.priority) + 1,
        deliveryFee: source.deliveryFee,
        minimumOrderAmount: source.minimumOrderAmount,
        estimatedMinutesMin: source.estimatedMinutesMin,
        estimatedMinutesMax: source.estimatedMinutesMax,
        baseLatitude: source.baseLatitude,
        baseLongitude: source.baseLongitude,
        radiusKm: source.radiusKm,
        feePerKm: source.feePerKm,
        maxDistanceKm: source.maxDistanceKm,
        courierFee: source.courierFee,
        courierFeeType: source.courierFeeType,
        isBlockedArea: source.isBlockedArea,
        blockedReason: source.blockedReason,
        requiresManualNegotiation: source.requiresManualNegotiation,
        negotiationChannel: source.negotiationChannel,
        negotiationMessage: source.negotiationMessage,
        visibleOnDeliverySite: source.visibleOnDeliverySite,
        notes: source.notes,
        metadata: source.metadata as any,
        createdByUserId: ctx.userId ?? null,
        updatedByUserId: ctx.userId ?? null,
        neighborhoods: {
          create: source.neighborhoods.map((row: any) => this.cloneNeighborhood(row, source.companyId, source.branchId)),
        },
        postalCodeRanges: {
          create: source.postalCodeRanges.map((row: any) => this.clonePostalRange(row, source.companyId, source.branchId)),
        },
        polygonPoints: {
          create: source.polygonPoints.map((row: any) => ({
            companyId: source.companyId,
            branchId: source.branchId,
            sortOrder: row.sortOrder,
            latitude: row.latitude,
            longitude: row.longitude,
          })),
        },
        schedules: {
          create: source.schedules.map((row: any) => ({
            companyId: source.companyId,
            branchId: source.branchId,
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime: row.endTime,
            mode: row.mode,
            status: row.status,
          })),
        },
        dynamicPricingRules: {
          create: source.dynamicPricingRules.map((row: any) => ({
            companyId: source.companyId,
            branchId: source.branchId,
            name: row.name,
            status: row.status,
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime: row.endTime,
            adjustmentType: row.adjustmentType,
            adjustmentAmount: row.adjustmentAmount,
            priority: row.priority,
            metadata: row.metadata as any,
          })),
        },
      } as any,
      include: this.zoneIncludes(),
    });
    await this.audit(ctx, 'delivery_zone.duplicate', created.id, { sourceId: id });
    return this.serializeZone(created);
  }

  async addNeighborhood(ctx: RequestContext, id: string, body: Record<string, unknown>) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const neighborhood = this.requiredString(body.neighborhood, 'Bairro');
    const alias = this.optionalString(body.alias);
    const created = await this.prisma.deliveryZoneNeighborhood.create({
      data: {
        companyId: zone.companyId,
        branchId: zone.branchId,
        zoneId: zone.id,
        neighborhood,
        alias,
        normalizedNeighborhood: this.normalizeText(neighborhood),
        normalizedAlias: alias ? this.normalizeText(alias) : null,
        city: this.optionalString(body.city),
        state: this.normalizeState(body.state),
        deliveryFeeOverride: this.optionalMoney(body.deliveryFeeOverride),
        minimumOrderOverride: this.optionalMoney(body.minimumOrderOverride),
        courierFeeOverride: this.optionalMoney(body.courierFeeOverride),
        estimatedMinutesMin: this.optionalInt(body.estimatedMinutesMin),
        estimatedMinutesMax: this.optionalInt(body.estimatedMinutesMax),
        visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite),
        status: this.optionalString(body.status) ?? 'ACTIVE',
      } as any,
    });
    await this.audit(ctx, 'delivery_zone.neighborhood.create', zone.id, { neighborhood });
    return created;
  }

  async addPostalCodeRange(ctx: RequestContext, id: string, body: Record<string, unknown>) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const postalCodeStart = this.normalizePostalCode(this.requiredString(body.postalCodeStart, 'CEP inicial'));
    const postalCodeEnd = this.normalizePostalCode(this.requiredString(body.postalCodeEnd, 'CEP final'));
    if (postalCodeStart > postalCodeEnd) throw new BadRequestException('CEP inicial nao pode ser maior que CEP final.');
    const created = await this.prisma.deliveryZonePostalCodeRange.create({
      data: {
        companyId: zone.companyId,
        branchId: zone.branchId,
        zoneId: zone.id,
        postalCodeStart,
        postalCodeEnd,
        deliveryFeeOverride: this.optionalMoney(body.deliveryFeeOverride),
        minimumOrderOverride: this.optionalMoney(body.minimumOrderOverride),
        courierFeeOverride: this.optionalMoney(body.courierFeeOverride),
        estimatedMinutesMin: this.optionalInt(body.estimatedMinutesMin),
        estimatedMinutesMax: this.optionalInt(body.estimatedMinutesMax),
        visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite),
        status: this.optionalString(body.status) ?? 'ACTIVE',
      } as any,
    });
    await this.audit(ctx, 'delivery_zone.postal_code_range.create', zone.id, { postalCodeStart, postalCodeEnd });
    return created;
  }

  async addPolygonPoints(ctx: RequestContext, id: string, body: { points?: Array<{ latitude?: number; longitude?: number }> }) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const points = Array.isArray(body.points) ? body.points : [];
    if (points.length < 3) throw new BadRequestException('Poligono exige pelo menos 3 pontos.');
    await this.prisma.deliveryZonePolygonPoint.deleteMany({ where: { zoneId: zone.id } });
    await this.prisma.deliveryZonePolygonPoint.createMany({
      data: points.map((point, index) => ({
        companyId: zone.companyId,
        branchId: zone.branchId,
        zoneId: zone.id,
        sortOrder: index + 1,
        latitude: this.number(point.latitude, `Latitude do ponto ${index + 1}`),
        longitude: this.number(point.longitude, `Longitude do ponto ${index + 1}`),
      })),
    });
    await this.audit(ctx, 'delivery_zone.polygon.replace', zone.id, { points: points.length });
    return this.get(ctx, id);
  }

  async addSchedule(ctx: RequestContext, id: string, body: Record<string, unknown>) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const created = await this.prisma.deliveryZoneSchedule.create({
      data: {
        companyId: zone.companyId,
        branchId: zone.branchId,
        zoneId: zone.id,
        dayOfWeek: this.dayOfWeek(body.dayOfWeek),
        startTime: this.requiredTime(body.startTime, 'Horario inicial'),
        endTime: this.requiredTime(body.endTime, 'Horario final'),
        mode: this.optionalString(body.mode) === 'INACTIVE_WINDOW' ? 'INACTIVE_WINDOW' : 'ACTIVE_WINDOW',
        status: this.optionalString(body.status) ?? 'ACTIVE',
      },
    });
    await this.audit(ctx, 'delivery_zone.schedule.create', zone.id, { mode: created.mode });
    return created;
  }

  async importNeighborhoods(ctx: RequestContext, body: Record<string, unknown>) {
    const branchId = await this.resolveBranchId(ctx, this.optionalString(body.branchId));
    const city = this.requiredString(body.city, 'Cidade');
    const state = this.normalizeState(body.state) ?? this.requiredString(body.state, 'Estado');
    const names = Array.isArray(body.neighborhoods) ? body.neighborhoods.map((item) => String(item).trim()).filter(Boolean) : [];
    if (names.length === 0) throw new BadRequestException('Envie a lista de bairros para importar.');
    const zoneName = this.optionalString(body.zoneName) ?? `Bairros ${city}/${state}`;
    const zone = await this.prisma.deliveryZone.upsert({
      where: { companyId_branchId_name: { companyId: ctx.companyId, branchId, name: zoneName } },
      update: { type: 'NEIGHBORHOOD', status: 'ACTIVE', visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite) },
      create: {
        companyId: ctx.companyId,
        branchId,
        name: zoneName,
        type: 'NEIGHBORHOOD',
        status: 'ACTIVE',
        deliveryFee: this.money(body.defaultDeliveryFee, 0),
        courierFee: this.optionalMoney(body.defaultCourierFee),
        visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite),
        createdByUserId: ctx.userId ?? null,
        updatedByUserId: ctx.userId ?? null,
      } as any,
    });
    let created = 0;
    for (const neighborhood of names) {
      const normalized = this.normalizeText(neighborhood);
      const existing = await this.prisma.deliveryZoneNeighborhood.findFirst({
        where: { zoneId: zone.id, normalizedNeighborhood: normalized, city, state },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.deliveryZoneNeighborhood.create({
        data: {
          companyId: ctx.companyId,
          branchId,
          zoneId: zone.id,
          neighborhood,
          normalizedNeighborhood: normalized,
          city,
          state,
          deliveryFeeOverride: this.optionalMoney(body.defaultDeliveryFee),
          courierFeeOverride: this.optionalMoney(body.defaultCourierFee),
          visibleOnDeliverySite: body.visibleOnDeliverySite === undefined ? true : Boolean(body.visibleOnDeliverySite),
        } as any,
      });
      created += 1;
    }
    await this.audit(ctx, 'delivery_zone.neighborhood.import', zone.id, { city, state, created });
    return { zoneId: zone.id, created, skipped: names.length - created };
  }

  async listDynamicPricing(ctx: RequestContext, id: string) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const items = await this.prisma.deliveryZoneDynamicPricingRule.findMany({
      where: { zoneId: zone.id },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return { zoneId: zone.id, items: items.map((item) => this.serializeDynamicRule(item)) };
  }

  async createDynamicPricing(ctx: RequestContext, id: string, body: Record<string, unknown>) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const created = await this.prisma.deliveryZoneDynamicPricingRule.create({
      data: this.dynamicRuleData(zone, body),
    });
    await this.audit(ctx, 'delivery_zone.dynamic_pricing.create', zone.id, { ruleId: created.id });
    return this.serializeDynamicRule(created);
  }

  async updateDynamicPricing(ctx: RequestContext, id: string, ruleId: string, body: Record<string, unknown>) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const existing = await this.prisma.deliveryZoneDynamicPricingRule.findFirst({ where: { id: ruleId, zoneId: zone.id } });
    if (!existing) throw new NotFoundException('Regra dinamica nao encontrada.');
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'name') data.name = this.requiredString(value, 'Nome da regra');
      if (key === 'status') data.status = this.optionalString(value) ?? 'ACTIVE';
      if (key === 'dayOfWeek') data.dayOfWeek = value === null || value === '' ? null : this.dayOfWeek(value);
      if (key === 'startTime') data.startTime = this.optionalTime(value);
      if (key === 'endTime') data.endTime = this.optionalTime(value);
      if (key === 'adjustmentType') data.adjustmentType = this.adjustmentType(value);
      if (key === 'adjustmentAmount') data.adjustmentAmount = this.money(value, 0);
      if (key === 'priority') data.priority = this.int(value, 100);
      if (key === 'metadata') data.metadata = this.optionalJson(value);
    }
    const updated = await this.prisma.deliveryZoneDynamicPricingRule.update({ where: { id: ruleId }, data: data as any });
    await this.audit(ctx, 'delivery_zone.dynamic_pricing.update', zone.id, { ruleId });
    return this.serializeDynamicRule(updated);
  }

  async deleteDynamicPricing(ctx: RequestContext, id: string, ruleId: string) {
    const zone = await this.findZoneOrThrow(ctx, id);
    const existing = await this.prisma.deliveryZoneDynamicPricingRule.findFirst({ where: { id: ruleId, zoneId: zone.id } });
    if (!existing) throw new NotFoundException('Regra dinamica nao encontrada.');
    await this.prisma.deliveryZoneDynamicPricingRule.delete({ where: { id: ruleId } });
    await this.audit(ctx, 'delivery_zone.dynamic_pricing.delete', zone.id, { ruleId });
    return { deleted: true, ruleId };
  }

  async validateForAdmin(ctx: RequestContext, body: ValidateAddressInput): Promise<DeliveryZoneValidationResult> {
    return this.validateForCheckout(ctx, { ...body, source: 'ADMIN_PREVIEW', publicOnly: false });
  }

  async validateForPublic(body: ValidateAddressInput): Promise<DeliveryZoneValidationResult> {
    const companyId = this.requiredString(body.companyId, 'companyId');
    const branchId = this.requiredString(body.branchId, 'branchId');
    await this.assertBranch(companyId, branchId);
    return this.validateAddress(companyId, branchId, { ...body, publicOnly: true, source: 'PUBLIC_CHECKOUT' });
  }

  async validateForCheckout(
    ctx: Pick<RequestContext, 'companyId' | 'branchId' | 'requestId'>,
    body: ValidateAddressInput,
  ): Promise<DeliveryZoneValidationResult> {
    const branchId = await this.resolveBranchId({ companyId: ctx.companyId } as RequestContext, body.branchId ?? ctx.branchId);
    return this.validateAddress(ctx.companyId, branchId, { ...body, publicOnly: body.publicOnly ?? true, source: body.source ?? 'CHECKOUT' });
  }

  private async validateAddress(
    companyId: string,
    branchId: string,
    body: ValidateAddressInput,
  ): Promise<DeliveryZoneValidationResult> {
    const postalCode = this.optionalString(body.postalCode) ? this.normalizePostalCode(body.postalCode) : null;
    const normalizedNeighborhood = this.optionalString(body.neighborhood) ? this.normalizeText(body.neighborhood) : null;
    const normalizedCity = this.optionalString(body.city) ? this.normalizeText(body.city) : null;
    const state = this.normalizeState(body.state);
    const latitude = this.optionalNumber(body.latitude);
    const longitude = this.optionalNumber(body.longitude);
    const orderSubtotal = this.optionalNumber(body.orderSubtotal) ?? 0;
    const publicOnly = body.publicOnly !== false;

    const zones = await this.prisma.deliveryZone.findMany({
      where: {
        companyId,
        branchId,
        status: 'ACTIVE',
        archivedAt: null,
        ...(publicOnly ? { visibleOnDeliverySite: true } : {}),
      },
      include: this.zoneIncludes(),
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    if (zones.length === 0) {
      return this.result(false, 'OUT_OF_COVERAGE', { configured: false, message: 'Nenhuma regiao dinamica configurada.' });
    }

    const candidates: MatchCandidate[] = [];
    for (const zone of zones) {
      const scheduleState = this.isZoneAvailableNow(zone);
      if (!scheduleState.available) continue;
      const match = this.matchZone(zone, {
        postalCode,
        normalizedNeighborhood,
        normalizedCity,
        state,
        latitude,
        longitude,
        publicOnly,
      });
      if (match) candidates.push(match);
    }

    if (candidates.length === 0) {
      const res = this.result(false, 'OUT_OF_COVERAGE', { configured: true, message: 'Endereco fora das regioes atendidas.' });
      await this.logValidation(companyId, branchId, body, res);
      return res;
    }

    const blocked = this.chooseCandidate(candidates.filter((candidate) => candidate.zone.isBlockedArea));
    if (blocked) {
      const res = this.result(false, 'AREA_BLOCKED', {
        configured: true,
        zone: blocked,
        message: blocked.zone.blockedReason || 'Nao entregamos nessa regiao.',
      });
      await this.logValidation(companyId, branchId, body, res);
      return res;
    }

    const chosen = this.chooseCandidate(candidates);
    if (!chosen) {
      const res = this.result(false, 'OUT_OF_COVERAGE', { configured: true, message: 'Endereco fora das regioes atendidas.' });
      await this.logValidation(companyId, branchId, body, res);
      return res;
    }

    if (chosen.zone.requiresManualNegotiation) {
      const res = this.result(false, 'MANUAL_NEGOTIATION_REQUIRED', {
        configured: true,
        zone: chosen,
        message: chosen.zone.negotiationMessage || 'Entrega para esta regiao precisa ser negociada pelo WhatsApp.',
      });
      await this.logValidation(companyId, branchId, body, res);
      return res;
    }

    const dynamic = this.applyDynamicPricing(chosen.deliveryFee, chosen.zone.dynamicPricingRules ?? []);
    const finalFee = dynamic.value;
    const minimum = chosen.minimumOrderAmount;
    if (minimum != null && orderSubtotal < minimum) {
      const res = this.result(false, 'MINIMUM_ORDER_NOT_REACHED', {
        configured: true,
        zone: { ...chosen, deliveryFee: finalFee },
        dynamic,
        missingAmount: this.roundMoney(minimum - orderSubtotal),
        message: `Pedido minimo de ${this.formatMoney(minimum)} para esta regiao.`,
      });
      await this.logValidation(companyId, branchId, body, res);
      return res;
    }

    const res = this.result(true, null, {
      configured: true,
      zone: { ...chosen, deliveryFee: finalFee },
      dynamic,
      message: null,
    });
    await this.logValidation(companyId, branchId, body, res);
    return res;
  }

  private matchZone(zone: any, input: {
    postalCode: string | null;
    normalizedNeighborhood: string | null;
    normalizedCity: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    publicOnly: boolean;
  }): MatchCandidate | null {
    const type = String(zone.type) as ZoneType;
    if (type === 'POSTAL_CODE' && input.postalCode) {
      const match = (zone.postalCodeRanges ?? []).find((range: any) => {
        if (range.status !== 'ACTIVE') return false;
        if (input.publicOnly && !range.visibleOnDeliverySite) return false;
        return range.postalCodeStart <= input.postalCode! && input.postalCode! <= range.postalCodeEnd;
      });
      if (match) return this.buildCandidate(zone, 'postalCode', SPECIFICITY.POSTAL_CODE, match, null);
    }
    if (type === 'NEIGHBORHOOD' && input.normalizedNeighborhood) {
      const match = (zone.neighborhoods ?? []).find((row: any) => {
        if (row.status !== 'ACTIVE') return false;
        if (input.publicOnly && !row.visibleOnDeliverySite) return false;
        const sameNeighborhood =
          row.normalizedNeighborhood === input.normalizedNeighborhood || row.normalizedAlias === input.normalizedNeighborhood;
        if (!sameNeighborhood) return false;
        const rowCity = row.city ? this.normalizeText(row.city) : null;
        const rowState = this.normalizeState(row.state);
        return (!rowCity || !input.normalizedCity || rowCity === input.normalizedCity) && (!rowState || !input.state || rowState === input.state);
      });
      if (match) return this.buildCandidate(zone, 'neighborhood', SPECIFICITY.NEIGHBORHOOD, match, null);
    }
    if (type === 'RADIUS' && input.latitude != null && input.longitude != null) {
      const baseLat = this.toNumber(zone.baseLatitude, null);
      const baseLng = this.toNumber(zone.baseLongitude, null);
      const radiusKm = this.toNumber(zone.radiusKm ?? zone.maxDistanceKm, null);
      if (baseLat != null && baseLng != null && radiusKm != null) {
        const distanceKm = this.haversineKm(baseLat, baseLng, input.latitude, input.longitude);
        if (distanceKm <= radiusKm) return this.buildCandidate(zone, 'radius', SPECIFICITY.RADIUS, null, distanceKm);
      }
    }
    if (type === 'POLYGON' && input.latitude != null && input.longitude != null) {
      const polygon = this.zonePolygon(zone);
      if (polygon && isPointInsidePolygon(input.latitude, input.longitude, polygon)) {
        return this.buildCandidate(zone, 'polygon', SPECIFICITY.POLYGON, null, null);
      }
    }
    if (type === 'MANUAL') {
      return this.buildCandidate(zone, 'manual', SPECIFICITY.MANUAL, null, null);
    }
    return null;
  }

  private buildCandidate(zone: any, source: MatchCandidate['source'], specificity: number, override: any, distanceKm: number | null): MatchCandidate {
    const baseFee = this.toNumber(zone.deliveryFee, 0) ?? 0;
    const feePerKm = this.toNumber(zone.feePerKm, 0) ?? 0;
    const radiusFee = distanceKm != null && feePerKm > 0 ? baseFee + distanceKm * feePerKm : baseFee;
    return {
      zone,
      source,
      specificity,
      deliveryFee: this.roundMoney(this.toNumber(override?.deliveryFeeOverride, null) ?? radiusFee),
      courierFee: this.toNumber(override?.courierFeeOverride, null) ?? this.toNumber(zone.courierFee, null),
      minimumOrderAmount: this.toNumber(override?.minimumOrderOverride, null) ?? this.toNumber(zone.minimumOrderAmount, null),
      estimatedMinutesMin: this.toNumber(override?.estimatedMinutesMin, null) ?? this.toNumber(zone.estimatedMinutesMin, null),
      estimatedMinutesMax: this.toNumber(override?.estimatedMinutesMax, null) ?? this.toNumber(zone.estimatedMinutesMax, null),
      distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(3)),
    };
  }

  private chooseCandidate(candidates: MatchCandidate[]): MatchCandidate | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      if (a.zone.isBlockedArea !== b.zone.isBlockedArea) return a.zone.isBlockedArea ? -1 : 1;
      if (a.zone.priority !== b.zone.priority) return Number(a.zone.priority) - Number(b.zone.priority);
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      if (a.deliveryFee !== b.deliveryFee) return a.deliveryFee - b.deliveryFee;
      return new Date(a.zone.createdAt).getTime() - new Date(b.zone.createdAt).getTime();
    })[0];
  }

  private result(
    deliverable: boolean,
    reason: DeliveryZoneValidationResult['reason'],
    options: {
      configured: boolean;
      zone?: MatchCandidate;
      dynamic?: { applied: boolean; value: number; ruleName: string | null };
      missingAmount?: number | null;
      message?: string | null;
    },
  ): DeliveryZoneValidationResult {
    const zone = options.zone;
    const dynamic = options.dynamic ?? { applied: false, value: zone?.deliveryFee ?? 0, ruleName: null };
    return {
      configured: options.configured,
      deliverable,
      requiresManualNegotiation: Boolean(zone?.zone.requiresManualNegotiation),
      reason,
      zoneId: zone?.zone.id ?? null,
      zoneName: zone?.zone.name ?? null,
      deliveryFee: this.roundMoney(dynamic.value),
      courierFee: zone?.courierFee ?? null,
      minimumOrderAmount: zone?.minimumOrderAmount ?? null,
      estimatedMinutesMin: zone?.estimatedMinutesMin ?? null,
      estimatedMinutesMax: zone?.estimatedMinutesMax ?? null,
      distanceKm: zone?.distanceKm ?? null,
      missingAmount: options.missingAmount ?? null,
      dynamicPricingApplied: dynamic.applied,
      dynamicPricingRuleName: dynamic.ruleName,
      message: options.message ?? null,
    };
  }

  private applyDynamicPricing(value: number, rules: any[]) {
    const now = new Date();
    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const rule = [...(rules ?? [])]
      .filter((item) => item.status === 'ACTIVE')
      .filter((item) => item.dayOfWeek == null || Number(item.dayOfWeek) === day)
      .filter((item) => this.inTimeWindow(minutes, item.startTime, item.endTime, true))
      .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100))[0];
    if (!rule) return { applied: false, value, ruleName: null };
    const amount = this.toNumber(rule.adjustmentAmount, 0) ?? 0;
    const type = String(rule.adjustmentType);
    let next = value;
    if (type === 'ADD_FIXED') next = value + amount;
    if (type === 'SUBTRACT_FIXED') next = value - amount;
    if (type === 'SET_FIXED') next = amount;
    if (type === 'PERCENTAGE_INCREASE') next = value + value * (amount / 100);
    if (type === 'PERCENTAGE_DISCOUNT') next = value - value * (amount / 100);
    return { applied: true, value: this.roundMoney(Math.max(0, next)), ruleName: rule.name as string };
  }

  private isZoneAvailableNow(zone: any): { available: boolean; reason?: string } {
    const schedules = (zone.schedules ?? []).filter((item: any) => item.status === 'ACTIVE');
    if (schedules.length === 0) return { available: true };
    const now = new Date();
    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const today = schedules.filter((item: any) => Number(item.dayOfWeek) === day);
    const inactiveHit = today.some((item: any) => item.mode === 'INACTIVE_WINDOW' && this.inTimeWindow(minutes, item.startTime, item.endTime, false));
    if (inactiveHit) return { available: false, reason: 'INACTIVE_WINDOW' };
    const activeWindows = schedules.filter((item: any) => item.mode !== 'INACTIVE_WINDOW');
    if (activeWindows.length === 0) return { available: true };
    return { available: today.some((item: any) => item.mode !== 'INACTIVE_WINDOW' && this.inTimeWindow(minutes, item.startTime, item.endTime, false)) };
  }

  private inTimeWindow(minutes: number, start?: string | null, end?: string | null, emptyMeansAll = false): boolean {
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    if (startMinutes == null || endMinutes == null) return emptyMeansAll;
    if (endMinutes > startMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes;
  }

  private timeToMinutes(value?: string | null): number | null {
    if (!value) return null;
    const [hour, minute] = value.split(':').map((part) => Number(part));
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return hour * 60 + minute;
  }

  private zonePolygon(zone: any): NormalizedGeoJsonPolygon | null {
    const points = [...(zone.polygonPoints ?? [])].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    if (points.length < 3) return null;
    const ring = points.map((point) => [this.toNumber(point.longitude, 0) ?? 0, this.toNumber(point.latitude, 0) ?? 0]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    return { type: 'Polygon', coordinates: [ring] };
  }

  private async findZoneOrThrow(ctx: RequestContext, id: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id, companyId: ctx.companyId },
      include: this.zoneIncludes(),
    });
    if (!zone) throw new NotFoundException('Regiao de entrega nao encontrada.');
    const branchId = await this.resolveBranchId(ctx, ctx.branchId);
    if (zone.branchId !== branchId) throw new ForbiddenException('Regiao fora da filial atual.');
    return zone;
  }

  private async resolveBranchId(ctx: Pick<RequestContext, 'companyId' | 'branchId'>, requested?: string | null): Promise<string> {
    const branchId = requested || ctx.branchId;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId: ctx.companyId }, select: { id: true } });
      if (!branch) throw new ForbiddenException('Filial fora do escopo da empresa atual.');
      return branch.id;
    }
    const branch = await this.prisma.branch.findFirst({ where: { companyId: ctx.companyId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!branch) throw new BadRequestException('Nenhuma filial encontrada.');
    return branch.id;
  }

  private async assertBranch(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId }, select: { id: true } });
    if (!branch) throw new BadRequestException('Filial invalida.');
  }

  private async logValidation(companyId: string, branchId: string, input: ValidateAddressInput, result: DeliveryZoneValidationResult) {
    try {
      await this.prisma.deliveryAddressValidationLog.create({
        data: {
          companyId,
          branchId,
          zoneId: result.zoneId,
          status: result.deliverable ? 'DELIVERABLE' : 'BLOCKED',
          reason: result.reason,
          postalCode: this.optionalString(input.postalCode) ? this.normalizePostalCode(input.postalCode) : null,
          neighborhood: this.optionalString(input.neighborhood),
          city: this.optionalString(input.city),
          state: this.normalizeState(input.state),
          latitude: this.optionalDecimal(input.latitude),
          longitude: this.optionalDecimal(input.longitude),
          distanceKm: this.optionalDecimal(result.distanceKm),
          deliveryFee: result.deliveryFee,
          courierFee: result.courierFee,
          minimumOrderAmount: result.minimumOrderAmount,
          estimatedMinutesMin: result.estimatedMinutesMin,
          estimatedMinutesMax: result.estimatedMinutesMax,
          requiresManualNegotiation: result.requiresManualNegotiation,
          dynamicPricingApplied: result.dynamicPricingApplied,
          source: input.source ?? 'CHECKOUT',
          metadata: {
            message: result.message,
            missingAmount: result.missingAmount,
            dynamicPricingRuleName: result.dynamicPricingRuleName,
          },
        } as any,
      });
    } catch {
      // validation log is best-effort and must not block checkout
    }
  }

  private async audit(ctx: RequestContext, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: ctx.companyId,
          branchId: ctx.branchId ?? null,
          actorUserId: ctx.userId ?? null,
          actorType: ctx.source === 'technical-admin' ? 'technical-admin' : 'user',
          action,
          outcome: 'success',
          severity: 'high',
          targetType: 'delivery_zone',
          targetId,
          metadata,
        } as any,
      });
    } catch {
      // audit is best-effort in DEV
    }
  }

  private zoneIncludes() {
    return {
      neighborhoods: { orderBy: { neighborhood: 'asc' as const } },
      postalCodeRanges: { orderBy: { postalCodeStart: 'asc' as const } },
      polygonPoints: { orderBy: { sortOrder: 'asc' as const } },
      schedules: { orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }] },
      dynamicPricingRules: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
    };
  }

  private serializeZone(zone: any) {
    return {
      ...zone,
      deliveryFee: this.toNumber(zone.deliveryFee, 0),
      minimumOrderAmount: this.toNumber(zone.minimumOrderAmount, null),
      baseLatitude: this.toNumber(zone.baseLatitude, null),
      baseLongitude: this.toNumber(zone.baseLongitude, null),
      radiusKm: this.toNumber(zone.radiusKm, null),
      feePerKm: this.toNumber(zone.feePerKm, null),
      maxDistanceKm: this.toNumber(zone.maxDistanceKm, null),
      courierFee: this.toNumber(zone.courierFee, null),
      neighborhoods: (zone.neighborhoods ?? []).map((row: any) => ({
        ...row,
        deliveryFeeOverride: this.toNumber(row.deliveryFeeOverride, null),
        minimumOrderOverride: this.toNumber(row.minimumOrderOverride, null),
        courierFeeOverride: this.toNumber(row.courierFeeOverride, null),
      })),
      postalCodeRanges: (zone.postalCodeRanges ?? []).map((row: any) => ({
        ...row,
        deliveryFeeOverride: this.toNumber(row.deliveryFeeOverride, null),
        minimumOrderOverride: this.toNumber(row.minimumOrderOverride, null),
        courierFeeOverride: this.toNumber(row.courierFeeOverride, null),
      })),
      dynamicPricingRules: (zone.dynamicPricingRules ?? []).map((row: any) => this.serializeDynamicRule(row)),
    };
  }

  private serializeDynamicRule(row: any) {
    return {
      ...row,
      adjustmentAmount: this.toNumber(row.adjustmentAmount, 0),
    };
  }

  private dynamicRuleData(zone: any, body: Record<string, unknown>) {
    return {
      companyId: zone.companyId,
      branchId: zone.branchId,
      zoneId: zone.id,
      name: this.requiredString(body.name, 'Nome da regra'),
      status: this.optionalString(body.status) ?? 'ACTIVE',
      dayOfWeek: body.dayOfWeek === null || body.dayOfWeek === undefined || body.dayOfWeek === '' ? null : this.dayOfWeek(body.dayOfWeek),
      startTime: this.optionalTime(body.startTime),
      endTime: this.optionalTime(body.endTime),
      adjustmentType: this.adjustmentType(body.adjustmentType),
      adjustmentAmount: this.money(body.adjustmentAmount, 0),
      priority: this.int(body.priority, 100),
      metadata: this.optionalJson(body.metadata),
    } as any;
  }

  private cloneNeighborhood(row: any, companyId: string, branchId: string) {
    return {
      companyId,
      branchId,
      neighborhood: row.neighborhood,
      alias: row.alias,
      normalizedNeighborhood: row.normalizedNeighborhood,
      normalizedAlias: row.normalizedAlias,
      city: row.city,
      state: row.state,
      deliveryFeeOverride: row.deliveryFeeOverride,
      minimumOrderOverride: row.minimumOrderOverride,
      courierFeeOverride: row.courierFeeOverride,
      estimatedMinutesMin: row.estimatedMinutesMin,
      estimatedMinutesMax: row.estimatedMinutesMax,
      visibleOnDeliverySite: row.visibleOnDeliverySite,
      status: row.status,
    };
  }

  private clonePostalRange(row: any, companyId: string, branchId: string) {
    return {
      companyId,
      branchId,
      postalCodeStart: row.postalCodeStart,
      postalCodeEnd: row.postalCodeEnd,
      deliveryFeeOverride: row.deliveryFeeOverride,
      minimumOrderOverride: row.minimumOrderOverride,
      courierFeeOverride: row.courierFeeOverride,
      estimatedMinutesMin: row.estimatedMinutesMin,
      estimatedMinutesMax: row.estimatedMinutesMax,
      visibleOnDeliverySite: row.visibleOnDeliverySite,
      status: row.status,
    };
  }

  private normalizeZoneType(value: unknown): ZoneType {
    const type = String(value ?? '').trim().toUpperCase();
    if (['POSTAL_CODE', 'POLYGON', 'NEIGHBORHOOD', 'RADIUS', 'MANUAL'].includes(type)) return type as ZoneType;
    throw new BadRequestException('Tipo de regiao invalido.');
  }

  private adjustmentType(value: unknown): string {
    const type = String(value ?? '').trim().toUpperCase();
    if (['ADD_FIXED', 'SUBTRACT_FIXED', 'SET_FIXED', 'PERCENTAGE_INCREASE', 'PERCENTAGE_DISCOUNT'].includes(type)) return type;
    throw new BadRequestException('Tipo de ajuste dinamico invalido.');
  }

  private requiredString(value: unknown, label: string): string {
    const text = this.optionalString(value);
    if (!text) throw new BadRequestException(`${label} e obrigatorio.`);
    return text;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private optionalJson(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'object') return value as any;
    return { value };
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private normalizeState(value: unknown): string | null {
    const text = this.optionalString(value);
    return text ? text.slice(0, 2).toUpperCase() : null;
  }

  private normalizePostalCode(value: unknown): string {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
    if (digits.length !== 8) throw new BadRequestException('CEP deve ter 8 digitos.');
    return digits;
  }

  private money(value: unknown, fallback: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException('Valor monetario invalido.');
    return this.roundMoney(parsed);
  }

  private optionalMoney(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return this.money(value, 0);
  }

  private optionalDecimal(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return this.number(value, 'Numero decimal');
  }

  private number(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new BadRequestException(`${label} invalido.`);
    return parsed;
  }

  private optionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private int(value: unknown, fallback: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed)) throw new BadRequestException('Numero inteiro invalido.');
    return parsed;
  }

  private optionalInt(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return this.int(value, 0);
  }

  private dayOfWeek(value: unknown): number {
    const parsed = this.int(value, 0);
    if (parsed < 0 || parsed > 6) throw new BadRequestException('Dia da semana deve ficar entre 0 e 6.');
    return parsed;
  }

  private optionalTime(value: unknown): string | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return this.requiredTime(text, 'Horario');
  }

  private requiredTime(value: unknown, label: string): string {
    const text = this.requiredString(value, label);
    if (!/^\d{2}:\d{2}$/.test(text)) throw new BadRequestException(`${label} deve usar HH:mm.`);
    return text;
  }

  private toNumber(value: unknown, fallback: number | null): number | null {
    if (value === null || value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  private formatMoney(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const radius = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
