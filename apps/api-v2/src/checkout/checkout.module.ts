import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { MenuPortMock } from '../ports/menu.mock';
import { PaymentPortMock } from '../ports/payment.mock';
import { MENU_PORT_TOKEN } from '../ports/menu.tokens';
import { MenuPrismaPort } from '../ports/menu.prisma';
import { PrismaService } from '../database/prisma.service';
import type { MenuPort } from '@delivery-futuro/order-core';
import { OrderPrismaRepository } from '../orders/order.prisma';
import { OrdersEventsService } from '../orders/orders-events.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { CheckoutController } from './checkout.controller';
import { PaymentsModule } from '../payments/payments.module';

export function selectMenuProvider(menuMock: MenuPortMock, menuPrisma: MenuPrismaPort): MenuPort {
  const provider = (process.env.MENU_PROVIDER ?? 'mock').toLowerCase();
  return provider === 'prisma' ? menuPrisma : menuMock;
}

@Module({
  imports: [DeliveryModule, PaymentsModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    MenuPortMock,
    MenuPrismaPort,
    PaymentPortMock,
    PrismaService,
    OrderPrismaRepository,
    OrdersEventsService,
    {
      provide: MENU_PORT_TOKEN,
      inject: [MenuPortMock, MenuPrismaPort],
      useFactory: selectMenuProvider,
    },
  ],
  exports: [CheckoutService],
})
export class CheckoutModule {}
