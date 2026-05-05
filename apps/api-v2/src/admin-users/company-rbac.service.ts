import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RequestContext } from '../common/request-context';
import { CompanyRbacRepository } from './company-rbac.repository';
import type { CreateCompanyRoleDto, UpdateCompanyRoleDto } from './dto/admin-users.dto';

@Injectable()
export class CompanyRbacService {
  constructor(private readonly repository: CompanyRbacRepository) {}

  async listRoles(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    await this.repository.syncPermissionCatalogFromGlobalPermissions();
    const [globalRoles, companyRoles] = await Promise.all([
      this.repository.listGlobalRoles(),
      this.repository.listCompanyRoles(ctx.companyId),
    ]);

    return [
      ...globalRoles.map((role) => ({
        id: role.id,
        key: role.name.toLowerCase().replace(/\s+/g, '_'),
        name: role.name,
        description: role.description ?? '',
        isSystem: true,
        source: 'global' as const,
        companyId: null,
        permissions: role.permissions.map((entry) => ({
          id: entry.permission.id,
          key: entry.permission.code,
          description: entry.permission.description ?? '',
        })),
      })),
      ...companyRoles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description ?? '',
        isSystem: role.isSystem,
        source: 'company' as const,
        companyId: role.companyId,
        permissions: role.permissions.map((entry) => ({
          id: entry.permission.id,
          key: entry.permission.key,
          description: entry.permission.description ?? '',
        })),
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  async listPermissions(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    await this.repository.syncPermissionCatalogFromGlobalPermissions();
    const permissions = await this.repository.listCompanyPermissions();
    return permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      description: permission.description ?? '',
    }));
  }

  async createRole(ctx: RequestContext, input: CreateCompanyRoleDto) {
    this.assertAdminRole(ctx);
    await this.repository.syncPermissionCatalogFromGlobalPermissions();

    const key = this.normalizeKey(input.key);
    const name = this.requireTrimmed(input.name, 'Nome da role');
    const permissionIds = this.normalizeIdList(input.permissionIds ?? []);
    await this.ensurePermissionsExist(permissionIds);

    const existing = await this.repository.listCompanyRoles(ctx.companyId);
    if (existing.some((role) => role.key === key)) {
      throw new BadRequestException(`Ja existe uma role custom com a chave '${key}' nesta empresa.`);
    }

    const role = await this.repository.createCompanyRole({
      companyId: ctx.companyId,
      key,
      name,
      description: this.normalizeOptionalString(input.description),
      permissionIds,
      createdBy: ctx.requestId,
    });

    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      isSystem: role.isSystem,
      source: 'company' as const,
      companyId: role.companyId,
      permissions: role.permissions.map((entry) => ({
        id: entry.permission.id,
        key: entry.permission.key,
        description: entry.permission.description ?? '',
      })),
    };
  }

  async updateRole(ctx: RequestContext, roleId: string, input: UpdateCompanyRoleDto) {
    this.assertAdminRole(ctx);
    await this.repository.syncPermissionCatalogFromGlobalPermissions();
    const existing = await this.repository.findCompanyRoleById(ctx.companyId, roleId);
    if (!existing) {
      throw new NotFoundException(`Role custom '${roleId}' nao encontrada para a empresa atual.`);
    }
    if (existing.isSystem) {
      throw new ForbiddenException('Nao e permitido editar uma role system.');
    }

    const permissionIds = input.permissionIds ? this.normalizeIdList(input.permissionIds) : undefined;
    if (permissionIds) {
      await this.ensurePermissionsExist(permissionIds);
    }

    const updated = await this.repository.updateCompanyRole({
      companyId: ctx.companyId,
      roleId,
      name: input.name !== undefined ? this.requireTrimmed(input.name, 'Nome da role') : undefined,
      description: input.description !== undefined ? this.normalizeOptionalString(input.description) : undefined,
      permissionIds,
      updatedBy: ctx.requestId,
    });

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description ?? '',
      isSystem: updated.isSystem,
      source: 'company' as const,
      companyId: updated.companyId,
      permissions: updated.permissions.map((entry) => ({
        id: entry.permission.id,
        key: entry.permission.key,
        description: entry.permission.description ?? '',
      })),
    };
  }

  async deleteRole(ctx: RequestContext, roleId: string) {
    this.assertAdminRole(ctx);
    const existing = await this.repository.findCompanyRoleById(ctx.companyId, roleId);
    if (!existing) {
      throw new NotFoundException(`Role custom '${roleId}' nao encontrada para a empresa atual.`);
    }
    if (existing.isSystem) {
      throw new ForbiddenException('Nao e permitido remover uma role system.');
    }

    await this.repository.deleteCompanyRole(roleId);
    return {
      success: true,
      roleId,
    };
  }

  async resolveRoleAssignment(ctx: RequestContext, roleIds: string[]) {
    this.assertAdminRole(ctx);
    const normalizedIds = this.normalizeIdList(roleIds);
    if (normalizedIds.length === 0) {
      return {
        globalRoleIds: [] as string[],
        companyRoleIds: [] as string[],
      };
    }

    const [globalRoles, companyRoles] = await Promise.all([
      this.repository.findGlobalRolesByIds(normalizedIds),
      this.repository.findCompanyRolesByIds(ctx.companyId, normalizedIds),
    ]);

    const globalRoleIds = globalRoles.map((role) => role.id);
    const companyRoleIds = companyRoles.map((role) => role.id);
    const resolvedIds = new Set([...globalRoleIds, ...companyRoleIds]);
    if (resolvedIds.size !== normalizedIds.length) {
      throw new BadRequestException('Uma ou mais roles nao existem ou pertencem a outra empresa.');
    }

    return { globalRoleIds, companyRoleIds };
  }

  async removeRoleFromUser(ctx: RequestContext, userId: string, roleId: string) {
    this.assertAdminRole(ctx);
    const companyRole = await this.repository.findCompanyRoleById(ctx.companyId, roleId);
    if (!companyRole) {
      throw new NotFoundException(`Role custom '${roleId}' nao encontrada para a empresa atual.`);
    }
    await this.repository.removeCompanyUserRole({
      companyId: ctx.companyId,
      userId,
      roleId,
    });
    return {
      success: true,
      userId,
      roleId,
    };
  }

  async replaceUserRoles(
    ctx: RequestContext,
    userId: string,
    assignment: { globalRoleIds: string[]; companyRoleIds: string[] },
  ) {
    this.assertAdminRole(ctx);
    await this.repository.replaceUserRoles({
      userId,
      companyId: ctx.companyId,
      globalRoleIds: assignment.globalRoleIds,
      companyRoleIds: assignment.companyRoleIds,
      createdBy: ctx.requestId,
    });
  }

  async getEffectivePermissionsForUser(companyId: string, userId: string) {
    const access = await this.repository.getUserEffectiveAccess({ companyId, userId });
    if (!access) {
      return {
        globalRoles: [],
        companyRoles: [],
        permissions: [],
      };
    }

    const permissionMap = new Map<string, { id: string; key: string; description: string }>();
    const globalRoles = access.roles.map((entry) => ({
      id: entry.role.id,
      name: entry.role.name,
      source: 'global' as const,
    }));
    const companyRoles = access.companyUserRoles.map((entry) => ({
      id: entry.role.id,
      key: entry.role.key,
      name: entry.role.name,
      source: 'company' as const,
    }));

    for (const roleEntry of access.roles) {
      for (const permissionEntry of roleEntry.role.permissions) {
        permissionMap.set(permissionEntry.permission.code, {
          id: permissionEntry.permission.id,
          key: permissionEntry.permission.code,
          description: permissionEntry.permission.description ?? '',
        });
      }
    }

    for (const roleEntry of access.companyUserRoles) {
      for (const permissionEntry of roleEntry.role.permissions) {
        permissionMap.set(permissionEntry.permission.key, {
          id: permissionEntry.permission.id,
          key: permissionEntry.permission.key,
          description: permissionEntry.permission.description ?? '',
        });
      }
    }

    return {
      globalRoles,
      companyRoles,
      permissions: Array.from(permissionMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  async assertUserHasPermission(companyId: string, userId: string, permissionKey: string) {
    const effective = await this.getEffectivePermissionsForUser(companyId, userId);
    const hasPermission = effective.permissions.some((permission) => permission.key === permissionKey);
    if (!hasPermission) {
      throw new ForbiddenException(`Permissao '${permissionKey}' ausente para o usuario.`);
    }
    return true;
  }

  private async ensurePermissionsExist(permissionIds: string[]) {
    if (permissionIds.length === 0) return;
    const permissions = await this.repository.findCompanyPermissionsByIds(permissionIds);
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('Uma ou mais permissoes informadas nao existem.');
    }
  }

  private assertAdminRole(ctx: RequestContext) {
    if (ctx.userRole !== 'admin' && ctx.userRole !== 'master' && ctx.userRole !== 'developer') {
      throw new ForbiddenException('RBAC custom exige perfil admin/master/developer.');
    }
  }

  private normalizeIdList(input: string[]) {
    return Array.from(
      new Set(
        input
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      ),
    );
  }

  private requireTrimmed(value: string, label: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException(`${label} e obrigatorio.`);
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeKey(value: string) {
    const normalized = this.requireTrimmed(value, 'Chave da role')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalized) {
      throw new BadRequestException('Chave da role invalida.');
    }
    return normalized;
  }
}
