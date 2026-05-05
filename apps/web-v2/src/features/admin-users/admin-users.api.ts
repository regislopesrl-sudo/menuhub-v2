import { apiFetch } from '@/lib/api-fetch';

export interface AdminUsersHeaders {
  companyId: string;
  branchId?: string;
  userRole?: 'admin' | 'master' | 'developer';
}

export interface AdminRole {
  id: string;
  name: string;
  description: string;
  permissions: Array<{
    id: string;
    code: string;
    description: string;
  }>;
}

export interface AdminPermission {
  id: string;
  code: string;
  description: string;
}

export interface AdminBranch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  permissions: AdminPermission[];
  branches: Array<{
    id: string;
    companyId: string;
    name: string;
    code: string;
    isDefault: boolean;
  }>;
  defaultBranchId: string | null;
}

function buildHeaders(input: AdminUsersHeaders) {
  return {
    'Content-Type': 'application/json',
    'x-company-id': input.companyId,
    ...(input.branchId ? { 'x-branch-id': input.branchId } : {}),
    'x-channel': 'admin_panel',
  };
}

export function listAdminUsers(headers: AdminUsersHeaders) {
  return apiFetch<{ items: AdminUser[]; total: number }>('/v2/admin/users', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function createAdminUser(
  headers: AdminUsersHeaders,
  body: {
    name: string;
    email?: string | null;
    phone?: string | null;
    password: string;
    isActive?: boolean;
    roleIds?: string[];
    branchIds?: string[];
    defaultBranchId?: string | null;
  },
) {
  return apiFetch<AdminUser>('/v2/admin/users', {
    method: 'POST',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function updateAdminUser(
  headers: AdminUsersHeaders,
  userId: string,
  body: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    password?: string;
    isActive?: boolean;
  },
) {
  return apiFetch<AdminUser>(`/v2/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function updateAdminUserStatus(
  headers: AdminUsersHeaders,
  userId: string,
  isActive: boolean,
) {
  return apiFetch<AdminUser>(`/v2/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    headers: buildHeaders(headers),
    body: JSON.stringify({ isActive }),
  });
}

export function assignAdminUserRoles(
  headers: AdminUsersHeaders,
  userId: string,
  roleIds: string[],
) {
  return apiFetch<AdminUser>(`/v2/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PUT',
    headers: buildHeaders(headers),
    body: JSON.stringify({ roleIds }),
  });
}

export function assignAdminUserBranches(
  headers: AdminUsersHeaders,
  userId: string,
  body: { branchIds: string[]; defaultBranchId?: string | null },
) {
  return apiFetch<AdminUser>(`/v2/admin/users/${encodeURIComponent(userId)}/branches`, {
    method: 'PUT',
    headers: buildHeaders(headers),
    body: JSON.stringify(body),
  });
}

export function deleteAdminUser(headers: AdminUsersHeaders, userId: string) {
  return apiFetch<{ success: boolean; userId: string }>(`/v2/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: buildHeaders(headers),
  });
}

export function listAdminRoles(headers: AdminUsersHeaders) {
  return apiFetch<{ items: AdminRole[]; total: number }>('/v2/admin/roles', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function listAdminPermissions(headers: AdminUsersHeaders) {
  return apiFetch<{ items: AdminPermission[]; total: number }>('/v2/admin/permissions', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

export function listAdminBranches(headers: AdminUsersHeaders) {
  return apiFetch<{ items: AdminBranch[]; total: number }>('/v2/admin/branches', {
    method: 'GET',
    headers: buildHeaders(headers),
  });
}

