import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, scryptSync } from 'crypto';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import { CompanyRbacService } from './company-rbac.service';
import type {
  CreateCompanyRoleDto,
  AssignAdminUserBranchesDto,
  AssignAdminUserRolesDto,
  CreateAdminUserDto,
  UpdateCompanyRoleDto,
  UpdateAdminUserDto,
} from './dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyRbacService: CompanyRbacService,
  ) {}

  async listUsers(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        branchAccesses: {
          some: {
            branch: {
              companyId: ctx.companyId,
            },
            ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      include: this.userInclude(),
    });

    return {
      items: users.map((user) => this.mapUser(user)),
      total: users.length,
    };
  }

  async getUser(userId: string, ctx: RequestContext) {
    this.assertAdminRole(ctx);
    const user = await this.findCompanyUserOrThrow(userId, ctx);
    return this.mapUser(user);
  }

  async createUser(ctx: RequestContext, input: CreateAdminUserDto) {
    this.assertAdminRole(ctx);

    const name = this.requireTrimmed(input.name, 'Nome do usuario');
    const password = this.requireStrongEnoughPassword(input.password);
    const email = this.normalizeOptionalString(input.email);
    const phone = this.normalizeOptionalString(input.phone);

    if (email && !this.isValidEmail(email)) {
      throw new BadRequestException('Email do usuario invalido.');
    }

    if (email) {
      const existing = await this.prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('Ja existe um usuario ativo com este email.');
      }
    }

    const branches = await this.resolveBranchesForCompany(
      ctx.companyId,
      input.branchIds,
      input.defaultBranchId ?? ctx.branchId ?? null,
    );
    const roleAssignment = await this.companyRbacService.resolveRoleAssignment(ctx, input.roleIds ?? []);
    const passwordHash = this.hashPassword(password);

    const created = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
        roles: roleAssignment.globalRoleIds.length
          ? {
              createMany: {
                data: roleAssignment.globalRoleIds.map((roleId) => ({ roleId })),
              },
            }
          : undefined,
        companyUserRoles: roleAssignment.companyRoleIds.length
          ? {
              createMany: {
                data: roleAssignment.companyRoleIds.map((roleId) => ({
                  companyId: ctx.companyId,
                  roleId,
                  createdBy: ctx.requestId,
                })),
              },
            }
          : undefined,
        branchAccesses: {
          createMany: {
            data: branches.map((branch) => ({
              branchId: branch.id,
              isDefault: branch.id === branches.defaultBranchId,
            })),
          },
        },
      },
      include: this.userInclude(),
    });

    return this.mapUser(created);
  }

  async updateUser(userId: string, ctx: RequestContext, input: UpdateAdminUserDto) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);

    const email = this.normalizeOptionalString(input.email);
    if (email && !this.isValidEmail(email)) {
      throw new BadRequestException('Email do usuario invalido.');
    }
    if (email) {
      const duplicate = await this.prisma.user.findFirst({
        where: {
          email,
          deletedAt: null,
          id: { not: userId },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException('Ja existe outro usuario ativo com este email.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: this.requireTrimmed(input.name, 'Nome do usuario') } : {}),
        ...(input.email !== undefined ? { email } : {}),
        ...(input.phone !== undefined ? { phone: this.normalizeOptionalString(input.phone) } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
        ...(input.password !== undefined
          ? { passwordHash: this.hashPassword(this.requireStrongEnoughPassword(input.password)) }
          : {}),
      },
      include: this.userInclude(),
    });

    return this.mapUser(updated);
  }

  async updateUserStatus(userId: string, ctx: RequestContext, isActive: boolean) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: Boolean(isActive) },
      include: this.userInclude(),
    });
    return this.mapUser(updated);
  }

  async assignRoles(userId: string, ctx: RequestContext, input: AssignAdminUserRolesDto) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);
    const roleAssignment = await this.companyRbacService.resolveRoleAssignment(ctx, input.roleIds ?? []);
    await this.companyRbacService.replaceUserRoles(ctx, userId, roleAssignment);

    return this.getUser(userId, ctx);
  }

  async assignBranches(userId: string, ctx: RequestContext, input: AssignAdminUserBranchesDto) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);

    const branches = await this.resolveBranchesForCompany(
      ctx.companyId,
      input.branchIds,
      input.defaultBranchId ?? ctx.branchId ?? null,
    );

    await this.prisma.$transaction([
      this.prisma.userBranchAccess.deleteMany({ where: { userId } }),
      this.prisma.userBranchAccess.createMany({
        data: branches.map((branch) => ({
          userId,
          branchId: branch.id,
          isDefault: branch.id === branches.defaultBranchId,
        })),
      }),
    ]);

    return this.getUser(userId, ctx);
  }

  async deleteUser(userId: string, ctx: RequestContext) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        email: null,
        phone: null,
        lastLoginAt: null,
      },
    });

    return {
      success: true,
      userId,
    };
  }

  async listRoles(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    const roles = await this.companyRbacService.listRoles(ctx);

    return {
      items: roles.map((role) => ({
        id: role.id,
        key: role.key,
        code: role.key,
        name: role.name,
        description: role.description ?? '',
        isSystem: role.isSystem,
        source: role.source,
        companyId: role.companyId,
        permissions: role.permissions.map((entry) => ({
          id: entry.id,
          key: entry.key,
          code: entry.key,
          description: entry.description ?? '',
        })),
      })),
      total: roles.length,
    };
  }

  async listPermissions(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    const permissions = await this.companyRbacService.listPermissions(ctx);
    return {
      items: permissions.map((permission) => ({
        id: permission.id,
        key: permission.key,
        code: permission.key,
        description: permission.description ?? '',
      })),
      total: permissions.length,
    };
  }

  async listBranches(ctx: RequestContext) {
    this.assertAdminRole(ctx);
    const branches = await this.prisma.branch.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        companyId: true,
        name: true,
        code: true,
        isActive: true,
      },
    });

    return {
      items: branches.map((branch) => ({
        id: branch.id,
        companyId: branch.companyId,
        name: branch.name,
        code: branch.code ?? '',
        isActive: branch.isActive,
      })),
      total: branches.length,
    };
  }

  async createCompanyRole(ctx: RequestContext, body: CreateCompanyRoleDto) {
    this.assertAdminRole(ctx);
    return this.companyRbacService.createRole(ctx, body);
  }

  async updateCompanyRole(ctx: RequestContext, roleId: string, body: UpdateCompanyRoleDto) {
    this.assertAdminRole(ctx);
    return this.companyRbacService.updateRole(ctx, roleId, body);
  }

  async deleteCompanyRole(ctx: RequestContext, roleId: string) {
    this.assertAdminRole(ctx);
    return this.companyRbacService.deleteRole(ctx, roleId);
  }

  async removeUserCompanyRole(ctx: RequestContext, userId: string, roleId: string) {
    this.assertAdminRole(ctx);
    await this.findCompanyUserOrThrow(userId, ctx);
    await this.companyRbacService.removeRoleFromUser(ctx, userId, roleId);
    return this.getUser(userId, ctx);
  }

  private async findCompanyUserOrThrow(userId: string, ctx: RequestContext) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        branchAccesses: {
          some: {
            branch: {
              companyId: ctx.companyId,
            },
          },
        },
      },
      include: this.userInclude(),
    });

    if (!user) {
      throw new NotFoundException(`Usuario '${userId}' nao encontrado para a empresa atual.`);
    }

    return user;
  }

  private userInclude() {
    return {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
      companyUserRoles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' as const }],
      },
      branchAccesses: {
        include: {
          branch: true,
        },
        orderBy: [
          { isDefault: 'desc' as const },
          { createdAt: 'asc' as const },
        ],
      },
    };
  }

  private mapUser(user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      role: {
        id: string;
        name: string;
        description: string | null;
        permissions: Array<{
          permission: {
            id: string;
            code: string;
            description: string | null;
          };
        }>;
      };
    }>;
    companyUserRoles: Array<{
      role: {
        id: string;
        key: string;
        name: string;
        description: string | null;
        permissions: Array<{
          permission: {
            id: string;
            key: string;
            description: string | null;
          };
        }>;
      };
    }>;
    branchAccesses: Array<{
      branchId: string;
      isDefault: boolean;
      branch: {
        id: string;
        companyId: string;
        name: string;
        code: string | null;
      };
    }>;
  }) {
    const permissionsMap = new Map<string, { id: string; code: string; description: string }>();
    for (const roleEntry of user.roles) {
      for (const permissionEntry of roleEntry.role.permissions) {
        permissionsMap.set(permissionEntry.permission.id, {
          id: permissionEntry.permission.id,
          code: permissionEntry.permission.code,
          description: permissionEntry.permission.description ?? '',
        });
      }
    }
    for (const roleEntry of user.companyUserRoles ?? []) {
      for (const permissionEntry of roleEntry.role.permissions) {
        permissionsMap.set(permissionEntry.permission.id, {
          id: permissionEntry.permission.id,
          code: permissionEntry.permission.key,
          description: permissionEntry.permission.description ?? '',
        });
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email ?? '',
      phone: user.phone ?? '',
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: [
        ...user.roles.map((entry) => ({
          id: entry.role.id,
          key: entry.role.name.toLowerCase().replace(/\s+/g, '_'),
          name: entry.role.name,
          description: entry.role.description ?? '',
          source: 'global' as const,
        })),
        ...(user.companyUserRoles ?? []).map((entry) => ({
          id: entry.role.id,
          key: entry.role.key,
          name: entry.role.name,
          description: entry.role.description ?? '',
          source: 'company' as const,
        })),
      ],
      permissions: Array.from(permissionsMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
      branches: user.branchAccesses.map((entry) => ({
        id: entry.branch.id,
        companyId: entry.branch.companyId,
        name: entry.branch.name,
        code: entry.branch.code ?? '',
        isDefault: entry.isDefault,
      })),
      defaultBranchId: user.branchAccesses.find((entry) => entry.isDefault)?.branchId ?? null,
    };
  }

  private async resolveBranchesForCompany(
    companyId: string,
    branchIds: string[] | undefined,
    preferredDefaultBranchId: string | null,
  ) {
    const normalizedIds = this.normalizeIdList(branchIds ?? []);
    const fallbackBranchIds =
      normalizedIds.length > 0
        ? normalizedIds
        : preferredDefaultBranchId
          ? [preferredDefaultBranchId]
          : [];

    if (fallbackBranchIds.length === 0) {
      const firstBranch = await this.prisma.branch.findFirst({
        where: { companyId },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true },
      });
      if (!firstBranch) {
        throw new BadRequestException(`Nenhuma filial encontrada para company '${companyId}'.`);
      }
      fallbackBranchIds.push(firstBranch.id);
    }

    const branches = await this.prisma.branch.findMany({
      where: {
        companyId,
        id: {
          in: fallbackBranchIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (branches.length !== fallbackBranchIds.length) {
      throw new BadRequestException('Uma ou mais filiais informadas nao pertencem a empresa atual.');
    }

    const defaultBranchId =
      preferredDefaultBranchId && fallbackBranchIds.includes(preferredDefaultBranchId)
        ? preferredDefaultBranchId
        : branches[0]?.id ?? null;

    return Object.assign(branches, { defaultBranchId });
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

  private assertAdminRole(ctx: RequestContext) {
    if (ctx.userRole !== 'admin' && ctx.userRole !== 'master' && ctx.userRole !== 'developer') {
      throw new ForbiddenException('Gestao de usuarios exige perfil admin/master/developer.');
    }
  }

  private requireTrimmed(value: string, label: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException(`${label} e obrigatorio.`);
    }
    return normalized;
  }

  private requireStrongEnoughPassword(value: string) {
    const normalized = String(value ?? '');
    if (normalized.trim().length < 6) {
      throw new BadRequestException('Senha deve ter ao menos 6 caracteres.');
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
  }
}
