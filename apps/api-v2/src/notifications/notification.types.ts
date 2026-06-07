export type NotificationChannel = 'internal' | 'whatsapp_future' | 'email_future' | 'push_future';

export type NotificationEventType =
  | 'order.created'
  | 'order.accepted'
  | 'order.ready'
  | 'order.out_for_delivery'
  | 'order.canceled'
  | 'payment.paid'
  | 'delivery.assigned'
  | 'manual.mock';

export type StoredNotification = {
  id: string;
  type: NotificationEventType;
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

export type NotificationSettings = {
  internal: boolean;
  whatsapp_future: boolean;
  email_future: boolean;
  push_future: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
};
