import { BadRequestException } from '@nestjs/common';
import { assertCanCancelOrder, assertCanTransitionOrderStatus, canTransitionOrderStatus } from './orders-status.policy';

describe('orders-status.policy', () => {
  it('permite transicoes operacionais validas', () => {
    expect(canTransitionOrderStatus('PENDING_CONFIRMATION', 'CONFIRMED')).toBe(true);
    expect(canTransitionOrderStatus('CONFIRMED', 'IN_PREPARATION')).toBe(true);
    expect(canTransitionOrderStatus('READY', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionOrderStatus('DELIVERED', 'FINALIZED')).toBe(true);
  });

  it('bloqueia transicoes invalidas', () => {
    expect(() => assertCanTransitionOrderStatus('FINALIZED', 'READY')).toThrow(BadRequestException);
    expect(() => assertCanTransitionOrderStatus('OUT_FOR_DELIVERY', 'IN_PREPARATION')).toThrow(BadRequestException);
  });

  it('exige rota propria para cancelamento com motivo', () => {
    expect(() => assertCanTransitionOrderStatus('CONFIRMED', 'CANCELED')).toThrow(BadRequestException);
  });

  it('bloqueia cancelamento de status terminal', () => {
    expect(() => assertCanCancelOrder('FINALIZED')).toThrow(BadRequestException);
    expect(() => assertCanCancelOrder('CANCELED')).toThrow(BadRequestException);
    expect(() => assertCanCancelOrder('REFUNDED')).toThrow(BadRequestException);
  });
});
