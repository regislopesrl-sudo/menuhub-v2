import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { MenuPortMock } from '../ports/menu.mock';
import { PaymentPortMock } from '../ports/payment.mock';
import { MENU_PORT_TOKEN } from '../ports/menu.tokens';
import { MenuPrismaPort } from '../ports/menu.prisma';
import { PrismaService } from '../database/prisma.service';
import type { MenuPort } from '@delivery-futuro/order-core';
import { DeliveryModule } from '../delivery/delivery.module';
import { CheckoutController } from './checkout.controller';
import { PaymentsModule } from '../payments/payments.module';
import { PdvModule } from '../pdv/pdv.module';
import { OrdersModule } from '../orders/orders.module';
import { ModulesModule } from '../modules/modules.module';

export function selectMenuProvider(menuMock: MenuPortMock, menuPrisma: MenuPrismaPort): MenuPort {
  const provider = (process.env.MENU_PROVIDER ?? 'mock').toLowerCase();
  return provider === 'prisma' ? menuPrisma : menuMock;
}

@Module({
  imports: [DeliveryModule, PaymentsModule, PdvModule, OrdersModule, ModulesModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    MenuPortMock,
    MenuPrismaPort,
    PaymentPortMock,
    PrismaService,
    {
      provide: MENU_PORT_TOKEN,
      inject: [MenuPortMock, MenuPrismaPort],
      useFactory: selectMenuProvider,
    },
  ],
  exports: [CheckoutService],
})
export class CheckoutModule {}
