import { apiFetch } from '@/lib/api-fetch';

export type NotificationChannel = 'internal' | 'whatsapp_future' | 'email_future' | 'push_future';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  channel: NotificationChannel;
  read: boolean;
  companyId: string;
  branchId: string;
  orderId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
};

export type NotificationsResponse = {
  generatedAt: string;
  provider: string;
  items: NotificationItem[];
  unreadCount: number;
  total: number;
};

export type NotificationSettings = {
  internal: boolean;
  whatsapp_future: boolean;
  email_future: boolean;
  push_future: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
};

export function listNotifications(params?: { unreadOnly?: boolean; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.unreadOnly) query.set('unreadOnly', 'true');
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch<NotificationsResponse>(`/v2/notifications${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function markNotificationRead(id: string) {
  return apiFetch<NotificationItem>(`/v2/notifications/${id}/read`, { method: 'PATCH' });
}

export function getNotificationSettings() {
  return apiFetch<{ branchId: string; provider: string; realExternalProvidersEnabled: boolean; settings: NotificationSettings }>(
    '/v2/notifications/settings',
    { method: 'GET' },
  );
}

export function patchNotificationSettings(settings: Partial<NotificationSettings>) {
  return apiFetch<{ branchId: string; settings: NotificationSettings }>('/v2/notifications/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function sendMockNotification(input: {
  title?: string;
  message?: string;
  channel?: NotificationChannel;
  orderId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<NotificationItem>('/v2/notifications/mock/send', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
