export const ORDER_SOCKET_NAMESPACE = '/orders' as const;
export const ORDER_SOCKET_PATH = '/socket.io' as const;

export const REALTIME_EVENT_MESSAGE = 'realtime.event' as const;
export const REALTIME_CONNECTED_EVENT = 'realtime.connected' as const;
export const REALTIME_ACK_EVENT = 'event.ack' as const;
export const REALTIME_RESUME_EVENT = 'realtime.resume' as const;
export const REALTIME_SUBSCRIBE_EVENT = 'room.subscribe' as const;
export const REALTIME_UNSUBSCRIBE_EVENT = 'room.unsubscribe' as const;
export const REALTIME_ERROR_EVENT = 'realtime.error' as const;
export const REALTIME_REPLAY_COMPLETE_EVENT = 'realtime.replay_complete' as const;
export const REALTIME_AUTH_EXPIRED_EVENT = 'auth.expired' as const;

export const JOIN_ORDER_ROOM_EVENT = 'join_order_room' as const;
export const LEAVE_ORDER_ROOM_EVENT = 'leave_order_room' as const;
export const JOIN_BRANCH_ROOM_EVENT = 'join_branch_room' as const;
export const LEAVE_BRANCH_ROOM_EVENT = 'leave_branch_room' as const;
export const JOIN_USER_ROOM_EVENT = 'join_user_room' as const;
export const LEAVE_USER_ROOM_EVENT = 'leave_user_room' as const;
export const JOIN_KDS_ROOM_EVENT = 'join_kds_room' as const;
export const LEAVE_KDS_ROOM_EVENT = 'leave_kds_room' as const;

// Backward compatibility aliases (deprecated).
export const REALTIME_ACK_COMPAT_EVENT = 'realtime.ack' as const;
export const REALTIME_SUBSCRIBE_COMPAT_EVENT = 'realtime.subscribe' as const;
export const REALTIME_UNSUBSCRIBE_COMPAT_EVENT = 'realtime.unsubscribe' as const;
export const JOIN_ORDER_COMPAT_EVENT = 'join_order' as const;
export const LEAVE_ORDER_COMPAT_EVENT = 'leave_order' as const;
export const JOIN_BRANCH_COMPAT_EVENT = 'join_branch' as const;
export const LEAVE_BRANCH_COMPAT_EVENT = 'leave_branch' as const;
export const JOIN_USER_COMPAT_EVENT = 'join_user' as const;
export const LEAVE_USER_COMPAT_EVENT = 'leave_user' as const;
export const JOIN_KDS_COMPAT_EVENT = 'join_kds' as const;
export const LEAVE_KDS_COMPAT_EVENT = 'leave_kds' as const;

export type OrderRoomName = `order_${string}`;
export type BranchRoomName = `branch_${string}`;
export type UserRoomName = `user_${string}`;
export type CustomerRoomName = `customer_${string}`;
export type SessionRoomName = `session_${string}`;
export type KdsBranchRoomName = `kds_branch_${string}`;
export type KdsStationRoomName = `kds_station_${string}_${string}`;
export type FinanceRoomName = `finance_${string}`;
export type AlertsRoomName = `alerts_${string}`;

export const KDS_ROOM_NAME = 'kds_room' as const;

export type RealtimeActorKind = 'user' | 'customer' | 'system';
export type RealtimeEventOrigin =
  | 'orders'
  | 'checkout'
  | 'payments'
  | 'kds'
  | 'stock'
  | 'alerts'
  | 'financial';

export type RealtimeSubscriptionScope =
  | 'branch'
  | 'order'
  | 'user'
  | 'customer'
  | 'session'
  | 'kds'
  | 'kds_branch'
  | 'kds_station'
  | 'finance'
  | 'alerts';

export interface RealtimeEventMetadata {
  schemaVersion: 'v1';
  aggregate: string;
  aggregateVersion?: number | null;
  roomHints: string[];
  requiresAck: boolean;
  dedupeKey: string;
  payloadSchemaVersion?: number | null;
  extra?: Record<string, unknown>;
}

export interface RealtimeEventEnvelope<TType extends string = string, TPayload = unknown> {
  eventId: string;
  type: TType;
  timestamp: string;
  traceId: string;
  companyId?: string | null;
  branchId?: string | null;
  orderId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  origin: RealtimeEventOrigin;
  payload: TPayload;
  metadata: RealtimeEventMetadata;
}

export interface RealtimeConnectedEvent {
  sessionId: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  subjectId: string;
  branchIds: string[];
}

export interface RealtimeAckEvent {
  eventId: string;
}

export interface RealtimeResumeEvent {
  lastEventId?: string | null;
}

export interface RealtimeReplayCompleteEvent {
  lastEventId?: string | null;
  count: number;
}

export interface RealtimeErrorEvent {
  message: string;
}

export interface RealtimeSubscribeEvent {
  scope: RealtimeSubscriptionScope;
  roomKey?: string;
  branchId?: string;
  orderId?: string;
  userId?: string;
  customerId?: string;
  sessionId?: string;
  station?: string;
}

export interface RealtimeUnsubscribeEvent {
  roomKey: string;
}

function trimId(value: string) {
  return String(value ?? '').trim();
}

export function buildOrderRoomName(orderId: string): OrderRoomName {
  return `order_${trimId(orderId)}` as OrderRoomName;
}

export function buildBranchRoomName(branchId: string): BranchRoomName {
  return `branch_${trimId(branchId)}` as BranchRoomName;
}

export function buildUserRoomName(userId: string): UserRoomName {
  return `user_${trimId(userId)}` as UserRoomName;
}

export function buildCustomerRoomName(customerId: string): CustomerRoomName {
  return `customer_${trimId(customerId)}` as CustomerRoomName;
}

export function buildSessionRoomName(sessionId: string): SessionRoomName {
  return `session_${trimId(sessionId)}` as SessionRoomName;
}

export function buildKdsBranchRoomName(branchId: string): KdsBranchRoomName {
  return `kds_branch_${trimId(branchId)}` as KdsBranchRoomName;
}

export function buildKdsStationRoomName(branchId: string, station: string): KdsStationRoomName {
  return `kds_station_${trimId(branchId)}_${trimId(station).toLowerCase()}` as KdsStationRoomName;
}

export function buildFinanceRoomName(branchId: string): FinanceRoomName {
  return `finance_${trimId(branchId)}` as FinanceRoomName;
}

export function buildAlertsRoomName(branchId: string): AlertsRoomName {
  return `alerts_${trimId(branchId)}` as AlertsRoomName;
}

export function isRealtimeRoomName(value: string) {
  return (
    /^order_[\w-]+$/i.test(value) ||
    /^branch_[\w-]+$/i.test(value) ||
    /^user_[\w-]+$/i.test(value) ||
    /^customer_[\w-]+$/i.test(value) ||
    /^session_[\w-]+$/i.test(value) ||
    /^kds_branch_[\w-]+$/i.test(value) ||
    /^kds_station_[\w-]+_[\w-]+$/i.test(value) ||
    /^finance_[\w-]+$/i.test(value) ||
    /^alerts_[\w-]+$/i.test(value) ||
    value === KDS_ROOM_NAME
  );
}
