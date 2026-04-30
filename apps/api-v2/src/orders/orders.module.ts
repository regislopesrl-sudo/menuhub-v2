import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrderPrismaRepository } from './order.prisma';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersEventsService } from './orders-events.service';
import { OrdersGateway } from './orders.gateway';
import { InMemoryOrdersEventPublisher } from './orders-in-memory.publisher';
import { ORDERS_EVENT_PUBLISHER } from './orders-event-publisher';

@Module({
  controllers: [OrdersController],
  providers: [
    PrismaService,
    OrderPrismaRepository,
    OrdersService,
    OrdersEventsService,
    OrdersGateway,
    InMemoryOrdersEventPublisher,
    {
      provide: ORDERS_EVENT_PUBLISHER,
      useExisting: InMemoryOrdersEventPublisher,
    },
  ],
  exports: [OrderPrismaRepository, OrdersService, OrdersEventsService, OrdersGateway],
})
export class OrdersModule {}
