import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RecipeType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type CreateRecipeInput = {
  name: string;
  type: RecipeType;
  yieldQuantity: number;
  yieldUnit: string;
  lossPercent?: number | null;
  active?: boolean;
};

type UpdateRecipeInput = Partial<CreateRecipeInput>;

type UpsertRecipeItemInput = {
  stockItemId: string;
  quantity: number;
  unit: string;
  optional?: boolean;
  affectsStock?: boolean;
  affectsCost?: boolean;
};

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.recipe.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
            },
          },
        },
      },
    });
    return rows.map((row) => this.mapRecipe(row));
  }

  async getById(companyId: string, recipeId: string) {
    const row = await this.prisma.recipe.findFirst({
      where: { id: recipeId, companyId },
      include: {
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Ficha tecnica nao encontrada.');
    }
    return this.mapRecipe(row);
  }

  async create(companyId: string, input: CreateRecipeInput) {
    const name = requiredString(input.name, 'name');
    const yieldUnit = requiredString(input.yieldUnit, 'yieldUnit');
    const yieldQuantity = positiveNumber(input.yieldQuantity, 'yieldQuantity');
    const type = parseRecipeType(input.type);
    const lossPercent = optionalPercent(input.lossPercent);

    const created = await this.prisma.recipe.create({
      data: {
        companyId,
        name,
        type,
        yieldQuantity,
        yieldUnit,
        lossPercent,
        active: input.active ?? true,
      },
      include: {
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
            },
          },
        },
      },
    });
    return this.mapRecipe(created);
  }

  async update(companyId: string, recipeId: string, input: UpdateRecipeInput) {
    ensureNonEmpty(input, ['name', 'type', 'yieldQuantity', 'yieldUnit', 'lossPercent', 'active'], 'payload vazio para update recipe.');
    await this.assertRecipeExists(companyId, recipeId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = requiredString(input.name, 'name');
    if (input.type !== undefined) data.type = parseRecipeType(input.type);
    if (input.yieldQuantity !== undefined) data.yieldQuantity = positiveNumber(input.yieldQuantity, 'yieldQuantity');
    if (input.yieldUnit !== undefined) data.yieldUnit = requiredString(input.yieldUnit, 'yieldUnit');
    if (input.lossPercent !== undefined) data.lossPercent = optionalPercent(input.lossPercent);
    if (input.active !== undefined) data.active = Boolean(input.active);

    const updated = await this.prisma.recipe.update({
      where: { id: recipeId },
      data,
      include: {
        items: {
          include: {
            stockItem: {
              select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
            },
          },
        },
      },
    });
    return this.mapRecipe(updated);
  }

  async addItem(companyId: string, recipeId: string, input: UpsertRecipeItemInput) {
    await this.assertRecipeExists(companyId, recipeId);
    const stockItemId = requiredString(input.stockItemId, 'stockItemId');
    const stockItem = await this.prisma.stockItem.findFirst({
      where: { id: stockItemId, companyId },
      select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
    });
    if (!stockItem) {
      throw new BadRequestException('stockItemId invalido para a empresa atual.');
    }

    const created = await this.prisma.recipeItem.create({
      data: {
        recipeId,
        stockItemId,
        quantity: positiveNumber(input.quantity, 'quantity'),
        unit: requiredString(input.unit, 'unit'),
        optional: input.optional ?? false,
        affectsStock: input.affectsStock ?? true,
        affectsCost: input.affectsCost ?? true,
      },
      include: {
        stockItem: {
          select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
        },
      },
    });
    return this.mapRecipeItem(created);
  }

  async updateItem(companyId: string, recipeId: string, itemId: string, input: Partial<UpsertRecipeItemInput>) {
    ensureNonEmpty(input, ['quantity', 'unit', 'optional', 'affectsStock', 'affectsCost'], 'payload vazio para update recipe item.');
    await this.assertRecipeExists(companyId, recipeId);

    const current = await this.prisma.recipeItem.findFirst({
      where: { id: itemId, recipeId },
      include: { recipe: { select: { companyId: true } } },
    });
    if (!current || current.recipe.companyId !== companyId) {
      throw new NotFoundException('Item de ficha tecnica nao encontrado.');
    }

    const data: Record<string, unknown> = {};
    if (input.quantity !== undefined) data.quantity = positiveNumber(input.quantity, 'quantity');
    if (input.unit !== undefined) data.unit = requiredString(input.unit, 'unit');
    if (input.optional !== undefined) data.optional = Boolean(input.optional);
    if (input.affectsStock !== undefined) data.affectsStock = Boolean(input.affectsStock);
    if (input.affectsCost !== undefined) data.affectsCost = Boolean(input.affectsCost);

    const updated = await this.prisma.recipeItem.update({
      where: { id: itemId },
      data,
      include: {
        stockItem: {
          select: { id: true, name: true, averageCost: true, standardCost: true, lastCost: true },
        },
      },
    });
    return this.mapRecipeItem(updated);
  }

  private async assertRecipeExists(companyId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, companyId }, select: { id: true } });
    if (!recipe) {
      throw new NotFoundException('Ficha tecnica nao encontrada.');
    }
  }

  private mapRecipe(recipe: any) {
    const items = recipe.items.map((item: any) => this.mapRecipeItem(item));
    const totalCost = items.reduce((sum: number, item: any) => sum + (item.affectsCost ? item.costContribution : 0), 0);
    const lossPercent = recipe.lossPercent === null || recipe.lossPercent === undefined ? null : Number(recipe.lossPercent);
    const effectiveYield = Number(recipe.yieldQuantity) * (1 - ((lossPercent ?? 0) / 100));
    const costPerYieldUnit = effectiveYield > 0 ? totalCost / effectiveYield : 0;

    return {
      id: recipe.id,
      companyId: recipe.companyId,
      name: recipe.name,
      type: recipe.type,
      yieldQuantity: Number(recipe.yieldQuantity),
      yieldUnit: recipe.yieldUnit,
      lossPercent,
      active: recipe.active,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
      totals: {
        totalCost: round2(totalCost),
        effectiveYield: round3(effectiveYield),
        costPerYieldUnit: round4(costPerYieldUnit),
      },
      items,
    };
  }

  private mapRecipeItem(item: any) {
    const quantity = Number(item.quantity);
    const standardCost = Number(item.stockItem.standardCost ?? 0);
    const averageCost = Number(item.stockItem.averageCost ?? 0);
    const lastCost = Number(item.stockItem.lastCost ?? 0);
    const unitCost = standardCost > 0 ? standardCost : averageCost > 0 ? averageCost : lastCost;
    const costContribution = quantity * unitCost;

    return {
      id: item.id,
      recipeId: item.recipeId,
      stockItemId: item.stockItemId,
      stockItemName: item.stockItem.name,
      quantity: round3(quantity),
      unit: item.unit,
      optional: item.optional,
      affectsStock: item.affectsStock,
      affectsCost: item.affectsCost,
      unitCost: round4(unitCost),
      costContribution: round4(costContribution),
      createdAt: item.createdAt.toISOString(),
    };
  }
}

function parseRecipeType(type: unknown): RecipeType {
  if (type === RecipeType.SALE || type === RecipeType.PRODUCTION) return type;
  throw new BadRequestException('type deve ser SALE ou PRODUCTION.');
}

function requiredString(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new BadRequestException(`${field} obrigatorio.`);
  return normalized;
}

function positiveNumber(value: unknown, field: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new BadRequestException(`${field} deve ser numero maior que zero.`);
  return num;
}

function optionalPercent(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new BadRequestException('lossPercent deve estar entre 0 e 100.');
  }
  return num;
}

function ensureNonEmpty(payload: Record<string, unknown>, keys: string[], message: string) {
  if (!keys.some((key) => payload[key] !== undefined)) {
    throw new BadRequestException(message);
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
function round3(value: number): number {
  return Number(value.toFixed(3));
}
function round4(value: number): number {
  return Number(value.toFixed(4));
}
