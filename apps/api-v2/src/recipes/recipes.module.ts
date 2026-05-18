import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { PrismaService } from '../database/prisma.service';
import { ModulesModule } from '../modules/modules.module';
import { AuditLogService } from '../common/audit-log.service';
import { ProductRecipesBackendService } from './product-recipes-backend.service';

@Module({
  imports: [ModulesModule],
  controllers: [RecipesController],
  providers: [RecipesService, ProductRecipesBackendService, AuditLogService, PrismaService],
  exports: [RecipesService, ProductRecipesBackendService],
})
export class RecipesModule {}
