import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ChannelsModule } from './channels/channels.module';
import { ModulesModule } from './modules/modules.module';
import { OrdersModule } from './orders/orders.module';
import { MenuModule } from './menu/menu.module';
import { DeliveryModule } from './delivery/delivery.module';
import { PaymentsModule } from './payments/payments.module';
import { KdsModule } from './kds/kds.module';
import { PdvModule } from './pdv/pdv.module';
import { DeveloperModule } from './developer/developer.module';
import { AdminMenuModule } from './admin-menu/admin-menu.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { SettingsModule } from './settings/settings.module';
import { HealthController } from './health.controller';
import { AuthModuleV2 } from './auth/auth.module';
import { AuthGuardV2 } from './common/auth.guard';
import { PermissionGuardV2 } from './common/permission.guard';
import { RequireAdminGuard } from './common/require-admin.guard';
import { RequireDeveloperGuard } from './common/require-developer.guard';

@Module({
  imports: [AuthModuleV2, ModulesModule, ChannelsModule, OrdersModule, MenuModule, DeliveryModule, PaymentsModule, KdsModule, PdvModule, DeveloperModule, AdminMenuModule, AdminUsersModule, SettingsModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuardV2 },
    { provide: APP_GUARD, useClass: PermissionGuardV2 },
    RequireAdminGuard,
    RequireDeveloperGuard,
  ],
})
export class AppModule {}
