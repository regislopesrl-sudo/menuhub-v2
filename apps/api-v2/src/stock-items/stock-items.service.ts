import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockItemType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type CreateStockItemInput = {
  name: string;
  code?: string | null;
  stockType?: StockItemType;
  purchaseUnit?: string | null;
  stockUnit?: string | null;
  productionUnit?: string | null;
  conversionFactor?: number;
  minimumQuantity?: number;
  reorderPoint?: number;
  averageCost?: number;
  standardCost?: number;
  controlsStock?: boolean;
  controlsBatch?: boolean;
  controlsExpiry?: boolean;
  isPerishable?: boolean;
  isFractionable?: boolean;
  isCritical?: boolean;
  isActive?: boolean;
};

@Injectable()
export class StockItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.stockItem.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        companyId: true,
        name: true,
        code: true,
        stockType: true,
        purchaseUnit: true,
        stockUnit: true,
        productionUnit: true,
        conversionFactor: true,
        currentQuantity: true,
        minimumQuantity: true,
        reorderPoint: true,
        averageCost: true,
        standardCost: true,
        controlsStock: true,
        controlsBatch: true,
        controlsExpiry: true,
        isPerishable: true,
        isFractionable: true,
        isCritical: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async create(companyId: string, input: CreateStockItemInput) {
    const name = requiredString(input.name, 'name');
    const conversionFactor = nonNegative(input.conversionFactor ?? 1, 'conversionFactor', true);
    const minimumQuantity = nonNegative(input.minimumQuantity ?? 0, 'minimumQuantity');
    const reorderPoint = nonNegative(input.reorderPoint ?? 0, 'reorderPoint');
    const averageCost = nonNegative(input.averageCost ?? 0, 'averageCost');
    const standardCost = nonNegative(input.standardCost ?? 0, 'standardCost');

    const created = await this.prisma.stockItem.create({
      data: {
        companyId,
        name,
        code: normalizeOptional(input.code),
        stockType: parseStockType(input.stockType),
        purchaseUnit: normalizeOptional(input.purchaseUnit),
        stockUnit: normalizeOptional(input.stockUnit),
        productionUnit: normalizeOptional(input.productionUnit),
        conversionFactor,
        minimumQuantity,
        reorderPoint,
        averageCost,
        standardCost,
        controlsStock: input.controlsStock ?? true,
        controlsBatch: input.controlsBatch ?? false,
        controlsExpiry: input.controlsExpiry ?? false,
        isPerishable: input.isPerishable ?? false,
        isFractionable: input.isFractionable ?? false,
        isCritical: input.isCritical ?? false,
        isActive: input.isActive ?? true,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        code: true,
        stockType: true,
        purchaseUnit: true,
        stockUnit: true,
        productionUnit: true,
        conversionFactor: true,
        currentQuantity: true,
        minimumQuantity: true,
        reorderPoint: true,
        averageCost: true,
        standardCost: true,
        controlsStock: true,
        controlsBatch: true,
        controlsExpiry: true,
        isPerishable: true,
        isFractionable: true,
        isCritical: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.mapRow(created);
  }

  async update(companyId: string, stockItemId: string, input: Partial<CreateStockItemInput>) {
    ensureAny(input, [
      'name', 'code', 'stockType', 'purchaseUnit', 'stockUnit', 'productionUnit', 'conversionFactor', 'minimumQuantity',
      'reorderPoint', 'averageCost', 'standardCost', 'controlsStock', 'controlsBatch', 'controlsExpiry', 'isPerishable',
      'isFractionable', 'isCritical', 'isActive',
    ]);

    const current = await this.prisma.stockItem.findFirst({
      where: { id: stockItemId, companyId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Insumo nao encontrado.');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = requiredString(input.name, 'name');
    if (input.code !== undefined) data.code = normalizeOptional(input.code);
    if (input.stockType !== undefined) data.stockType = parseStockType(input.stockType);
    if (input.purchaseUnit !== undefined) data.purchaseUnit = normalizeOptional(input.purchaseUnit);
    if (input.stockUnit !== undefined) data.stockUnit = normalizeOptional(input.stockUnit);
    if (input.productionUnit !== undefined) data.productionUnit = normalizeOptional(input.productionUnit);
    if (input.conversionFactor !== undefined) data.conversionFactor = nonNegative(input.conversionFactor, 'conversionFactor', true);
    if (input.minimumQuantity !== undefined) data.minimumQuantity = nonNegative(input.minimumQuantity, 'minimumQuantity');
    if (input.reorderPoint !== undefined) data.reorderPoint = nonNegative(input.reorderPoint, 'reorderPoint');
    if (input.averageCost !== undefined) data.averageCost = nonNegative(input.averageCost, 'averageCost');
    if (input.standardCost !== undefined) data.standardCost = nonNegative(input.standardCost, 'standardCost');
    if (input.controlsStock !== undefined) data.controlsStock = Boolean(input.controlsStock);
    if (input.controlsBatch !== undefined) data.controlsBatch = Boolean(input.controlsBatch);
    if (input.controlsExpiry !== undefined) data.controlsExpiry = Boolean(input.controlsExpiry);
    if (input.isPerishable !== undefined) data.isPerishable = Boolean(input.isPerishable);
    if (input.isFractionable !== undefined) data.isFractionable = Boolean(input.isFractionable);
    if (input.isCritical !== undefined) data.isCritical = Boolean(input.isCritical);
    if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

    const updated = await this.prisma.stockItem.update({
      where: { id: stockItemId },
      data,
      select: {
        id: true,
        companyId: true,
        name: true,
        code: true,
        stockType: true,
        purchaseUnit: true,
        stockUnit: true,
        productionUnit: true,
        conversionFactor: true,
        currentQuantity: true,
        minimumQuantity: true,
        reorderPoint: true,
        averageCost: true,
        standardCost: true,
        controlsStock: true,
        controlsBatch: true,
        controlsExpiry: true,
        isPerishable: true,
        isFractionable: true,
        isCritical: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.mapRow(updated);
  }

  private mapRow(row: any) {
    return {
      ...row,
      conversionFactor: Number(row.conversionFactor),
      currentQuantity: Number(row.currentQuantity),
      minimumQuantity: Number(row.minimumQuantity),
      reorderPoint: Number(row.reorderPoint),
      averageCost: Number(row.averageCost),
      standardCost: Number(row.standardCost),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function requiredString(value: unknown, field: string) {
  const v = String(value ?? '').trim();
  if (!v) throw new BadRequestException(`${field} obrigatorio.`);
  return v;
}

function normalizeOptional(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return v || null;
}

function nonNegative(value: unknown, field: string, strictlyPositive = false): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException(`${field} invalido.`);
  if (strictlyPositive ? n <= 0 : n < 0) throw new BadRequestException(`${field} invalido.`);
  return n;
}

function ensureAny(payload: Record<string, unknown>, keys: string[]) {
  if (!keys.some((key) => payload[key] !== undefined)) {
    throw new BadRequestException('payload vazio para update stock item.');
  }
}

function parseStockType(stockType?: StockItemType): StockItemType {
  if (!stockType) return StockItemType.RAW_MATERIAL;
  if (stockType === StockItemType.RAW_MATERIAL || stockType === StockItemType.PRODUCT || stockType === StockItemType.ADDON) {
    return stockType;
  }
  throw new BadRequestException('stockType invalido.');
}
