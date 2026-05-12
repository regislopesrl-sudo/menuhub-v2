import { BadRequestException } from '@nestjs/common';

export const PDV_CASH_DIVERGENCE_TOLERANCE = 1;
export const PDV_WITHDRAWAL_REASONS = ['SAFE_TRANSFER', 'EXPENSE_PAYMENT', 'MANAGER_WITHDRAWAL', 'CASH_REDUCTION', 'OTHER'] as const;
export const PDV_SUPPLY_REASONS = ['INITIAL_ADJUSTMENT', 'CHANGE_MONEY', 'MANAGER_SUPPLY', 'CORRECTION', 'OTHER'] as const;

export type PdvCashMovementType = 'SUPPLY' | 'WITHDRAWAL' | 'SALE' | 'ADJUSTMENT';
export type PdvCashDivergenceLevel = 'none' | 'shortage' | 'overage';
export type PdvCashDivergenceSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export function assertValidOpeningBalance(value: number): void {
  assertFiniteMoney(value, 'Saldo inicial');
  if (value < 0) {
    throw new BadRequestException('Saldo inicial nao pode ser negativo.');
  }
}

export function assertValidDeclaredCashAmount(value: number): void {
  assertFiniteMoney(value, 'Valor declarado');
  if (value < 0) {
    throw new BadRequestException('Valor declarado no fechamento nao pode ser negativo.');
  }
}

export function assertValidCashMovement(input: {
  type: PdvCashMovementType;
  amount: number;
  reason?: string;
  expectedCashAmount?: number;
}): void {
  if (!['SUPPLY', 'WITHDRAWAL', 'SALE', 'ADJUSTMENT'].includes(input.type)) {
    throw new BadRequestException(`Tipo de movimentacao invalido: ${input.type}.`);
  }
  assertFiniteMoney(input.amount, 'Valor da movimentacao');
  if (input.amount <= 0) {
    throw new BadRequestException('Valor da movimentacao deve ser maior que zero.');
  }
  if (['SUPPLY', 'WITHDRAWAL', 'ADJUSTMENT'].includes(input.type) && !input.reason?.trim()) {
    throw new BadRequestException('Motivo obrigatorio para movimentacao manual de caixa.');
  }
  if (
    input.type === 'WITHDRAWAL' &&
    input.expectedCashAmount !== undefined &&
    input.amount > input.expectedCashAmount
  ) {
    throw new BadRequestException('Sangria nao pode exceder o dinheiro esperado em caixa.');
  }
}

export function calculateCashDifference(declared: number, expected: number): number {
  return Number((declared - expected).toFixed(2));
}

export function resolveCashDivergenceLevel(diff: number): PdvCashDivergenceLevel {
  if (diff === 0) return 'none';
  return diff < 0 ? 'shortage' : 'overage';
}

export function resolveCashDivergenceSeverity(absDiff: number): PdvCashDivergenceSeverity {
  if (absDiff <= PDV_CASH_DIVERGENCE_TOLERANCE) return 'none';
  if (absDiff <= 10) return 'low';
  if (absDiff <= 50) return 'medium';
  if (absDiff <= 200) return 'high';
  return 'critical';
}

export function assertClosureNotesWhenDivergent(input: {
  differenceAmount: number;
  closureNotes?: string;
}): void {
  const absDiff = Math.abs(input.differenceAmount);
  if (absDiff > PDV_CASH_DIVERGENCE_TOLERANCE && !input.closureNotes?.trim()) {
    throw new BadRequestException('Justificativa obrigatoria para divergencia acima da tolerancia.');
  }
}

function assertFiniteMoney(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new BadRequestException(`${label} deve ser um numero valido.`);
  }
}
