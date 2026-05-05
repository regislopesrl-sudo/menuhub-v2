import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../common/current-context.decorator';
import type { RequestContext } from '../common/request-context';
import { AdminUsersService } from './admin-users.service';
import { RequireAdminGuard } from '../common/require-admin.guard';
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
  listUsers(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listUsers(ctx);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.getUser(id, ctx);
  }

  @Post('users')
  createUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    return this.adminUsersService.createUser(ctx, body);
  }

  @Post('users/invite')
  inviteUser(@CurrentContext() ctx: RequestContext, @Body() body: CreateAdminUserDto) {
    return this.adminUsersService.createUser(ctx, body);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserDto,
  ) {
    return this.adminUsersService.updateUser(id, ctx, body);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateAdminUserStatusDto,
  ) {
    return this.adminUsersService.updateUserStatus(id, ctx, body.isActive);
  }

  @Patch('users/:id/role')
  updateUserPrimaryRole(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: { roleId?: string; roleIds?: string[] },
  ) {
    const roleIds = body.roleIds?.length ? body.roleIds : body.roleId ? [body.roleId] : [];
    return this.adminUsersService.assignRoles(id, ctx, { roleIds });
  }

  @Put('users/:id/roles')
  assignRoles(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserRolesDto,
  ) {
    return this.adminUsersService.assignRoles(id, ctx, body);
  }

  @Put('users/:id/branches')
  assignBranches(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: AssignAdminUserBranchesDto,
  ) {
    return this.adminUsersService.assignBranches(id, ctx, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.deleteUser(id, ctx);
  }

  @Get('roles')
  listRoles(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listRoles(ctx);
  }

  @Post('roles')
  createCompanyRole(@CurrentContext() ctx: RequestContext, @Body() body: CreateCompanyRoleDto) {
    return this.adminUsersService.createCompanyRole(ctx, body);
  }

  @Patch('roles/:id')
  updateCompanyRole(
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
    @Body() body: UpdateCompanyRoleDto,
  ) {
    return this.adminUsersService.updateCompanyRole(ctx, id, body);
  }

  @Delete('roles/:id')
  deleteCompanyRole(@Param('id') id: string, @CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.deleteCompanyRole(ctx, id);
  }

  @Delete('users/:id/roles/:roleId')
  removeUserCompanyRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.adminUsersService.removeUserCompanyRole(ctx, id, roleId);
  }

  @Get('permissions')
  listPermissions(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listPermissions(ctx);
  }

  @Get('branches')
  listBranches(@CurrentContext() ctx: RequestContext) {
    return this.adminUsersService.listBranches(ctx);
  }
}
