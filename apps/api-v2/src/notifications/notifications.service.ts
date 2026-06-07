import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import type { NotificationChannel, NotificationSettings, StoredNotification } from './notification.types';

const NOTIFICATIONS_KEY = 'notifications.local';
const NOTIFICATION_SETTINGS_KEY = 'notifications.settings';
const MAX_STORED_NOTIFICATIONS = 200;

type JsonRecord = Record<string, unknown>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: RequestContext, query: { unreadOnly?: string; limit?: string } = {}) {
    const branchId = await this.resolveBranchId(ctx);
    const notifications = await this.readNotifications(ctx.companyId, branchId);
    const limit = this.positiveInt(query.limit, 50);
    const filtered = query.unreadOnly === 'true' ? notifications.filter((item) => !item.read) : notifications;
    return {
      generatedAt: new Date().toISOString(),
      provider: 'local-company-setting',
      items: filtered.slice(0, limit),
      unreadCount: notifications.filter((item) => !item.read).length,
      total: notifications.length,
    };
  }

  async markRead(ctx: RequestContext, notificationId: string) {
    const branchId = await this.resolveBranchId(ctx);
    const notifications = await this.readNotifications(ctx.companyId, branchId);
    const index = notifications.findIndex((item) => item.id === notificationId);
    if (index < 0) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    notifications[index] = {
      ...notifications[index],
      read: true,
      readAt: new Date().toISOString(),
    };
    await this.writeSetting(ctx.companyId, branchId, NOTIFICATIONS_KEY, { items: notifications });
    return notifications[index];
  }

  async getSettings(ctx: RequestContext) {
    const branchId = await this.resolveBranchId(ctx);
    return {
      branchId,
      provider: 'local-mock',
      realExternalProvidersEnabled: false,
      settings: await this.readSettings(ctx.companyId, branchId),
    };
  }

  async patchSettings(ctx: RequestContext, body: Partial<NotificationSettings>) {
    const branchId = await this.resolveBranchId(ctx);
    const current = await this.readSettings(ctx.companyId, branchId);
    const next: NotificationSettings = {
      ...current,
      ...(body.internal !== undefined ? { internal: Boolean(body.internal) } : {}),
      ...(body.whatsapp_future !== undefined ? { whatsapp_future: Boolean(body.whatsapp_future) } : {}),
      ...(body.email_future !== undefined ? { email_future: Boolean(body.email_future) } : {}),
      ...(body.push_future !== undefined ? { push_future: Boolean(body.push_future) } : {}),
      ...(body.quietHoursEnabled !== undefined ? { quietHoursEnabled: Boolean(body.quietHoursEnabled) } : {}),
      ...(body.quietHoursStart !== undefined ? { quietHoursStart: this.optionalString(body.quietHoursStart) ?? undefined } : {}),
      ...(body.quietHoursEnd !== undefined ? { quietHoursEnd: this.optionalString(body.quietHoursEnd) ?? undefined } : {}),
    };
    await this.writeSetting(ctx.companyId, branchId, NOTIFICATION_SETTINGS_KEY, next as unknown as JsonRecord);
    return { branchId, settings: next };
  }

  async sendMock(
    ctx: RequestContext,
    body: {
      title?: string;
      message?: string;
      channel?: NotificationChannel;
      orderId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const branchId = await this.resolveBranchId(ctx);
    const settings = await this.readSettings(ctx.companyId, branchId);
    const channel = body.channel ?? 'internal';
    if (!settings[channel]) {
      throw new BadRequestException(`Canal de notificacao '${channel}' esta desativado.`);
    }

    const notification: StoredNotification = {
      id: randomUUID(),
      type: 'manual.mock',
      title: this.optionalString(body.title) ?? 'Notificacao local',
      message: this.optionalString(body.message) ?? 'Evento mock gerado no DEV.',
      channel,
      read: false,
      companyId: ctx.companyId,
      branchId,
      orderId: this.optionalString(body.orderId) ?? undefined,
      metadata: this.sanitizeMetadata(body.metadata),
      createdAt: new Date().toISOString(),
    };

    const notifications = [notification, ...(await this.readNotifications(ctx.companyId, branchId))].slice(
      0,
      MAX_STORED_NOTIFICATIONS,
    );
    await this.writeSetting(ctx.companyId, branchId, NOTIFICATIONS_KEY, { items: notifications });
    await this.enqueueRealtimeOutbox(ctx, notification);
    return notification;
  }

  private async enqueueRealtimeOutbox(ctx: RequestContext, notification: StoredNotification) {
    await this.prisma.realtimeOutboxEvent
      .create({
        data: {
          eventType: 'notification.created',
          aggregateType: 'notification',
          aggregateId: notification.id,
          traceId: ctx.requestId,
          companyId: ctx.companyId,
          branchId: notification.branchId,
          orderId: notification.orderId,
          actorUserId: ctx.userId,
          sourceModule: 'notifications',
          sourceAction: 'mock.send',
          dedupeKey: `notification:${notification.id}`,
          payload: notification as any,
          roomKeys: [`company:${ctx.companyId}`, `branch:${notification.branchId}`],
        },
      })
      .catch(() => null);
  }

  private async readNotifications(companyId: string, branchId: string): Promise<StoredNotification[]> {
    const setting = await this.readSetting(companyId, branchId, NOTIFICATIONS_KEY);
    const items = Array.isArray(setting.items) ? setting.items : [];
    return items.filter((item) => this.isStoredNotification(item));
  }

  private async readSettings(companyId: string, branchId: string): Promise<NotificationSettings> {
    const raw = await this.readSetting(companyId, branchId, NOTIFICATION_SETTINGS_KEY);
    return {
      internal: this.readBoolean(raw, 'internal', true),
      whatsapp_future: this.readBoolean(raw, 'whatsapp_future', false),
      email_future: this.readBoolean(raw, 'email_future', false),
      push_future: this.readBoolean(raw, 'push_future', false),
      quietHoursEnabled: this.readBoolean(raw, 'quietHoursEnabled', false),
      quietHoursStart: this.readString(raw, 'quietHoursStart') ?? '22:00',
      quietHoursEnd: this.readString(raw, 'quietHoursEnd') ?? '08:00',
    };
  }

  private async resolveBranchId(ctx: RequestContext): Promise<string> {
    if (ctx.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: ctx.branchId, companyId: ctx.companyId },
        select: { id: true },
      });
      if (branch) return branch.id;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { companyId: ctx.companyId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException('Nenhuma filial encontrada para notificacoes.');
    }
    return branch.id;
  }

  private async readSetting(companyId: string, branchId: string, key: string): Promise<JsonRecord> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { companyId, branchId, key },
      select: { value: true },
    });
    return this.isRecord(setting?.value) ? (setting?.value as JsonRecord) : {};
  }

  private async writeSetting(companyId: string, branchId: string, key: string, value: JsonRecord) {
    await this.prisma.companySetting.upsert({
      where: { companyId_branchId_key: { companyId, branchId, key } },
      create: { companyId, branchId, key, value: value as any },
      update: { value: value as any },
    });
  }

  private isStoredNotification(value: unknown): value is StoredNotification {
    return this.isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
  }

  private sanitizeMetadata(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private readString(input: JsonRecord, key: string): string | null {
    const value = input[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readBoolean(input: JsonRecord, key: string, fallback: boolean): boolean {
    return typeof input[key] === 'boolean' ? Boolean(input[key]) : fallback;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
