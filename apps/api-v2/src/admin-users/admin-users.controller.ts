import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { AdminUsersService } from './admin-users.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
import { AUDIT_ACTIONS } from '../common/audit-log';
import { recordAuditFromContext } from '../common/audit-log-recorder';
import type {
  AssignAdminUserBranchesDto,
  AssignAdminUserRolesDto,
  CreateCompanyRoleDto,
  CreateAdminUserDto,
  UpdateCompanyRoleDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-users.dto';

@Controller('v2/admin')
@UseGuards(RequireAdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get('users')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_READ, TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  listUsers(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listUsers(ctx);
  }

  @Get('users/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_READ, TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  getUser(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.getUser(id, ctx);
  }

  @Post('users')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async createUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    try {
      const result = await this.adminUsersService.createUser(ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_CREATE,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_CREATE,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user' },
        metadata: { companyId: ctx.companyId, email: body?.email ?? null, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Post('users/invite')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  inviteUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    return this.adminUsersService.createUser(ctx, body).then((result) => {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_CREATE,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id, invite: true },
      });
      return result;
    });
  }

  @Patch('users/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async updateUser(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserDto,
  ) {
    try {
      const result = await this.adminUsersService.updateUser(id, ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Patch('users/:id/status')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async updateUserStatus(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserStatusDto,
  ) {
    try {
      const result = await this.adminUsersService.updateUserStatus(id, ctx, body.isActive);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id, isActive: body.isActive },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, isActive: body?.isActive, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Patch('users/:id/role')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async updateUserPrimaryRole(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { roleId?: string; roleIds?: string[] },
  ) {
    const roleIds = body.roleIds?.length ? body.roleIds : body.roleId ? [body.roleId] : [];
    try {
      const result = await this.adminUsersService.assignRoles(id, ctx, { roleIds });
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id, roleIds },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, roleIds, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Put('users/:id/roles')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async assignRoles(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserRolesDto,
  ) {
    try {
      const result = await this.adminUsersService.assignRoles(id, ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id, roleIds: body.roleIds },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, roleIds: body?.roleIds ?? [], error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Put('users/:id/branches')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async assignBranches(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserBranchesDto,
  ) {
    try {
      const result = await this.adminUsersService.assignBranches(id, ctx, body);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.id, label: result.email ?? result.name ?? result.id },
        metadata: { companyId: ctx.companyId, userId: result.id, branchIds: body.branchIds },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_ROLE_ASSIGN,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, branchIds: body?.branchIds ?? [], error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Delete('users/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  async deleteUser(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    try {
      const result = await this.adminUsersService.deleteUser(id, ctx);
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: 'success',
        ctx,
        target: { type: 'admin_user', id: result.userId, label: result.userId },
        metadata: { companyId: ctx.companyId, userId: result.userId, deleted: true },
      });
      return result;
    } catch (error) {
      recordAuditFromContext({
        action: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
        outcome: error instanceof ForbiddenException ? 'blocked' : 'failure',
        ctx,
        target: { type: 'admin_user', id },
        metadata: { companyId: ctx.companyId, userId: id, deleted: true, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  @Get('roles')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_READ, TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  listRoles(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listRoles(ctx);
  }

  @Post('roles')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  createCompanyRole(@CurrentContext() ctx: RequestContext, @Body() body: CreateCompanyRoleDto) {
    return this.adminUsersService.createCompanyRole(ctx, body);
  }

  @Patch('roles/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  updateCompanyRole(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateCompanyRoleDto,
  ) {
    return this.adminUsersService.updateCompanyRole(ctx, id, body);
  }

  @Delete('roles/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  deleteCompanyRole(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.deleteCompanyRole(ctx, id);
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  removeUserCompanyRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.adminUsersService.removeUserCompanyRole(ctx, id, roleId);
  }

  @Get('permissions')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_READ, TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  listPermissions(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listPermissions(ctx);
  }

  @Get('branches')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_READ, TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  listBranches(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listBranches(ctx);
  }
}
