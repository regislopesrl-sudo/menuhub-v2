import { BadRequestException } from '@nestjs/common';
import {
  assertClosureNotesWhenDivergent,
  assertValidCashMovement,
  assertValidDeclaredCashAmount,
  assertValidOpeningBalance,
  calculateCashDifference,
  resolveCashDivergenceLevel,
  resolveCashDivergenceSeverity,
} from './pdv-cash.policy';

describe('pdv-cash.policy', () => {
  it('valida saldo inicial e valor declarado', () => {
    expect(() => assertValidOpeningBalance(0)).not.toThrow();
    expect(() => assertValidDeclaredCashAmount(10)).not.toThrow();
    expect(() => assertValidOpeningBalance(-1)).toThrow(BadRequestException);
    expect(() => assertValidDeclaredCashAmount(-1)).toThrow(BadRequestException);
    expect(() => assertValidOpeningBalance(Number.NaN)).toThrow(BadRequestException);
  });

  it('valida movimentacao manual com motivo e valor positivo', () => {
    expect(() => assertValidCashMovement({ type: 'SUPPLY', amount: 10, reason: 'Troco' })).not.toThrow();
    expect(() => assertValidCashMovement({ type: 'WITHDRAWAL', amount: 10, reason: 'Sangria' })).not.toThrow();
    expect(() => assertValidCashMovement({ type: 'ADJUSTMENT', amount: 1, reason: 'Ajuste' })).not.toThrow();
    expect(() => assertValidCashMovement({ type: 'SUPPLY', amount: 10 })).toThrow(BadRequestException);
    expect(() => assertValidCashMovement({ type: 'WITHDRAWAL', amount: 0, reason: 'Sangria' })).toThrow(BadRequestException);
  });

  it('bloqueia sangria maior que o dinheiro esperado', () => {
    expect(() =>
      assertValidCashMovement({ type: 'WITHDRAWAL', amount: 101, expectedCashAmount: 100, reason: 'Sangria' }),
    ).toThrow(BadRequestException);
  });

  it('calcula divergencia e severidade', () => {
    expect(calculateCashDifference(95, 100)).toBe(-5);
    expect(resolveCashDivergenceLevel(-5)).toBe('shortage');
    expect(resolveCashDivergenceLevel(5)).toBe('overage');
    expect(resolveCashDivergenceSeverity(0.5)).toBe('none');
    expect(resolveCashDivergenceSeverity(5)).toBe('low');
    expect(resolveCashDivergenceSeverity(30)).toBe('medium');
    expect(resolveCashDivergenceSeverity(100)).toBe('high');
    expect(resolveCashDivergenceSeverity(500)).toBe('critical');
  });

  it('exige justificativa quando divergencia passa da tolerancia', () => {
    expect(() => assertClosureNotesWhenDivergent({ differenceAmount: 0.5 })).not.toThrow();
    expect(() => assertClosureNotesWhenDivergent({ differenceAmount: 5 })).toThrow(BadRequestException);
    expect(() => assertClosureNotesWhenDivergent({ differenceAmount: -5, closureNotes: 'Quebra justificada' })).not.toThrow();
  });
});
