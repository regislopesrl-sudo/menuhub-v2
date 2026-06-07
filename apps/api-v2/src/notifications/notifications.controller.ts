import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { TENANT_PERMISSIONS } from '../common/rbac';
import type { RequestContext } from '../common/request-context';
import { NotificationsService } from './notifications.service';
import type { NotificationChannel, NotificationSettings } from './notification.types';

@Controller('v2/notifications')
@UseGuards(RequireAdminGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions(TENANT_PERMISSIONS.NOTIFICATIONS_READ, TENANT_PERMISSIONS.NOTIFICATIONS_MANAGE)
  list(@CurrentContext() ctx: RequestContext, @Query() query: { unreadOnly?: string; limit?: string }) {
    return this.notificationsService.list(ctx, query);
  }

  @Patch(':id/read')
  @RequirePermissions(TENANT_PERMISSIONS.NOTIFICATIONS_MANAGE)
  markRead(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.notificationsService.markRead(ctx, id);
  }

  @Get('settings')
  @RequirePermissions(TENANT_PERMISSIONS.NOTIFICATIONS_READ, TENANT_PERMISSIONS.NOTIFICATIONS_MANAGE)
  getSettings(@CurrentContext() ctx: RequestContext) {
    return this.notificationsService.getSettings(ctx);
  }

  @Patch('settings')
  @RequirePermissions(TENANT_PERMISSIONS.NOTIFICATIONS_MANAGE)
  patchSettings(@CurrentContext() ctx: RequestContext, @Body() body: Partial<NotificationSettings>) {
    return this.notificationsService.patchSettings(ctx, body);
  }

  @Post('mock/send')
  @RequirePermissions(TENANT_PERMISSIONS.NOTIFICATIONS_MANAGE)
  sendMock(
    @CurrentContext() ctx: RequestContext,
    @Body()
    body: {
      title?: string;
      message?: string;
      channel?: NotificationChannel;
      orderId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.notificationsService.sendMock(ctx, body);
  }
}
