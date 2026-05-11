import { apiFetch } from '@/lib/api-fetch';

export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

export type TableItem = {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  sessions?: Array<{ id: string; guestCount: number; openedAt: string }>;
};

export type OpenCommand = {
  id: string;
  code: string;
  guestCount: number;
  openedAt: string;
  tableRestaurant?: { id: string; name: string } | null;
  tableSession?: { id: string; guestCount: number; openedAt: string } | null;
  orders?: Array<{ id: string; status: string; totalAmount: number }>;
};

export async function listTables() {
  return apiFetch<TableItem[]>('/v2/tables');
}

export async function createTable(payload: { name: string; capacity?: number }) {
  return apiFetch<TableItem>('/v2/tables', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function openTableSession(tableId: string, payload: { guestCount?: number; commandCode?: string }) {
  return apiFetch<{ session: { id: string }; command: { id: string; code: string } }>(`/v2/tables/${tableId}/sessions/open`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function closeTableSession(sessionId: string) {
  return apiFetch<{ id: string; status: string }>(`/v2/tables/sessions/${sessionId}/close`, { method: 'POST' });
}

export async function transferTableSession(sessionId: string, toTableId: string) {
  return apiFetch<{ ok: true }>(`/v2/tables/sessions/${sessionId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ toTableId }),
  });
}

export async function listOpenCommands() {
  return apiFetch<OpenCommand[]>('/v2/commands/open');
}

export async function splitCommand(commandId: string, splitByGuests: boolean) {
  return apiFetch<{ message: string }>(`/v2/commands/${commandId}/split`, {
    method: 'POST',
    body: JSON.stringify({ splitByGuests }),
  });
}

export async function mergeCommands(commandIds: string[]) {
  return apiFetch<{ message: string }>('/v2/commands/merge', {
    method: 'POST',
    body: JSON.stringify({ commandIds }),
  });
}

