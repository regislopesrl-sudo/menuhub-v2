import { BadRequestException } from '@nestjs/common';

export const TERMINAL_ORDER_STATUSES = ['FINALIZED', 'CANCELED', 'REFUNDED'] as const;

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELED'],
  CONFIRMED: ['IN_PREPARATION', 'READY', 'CANCELED'],
  IN_PREPARATION: ['READY', 'CANCELED'],
  READY: ['WAITING_PICKUP', 'WAITING_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FINALIZED', 'CANCELED'],
  WAITING_PICKUP: ['DELIVERED', 'FINALIZED', 'CANCELED'],
  WAITING_DISPATCH: ['OUT_FOR_DELIVERY', 'CANCELED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELED'],
  DELIVERED: ['FINALIZED'],
  FINALIZED: [],
  CANCELED: [],
  REFUNDED: [],
};

export function canTransitionOrderStatus(from: string, to: string): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertCanTransitionOrderStatus(from: string, to: string): void {
  if (to === 'CANCELED') {
    throw new BadRequestException('Use a rota de cancelamento com motivo para cancelar pedidos.');
  }
  if (!canTransitionOrderStatus(from, to)) {
    throw new BadRequestException(`Transicao de status invalida: ${from} -> ${to}.`);
  }
}

export function assertCanCancelOrder(status: string): void {
  if (TERMINAL_ORDER_STATUSES.includes(status as (typeof TERMINAL_ORDER_STATUSES)[number])) {
    throw new BadRequestException(`Pedido em status ${status} nao pode ser cancelado.`);
  }
}
