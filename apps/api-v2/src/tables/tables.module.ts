import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CommandsController, TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  controllers: [TablesController, CommandsController],
  providers: [TablesService, PrismaService],
  exports: [TablesService],
})
export class TablesModule {}

