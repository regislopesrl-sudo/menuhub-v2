import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromApiV2() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFromApiV2();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/menuhub_local?schema=public';
}
const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
});

const COMPANY_ID = 'company-demo';
const COMPANY_NAME = 'MenuHub Demo';
const BRANCH_ID = 'branch-demo';
const BRANCH_NAME = 'Loja Demo';
const ADMIN_EMAIL = 'admin@menuhub.local';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'Admin MenuHub';
const MEMBERSHIP_ROLE = 'owner';
const PLANS = [
  { key: 'basic', name: 'Basic', description: 'Plano local basico para bootstrap MenuHub V2' },
  { key: 'pro', name: 'Pro', description: 'Plano local pro para bootstrap MenuHub V2' },
];
const BASIC_MODULES = [
  'orders',
  'menu',
  'delivery',
  'pdv',
  'kds',
  'payments',
  'admin_panel',
  'stock',
  'cash',
  'procurement',
  'production',
  'financial',
  'reports',
  'logistics',
  'crm',
  'coupons',
  'promotions',
  'notifications',
  'delivery_zones',
];
const PREMIUM_PERMISSIONS = [
  ['*', 'Full tenant access wildcard'],
  ['admin.users.read', 'Ler usuarios e permissoes'],
  ['admin.users.write', 'Gerenciar usuarios e permissoes'],
  ['settings.read', 'Ler configuracoes'],
  ['settings.write', 'Gerenciar configuracoes'],
  ['billing.read', 'Ler assinatura e cobranca SaaS'],
  ['billing.manage', 'Gerenciar assinatura e cobranca SaaS'],
  ['orders.read', 'Ler pedidos'],
  ['orders.manage', 'Gerenciar pedidos'],
  ['modules.read', 'Ler modulos ativos'],
  ['modules.manage', 'Gerenciar modulos ativos'],
  ['catalog.read', 'Ler cardapio e catalogo'],
  ['catalog.manage', 'Gerenciar cardapio e catalogo'],
  ['pdv.operate', 'Operar PDV'],
  ['kds.operate', 'Operar KDS'],
  ['waiter.operate', 'Operar app garcom'],
  ['delivery.operate', 'Operar delivery'],
  ['inventory.read', 'Ler estoque'],
  ['inventory.manage', 'Gerenciar estoque'],
  ['inventory.adjust', 'Ajustar estoque'],
  ['inventory.loss', 'Registrar perdas de estoque'],
  ['inventory.count', 'Realizar inventario'],
  ['inventory.reports', 'Ler relatorios de estoque'],
  ['inventory.cost.read', 'Ler custos de estoque'],
  ['inventory.cost.manage', 'Gerenciar custos de estoque'],
  ['procurement.read', 'Ler compras legadas'],
  ['procurement.manage', 'Gerenciar compras legadas'],
  ['purchases.read', 'Ler compras premium'],
  ['purchases.manage', 'Gerenciar compras premium'],
  ['purchases.approve', 'Aprovar compras premium'],
  ['purchases.receive', 'Receber compras premium'],
  ['purchases.cancel', 'Cancelar compras premium'],
  ['purchases.quotes.read', 'Ler cotacoes de compras'],
  ['purchases.quotes.manage', 'Gerenciar cotacoes de compras'],
  ['suppliers.read', 'Ler fornecedores'],
  ['suppliers.manage', 'Gerenciar fornecedores'],
  ['recipe.read', 'Ler ficha tecnica'],
  ['recipe.manage', 'Gerenciar ficha tecnica'],
  ['recipe.cost.read', 'Ler custo da ficha tecnica'],
  ['recipe.cost.manage', 'Gerenciar custo da ficha tecnica'],
  ['production.read', 'Ler producao interna'],
  ['production.manage', 'Gerenciar producao interna'],
  ['cost.read', 'Ler custos operacionais'],
  ['finance.read', 'Ler financeiro operacional'],
  ['finance.manage', 'Gerenciar financeiro operacional'],
  ['finance.reports', 'Ler relatorios financeiros'],
  ['finance.reconcile', 'Conciliar financeiro'],
  ['accounts_payable.read', 'Ler contas a pagar'],
  ['accounts_payable.manage', 'Gerenciar contas a pagar'],
  ['accounts_receivable.read', 'Ler contas a receber'],
  ['accounts_receivable.manage', 'Gerenciar contas a receber'],
  ['cash_flow.read', 'Ler fluxo de caixa'],
  ['dre.read', 'Ler DRE'],
  ['cmv.read', 'Ler CMV'],
  ['cmv.manage', 'Gerenciar CMV'],
  ['financial_categories.manage', 'Gerenciar categorias financeiras'],
  ['cost_centers.manage', 'Gerenciar centros de custo'],
  ['reports.read', 'Ler relatorios'],
  ['reports.bi', 'Ler BI'],
  ['reports.finance', 'Ler BI financeiro'],
  ['reports.inventory', 'Ler BI de estoque'],
  ['reports.sales', 'Ler BI de vendas'],
  ['reports.waiter', 'Ler BI por garcom'],
  ['reports.operator', 'Ler BI por operador'],
  ['audit.read', 'Ler auditoria'],
  ['audit.export', 'Exportar auditoria'],
];
const COMPANY_ROLES = [
  {
    key: 'admin_full_access',
    name: 'Admin Full Access',
    description: 'Acesso completo aos modulos locais e premium.',
    permissions: PREMIUM_PERMISSIONS.map(([code]) => code),
  },
  {
    key: 'inventory_manager',
    name: 'Gestor de Estoque',
    description: 'Gerencia estoque, inventario, perdas e custos.',
    permissions: [
      'inventory.read',
      'inventory.manage',
      'inventory.adjust',
      'inventory.loss',
      'inventory.count',
      'inventory.reports',
      'inventory.cost.read',
      'inventory.cost.manage',
      'reports.inventory',
      'audit.read',
    ],
  },
  {
    key: 'purchases_manager',
    name: 'Gestor de Compras',
    description: 'Gerencia fornecedores, pedidos, cotacoes e recebimentos.',
    permissions: [
      'purchases.read',
      'purchases.manage',
      'purchases.approve',
      'purchases.receive',
      'purchases.cancel',
      'purchases.quotes.read',
      'purchases.quotes.manage',
      'suppliers.read',
      'suppliers.manage',
      'audit.read',
    ],
  },
  {
    key: 'finance_manager',
    name: 'Gestor Financeiro',
    description: 'Gerencia financeiro operacional, conciliacao e DRE.',
    permissions: [
      'finance.read',
      'finance.manage',
      'finance.reports',
      'finance.reconcile',
      'accounts_payable.read',
      'accounts_payable.manage',
      'accounts_receivable.read',
      'accounts_receivable.manage',
      'cash_flow.read',
      'dre.read',
      'cmv.read',
      'cmv.manage',
      'reports.finance',
      'audit.read',
    ],
  },
  {
    key: 'reports_manager',
    name: 'Gestor de Relatorios',
    description: 'Acompanha relatorios gerenciais, BI e auditoria.',
    permissions: [
      'reports.read',
      'reports.bi',
      'reports.finance',
      'reports.inventory',
      'reports.sales',
      'reports.waiter',
      'reports.operator',
      'audit.read',
      'audit.export',
    ],
  },
];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function ensureCompany() {
  return prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {
      name: COMPANY_NAME,
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
      slug: 'company-demo',
      status: 'ACTIVE',
      email: ADMIN_EMAIL,
    },
    create: {
      id: COMPANY_ID,
      name: COMPANY_NAME,
      legalName: COMPANY_NAME,
      tradeName: COMPANY_NAME,
      slug: 'company-demo',
      status: 'ACTIVE',
      email: ADMIN_EMAIL,
    },
  });
}

async function ensureBranch() {
  return prisma.branch.upsert({
    where: { id: BRANCH_ID },
    update: {
      companyId: COMPANY_ID,
      name: BRANCH_NAME,
      code: 'DEMO',
      isActive: true,
    },
    create: {
      id: BRANCH_ID,
      companyId: COMPANY_ID,
      name: BRANCH_NAME,
      code: 'DEMO',
      isActive: true,
    },
  });
}

async function ensurePlansAndSubscription() {
  const plans = [];
  for (const planDef of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { key: planDef.key },
      update: {
        name: planDef.name,
        isActive: true,
        description: planDef.description,
      },
      create: {
        key: planDef.key,
        name: planDef.name,
        description: planDef.description,
        isActive: true,
      },
    });
    plans.push(plan);

    for (const moduleKey of BASIC_MODULES) {
      await prisma.planModule.upsert({
        where: {
          planId_moduleKey: {
            planId: plan.id,
            moduleKey,
          },
        },
        update: {
          enabled: true,
          adminOnly: moduleKey === 'pdv' || moduleKey === 'kds' || moduleKey === 'admin_panel',
        },
        create: {
          planId: plan.id,
          moduleKey,
          enabled: true,
          adminOnly: moduleKey === 'pdv' || moduleKey === 'kds' || moduleKey === 'admin_panel',
        },
      });
    }
  }

  const basicPlan = plans.find((p) => p.key === 'basic');
  if (!basicPlan) {
    throw new Error('Plano basic nao encontrado no bootstrap local.');
  }

  const existingSubscription = await prisma.companySubscription.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: [{ startsAt: 'desc' }],
  });

  if (!existingSubscription) {
    await prisma.companySubscription.create({
      data: {
        companyId: COMPANY_ID,
        planId: basicPlan.id,
        status: 'ACTIVE',
      },
    });
  } else {
    await prisma.companySubscription.update({
      where: { id: existingSubscription.id },
      data: {
        planId: basicPlan.id,
        status: 'ACTIVE',
        endsAt: null,
      },
    });
  }

  await prisma.companySubscription.updateMany({
    where: {
      companyId: COMPANY_ID,
      id: { not: existingSubscription?.id ?? '' },
      status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
    },
    data: {
      status: 'CANCELED',
      endsAt: new Date(),
    },
  });

  for (const moduleKey of BASIC_MODULES) {
    await prisma.companyModuleOverride.upsert({
      where: {
        companyId_moduleKey: {
          companyId: COMPANY_ID,
          moduleKey,
        },
      },
      update: {
        enabled: true,
      },
      create: {
        companyId: COMPANY_ID,
        moduleKey,
        enabled: true,
      },
    });
  }
}

async function ensurePermissionCatalog() {
  for (const [code, description] of PREMIUM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });

    await prisma.companyPermission.upsert({
      where: { key: code },
      update: { description },
      create: { key: code, description },
    });
  }
}

async function ensureCompanyRoles(user) {
  const companyPermissions = await prisma.companyPermission.findMany({
    where: {
      key: {
        in: PREMIUM_PERMISSIONS.map(([code]) => code),
      },
    },
    select: {
      id: true,
      key: true,
    },
  });
  const permissionByKey = new Map(companyPermissions.map((permission) => [permission.key, permission]));

  let adminFullAccessRole = null;
  for (const roleDef of COMPANY_ROLES) {
    const role = await prisma.companyRole.upsert({
      where: {
        companyId_key: {
          companyId: COMPANY_ID,
          key: roleDef.key,
        },
      },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
        updatedBy: 'seed-local',
      },
      create: {
        companyId: COMPANY_ID,
        key: roleDef.key,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
        createdBy: 'seed-local',
        updatedBy: 'seed-local',
      },
    });

    const rolePermissions = roleDef.permissions
      .map((permissionKey) => permissionByKey.get(permissionKey))
      .filter(Boolean)
      .map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      }));

    if (rolePermissions.length > 0) {
      await prisma.companyRolePermission.createMany({
        data: rolePermissions,
        skipDuplicates: true,
      });
    }

    if (roleDef.key === 'admin_full_access') {
      adminFullAccessRole = role;
    }
  }

  if (adminFullAccessRole) {
    await prisma.companyUserRole.upsert({
      where: {
        companyId_userId_roleId: {
          companyId: COMPANY_ID,
          userId: user.id,
          roleId: adminFullAccessRole.id,
        },
      },
      update: {
        createdBy: 'seed-local',
      },
      create: {
        companyId: COMPANY_ID,
        userId: user.id,
        roleId: adminFullAccessRole.id,
        createdBy: 'seed-local',
      },
    });
  }
}

async function ensureAdminUser() {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userCompanyMembership.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: COMPANY_ID,
      },
    },
    update: {
      roleKey: MEMBERSHIP_ROLE,
      isActive: true,
      acceptedAt: new Date(),
    },
    create: {
      userId: user.id,
      companyId: COMPANY_ID,
      roleKey: MEMBERSHIP_ROLE,
      isActive: true,
      acceptedAt: new Date(),
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: user.id,
        branchId: BRANCH_ID,
      },
    },
    update: {
      isDefault: true,
    },
    create: {
      userId: user.id,
      branchId: BRANCH_ID,
      isDefault: true,
    },
  });

  await prisma.userBranchAccess.updateMany({
    where: {
      userId: user.id,
      branchId: { not: BRANCH_ID },
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  });

  return user;
}

async function main() {
  await ensureCompany();
  await ensureBranch();
  await ensurePlansAndSubscription();
  await ensurePermissionCatalog();
  const user = await ensureAdminUser();
  await ensureCompanyRoles(user);

  console.log('Seed local concluido com sucesso.');
  console.log(`companyId=${COMPANY_ID}`);
  console.log(`branchId=${BRANCH_ID}`);
  console.log(`adminEmail=${ADMIN_EMAIL}`);
  console.log(`adminUserId=${user.id}`);
}

main()
  .catch((error) => {
    console.error('Falha no seed local:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
