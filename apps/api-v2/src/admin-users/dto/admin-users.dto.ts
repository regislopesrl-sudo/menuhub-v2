export interface CreateAdminUserDto {
  name: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  isActive?: boolean;
  roleIds?: string[];
  branchIds?: string[];
  defaultBranchId?: string | null;
}

export interface UpdateAdminUserDto {
  name?: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  isActive?: boolean;
}

export interface UpdateAdminUserStatusDto {
  isActive: boolean;
}

export interface AssignAdminUserRolesDto {
  roleIds: string[];
}

export interface AssignAdminUserBranchesDto {
  branchIds: string[];
  defaultBranchId?: string | null;
}

export interface CreateCompanyRoleDto {
  key: string;
  name: string;
  description?: string | null;
  permissionIds?: string[];
}

export interface UpdateCompanyRoleDto {
  name?: string;
  description?: string | null;
  permissionIds?: string[];
}
