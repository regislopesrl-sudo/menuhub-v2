import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { CompanyRbacRepository } from './company-rbac.repository';
import { CompanyRbacService } from './company-rbac.service';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService, CompanyRbacService, CompanyRbacRepository, PrismaService],
})
export class AdminUsersModule {}
