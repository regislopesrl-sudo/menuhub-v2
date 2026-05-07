import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { AdminUsersService } from './admin-users.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { TENANT_PERMISSIONS } from '../common/rbac';
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
  createUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    return this.adminUsersService.createUser(ctx, body);
  }

  @Post('users/invite')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  inviteUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    return this.adminUsersService.createUser(ctx, body);
  }

  @Patch('users/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  updateUser(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserDto,
  ) {
    return this.adminUsersService.updateUser(id, ctx, body);
  }

  @Patch('users/:id/status')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  updateUserStatus(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserStatusDto,
  ) {
    return this.adminUsersService.updateUserStatus(id, ctx, body.isActive);
  }

  @Patch('users/:id/role')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  updateUserPrimaryRole(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { roleId?: string; roleIds?: string[] },
  ) {
    const roleIds = body.roleIds?.length ? body.roleIds : body.roleId ? [body.roleId] : [];
    return this.adminUsersService.assignRoles(id, ctx, { roleIds });
  }

  @Put('users/:id/roles')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  assignRoles(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserRolesDto,
  ) {
    return this.adminUsersService.assignRoles(id, ctx, body);
  }

  @Put('users/:id/branches')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  assignBranches(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserBranchesDto,
  ) {
    return this.adminUsersService.assignBranches(id, ctx, body);
  }

  @Delete('users/:id')
  @RequirePermissions(TENANT_PERMISSIONS.ADMIN_USERS_WRITE)
  deleteUser(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.deleteUser(id, ctx);
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
