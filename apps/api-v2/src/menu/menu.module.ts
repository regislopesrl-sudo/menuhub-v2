import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ModulesModule } from '../modules/modules.module';
import { StockModule } from '../stock/stock.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [ModulesModule, StockModule],
  controllers: [MenuController],
  providers: [MenuService, PrismaService],
})
export class MenuModule {}
